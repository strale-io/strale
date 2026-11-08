# Onboarding error detail report

## Files changed

- `apps/api/src/lib/onboarding-pipeline.ts` — adds allowlisted failure detail to
  the pipeline log payload and the returned `errors` entry.
- `apps/api/src/lib/onboarding-pipeline.test.ts` — covers authority drift,
  driver errors, identifier validation, and secret-value exclusion.
- `docs/lanes/codex/onboarding-error-detail-report.md` — this report.

## Safe fields added

The `onboarding-pipeline-failed` log payload and the corresponding
`OnboardingResult.errors` entry may now include:

- `error_class`: `error.constructor.name`, but only when it matches
  `^[A-Za-z][A-Za-z0-9]{0,63}$`.
- `violation_fields`: for an `AuthorityViolationError`, only violation field
  names which are keys of `FIELD_CATEGORIES`.
- `violations`: for an `AuthorityViolationError`, `{ field, reason }` objects
  for those same allowlisted fields. The reason is the violation's fixed
  in-code reason.

The existing safe `sqlstate`, stage, slug, timeout handling, and
`OnboardingError` passthrough remain. An authority failure now has code
`authority_violation` and the fixed actionable message requested in the
brief. Neither `manifestValue` nor `dbValue` is copied into a log or result,
and raw messages from driver or other unclassified errors remain excluded.

## Other errors reaching the catch

`normalizeManifestToRow` has one deliberately typed failure:
`AuthorityViolationError`; it is handled here. `persistCapability` also has
two internal invariant failures represented as plain `Error` (backfill used
without update mode, or a missing capability slug), while persistence and
`diffAndUpdateLimitations` can surface driver errors with that same class.
They are not mapped: classifying plain `Error` by message would require
reading or matching a raw message and could accidentally disclose a driver
message. The pipeline's existing generic fixed message is the safe handling
for those indistinguishable cases.

## Tests added

1. A mocked backfill persistence failure on `maintenance_class` and
   `processes_personal_data` checks the authority code, actionable field list,
   `error_class`, `violation_fields`, per-field reasons, and absence of both
   manifest and database `SECRET-SENTINEL` values from serialized logs and
   results.
2. A driver-style failure containing `password=hunter2` with
   `cause.code = "23505"` checks the safe SQLSTATE and `Error` class and proves
   the password is absent from serialized logs and results.
3. One test first proves that an ordinary `Error` reports its valid class, then
   gives an error a constructor named `x y<script>` and checks that
   `error_class` is absent from both the log payload and returned error.

The tests-only patch was also applied to a detached worktree at the branch's
base commit (`ebfd78e`) and run there. The suite failed before the production
change on all three new tests (3 failed, 21 passed), demonstrating that every
new test discriminates the changed behaviour while the invalid-name test also
prevents a future unvalidated class field.

## Commands and results

- `npm ci` — **failed** because `c2pa-node`'s postinstall attempted to download
  a test certificate from GitHub and the environment returned `ENETUNREACH`.
- `npm ci --ignore-scripts` — **passed** (1,051 packages installed); used to
  complete the offline test setup without the network-only postinstall.
- `npm run build --workspace=packages/mcp-server && npm run build --workspace=packages/sdk-typescript`
  — **passed**.
- `npm run typecheck` — **passed** for the API, API scripts, TypeScript SDK,
  LangChain, Semantic Kernel, MCP server, AI SDK, and CLI workspaces.
- `cd apps/api && npx vitest run src/lib/onboarding-pipeline.test.ts src/routes/internal-onboarding-run.test.ts src/lib/capability-field-authority.test.ts src/lib/known-answer-checks.test.ts src/jobs/onboarding-retry.integration.test.ts src/lib/x402-eligibility.guard.test.ts src/lib/limitations-sync.test.ts src/lib/onboarding-cli.test.ts src/lib/nested-value.test.ts`
  — **passed**: 8 files passed, 1 skipped; 112 tests passed, 10 skipped.
- Detached-base fail-before command (`git worktree add --detach`, apply the
  tests-only patch, then `vitest run src/lib/onboarding-pipeline.test.ts
  --pool=threads --maxWorkers=1`) — **failed as expected**: 2 tests failed and
  22 passed before the implementation was present.
- Updated detached-base fail-before run after making the malformed-class test
  independently discriminating — **failed as expected**: all 3 new tests
  failed and the 21 existing tests passed.
- `cd apps/api && npx vitest run src/lib/onboarding-pipeline.test.ts --maxWorkers=1`
  — **passed**: 24 tests.
- `cd apps/api && npx tsc --noEmit --project tsconfig.json` — **passed** after
  the final constructor-name validation adjustment.
- `cd apps/api && npx vitest run` — **did not pass**. Before the long-running
  suite was stopped, it reported unrelated performance-threshold failures in
  these files: `src/lib/company-enrich/structured-metadata.test.ts` (2),
  `src/capabilities/lib/stripped-text-length.test.ts` (1), and
  `src/capabilities/url-to-markdown-parse-bound.test.ts` (1). No onboarding
  test failed. The run was interrupted after more than nine minutes rather
  than waiting for the remaining unrelated suites, so this is not recorded as
  a complete full-suite result.
- `cd apps/api && npx vitest run src/lib/company-enrich/structured-metadata.test.ts src/capabilities/lib/stripped-text-length.test.ts src/capabilities/url-to-markdown-parse-bound.test.ts --maxWorkers=1`
  — **failed**: `structured-metadata.test.ts` exceeded two 1,000 ms performance
  ceilings (1,270 ms and 1,115 ms), and `url-to-markdown-parse-bound.test.ts`
  exceeded its 500 ms event-loop-gap ceiling (720 ms); 72 tests passed and 3
  failed. `stripped-text-length.test.ts` passed in this isolated rerun.
- `git diff --check` — **passed**.

