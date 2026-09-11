Intent: fix the fixture-recapture-failure counter wrongly quarantining
refusal-type test suites, and release the wrongly-quarantined production
rows.

## Problem confirmed

`apps/api/src/lib/test-runner.ts`'s fixture-recapture-tracking gate
(`if (suite.testMode === "fixture" && !(passed && capResult?.output))`)
counted ANY passing test that produced no output as a failed recapture
attempt. For `negative`/`edge_case`/`known_bad` test types,
`validateResult` marks a correct refusal `passed: true` with
`capResult === null` — no output ever exists on their expected-pass path.
Three consecutive passing scheduled runs quarantined the suite exactly as
fast as three genuine failures would have, and permanently (`captureBaseline`
never fires without output, so there was never a baseline to self-heal
into a fixture replay).

## Evidence (production, read-only)

35 `test_suites` rows carried `quarantine_reason LIKE
'fixture_recapture_exhausted:%'`, quarantined 2026-08-18 to 2026-08-21,
across the 12 capabilities `browserless-suite-migration.ts` targets.

32 of them (`test_type IN ('negative','edge_case','known_bad')`) had exactly
`MAX_FIXTURE_RECAPTURE_FAILURES` (3) consecutive `passed: true` / no-output
`test_results` rows immediately before the quarantine event, never a
`passed: false` one:

| capability | test_type | last real run before quarantine |
|---|---|---|
| accessibility-audit | edge_case, known_bad, negative | passed=true, no output |
| eu-regulation-search | edge_case, negative | passed=true, no output |
| html-to-pdf | edge_case, known_bad, negative | passed=true, no output |
| irish-company-data | edge_case, negative | passed=true, no output |
| japanese-company-data | edge_case, known_bad, negative | passed=true, no output |
| latvian-company-data | edge_case, known_bad, negative | passed=true, no output |
| lithuanian-company-data | edge_case, known_bad, negative | passed=true, no output |
| screenshot-url | edge_case, known_bad, negative | passed=true, no output |
| seo-audit | edge_case, known_bad, negative | passed=true, no output |
| swiss-company-data | edge_case, known_bad, negative | passed=true, no output |
| tech-stack-detect | known_bad, negative | passed=true, no output |
| url-to-markdown | known_bad, negative | passed=true, no output |

Every one of these 32 rows' input is constructed to fail before or at input
validation (`negative`: `{}`; `edge_case`/`known_bad`: an empty field, or a
`"not-a-url"`/`"INVALID_TEST_VALUE_12345"` sentinel). Confirmed by reading
each executor: `accessibility-audit.ts:6`, `html-to-pdf.ts:13`,
`screenshot-url.ts:118`, `seo-audit.ts:8`, `tech-stack-detect.ts:92`,
`eu-regulation-search.ts:91`, and the company-data capabilities' `!raw.trim()`
checks all validate before any external call for the `negative` type; the
url-based six's `edge_case`/`known_bad` sentinels DO reach a real
`fetchRenderedHtml`/`browserlessFetch` call before rejecting (non-empty,
non-URL string is not caught by the `!url` check) — real, if small, cost per
attempt, which is why the fix routes these to `canary` mode (24h floor)
rather than leaving them permanently unbounded on `live`.

The remaining 3 rows (`test_type = 'dependency_health'` on
`irish-company-data`, `lithuanian-company-data`, `swiss-company-data`)
quarantined on GENUINE execution failures — the last real run before
quarantine was `passed: false` with a real upstream "not found" error
(`No Irish company found matching "461onal"`, `No Lithuanian company found
for code 301524699`, `All data providers failed for swiss-company-data`).
Root cause, separate from the counter bug: each suite's `test_suites.input`
(`{"cro_number":"461onal"}`, `{"company_code":"301524699"}`,
`{"uid":"CHE-116.281.710"}`) no longer matches the manifest's current
`health_check_input` (`513174`, `304151376`, `CHE-101.602.521` respectively)
— a fixture-input-drift gap: the manifest was corrected at some point (git
history shows `cro_number` changed from `"461461"` to `"513174"` for the
known_answer fixture) but the DB row for the separately-generated
`dependency_health` suite (`onboard.ts` line ~1098: `input: healthInput ??
knownAnswerEntries[0]?.input ?? {}`) was never resynced. This is a code
fault in the onboarding/backfill pipeline (no mechanism keeps
`test_suites.input` in sync with a manifest's `health_check_input` after
the row already exists), not the recapture-counter bug — flagged as a
follow-up (see below), left quarantined (a genuine failure, correctly
capped).

## Fix

1. `apps/api/src/lib/test-runner.ts`: the recapture-failure condition is now
   `!passed` (was `!(passed && capResult?.output)`). A passing refusal never
   raises the counter or quarantines; a genuinely failing recapture is
   unaffected (verified: `test-runner.recapture-termination.test.ts` passes
   unmodified).
2. `apps/api/src/lib/browserless-suite-migration.ts`: `negative`/
   `edge_case`/`known_bad` (structurally incapable of capturing a baseline)
   are now planned to `test_mode = 'canary'`, not `'fixture'` (new action
   `convert_to_canary_refusal`). Canary mode never reaches the
   fixture-recapture machinery and gets a 24h floor via
   `minRetestIntervalHours` on the automatic scheduler's eligibility query
   (corrected 2026-09-12, see the addendum below; the floor does not bound
   a direct admin-triggered run), so fixing the counter alone doesn't reopen
   unbounded Browserless calls for the six URL-based capabilities whose
   `edge_case`/`known_bad` sentinel reaches Browserless before rejecting on
   the normal schedule.
3. `apps/api/src/lib/startup-migrations.ts` block
   `0113_releaseWronglyQuarantinedRefusalSuites` (ledger id `M056`) releases
   the 32 wrongly-quarantined rows: predicate `test_type IN ('negative',
   'edge_case', 'known_bad') AND quarantine_reason LIKE
   'fixture_recapture_exhausted:%' AND capability_slug IN (<the 12 target
   slugs>)`. Resets `test_status='normal'`, `quarantine_reason=NULL`,
   `fixture_recapture_failures=0`, `test_mode='canary'`. Idempotent (a
   second boot's `LIKE` guard matches nothing once `quarantine_reason` is
   NULL). Leaves the 3 genuine `dependency_health` failures untouched by
   construction (test_type scope excludes them).

## Tests

`apps/api/src/lib/test-runner.recapture-refusal-pass.test.ts` (new): a
passing `negative`/`edge_case`/`known_bad` fixture-mode run never raises
`fixture_recapture_failures`; 3 consecutive passes never quarantine; a
genuinely failing `known_answer` recapture on the same plumbing still
quarantines at the cap (unchanged-behavior guard). Every new assertion
proved by planting: reverted the fix inline, confirmed 4 of 5 new tests
failed, restored the fix, confirmed all 5 pass again.
`browserless-suite-migration.test.ts` updated (6 assertions changed from
`convert_to_fixture` to `convert_to_canary_refusal` / `test_mode:
'canary'`); planted the same way (disabled the new routing branch,
confirmed 5 tests failed, re-enabled, confirmed all 26 pass).
`test-runner.recapture-termination.test.ts` (the pre-existing genuine-
failure termination guarantee) passes unmodified.

Receipt: `archive/receipts/2026-09-11-test-run-recapture-refusal-lock.json`
(82/82 passed across the 8 relevant test files).

## Gates

- `npx tsc --noEmit -p apps/api`: clean (after `npm --workspace=packages/mcp-server run build`, a pre-existing worktree artifact gap unrelated to this change — see WORKTREES.md / project memory on the mcp-server build hazard).
- `npx vitest run` on the 8 named test files: all green (receipt above).
- `npm run migrations:check`: green. Added two `known_overlaps` entries
  (`test_suites.test_mode` for M040/M056; `test_suites.fixture_recapture_failures`
  for M053/M056) — both disjoint by construction (M040 scopes to
  vendor-suspension joins; M053 is a column-add DDL that never touches an
  existing row).
- `npm run migrations:test`: green (17/17).
- `npm run env:check`: green.
- `npm run context:check`: green (ran `context:generate` twice first per protocol).
- `npm run receipts:check`: green (the 11 warnings are pre-existing, unrelated stale handoffs from early September).

## Follow-up (not fixed this session — flagged separately)

The `dependency_health` fixture-input-drift gap (a manifest correction never
propagated to the existing `test_suites.input` row) is a distinct,
non-trivial fix — no mechanism currently resyncs `test_suites.input` for an
already-onboarded capability when its manifest's `health_check_input`
changes. Left the 3 genuinely-failing rows quarantined; a human should
either hand-correct their `input` to match the current manifest
(`irish-company-data`: `cro_number: "513174"`; `lithuanian-company-data`:
`company_code: "304151376"`; `swiss-company-data`: `uid:
"CHE-101.602.521"`) and reset `test_status`, or build the resync mechanism.

## Addendum 2026-09-12: PR #669 review findings closed

A fresh read-only Claude agent reviewed PR #669 (this branch) and found three
things. All three are fixed on this same branch, same commit as this
addendum.

### 1. Two gate tests broken by adding block 0113

`apps/api/src/lib/startup-migrations.test.ts` pinned the block list at 54
names and the max block number at 112. Block 0113 (this branch) made both
assertions stale. Fixed by updating the pinned list to include
`runMigration0113_releaseWronglyQuarantinedRefusalSuites` (56 entries total;
the pre-branch count was already 55, not 54, so the stale "54" in the test's
own description predates this branch) and the max-number assertion to 113.
`npx vitest run src/lib/startup-migrations*.test.ts` in `apps/api`: 146/146
green.

### 2. The counter fix closed the incident, not the defect class

Closed at runtime in `test-runner.ts`'s `runSingleTest`, not by extending
`browserless-suite-migration.ts`'s hardcoded `TARGET_SLUGS`. New function
`convertRefusalOnlyFixtureToCanary` (`apps/api/src/lib/test-runner.ts:1623`)
fires from a new `else if` branch alongside the existing
`recordFixtureRecaptureFailure` call (`apps/api/src/lib/test-runner.ts:955`):
when a `test_mode = 'fixture'` suite passes with no capturable output
(`capResult?.output` falsy), it flips `test_mode` to `'canary'` and appends
one `autoRemediationLog` entry recording why. Idempotent by construction:
once `test_mode` is `'canary'`, the `testMode === "fixture"` guard never
re-fires for that suite, no separate flag needed.

The general rule, stated in the function's own comment: fixture mode
requires a capturable baseline; a refusal-only outcome can never have one.

On the migration planner's `REFUSAL_ONLY_TYPES` handling: left as its own
thing rather than deferring to the runtime rule. The planner converts suites
from static metadata (test_type) as a one-time, manually-applied backfill for
the known incident population; the runtime rule only acts after an actual
passing execution confirms there was truly no output: different times,
different evidence, not a natural single call site. Both converge on
`test_mode = 'canary'`; cross-referenced in both files' comments so they
don't silently drift apart.

Tests added to `test-runner.recapture-refusal-pass.test.ts`: a passing
refusal-type fixture suite converts to canary on its first qualifying pass
and records why; a further 3 passing runs never re-convert or duplicate the
log entry (never loops); a `known_answer` suite that passes WITH output still
captures a baseline via `captureBaseline` and stays in fixture mode
(`test_mode` and `autoRemediationLog` both untouched). The pre-existing
genuinely-failing-recapture-still-quarantines test in the same file is
unmodified and still green. Planted: commented out the new `else if` branch
in `runSingleTest`, reran the suite; the two "moves to canary" tests failed
(`test_mode` stayed `fixture`, `autoRemediationLog` stayed `null`); the
"stays in fixture mode" test still passed (different code path). Restored the
branch, all green again.

Production count of the risky shape (read-only, root `.env` read-only role,
query script kept outside the repo tree): 23 `test_suites` rows carry
`test_mode = 'fixture'`, `test_type IN ('negative','edge_case','known_bad')`,
`active = true`, `test_status <> 'quarantined'`: the shape that would have
called its executor on every scheduled dispatch forever with no cap, absent
this fix. 20 of the 23 are `scheduled_testing_eligible = true` (dispatchable
today, not just latent). 19 of the 23 are outside
`browserless-suite-migration.ts`'s 12 `TARGET_SLUGS` (`adverse-media-check`,
`bank-bic-lookup`, `data-protection-authority-lookup`, `deduplicate`,
`http-to-curl`, `iban-validate`, `isbn-validate`, `iso-country-lookup`,
`json-repair`, `json-to-pydantic`, `json-to-typescript`, `json-to-zod`,
`pep-check`, `risk-narrative-generate`, `sepa-xml-validate`,
`skill-extract`, `swift-message-parse`, `swift-validate`,
`vat-format-validate`), confirming the runtime rule was necessary, not just
tidy: a hardcoded-list fix would have missed all 19. Three of those 19
(`adverse-media-check`, `pep-check`, `risk-narrative-generate`) have no
baseline at all, matching the earlier finding. Receipt:
`archive/receipts/2026-09-11-sweep-recapture-risky-shape-prod-count.json`.

### 3. Imprecise cost claim on `minRetestIntervalHours`

The canary floor bounds the automatic scheduler's eligibility query only. A
direct `POST /v1/internal/tests/run` admin call (`routes/internal-tests.ts`)
calls `runTests()` straight through with no floor in the way, for a
`canary`-mode suite exactly as for any other. Corrected everywhere this
branch stated the claim as unconditional: `test-runner.ts` (the
`browserless-suite-migration.ts` cross-reference comment near the
recapture-tracking branch, and the new function's `autoRemediationLog`
description string), `browserless-suite-migration.ts` (the header block
comment and the `REFUSAL_ONLY_TYPES` doc comment), `startup-migrations.ts`
(block 0113's comment), and this handoff (the corresponding paragraph
above). Not changed: the admin route itself, flagged here as a separate
gap, not fixed this session. A future session could add a
`minRetestIntervalHours`-equivalent floor to the admin route, or accept that
manual admin-triggered runs are intentionally unbounded (an operator already
holding `ADMIN_SECRET` is a different trust boundary than the scheduler).

### Gates (this addendum)

- `apps/api`: `npx tsc --noEmit -p .` clean (after
  `npm --workspace=packages/mcp-server run build`, the pre-existing worktree
  artifact gap, see WORKTREES.md).
- `apps/api`: `npx vitest run src/lib/test-runner*.test.ts
  src/lib/browserless-suite-migration.test.ts src/lib/health-sweep.test.ts
  src/lib/startup-migrations*.test.ts`, green. Receipt:
  `archive/receipts/2026-09-11-test-run-recapture-refusal-lock-review-fix.json`.
- Root: `npm run migrations:check` green (added no new `known_overlaps`;
  block 0113 already covered). `npm run migrations:test` green (17/17).
  `npm run env:check` green. `npm run context:check` green (ran
  `context:generate` twice first). `npm run receipts:check` green (same 11
  pre-existing warnings as before, unrelated to this branch).

## Next action

None pending on this track: branch pushed, no PR opened per the task brief
(explicit "Do not open a PR"; PR #669 already exists and carries this
addendum's findings). A follow-up session (or Petter) merges when ready, or
picks up either open item: the `dependency_health` input-drift follow-up
above, or the admin-route floor gap named in finding 3.
