# SQS Surfaces Audit — pre-deletion

**Date:** 2026-05-05
**Authority:** DEC-20260503-B (Notion `33c67c87082c81c5bd9fe6d6e330934a`)
**To-do:** `35567c87082c81ecb105ddd4102d9186` (NOT marked complete by this audit — deletion phase still pending)
**Read-only.** No code changes.

---

## Stop conditions encountered

Two stop conditions per the prompt's criteria are flagged for explicit acknowledgement before the deletion phase begins. Neither blocks audit completion, but both materially shape sequencing.

1. **Surface count exceeds the ~25-file informal threshold.** Production code touching SQS surfaces totals **~62 files** (`apps/api/src/**`, `apps/api/drizzle/**`, `apps/api/scripts/**`, `packages/**`). The deletion will need to be sequenced — see "Deletion sequencing" at the end of this audit. The deletion is feasible as a single PR but the PR will be large; consider splitting in two waves (engine + read-paths first, naming/rename of survivors second).
2. **High-call-site columns.** `capabilities.matrixSqs` is read in **20+** files across routes, jobs, lib helpers, and the daily-digest pipeline. `qpScore` / `rpScore` are read in **8+** files. These cannot be dropped via straight `DROP COLUMN`; the deletion must remove all readers first, then drop. The migration is straightforward but the call-site removal is the bulk of the work.

Stop conditions **NOT** triggered:
- ✅ No pre-existing `source_health` substrate. Grep returns zero hits — substrate will be created via rename of `capability_health` + per-vendor extensions during the deletion phase, exactly as DEC-20260503-B assumes.
- ✅ No surviving routing engine references SQS. `apps/api/src/counterparty-assurance/` does not exist; the only `web3-assurance/source-quality.ts` (which the prompt categorises as a per-product engine candidate) **does** reference SQS in a doc comment, but does not import from `sqs.ts` (see section h).

---

## (a) The engine itself

Files implementing the QP / RP / 5×5 matrix / dual-profile machinery. Delete in full.

| File | Lines | Primary exports / role |
|---|---|---|
| [`apps/api/src/lib/sqs.ts`](apps/api/src/lib/sqs.ts) | 738 | `computeCapabilitySQS`, `computeDualProfileSQS`, `estimateQualificationTime`, `EXTERNAL_SERVICE_PATTERNS`, `isExternalServiceFailure`, `computeFromRows`, `computeTrend`, `aggregateFactor`, `makePendingResult`, `makeBuildingTrackRecordResult`, `makeUnverifiedResult`, type `SQSResult`, type `DualProfileSQSResult`, in-process caches `sqsCache` and `dualCache`. Both legacy 5-factor and current dual-profile paths live here. |
| [`apps/api/src/lib/quality-profile.ts`](apps/api/src/lib/quality-profile.ts) | 321 | `computeQualityProfile`, type `QPResult`, `QP_WEIGHTS`, `TYPE_TO_QP_FACTOR`, `EXTERNAL_SERVICE_PATTERNS` (duplicated from sqs.ts), `scoreToGrade`, `makePendingQP`, `computeQPFromRows`. |
| [`apps/api/src/lib/reliability-profile.ts`](apps/api/src/lib/reliability-profile.ts) | 494 | `computeReliabilityProfile`, types `RPResult` / `RPFactor` / `RPContext` / `CapabilityType`, `RP_WEIGHTS` (per-type), 4-factor scoring (`current_availability`, `rolling_success`, `upstream_health`, `latency`), circuit-breaker penalties. |
| [`apps/api/src/lib/sqs-matrix.ts`](apps/api/src/lib/sqs-matrix.ts) | 128 | `computeMatrixSQS`, `getMatrix`, type `MatrixSQSResult`, the 5×5 lookup table, `gradePosition` interpolation. |
| [`apps/api/src/lib/sqs-constants.ts`](apps/api/src/lib/sqs-constants.ts) | 10 | `MIN_RUNS = 5`, `ROLLING_RUNS = 10`, `RECENCY_WEIGHTS` linear-decay array. |
| [`apps/api/src/lib/sqs-snapshots.ts`](apps/api/src/lib/sqs-snapshots.ts) | 78 | `captureDailySnapshots` — daily idempotent persist into `sqs_daily_snapshot` table. |
| [`apps/api/src/lib/freshness-decay.ts`](apps/api/src/lib/freshness-decay.ts) | (large) | Freshness decay applied to matrix_sqs — used by both test-runner persist path and the staleness refresh job. **Whole-file delete unless freshness logic is preserved for a future per-vendor health surface; recommend deleting and re-introducing if needed.** |
| [`apps/api/src/db/verify-dual-profile.ts`](apps/api/src/db/verify-dual-profile.ts) | (script-shaped) | Diagnostic that compares legacy_score vs matrix.score across active capabilities — pure SQS regression analysis tool. Delete. |

Cross-cutting type re-exports from sqs.ts: `QPResult`, `RPResult`, `MatrixSQSResult` re-exported via line 714 — all consumers will need their imports rewritten.

---

## (b) DB schema fields tied to SQS

Source: [`apps/api/src/db/schema.ts`](apps/api/src/db/schema.ts).

### `capabilities` table (lines 135–155)
| Column | Type | Used-by file count | Top callsites |
|---|---|---|---|
| `qpScore` / `qp_score` | `decimal(5,2)` | 8+ | [`routes/internal-trust.ts`](apps/api/src/routes/internal-trust.ts), [`routes/internal-quality.ts`](apps/api/src/routes/internal-quality.ts), [`routes/transactions.ts`](apps/api/src/routes/transactions.ts), [`routes/audit.ts`](apps/api/src/routes/audit.ts), [`routes/capabilities.ts`](apps/api/src/routes/capabilities.ts), [`routes/solutions.ts`](apps/api/src/routes/solutions.ts), [`lib/test-runner.ts`](apps/api/src/lib/test-runner.ts), [`routes/admin.ts`](apps/api/src/routes/admin.ts) |
| `rpScore` / `rp_score` | `decimal(5,2)` | 8+ | same as above |
| `matrixSqs` / `matrix_sqs` | `decimal(5,2)` | 20+ | [`routes/do.ts`](apps/api/src/routes/do.ts) (gate), [`routes/quality.ts`](apps/api/src/routes/quality.ts), [`routes/internal-trust.ts`](apps/api/src/routes/internal-trust.ts), [`routes/audit.ts`](apps/api/src/routes/audit.ts), [`routes/capabilities.ts`](apps/api/src/routes/capabilities.ts), [`routes/solutions.ts`](apps/api/src/routes/solutions.ts), [`routes/transactions.ts`](apps/api/src/routes/transactions.ts), [`routes/a2a.ts`](apps/api/src/routes/a2a.ts), [`routes/x402-gateway-v2.ts`](apps/api/src/routes/x402-gateway-v2.ts), [`lib/x402-gateway.ts`](apps/api/src/lib/x402-gateway.ts), [`lib/suggest.ts`](apps/api/src/lib/suggest.ts), [`lib/matching.ts`](apps/api/src/lib/matching.ts), [`lib/digest-compiler.ts`](apps/api/src/lib/digest-compiler.ts), [`lib/execution-guidance.ts`](apps/api/src/lib/execution-guidance.ts), [`lib/meta-monitoring.ts`](apps/api/src/lib/meta-monitoring.ts), [`jobs/test-scheduler.ts`](apps/api/src/jobs/test-scheduler.ts), [`jobs/refresh-stale-scores.ts`](apps/api/src/jobs/refresh-stale-scores.ts), [`jobs/invariant-checker.ts`](apps/api/src/jobs/invariant-checker.ts), [`db/seed-solutions.ts`](apps/api/src/db/seed-solutions.ts), [`scripts/smoke-test.ts`](apps/api/scripts/smoke-test.ts) |
| `matrixSqsRaw` / `matrix_sqs_raw` | `decimal(5,1)` | 4+ | [`routes/quality.ts`](apps/api/src/routes/quality.ts), [`routes/capabilities.ts`](apps/api/src/routes/capabilities.ts), [`routes/internal-trust.ts`](apps/api/src/routes/internal-trust.ts), [`jobs/refresh-stale-scores.ts`](apps/api/src/jobs/refresh-stale-scores.ts) |
| `trend` | `varchar(20)` default `"stable"` | 4+ | [`routes/quality.ts`](apps/api/src/routes/quality.ts), [`routes/capabilities.ts`](apps/api/src/routes/capabilities.ts), [`routes/solutions.ts`](apps/api/src/routes/solutions.ts), [`jobs/refresh-stale-scores.ts`](apps/api/src/jobs/refresh-stale-scores.ts) |
| `freshnessLevel` / `freshness_level` | `varchar(20)` | 3+ | shared with quality endpoints — **survives** as part of `source_health` |

### `sqs_daily_snapshot` table (lines 673–703)
Whole-table drop. Schema: `capabilitySlug`, `snapshotDate`, `matrixSqs`, `qpScore`, `rpScore`, `qpGrade`, `rpGrade`, `trend`, `healthState`, `runsAnalyzed`. Two indexes (slug+date unique, slug+date desc).

Used by: [`lib/sqs-snapshots.ts`](apps/api/src/lib/sqs-snapshots.ts), [`lib/data-retention.ts`](apps/api/src/lib/data-retention.ts) (365-day retention), [`lib/daily-digest/fetch-platform.ts`](apps/api/src/lib/daily-digest/fetch-platform.ts) (digest reads grade-change history), [`routes/internal-trust.ts`](apps/api/src/routes/internal-trust.ts) (412 — historical chart).

### Migrations introducing these
- [`drizzle/0019_dual_profile.sql`](apps/api/drizzle/0019_dual_profile.sql) — adds `qp_score`, `rp_score`, `matrix_sqs`, `capability_type`, fallback metadata
- [`drizzle/0028_sqs_daily_snapshot.sql`](apps/api/drizzle/0028_sqs_daily_snapshot.sql) — creates the snapshot table
- [`drizzle/0032_trust_metadata_columns.sql`](apps/api/drizzle/0032_trust_metadata_columns.sql) — adds `matrix_sqs_raw`, `trend`, `freshness_level`, `last_tested_at`, `freshness_decayed_at`, `guidance_*`
- [`drizzle/0018_adaptive_test_intelligence.sql`](apps/api/drizzle/0018_adaptive_test_intelligence.sql) — references SQS in commentary; introduces `test_status`, `failure_classification`. **Survives** as substrate for `source_health` post-rename.
- [`drizzle/meta/0060_snapshot.json`](apps/api/drizzle/meta/0060_snapshot.json) and [`drizzle/meta/_journal.json`](apps/api/drizzle/meta/_journal.json) — drizzle journal will need a new migration appended that drops the columns and tables, not a backwards edit.
- [`apps/api/src/lib/startup-migrations.ts`](apps/api/src/lib/startup-migrations.ts) — block 1 (`runMigration0028_sqsDailySnapshot`, lines 61–115) creates the snapshot table at startup. Block + invocation at line 403 must be removed.

---

## (c) Public HTTP surfaces

| Endpoint | Definition | Notes |
|---|---|---|
| `GET /v1/quality/:slug` | [`apps/api/src/routes/quality.ts`](apps/api/src/routes/quality.ts) (whole file, 151 lines) | Returns `sqs.{score,raw_score,label,trend,freshness_level}`, `quality_profile`, `reliability_profile`, `runs_analyzed`, `qualification_estimate`. **Whole-file delete.** Mounted in `app.ts` — also remove the route registration. |
| `POST /v1/do` `min_sqs` parameter | [`apps/api/src/routes/do.ts:505–508, 872–881, 936`](apps/api/src/routes/do.ts) | Body parsing, gate check (returns `below_quality_threshold` with 422), and `DO_BODY_KEYS` set entry. The PLATFORM_FLOOR_SQS gate at lines 848–870 ALSO deletes (calls `computeDualProfileSQS`). |
| `POST /v1/do` `quality_warning` response field | [`apps/api/src/routes/do.ts:258–260`](apps/api/src/routes/do.ts) (in `buildDualProfileResponse`) | Wrapped in lifecycle-degraded check. The whole `buildDualProfileResponse` helper (lines 254–310-ish, the full block including `dual` parameter) is SQS-shaped and is deleted. |
| `POST /v1/do` SQS-bearing response fields | [`apps/api/src/routes/do.ts:255 (DualProfileSQSResult import)`, multiple sites in response shaping] | Every response that includes `quality.{sqs,quality_profile,reliability_profile,trend}` needs the keys removed; `min_sqs` and `quality_warning` keys disappear from the public schema. |
| OpenAPI declarations | [`apps/api/src/openapi.ts:71–73, 98–99, 119, 153, 184, 220, 303, 745–756`](apps/api/src/openapi.ts) | `min_sqs` request param, `sqs`/`sqs_label`/`sqs_raw` response fields, `/v1/quality/:slug` operation, error code `capability_unavailable` text. All references must come out. |
| `GET /v1/internal/quality/capabilities/:slug` and `.../solutions/:slug` | [`apps/api/src/routes/internal-quality.ts`](apps/api/src/routes/internal-quality.ts) (131 lines) | Internal admin endpoints. Whole-file delete; remove route mount in `app.ts`. |
| `GET /v1/internal/trust/...` (multiple) | [`apps/api/src/routes/internal-trust.ts`](apps/api/src/routes/internal-trust.ts) (1068 lines) | Imports `computeDualProfileSQS` (line 29), reads `matrixSqs`/`qpScore`/`rpScore`/`matrixSqsRaw` extensively, calls `gradeFromScore`. **Likely whole-file delete** but see "Survives, renamed" — some endpoints (per-capability test history, dispute counters, last-tested-at exposure) are useful as `source_health` once SQS shape is removed. The deletion phase needs to decide endpoint-by-endpoint. Conservative recommendation: delete the full file in the deletion PR; re-introduce a new `routes/source-health.ts` afterward if/when the consumers are identified. |

### Public endpoint response fields (every endpoint that returns SQS-derived values)
| Endpoint | File | Fields removed |
|---|---|---|
| `POST /v1/do` (response) | `routes/do.ts` | `quality.{sqs, quality_profile, reliability_profile, trend}`, `quality_warning`, `min_sqs` echo |
| `GET /v1/capabilities` | `routes/capabilities.ts` | `sqs`, `sqs_raw`, `sqs_label`, `quality`, `reliability` (lines 32–76) |
| `GET /v1/solutions` | `routes/solutions.ts` | `sqs`, `sqs_label`, step-level `quality`/`reliability` (lines 47–113) |
| `GET /v1/audit/:transaction_id` | `routes/audit.ts` | `quality.{sqs,label,pass_rate}` per row, `qualityFromDb` block (lines 549–595) |
| `GET /v1/transactions` | `routes/transactions.ts` | `quality.{sqs, sqs_label}` per transaction (lines 91–158) |
| `GET /a2a` agent-card and `POST /a2a` | `routes/a2a.ts` | SQS in capability descriptions and response metadata (lines 95–135, 458–495) |
| `GET /x402/...` and catalog | `routes/x402-gateway-v2.ts` and `lib/x402-gateway.ts` | `matrixSqs` reads, SQS string in capability description |
| `GET /v1/suggest` | `lib/suggest.ts` | `sqs`, `sqs_label` on items and solutions (lines 25–26, 354–428, 498–621) |

---

## (d) Frontend / public-facing references

The frontend repo `strale-frontend` is **not opened by this audit** per the prompt. Expected references (to be confirmed by a follow-up frontend-side audit):

| Surface | Expected location | Notes |
|---|---|---|
| `strale.dev/trust` page | `strale-frontend/src/app/trust/...` or `pages/trust/...` | Renders QP/RP/matrix explanation. Per DEC-20260503-B, the page comes down. |
| Capability card SQS / A-F grade rendering | `strale-frontend/src/components/CapabilityCard.tsx` (or similar) | Reads `sqs`, `sqs_label`, `quality`, `reliability` from `GET /v1/capabilities` — fields disappearing from the API mean the consumer must update first or render without them. |
| Capability detail trust panel | per-capability detail page | Reads QP/RP factors, matrix breakdown, history charts. Removed entirely. |
| Solution card SQS rendering | `strale-frontend/src/components/SolutionCard.tsx` | Reads `sqs`/`sqs_label` from `GET /v1/solutions`. |
| `usePlatformFacts()` hook | `strale-frontend/src/hooks/use-platform-facts.ts` | Confirm whether SQS/quality counts flow through this hook. |
| `compliance-types.ts AuditRecord` interface | `strale-frontend/src/lib/compliance-types.ts` | Currently mirrors `AuditRecord` from `routes/audit.ts` which exposes `quality.{sqs,label,pass_rate}`. CI shape-check will fire when backend fields are removed. |
| API contract test fixture | `strale-frontend/src/lib/__fixtures__/` | Contract test against `/v1/public/ops/trust/*` — re-capture the fixture during deletion. |

Static frontend files in `strale-frontend/public/` likely reference SQS:
- `public/llms.txt` — describes SQS scoring; needs rewrite
- `public/.well-known/x402.json` — per-capability descriptions may include SQS
- `public/sitemap.xml` — `/trust` and per-capability routes

The frontend follow-up audit must list each of these explicitly before the deletion PR merges. **The backend deletion can ship before the frontend updates only if the response-field changes are coordinated as a versioned API change** — otherwise the frontend will break the moment the field disappears.

---

## (e) Test scheduling

[`apps/api/src/jobs/test-scheduler.ts`](apps/api/src/jobs/test-scheduler.ts) — **already partially aligned with the new model.** Per the comment at lines 8–15, the per-tier (A/B/C) cadence has already been replaced by hourly free-only stagger as DEC-20260503-B requires. The `schedule_tier` column is still on `test_suites` for backwards compatibility but no longer driven by the scheduler. Free-only filtering uses `test_suites.external_cost_cents = 0`.

Still scheduled by the file (auxiliary tasks):
- `captureDailySnapshots` from `lib/sqs-snapshots.ts` — line 424–429. **Delete this block.**
- Health checks, weekly sweeps, retention, staleness refresh — these survive but several drive SQS-decay updates that disappear:
  - `lib/test-runner.ts` `persistDualProfileScores` (called from line 33 import + 1932/1939) — **delete this function.** Test results still need to write something — the deletion phase must decide what (likely just `last_tested_at` and pass/fail counts on the new `source_health` substrate).
  - `jobs/refresh-stale-scores.ts` (117 lines) — re-decays `matrix_sqs` for capabilities that haven't been tested. **Delete the whole file** or replace with a `source_health.last_canary_tested_at` ageing job if a future product needs it.

`test-runner.ts` also calls `computeDualProfileSQS` at line 1438 inside `computeAdaptiveInterval`, used to trip "intensified testing" when SQS < 50. The new model has no SQS; this whole interval-adaptation block (1426–1462) needs to come out. The replacement (per DEC-20260503-B): "all free hourly hash-spread, all paid no schedule." That's already implemented — `computeAdaptiveInterval` is dead code today and should be deleted along with the SQS engine.

`solutions.is_active` auto-gate in `test-scheduler.ts:44–80` currently keys on `matrixSqs > 0` — deletion phase needs a replacement signal (e.g., "all step capabilities have at least one passing test_result") if the auto-gate stays.

---

## (f) Capability onboarding pipeline

Files: [`apps/api/scripts/onboard.ts`](apps/api/scripts/onboard.ts), [`apps/api/scripts/validate-capability.ts`](apps/api/scripts/validate-capability.ts), [`apps/api/scripts/smoke-test.ts`](apps/api/scripts/smoke-test.ts).

**Result:** the onboarding pipeline does **not** compute SQS directly. It writes test_suites, test_fixtures, capability rows; does not write `matrixSqs`/`qpScore`/`rpScore`. Those are populated post-hoc by `persistDualProfileScores` after the test runner has data.

Touch points for deletion:
- `scripts/smoke-test.ts:230–238` — Step 5 in the smoke-test checks "SQS is computed or building" against `cap.matrixSqs` and lifecycle. **Step 5 deletes** along with the column.
- `scripts/smoke-test.ts:374–383` — verifies `sqs`/`quality_profile`/`reliability_profile` in `/v1/quality` response. **Whole assertion deletes** once the endpoint goes.
- `scripts/onboard.ts` — clean (no direct SQS writes; only orphan-cleanup commentary at line 1077). No edits needed.
- `scripts/validate-capability.ts` — clean. No edits needed.

The lifecycle module ([`apps/api/src/lib/lifecycle.ts`](apps/api/src/lib/lifecycle.ts)) is **deeply** SQS-bound:
- Lines 50–53: `ACTIVE_SQS_MIN`, `DEGRADE_SQS_THRESHOLD`, `DEGRADED_SUSPEND_DAYS`, `DEGRADED_RECOVERY_RUNS` constants.
- Line 23: `import { computeDualProfileSQS } from "./sqs.js"`.
- Lines 252–398: probation→active, active→degraded, degraded→active, degraded→suspended transitions all key on SQS thresholds.

**Lifecycle requires a replacement policy.** This is the single largest design question the deletion phase must resolve before deleting `sqs.ts`. Options:
1. Rip out lifecycle's automatic state transitions entirely (the substrate stays, but only humans flip states).
2. Rewrite transitions to key on the new `source_health.status` enum (`healthy / degraded / unavailable / not_covered / unverified`).
3. Defer (mark lifecycle as "frozen at current values" temporarily until a replacement lands).

This is the most consequential downstream of the deletion. **Flag for explicit decision in the deletion-phase prompt.**

---

## (g) `source_health` substrate candidates (kept, rename target)

Per DEC-20260503-B's "what survives" list, these are the substrate components that should persist (likely renamed):

| Candidate | Current location | Notes |
|---|---|---|
| `capabilities.capabilityType` | schema.ts:136 | `deterministic / stable_api / scraping / ai_assisted` — survives; needed for routing decisions. |
| `capabilities.fallbackCapabilitySlug` / `fallbackCoverage` / `fallbackVerificationLevel` | schema.ts:138–142 | "fallback_available" substrate per DEC-20260503-B. Survives. |
| `capabilities.lastTestedAt` | schema.ts:154 | Maps to `source_health.last_canary_tested_at` or similar. Survives. |
| `capabilities.errorCodesJson` | schema.ts:143 | Survives — tells consumers what failure modes exist. |
| `capabilities.guidanceUsable` / `guidanceStrategy` / `guidanceConfidence` | schema.ts:157–160 | **Ambiguous.** Computed by `lib/execution-guidance.ts` which keys on `matrixSqs >= 25` and QP/RP grades. The substrate concept (is-this-usable, with-what-strategy) survives the rename, but the *computation* is SQS-bound and needs rewriting. Recommend: delete the columns + `execution-guidance.ts` in the same PR; re-introduce a `source_health.usable` boolean computed from the new health-status enum if needed. |
| `capabilities.maintenanceClass` | schema.ts:172 | Survives — orthogonal to scoring. |
| `capability_health` table | schema.ts:636–655 | Circuit-breaker substrate. **Direct rename target for `source_health`** per DEC-20260503-B. Columns: `state` ('closed'/'open'/'half_open'), `consecutiveFailures`, `totalFailures`, `totalSuccesses`, `lastFailureAt`, `lastSuccessAt`, `openedAt`, `nextRetryAt`, `backoffMinutes`. Per the prompt, naming is implementation detail, but this is the table the rename hinges on. |
| `test_suites.external_cost_cents` / `testMode` / `fixtureLastRefreshed` | schema.ts:528–531 | Cost substrate per DEC-20260503-B — survives. |
| `test_suites.testStatus` | schema.ts:522 | `'normal' / 'infra_limited' / 'env_dependent' / 'upstream_broken' / 'quarantined'` — directly maps onto the new `source_health.status` enum. Survives. |
| `test_results` table | schema.ts:557–586 | The substrate that drives all of the above. Survives unchanged. |
| `lib/health-state.ts` (referenced from sqs-snapshots.ts) | (not opened by this audit) | `computeHealthState()` produces a `HealthState` value used in snapshots and elsewhere. Likely survives as the centerpiece of `source_health`. **Audit recommendation: open this file during the deletion phase to confirm.** |
| `lib/upstream-health-gate.ts` | (141 lines) | Mapping cache for upstream services. Used to skip tests when upstream is down (line 9 docstring: "preventing timeout failures from polluting the SQS window"). The mechanism survives — the upstream-down skip is still useful for `source_health.status = 'unavailable'`. Reword the docstring; keep the file. |
| `lib/chromium-health.ts` | | Browserless/Chromium probe. Survives. |
| `lib/failure-classifier.ts` | | Classifies test failures into categories (line 5: "SQS excludes noise (infra/transient/stale) and counts real signal"). The classifier itself survives; the comment about SQS is updated. |

---

## (h) Per-product routing engine (existence check)

**Result: does not exist as a separate engine.**

- `apps/api/src/counterparty-assurance/routing.ts` — does not exist.
- No file matches `*counterparty*`, `*routing*`, `*payee-assurance*` under `apps/api/src/**`.
- `apps/api/src/web3-assurance/source-quality.ts` is the only file that resembles a per-product scoring engine. It mirrors SQS methodology in a doc comment (line 16: "Scoring methodology mirrors Strale's existing SQS engine") but does **not** import from `sqs.ts`. Its `web3-assurance/types.ts:88` exposes an optional `sqs?: number` field; that field is set from the parent SQS engine via the assurance composer pipeline and would need to be removed in the deletion phase. The web3-assurance subsystem itself is not part of the SQS engine and survives.

To-be-created routing engines (per the prompt) are out of scope for the deletion. The deletion does not need to replace anything routing-wise.

---

## (i) Tests touching SQS surfaces

| File | Coverage |
|---|---|
| [`apps/api/src/lib/startup-migrations.test.ts`](apps/api/src/lib/startup-migrations.test.ts) | Lines 45, 80–97, 278: `runMigration0028_sqsDailySnapshot` block tests (asserts table creation idempotency, error path). Whole describe-block deletes when the migration block is removed. |
| [`apps/api/src/routes/admin-apply-migrations.test.ts`](apps/api/src/routes/admin-apply-migrations.test.ts) | Lines 97, 130: refers to the `0028_sqs_daily_snapshot` migration block. Update or delete those entries. |
| [`apps/api/src/routes/transactions.test.ts`](apps/api/src/routes/transactions.test.ts) | Lines 40, 119: `_matrix_sqs: "84.6"` fixture and `expect(typeof body.quality.sqs).toBe("number")` assertion. Both delete with the field. |
| (gap) | No test exists for `routes/quality.ts`, `routes/internal-quality.ts`, `routes/internal-trust.ts`, the `min_sqs` body parameter on `do.ts`, the `quality_warning` field, the platform floor SQS gate, the lifecycle SQS thresholds, the dual-profile scoring computation itself, the matrix lookup, the freshness decay, `persistDualProfileScores`, `computeAdaptiveInterval`, `captureDailySnapshots`, or any of the digest SQS helpers. |

The deletion phase loses very little test coverage. The corollary: the deletion phase does not have unit-level safety nets confirming the deletion is clean. **Recommendation:** the deletion PR should land alongside an integration smoke that calls `/v1/do`, `/v1/capabilities`, `/v1/solutions`, `/v1/transactions`, `/v1/audit/:id`, `/v1/suggest`, the x402 catalog, and the A2A agent card and confirms the responses parse cleanly with no ghost SQS keys. (The route-level integration harness gap noted in the Audit-Follow-up Test Coverage Protocol is exactly what's missing here.)

---

## (j) Dead-code candidates surfaced incidentally

These are noticed in passing — **not in the deletion scope**, just listed for tracking.

- [`apps/api/src/lib/sqs.ts:88–95`](apps/api/src/lib/sqs.ts) — the `WEIGHTS` constant is annotated `@deprecated`, kept only for the legacy `computeCapabilitySQS` codepath that itself is only called from `computeDualProfileSQS` to populate `legacy_score`. The whole legacy 5-factor branch (lines 162–474) is dead-as-soon-as-it-shipped tracking telemetry. Goes with the rest of the engine.
- [`apps/api/src/lib/sqs.ts:647`](apps/api/src/lib/sqs.ts) — comment `D-3: computeLegacySQS alias removed — no callers found.` Confirms the prior cleanup pass. No action.
- [`apps/api/src/lib/sqs.ts:716–738`](apps/api/src/lib/sqs.ts) — `makeUnverifiedResult` is referenced once (line 204). Goes with the engine.
- [`apps/api/src/db/manual-test-rerun.ts:51`](apps/api/src/db/manual-test-rerun.ts) — comment references `fix-low-sqs-remaining.ts`, a script that does not exist in the tree. Stale comment.
- [`apps/api/src/db/audit-capabilities.ts`](apps/api/src/db/audit-capabilities.ts) (whole file) — admin diagnostic that audits the SQS state of every capability. Heavy SQS coupling (line 25 imports `computeDualProfileSQS` and `DualProfileSQSResult`). The diagnostic itself becomes obsolete once SQS is gone; whole-file delete.
- [`packages/mcp-server/src/tools.ts`](packages/mcp-server/src/tools.ts) — the `strale_methodology` tool ships a markdown doc explaining the SQS dual-profile model + matrix table (lines 845–955). Whole methodology rewrites as part of the deletion. SDK/MCP `sqs`/`sqs_label` types in `tools.ts:28-83`, `packages/sdk-typescript/src/types.ts:89`, `packages/sdk-python/straleio/types.py:85`, `packages/sdk-python/straleio/client.py:317`, `packages/semantic-kernel-strale/src/client.ts:15` all need rewriting; consumers will be a consideration for whether to keep the optional fields versioned.
- [`apps/api/src/routes/llms-txt.ts:33,109`](apps/api/src/routes/llms-txt.ts) — explains SQS to LLMs; rewrite.
- [`apps/api/src/routes/mcp-server-card.ts:89`](apps/api/src/routes/mcp-server-card.ts) — single line description; rewrite.
- [`apps/api/src/routes/reply-webhook.ts:328`](apps/api/src/routes/reply-webhook.ts) — auto-reply text refers to "SQS below 25"; rewrite.
- [`apps/api/src/lib/situation-assessment.ts`](apps/api/src/lib/situation-assessment.ts) — `sqsImpact` field on `SituationAssessment` type (lines 43, 371, 386, 389, 402, 484, 496, 525, 538). Used by intelligent-alerts and digest. Rewrites to a generic "test impact" concept, or the field deletes.
- [`apps/api/src/lib/intelligent-alerts.ts:228, 321`](apps/api/src/lib/intelligent-alerts.ts) — alert text mentions SQS. Rewrite.
- [`apps/api/src/lib/interrupt-sender.ts:504, 545–629`](apps/api/src/lib/interrupt-sender.ts) — interrupt emails to operator about degraded capabilities show SQS values and mention "SQS frozen at current value". Rewrite to use the new `source_health.status` shape.
- [`apps/api/src/lib/digest-formatter.ts`](apps/api/src/lib/digest-formatter.ts) — entire "SQS Distribution" digest section (line 131-onward) and `sqsGradeBadge` rendering. Rewrites or deletes.
- [`apps/api/src/lib/digest-compiler.ts`](apps/api/src/lib/digest-compiler.ts) — `sqsDist`, `sqs_score`, `sqs_grade` shaping for the digest (lines 99, 119, 149, 193–207, 388–419, 500–559). Rewrites.
- [`apps/api/src/lib/email-templates.ts:202–341`](apps/api/src/lib/email-templates.ts) — `sqsGradeBadge` helper, table cell rendering. Rewrites.
- [`apps/api/src/lib/daily-digest/*.ts`](apps/api/src/lib/daily-digest) — `sqsChanges` arrays in `index.ts:39`, `fetch-platform.ts:221–251`, `analyze.ts:57`, `render-email.ts:174–184`, `types.ts:31`. Rewrites or deletes.
- [`apps/api/src/lib/meta-monitoring.ts`](apps/api/src/lib/meta-monitoring.ts) — multiple SQS integrity checks (lines 381–589, 762–795). The whole "8C: Weekly SQS integrity checks" block is SQS-specific; deletes. Other checks survive.
- [`apps/api/src/lib/health-monitor.ts`](apps/api/src/lib/health-monitor.ts) (referenced from scheduler) — health event types include `sqs_exclusion`. The event type goes; the file survives.
- [`apps/api/src/lib/data-retention.ts:151–212`](apps/api/src/lib/data-retention.ts) — `sqs_daily_snapshot` retention block. Deletes with the table.
- [`apps/api/src/lib/x402-gateway.ts:104–123`](apps/api/src/lib/x402-gateway.ts) — `matrixSqs` parameter on description-builder. Deletes.
- [`apps/api/src/lib/matching.ts:151–153`](apps/api/src/lib/matching.ts) — uses `matrixSqs` as tiebreaker in capability matching. Replace with a different tiebreaker (e.g. `last_tested_at` or `capability.priceCents`) or delete the tiebreaker entirely.
- [`apps/api/src/jobs/invariant-checker.ts:289–379`](apps/api/src/jobs/invariant-checker.ts) — whole block of solution-step SQS invariants. Deletes.
- [`apps/api/src/jobs/db-retention.ts:10`](apps/api/src/jobs/db-retention.ts) — comment refers to "SQS uses rolling 10-run window"; rewrites or deletes.
- [`apps/api/src/diagnostics/self-heal-check.ts:428`](apps/api/src/diagnostics/self-heal-check.ts) — comment "Replicate the EXTERNAL_SERVICE_PATTERNS from sqs.ts (it's private)"; this whole self-heal probably has dead patterns to clean up. Audit during the deletion.
- [`apps/api/scripts/diagnose-sqs.ts`](apps/api/scripts/diagnose-sqs.ts) and [`apps/api/scripts/diagnose-sqs-window.ts`](apps/api/scripts/diagnose-sqs-window.ts) and [`apps/api/scripts/test-sqs-local.ts`](apps/api/scripts/test-sqs-local.ts) — diagnostic scripts. Whole-file delete.
- The non-test, non-doc archive directories (`audit-output/`, `audit-reports/`, `archive/`, `handoff/`, etc.) reference SQS in dozens of files. **Do NOT touch in deletion phase** — these are historical artifacts.

---

## Deletion sequencing recommendation

Given the surface count and the lifecycle dependency, the deletion phase should:

1. **First wave — read-paths (no behavior change yet):** Strip SQS fields from the public response shapes (`/v1/capabilities`, `/v1/solutions`, `/v1/do` response, `/v1/transactions`, `/v1/audit/:id`, `/v1/suggest`, A2A, x402 catalogs, MCP/SDK types). Rewrite the docs in `llms-txt.ts`, `mcp-server-card.ts`, `methodology` MCP tool. Coordinate with the frontend repo to land its consumer-side updates in lock-step; the API contract test fixture must be re-captured.
2. **Second wave — gates and auto-transitions:** Remove the `min_sqs` parameter and `quality_warning` field from `/v1/do`. Remove the platform-floor-SQS gate. Make a decision on lifecycle: option (1)/(2)/(3) above. Remove or rewrite `lifecycle.ts`. Remove `execution-guidance.ts`. Remove `matching.ts` SQS tiebreaker. Remove the `solutions.is_active` SQS-keyed auto-gate.
3. **Third wave — engine and persistence:** Delete `sqs.ts`, `quality-profile.ts`, `reliability-profile.ts`, `sqs-matrix.ts`, `sqs-constants.ts`, `sqs-snapshots.ts`, `freshness-decay.ts`, `verify-dual-profile.ts`, `routes/quality.ts`, `routes/internal-quality.ts`, `audit-capabilities.ts`, the diagnose/test scripts. Strip `persistDualProfileScores`, `computeAdaptiveInterval`, daily-snapshot calls from `test-runner.ts` and `test-scheduler.ts`. Strip SQS blocks from `meta-monitoring.ts`, `invariant-checker.ts`, `db-retention.ts` comment, `digest-*`, `daily-digest/*`, `email-templates.ts`, `interrupt-sender.ts`, `intelligent-alerts.ts`, `situation-assessment.ts`. Drop `routes/internal-trust.ts` (or refactor in a follow-up).
4. **Fourth wave — schema:** Drop columns `qpScore`, `rpScore`, `matrixSqs`, `matrixSqsRaw`, `trend`, `guidanceUsable`, `guidanceStrategy`, `guidanceConfidence` (last three pending guidance decision). Drop table `sqs_daily_snapshot`. Remove migration block from `startup-migrations.ts`. Update the drizzle journal and snapshot.
5. **Fifth wave — rename:** Rename `capability_health` → `source_health` (per DEC-20260503-B). Add new columns the doctrine names: `last_fixture_tested_at`, `last_canary_tested_at`, `last_customer_observed_at`, `external_cost_cents` (already on `test_suites`, may need a per-source aggregate), `degradation_reason`, `fallback_available`, `status` enum. This is the substrate the next set of routing engines will consume.

Waves 1+2 can be a single PR. Wave 3 is a single large PR. Waves 4+5 are a single migration PR.

---

## Summary

- **~62 production files** reference SQS — twice the prompt's ~25-file informal threshold. Deletion is feasible but should be sequenced as 3 PRs.
- **No pre-existing `source_health`**, **no surviving routing engine** importing from `sqs.ts` — both prompt assumptions hold.
- **Lifecycle module is deeply SQS-bound** and needs an explicit policy decision before the engine is deleted.
- **Frontend / strale-frontend repo audit is the next prerequisite** — consumer-side fields must be updated in lock-step with the response-shape changes in wave 1.
- **Test coverage gap** — almost no unit tests cover the SQS surfaces, so the deletion lacks safety nets. The deletion PR should land with an integration smoke covering the public response shapes.
