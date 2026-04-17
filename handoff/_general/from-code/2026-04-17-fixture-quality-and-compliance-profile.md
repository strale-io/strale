# Fixture Quality + Compliance Profile — single source of truth for docs surfaces

**Intent**: eliminate hardcoded/mock data on public capability and solution detail pages by introducing derived, drift-proof compliance metadata and enforcing fixture quality at every boundary.

**Date**: 2026-04-17
**Pushed**: yes (backend and frontend both deployed to prod via Railway)
**Duration**: long session, multi-phase

## Origin

User spotted a capability detail page (invoice-validate) showing a nonsense example: a bare VAT string as input, 7 errors in the response, a compliance record claiming "7 sources queried, Mixed AI involvement" — none of which is true for a pure algorithmic validator. Root cause investigation revealed three separate drift problems.

## What shipped (in commit order)

1. **Fixture-quality gate** — `apps/api/src/lib/fixture-quality.ts` (new module) enforces that every `test_suites.input` is a non-placeholder, schema-typed value with required fields present. Wired into four checkpoints:
   - `scripts/onboard.ts` (entry)
   - `scripts/validate-capability.ts` (readiness check 12b+12c)
   - `jobs/invariant-checker.ts` CHECK 11 (runtime, every 2h)
   - `scripts/audit-placeholder-fixtures.ts` (CI sweep, exit 1 on any bad fixture)

2. **Baseline invalidation** — fix-mode tests replay `baseline_output`; when `test_suites.input` changes, the baseline goes stale but nothing forces a refresh. Discovered when invoice-validate kept showing valid=false after fixture fix. Workaround: clear baseline_output + set test_mode='live' for any capability whose fixture gets edited. Systemic fix still TODO (see "Deferred" below).

3. **Compliance profile endpoint + module** — `apps/api/src/lib/compliance-profile.ts` derives a `ComplianceProfile` from primary DB state (capabilities, solution_steps, test_results). Exposed at:
   - `GET /v1/internal/trust/capabilities/:slug/compliance-profile`
   - `GET /v1/internal/trust/solutions/:slug/compliance-profile`

   Frontend `ComplianceProfileSection` consumes it, replacing MOCK_VENDOR_RISK_AUDIT in ResponsePreview + ZoneCCompliance. Orphaned `ZoneBCompliance.tsx` and `ComplianceRecordSection.tsx` deleted.

4. **Freshness guard on /example-output** — endpoint now refuses to serve a passing test result older than its fixture (`tr.executed_at >= ts.updated_at`). Ensures the public example block hides rather than lies when fixtures are mid-update.

5. **Invariant CHECK 12 + onboarding gate** — scans all active capabilities every 2h for null `data_source`/`geography`/`capability_type`. Paired with new readiness checks 12b (geography) and 12c (capability_type) in validate-capability.ts.

## Fixes applied (DB-only, no code)

- **33 bad fixtures** repaired: 28 stringified-JSON inputs re-parsed, 5 placeholder fixtures replaced with realistic values (invoice-validate got a full Ericsson→Spotify invoice).
- **121 stale baselines** cleared across 20 capabilities whose inputs were explicitly modified this session. Next production test run will recapture.
- **68 incomplete profiles** filled in:
  - 13 country-prefix (uk-*, nl-*) → geography = country code
  - 17 web3 → geography = "global"
  - 4 single-country explicit (au-company-data, council-tax-lookup, stamp-duty-calculate, sec-filing-events)
  - 34 remaining → geography = "global" (default for algorithmic / multi-jurisdiction)
  - 19 missing data_source filled from executor grep (Etherscan, GoPlus Labs, DefiLlama, OSV, ESMA CASP, etc.)

## Commits

Backend (strale):
- `01c3f20` fix: gate fixture quality at onboarding, readiness, runtime, and CI
- `0180814` feat: compliance profile endpoint + freshness guard on example-output
- `849d542` feat: invariant CHECK 12 + onboarding gate for compliance profile fields
- `c323c6c` fix: auto-invalidate baseline_output when test_suites.input changes
- `0ce3d32` feat: /v1/audit/:id returns full runtime audit composed from profile

Frontend (strale-frontend):
- `7e860a0` fix: delete getSmartDefault; render only backend-captured fixture pairs
- `987185e` fix: correct example-output endpoint path in useCapabilityExampleOutput
- `6eb139a` feat: render real compliance profile in One API call section
- `dad9563` feat: ZoneCCompliance reads real profile; drop orphan mock components
- `db97d33` feat: AuditRecord page fetches real data from /v1/audit/:id
- `4510e63` refactor: delete audit-mock-data; move types to compliance-types, inline marketing example

## Deferred (worth a follow-up session)

_Session continued and closed out items 1-3 below. Remaining: item 4._

1. ~~**Automatic baseline invalidation on input change**~~ — **DONE**. Application
   layer in `onboard.ts` plus DB trigger (migration 0045) now auto-null
   baseline_output when `test_suites.input` changes. Commit `c323c6c`.

2. ~~**Remaining mock usages**~~ — **DONE**. `audit-mock-data.ts` deleted entirely.
   Types + REGULATORY_CHECKLIST moved to `src/lib/compliance-types.ts`. Marketing
   illustration inlined into `Security.tsx` as `EXAMPLE_AUDIT_OBJECT` with
   placeholder tokens. ZoneCCompliance's audit JSON now composed from the
   real compliance profile. Commits `0ce3d32` (backend), `db97d33` + `4510e63` (frontend).

3. ~~**Runtime audit endpoint**~~ — **DONE**. `/v1/audit/:transactionId?token=...`
   endpoint was already wired but returned a raw JSONB blob. Refactored to
   compose runtime transaction data with the live ComplianceProfile into the
   AuditRecord shape the frontend expects. AuditRecord.tsx now fetches real
   data via useQuery instead of selecting from mock.

4. **Profile gaps on solutions**. CHECK 12 only scans capabilities. Could extend
   to solutions (missing geography, etc.) though solutions inherit most fields
   from their constituent capabilities. Low priority.

## Architectural principles established this session

These should be enforced for any future work on public-facing surfaces:

- **One source of truth per field**. If a value appears on a public page, it must have exactly one computation path from primary data. No synthesized fallbacks, no frontend generators.
- **Derived over materialized**. Prefer computing on read with a short cache over persisting a derived column that can drift.
- **Static vs runtime, strictly separated**. Profile = what a capability would produce. Runtime audit = what one specific call produced. Never conflate in the same component.
- **Hide over lie**. If data is missing or stale, the UI hides the affected region rather than synthesizing a plausible fallback.
- **Gate at entry, not after**. New content (fixtures, capabilities) must pass quality checks before entering the DB. The onboarding pipeline is the choke point.

## How to verify things are working

- Open [strale.dev/capabilities/invoice-validate](https://strale.dev/capabilities/invoice-validate) — "One API call. Structured data." should show the Ericsson invoice + `valid: true` response, and the Compliance Profile collapsible should say "1 data source, no AI involvement."
- `npx tsx scripts/audit-placeholder-fixtures.ts` should exit 0.
- Invariant CHECK 12 should report 0 bad profiles in the next 2-hour run.
