Intent: Implement H6 input validation and shared fetch hardening, ship validation in report-only mode, and leave the uncommitted changes for the orchestrator to review and ship.

[BACKFILL] Local session record; no Notion writes, production requests, Railway access, secret inspection, commits, pushes, PRs or publication were performed. The specific instruction not to commit takes precedence over the generic build-agent instruction to commit locally. This is the provided isolated clone on `feat/fetch-hardening`, based on `origin/main` at `e40b1f69`.

## Implemented

- Cached Ajv + ajv-formats input validation at `POST /v1/do` and the x402 capability and solution handlers. `INPUT_VALIDATION_MODE=report` is the default; only `enforce` refuses. Warnings contain `label: input-schema-mismatch`, slug, rail and JSON-pointer instance paths, without values, Ajv messages or params. Legacy required-field/envelope checks still run, preserving existing refusals in report mode. Wallet/x402/free rails are distinguishable. Enforce returns HTTP 400 `invalid_input` with `details.fix` before reservations or x402 claims. The requested `invalid_input` variant was absent from this checkout's ErrorCode union, so it was added there.
- `config/env-manifest.yaml` registers the optional flag. `npm run env:example` regenerated both example files without a diff: the existing generator includes only locally required variables, while this flag has a report fallback and is optional everywhere.
- Schemas compile once per schema content and reuse validators across deserialized copies. Cache size is bounded; evictions remove Ajv's own cache entry too. Validation never coerces or removes caller data.
- `safeFetch` inherits acquisition method from the manifest through the executor registry's async context, with an explicit method override for mixed API/page helpers. `public_page_read` and `customer_directed_fetch` check robots before every page/redirect request and use the existing honest StraleBot user agent. Vendor/direct API methods skip robots. Internal robots requests explicitly use the API path to prevent recursion. The lazy robots import avoids a static module cycle.
- Reused the existing bounded robots parser/cache: one hour for rules or 4xx, five minutes for unreachable results, concurrent same-origin coalescing. All robots 4xx, including 429, allow access; 5xx, unresolved redirects, transport failures and timeouts refuse access. Five-second robots timeout includes DNS validation and response body consumption; late DNS completion cannot open a socket. Restricted targets and ToS refusals remain validation/policy errors instead of becoming transport failures. Page disallow is structured `robots_disallow`; unreachability is `robots_unavailable`, reusing existing errors. Unavailable robots offers a retry after five minutes, without an alternate-route retry in the current call. Public-page sources retain source-failure classification; caller-selected URLs retain refusal classification.
- Pino redaction applies before stdout or the optional transport. Root/header paths plus recursive redaction cover authorization, API keys, token variants, password, payment headers/signatures and email, including arrays, mixed header casing and nested Error metadata. No sink was enabled. This is structured-field redaction; arbitrary secret text embedded in free-form messages, stacks or URL strings is not claimed to be scrubbed.
- Removed three duplicate admin credential comparisons, including the additional copy in `internal-tests.ts`; all use `lib/admin-auth.ts`. Existing mount-level auth and special onboarding-run credentials remain. Route tests exercise every handler that used the duplicate checks with missing, wrong and correct credentials; downstream work is mocked, so correct credentials prove admission rather than successful DB mutations.
- Shared SSRF predicate now covers benchmark, multicast/reserved, documentation, NAT64 and 6to4 ranges, plus IPv6 canonicalization. Tests exercise both URL DNS resolution and connection-time lookup. Previously covered CGNAT and mapped-private addresses remain covered.

## Verification

Evidence: [test-run receipt](../../../archive/receipts/2026-10-28-test-run-fetch-hardening.json) and [stable-source full-suite receipt](../../../archive/receipts/2026-10-28-test-run-fetch-hardening-stable-snapshot.json). The receipt records the uncommitted source hashes, baseline, fail-before outcomes, final test results and check statuses. Do not treat its base commit as a commit containing these changes.

Fail-before method: the requested `git checkout origin/main -- <paths>` failed because this sandbox mounts `.git` read-only (`index.lock`: read-only filesystem). Used exact `git show origin/main:<path>` bytes instead, after copying each changed source into a scratch folder inside this checkout. Each group restored its changed sources in `finally`; the scratch folder was deleted. No stash was used. Dispatch, robots, redaction, admin consolidation, SSRF and acquisition-context regression groups failed against baseline sources. Existing SSRF ranges correctly remained green.

The first full-suite run exposed H6 integration failures, which were fixed, not classified as pre-existing flakes: a circular partial-mock import, SSRF error masking, and the exact body-cap call-site inventory. Review amendments also overlapped that run, so it is not the final-snapshot result. The body-cap inventory remains exact and checks every new catch rethrows BodyLimitError.

Independent review: [review record](../../../archive/sessions/2026-10-28-fetch-hardening-review.md). Two fresh read-only contexts, technical and product lenses, two rounds. Nested Error redaction, the DNS deadline and transient recovery findings were fixed and regression-tested; final constructor typing corrections passed an isolated source typecheck. No open HIGH/MEDIUM findings.

The handoff gate is expected to fail under the build-agent contract: changes remain uncommitted; the provided clone is on the feature branch and tracks origin/main rather than a pushed feature upstream; historical merged branches remain. The checker also notes another active sibling worktree. No branch, worktree or foreign change was deleted or switched. Git metadata is read-only in this sandbox. These findings were recorded, not acted on, because the user expressly prohibited committing, pushing and branch switching.

Final command results and any isolated reruns are recorded in the receipt; closeout details follow below.

## Deploy mechanism and remaining steps

No active Railway config file is added. The root Dockerfile requires the repo-root context, but this session cannot confirm the live service root, custom config path, build source or sibling-service configuration. Adding a root file could also affect the digest service. This uses the prompt's explicit handoff-only fallback.

Railway's [config-as-code reference](https://docs.railway.com/config-as-code/reference) says `railway.json` and `railway.toml` are recognized, deployment values override dashboard settings, and deployment details show file-origin settings. Confirm the applicable configuration mechanism for this service before using either file. The documentation observed during this session also directs new configurations toward infrastructure as code; do not assume legacy file support without checking the service.

Proposed API-only TOML, **not an active config**:

```toml
[build]
builder = "DOCKERFILE" # Confirm service root/config path with Petter (Railway access holder).
dockerfilePath = "Dockerfile" # Confirm repo-root context; apps/api/Dockerfile does not exist.

[deploy]
startCommand = "node apps/api/dist/index.js" # Matches Dockerfile CMD; confirm no dashboard override.
healthcheckPath = "/health/deep" # Historic source evidence only; confirm current live path with Petter.
# healthcheckTimeout = <measured worst-case cold boot + readiness margin, seconds>
# Measure with a disposable database/image before proposing a number.
restartPolicyType = "ON_FAILURE" # Recommended, live value unknown: confirm with Petter.
restartPolicyMaxRetries = 10 # Recommended, live value unknown: confirm with Petter.
```

Confirm with Petter (Railway access holder): service root and custom config path, actual healthcheck path/timeout, restart policy/retries, start override and other services sharing this repository. `apps/api/src/index.ts` records historic `/health/deep` and a 20-second retry window, while its DB retry budget defaults to ten minutes before listening; this is not a current live measurement. No safe new numeric healthcheck timeout was measured here. After measuring normal and degraded disposable cold boots, choose a timeout with margin or address the pre-listen budget in a separate change. Do not copy the historic 20 seconds or invent a measured number.

Once confirmed, place an API-scoped config at the confirmed path (or adopt Railway's applicable IaC mechanism) and verify a preview deployment's effective settings/source indicators before production. Railway reads the config when creating a deployment; it does not rewrite the dashboard values. Keep cron/digest settings separate. The existing `apps/api/railway-config.md` remains historical and must not be used as a live settings reference.

Runtime code reach: root `Dockerfile` builds the MCP package and `apps/api`, then runs `node apps/api/dist/index.js`; `src/index.ts` imports `app.ts`, which mounts `doRoute` and `x402GatewayV2`. Those handlers import `lib/input-validation.ts`, so an unset flag reaches the report default without an env provisioning step. `autoRegisterCapabilities` loads manifest access metadata, and `getExecutor` propagates it to `safeFetch`; the same request path imports `log.ts`. No migration or scheduled job is required.

After the orchestrator reviews and deploys (not done here):

1. Verify `/health` deployment identity against the reviewed commit and readiness at `/health/deep`.
2. Keep `INPUT_VALIDATION_MODE` unset or `report`. Collect seven consecutive days of clean reports with representative wallet and x402 traffic. Zero traffic is not clean evidence; fix manifest/executor mismatches first. Production schema contents may differ from local manifests, so local compilation is not a production schema audit.
3. In a disposable/staging environment, send a wrong-type input to wallet and both x402 handlers: report must execute and emit only paths, enforce must return 400 `invalid_input`, with no reservation/payment-claim row. Verify the invalid call produces no money-side-effect row using read-only queries scoped to the staging request/payment hash; verify the valid control request executes normally. Then separately enable enforcement under the normal release process.
4. Verify allowed/disallowed page controls and a vendor API control, plus structured secret redaction before enabling any external log sink. Do not send synthetic secrets or invalid paid requests to production for this verification.

Production verification, live Railway confirmation and enforcement rollout remain outstanding. T6 remains open. Its evidence list is left unchanged because the register checker requires git-tracked evidence, while this task must stay uncommitted and the sandbox forbids index writes. The orchestrator can add the receipt to the evidence list when staging the reviewed change. No capability, manifest, startup migration, production setting or external claim was changed.

## Command results

All counts below are backed by the [receipt](../../../archive/receipts/2026-10-28-test-run-fetch-hardening.json) and [stable-source full run](../../../archive/receipts/2026-10-28-test-run-fetch-hardening-stable-snapshot.json). The last full run started after every source edit and reproduced the green result with sources held unchanged.

| Command / verification | Result |
|---|---|
| MCP workspace build | Completed without compiler errors. |
| API source typecheck | Final isolated run passed; intermediate retry-metadata typing errors were corrected. |
| Full API Vitest suite | Green full run: 405 files, 7,512 passed, 358 pending/skipped, zero failures. No isolated flaky-file reruns needed for the green run. The earlier full run had 16 failures, all resolved before this result. |
| Every new/touched test file | Final post-restoration run: nine files, 198 passed, zero failures. |
| Fail-before | Six source groups failed using exact baseline bytes; changed sources restored and scratch snapshot deleted. |
| `npm run env:example` | Passed; both generated files unchanged, as explained above. |
| `npm run env:check` | Passed. |
| `npm run migrations:check` | Passed. |
| `npm run receipts:check` | Passed; 19 historical bare-test-count warnings, none introduced by this handoff. |
| `npm run programs:check` | Passed, including updated T6 next action. |
| `npm run docs:check` | Passed. |
| `npm run claims:check` | Passed. |
| `npm run models:check` | Passed. |
| `git diff --check` | Passed. |
| `npm run handoff:check` | Expected failure: dirty, branch, ahead and merged-branch findings under the provided clone/build-agent contract. |
| Live / production checks | Not run; prohibited by this task. No live outputs are claimed. |

## Files changed

- `apps/api/src/capabilities/fetch-context.test.ts`
- `apps/api/src/capabilities/index.ts`
- `apps/api/src/lib/capability-refusal.ts`
- `apps/api/src/lib/data-access.ts`
- `apps/api/src/lib/errors.ts`
- `apps/api/src/lib/input-validation.test.ts`
- `apps/api/src/lib/input-validation.ts`
- `apps/api/src/lib/log-redaction.test.ts`
- `apps/api/src/lib/log.ts`
- `apps/api/src/lib/robots-txt.test.ts`
- `apps/api/src/lib/robots-txt.ts`
- `apps/api/src/lib/safe-fetch-hardening.test.ts`
- `apps/api/src/lib/safe-fetch.ts`
- `apps/api/src/lib/site-access.ts`
- `apps/api/src/lib/url-validator.ts`
- `apps/api/src/routes/admin-shared-auth.test.ts`
- `apps/api/src/routes/do.core.test.ts`
- `apps/api/src/routes/do.ts`
- `apps/api/src/routes/internal-health-monitor.ts`
- `apps/api/src/routes/internal-onboarding.ts`
- `apps/api/src/routes/internal-tests.ts`
- `apps/api/src/routes/x402-body-limit.route.test.ts`
- `apps/api/src/routes/x402-gateway-v2.ts`
- `apps/api/src/routes/x402-money-path.test.ts`
- `archive/receipts/2026-10-28-test-run-fetch-hardening.json`
- `archive/receipts/2026-10-28-test-run-fetch-hardening-stable-snapshot.json`
- `archive/sessions/2026-10-28-fetch-hardening-review.md`
- `config/env-manifest.yaml`
- `docs/programs/platform-hardening/tracks.yaml`
- `handoff/_general/from-code/2026-10-28-fetch-hardening.md`

## Staging effect queries (not executed here)

Use a dedicated disposable staging user and bounded timestamps; bind parameters rather than interpolating values. For a wallet enforce refusal, both counts must be zero for the invalid request's idempotency key/time window. A valid control request must create its normal transaction and reservation. For an x402 enforce refusal, the hash/attempt count must be zero; the actual signed payment header must never be printed or stored in the query notes.

```sql
SELECT COUNT(*) AS transaction_rows
FROM transactions
WHERE user_id = $1::uuid AND idempotency_key = $2;

SELECT COUNT(*) AS reservation_rows
FROM wallet_reservations
WHERE user_id = $1::uuid
  AND created_at >= $2::timestamptz AND created_at < $3::timestamptz;

SELECT COUNT(*) AS payment_claim_or_attempt_rows
FROM transactions
WHERE x402_payment_hash = $1
   OR x402_execution_attempts->>'paymentHash' = $1;
```

These are read-only observations of the staging effect, supplementing the route tests that directly assert no reservation or claim call. Production rollout proof is still pending; no production result is asserted by this handoff.

## Round 2

Intent: Address the independent review's two HIGH findings and three smaller findings, preserving the uncommitted build-agent boundary. This section supersedes the earlier section's claim that the reviewed working tree had no remaining HIGH/MEDIUM issues: the orchestrator's independent NO-GO identified the defects repaired here.

### Changes and policy reading

- Schema compilation and validation are caught; failed schema keys cache `null`. Report mode emits `input-schema-compile-failed` once per cached schema key with slug and rail, without schema contents, input values or compiler messages, then continues. Enforce returns HTTP 503 `capability_unavailable` with `details.fix` at every wallet/x402 dispatch site, before any hold or claim. Valid schemas with bad inputs retain HTTP 400 `invalid_input`. The legacy wallet required-field check now guards with `Array.isArray`, preventing malformed `required: "a"` plus `properties` from crashing after report-mode validation.
- **Petter's decided reading of DEC-20261023-A:** robots.txt governs retrieval of page content. A status, header, timing or redirect probe of a customer-named URL, with an honest user agent, is availability measurement. `SafeFetchOptions.purpose: "availability_probe"` documents this reading next to the option. It skips only robots policy; SSRF, ToS and honest identification remain applied.
- Reviewed every requested executor. `uptime-check` returns status/timing and selected headers; `url-health-check` returns status, redirect locations and headers; `redirect-trace` returns hop status/timing/headers; `paid-api-preflight` returns status and payment-header interpretation, with a HEAD facilitator probe. None returns page body content, so these use the option. `robots-txt-parse` uses it only for its own control-file fetch and returns parsed robots rules, not page content. `uptime-check` also cancels its unread body and uses an AbortSignal deadline rather than an uncleared failure-path timer.
- **Kept gated:** `page-exists` reads HTML for soft-404 detection and returns a page title; `api-health-check` returns parsed JSON or body text. Neither uses the probe option. Their refusal catches rethrow `isCapabilityRefusal`, as do uptime/preflight catches. `url-health-check` propagates errors; redirect-trace retains its existing explicit ToS-blocked-hop annotation and otherwise propagates them. All other page readers, including url-to-markdown, web-extract, screenshot-url, html-to-pdf and sitemap-parse, retain their gates.
- Per-hop network clocks in safeFetch start after each robots check. `api-health-check` sums those durations and its response-body read time, excluding both initial and redirected-origin robots waits. DNS failures from the robots transport preserve the socket's ENOTFOUND/EAI_AGAIN diagnostic instead of becoming `robots_unavailable`.
- Added `to`, `user_email`, `recipient` and `email_to` to redacted keys. Tests cover all four at root/nested levels and mixed casing. Ajv uses `allErrors: false`; the large-array regression requires a warning and at most 20 paths. Recursive redaction calls custom `toJSON()` before traversing its result; native Buffers, typed arrays, Dates and URLs retain native serialization. Pino wildcard paths were removed because their prototype cloning breaks URL private slots; recursive redaction covers nested keys instead.
- Deliberately unchanged: x402 GET's enforce-mode 400 versus 405 difference; the non-routable `::8.8.8.8` and Teredo cases. Railway settings/config remain untouched.

### Regression evidence and review

Evidence: [round-two test receipt](../../../archive/receipts/2026-10-28-test-run-fetch-hardening-round2.json). It records the final uncommitted source hashes, commands/results, fail-before groups and review confirmation. The receipt's base SHA is not a commit containing these changes.

Fail-before used exact `git show origin/main:<path>` bytes saved under a scratch folder inside this checkout, with source restoration in `finally`; no stash or branch switch. Baseline wallet dispatch, monitor/content policy and logger groups all failed. Because input-validation and the recursive serializer were introduced by uncommitted H6 rather than origin/main, additional single-fix reversions prove unguarded compilation, all-errors array amplification and native-object traversal fail independently. Native URL serialization itself already worked on origin/main; H6 recursion had introduced its loss. The scratch folder is removed after receipt generation. Final source hashes are checked after restoration.

The five malformed schema shapes are exercised twice in report mode with execution and a single warning, then in enforce with no hold. The malformed `required` fixture includes `properties`, covering the legacy wallet path. Both paid x402 capability and solution paths assert 503 with no claim/execution/settlement. Tests also cover a validator throwing during validation, Disallow-all uptime up/down controls, retained url-to-markdown/page-exists/api-health-check refusals, a precise DNS diagnostic and policy-free latency across two origins.

The go skill's verification and independent review steps were applied; its commit/push/PR steps were excluded by the explicit task instruction. The simplify skill is not installed here; a manual simplification pass kept the changes scoped. Fresh read-only technical and product reviews identified a legacy `required.filter` crash, redirected-origin timing and alias-test coverage; all were repaired. The technical reviewer then confirmed those exact fixes with GO. No new production-state, vendor, manifest, pricing or external-claim change was made.

### Remaining database and deployment verification

Onboarding `--dry-run --backfill --manifest` was attempted separately for all seven named tools. Every attempt stopped at `ProductionAuthorityError: No production write credential is available to this process.` No database operation ran. This is a limitation of the dry-run CLI opening a write handle before its dry-run logic, not a reason to provision a production credential to this agent. No schema/manifest onboarding write is needed for these existing-executor wrapper changes. Database readiness remains unverified.

An authorized operator with a read-only database handle can finish the existing capability validation and structural smoke checks (not run here):

```bash
cd apps/api
for slug in uptime-check url-health-check page-exists api-health-check redirect-trace paid-api-preflight robots-txt-parse; do
  npx tsx scripts/validate-capability.ts --slug "$slug"
  npx tsx scripts/smoke-test.ts --slug "$slug" --dry-run
done
```

Also call `checkReadiness(slug, readOnlyHandle)` for those slugs and inspect the returned issues. Live smoke execution, deployment identity/effect checks and the report-to-enforce rollout remain with the orchestrator under the earlier deployment section. No live endpoint check was run in round 2; all URL controls described here are mocked tests. Nothing was committed, pushed, published or written to production.

### Round 2 command results

All results are backed by the [round-two receipt](../../../archive/receipts/2026-10-28-test-run-fetch-hardening-round2.json).

| Command / check | Result |
|---|---|
| `npm --workspace=packages/mcp-server run build` | Passed. |
| API `npx tsc --noEmit` | Passed, including the final source snapshot. |
| Ten touched test files | Passed: 231 tests. |
| Final full `apps/api` Vitest suite | 406 files: 371 passed, 35 skipped; 7,545 tests passed, 358 skipped, zero failures. No flaky files or isolated flaky-file reruns. Earlier overlapping full run was also green, but the final run is the stable-source evidence. |
| Restored regression subset | Five files, 87 passed after all fail-before source restorations. Source hashes match the full-suite snapshot. |
| Fail-before | Nine expected-red groups, including baseline source substitutions and individual H6 regressions; every source restored. |
| `env:check`, `claims:check`, `models:check`, `docs:check`, `programs:check` | All passed. |
| `receipts:check` | Passed before receipt generation, with 19 historical bare-test-count warnings; final new-receipt validation recorded below. |
| `lint:no-bare-catch`, `lint:no-unguarded-user-fetch`, `lint:no-new-console` | All passed in `apps/api`. An initial root `lint:no-bare-catch` invocation had no matching script; the workspace invocation is the actual check. |
| `lint:ssrf-inventory` | Workspace npm wrapper failed on its pre-existing root-relative directory assumption. The identical script run from the root, `node apps/api/scripts/check-ssrf-inventory.mjs`, passed. No unrelated package-script edit made. |
| `git diff --check` | Passed. |
| `handoff:orient` | Passed. |
| `handoff:check` | Expected failure under the leave-uncommitted/no-push contract: dirty, branch/ahead/upstream and historical merged-branch findings. Origin fetch unavailable; no branches/worktrees were removed. |
| Seven onboarding dry-runs | Blocked before DB access by the production-authority guard; readiness not claimed. |
| Live checks / production effects | Not run. No live outputs or deployment effect are claimed. |

Round-two source/test files changed (in addition to inherited round-one work):

- `apps/api/src/capabilities/availability-probe.test.ts`
- `apps/api/src/capabilities/api-health-check.ts`
- `apps/api/src/capabilities/page-exists.ts`
- `apps/api/src/capabilities/paid-api-preflight.ts`
- `apps/api/src/capabilities/redirect-trace.ts`
- `apps/api/src/capabilities/robots-txt-parse.ts`
- `apps/api/src/capabilities/uptime-check.ts`
- `apps/api/src/capabilities/url-health-check.ts`
- `apps/api/src/lib/input-validation.ts`
- `apps/api/src/lib/input-validation.test.ts`
- `apps/api/src/lib/log.ts`
- `apps/api/src/lib/log-redaction.test.ts`
- `apps/api/src/lib/robots-txt.ts`
- `apps/api/src/lib/safe-fetch.ts`
- `apps/api/src/routes/do.ts`
- `apps/api/src/routes/do.core.test.ts`
- `apps/api/src/routes/x402-gateway-v2.ts`
- `apps/api/src/routes/x402-money-path.test.ts`

Artifacts: this handoff's appended Round 2 section and `archive/receipts/2026-10-28-test-run-fetch-hardening-round2.json`. All changes remain uncommitted for the orchestrator.

Final artifact checks: the generated round-two receipt passes `npm run receipts:check`; the 19 historical warnings remain unchanged. The writer's first input was rejected because its summary was nested; the corrected top-level input generated the receipt successfully, with no failed-attempt receipt to overwrite. The scratch folder is deleted. Final `handoff:check` reports only the expected dirty/branch/ahead/merged-branch findings under this task's constraints. Final `git diff --check` passes. No commit, push, branch switch, production write or live check occurred.
