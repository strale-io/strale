Intent: close out the DEC-20260513-B (CH `swiss-company-data` bad-fixture) and DEC-20260513-C (SK scheduler-burst) bug-fix cycle through all four Bug Fix Framework phases (Contain → Understand → Harden-runtime → Harden-PR-time), then sweep the related drifts surfaced along the way.

# What shipped (8 PRs merged + 1 DB cleanup)

## DEC-20260513-B/C bug-fix cycle (all 4 phases)

- **PR #107 (Phase 1 Contain, CH)** `fix(swiss-company-data): correct known_answer fixture to real ACTIVE UID`. Replaced `CHE-105.805.977` (not a real Swiss UID) with `CHE-101.602.521` (Roche Holding AG, ACTIVE). After merge, synced `test_suites.input` to match and released the 30-day operator pin on CH's breaker. Confirmed post-deploy: `/v1/do swiss-company-data {uid: "CHE-101.602.521"}` returns populated Roche payload (505 ms, €0.05).

- **PR #108 (Phase 1 Contain, SK)** `fix(scheduler): spread per-capability test suites across the hour`. Per-suite hash-stagger (`abs(hashtext(slug || ':' || test_type)) % 60`) replaces per-capability stagger. SK's 5 suites now distribute across 4 minutes (27/27/37/39/51) instead of all firing on minute 41 simultaneously. New SQL uses `LEFT JOIN test_results MAX(executed_at)` per-suite for debounce instead of the capability-level `last_tested_at`. SK breaker auto-recovered post-deploy; `/v1/do slovak-company-data` returned populated SEXES s.r.o. data within 4 minutes of deploy.

- **Phase 2 Understand** — Notion Journal `35f67c87082c81ceab3cdfa08b6391a2` (filed by chat). Covers the trust-in-pipeline blind spot pattern: CH bad fixture survived 16+ days because `verifyFixtures` reported `passed: true` when the executor threw on the bad UID and `--strict` wasn't used; SK rate-limit-burst was misdiagnosed as a structural Zenedge cap when it was really Strale's own scheduler burst at the `:41` tick.

- **PR #109 (Phase 3a Harden, runtime sentinel)** `feat: known_answer suite fails on missing guaranteed fields (strict-missing-only)`. Added Gate 3 inside `validateResult`: for `known_answer` suites only, every field declared `guaranteed` in `output_field_reliability` must appear as a key in `actual_output`. Strict-missing-only — empty arrays, null values, empty objects all pass (validators/scanners legitimately return `findings=[]`). Backfill simulation predicted exactly 4 affected capabilities; v1 of the prompt was halted on 40-cap backfill surprise (the over-aggressive "non-empty" rule); v2 (this PR) flipped exactly those 4. Live-fired in prod at 12:24Z on `japanese-company-data` with `failure_reason="guaranteed_field_missing:corporate_number"` — Rule 14 verified.

- **PR #111 (Phase 3b Harden, PR-time gate)** `feat(ci): static manifest guaranteed-field consistency gate + onboard-time strict-missing`. v3 of the pipeline-bypass detector — Path B per CC's earlier halt (Path A dynamic CI gate needs CI-DB infra Petter would have to provision). Three gates compose: onboard-time (verifyFixtures uses PR #109 helper), PR-time (static check `check-manifest-guaranteed-consistency.mjs --strict` wired into ci.yml, 22 pre-existing drifts allowlisted with header documenting Path A re-entry triggers), runtime (PR #109).

## Sibling cleanups surfaced by the cycle

- **PR #110** `fix(manifests): normalize HR + CH price_cents to 5 per DEC-20260513-E` — landed mid-session by another agent. HR and CH had stranded legacy €0.80 pricing; both are direct govt registries (Sudreg REST, Zefix REST), not scraping-cost-justified. Caused a rebase on my PR #111 branch; clean fast-forward, no conflicts on modify-list.

- **PR #112** `feat: classify guaranteed_field_missing:* as manifest_drift non-tripping in categorizeFailureReason`. Added `manifest_drift` category to FailureCategory enum, prefix-match in `categorizeFailureReason`, early-return in `circuit-breaker.recordFailure` mirroring the `isUserInputError` skip pattern. Prevents PR #109's sentinel emissions from tripping breakers on the 4 affected capabilities at their 3rd consecutive failure (~3 hours after deploy). Genuine upstream failures (HTTP 5xx, exception, timeout) still trip via unchanged paths — test case 3 explicitly verifies this. Post-deploy at 13:16Z: `llm-output-validate` known_answer ran, sentinel fired, `capability_health` row was NOT created — confirms the early-return works on the canonical path.

- **PR #113** `fix(manifests): align reliability declarations to actual executor output for 4 sentinel-failing caps`. Per-capability triage of the 4 affected by PR #109. All 4 turned out to be **manifest fixes** (no executor changes):
  - `charity-lookup-uk`: `income` → `latest_income` (executor returns `latest_income` consistent with `latest_*` family)
  - `japanese-company-data`: `corporate_number` → `registration_number` (executor returns `registration_number` matching EU-registry convention)
  - `llm-output-validate`: `auto_fixed_output` `guaranteed` → `common` (only populated when `auto_fixed=true`)
  - `openapi-validate`: orphan `stats` wrapper removed; 5 real top-level stats fields added as guaranteed (`error_count`, `warning_count`, `endpoint_count`, `schema_count`, `version_detected`)
  - Also synced `capabilities.output_field_reliability` from new manifests to prod DB (since the column is manifest-canonical but only the `onboard --backfill` script auto-syncs).
  - All 4 verified end-to-end via `/v1/do` direct probe — sentinel will pass on their next scheduled tick (debounce blocked this hour's tick from re-running since each was tested <1h ago).

- **PR #114** `fix(swiss-company-data): correct legal_form + legal_form_id + canton + municipality JSON paths`. PR #107's smoke output revealed 4 shape bugs in `providers/swiss-company-data.ts` that PR #109's sentinel didn't catch (keys were present, just with wrong values/types):
  - `legal_form`: returned the whole Zefix `legalForm` object (schema declared `string`) → now extracts `legalForm.shortName.de` ("AG"), falls back to `.en`
  - `legal_form_id`: read non-existent `company.legalFormId` (always null) → now reads `legalForm.id` (3 for Roche)
  - `canton`: read `legalSeat.canton` (legalSeat is a string!) → now reads top-level `company.canton` ("BS")
  - `municipality`: read `legalSeat.municipalityName` (same shape error) → now reads `company.legalSeat` (the string IS the municipality name, "Basel")
  - 7 tests cover the corrections + fallbacks + regression-guard for already-correct fields. Post-deploy `/v1/do` confirmed all 4 fields populated with correct types.

## Operational DB cleanup (no PR)

- **`capability_type` DB drift cleanup** — 13 UPDATEs aligning DB `capabilities.capability_type` to manifest `data_source_type` mapping. 5 EU registries migrated from scraping to direct API but DB stale at `scraping` (belgian/irish/latvian/lithuanian/swedish-company-data → `stable_api`). 8 computed/algorithmic caps mis-tagged as `stable_api` → `deterministic` (age-verify, aml-risk-score, business-day-check, language-detect, phone-type-detect, phone-validate, timezone-lookup, website-to-company). 0 reverse-drift. 67 `ai_assisted` rows intentionally left alone per `capability-field-authority.ts:271-274`. Smoke verified 3 caps (1 changed-to-stable_api, 1 changed-to-deterministic, 1 control unchanged). Closes the provenance-classification drift on `do.ts:2442`.

# What's open

## Provider-Coverage systematic sweep — HALTED

The MCP toolset in this environment doesn't expose `query_data_sources` — only `notion-search` (semantic, max 25/call, non-exhaustive). The prompt requires enumerating ALL ~100+ Provider-Coverage rows for the codebase-truth alignment sweep. CC's halt report surfaced four forward paths for chat decision:

- **Path A**: enable `query_data_sources` MCP tool in this environment, then re-run the sweep with full coverage
- **Path B**: chat exports row list as CSV/structured artifact; CC reads it and computes deltas locally
- **Path C**: chat narrowly scopes to a specific subset (e.g. all rows with status=Gap, or the 4 CH-related rows)
- **Path D**: defer — runtime sentinel + static check already cover the most customer-visible drift; Provider-Coverage drift is internal-canonical noise

Recommended Path A or D depending on launch urgency.

## Stuck-validating caps

3 caps in lifecycle_state=validating with last_tested_at NULL (never run):
- `us-company-data-cobalt`
- `us-ein-match`
- `us-sec-filings-extended`

These are US-class caps that appear to have been onboarded but never tested. Worth chat triage — likely missing env vars or executor not registered.

## Notion governance

- **DEC-20260513-F** (manifest-drift-as-non-tripping semantic decision per PR #112): chat needs to log a small DEC matching DEC-20260506-D's shape.
- **22 Notion To-do entries** for PR #111's static-check allowlist — each is a separate per-manifest triage prompt to shrink the allowlist toward zero.
- **DEC-20260513-B + DEC-20260513-C Outcome fields**: chat populates with PR links + "all 4 phases shipped".
- **Capability onboarding pipeline page** (`33c67c87082c81969b1fe32c87095f5a`): chat applies `verifyFixtures` strengthening note from PR #111.

# Non-obvious learnings

- **Manifest fields can have type-cast lies that survive forever.** PR #114's `legal_form` bug was `(company.legalForm as string) ?? null` — TypeScript cast accepted at compile time, but Zefix actually returns an object. The downstream code happily passed the object through as if it were a string for months. Schema declared `string`; reality was `object`. The lesson: schema declarations are aspirational without a runtime gate that verifies them. PR #109's strict-missing sentinel doesn't catch this class (the key was present, just wrong-shape); the right tool is a per-field type-validation gate, but that requires schema → runtime contract testing which is bigger than today's scope.

- **Field-reliability is two competing axes that v1 sentinel conflated.** Empty-as-success (validators/scanners returning `findings=[]`) vs missing-key-bug (executor never populating the field). v1 of PR #109 tried to assert both with one rule and would have tripped 40 healthy capabilities. v2 (the strict-missing-only shape that shipped) catches only the missing-key class. The empty-as-failure axis is opt-in territory — would need a per-field `non_empty: true` manifest annotation, named as future work in PR #109's PR body.

- **Per-suite scheduler spread side effect**: with the old per-capability stagger, all 5 SK suites fired on minute 41 → 5 calls in ~1 second → Zenedge saturation. The same pattern was hiding for every multi-suite capability — SK happened to be the one with the tightest upstream throttle. PR #108 distributes load globally; the upstream-burst pathology is gone for all caps, not just SK.

- **`postgres.railway.internal` doesn't resolve from local network.** Re-confirmed today (would have hit this on PR #109's canary if I hadn't already known from the 2026-05-06 DK precedent). Workaround: `railway ssh` + inline node script using `process.env.DATABASE_URL`. All operational SQL today went through that pattern.

- **Manifest-canonical vs DB-canonical hybrid is more subtle than it looks.** `output_field_reliability` is manifest-canonical (manifest is authoritative; backfill overwrites DB) BUT only `onboard --backfill` auto-syncs. Merging a manifest change doesn't propagate to prod DB without a separate step. PR #113 caught this — I had to manually `UPDATE capabilities SET output_field_reliability = $json` for the 4 fixed caps. Similarly, `capability_type` is hybrid (manifest seeds on create; DB preserved when set) — so today's 13 drift fixes had to go straight to DB UPDATE, not via manifest re-run.

- **`legalSeat` in Zefix is a STRING, not an object.** Tripped me up in PR #114. The parser assumed `legalSeat.municipalityName` and `legalSeat.canton`; in reality, `legalSeat` IS the municipality name (a string like "Basel"), and `canton` lives at the top level. A 30-second response inspection saved 30 minutes of guessing.

# Cost

- Zero deploy cost (8 PRs, all standard Railway backend deploys).
- 24 live API calls in the v1-launch coverage audit (~€0.75 wallet hit).
- ~20 live `/v1/do` calls across smoke verifications (~€0.15).
- ~50 Zefix probe calls in the CH credentials diagnostic (free public REST).
- 1 hour of /v1/do test-account budget consumed across the day's work.
