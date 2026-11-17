# Upstream check timeout retry — builder report

## Files changed

- `apps/api/scripts/record-upstream.ts`
  - preserves the executor error name and message, classifies a check attempt without treating timeout-truncated `no longer requested` findings as independent drift, and retries a timeout-only live check once;
  - judges only the second attempt after a retry, marks every second-attempt finding with `(after one retry)`, and prints the required clean-retry outcome;
  - leaves capture mode and the existing per-run timeouts unchanged.
- `apps/api/scripts/record-upstream-retry.ts`
  - exports the network-independent, one-retry decision helper.
- `apps/api/test/record-upstream-retry.test.ts`
  - covers a clean retry, a second timeout, `TimeoutError` and `AbortError`, a wrong known answer, and a non-timeout executor error with stubbed attempts only.
- `docs/lanes/codex/upstream-check-timeout-retry-report.md`
  - records implementation and verification evidence.

No workflow, manifest, upstream recording, executor timeout, or capture-mode behavior changed.

## Fail-before evidence

The focused test initially failed against the branch's brief-only starting point because `../scripts/record-upstream-retry.js` did not exist. After implementation, two guarded mutation runs supplied behavior-specific fail-before evidence while preserving a clean working tree:

1. Mutating the timeout-only branch to never retry produced four failures: timeout then clean, `TimeoutError`, `AbortError`, and both attempts timing out. This proves the clean-retry and second-timeout tests fail when timeout retry behavior is removed.
2. Mutating the branch to retry every result produced two failures: wrong known answer and `fetch failed`. Both observed a second call and retry suffix instead of the unchanged first-run result. This proves each non-timeout case rejects an accidental retry.

Both runs used `apps/api/scripts/mutation-test.mjs` and completed green → red → green with `MUTATION CAUGHT`.

## Verification

- `cd apps/api && npx vitest run test/record-upstream-retry.test.ts`: passed, 6 tests in one test file.
- `cd apps/api && npm run typecheck`: passed with no diagnostics.
- `cd apps/api && npm run typecheck:scripts`: passed with no diagnostics.
- `git diff --check`: passed.
- `npm run context:generate`: passed in an isolated temporary worktree, generated 13 project-context files, and produced no tracked changes.

## Limitations

A normal `npm ci` could not download `c2pa-node` test certificates because the environment returned `ENETUNREACH`. `npm ci --ignore-scripts` installed the locked dependencies and enabled all required tests and typechecks. In accordance with the brief, tests made no network calls, and no live upstream check was run.

Nothing required by the brief remains undone.

`Next authorised action: Claude review of codex/upstream-check-timeout-retry | Owner: Strale master | Blocker: none`
