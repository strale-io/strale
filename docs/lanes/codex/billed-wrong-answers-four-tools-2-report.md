# Billed wrong answers: four tools — review-fix report (round 2)

## Files changed

- `apps/api/src/capabilities/github-repo-analyze.ts` — removed use of `GITHUB_TOKEN`, so every request made for a caller-selected repository remains unauthenticated; the preferred README endpoint and its raw media type are unchanged.
- `config/env-manifest.yaml` — restored the `GITHUB_TOKEN` purpose to the `origin/main` wording, which names only the capabilities that still read it.
- `apps/api/src/capabilities/holiday-calendar.ts` — marks both JSON parse failures and parsed non-list/invalid-list bodies as non-retryable upstream failures.
- `apps/api/src/capabilities/web-and-lookup.upstream-failures.test.ts` — added coverage proving that no `github-repo-analyze` request carries `Authorization` even when `GITHUB_TOKEN` is set.
- `apps/api/src/capabilities/holiday-calendar.test.ts` and `apps/api/src/capabilities/business-day-eori.upstream-failures.test.ts` — extended the existing unparseable-body and invalid-shape cases to require `retryable: false`.
- `docs/lanes/codex/billed-wrong-answers-four-tools-2-report.md` — this report.

## Tests added or extended, including fail-before evidence

- Added **github-repo-analyze negative: what GitHub says is absent keeps its output › never sends a configured GitHub token to caller-selected repositories**. Before the implementation fix, it failed because the observed requests did carry `Authorization`.
- Extended **holiday-calendar › a 200 with an unparseable body yields a structured error** to assert `retryable: false`. Before the implementation fix, it failed with `retryable: true`.
- Extended **holiday-calendar › a 200 object is an upstream shape failure and is not cached** to assert `retryable: false`. Before the implementation fix, it failed with `retryable: true`.
- Extended **business-day-check: Nager.Date failures throw (row 17) › throws, unbilled, when Nager.Date answers 200 with a body that does not parse** to assert `retryable: false`. Before the implementation fix, it failed with `retryable: true`.
- Extended **business-day-check: Nager.Date failures throw (row 17) › throws, unbilled, when Nager.Date answers 200 with JSON that is not a holiday list** to assert `retryable: false`. Before the implementation fix, it failed with `retryable: true`.
- The combined fail-before run produced exactly those five failures and left the other 157 tests passing.

## Verification

- `npm --workspace=apps/api exec vitest run src/capabilities/business-day-eori.upstream-failures.test.ts src/capabilities/holiday-calendar.test.ts src/capabilities/web-and-lookup.upstream-failures.test.ts src/capabilities/registry-body-caps.test.ts` — passed: 4 files, 173 tests.
- `npm --workspace=apps/api run lint:upstream-catches -- --base $(git merge-base origin/main HEAD)` — passed: 407 files, 284 handlers, 147 existing findings and 31 documented exceptions.
- `npm run typecheck` — the first run reached the package checks but failed because the SDK build artifact was absent; after the two builds below, the full workspace command passed.
- `npm --workspace=packages/sdk-typescript run build` — passed.
- `npm --workspace=packages/mcp-server run build` — passed.
- `npm run env:check` — passed: 138 environment reads checked against 143 manifest rows.
- `npm run claims:check` — passed: claims register contract.
- `npm run models:check` — passed: 1,096 source/script files checked.
- `git diff --check` — passed.

## Not done

- Per the round-2 brief, no changes were made to eori-validate, startup-domain-check, github-repo-compare, github-user-profile, social-profile-check, prices, categories, fixtures, routing, billing, the circuit breaker, database state, migrations or environment variables.
- Per the original brief retained by this review-fix brief, database-backed capability validation, readiness and smoke tests were not run; those belong to the review session.
- No branch was pushed, labelled, approved, merged or commented on from this environment.
