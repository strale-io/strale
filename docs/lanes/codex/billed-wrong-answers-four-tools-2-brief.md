Intent: Codex builder brief: review fixes for billed-wrong-answers-four-tools (round 2).

# Brief: billed-wrong-answers-four-tools review fixes

- **Requester:** the Strale master (session_01Ms71ZnJsKfZn5eCYBzr5kL), 2026-11-15.
  - This follows an independent review of `codex/billed-wrong-answers-four-tools` at 2c3e01fa. The verdict was NO-GO on one finding; everything else matched the brief.
  - The original brief's wording ("the same headers as the other API calls (the token when present)") caused that finding. The other calls on `main` send no token.
- **Branch:** push only `codex/billed-wrong-answers-four-tools-2`. It starts from `codex/billed-wrong-answers-four-tools`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only, with no secrets. All tests run offline with `fetch` stubbed, like the existing ones.
- **Read first:**
  - `docs/lanes/codex/billed-wrong-answers-four-tools-brief.md` (the original brief);
  - `docs/lanes/codex/billed-wrong-answers-four-tools-report.md` (your report);
  - the diff `git diff origin/main...HEAD`.

## Fix these

1. **github-repo-analyze must not send a GitHub token (blocking).**
   - **What is wrong:** `apps/api/src/capabilities/github-repo-analyze.ts` now adds `Authorization: Bearer ${GITHUB_TOKEN}` to the shared headers, so all five GitHub API calls carry the production token for a repository the caller names. On `main` none of them do.
   - **The fix:**
     - delete the line `if (process.env.GITHUB_TOKEN) headers.Authorization = ...`, so every call, the README call included, is unauthenticated as on `main`;
     - revert the `GITHUB_TOKEN` `purpose` edit in `config/env-manifest.yaml` to its `origin/main` text;
     - keep the README call on `/repos/{owner}/{repo}/readme` with `Accept: application/vnd.github.raw`.
   - **Test:** with `GITHUB_TOKEN` set in the test environment, assert that no request the capability makes carries an `Authorization` header. It must fail on the current branch head (2c3e01fa) and pass after the fix. Restore any temporary revert with `git checkout HEAD -- <path>`; never use `git stash`.
2. **holiday-calendar: a body that does not parse is not worth retrying.**
   - **Where:** the two `UpstreamUnavailableError("Nager.Date", ..., { code: "unparseable" })` throws in `apps/api/src/capabilities/holiday-calendar.ts`.
   - **The fix:** pass `retryable: false` on both, matching how `fetchUnavailable` treats a body that did not parse.
   - **Test:** extend the existing unparseable tests to assert `retryable === false`.

## Leave the rest alone

- No other change to eori-validate, startup-domain-check or github-repo-analyze.
- Do not touch github-repo-compare, github-user-profile or social-profile-check, even though they read `GITHUB_TOKEN`; that is a separate piece of work.
- No change to prices, categories, fixture inputs, routing, billing, the circuit breaker, the database, migrations or environment variables.

## Verification to run

- `npm --workspace=apps/api exec vitest run src/capabilities/business-day-eori.upstream-failures.test.ts src/capabilities/holiday-calendar.test.ts src/capabilities/web-and-lookup.upstream-failures.test.ts src/capabilities/registry-body-caps.test.ts`
- `npm --workspace=apps/api run lint:upstream-catches -- --base $(git merge-base origin/main HEAD)`
- `npm run typecheck`. Build `packages/sdk-typescript` and `packages/mcp-server` first if their artifacts are missing.
- `npm run env:check`, `npm run claims:check` and `npm run models:check`

## Report

Write `docs/lanes/codex/billed-wrong-answers-four-tools-2-report.md` with:
- files changed;
- tests added or extended (names) and the fail-before result for each;
- the verification commands and their results;
- anything not done, and why.
