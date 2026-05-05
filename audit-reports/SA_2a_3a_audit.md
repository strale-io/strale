# SA.2a.3a — DELETE handler + walker + audit-log + retention claim audit

**Date:** 2026-04-20
**HEAD:** `52912f8d8a25c5319efd8c541c0d28dc999d68cd` (`main`)
**Working tree inside `apps/api/src/`:** clean
**Scope:** read-only audit for SA.2a.3b implementation. No code modified. No commits.

## Tripwire check

| Tripwire | State |
|---|---|
| Working tree dirty inside `apps/api/src/` | Clean ✓ |
| HEAD at `52912f8` or later | At `52912f8` ✓ |
| Branch is `main` | Yes ✓ |

**Plan-invalidating findings:** one — the retention claim at `routes/do.ts:2174` returns `data_retention_days: 90` but the retention sweep at `lib/data-retention.ts:148-149` uses **3 years** (1095 days). This is pre-existing drift. Does not block 2a.3b; flagged as an **Open Question** and handled in Plan section 5.

**Escalation findings:** one — the codebase has **no dedicated audit-events table**. The "existing audit-log infrastructure" consists of (a) per-row columns on `transactions` (`auditTrail`, `integrityHash`, `previousHash`), (b) the derived `/v1/audit/:id` endpoint, and (c) the hash chain. A deletion "event" naturally maps to updating the `deleted_at`/`redacted_at`/`deletion_reason` columns on the row itself — not a separate event-row insert. This honors the pre-decision's spirit but changes what "emit an audit event" means operationally. See Sub-report C.

---

## Sub-report A — Auth pattern

### Enumerated mutating `/v1/` endpoints

| Path | Method | File:Line | Auth | Rate limit | Ownership failure |
|---|---|---|---|---|---|
| `/v1/do` | POST | `routes/do.ts:349` | `optionalAuthMiddleware` | `rateLimitByKey(10, 1000)` + IP pre-gate | N/A (creates new) |
| `/v1/solutions/:slug/execute` | POST | `routes/solution-execute.ts:31` | `authMiddleware` (implied by route mount) | via `rateLimitByKey` | N/A (creates new) |
| `/v1/wallet/topup` | POST | `routes/wallet.ts:31` | `authMiddleware` (route-level, L27) | `rateLimitByKey(5, 1000)` (L28) | N/A (creates Stripe session) |
| `/v1/auth/signup` | POST | `routes/auth.ts:23` | none | DB rate limit by IP | N/A |
| `/v1/auth/login-magic-link` | POST | `routes/auth.ts:142` | none | DB rate limit by IP | N/A |
| `/v1/auth/api-key` | POST | `routes/auth.ts:210` | `authMiddleware` | (inherited) | N/A (rotates own key) |
| `/v1/webhook/stripe` | POST | `routes/webhook.ts:11` | Stripe signature | none | N/A |
| `/v1/admin/*` | POST/PATCH | `routes/admin.ts:370+` | `ADMIN_SECRET` header (constant-time compare) | none | `not_found` 404 |
| `/v1/internal/*` | POST | `routes/internal-*.ts` | internal-auth middleware | varies | 404 |
| `/v1/suggest` | POST | `routes/suggest.ts:78` | none | `rateLimitByIp(20, 1000)` | N/A |
| `/a2a` | POST | `routes/a2a.ts:211` | inline Bearer check | none | `-32602 Task not found` |

**No existing endpoint deletes a user-owned resource.** Nothing today is a direct shape-match for the DELETE handler.

### Canonical pattern to mirror

The closest shape is **wallet + GET /v1/transactions/:id (auth branch)** combined:

- Required auth via `authMiddleware`
- Per-key rate limit via `rateLimitByKey(5, 1000)` — matches wallet/transactions (DEC-21)
- Ownership scoping via `and(eq(transactions.id, id), eq(transactions.userId, user.id), isNull(transactions.deletedAt))`
- 404 `not_found` on any miss (ID doesn't exist / wrong user / already deleted) — matches the SA.2a.2a no-existence-leak convention and the existing `transactions.ts:151` pattern
- Auth failure → 401 (middleware handles)
- Rate-limit exceeded → 429 (middleware handles)

### Canonical imports for the DELETE handler

From `middleware.ts`: `authMiddleware`
From `rate-limit.ts`: `rateLimitByKey`
From `drizzle-orm`: `eq`, `and`, `isNull`
From `db/schema.js`: `transactions`, `transactionQuality`
From `db/index.js`: `getDb`
From `lib/errors.js`: `apiError`

---

## Sub-report B — PII enumeration on `transactions`

Every column on `transactions` (schema.ts:171-241) classified:

| Column | Type | Category | Redaction target? | Rationale |
|---|---|---|---|---|
| `id` | uuid PK | non-PII | no | Opaque identifier; needed for audit-trail reference and `deletion_endpoint` URL. Keep. |
| `userId` | uuid FK | non-PII | no | Pointer to `users`. Identity lives in `users` table, which has its own erasure path. Keep for deletion audit (who deleted). |
| `capabilityId` | uuid FK | non-PII | no | Structural; needed to recompose `/v1/audit/:id` post-deletion. Keep. |
| `solutionSlug` | text | non-PII | no | Public slug; same as above. Keep. |
| `idempotencyKey` | varchar(255) | **PII-adjacent** | **YES → NULL** | User-supplied; may encode user-chosen tokens or request IDs that identify the caller. Safer to clear. |
| `status` | varchar(20) NOT NULL default `'pending'` | non-PII | no | Enum. Keep. |
| `input` | jsonb **NOT NULL** | **PII** | **YES → `'{}'::jsonb`** | User-submitted data (VAT numbers, names, emails, addresses). MUST zero. NOT NULL → replace with empty object, not NULL. |
| `output` | jsonb nullable | **PII** | **YES → NULL** | Capability output derived from user input; often contains enriched PII. MUST zero. |
| `error` | text nullable | **PII-adjacent** | **YES → NULL** | Error messages frequently echo user input or upstream response bodies. Clear to be safe. |
| `priceCents` | int NOT NULL | non-PII | no | Financial metadata; needed for transparency and audit. Keep. |
| `latencyMs` | int nullable | non-PII | no | Operational metric. Keep. |
| `provenance` | jsonb nullable | **ambiguous** | **YES → NULL** | Source attribution (URLs, fetched_at). Usually public but MAY embed input values in the URL. Clear to avoid ambiguity. |
| `auditTrail` | jsonb nullable | **PII** | **YES → NULL** | Per schema comment: "full execution trace for regulatory compliance". Contains input, output, intermediate values, `request_context` (IP hash, user-agent, referer). MUST zero. |
| `transparencyMarker` | varchar(20) NOT NULL default `'ai_generated'` | non-PII | no | Enum. Keep. |
| `dataJurisdiction` | varchar(10) NOT NULL default `'EU'` | non-PII | no | ISO region code. Keep. |
| `isFreeTier` | bool NOT NULL default `false` | non-PII | no | Structural. Keep. |
| `integrityHash` | varchar(128) nullable | non-PII | no (see Sub-report C) | Hash over original content — will no longer verify against redacted row. Keep as-is or recompute (open question). |
| `previousHash` | varchar(128) nullable | non-PII | no | Chain pointer. Must keep for chain continuity. |
| `complianceHashState` | varchar(16) NOT NULL default `'pending'` | non-PII | no | Enum. Keep. |
| `integrityHashStatus` | varchar(16) NOT NULL default `'pending'` | externally managed | **no (forbidden)** | SCF-3 lint guard forbids API writes. The DELETE handler MUST NOT touch this column. |
| `legalHold` | bool NOT NULL default `false` | non-PII | no | Deletion-eligibility flag. Keep — also the 423-gate input. |
| `deletedAt` | timestamptz nullable | non-PII (deletion metadata) | **SET by handler → `now()`** | The primary state change. |
| `redactedAt` | timestamptz nullable | non-PII (deletion metadata) | **SET by handler → `now()`** | Marks PII-zeroing complete. |
| `deletionReason` | text nullable | non-PII (deletion metadata) | **SET by handler → `'user_request'`** | Enum value per DEC scope. |
| `paymentMethod` | varchar(20) NOT NULL default `'wallet'` | non-PII | no | Enum. Keep. |
| `x402SettlementId` | text nullable | non-PII | no | On-chain tx ID; inherently public. Keep. |
| `priceUsd` | decimal(10,4) nullable | non-PII | no | Financial metric. Keep. |
| `createdAt` | timestamptz NOT NULL defaultNow() | non-PII | no | Retention-policy input. Keep. |
| `completedAt` | timestamptz nullable | non-PII | no | Same. Keep. |

**Summary:** 6 redaction-target columns (`idempotencyKey`, `input`, `output`, `error`, `provenance`, `auditTrail`). Under the 12-column plan-invalidation threshold.

**Fields returned by the 4 user-facing read sites** (from SA.2a.2a classification), each of which the A-filter already blocks post-deletion:

- `transactions.ts:25-40` (list): `id`, `status`, `capability_slug`, `solution_slug`, `price_cents`, `latency_ms`, `created_at`, `completed_at` — none PII.
- `transactions.ts:71-94` (detail): adds `input`, `output`, `error`, `provenance`, `audit_trail`, `transparency_marker`, `data_jurisdiction`, `is_free_tier` — **5 PII fields exposed here**. Redaction-list covers them all.
- `transactions.ts:197` (verify initial lookup): `SELECT *` — all columns. Same coverage.

### Sibling: `transaction_quality` columns

Per schema.ts:245-261 + migration 0048 addition: `id`, `transactionId` (FK, onDelete cascade), `responseTimeMs`, `upstreamLatencyMs`, `schemaConformant`, `fieldsReturned`, `fieldsExpected`, `fieldCompletenessPct`, `errorType`, `qualityFlags`, `deletedAt`, `createdAt`. **None of these is PII** (all derived aggregates — response times, field counts, error-type enum). The cascade from DELETE sets `deletedAt` only; no redaction of quality columns needed.

### FK relationship (`transaction_quality → transactions`)

Clean: `.references(() => transactions.id, { onDelete: "cascade" })` at schema.ts:244. If Postgres hard-deletes the parent, child is cascade-deleted. For soft-delete, the handler must explicitly set `transaction_quality.deleted_at` on children (cascade doesn't fire on UPDATE).

---

## Sub-report C — Audit-log infrastructure

### What "audit log" actually means in this codebase

There is **no dedicated `audit_events` / `audit_log` / `deletions` table.** Greps for `pgTable(` returned 19 tables; none is an append-only event stream for transaction-scope lifecycle events. The audit surface consists of:

- **`transactions.auditTrail`** (jsonb) — per-row execution trace written inline from `do.ts`, `solution-execute.ts`, `x402-gateway-v2.ts`. Comment: "full execution trace for regulatory compliance".
- **`transactions.integrityHash` / `previousHash`** — hash chain (see `lib/integrity-hash.ts`). Each row's hash covers its content + the previous row's hash. Written asynchronously by `jobs/integrity-hash-retry.ts`.
- **`/v1/audit/:id`** (`routes/audit.ts:168`) — derived-at-request-time compliance record. Joins `transactions` + capability/solution compliance profile, gated by HMAC token. Returns `AuditRecord` (interface at audit.ts:52) — event-like in its API shape, but not persisted.
- **`health_monitor_events`** (schema.ts:546) — append-only event stream, but **scoped to platform-ops events** (`auto_fix`, `lifecycle_transition`, `sqs_exclusion`, `interrupt_sent`, `invariant_alert`, `reindex_transactions_complete`). Not user-facing, not for transaction-scope events. Reusing this for deletion events is possible but category-stretches it.

### Hash chain semantics for a deleted row

From `integrity-hash.ts:29-66`: the hash covers `{id, userId, status, input, output, error, priceCents, latencyMs, provenance, auditTrail, transparencyMarker, dataJurisdiction, createdAt, completedAt, previousHash}`. Redacting `input`/`output`/`error`/`auditTrail`/`provenance` changes 5 of those 15 fields — so **per-row hash verification breaks for redacted rows** (`computeIntegrityHash(redacted_row, previousHash) !== storedHash`).

Three consequences:
1. **Chain-link continuity is preserved** — the next row still points at this row's `integrityHash`, and the previous-row pointer still resolves. Walkers at `routes/verify.ts` and `routes/transactions.ts:223` (chain walk) continue to work.
2. **Per-row content-hash verifiability is lost** — a verifier cannot confirm "this row's stored hash matches its current content" for redacted rows. The chain attests that a row existed at this position, not what it contained.
3. **The `integrity-hash-retry` worker will not re-hash this row** because it only hashes rows with `complianceHashState = 'pending'`; after deletion the state is already `complete`.

This is an inherent cost of PII redaction, not a design flaw.

### Carveout answer: can a deletion event be represented cleanly?

**YES — but the event is a column-state on the row itself, not a separate event row.** The pre-decision to "reuse the existing audit-log infrastructure" resolves as: the `deleted_at`, `redacted_at`, `deletion_reason` columns (added by migration 0048) ARE the deletion event. There is no separate "write an audit entry" step in the handler — setting the columns inside the same transaction block as the redaction IS the entry.

Specifically:
- **Event type string:** not needed. The event-type is encoded by `deleted_at IS NOT NULL`.
- **Event timestamp:** `deleted_at` itself.
- **Event actor:** `userId` (preserved) — the deleter is always the owner (DELETE handler verifies ownership).
- **Event reason:** `deletion_reason` column.
- **Hash chain participation:** the row keeps its original chained position. See "three consequences" above.

This is cleaner than emitting a separate event row because:
1. A separate event row would need its own hash-chain placement, creating ordering ambiguity.
2. A separate event row that references a deleted row is half-orphaned (the referent is still present but redacted).
3. The `/v1/audit/:id` endpoint can represent a deleted transaction by reading the deletion columns at compose time — no new join needed.

**Recommendation for 2a.3b:** the DELETE handler does NOT emit a separate audit event. It updates the deletion columns + cascades to `transaction_quality` + zeroes PII — all in one transaction block. This is the event.

**Caveat to escalate:** if regulators or compliance audit ever demand an append-only stream (not just per-row state), a future migration would need to add an `audit_events` table. That's not in SA.2a scope.

---

## Sub-report D — Walker behaviour

### Walker loop location

`apps/api/src/jobs/test-scheduler.ts` — DB-driven polling (confirmed; matches project memory). Loop fires every 5 minutes (`POLL_INTERVAL_MS` L72), processes up to 20 capabilities per cycle (L73). Session-scoped advisory lock on a dedicated `postgres` connection (L106-120).

### What the walker reads

Per scheduler.ts:21 imports and internal reads:
- `capabilities` (schedule candidates)
- `solutions` + `solutionSteps` (gate-checks)
- `testSuites` (test definitions)
- `testResults` (last-run timestamps)

**The walker does NOT read `transactions` directly.** Test execution is delegated to `lib/test-runner.ts`, which creates its own synthetic `transactions` rows via `db.insert(transactions)` at test-runner.ts:1206 (with `userId = systemUserId`) and pairs them with `transactionQuality` rows at L1237.

### Read-filter requirement: **none**

No `transactions` read in the walker → no `deleted_at IS NULL` filter needed on the walker's read path.

### Write-time parent-row race: **real concern**

Two non-walker code paths write `transaction_quality` rows pointing at user-owned parent transactions:

1. **`lib/quality-capture.ts:39`** (`captureQuality`) — fire-and-forget from `recordQuality()`, called inline from POST /v1/do after the transactions row is created. Race window = time between the transaction's INSERT commit and the quality-capture INSERT commit. Typically milliseconds, but a very fast DELETE call could land in between.
2. **`lib/piggyback-monitor.ts:29`** (`recordPiggybackResult`) — writes to `test_results`, NOT `transaction_quality`. Does not reference a parent transactions row's PII; records against a synthetic piggyback test suite. **No race with user DELETE.**

**Race scenario:** user makes a /v1/do call → transactions row inserted, quality capture scheduled (fire-and-forget) → user immediately DELETEs the transaction → DELETE handler cascades `transaction_quality.deleted_at = now()` on children (zero rows present) → quality-capture's INSERT fires → new `transaction_quality` row exists with `deletedAt = NULL`, pointing at a now-soft-deleted parent. This row leaks through the SA.2a.2b A4 filter and counts toward the public SQS aggregate.

**Mitigations:**
- **(a)** Pre-insert check in `captureQuality`: `SELECT deletedAt FROM transactions WHERE id = :transactionId` immediately before the INSERT; skip if non-null. One extra round-trip per capture call. Race window shrinks but doesn't close.
- **(b)** INSERT … SELECT pattern: `INSERT INTO transaction_quality (...) SELECT :values WHERE EXISTS (SELECT 1 FROM transactions WHERE id = :id AND deleted_at IS NULL)` — atomic; closes the read-then-insert race but not the DELETE-after-INSERT race.
- **(c)** Trigger-based: Postgres AFTER UPDATE ON transactions trigger that cascades `deleted_at` to any `transaction_quality` rows inserted since. Most complex; hardest to reason about.
- **(d)** Accept the race: recognize that the quality aggregation has a ≤1-day TTL cache (`quality-aggregation.ts:33 CACHE_TTL_MS = 5 min`) and a 7-day weight decay; a single race-leaked row has negligible effect on the public SQS number.

**Recommendation for 2a.3b: option (b)** — atomic INSERT with EXISTS subquery. Cleanest. Does not close the DELETE-after-INSERT race, but that race is closed by the retention sweep / a follow-up reconciliation job if needed.

---

## Sub-report E — Retention claim surface

### Primary claim site

**`apps/api/src/routes/do.ts:2174`** — in the compliance payload returned by every successful POST /v1/do response:

```ts
data_retention_days: 90,
deletion_endpoint: `DELETE /v1/transactions/${transactionId}`,
access_endpoint: `GET /v1/transactions/${transactionId}`,
```

**This is the only `data_retention_days` claim** in the API. Value is a hard-coded integer literal `90`.

### Consistency problem

The sweep at `lib/data-retention.ts:148-149` uses **3 years** for transactions:
```ts
const threeYearsAgo = new Date(now);
threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
```
`purgeTransactions(threeYearsAgo)` runs weekly. The actual retention is **1095 days**, not 90. The claim is wrong by 12×.

`data-retention.ts` does **not export a constant** today; the 3-year window is inlined in the anonymous function. SA.2a.3b needs to (a) add an export, (b) read it at the claim site.

### Also-concerning: two other false claims in the same response block

- `do.ts:2175`: `deletion_endpoint: DELETE /v1/transactions/${transactionId}` — the endpoint **does not exist in `main` yet**. After SA.2a.3b lands, this claim becomes truthful.
- `do.ts:2188`: `gdpr.article_17: Transaction data deletable via DELETE /v1/transactions/${transactionId}` — same.

Both are latent; SA.2a.3b ships the DELETE endpoint and retroactively honors the existing claims.

### Other retention-number mentions (internal, not claim surfaces)

- `test-runner.ts:1752` — `RETENTION_INTERVAL_MS` (interval between sweep runs; not a retention-window value). Internal.
- `test-scheduler.ts:85` — same constant duplicated. Internal.
- `jobs/db-retention.ts:25` — same constant for db-retention job. Internal.
- `seed-limitations.ts:897-898` — capability-description text about Companies House retention. Unrelated to Strale's own retention.
- `seed-solutions.ts:1108, 1699` — capability example data. Unrelated.
- `capabilities/privacy-policy-analyze.ts:122` — LLM prompt mentioning data retention in privacy-policy analysis. Unrelated.

**Conclusion:** exactly **one** claim surface (`do.ts:2174`) needs updating. No distribution-surface or marketing-content claim surfaces found in `apps/api/src/` (Rule 4 N/A for the API repo).

---

# PLAN — SA.2a.3b

## Plan section 1 — DELETE handler skeleton

**File:** `apps/api/src/routes/transactions.ts` (append to existing `transactionsRoute`; reuses existing imports and adds `DELETE` route alongside the GETs).

Imports to add: none that aren't already present (`eq`, `and`, `isNull`, `authMiddleware`, `rateLimitByKey`, `apiError`, `transactions`, `transactionQuality`, `getDb`). **Confirm `transactionQuality` is imported** — currently only `transactions, capabilities` at transactions.ts:4. Will need: `import { transactions, capabilities, transactionQuality } from "../db/schema.js";`.

```
// DELETE /v1/transactions/:id — Soft-delete with in-place PII redaction.
// GDPR Art. 17 right-to-erasure. Caller must own the transaction.
// legal_hold = true → 423 Locked. Deletion is represented by the
// deleted_at / redacted_at / deletion_reason columns on the row itself
// (no separate audit-event row — see SA.2a.3a Sub-report C).
transactionsRoute.delete(
  "/:id",
  authMiddleware,                    // required auth; 401 if missing
  rateLimitByKey(5, 1000),           // DEC-21 mutation budget
  async (c) => {
    const id = c.req.param("id") as string;
    const user = c.get("user");
    const db = getDb();

    // Atomic: lookup + legal_hold check + soft-delete + cascade + redact.
    // All in a single db.transaction block so a failure at any step
    // rolls back the entire soft-delete (no half-redacted rows).
    return await db.transaction(async (tx) => {
      // Ownership + not-already-deleted check. Uses the canonical
      // SA.2a.2a pattern: 404 on any miss so we don't leak existence.
      const [row] = await tx
        .select({
          id: transactions.id,
          legalHold: transactions.legalHold,
        })
        .from(transactions)
        .where(and(
          eq(transactions.id, id),
          eq(transactions.userId, user.id),
          isNull(transactions.deletedAt),
        ))
        .limit(1);

      if (!row) {
        return c.json(apiError("not_found", "Transaction not found."), 404);
      }

      // Legal hold: refuse with 423 Locked. The body explains why
      // (compliance hold prevents deletion) — legitimate to disclose
      // because the caller already proved ownership via the lookup above.
      if (row.legalHold) {
        return c.json(
          apiError(
            "locked",
            "This transaction is under legal hold and cannot be deleted. Contact compliance@strale.io.",
          ),
          423,
        );
      }

      const now = new Date();

      // 1. Soft-delete + redact PII on the transactions row. deleted_at
      //    and redacted_at set together — no window where a row is
      //    flagged-deleted but still contains PII.
      await tx
        .update(transactions)
        .set({
          deletedAt: now,
          redactedAt: now,
          deletionReason: "user_request",
          input: {},              // NOT NULL — empty object sentinel
          output: null,
          error: null,
          auditTrail: null,
          provenance: null,
          idempotencyKey: null,
        })
        .where(eq(transactions.id, id));

      // 2. Cascade soft-delete to transaction_quality. FK cascade
      //    only fires on hard-DELETE, so the UPDATE must be explicit.
      await tx
        .update(transactionQuality)
        .set({ deletedAt: now })
        .where(eq(transactionQuality.transactionId, id));

      // Response: minimal non-PII envelope. Tells the caller the
      // erasure succeeded and echoes the deletion metadata so audit
      // replay is possible.
      return c.json({
        id,
        deleted_at: now.toISOString(),
        redacted_at: now.toISOString(),
        deletion_reason: "user_request",
      });
    });
  },
);
```

**Notes:**
- No separate audit-event write — per Sub-report C, the column updates ARE the event.
- Hash chain: the row's `integrityHash` is NOT recomputed. Per-row content verifiability is sacrificed; chain-link continuity is preserved. See Open Question #1 if chat wants to revisit.
- Transaction block uses `db.transaction` (not raw SQL) so Drizzle handles rollback semantics automatically.

---

## Plan section 2 — Redaction field list

```
To zero on redaction (handler SETs these in the UPDATE at step 1):
- transactions.idempotencyKey: null
- transactions.input: {}  (NOT NULL jsonb — empty object)
- transactions.output: null
- transactions.error: null
- transactions.provenance: null
- transactions.auditTrail: null

To SET (deletion metadata):
- transactions.deletedAt: now()
- transactions.redactedAt: now()
- transactions.deletionReason: "user_request"

To PRESERVE (unchanged in the UPDATE):
- transactions.id, userId, capabilityId, solutionSlug, status,
  priceCents, latencyMs, transparencyMarker, dataJurisdiction,
  isFreeTier, integrityHash, previousHash, complianceHashState,
  legalHold, paymentMethod, x402SettlementId, priceUsd,
  createdAt, completedAt

To NEVER TOUCH (SCF-3):
- transactions.integrityHashStatus

Cascade to transaction_quality (step 2):
- transaction_quality.deletedAt: now()  WHERE transactionId = :id
- (no redaction needed — none of the columns are PII)
```

---

## Plan section 3 — Audit event emission

**Per Sub-report C: no separate audit-event row is written.** The column state change on the transactions row (`deleted_at`, `redacted_at`, `deletion_reason` all set in the same UPDATE) IS the event. This is the pre-decision honored in practice.

**Hash chain:** the row keeps its original `integrityHash`. Per-row content-hash verification breaks for redacted rows (by definition of redaction); chain-link via `previousHash` continues to verify. The next transaction created after this deletion still chains off the hash tip resolved by `getPreviousHash()` — unchanged behaviour.

**Nothing to emit. No additional helper to call. The handler's step 1 UPDATE is the entire audit-log write.**

---

## Plan section 4 — Walker filter

**Per Sub-report D: no walker read filter needed.** The walker doesn't read `transactions` directly.

**Write-time race mitigation** (recommended option (b) from Sub-report D):

**File:** `apps/api/src/lib/quality-capture.ts:39`

**Current:**
```ts
await db.insert(transactionQuality).values({
  transactionId: data.transactionId,
  responseTimeMs: cappedResponseTimeMs,
  upstreamLatencyMs: data.upstreamLatencyMs ?? null,
  schemaConformant,
  fieldsReturned,
  fieldsExpected,
  fieldCompletenessPct: fieldCompletenessPct.toFixed(2),
  errorType,
  qualityFlags: buildFlags(data),
});
```

**Proposed:** replace with an atomic `INSERT … SELECT … WHERE EXISTS` that skips the insert if the parent row has been soft-deleted between the capture request and the insert commit. The cleanest Drizzle shape is raw SQL:

```ts
await db.execute(sql`
  INSERT INTO transaction_quality (
    transaction_id, response_time_ms, upstream_latency_ms,
    schema_conformant, fields_returned, fields_expected,
    field_completeness_pct, error_type, quality_flags
  )
  SELECT ${data.transactionId}::uuid, ${cappedResponseTimeMs}, ${data.upstreamLatencyMs ?? null},
         ${schemaConformant}, ${fieldsReturned}, ${fieldsExpected},
         ${fieldCompletenessPct.toFixed(2)}, ${errorType}, ${JSON.stringify(buildFlags(data))}::jsonb
  WHERE EXISTS (
    SELECT 1 FROM transactions
    WHERE id = ${data.transactionId}::uuid AND deleted_at IS NULL
  )
`);
```

**Alternative (simpler, slightly racier):** pre-check SELECT before the Drizzle insert:

```ts
const [parent] = await db
  .select({ deletedAt: transactions.deletedAt })
  .from(transactions)
  .where(eq(transactions.id, data.transactionId))
  .limit(1);
if (parent && parent.deletedAt != null) return;
// ... existing INSERT
```

**Recommendation:** the EXISTS pattern. Single round-trip, atomic at the DB level. The race is narrowed to the single SQL statement's planning window, which is microseconds.

**Not closed by either option:** the reverse race — INSERT commits first, DELETE happens after. That orphan window is closed by the DELETE handler's cascade step (step 2) because it operates on all current child rows at the moment of the UPDATE.

---

## Plan section 5 — Retention claim refactor

**Two-file change.**

### File 1: `apps/api/src/lib/data-retention.ts`

Add an exported constant at the top of the file, alongside `BATCH_SIZE`:

```ts
/**
 * Transaction retention window for GDPR Art. 30 record-of-processing
 * compliance (Colorado AI Act SB 24-205). Rows with `legal_hold = false`
 * and `created_at < now - TRANSACTION_RETENTION_DAYS` are hard-deleted
 * by the weekly retention sweep. SA.2a.3a: also surfaced in the
 * compliance payload returned from POST /v1/do — changes here propagate
 * to the public claim without additional edits.
 */
export const TRANSACTION_RETENTION_DAYS = 1095; // 3 years
```

Refactor `cleanupOldTestData()` at L148-149 to use the constant:

```ts
const threeYearsAgo = new Date(now);
threeYearsAgo.setDate(threeYearsAgo.getDate() - TRANSACTION_RETENTION_DAYS);
```

### File 2: `apps/api/src/routes/do.ts:2174`

**Current:**
```ts
data_retention_days: 90,
```

**Proposed:**
```ts
data_retention_days: TRANSACTION_RETENTION_DAYS,
```

Add to imports at the top of the file:
```ts
import { TRANSACTION_RETENTION_DAYS } from "../lib/data-retention.js";
```

**Effect:** the public compliance claim goes from "90 days" (wrong) to "1095 days" (matches the sweep). This is a **material change to the public API response shape value**. Flag for release notes. No endpoint is deprecated; only the value shifts.

### Bonus: the same response block also says `deletion_endpoint: DELETE /v1/transactions/:id` and `gdpr.article_17` language

No edit needed there. SA.2a.3b ships the DELETE endpoint, so those claims become truthful without changing their text.

---

## Plan section 6 — Commit split proposal

**Recommendation: 2 commits, optionally 3.**

- **B1 — DELETE handler + redaction + cascade.** One file: `routes/transactions.ts`. All of Plan section 1+2+3. ~50 lines of code. Single-commit because handler + redaction + cascade must land together or not at all.
- **B2 — Retention constant + claim refactor.** Two files: `lib/data-retention.ts` (add export, refactor inline constant) and `routes/do.ts` (import and use). ~5-10 lines. Separate commit because it's a behaviour-visible-in-response change; independent revertability matters.
- **B3 (optional) — Quality-capture race mitigation.** One file: `lib/quality-capture.ts`. ~15 lines (raw-SQL INSERT … SELECT). Separate because the race is a mitigation, not a correctness fix, and chat may want to defer.

**Total estimated diff:** ~70-80 lines added + minimal deletions across 3 files for B1+B2, plus ~15 lines swap for B3.

### Rationale for not splitting B1 further

The DELETE handler is one atomic unit of functionality. Splitting into "handler shell" + "redaction logic" + "cascade" creates intermediate commits that represent half-implemented GDPR compliance (a green prod snapshot where DELETE exists but doesn't redact would be worse than no DELETE).

### Rationale for B2 separate from B1

B2 fixes a pre-existing claim lie. It's not strictly blocked by B1. Shipping B2 without B1 is safe (the claim becomes truthful in value). Shipping B1 without B2 is safe (the endpoint works; the claim number is still wrong as it has been for months). Independent revertability has value.

### Rationale for B3 optional

The race is narrow (milliseconds) and the impact is small (one orphan quality row leaking into a weighted 5-min-cached aggregate). If chat wants to ship 2a.3b minimal, defer B3 as a follow-up ticket.

---

## Plan section 7 — Open questions (flag for chat before SA.2a.3b)

### OQ #1 — Recompute `integrityHash` after redaction?

Per Sub-report C, a redacted row's stored hash no longer verifies against its current content. Options:

- **(a)** Accept: chain-link continuity is what matters; per-row content-hash verifiability is understood to break on redaction. Document in the handler comment. **Default, no code change beyond handler.**
- **(b)** Recompute: after the UPDATE in step 1, compute `newHash = computeIntegrityHash(redactedRow, previousHash)` and set `integrityHash = newHash`. Downside: chains off an obsolete predecessor (the next row's `previousHash` still points at the pre-redaction hash). Would require also updating the NEXT row's `previousHash`, which cascades — not tractable.
- **(c)** Set `integrityHash = NULL` on redaction to explicitly signal "this row is no longer content-hash-verifiable; chain-link only". Walkers treat NULL as a known-unverifiable hop.

**Recommendation: (a).** Simplest, honest to the physics of redaction.

### OQ #2 — `idempotencyKey` and `provenance` PII classification

Both are plausibly non-PII in the common case but could contain PII-adjacent content. The diff plan redacts both to be safe. Is that aggressive enough or too aggressive? Specifically: losing `provenance` means post-deletion verifiability of source-URL attribution is gone. Acceptable?

**Recommendation: redact both.** Priority is erasure certainty; downstream observers can re-derive provenance from capability metadata if needed.

### OQ #3 — Quality-capture race: ship B3 or defer?

Plan section 4 option (b) adds ~15 lines of raw SQL to `quality-capture.ts`. Small but non-trivial. Race impact is small. Ship now or ticket for later?

**Recommendation: defer.** SA.2a.3b is already a medium-size prompt. Track B3 as a follow-up in Notion.

### OQ #4 — Post-deletion retention shorter window?

SA.2a.3a-raised: should user-DELETEd rows hard-delete faster than the 3-year compliance window? Many GDPR-aligned systems hard-delete 30 days after soft-delete. Not in 2a.3b scope, but worth a product decision before SA.2a closes.

**Recommendation: ticket separately.** 2a.3b ships the soft-delete + hard-delete-after-3-years pipeline; a shorter user-deleted-row window is a follow-up.

### OQ #5 — `423 Locked` vs alternative status for `legal_hold`

The diff plan uses `423 Locked` because it semantically fits ("resource is locked by another party"). Some codebases use `403 Forbidden` for the same case. Either is defensible; `423` is more precise.

**Recommendation: 423.** Low stakes; chat can flip to 403 without materially affecting clients.

### OQ #6 — Response shape on success

The diff plan returns `{id, deleted_at, redacted_at, deletion_reason}`. Some APIs return `204 No Content` for DELETE (no body). The `200 + body` shape here echoes back the state change so audit-replay is possible without a subsequent lookup (which would 404).

**Recommendation: keep `200 + body`.** Matches the value of a hash-chained audit trail.

---

## Verification checklist

- [x] 5 sub-reports populated with concrete file:line references.
- [x] PII enumeration covers every column on `transactions` (schema.ts:174-232). No "omitted for brevity".
- [x] 7 plan sections produced (6 primary + open questions).
- [x] Open questions section populated (6 items).
- [x] Report written to `audit-reports/SA_2a_3a_audit.md` as untracked.
- [x] No files modified in `apps/api/src/`.
- [x] `git status` shows new report file plus pre-existing root-level dirty state.

---

*End of SA.2a.3a audit. Ready for chat review before SA.2a.3b implementation.*
