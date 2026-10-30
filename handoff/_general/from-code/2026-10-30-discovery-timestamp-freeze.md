Intent: fix the onboarding discovery step freezing timestamps into known_answer
assertions, found while investigating the verification failures from the
2026-10-30 onboarding of six capabilities.

# Discovery froze the clock into four scheduled test suites

## What happened

DQ-41's onboarding ran on 2026-10-30 (two runs, PRs none — the GitHub
workflow). Three of the six capabilities reported a verification problem:

| slug | runner verdict |
|---|---|
| `eurostat-data` | Fixture assertions do not match output |
| `company-status-check` | Fixture assertions do not match output |
| `invoice-counterparty-check` | Execution was refused or unavailable |
| `entity-resolve`, `places-search`, `document-ocr` | passed |

One cause explains every row, and the two that "passed" with a timestamp in
them were only passing because the clock had not moved yet.

## Root cause

`generateExpectedFields` in `apps/api/src/lib/onboarding-pipeline.ts` promoted
any string of 30 characters or fewer with no whitespace to an `equals`
assertion, on the reasoning that "short strings without spaces look like
enums". An ISO timestamp is exactly that shape: `2026-10-30T09:46:36.533Z` is
24 characters with no spaces.

Discovery and verification each execute the capability, so a frozen `as_of`
fails on the second execution. What landed in the production suites:

| slug | frozen assertion | fails |
|---|---|---|
| `eurostat-data` | `as_of` = `…09:46:31.924Z`, `accessed_at` = `2026-10-30`, `updated` = `2026-10-22T21:00:00.000Z` | every call |
| `company-status-check` | `as_of` = `…09:46:36.533Z` | every call |
| `entity-resolve` | `as_of` = `2026-10-30T00:00:00Z` | first midnight UTC |
| `places-search` | `overture_release` = `2026-10-21.0` | next Overture release |

Sub-second precision fails at once; day precision survives until midnight.
That is the whole difference between the two that failed and the two that
passed. All four suites are `scheduled_testing_eligible` with
`external_cost_cents = 0`, so the hourly free-tier scheduler runs them — four
of six would have reported a false failure every hour, feeding the quality
floor and health monitoring. That is the F1 family (false quality
attribution), whose root-cause investigation is already open.

`invoice-counterparty-check` is **not** a fault: at 75c it is `paid_prepaid`,
and the pipeline refuses to execute paid capabilities from `internal_test` by
design, so onboard verification never burns vendor credits. Its suite is
unscheduled.

## The fix

`looksTimeVarying(field, value)` guards the enum promotion. A value shaped
`YYYY-MM-DD`, `YYYY-MM-DDT…` or `YYYY-MM-DD.n` keeps `not_null`, as does a
field whose name ends in a temporal word (`as_of`, `accessed_at`,
`fetched_at`, `retrieved_at`, `checked_at`, `generated_at`, `captured_at`,
`updated`, `updated_at`, `timestamp`, `date`). That a timestamp is present is
the real invariant; its value is not ours to assert. Stable short strings
(`active`, `CP_MEUR`, `lei_direct`) still get `equals`.

The auto-fix path (`analyzeFixtureMismatches`) needed no change: its automatic
corrections are limited to field renames, case differences and boolean
coercion, so a moved timestamp falls to a manual suggestion rather than being
re-frozen.

## Evidence

Receipt: [onboarding test run](../../../archive/receipts/2026-10-30-test-run-discovery-timestamp-freeze.json).
Two new tests in `onboarding-pipeline.test.ts`: one asserts the three shapes
discover as `not_null` while a stable value still discovers as `equals`; the
other drives discovery and verification with a different `as_of` on each
execution, reproducing the production failure. Both **fail with
`looksTimeVarying` removed and pass with it restored** — verified in both
directions, not assumed. 65 tests across the six onboarding suites pass. Root
`npm run typecheck` is clean apart from the pre-existing `@duckdb/node-api`
resolution error, which this change does not touch.

Two method notes from the investigation, in case it is repeated: the runner's
per-field detail goes to `report()`, which runs inside the API process, so it
reaches Railway's logs and never the GitHub job log — the artifacts and a local
reproduction are the only way to see which assertion failed. And the stored
assertions live in `test_suites.validation_rules.checks`, not
`expected_output`, which is NULL for all six.

## Still owed, after this deploys

1. **Backfill the four affected suites.** Run the **Onboard capability**
   workflow in `backfill` mode with discover on for
   `eurostat-data,company-status-check,entity-resolve,places-search` once this
   is live, so the stored assertions regenerate without the frozen values.
   Doing it before the deploy would only freeze a fresh timestamp.
2. **Verify** `test_suites.validation_rules.checks` afterwards: no `equals`
   whose value matches `^\d{4}-\d{2}-\d{2}`.
3. **The five discovered manifests from the onboarding runs are still
   uncommitted**, and should stay that way until reviewed: they mark every
   field `guaranteed` and carry these same frozen values. They are in the run
   artifacts (14-day retention) for runs 41035841605 and 41036128195.
4. `document-ocr`'s discovered assertion is `complete equals false`. Stable, so
   not this bug, but worth a look: asserting that a known-answer run reports
   itself incomplete is an odd invariant to lock in.
