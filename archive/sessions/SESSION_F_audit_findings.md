# Session F — Audit Functionality Findings

**Scope:** read-only audit of Strale's runtime audit-trail surfaces.
**Date:** 2026-04-20
**HEAD at audit time:** `07055ab` (+2 capability deactivations past the expected `38e0f87`; neither touches audit code).
**No commits produced. No code changes made.**

Files reviewed:
- [apps/api/src/routes/do.ts](apps/api/src/routes/do.ts) — `buildFullAudit`, `buildFailureAudit`, `buildFreeTierAudit`, column-write sites for `data_jurisdiction`, fire-and-forget audit-trail UPDATE
- [apps/api/src/lib/audit-token.ts](apps/api/src/lib/audit-token.ts) — HMAC issue/verify, legacy sunset, `getShareableUrl`
- [apps/api/src/routes/audit.ts](apps/api/src/routes/audit.ts) — `GET /v1/audit/:transactionId`
- [apps/api/src/routes/verify.ts](apps/api/src/routes/verify.ts) — public `GET /v1/verify/:id` (F-A-012)
- [apps/api/src/routes/transactions.ts](apps/api/src/routes/transactions.ts) — GET `/:id`, `/:id/verify`, POST `/:id/audit-token`, DELETE `/:id`
- [apps/api/src/lib/integrity-hash.ts](apps/api/src/lib/integrity-hash.ts) — `computeIntegrityHash`, `GENESIS_HASH`, `getPreviousHash`
- [apps/api/src/lib/provenance-builder.ts](apps/api/src/lib/provenance-builder.ts) — `RichProvenance`, `getProcessingJurisdictions`
- [apps/api/src/jobs/integrity-hash-retry.ts](apps/api/src/jobs/integrity-hash-retry.ts) — async hash worker

---

## 1. Behaviour area: Audit trail construction (`buildFull` / `buildFailure` / `buildFreeTier`)

### F-AUDIT-01 (high) — `data_jurisdiction` in audit-trail JSONB is hardcoded "EU" for success, computed for failure
[do.ts:2173](apps/api/src/routes/do.ts#L2173), [do.ts:2107](apps/api/src/routes/do.ts#L2107), [do.ts:2246](apps/api/src/routes/do.ts#L2246)

- `buildFullAudit` and `buildFreeTierAudit` hardcode `data_jurisdiction: "EU"`.
- `buildFailureAudit` uses `getProcessingJurisdictions(capability.capabilityType, capability.transparencyTag).join(",")`.
- The `transactions.data_jurisdiction` column itself is *always* the computed value ([do.ts:1116](apps/api/src/routes/do.ts#L1116), [do.ts:1324](apps/api/src/routes/do.ts#L1324), [do.ts:1538](apps/api/src/routes/do.ts#L1538), [do.ts:1860](apps/api/src/routes/do.ts#L1860)).

**Effect:** For an ai_generated capability, the stored column correctly says `"EU,US"` (Anthropic API), but the audit-trail JSONB body tells the customer `"EU"`. The compliance record and the column diverge for every successful AI-involved call. Hash integrity is preserved (hash uses column, not body), but the truthfulness of the shared audit record is compromised.

### F-AUDIT-02 (high) — `processing_location` hardcoded to "eu-west (Railway EU)" in all three builders
[do.ts:2108](apps/api/src/routes/do.ts#L2108), [do.ts:2174](apps/api/src/routes/do.ts#L2174), [do.ts:2247](apps/api/src/routes/do.ts#L2247)

Per project memory, Railway is deployed in **US East** (project `desirable-serenity`). The audit trail claims the processing location is EU. This is a factual falsehood in a record that is explicitly sold as satisfying EU AI Act Art. 12 and GDPR Art. 30. A regulator cross-checking the manifest against the platform's own `/v1/verify` response would catch the discrepancy. (The column-level `data_jurisdiction` correctly includes "US" for AI paths, but `processing_location` in the composed audit body never does.)

### F-AUDIT-03 (low) — Failure audit lacks `shareable_url`
[do.ts:2253-2258](apps/api/src/routes/do.ts#L2253-L2258)

`buildFailureAudit` emits a minimal `compliance` block — no `shareable_url`, `human_oversight`, `data_retention_days`, GDPR Art. 15/17 mapping, or `regulations_addressed.eu_ai_act.article_13/50`. Failed executions therefore cannot be shared as compliance records even though EU AI Act Art. 12 requires their logging. Caller has no URL to hand a DPO.

---

## 2. Behaviour area: Audit-token lifecycle

### F-AUDIT-04 (medium) — `AUDIT_SECRET` resolved at import, not per-request
[audit-token.ts:37](apps/api/src/lib/audit-token.ts#L37)

Both primary and previous secrets are frozen at module load. A rotation that changes `AUDIT_HMAC_SECRET` without a redeploy has no effect. Railway always restarts on deploy, so this is a latent footgun rather than a live bug — but `docs/operations/hmac-rotation.md` (referenced at [audit-token.ts:25](apps/api/src/lib/audit-token.ts#L25)) should explicitly state the restart requirement, and the primary/previous swap should be validated against a restart in the rotation runbook.

### F-AUDIT-05 (low) — Legacy sunset hardcoded as `Date.UTC(2026, 9, 17)`
[audit-token.ts:53](apps/api/src/lib/audit-token.ts#L53)

Sunset timestamp is a compile-time constant. Extending or bringing forward the sunset requires a code change. No env override. Fine for now; flag when sunset approaches.

### F-AUDIT-06 (low) — `getShareableUrl` host is hardcoded to `https://strale.dev`
[audit-token.ts:201](apps/api/src/lib/audit-token.ts#L201)

Staging / preview deployments that hand a token out still point customers at prod. If audit verification is ever tested against a staging DB, links break silently.

---

## 3. Behaviour area: Audit URL construction

### F-AUDIT-07 (low) — Two incompatible `audit_url` fields in API responses
- [audit.ts:163](apps/api/src/routes/audit.ts#L163) composes `audit_url: strale.dev/audit/${transactionId}` (tokenless, intended as a reference path).
- [do.ts:2195-2196](apps/api/src/routes/do.ts#L2195-L2196) returns `compliance.shareable_url` with token + `expires_at`.

Distinct purposes but identical field-name root. A client that stores `audit.audit_url` and tries to load it gets 401 (no token). Recommend renaming the bare path to `audit_path` or documenting explicitly.

---

## 4. Behaviour area: `GET /v1/audit/:transactionId`

### F-AUDIT-08 (high) — Composed audit record does not return the stored `audit_trail`
[audit.ts:102-166](apps/api/src/routes/audit.ts#L102-L166)

`composeAuditRecord` rebuilds the response from `ComplianceProfile` + transaction metadata. It never reads `transactions.audit_trail` — the JSONB that was captured at execution time and is covered by the integrity hash. This means:

1. A caller who fetches `/v1/audit/:id` sees a *derived* compliance profile, while `/v1/transactions/:id` returns the *stored* one. Two separate representations of "the audit record."
2. If the stored audit_trail ever drifts from what the compliance profile would produce today (e.g. capability metadata changes), `/v1/audit/:id` silently serves the new shape. The stored snapshot is inaccessible through this endpoint.

This is particularly relevant given F-AUDIT-01/02: both representations carry different errors.

### F-AUDIT-09 (low) — Per-step latency is an even division
[audit.ts:117-119](apps/api/src/routes/audit.ts#L117-L119)

`perStepMs = floor(latencyMs / total_steps)` is an approximation. The response doesn't flag it. Callers plotting step latencies could report artefactual uniformity.

### F-AUDIT-10 (medium) — `complianceHashState === 'complete'` does not imply `audit_trail` is the final value
[audit.ts:241-261](apps/api/src/routes/audit.ts#L241-L261), [do.ts:1729-1736](apps/api/src/routes/do.ts#L1729-L1736), [integrity-hash-retry.ts:70-80](apps/api/src/jobs/integrity-hash-retry.ts#L70-L80)

The audit-trail UPDATE is fire-and-forget. The retry worker waits `GRACE_MS = 10_000` ms before picking up a pending row. Typical UPDATE latency (~10-500 ms) is safely under that, but there is no explicit barrier. If the UPDATE is delayed past 10 s (DB pressure, restart between INSERT and UPDATE), the worker hashes with `audit_trail = null`. The hash then "locks in" null. If the audit-trail UPDATE lands *after* the hash is sealed, the stored `audit_trail` JSONB mutates post-hash — future verification fails because `computeIntegrityHash` re-reads the mutated column.

Recommendation: either (a) write audit_trail in the same transaction as the row insert, or (b) have the worker skip rows whose `audit_trail IS NULL` unless the row is older than the stale threshold, then log loudly.

---

## 5. Behaviour area: Integrity hash chain

### F-AUDIT-11 (high) — Genesis-hash default differs between two verify endpoints
- [verify.ts:73](apps/api/src/routes/verify.ts#L73): `txn.previousHash ?? GENESIS_HASH`
- [transactions.ts:255](apps/api/src/routes/transactions.ts#L255): `txn.previousHash ?? ""`
- [transactions.ts:263](apps/api/src/routes/transactions.ts#L263): same `?? ""` in chain walk

The worker chains from `GENESIS_HASH` (see [integrity-hash.ts:85](apps/api/src/lib/integrity-hash.ts#L85) and [integrity-hash-retry.ts:100](apps/api/src/jobs/integrity-hash-retry.ts#L100)). The auth-gated endpoint's empty-string default cannot reproduce the worker's hash for any row where `previousHash` is null (expected: the very first row ever written, and any row whose insert lost chain state). Public `/v1/verify` passes; authenticated `/v1/transactions/:id/verify` fails. The two endpoints report different truths about the same row.

### F-AUDIT-12 (medium) — `computeIntegrityHash` is sensitive to date-serialization shape
[integrity-hash.ts:61-62](apps/api/src/lib/integrity-hash.ts#L61-L62)

Only `Date` instances are normalized to ISO 8601. If `createdAt` arrives as a string (direct JSONB parse, cached row, some Drizzle edge) the raw string is kept. `"2026-04-20T12:00:00Z"` and `"2026-04-20T12:00:00.000Z"` hash differently. Defensive fix: always coerce via `new Date(x).toISOString()`.

### F-AUDIT-13 (info) — Soft-delete permanently breaks per-row verification
[transactions.ts:337-350](apps/api/src/routes/transactions.ts#L337-L350)

DELETE sets `auditTrail`, `provenance`, `input`, `output`, `error`, `idempotencyKey` to null. `integrity_hash`/`previous_hash` are preserved, so the chain link is intact, but the row's own hash cannot be recomputed. [transactions.ts:297](apps/api/src/routes/transactions.ts#L297) acknowledges this explicitly. **Flag:** the public `/v1/verify/:id` endpoint currently does not filter `deletedAt IS NOT NULL` in its chain walk ([verify.ts:158-162](apps/api/src/routes/verify.ts#L158-L162)). A GDPR-deleted predecessor will be reported as a broken link (`broken_links += 1`, `first_broken_link_id` set). Users exercising their right to erasure make Strale's chain look tampered-with.

### F-AUDIT-14 (low) — `getPreviousHash()` appears to be a dead export
[integrity-hash.ts:72-89](apps/api/src/lib/integrity-hash.ts#L72-L89)

The retry worker reads the chain tip once via `getPreviousHash()` at batch start ([integrity-hash-retry.ts:100](apps/api/src/jobs/integrity-hash-retry.ts#L100)), then threads `currentPrevious` manually — explicitly to avoid pool-visibility bugs. No other callers found. Not urgent; verify before removing.

---

## 6. Behaviour area: Verify endpoints

### F-AUDIT-15 (high) — Two verify endpoints with divergent hardening
- `/v1/verify/:id` — F-A-012 hardened: `rateLimitByIp(10, 60_000)`, `MAX_DEPTH = 50`, `truncated` flag, GENESIS_HASH default, `methodology_url`.
- `/v1/transactions/:id/verify` — `rateLimitByKey(10, 1000)` (key-based, **unauthenticated callers share one bucket**), chain depth hardcoded to 10, empty-string genesis default, no `truncated`.

**Issue:** the auth endpoint is not marked deprecated, still mounted, and `rateLimitByKey` on an `optionalAuthMiddleware` route means an attacker hitting the endpoint without an API key shares a single rate-limit bucket with all other anonymous callers — the F-A-012 protection (per-IP 10/min cap) can be sidestepped by switching endpoints. Recommend consolidating to one verify surface, or gate the auth endpoint behind strict `authMiddleware`.

### F-AUDIT-16 (medium) — Deleted rows are chain-walked as broken links
See F-AUDIT-13 above. `walkChain` at [verify.ts:136-215](apps/api/src/routes/verify.ts#L136-L215) does not consult `deletedAt`. A public chain verify crossing a GDPR-deleted predecessor reports `broken_links >= 1` with no explanation that the break is legitimate. Add a `redacted_links` counter and subtract those from `broken_links`, or return a distinguishing field.

---

## 7. Behaviour area: Compliance block / `RichProvenance`

### F-AUDIT-17 (low) — `RichProvenance` is compile-time only
[provenance-builder.ts:12-38](apps/api/src/lib/provenance-builder.ts#L12-L38)

Interface has open index signature (`[key: string]: unknown`) and is never enforced at runtime. Capability executors return whatever they want under `provenance`. The module docstring cites EU AI Act Art. 12 and ISO/IEC 24970 as satisfied, but there is no schema validation at the boundary. A single capability regression (e.g. returning `provenance: null`) silently produces a compliance-grade record with no provenance.

### F-AUDIT-18 (info) — `getProcessingJurisdictions` is the authority, but heuristic
[provenance-builder.ts:58-71](apps/api/src/lib/provenance-builder.ts#L58-L71)

Adds `"US"` only for `ai_assisted` capabilityType or `ai_generated`/`mixed` transparencyTag. A capability that calls a US-hosted third-party API but is classified `algorithmic` returns `["EU"]` falsely. Not audit-wrong per se, but jurisdictions should be manifest-declared (alongside `data_source` / `transparency_tag`) rather than inferred.

---

## Cross-cutting observations

1. **Stored vs. derived audit record.** The system keeps two parallel representations (column `audit_trail` JSONB vs. composed `/v1/audit/:id` response). The hash is over the stored one; the UI-facing `/v1/audit/:id` returns the derived one. Any investigation into "why does my audit say X?" must know which surface the customer hit.
2. **Hardcoded-string truthfulness gap.** `"EU"`, `"eu-west (Railway EU)"`, `"autonomous"`, `"Automated execution with schema validation..."` — all appear in audit bodies as literal strings. They do not react to actual processing state. This is the class that produces F-AUDIT-01, F-AUDIT-02.
3. **Asynchronous hash sealing creates a narrow but real mutation window.** The combination of (a) fire-and-forget audit-trail UPDATE, (b) 10 s worker grace, (c) hash over `auditTrail` column means "row was hashed" and "row's audit trail is final" are not equivalent states. See F-AUDIT-10.
4. **Verify-endpoint duplication.** Two publicly reachable verify surfaces with drifted hardening. Consolidating to the F-A-012 implementation eliminates four findings (F-AUDIT-11, F-AUDIT-15, F-AUDIT-16 partly).
5. **Deletion vs. integrity are on a collision course.** GDPR Art. 17 soft-delete is by design destructive to per-row hash verifiability; the public chain walk does not distinguish deletion from tampering. Either (a) add a `redacted` flag in the verify response's broken-link counter, or (b) pre-compute and persist a redaction-aware hash over a stable subset.

---

## DEC review inventory (status at audit time)

Searched for references to DEC-20260420-C/D/E/F/G across the repo — found only in:
- [apps/api/src/lib/onboarding-gates-enums.test.ts](apps/api/src/lib/onboarding-gates-enums.test.ts) (passing mention)
- [handoff/_general/from-code/2026-04-20-sa2bd-session-a-closure.md](handoff/_general/from-code/2026-04-20-sa2bd-session-a-closure.md)

None of these land in the audit source surfaces reviewed here. The named DECs therefore either:
- live in Notion only and are not yet reflected in code, or
- apply to adjacent surfaces (onboarding / SA.2b.d) and don't touch audit behaviour.

The "retention fix" is visible in code: `TRANSACTION_RETENTION_DAYS` is emitted into the audit body at [do.ts:2192](apps/api/src/routes/do.ts#L2192) but the constant's source definition was not part of this read. No findings raised against it in this audit.

Recommend a follow-up session to map DEC-20260420-C/D/E/F/G to their intended code surfaces and confirm whether the audit review needs to re-open.

---

## Out of scope

- No performance / throughput analysis of the hash retry worker.
- No analysis of `compliance-profile.ts` internals — only its return shape as consumed by `audit.ts`.
- No review of `test_suites`, `test_runs`, or SQS scoring paths.
- No review of the x402 audit path (distinct surface; separate DEC).
- Did not execute any endpoint; all findings are static code reads.
