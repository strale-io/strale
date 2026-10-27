Intent: Build additive error recovery guidance for autonomous callers, preserve stable codes and statuses, and hand the verified candidate to the orchestrator for a local commit and review/PR workflow.

Implementation is complete in the working tree. **The local commit is blocked:** this session's Git metadata is read-only, so `git add` and `git commit` cannot create `index.lock`. No branch was switched. Nothing was pushed, merged, published, or written to a production database.

## Changes and coverage

- Central recovery policy adds `details.fix` to caller-fixable DEC-19 errors and safe `retryable` / `next_step` advice to service failures, while preserving existing fields.
- Raw REST, both x402 payment versions, MCP and A2A errors retain their protocol envelopes and add recovery guidance. Limits and required-field information use real runtime values. Optional fields are not presented as required; grouped schemas retain their alternatives.
- Shared `inputRefusal(message, field, fix)` carries native field advice through paid/free execution and x402. Failed-transaction polling and partial solutions add safe recovery guidance without replacing existing errors.
- The 30 selected executors have 48 explicit validation refusal sites. Selection is a proxy based on existing local validators, not production traffic rankings. Other executors can adopt explicit fixes later; recognised legacy refusals use the safe classifier fallback.
- OpenAPI and API quickstart describe the new fields. The TypeScript SDK and MCP error text show `details.fix`; MCP no longer replaces authenticated spend-cap 429s with free-tier signup advice. Neither package was published.

Inventory: `archive/sessions/2026-10-27-actionable-errors-inventory.md`.
It records 164 route/middleware emission sites: 120 caller-fix sites and 44 service/mixed execution sites without a guaranteed fix. Execution-failed sites additionally emit a fix when a recognised refusal is available. The appendix records 1,136 original executor throw sites; the rest of that legacy diagnostic inventory was not individually migrated. Counts refer to source sites, not distinct code strings.

## Verification

Evidence: `archive/receipts/2026-10-27-test-run-actionable-error-messages.json` (candidate source hashes and per-command results).

- Full API Vitest: 6126 passed, 346 skipped, no failures. Skips retain the repository's external-prerequisite conditions.
- Focused actionable suite: 175 passed; existing focused paid-route suite: 13 passed.
- MCP-specific suites: 22 passed; SDK: 5 passed. Both package builds pass.
- API `npx tsc --noEmit` and the full root `npm run typecheck` pass.
- All 57 build/type/lint/register/SDK commands in the table below passed. The archive/handoff index check passed separately.
- Both independent reviews report GO after two rounds, with no remaining high or medium findings: `archive/sessions/2026-10-27-actionable-error-messages-review.md`.
- `git diff --check` passes.

### Every CI/build/client command run

| Command | Result |
|---|---|
| `npm --workspace=packages/mcp-server run build` | PASS |
| `npm --workspace=packages/sdk-typescript run build` | PASS |
| `npm run typecheck` | PASS |
| `node apps/api/scripts/check-mjs-syntax.mjs` | PASS |
| `npm --workspace=apps/api run lint:no-bare-catch` | PASS |
| `npm --workspace=apps/api run lint:no-unguarded-user-fetch` | PASS |
| `node apps/api/scripts/check-ssrf-inventory.mjs` | PASS |
| `npm --workspace=apps/api run lint:no-new-console` | PASS |
| `node apps/api/scripts/check-no-external-column-access.mjs` | PASS |
| `node apps/api/scripts/check-framework-packages.mjs` | PASS |
| `npx tsx apps/api/scripts/check-ceo-brief.ts` | PASS |
| `node apps/api/scripts/check-no-committed-secrets.mjs` | PASS |
| `node apps/api/scripts/check-no-direct-getexecutor-in-scripts.mjs` | PASS |
| `node apps/api/scripts/check-fetch-timeout-coverage.mjs --strict` | PASS |
| `node apps/api/scripts/check-manifest-guaranteed-consistency.mjs --strict` | PASS |
| `node apps/api/scripts/check-pii.mjs --strict` | PASS |
| `node apps/api/scripts/check-tier-coverage.mjs --strict` | PASS |
| `node apps/api/scripts/check-identity-fixture-shape.mjs --strict` | PASS |
| `node apps/api/scripts/check-shape-contracts.mjs` | PASS |
| `node apps/api/scripts/check-cost-class-coherence.mjs` | PASS |
| `node scripts/guard-production-write-access.mjs` | PASS |
| `npm run programs:check` | PASS |
| `npm run programs:test` | PASS; 30 tests |
| `npm run research:check` | PASS |
| `npm run research:test` | PASS; 31 tests |
| `npm run design:check` | PASS |
| `npm run design:test` | PASS; 55 tests |
| `npm run env:check` | PASS |
| `npm run env:test` | PASS; 24 tests |
| `npm run vendors:check` | PASS |
| `npm run vendors:test` | PASS; 78 tests |
| `npm run distribution:check` | PASS |
| `npm run distribution:test` | PASS; 15 tests |
| `npm run digest:shadow:test` | PASS; 20 tests |
| `npm run candidates:test` | PASS; 3 tests |
| `npm run protocols:check` | PASS |
| `npm run protocols:test` | PASS; 12 tests |
| `npm run protocols:coverage` | PASS |
| `npm run protocols:coverage:test` | PASS; 16 tests |
| `npm run scheduled:check` | PASS |
| `npm run scheduled:test` | PASS; 43 tests |
| `npm run scheduled:outcomes:test` | PASS; 24 tests |
| `npm run models:check` | PASS |
| `npm run models:test` | PASS; 14 tests |
| `npm run claims:check` | PASS |
| `npm run claims:test` | PASS; 18 tests |
| `npm run docs:check` | PASS |
| `npm run docs:test` | PASS; 6 tests |
| `npm run archive:index:test` | PASS; 12 tests |
| `npm run receipts:check` | PASS |
| `npm run receipts:test` | PASS; 25 tests |
| `npm run migrations:check` | PASS |
| `npm run migrations:test` | PASS; 23 tests |
| `npm run handoff:test` | PASS; 46 tests |
| `npm run context:check` | PASS |
| `npm run context:test` | PASS; 180 tests |
| `npm --workspace=packages/sdk-typescript test` | PASS; 5 tests |

Additional commands: `npm test` (full API result above), `cd apps/api && npx tsc --noEmit` (PASS), the MCP-specific Vitest command naming `mcp.test.ts`, `mcp-conversion.test.ts`, and `mcp-trust-contract.test.ts` (22 PASS), `git diff --check` (PASS), and `node scripts/generate-archive-index.mjs --check` (PASS). PII, receipts and docs checks were rerun after adding the report artifacts.

The initial check runs exposed and then corrected the candidate's type errors, exact-envelope test expectations and one checksum-valid IBAN copied into the inventory. The final pass above is the result used for handoff; no unrelated source was changed to hide a failure.

## Fail-before proof

An isolated archive of main at `79d64589` received only the final regression tests and snapshots, with its own offline dependency install and original SDK/MCP builds. The shared working tree was never reverted or stashed. The repository's mutation runner requires a clean committed candidate, which this read-only Git mount cannot provide, so the isolated baseline was used instead.

- All 175 new actionable-error tests fail on main; four strengthened paid-route assertions also fail (179 API failures total, nine unchanged tests pass).
- The new SDK guidance test fails on main; its four existing client tests pass.
- Failing groups: route/middleware inventory including raw envelopes; refusal helper and 30 executors; invalid date/CSV/domain variants; the six common-error snapshots; real retry times; optional/alternative field constraints; audit-token and freshness guidance; both payment challenge versions; native paid refusal propagation; and MCP fix text / spend-cap 429 handling.
- The candidate's full suite, focused suites, package builds and client tests pass as recorded above.

## Read-only live checks

These checks show the deployed baseline, not deployment of this candidate:

- GET `/v1/capabilities/actionable-errors-no-such-capability`: HTTP 404, `not_found`, message naming the unknown capability, no `details`.
- GET `/v1/wallet/balance` without an API key: HTTP 401, `unauthorized`, missing/invalid Authorization message, no `details`.

## Remaining work and limits

1. The orchestrator must stage and commit the candidate from an environment with writable Git metadata. Suggested message: `feat: give agents actionable recovery guidance for API refusals`. It then handles pushing, opening the PR and merging under the build-agent contract.
2. `npm run context:generate` refuses this clone as a primary worktree. Run it in the orchestrator's permitted batch worktree if the commit hook requires refreshed inventory. The root context checks/tests themselves pass.
3. `npm run handoff:check` was run and does not pass here: uncommitted paths, clone/trunk topology and upstream requirements, and pre-existing merged-branch findings. The explicit no-push/no-switch instructions and read-only Git metadata prevent the prescribed Git fixes. No historical or sibling branches were deleted. Remote findings may be stale because its fetch could not write Git metadata.
4. The 30-manifest onboarding batch with `--dry-run` stops at the production-authority guard before database access. Structural DB validation, readiness and live smoke were not claimed. No manifest, price, upstream access method or production setting changed, so this implementation requires no production data migration.
5. No Notion write was performed in this local-only build session; this handoff is the [BACKFILL] record for the orchestrator.

Database-backed verification left for the authorised operator, for each slug in the inventory's Executor rollout list (run from `apps/api`):

```sh
for slug in \
  email-validate \
  iban-validate \
  vat-validate \
  phone-validate \
  url-to-markdown \
  pdf-extract \
  web-extract \
  dns-lookup \
  ssl-check \
  sanctions-check \
  pep-check \
  adverse-media-check \
  address-parse \
  currency-convert \
  uk-company-data \
  french-company-data \
  japanese-company-data \
  company-id-detect \
  company-news \
  company-tech-stack \
  email-auth-check \
  email-deliverability-check \
  email-reputation-score \
  domain-age-check \
  csv-to-json \
  csv-clean \
  deduplicate \
  date-parse \
  business-day-check \
  address-validate
do
  npx tsx scripts/validate-capability.ts --slug "$slug"
  npx tsx scripts/smoke-test.ts --slug "$slug"
done
```

Readiness: authenticated GET `/v1/internal/onboarding/readiness?slug=<slug>` must report `ready: true` with no issues. Smoke tests can call paid upstreams; they were not run without the required credentials. Re-onboarding with `--discover` is not necessary for an error-only edit and was not attempted.

## Files changed

- `apps/api/src/app.ts`
- `apps/api/src/capabilities/address-parse.ts`
- `apps/api/src/capabilities/address-validate.ts`
- `apps/api/src/capabilities/adverse-media-check.ts`
- `apps/api/src/capabilities/business-day-check.ts`
- `apps/api/src/capabilities/company-id-detect.ts`
- `apps/api/src/capabilities/company-news.ts`
- `apps/api/src/capabilities/company-tech-stack.ts`
- `apps/api/src/capabilities/csv-clean.ts`
- `apps/api/src/capabilities/csv-to-json.ts`
- `apps/api/src/capabilities/currency-convert.ts`
- `apps/api/src/capabilities/date-parse.ts`
- `apps/api/src/capabilities/deduplicate.ts`
- `apps/api/src/capabilities/dns-lookup.ts`
- `apps/api/src/capabilities/domain-age-check.ts`
- `apps/api/src/capabilities/email-auth-check.ts`
- `apps/api/src/capabilities/email-deliverability-check.ts`
- `apps/api/src/capabilities/email-reputation-score.ts`
- `apps/api/src/capabilities/email-validate.ts`
- `apps/api/src/capabilities/french-company-data.ts`
- `apps/api/src/capabilities/iban-validate.ts`
- `apps/api/src/capabilities/japanese-company-data.ts`
- `apps/api/src/capabilities/pdf-extract.ts`
- `apps/api/src/capabilities/pep-check.ts`
- `apps/api/src/capabilities/phone-validate.ts`
- `apps/api/src/capabilities/sanctions-check.ts`
- `apps/api/src/capabilities/ssl-check.ts`
- `apps/api/src/capabilities/uk-company-data.ts`
- `apps/api/src/capabilities/url-to-markdown.ts`
- `apps/api/src/capabilities/vat-validate.ts`
- `apps/api/src/capabilities/web-extract.ts`
- `apps/api/src/lib/__snapshots__/actionable-errors.test.ts.snap`
- `apps/api/src/lib/actionable-errors.test.ts`
- `apps/api/src/lib/api-keys.test.ts`
- `apps/api/src/lib/capability-refusal.ts`
- `apps/api/src/lib/errors.ts`
- `apps/api/src/lib/x402-gateway.ts`
- `apps/api/src/openapi.ts`
- `apps/api/src/routes/a2a.ts`
- `apps/api/src/routes/api-keys.integration.test.ts`
- `apps/api/src/routes/api-keys.test.ts`
- `apps/api/src/routes/api-keys.ts`
- `apps/api/src/routes/audit.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/routes/dispute.ts`
- `apps/api/src/routes/do.core.test.ts`
- `apps/api/src/routes/do.ts`
- `apps/api/src/routes/mcp.ts`
- `apps/api/src/routes/primary-key-boundary.test.ts`
- `apps/api/src/routes/solution-execute.ts`
- `apps/api/src/routes/suggest.ts`
- `apps/api/src/routes/transactions.ts`
- `apps/api/src/routes/wallet.ts`
- `apps/api/src/routes/x402-gateway-v2.ts`
- `archive/README.md`
- `archive/receipts/2026-10-27-test-run-actionable-error-messages.json`
- `archive/sessions/2026-10-27-actionable-error-messages-review.md`
- `archive/sessions/2026-10-27-actionable-errors-inventory.md`
- `docs/api-quickstart.md`
- `handoff/README.md`
- `handoff/_general/from-code/2026-10-27-actionable-error-messages.md`
- `packages/mcp-server/src/tools.ts`
- `packages/sdk-typescript/src/client.ts`
- `packages/sdk-typescript/src/errors.ts`
- `packages/sdk-typescript/src/types.ts`
- `packages/sdk-typescript/test/actionable-errors.test.mjs`


## Round 2

Intent: resolve the independent review's eight should-fix items and all listed nits, rerun the required gates, and leave the complete candidate uncommitted in the same checkout for the orchestrator. This explicit instruction supersedes the earlier local-commit plan. No branch switch, push, PR, merge, package publication, production database write or production-setting change was performed.

Evidence: `archive/receipts/2026-10-27-test-run-actionable-error-messages-round-2.json`. The Round 1 receipt remains unchanged and write-once.

### Findings resolved

1. Admin authentication: both shared-admin branches, both onboarding branches, and every internal-health-monitor 401 now supply `retryable: false` and truthful admin/operator `next_step` details. Misconfiguration directs the caller to the operator. Customer-key recovery advice remains on customer auth. Regression tests evaluate every affected emission expression.
2. Free-tier rate limit: the server fix names the actual reset time and the signup URL, €2 credits, and API-key header. Anonymous MCP text retains signup even when an older API supplies only retry advice, without duplicating a signup URL already supplied by the server. The `rate_limited` funnel event is emitted exactly once for every HTTP 429, authenticated or anonymous, as before this PR; only error presentation is scoped to anonymous free-tier errors.
3. SDK contract: `StraleError.message` stays exactly the API message. Optional, type-checked `fix`, `retryable`, and `nextStep` properties read the corresponding details fields. SDK README, API quickstart and tests agree. No package was published.
4. Refusal strings: access-policy refusals name a different URL/source and disallow retrying unchanged input. A field is inferred only from the strict quoted identifier plus `must be` pattern; a quoted caller domain is never treated as a field. Explicit native refusal metadata remains intact.
5. Legacy execution failures: the existing transaction failure classifier supplies non-retryable input-schema advice for caller-input errors even without a refusal marker, including historical transaction responses. Service failures retain backoff advice.
6. Solution errors: the result retry flag is `allFailed`. Fully failed runs are refunded and can be retried. Partial runs warn that a rerun charges the solution price again. Checked against the actual `refundRequired` / `chargedPrice` branches, rather than assuming step-by-step billing.
7. Account spend cap: advice now says to wait for rolling spend below `limit_cents` or contact support to change the account limit. Per-key guidance still names PATCH `/v1/api-keys/:id`.
8. Executor wording: all 48 advice sites were reviewed against their manifest schemas. Awkward/generic text now names the real field and accepted format, including screening names, email addresses, web URLs, CSV/JSON, IBAN/VAT, and company identifiers. UK Companies House capitalization is corrected. French and UK manifests now expose the `company_name` alternative already accepted by the executors; compatibility with names in the old identifier field is retained. Tests check every quoted advice field against the manifest.

All nits are resolved: unknown client IP is non-retryable with HTTP-client guidance; x402 schema advice has one trailing period; body-limit advice and middleware share constants; inserted imports follow existing header comments; A2A derives failed-transaction recovery once; the recovery switch accepts typed `ErrorCode` and uses `satisfies never`, so adding a union member without advice fails typecheck. The runtime fallback remains safe for untyped protocol data. The route walk includes raw do/x402 error-code envelopes, unauthorized and payment failures, and checks fix advice versus service retry/next-step advice.

### Declared quality-accounting change

The nine pinned caller-input examples below are recorded as `capability_refusal` when the executor throws the typed input refusal; their old bare-message form was `internal_error`. This is the intended attribution under LESSONS F1. The test also pins the unchanged bare-string categorization and the existing timeout, upstream, rate-limit, schema and internal categories. Round 2 changes neither `categorizeError` nor its pattern tables and introduces no further category changes.

- `Name must be at least 2 characters for sanctions screening.`
- `Name must be at least 2 characters for PEP screening.`
- `Name must be at least 2 characters for adverse media screening.`
- `Invalid date format. Use YYYY-MM-DD.`
- `CSV is empty.`
- `CSV has no data rows.`
- Required-field refusals such as `'email' is required.` (the review's `'x' is required…` family; each executor retains its original field and message).
- `Invalid URL: "<caller URL>".`
- `IP addresses have no email-authentication DNS records — provide a domain name.`

Historical quality rows are not rewritten. The trust-surface metric shifts from deploy time onward as newly captured typed refusals replace the old attribution. Existing string-only historical transaction advice can improve at read time without rewriting quality rows or transaction evidence.

### Fail-before evidence for this round

Tests were added and run against the unmodified Round 1 working tree before implementation; no clone, bundle, source reversion, stash or external scratch artifact was used.

- API Round 2 suite initially had 77 cases: **35 failed and 42 passed**. The 35 failures were the three admin-source checks; free-tier reset/signup; anonymous signup and authenticated 429 telemetry; two access-policy markers; caller-domain field inference; legacy caller-input execution failure; fully failed and partial solution advice; account spend-cap text; unknown-IP advice; doubled x402 period; and 20 executor advice sites (address-parse, address-validate, adverse-media-check twice, company-id-detect, csv-clean, deduplicate, dns-lookup, email-deliverability-check, email-reputation-score, email-validate, french-company-data, pep-check twice, sanctions-check twice, ssl-check, uk-company-data, url-to-markdown, vat-validate).
- The SDK message/property regression failed before the SDK correction; the four existing SDK tests and the invalid-property guard passed.
- The two subsequently added company-name schema regressions were checked against the unchanged HEAD manifests in memory using `git show`; both fail on that baseline. No checkout was modified for that check.
- The 42 initially passing API cases are preservation guards: nine accounting examples, five unchanged quality categories, and 28 already-acceptable advice sites. They are not represented as newly failing regressions. The expanded route walk is additional coverage of the existing error inventory; its new passing cases are not claimed as fail-before failures.

### Operational limits and production follow-up

Both manifest `onboard.ts --dry-run` invocations stopped at `ProductionAuthorityError`: no production write credential is available. No authority override was attempted. DB-backed structural validation, readiness and live executor smoke remain unverified, as in Round 1. This limitation follows the onboarding skill's explicit instruction: “If this session does not hold the credential, the status is AUTHORIZATION_UNAVAILABLE: stop and report.” The source is `.agents/skills/onboard-capability/SKILL.md`, section 3. Only the database-dependent pipeline stopped; all authorized local edits and checks continued.

The authorized operator must apply the two schema corrections through the existing manifest pipeline, then run validation, smoke and readiness checks. From `apps/api`:

```sh
npx tsx scripts/onboard.ts --manifest ../../manifests/french-company-data.yaml --backfill
npx tsx scripts/onboard.ts --manifest ../../manifests/uk-company-data.yaml --backfill
npx tsx scripts/validate-capability.ts --slug french-company-data
npx tsx scripts/validate-capability.ts --slug uk-company-data
npx tsx scripts/smoke-test.ts --slug french-company-data
npx tsx scripts/smoke-test.ts --slug uk-company-data
```

Authenticated GET `/v1/internal/onboarding/readiness?slug=french-company-data` and the equivalent `uk-company-data` request must return `ready: true`. Round 1's remaining checks for the other error-only executor changes still apply. No new executor, vendor, price or access method was introduced; no discover invocation is needed for these corrections.

Read-only live checks were repeated: GET `/v1/capabilities/actionable-errors-no-such-capability` returned HTTP 404 `not_found`, and unauthenticated GET `/v1/wallet/balance` returned HTTP 401 `unauthorized`; both deployed responses still have no details. These are baseline observations, not evidence of deployment.

`npm run handoff:check` was run and failed on the intentionally uncommitted tree, trunk/branch topology, absent branch upstream, and pre-existing merged branches; fetch could not update Git metadata, so remote findings may be stale. The explicit keep-uncommitted/no-push/no-switch instructions take precedence over its suggested Git actions. Sibling work and branches were left alone. Independent review's supplied GO is the starting verdict for this round; the orchestrator owns review of these fixes and shipping. No fresh independent post-fix verdict is claimed.


Round 2 adds these paths to the earlier changed-file list: `apps/api/src/lib/actionable-errors-round2.test.ts`, `apps/api/src/lib/admin-auth.ts`, `apps/api/src/lib/db-rate-limit.ts`, `apps/api/src/routes/internal-health-monitor.ts`, `apps/api/src/routes/internal-onboarding.ts`, `manifests/french-company-data.yaml`, `manifests/uk-company-data.yaml`, `packages/sdk-typescript/README.md`, and the new Round 2 receipt. The earlier listed API/SDK/MCP sources, tests and docs carry the corresponding corrections; generated archive/handoff indexes are refreshed.


### Round 2 verification results

Evidence: `archive/receipts/2026-10-27-test-run-actionable-error-messages-round-2.json`.

- Final full API Vitest: **6248 passed, 346 skipped**, across 344 passing and 33 skipped files; no failures.
- Final actionable suites: **297 passed** (218 route/refusal tests plus 79 Round 2 tests).
- Combined focused route/SDK-facing/API-key/MCP suites: 373 passed, 24 skipped before the two schema tests were added; the final full run includes them.
- SDK build and tests: **6 passed**. MCP build passes, repeated after the final text correction.
- API `npx tsc --noEmit` passes; full root `npm run typecheck` passes.
- All **57 CI/build/client commands** below pass; their root Node test suites contribute **704 passing tests**, separately from SDK and API totals. No prerequisite setup command or disposable-database integration job is claimed as run.
- The first full API run passed 6246 tests before the two schema guards were added. The next final-tree run had one existing verify short-chain test time out at 10000ms while other verification was running (6247 passed, 346 skipped). The unchanged verify file passed all 17 tests alone, and the final full suite passed all 6248 without competing verification. No timeout, fixture or unrelated code was changed.
- `git diff --check` passes. The archive index, receipts, docs and PII guards are checked again after the report artifacts are written.

| Command | Round 2 result |
|---|---|
| `npm run typecheck` | PASS |
| `node apps/api/scripts/check-mjs-syntax.mjs` | PASS |
| `npm --workspace=apps/api run lint:no-bare-catch` | PASS |
| `npm --workspace=apps/api run lint:no-unguarded-user-fetch` | PASS |
| `node apps/api/scripts/check-ssrf-inventory.mjs` | PASS |
| `npm --workspace=apps/api run lint:no-new-console` | PASS |
| `node apps/api/scripts/check-no-external-column-access.mjs` | PASS |
| `node apps/api/scripts/check-framework-packages.mjs` | PASS |
| `npx tsx apps/api/scripts/check-ceo-brief.ts` | PASS |
| `node apps/api/scripts/check-no-committed-secrets.mjs` | PASS |
| `node apps/api/scripts/check-no-direct-getexecutor-in-scripts.mjs` | PASS |
| `node apps/api/scripts/check-fetch-timeout-coverage.mjs --strict` | PASS |
| `node apps/api/scripts/check-manifest-guaranteed-consistency.mjs --strict` | PASS |
| `node apps/api/scripts/check-pii.mjs --strict` | PASS |
| `node apps/api/scripts/check-tier-coverage.mjs --strict` | PASS |
| `node apps/api/scripts/check-identity-fixture-shape.mjs --strict` | PASS |
| `node apps/api/scripts/check-shape-contracts.mjs` | PASS |
| `node apps/api/scripts/check-cost-class-coherence.mjs` | PASS |
| `node scripts/guard-production-write-access.mjs` | PASS |
| `npm run programs:check` | PASS |
| `npm run programs:test` | PASS; 30 tests |
| `npm run research:check` | PASS |
| `npm run research:test` | PASS; 31 tests |
| `npm run design:check` | PASS |
| `npm run design:test` | PASS; 84 tests |
| `npm run env:check` | PASS |
| `npm run env:test` | PASS; 24 tests |
| `npm run vendors:check` | PASS |
| `npm run vendors:test` | PASS; 78 tests |
| `npm run distribution:check` | PASS |
| `npm run distribution:test` | PASS; 15 tests |
| `npm run digest:shadow:test` | PASS; 20 tests |
| `npm run candidates:test` | PASS; 3 tests |
| `npm run protocols:check` | PASS |
| `npm run protocols:test` | PASS; 12 tests |
| `npm run protocols:coverage` | PASS |
| `npm run protocols:coverage:test` | PASS; 16 tests |
| `npm run scheduled:check` | PASS |
| `npm run scheduled:test` | PASS; 43 tests |
| `npm run scheduled:outcomes:test` | PASS; 24 tests |
| `npm run models:check` | PASS |
| `npm run models:test` | PASS; 14 tests |
| `npm run claims:check` | PASS |
| `npm run claims:test` | PASS; 18 tests |
| `npm run docs:check` | PASS |
| `npm run docs:test` | PASS; 6 tests |
| `npm run archive:index:test` | PASS; 12 tests |
| `npm run receipts:check` | PASS |
| `npm run receipts:test` | PASS; 25 tests |
| `npm run migrations:check` | PASS |
| `npm run migrations:test` | PASS; 23 tests |
| `npm run context:test` | PASS; 180 tests |
| `npm --workspace=packages/sdk-typescript test` | PASS; 6 tests |
| `npm --workspace=packages/mcp-server run build` | PASS |
| `npm --workspace=packages/sdk-typescript run build` | PASS |
| `npm run handoff:test` | PASS; 46 tests |
| `npm run context:check` | PASS |
