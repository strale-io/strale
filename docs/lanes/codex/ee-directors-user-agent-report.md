# EE directors user-agent report

## Files changed

- `apps/api/src/jobs/ingest-ee-directors.ts`
  - routes the HEAD probe and GET download through one helper that sends `STRALE_USER_AGENT`;
  - stops immediately with `EeSourceBlockedError` on block statuses; and
  - logs source blocks as `ingest-ee-directors-source-blocked` while preserving the existing generic label for other failures.
- `apps/api/src/jobs/ingest-ee-directors.test.ts`
  - covers the user agent on HEAD and GET, Last-Modified handling, blocked and non-blocked statuses, and failure-label selection with stub fetch implementations.
- `docs/lanes/codex/ee-directors-user-agent-report.md`
  - records this implementation and its verification evidence.

## Fail-before evidence

The marked regression test `upstream access > headLastModified sends Strale's honest user agent and returns last-modified` failed before the implementation with `TypeError: headLastModified is not a function`. The same fail-before run had seven failing upstream-access cases because the new exports did not exist. After the implementation, the targeted file passed all 23 tests, including the marked test.

## Verification

From `apps/api`:

```text
$ npx vitest run src/jobs/ingest-ee-directors.test.ts
Test Files  1 passed (1)
Tests       23 passed (23)
```

From the repository root, `npm run typecheck` passed after building the local TypeScript SDK workspace required by the fresh install.

The full `npm test` run was started, but this constrained environment made two unrelated performance-budget cases in `src/lib/company-enrich/structured-metadata.test.ts` exceed their timing limits. The suite continued running for several minutes after those failures and was stopped; the changed targeted suite remained green.

`npm run context:generate` was run from a temporary isolated worktree, as required by the generator. It completed successfully and updated `docs/project/legacy-authority-inventory.json`; that generated change is included.

Dependency installation also required `npm ci --ignore-scripts`: ordinary `npm ci` could not download `c2pa-node` test certificates because the environment returned `ENETUNREACH` for `raw.githubusercontent.com`.
