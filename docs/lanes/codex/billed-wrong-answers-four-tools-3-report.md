# billed-wrong-answers-four-tools round 3 report

## Files changed

- `apps/api/src/capabilities/eori-validate.ts` — changed only the GB refusal's third argument to the required actionable fix text.
- `apps/api/src/capabilities/startup-domain-check.ts` — corrected the `isDomainAvailable` comment to describe the DNS/RDAP behavior.
- `docs/lanes/codex/billed-wrong-answers-four-tools-3-report.md` — recorded this run.

## Verification

- `npm --workspace=packages/sdk-typescript run build` — passed.
- `npm --workspace=packages/mcp-server run build` — passed after installing the repository dependencies with lifecycle scripts disabled. The ordinary install could not download `c2pa-node` test certificates because this environment has no external network route.
- `npm --workspace=apps/api run test:code` — did not pass in this runner: **498 test files passed, 4 failed, 47 skipped; 12,079 tests passed, 5 failed, 459 skipped (12,543 total)**. All five failures were pre-existing wall-clock performance thresholds on 16 MiB hostile/ordinary-text fixtures (`structured-metadata.test.ts`, `url-to-markdown-parse-bound.test.ts`, `stripped-text-length.test.ts`, and `web-provider-text-check.test.ts`); none exercises either changed behavior. An isolated retry still missed four performance thresholds, and a Node 22 retry reduced this to one missed threshold. No test or production code was changed to mask these runner-performance failures.
- `../../node_modules/.bin/vitest run --project code src/lib/actionable-errors-round2.test.ts` (from `apps/api`) — passed: **1 file, 127 tests, 0 failed**. This directly confirms the blocking GB refusal contract.
- `npm --workspace=apps/api run lint:upstream-catches -- --base 48a77e23` — passed: 407 files and 284 handlers checked, with 147 existing findings and 31 documented exceptions. The brief's exact `origin/main` command could not run because this checkout has no remotes or `origin/main`; `48a77e23` is the stated predecessor commit.
- `npm run typecheck` — passed.
- `npm run env:check` — passed: 138 environment reads checked against 143 manifest rows.
- `npm run claims:check` — passed: 32 claim rows checked.
- `npm run models:check` — passed: 1,096 files checked.

## Not done

- The full code suite could not be reported with zero failures because this runner missed five unrelated wall-clock performance thresholds; the complete counts and isolated rerun results are above.
- The exact upstream-catch base using `origin/main` was unavailable because the supplied checkout has no Git remote. The check passed against the brief's predecessor commit instead.
- The additional `/go` capability validation and smoke commands could not run without `DATABASE_URL`; the first validation stopped at the repository's read-only operator-handle guard. The brief explicitly supplied no secrets, so no database credential was introduced. The brief's requested offline verification commands do not require this operator database.
