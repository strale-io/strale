# Strale Code Review — Session A: Audit subsystem

## 1. Architecture summary

The audit subsystem is a cross-cutting trust/compliance layer built on top of the `transactions` table. It has five components:

1. **Audit payload assembly** — `do.ts:buildFullAudit` / `buildFailureAudit` and `solution-execute.ts:buildInlineAudit` compose a rich JSON `audit_trail` object for every executed capability or solution. The x402 gateway builds a slimmer `audit_trail` inline in `recordX402Transaction`.
2. **HMAC token** — `lib/audit-token.ts` produces and verifies a per-transaction HMAC-SHA256(transactionId) token. Used to gate public access to `GET /v1/audit/:transactionId`.
3. **Integrity hash chain** — `lib/integrity-hash.ts` (compute + `getPreviousHash`) + `jobs/integrity-hash-retry.ts` (retry worker). Every transaction lands with `compliance_hash_state='pending'` (migration 0047); the worker wakes every 30s, computes SHA-256 over row contents + previousHash, and flips state to `'complete'`. `/v1/audit/:id` refuses to serve `pending` or `failed` rows.
4. **Audit endpoints** — `routes/audit.ts` (token-gated, composes runtime + static compliance profile), `routes/transactions.ts` (auth-gated or free-tier-public single-row lookup, plus `/verify` inline walk), `routes/verify.ts` (public, rate-limited chain walk with broken-link detection).
5. **Retention + PII scrub** — `lib/data-retention.ts` purges transactions older than 3 years (`legal_hold=false`); `audit-helpers.ts:detectPersonalData` tags outputs heuristically; F-0-013 removed email/IP from operational logs.

```
┌───────────────────────────────────────────────────────────────┐
│  POST /v1/do  POST /v1/solutions/:slug/execute  /x402/:slug   │
│           │              │                 │                  │
│           ▼              ▼                 ▼                  │
│  buildFullAudit /  buildInlineAudit /  recordX402Transaction  │
│  buildFailureAudit                                            │
│           └──────────────┴─────────────────┘                  │
│                          │                                    │
│                          ▼                                    │
│     INSERT transactions (audit_trail, compliance_hash_state   │
│                          ='pending' by default)               │
└───────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────────────────────┐
│  integrity-hash-retry (every 30s, xact-advisory-locked)       │
│    SELECT pending WHERE created < NOW() - 10s LIMIT 50        │
│    for each: getPreviousHash() → computeIntegrityHash()       │
│    UPDATE integrity_hash, previous_hash, state='complete'     │
│  Rows pending > 15 min → state='failed'                       │
└───────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────────────────────┐
│  GET /v1/audit/:id?token=… (HMAC-gated, composed profile)     │
│  GET /v1/transactions/:id (auth OR isFreeTier; raw row)       │
│  GET /v1/transactions/:id/verify (short inline chain walk)    │
│  GET /v1/verify/:id (public, rate-limited, deep chain walk)   │
└───────────────────────────────────────────────────────────────┘
```

The subsystem touches 7 files and ~1,067 LOC directly: `routes/audit.ts` (268), `routes/verify.ts` (199), `routes/transactions.ts` (239), `jobs/integrity-hash-retry.ts` (175), `lib/integrity-hash.ts` (93), `lib/audit-helpers.ts` (45), `lib/audit-token.ts` (48). Additional audit-trail assembly sites live in `routes/do.ts` (5 call sites), `routes/solution-execute.ts` (~4 call sites), `routes/x402-gateway-v2.ts` (1 call site).

## 2. Assumptions made

- I assumed the `transactions.integrity_hash_status` column (owned by the untracked external workflow per SCF-3) does not interact with `compliance_hash_state`. Schema inspection + worker code confirm this, but I didn't verify the external workflow's behaviour end-to-end.
- I assumed `db.transaction(async (tx) => …)` in `integrity-hash-retry.ts` uses Postgres default isolation (READ COMMITTED). If it's been overridden to SERIALIZABLE elsewhere, some findings below (F-A-002) behave differently. Spot-checked `getDb()` config — no isolation override observed, so READ COMMITTED holds.
- I assumed the Hono context `c.res.status` reliably reflects the response status inside the `request-complete` middleware emission. Not directly testing as part of this audit.
- The `getShareableUrl` output uses `strale.dev` as host — assumed this matches the production frontend host. Not verified against Railway env.
- Did not load-test the chain walk against a real production-sized transactions table. Performance findings below use reading-based reasoning, not measurement.

## 3. Findings

### F-A-001: `DELETE /v1/transactions/:id` endpoint claimed in audit trail but does not exist

- **Category**: Bug, Safety (compliance)
- **Severity**: Medium
- **Confidence**: High
- **Location**: [apps/api/src/routes/do.ts:2175-2188](apps/api/src/routes/do.ts#L2175-L2188), [apps/api/src/routes/transactions.ts](apps/api/src/routes/transactions.ts) (absence confirmed via grep)
- **What's wrong**: `buildFullAudit` emits `compliance.deletion_endpoint: "DELETE /v1/transactions/${transactionId}"` and `regulations_addressed.gdpr.article_17: "Transaction data deletable via DELETE /v1/transactions/${transactionId}"`. `transactions.ts` only defines `GET /`, `GET /:id`, and `GET /:id/verify`. There is no DELETE handler. Every audit record produced by a capability run advertises a non-existent endpoint as GDPR Article 17 compliance.
- **Why it matters**: The audit trail is the product's primary compliance artefact. Advertising an endpoint that doesn't exist isn't just a doc error — it's a substantive false regulatory claim. A data-subject request made in good faith would hit 404. Auditors and regulators reading these payloads would flag this immediately.
- **Reproduction / evidence**: `curl -X DELETE https://strale-production.up.railway.app/v1/transactions/<any-id>` → 404. Search `transactionsRoute.` in `routes/transactions.ts` — only `.get()` handlers exist.
- **Suggested direction**: Either implement the endpoint (scope: auth-gate, soft-delete with legal_hold exemption, cascade to transaction_quality) or remove the claim from the audit payload and update the Article 17 mapping accordingly. Implementation is the better path — GDPR Art. 17 is a substantive commitment.
- **Related findings**: F-A-003, F-A-004 (other inaccuracies in the same compliance block).

### F-A-002: Integrity-hash batch creates chain branches — multiple rows share the same `previousHash`

- **Category**: Bug, Safety (compliance)
- **Severity**: High
- **Confidence**: High
- **Location**: [apps/api/src/jobs/integrity-hash-retry.ts:89-124](apps/api/src/jobs/integrity-hash-retry.ts#L89-L124), [apps/api/src/lib/integrity-hash.ts:68-81](apps/api/src/lib/integrity-hash.ts#L68-L81)
- **What's wrong**: `runOnce()` iterates pending rows inside a `db.transaction(async (tx) => …)`. For each row it calls `getPreviousHash()`, which uses `getDb()` — a pooled connection — not the outer `tx`. At Postgres default isolation (READ COMMITTED), the pooled connection cannot see uncommitted writes from the in-flight batch. So every row in the batch reads the SAME latest-completed `integrity_hash` as its `previousHash`. After commit, N rows all point to the same predecessor — the chain is no longer linear; it's a star.
- **Why it matters**: The chain's tamper-evidence guarantee rests on linearity — modifying row R invalidates its successor's `previousHash` check, then that row's successor, and so on. Branching means altering a single row breaks only its direct successors' verification, not a cascade. The comment in `integrity-hash.ts:8` says "Chain is per-day (not globally sequential)"; intent is still linear per day. But within a batch (up to 50 rows every 30s), all rows lose linearity. The `/verify` endpoint reports the chain as healthy — it walks `previousHash` backward from one row at a time and doesn't notice that two different rows can share a predecessor. Silent correctness failure.
- **Reproduction / evidence**: Trigger 3+ transactions within a 30s window, wait for the retry worker to process them in one batch, then SELECT id, previous_hash FROM transactions WHERE created_at > now() - interval '1 minute' — multiple rows will share the same previous_hash. Alternatively, instrument the worker to log previousHash per row in a batch.
- **Suggested direction**: Inside the loop, either (a) pass `tx` through to `getPreviousHash(tx)` so it reads batch-visible state, or (b) thread the chain manually: capture the first row's previousHash from `getPreviousHash()`, then each subsequent row uses the prior row's just-computed hash. Option (b) is simpler and avoids re-querying once per iteration. Either way, linearity is restored.
- **Related findings**: F-A-008 (same file, related ordering concern).

### F-A-003: `detectPersonalData` only checks output, never input — compliance claim is systematically wrong for input-PII capabilities

- **Category**: Bug, Safety (compliance)
- **Severity**: Medium
- **Confidence**: High
- **Location**: [apps/api/src/routes/do.ts:2143](apps/api/src/routes/do.ts#L2143), [apps/api/src/lib/audit-helpers.ts:40-45](apps/api/src/lib/audit-helpers.ts#L40-L45)
- **What's wrong**: `buildFullAudit` computes `personalDataDetected = detectPersonalData(output)`. The helper checks output field names against a keyword list. Capabilities whose INPUT contains PII (pep-check with a person's name, email-validate with an email, sanctions-check with an individual, adverse-media-check, company-data lookups with beneficial-owner names, etc.) emit `personal_data_processed: false` when the output is a true/false verdict or a data structure with no PII keywords — even though the input was explicitly personal data. The `compliance.notes` field then says "No personal data detected. No DPIA required." which is factually wrong for multiple active capabilities.
- **Why it matters**: DPIA requirement under GDPR Art. 35 is triggered by processing personal data at any stage, not just storing it in output. Advertising `personal_data_processed: false` on a pep-check audit that looked up a specific individual is a regulatory misrepresentation. Even if the DPIA assessment ultimately concludes "no DPIA required" for other reasons, that decision must be traceable — silently claiming no PII was processed removes the audit breadcrumb.
- **Reproduction / evidence**: Run pep-check with input `{ full_name: "Angela Merkel" }`, then fetch the audit. `compliance.personal_data_processed` is `false`. No capability-level spot-check defeats this because `detectPersonalData` never sees the input.
- **Suggested direction**: `detectPersonalData` should accept both input and output (or be called twice) and OR the results. Long-term, replace heuristic keyword matching with a per-capability declaration (a `processes_personal_data: boolean` field on the capability manifest). Several capabilities can be tagged confidently from their spec — kyb, pep, sanctions, address-lookup, email-validate, etc. all have known PII profiles.
- **Related findings**: F-A-009 (broader quality concern with the heuristic).

### F-A-004: Audit claims `data_retention_days: 90` but transactions are retained for 3 years

- **Category**: Bug, Safety (compliance)
- **Severity**: Medium
- **Confidence**: High
- **Location**: [apps/api/src/routes/do.ts:2174](apps/api/src/routes/do.ts#L2174), [apps/api/src/lib/data-retention.ts:133-153](apps/api/src/lib/data-retention.ts#L133-L153)
- **What's wrong**: `buildFullAudit` sets `compliance.data_retention_days: 90`. The actual retention policy in `data-retention.ts` purges `transactions` older than 3 years (`threeYearsAgo`, line 147-152). The 90 figure appears to be copied from `test_results` retention (`ninetyDaysAgo`, line 137). Every audit record therefore tells the data subject / auditor that their transaction will be deleted after 90 days; in practice it lives 12× longer.
- **Why it matters**: Retention commitments are a core GDPR Art. 5(1)(e) requirement. Misstating retention by 12× is a concrete false claim — a user who relied on it to plan their data rights would be wrong. Reverse failure mode is also ugly: if someone tests Article 17 by requesting deletion after day 90 expecting auto-purge, the data is still there.
- **Reproduction / evidence**: Read both files. Run a capability, fetch the audit; `compliance.data_retention_days` is `90`. Run `data-retention.ts` against a transaction 91 days old; it's not deleted. Both statements are in the committed code.
- **Suggested direction**: Change `data_retention_days: 90` to `1095` (3 years) in `buildFullAudit` / `buildFailureAudit`, and the same field in solution-execute's `buildInlineAudit` if present. Consider deriving the value from a constant in `data-retention.ts` to prevent future drift. Also flag the `legal_hold` exemption — transactions with that flag are retained indefinitely and the audit should note the exemption condition.
- **Related findings**: F-A-001.

### F-A-005: Free-tier transactions publicly retrievable by UUID leak input/output data

- **Category**: Safety (privacy)
- **Severity**: Low
- **Confidence**: High
- **Location**: [apps/api/src/routes/transactions.ts:156-177](apps/api/src/routes/transactions.ts#L156-L177)
- **What's wrong**: `GET /v1/transactions/:id` is gated by `optionalAuthMiddleware`: authenticated users get their own transactions; unauthenticated users can fetch any `isFreeTier=true` transaction by UUID. The full row is returned, including `input` and `output`. For free-tier capabilities like email-validate (input = an email address), dns-lookup (input = a domain), iban-validate (input = an IBAN), anyone who learns the transaction UUID can retrieve the raw input. The UUID is unguessable, but it appears in audit URLs, logs, and response bodies — anywhere a user shared the audit link, the input is exposed.
- **Why it matters**: The design is intentional (per comment at line 54-56: shareable audit trails for free-tier). But the public/private boundary sits on "UUID non-guessability" alone; whoever the UUID leaks to gets the input. IBAN in particular is non-trivial. Email is directly PII. If the UUID shows up in an error log or URL shortener cache, the data is reachable by anyone parsing that source.
- **Reproduction / evidence**: `POST /v1/do { capability: "email-validate", input: { email: "alice@example.com" }}` without auth → get `transaction_id`. Then `GET /v1/transactions/<id>` from any IP without auth → full `input` and `output`. No token required.
- **Suggested direction**: Either redact `input`/`output` on the unauthenticated free-tier lookup path (return metadata only), or require the same HMAC token that gates `/v1/audit/:id` on unauthenticated `/v1/transactions/:id` as well. Redaction is the safer default — free-tier audit still usable for compliance verification via the HMAC-gated `/v1/audit/:id` endpoint, but raw PII isn't distributed.
- **Related findings**: F-A-006, F-A-007.

### F-A-006: Audit HMAC tokens never expire

- **Category**: Safety
- **Severity**: Low
- **Confidence**: High
- **Location**: [apps/api/src/lib/audit-token.ts:21-26](apps/api/src/lib/audit-token.ts#L21-L26)
- **What's wrong**: `generateAuditToken(txnId) = HMAC-SHA256(AUDIT_SECRET, txnId).slice(0,32)`. The HMAC takes only the transaction ID — no timestamp, no expiry nonce. Tokens are valid forever. A shared audit URL grants access for the lifetime of the transaction row (3 years) with no revocation path short of rotating the secret (see F-A-007).
- **Why it matters**: Leaked audit URLs can't be revoked individually. A user who sharing-slipped a token into a public channel has no recovery. For compliance-sensitive audits this is a non-trivial blast radius.
- **Reproduction / evidence**: Read `generateAuditToken`. No time component. `verifyAuditToken` takes only `transactionId` and `token` — no freshness check.
- **Suggested direction**: Embed an issued-at or expiry timestamp in the token (e.g. `HMAC(AUDIT_SECRET, txnId + ":" + expiresAt)`, with `expiresAt` as part of the query string). Shareable URLs then have bounded lifetime (e.g. 30 days, re-signable on request). Trade-off: URL becomes less stable; past URLs decay. Some systems prefer stable URLs for compliance archives — survey what stakeholders need before committing to a shape.
- **Related findings**: F-A-007.

### F-A-007: `AUDIT_HMAC_SECRET` rotation invalidates every previously-issued audit URL

- **Category**: Resilience
- **Severity**: Low
- **Confidence**: High
- **Location**: [apps/api/src/lib/audit-token.ts:19](apps/api/src/lib/audit-token.ts#L19), [apps/api/src/lib/audit-token.ts:28-43](apps/api/src/lib/audit-token.ts#L28-L43)
- **What's wrong**: `verifyAuditToken` regenerates an expected token from the current `AUDIT_SECRET` and compares constant-time. Rotating the secret changes every token's expected value — every URL previously given to a customer / regulator for verification now 401s. No two-secret rollover path exists.
- **Why it matters**: Secret rotation is a standard operational hygiene practice (and a regulatory expectation under several frameworks). Today, rotating the secret breaks every shared audit URL in every external record. Practically this means the secret cannot be rotated without coordinating with every past audit recipient.
- **Reproduction / evidence**: Read the module; there's a single `AUDIT_SECRET` constant (line 19). No fallback to a prior secret in verification.
- **Suggested direction**: Support a primary + prior secret pair. `generateAuditToken` always signs with the primary; `verifyAuditToken` tries the primary first, falls back to the prior (for a grace window — a month or two). Env vars: `AUDIT_HMAC_SECRET` (current) + `AUDIT_HMAC_SECRET_PREVIOUS` (optional). After the grace window the prior is removed. Standard key-rollover pattern.
- **Related findings**: F-A-006.

### F-A-008: `getPreviousHash()` ordering is non-deterministic for same-ms `completed_at`

- **Category**: Bug
- **Severity**: Low
- **Confidence**: Medium
- **Location**: [apps/api/src/lib/integrity-hash.ts:68-81](apps/api/src/lib/integrity-hash.ts#L68-L81)
- **What's wrong**: `getPreviousHash` SELECTs the most-recent integrity_hash ORDER BY `completedAt DESC`. Postgres timestamps store microseconds but `new Date()` + Drizzle serialisation rounds to milliseconds on the JS side. Two transactions that complete within the same millisecond produce the same timestamp — ordering is then implementation-defined (likely physical row order). Which row is "previous" is nondeterministic. Under real production throughput (tens of transactions per second), same-ms completions happen.
- **Why it matters**: Two valid chain traversals could produce different `previousHash` sequences if order depends on storage-layer choices (which is the case today). For tamper-evidence that's still fine — each individual hash verifies — but the chain's notion of "the prior transaction" is fuzzy at the millisecond boundary. Combined with F-A-002, this compounds chain-correctness friability.
- **Reproduction / evidence**: Concurrent execution of a fast capability (dns-lookup, iban-validate) at moderate QPS produces timestamps that collide on milliseconds. Postgres ordering without a stable tiebreaker is not deterministic.
- **Suggested direction**: Add `id ASC` as a secondary sort to `ORDER BY completedAt DESC, id DESC`. UUIDs break ties deterministically. Single-line fix.
- **Related findings**: F-A-002.

### F-A-009: `detectPersonalData` heuristic is fragile — false positives and false negatives

- **Category**: Bug
- **Severity**: Low
- **Confidence**: High
- **Location**: [apps/api/src/lib/audit-helpers.ts:40-45](apps/api/src/lib/audit-helpers.ts#L40-L45)
- **What's wrong**: The heuristic checks if any output field name contains any of `["name", "email", "phone", "address", "ssn", "date_of_birth", "person"]`. False positives: any field with "name" in it (capability's `entity_name`, product's `brand_name`, a wallet's `chain_name`) trips as PII. False negatives: `owner` (company-data), `beneficial_owner.*` (KYB), `individual.first`, `signatory` — none match. Output-only scan amplifies the problem (see F-A-003).
- **Why it matters**: Combined with F-A-003, the `personal_data_processed` claim in every audit is unreliable in both directions. Compliance auditors can catch both kinds of errors; aggregate trust in the payload drops.
- **Reproduction / evidence**: Read the function. Run `company-data` — output has `name` (company name) — gets tagged as PII (false positive). Run any capability with output shaped `{ beneficial_owner: {...} }` — no PII keyword match (false negative).
- **Suggested direction**: Replace with per-capability declaration on the manifest: `processes_personal_data: boolean` and/or `personal_data_categories: string[]` (email, name, financial, etc.). Fallback heuristic can stay for defence in depth, but the manifest-declared value is authoritative. This aligns with the broader capability-manifest pattern already in use.
- **Related findings**: F-A-003.

### F-A-010: `GENESIS_HASH` duplicated across modules — silent divergence risk

- **Category**: Resilience
- **Severity**: Low
- **Confidence**: High
- **Location**: [apps/api/src/lib/integrity-hash.ts:19](apps/api/src/lib/integrity-hash.ts#L19), [apps/api/src/routes/verify.ts:16](apps/api/src/routes/verify.ts#L16)
- **What's wrong**: Both files define `const GENESIS_HASH = createHash("sha256").update("strale-genesis-v1").digest("hex")` independently. Same literal string today, so same value. But if the seed ever changes in one file and not the other, `walkChain` in verify.ts will fail to detect "reaches genesis" on chains that do reach it (`currentHash === GENESIS_HASH` never matches), and vice versa. Nothing currently enforces that the two stay in sync.
- **Why it matters**: Low-probability operational foot-gun. Any developer modifying the genesis marker for any reason (versioning the chain, adding a prefix) will likely only edit one file. The symptom would be subtle — chain walks never reach genesis, reported as `reaches_genesis: false` on every request, slowly eroding trust in the verification output.
- **Reproduction / evidence**: Grep shows the two identical definitions. No shared export.
- **Suggested direction**: Export `GENESIS_HASH` from `lib/integrity-hash.ts` and import in `verify.ts`. One-line fix with real hardening value.
- **Related findings**: none directly.

### F-A-011: No liveness monitor for the integrity-hash-retry worker — stale rows silently accumulate

- **Category**: Resilience, Autonomy
- **Severity**: Low
- **Confidence**: High
- **Location**: [apps/api/src/jobs/integrity-hash-retry.ts:144-150](apps/api/src/jobs/integrity-hash-retry.ts#L144-L150)
- **What's wrong**: The worker logs `integrity-hash-stale-rows` (level: warn) when any row older than 5 minutes is still pending. There's no paging alert, no dashboard, no automated escalation. If the worker stops running (process crash with unsuccessful restart, advisory-lock held by an idle backend, DB connectivity issue), pending rows accumulate. Operators only notice when a customer complains that `GET /v1/audit/:id` returns 202 forever, or by manually tailing Railway logs.
- **Why it matters**: This was the exact failure mode that triggered the Phase C advisory-lock hotfix — the worker had been stuck for an unknown duration before someone noticed. Post-hotfix, the log label is there and lock-busy is visible, but there's still no active alert. Combines with SCF-2 (no job-liveness check in the runner/scheduler layer).
- **Reproduction / evidence**: `PHASE_C_DEPLOY_OBSERVATIONS.md` post-mortem describes the original incident. Grep for any alert wiring on `integrity-hash-stale-rows` — none exists. BAKE_MONITORS.md prescribes running queries manually, not automated alerts.
- **Suggested direction**: This intersects directly with SCF-2 (cross-cutting "no job liveness" finding). Recommend carrying forward to Session 5 synthesis rather than fixing in isolation — a generic job-heartbeat + stale-row alert mechanism covers this and the four other recurring jobs uniformly.
- **Related findings**: SCF-2.

### F-A-012: Public `/verify/:id` chain walk has O(n×row-size) memory cost with weak DoS mitigation

- **Category**: Resource efficiency
- **Severity**: Medium
- **Confidence**: Medium
- **Location**: [apps/api/src/routes/verify.ts:23](apps/api/src/routes/verify.ts#L23), [apps/api/src/routes/verify.ts:148-152](apps/api/src/routes/verify.ts#L148-L152)
- **What's wrong**: The chain walk does `db.select()` (all columns including `input`, `output`, `auditTrail`, `provenance` JSONB blobs) for every row in the chain up to `max_depth=200`. Rate limit is 30 req/min per IP. At 200 hops with average row size (conservatively 5-20 KB for typical capabilities; larger for scrapers), a single request can move 1-4 MB into Node memory. 30 req/min × 4 MB = 120 MB/min sustained per IP. Distributed across a few IPs, this can pressure the single Railway replica's memory.
- **Why it matters**: Public endpoint, unauthenticated, discoverable from any audit URL. Only IP-based rate limit. An attacker doesn't get anything useful out of the response (JSON summary), but they can exhaust memory / bandwidth / DB pool on the single replica. Recovery is automatic but disruptive.
- **Reproduction / evidence**: Inspect `select().from(transactions)` — no column projection. Each row pulls full JSONB. At production-sized inputs (scraping capabilities occasionally return 50KB+ HTML-derived data), worst case is larger.
- **Suggested direction**: Two changes: (a) `.select({ id, integrityHash, previousHash, ... })` — only fields needed by `computeIntegrityHash` + metadata for the response. Avoid hauling full `input`/`output`/`provenance` JSONB just to hash them. Wait — the hash is computed from those fields, so they need to be fetched. Alternative: (b) cache the computed hash verification result (a row's integrity_hash is immutable once chain-linked; walking the same chain twice produces the same result). (c) tighter rate limit on the deep-walk endpoint (10 req/min instead of 30). (d) lower the default and max depth (20 default, 50 max) — most legitimate verifications only need a shallow walk.
- **Related findings**: none.

## 4. Patterns

**P1 — Compliance payload accuracy drift.** Three findings (F-A-001, F-A-003, F-A-004) all fall under "static claims in the compliance block of every audit don't match the actual system behaviour." The audit-trail object was written once to encode a compliance narrative; as the system evolved (retention policy shifted to 3 years, DELETE endpoint was deferred, PII detection got a partial implementation), the narrative text wasn't kept in sync. This is a monitoring/enforcement pattern — the compliance claims should be verified by a test, not just asserted in code. **Flag for Session 5 carry-forward**: a "compliance-claim consistency check" test suite that reads audit payloads and asserts the claims match actual system behaviour.

**P2 — Chain integrity has three interacting weaknesses.** F-A-002 (batch shares previousHash), F-A-008 (non-deterministic ordering), F-A-010 (duplicated genesis constant). Individually each is a minor correctness issue; together they mean the chain's "tamper-evidence guarantee" is softer than the docs claim. A single commit fixing all three would substantially strengthen the tamper-evidence story.

**P3 — Public endpoints with memory-unbounded work.** F-A-012 is the most concrete instance, but the pattern (unauth'd endpoint + rate-limit only + expensive inner query) shows up elsewhere in the codebase (noted in other review sessions — not re-audited here). Under the single-replica Railway deployment, single-IP sustained memory pressure is a real operational risk.

## 5. What I did not review

- **Capability-level audit emission**: each capability's contribution to the audit trail (what `provenance` and `output` contain, how they're composed). Scoped to Session 1 (capabilities review).
- **Solution execution audit trail**: `solution-execute.ts:buildInlineAudit` and related per-step audit propagation. Spot-checked the call sites but didn't end-to-end verify against `buildFullAudit` shape parity. Scoped to Session 2 or 3 (solutions review).
- **Capability ID vs solution slug dispatch in audit**: the audit record type discriminator ("capability" vs "solution") resolution path. Assumed to be correct; not traced.
- **Better Stack log shipping**: verified the Pino config exports the sink correctly; did not confirm Better Stack receives structured records or that retention there matches Postgres.
- **MCP and A2A audit paths**: whether those transport layers correctly populate `transparencyMarker`, `dataJurisdiction`, etc. when their dispatcher writes to `transactions`. Out of scope per Session 4 deferral of F-0-017.
- **The SCF-3 interaction** (untracked external workflow writing `integrity_hash_status`): only confirmed the column is untouched by `compliance_hash_state` code paths. The external workflow's semantics and whether its writes could race other audit workflows was not investigated.
- **Legal-hold behaviour**: confirmed `data-retention.ts:purgeTransactions` has a `legal_hold = false` filter. Did not audit how rows get legal_hold set or whether the audit payload should reflect legal-hold state to the data subject.
- **Performance testing of `/verify/:id` and `/audit/:id`** under real-chain-size workloads — noted as findings but not measured.

## 6. Questions for Petter

1. **F-A-001 (missing DELETE endpoint)**: should we build the DELETE handler (with soft-delete + legal_hold exemption) or walk back the GDPR Art. 17 claim in the audit payload? The former is the right compliance posture; the latter is a 5-minute change. Preference?
2. **F-A-003 / F-A-009 (PII detection)**: is there appetite for a capability-manifest-declared `processes_personal_data` field? This replaces two brittle heuristics with an explicit spec declaration and is a cleaner long-term answer.
3. **F-A-004 (retention mismatch — 90 vs 1095)**: which is the intended policy? The 3-year setting in `data-retention.ts` matches the Colorado AI Act precedent we adopted in Phase C. If 3 years is correct, the audit claim needs an update. If 90 days was the original intent, the retention code needs changing and this is a bigger finding.
4. **F-A-005 (free-tier public transaction lookup)**: the design intent is shareable free-tier audits. Is returning raw `input`/`output` required for that shareability, or can a redacted shape (metadata + hash) satisfy the use case? If redacted, F-A-005 becomes a 30-minute fix.
5. **F-A-006 / F-A-007 (token lifecycle)**: do you want bounded-lifetime audit tokens + secret rotation, or are permanent tokens + forever-stable URLs the desired property for the compliance-archive use case? This is a product question, not a security one — both shapes are defensible.

## Synthesis

### Findings count by severity

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 1 (F-A-002) |
| Medium | 4 (F-A-001, F-A-003, F-A-004, F-A-012) |
| Low | 6 (F-A-005 through F-A-010) |
| Informational | 1 (F-A-011) |
| **Total** | **12** |

### Top 3 most impactful

1. **F-A-002 — chain batch creates branches (High).** The chain's tamper-evidence guarantee is the product's compliance anchor. The bug is subtle (only visible under batch processing, silent in `/verify` output) but the fix is a one-hour change: thread the previous hash through the loop or pass `tx` into `getPreviousHash`. Highest value-to-cost ratio in this review.
2. **F-A-001 — missing DELETE endpoint (Medium).** Every audit record advertises GDPR Art. 17 compliance via an endpoint that doesn't exist. Directly visible to any customer or regulator reading the payload.
3. **F-A-004 — retention mismatch, 90 vs 1095 (Medium).** Same shape as F-A-001 but different field. Two false compliance claims in the same payload is a signal that the compliance block needs a consistency test.

### Cross-cutting patterns

- **P1 (compliance-claim drift)** feeds Session 5 synthesis as a cross-cutting issue — the remediation is a test, not per-finding fixes.
- **P2 (chain correctness cluster)** — F-A-002, F-A-008, F-A-010 can be fixed in a single commit addressed to Session 5's assigned fix owner.
- **F-A-011** intersects with **SCF-2 (no job-liveness monitor)** and should be folded into that carry-forward rather than fixed in isolation.

### Expected-outcome statement

**No findings at Critical severity.** Phase A's `AUDIT_HMAC_SECRET` fail-fast, Phase C's two-phase integrity-hash write, Phase D's PII-in-logs scrub, and Phase E's structured logging all hold — no regressions against those fixes. The audit subsystem is in substantially better shape than the Session 0 baseline described; this review focuses on the residual correctness and accuracy gaps that weren't in the original scope.

### Recommended actions (by finding)

- **F-A-001** → Session 5 fix assignment (either implement DELETE or update payload)
- **F-A-002** → Session 5 fix assignment (chain linearity — highest priority)
- **F-A-003** → Session 5 fix assignment, bundled with F-A-009 (per-capability PII declaration)
- **F-A-004** → immediate 1-line fix in any session; could ride alongside F-A-001 fix
- **F-A-005** → product decision required (Q4 above), then Session 5 fix
- **F-A-006 / F-A-007** → product decision required (Q5 above)
- **F-A-008 / F-A-010** → bundle with F-A-002 (chain cluster)
- **F-A-009** → bundle with F-A-003 (PII declaration)
- **F-A-011** → Session 5 carry-forward, fold into SCF-2
- **F-A-012** → Session 5 fix assignment (verify endpoint hardening)
