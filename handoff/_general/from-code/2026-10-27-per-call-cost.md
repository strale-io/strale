Intent: Build H5 per-call marginal upstream cost recording, bounded shared Anthropic clients and the daily margin input. Implementation is left uncommitted and unpushed for the orchestrator, as explicitly requested. Real PostgreSQL and post-deploy verification remain outstanding.

## Implementation

- Migrated all 95 production Anthropic constructor sites across 93 files to `lib/anthropic-client.ts`. Only that factory constructs the SDK. `anthropic:check` scans active API source and scripts (TypeScript and JavaScript); its test plants a forbidden constructor and an import alias. Both run in CI.
- SDK timeout defaults to 30 seconds, capped by the caller's remaining request deadline and any stricter per-client/per-call timeout. Search retains its 6-second limit. `/v1/do` establishes the deadline from its validated `timeout_seconds` budget. SDK `maxRetries` is forced to zero at construction and request time.
- HTTP middleware establishes AsyncLocalStorage cost isolation. Parallel solution steps add to their request's accumulator. Messages usage is captured before output parsing, including base input, output, cache reads, and 5-minute/1-hour cache writes. CLI/digest requests outside HTTP context emit `standalone-llm-cost` events for success and unknown failed attempts. Accounting observation cannot replace the SDK result/error.
- Model choices come from `MODELS`; the unconfigured risk-narrative environment override was retired so model changes happen in the registry. No model choice or customer price changed.
- Migration `0129_transactionCost` adds bare nullable `transactions.cost_cents numeric(24,9)` and `cost_breakdown jsonb`. Fractional EUR cents retain sub-cent token prices without integer-cent rounding; strings are used for numeric SQL binds. No default, backfill, or historical estimate. The new block is guarded and ledgered; existing blocks are unchanged.
- API-key sync/async/free-tier settlement helper, x402 transaction recording, and wallet solution capture schedule a separate best-effort UPDATE after the terminal transaction/debit commits. A stalled or rejected cost UPDATE is not awaited by settlement or the HTTP response. Failures log `transaction-cost-write-failed` with the transaction id. Bind tests reject Date/Buffer parameters; stalled-DB and rejection tests exercise response independence and swallow visibility.
- `metrics/commercial.ts::marginPerTool` and `scripts/margin-per-tool.ts` include completed and failed customer executions, recognizing zero revenue on failures even when the row retains its catalogue price. `known_cost_cents` includes known components of otherwise unknown calls; `cohort_cost_cents` and matched cohort revenue determine margin. Unknown historical rows remain unknown. Flags require 20 fully known calls: negative margin, zero-revenue positive-cost tools, or margin below 30%. Fixed infrastructure, taxes and payment processing are outside this marginal-upstream metric.
- `apps/api/scripts/commercial-brief.ts` prints the view and includes `margins` in JSON; `docs/company/DAILY-RUN.md` describes interpretation. Its default commercial window remains the last completed week; standalone script defaults to a rolling seven days.

## Price data and currency

Prices read 2026-10-27 from https://platform.claude.com/docs/en/about-claude/pricing and pinned beside the role registry. USD per million tokens:

| Role/model | Input | Output | Cache write 5m | Cache write 1h | Cache read |
|---|---:|---:|---:|---:|---:|
| capability_default / Haiku 4.5 | 1 | 5 | 1.25 | 2 | 0.10 |
| capability_reasoning / Sonnet 4.6 | 3 | 15 | 3.75 | 6 | 0.30 |
| digest / Sonnet 4 | 3 | 15 | 3.75 | 6 | 0.30 |
| search_rank / Haiku 5.5, prompt <=100k | 0.10 | 0.50 | 0.125 | 0.20 | 0.01 |
| search_rank / Haiku 5.5, prompt >100k | 0.50 | 2.50 | 0.625 | 1 | 0.05 |

Native USD charges and tokens are retained. Reporting EUR uses the existing `EUR_USD_RATE` conversion, extracted unchanged into `lib/currency.ts`; its rate is stored in each breakdown and explicitly labeled an estimate, not invoice FX. x402 price conversion arithmetic and defaults are unchanged. Unpriced server-side LLM tools produce an unknown rather than a false complete cost.

## Vendor coverage and remaining coverage

The existing metered fetch boundary records actual attempts, including failures and retries, without adding upstream requests:

- Serper: Starter prepaid unit cost USD 0.001 per successful query, consistent with the recorded Starter plan and https://serper.dev/ pricing/FAQ read 2026-10-27. HTTP failures consume zero credits according to the vendor FAQ; network failures have unknown billing. Zero-unit unauthenticated reachability probes are omitted.
- Dilisense: null plus `allowance_or_plan_unit_price_unknown`; existing 100/month allowance and tiered overage prevent a reliable actual per-call charge from local knowledge alone. Covers sanctions, PEP and adverse-media paths.
- eSortcode: known native GBP 0.15/check retained from the existing executor cost knowledge, but EUR cost null with `gbp_conversion_unavailable`; no GBP/EUR rate is invented. Covers the high-priced UK CoP path.
- Browserless and OpenRegister: null plus `allowance_or_plan_unit_price_unknown`; duration/credits/plan allocation is not treated as zero marginal cost.
- Other providers traversing `meteredVendorFetch` receive null with `vendor_unit_price_unverified`.
- Remaining work: reliable native and conversion data for the above unknowns; other direct API/paid vendors outside the metered boundary, including payment/facilitator processing fees. Uninstrumented noncomputed acquisition paths are conservatively tagged `unmetered_upstream:<slug>` instead of manufacturing a free cost. The test-suite `external_cost_cents` floors and `cost_class` are classification evidence, not invoice unit prices, and were not copied into transactions.

## Final retry policy

There is exactly one customer capability retry layer: `lib/retry.ts::executeWithTransientRetry`. Nondeterministic executors get at most one retry on its transient-error patterns; deterministic executors run once. Each SDK request has `maxRetries: 0`, so a logical LLM call in this layer is attempted at most twice in total. No retry was added to the factory: solution steps, search fallback, CLI and digest callers that do not use the executor retry wrapper attempt once. Missing usage from an unsuccessful SDK attempt remains an unknown even if a subsequent attempt succeeds. A multi-step solution or executor may deliberately make multiple distinct LLM calls; their usage adds together.

## Verification evidence and review

Fresh tool-written receipt: `archive/receipts/2026-10-27-test-run-per-call-cost.json`. It contains the full changed-path list, command outcomes and final test counts; this handoff does not substitute prose for that evidence.

Both independent read-only review lenses returned GO on the working diff, round 2, base `11eae695`: technical and product. Fixed findings included failed-execution cost exclusion, zero-revenue loss flags, partial known costs, standalone usage recording and the x402 test overload assertion. No HIGH findings remain. A manual simplification pass consolidated standalone observation, reused existing request middleware/metered fetch/fire-and-forget boundaries and removed runtime SDK imports from consumers. No simplify skill is available in this session.

The first full suite exposed SDK-option assertion and migration-list changes; those were corrected. Root CI check-job commands were executed, excluding reinstalling dependencies already supplied by the orchestrator. The GitHub image dependency assertion cannot succeed without actual job outputs; Docker has no daemon here. No image-boot success is claimed.

`runuser -u postgres -- psql -c 'SELECT version();'` failed: `cannot set groups: Operation not permitted`. Both local socket and TCP checks found no server, lowering the uid with setpriv was denied, and Docker has no daemon. Therefore no local PostgreSQL migration/settlement integration or successful database-backed margin CLI run is claimed. The CLI reaches the database read and exits with `DATABASE_URL environment variable is required`; mocked query/bind/settlement tests pass. No credentials were sought and no production writes or paid calls were made.

The clean-tree mutation runner cannot execute against this deliberately uncommitted build; fail-before mutation execution remains for the orchestrator after committing the candidate. No files were reverted or stashed. No live onboarding/readiness/smoke pipeline was run for this mechanical SDK-consumer migration: no manifests, capability rows or new slugs were added, and paid smoke calls are explicitly prohibited in this task.

`handoff:check` reports the explicitly expected uncommitted/unpushed clone state, its feature-branch trunk classification and pre-existing merged branches. These were not resolved through commits, pushes, branch switches or branch deletion. This handoff is the session resume surface; the program track remains queued pending orchestrator review and shipping.

## DEC-20260504-C deployment verification plan

Reachability read directly: Dockerfile builds API TypeScript and CMD starts `apps/api/dist/index.js`; `apps/api/src/index.ts` imports and awaits `runStartupMigrations()` before serving; `BLOCKS` includes `runMigration0129_transactionCost`. `app.ts` mounts `requestContext()` before the rails. The commercial brief imports the new commercial function directly; it requires no cron or new env variable.

After the orchestrator commits/reviews and CI passes, run disposable PostgreSQL startup migrations and settlement integration tests, including the cost bind-shape and swallow-visibility tests. Run fail-before mutation through `apps/api/scripts/mutation-test.mjs` from a clean committed tree; do not use stash. The production deploy itself remains with the orchestrator. Its read-only proofs are:

1. Column existence and types:
   ```sql
   SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable
   FROM information_schema.columns
   WHERE table_schema = current_schema() AND table_name = 'transactions'
     AND column_name IN ('cost_cents', 'cost_breakdown');
   ```
   Expect nullable numeric(24,9) and jsonb.
2. New transactions have a cost or a recorded unknown (use the real deployment timestamp, allow background UPDATEs to drain; examine API-key, x402 and solution samples separately):
   ```sql
   SELECT id, status, solution_slug, cost_cents,
          cost_breakdown->'unknowns' AS unknowns
   FROM transactions
   WHERE created_at >= '<deployment ISO timestamp>'::timestamptz
     AND status IN ('completed', 'failed')
   ORDER BY created_at DESC LIMIT 50;
   ```
   Every sampled new terminal execution should have non-null cost_cents or a nonempty unknowns array. A missing breakdown is a cost-write failure, not zero cost; investigate the labeled failure log. Do not generate paid samples for this build.
3. The margin script runs against the authorized read-only database:
   ```bash
   cd apps/api
   npx tsx scripts/margin-per-tool.ts 7
   npx tsx scripts/commercial-brief.ts --json
   ```
   Confirm successful output, `margins`, unknown-cost share, matched cohort fields and threshold flags. No upstream calls are needed.

## Round 2

Round 2 addresses the independent NO-GO on lost transient Anthropic retries. This section supersedes the earlier retry-policy description and verification claims where they differ. Changes remain uncommitted and unpushed for the orchestrator.

- Confirmed installed `@anthropic-ai/sdk` **0.78.0** exports `APIError`, `APIConnectionError` and `APIConnectionTimeoutError`. The deliberate executor retry layer handles SDK 408/409/429/5xx (including 529), connection errors and timeouts by class/status before inspecting generic network messages. SDK 400/401 never retry. At most one retry, two attempts total, even if a larger maxRetries is supplied. Numeric and HTTP-date `retry-after` are honoured; if the required wait consumes the caller's remaining budget, the layer returns the original error without waiting or making an early retry. SDK retries remain disabled.
- The cost context counts Anthropic requests from start to settlement. A snapshot taken while a request is pending reports NULL and `llm_in_flight_or_unmetered`, retaining known partial costs. The Anthropic dependency inventory also establishes per-capability usage expectations, including computed capabilities. Missing usage reports that same unknown reason. Expectations are isolated across parallel solution steps, so another step's metered usage cannot conceal an unmetered step. A late response cannot rewrite a snapshot already scheduled for persistence.
- Added real SDK error-instance tests for retry success and exhaustion, non-retryable statuses, retry headers and insufficient budgets. Replaced fabricated `Error("HTTP 503")` fixtures in `call-cost.test.ts`. Added in-flight, computed/unmetered and parallel-usage regressions.
- Behavioural tests now drive paid `/v1/do`, solution execution and x402 v2 HTTP handlers with mocked DB and facilitator boundaries. They assert debit/capture/settlement and commit ordering before cost writes, then inject cost-write rejection and verify response and settlement remain unchanged. Cost-write error logging and primitive SQL binds are asserted. `/v1/do` coverage lives in `routes/do.core.test.ts`; solution and x402 coverage lives in `lib/call-cost-settlement.test.ts`. Existing source-order guards remain supplementary.
- Fixed x402 persistence to use nullable `insertedId`; moved solution cost persistence outside the phase-2 try/refund block. A cost failure therefore cannot enter that refund catch. Per-call SDK timeouts now honour the request override when constructor timeout is unset, still bounded by an explicit constructor limit and remaining caller deadline.
- Removed the unused CEO dashboard SDK import and replaced its model literal with the registry role. `models:check` now scans TypeScript under `apps/api/scripts/` as well as `apps/api/src/`, with a planted script violation test. The Anthropic constructor guard uses the TypeScript parser to catch namespace/named/default aliases and property access. Runtime dynamic SDK imports outside the factory are conservatively forbidden, since construction can occur through later aliases; planted namespace and dynamic-construction tests pass.

Known accounting gaps and operational tradeoffs:

1. **Rolled-back spend is lost.** The wallet transaction in `/v1/do` can roll back after billable LLM spend, including its 15-second transaction timeout. The rollback removes the transaction row, so the post-commit cost UPDATE has no row on which to record the spend. The margin view understates upstream cost in this case. A code comment at the transaction timeout setup records this gap; this change does not introduce a separate durable spend ledger.
2. **Serper credits are an estimate.** The estimate assumes **one credit per successful call**, USD 0.001 on Starter. `adverse-media-check` sends `num: 20`; `google-search` permits up to 100. Official pricing/FAQ at https://serper.dev/ was checked again on 2026-10-27 and states when successful queries consume credits, but does not specify credit scaling with `num`. https://serper.dev/playground exposed no readable credit schedule; https://serper.dev/docs returned 404. No documented official `num` schedule was found, so the numeric estimate is unchanged. Code comments and each priced Serper item's `credit_assumption` explicitly record that deeper result counts may cost more. No paid probe was made, and other vendors' credit schedules were not used as Serper evidence.
3. **Rollback override retired.** Dropping `RISK_NARRATIVE_MODEL` removes an emergency rollback override that was unset in production, per the task's supplied context. It does not change the effective production model, but future rollback requires a registry change/deploy. Comments in the capability and this handoff record that lost operational override. No production credential or setting was inspected or changed.

The required `go` workflow was applied as verification, manual simplification and two fresh read-only reviews, constrained by the explicit no-commit/no-push/no-PR instruction. Both reviewers returned **GO**, with zero HIGH/MEDIUM findings for Round 2; they read `REVIEW.md` and checked correctness/safety and settlement/API/guard contracts. No simplify skill is installed. Real PostgreSQL and image boot remain separate orchestrator/CI verification; no production write or paid upstream call was made. The original deployment verification SQL and remaining commands above still apply.

Fresh Round 2 tool-written evidence: `archive/receipts/2026-10-27-test-run-per-call-cost-round2.json`. It records every gate's actual exit code and output, the changed-path inventory and the test results. The previous receipt is unchanged. Gate outcomes and closeout limitations are listed below after verification finishes.

### Round 2 gate results

Evidence: `archive/receipts/2026-10-27-test-run-per-call-cost-round2.json`. Counts and individual outputs are in that receipt.

| Check | Result |
|---|---|
| Touched/new API tests (exact file arguments in receipt) | PASS |
| `npx tsc --noEmit` | PASS |
| `npm test` (full apps/api Vitest) | PASS |
| CI image-job dependency assertion | UNAVAILABLE: GitHub CLASSIFY_RESULT/SMOKE_RESULT not supplied |
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
| `node --test scripts/production-watch/*.test.mjs` | PASS |
| `npm run programs:test` | PASS |
| `npm run research:check` | PASS |
| `npm run research:test` | PASS |
| `npm run design:check` | PASS |
| `npm run design:test` | PASS |
| `npm run env:check` | PASS |
| `npm run env:test` | PASS |
| `npm run vendors:check` | PASS |
| `npm run vendors:test` | PASS |
| `npm run distribution:check` | PASS |
| `npm run distribution:test` | PASS |
| `npm run digest:shadow:test` | PASS |
| `npm run candidates:test` | PASS |
| `npm run protocols:check` | PASS |
| `npm run protocols:test` | PASS |
| `npm run protocols:coverage` | PASS |
| `npm run protocols:coverage:test` | PASS |
| `npm run scheduled:check` | PASS |
| `npm run scheduled:test` | PASS |
| `npm run scheduled:outcomes:test` | PASS |
| `npm run anthropic:check` | PASS |
| `npm run anthropic:test` | PASS |
| `npm run models:check` | PASS |
| `npm run models:test` | PASS |
| `npm run claims:check` | PASS |
| `npm run claims:test` | PASS |
| `npm run docs:check` | PASS |
| `npm run docs:test` | PASS |
| Archive/handoff index warning gate | PASS |
| `npm run archive:index:test` | PASS |
| `npm run receipts:check` | PASS |
| `npm run receipts:test` | PASS |
| `npm run migrations:check` | PASS |
| `npm run migrations:test` | PASS |
| `npm run gates:test` | PASS |
| `npm run handoff:test` | PASS |
| `npm run context:check` | PASS |
| `npm run context:test` | PASS |
| `npm run handoff:check` | EXPECTED FAIL: dirty/unpushed branch, existing merged branches/worktree findings |

The first full suite exposed four failures in the US company test SDK mock, which omitted the real error-class exports now used by `retry.ts`; the partial mock now preserves the SDK exports. The final full suite is green. The widened model guard also exposed a stale empty-input fixture; it now empties source and script roots, and `gates:test` passes on rerun. No runtime retry behavior was weakened to satisfy either fixture.

Read-only live check: `GET https://api.strale.io/health` returned `{"status":"ok","commit":"1d7bba99331d"}`. This is connectivity evidence, not evidence that this uncommitted change is deployed. `docker info` failed because the daemon socket is absent. Real database-backed settlement/migration and margin-CLI execution remain unverified; use the existing production/disposable-DB commands above after orchestration. No new onboarding commands are required: this round adds no capabilities, manifests or upstream sources.

`npm ci` was already supplied by the orchestrator and was not repeated. The handoff gate could not fetch origin and reports another existing worktree as dirty; its instructions to push, switch/delete branches or clear another session's work were not followed. All changes remain uncommitted.

### Round 2 files

- `apps/api/src/lib/retry.ts`
- `apps/api/src/lib/retry.test.ts`
- `apps/api/src/lib/anthropic-client.ts`
- `apps/api/src/lib/call-cost.ts`
- `apps/api/src/lib/call-cost.test.ts`
- `apps/api/src/lib/call-cost-inventory.test.ts`
- `apps/api/src/lib/call-cost-settlement.test.ts`
- `apps/api/src/routes/do.ts`
- `apps/api/src/routes/do.core.test.ts`
- `apps/api/src/routes/solution-execute.ts`
- `apps/api/src/routes/x402-gateway-v2.ts`
- `apps/api/src/capabilities/index.ts`
- `apps/api/src/capabilities/risk-narrative-generate.ts`
- `apps/api/scripts/ceo-dashboard.ts`
- `apps/api/scripts/check-anthropic-client.mjs`
- `apps/api/scripts/check-anthropic-client.test.mjs`
- `apps/api/scripts/model-literals-lib.mjs`
- `apps/api/scripts/check-model-literals.mjs`
- `apps/api/scripts/check-model-literals.test.mjs`
- `scripts/empty-inputs.test.mjs`
- `apps/api/src/capabilities/us-company-data.test.ts`
- `handoff/_general/from-code/2026-10-27-per-call-cost.md`
- `archive/receipts/2026-10-27-test-run-per-call-cost-round2.json`


## Round 3

Implemented the requested fixes without changing charging or refund semantics:

- `retry.ts`: `MAX_RETRY_AFTER_MS = 10_000`; a server wait above this cap throws the original error immediately on every customer rail. A wait at or beyond the remaining deadline budget also throws immediately, preserving the server minimum rather than retrying early. Fake-timer tests cover 3600 seconds without a deadline, 2 seconds without a deadline, and 5 seconds with only 1 second remaining.
- `solution-executor.ts`: each step uses `executeWithTransientRetry`, using the freshly read capability type. `solution-executor-retry.test.ts` proves a real Anthropic `APIError.generate(429, ...)` followed by success yields a successful step.
- `startup-migrations.ts`: both cost-column `IF NOT EXISTS` branches set transaction-local `lock_timeout` to `3s`, copied from main's manifest-text block via `git show origin/main:apps/api/src/lib/startup-migrations.ts`. The uncommitted cost block's ledger entry was regenerated with `node apps/api/scripts/check-migration-ledger.mjs --update`.
- `routes/do.core.test.ts`: direct authenticated free-tier tests exercise cost-write failure false and true, preserving the successful zero-price response and creating no wallet transaction.

Evidence: [Round 3 receipt](../../../archive/receipts/2026-10-27-test-run-per-call-cost-round3.json).

| Verification | Actual result (before merge) |
|---|---|
| Initial touched Vitest run | First run failed because the new solution test omitted its actor argument; fixed the harness, then 8 files / 273 tests passed |
| Expanded targeted Vitest (`startup-migrations`, `retry`, `call-cost*`, `solution-executor*`, persistence, margin, `do.core`) | 10 files passed; 303 tests passed, 4 skipped |
| Full apps/api Vitest suite | 358 files passed, 33 skipped; 6532 tests passed, 346 skipped; zero failures |
| Touched Node script tests (Anthropic guard, model guard, empty-input fixtures) | 65 passed, zero failures |
| MCP server build | PASS |
| apps/api `npx tsc --noEmit` | PASS (before and after test-harness correction) |
| `migrations:check`, `programs:check`, `claims:check`, `models:check`, `env:check`, `docs:check` | PASS |
| `receipts:check` | PASS with historical bare-test-count warnings |
| `git diff --check` | PASS |
| Independent confirmation review | GO; no blocking or should-fix findings; reviewer separately ran 3 files / 38 tests, all passed |
| `context:generate` | REFUSED: identifies this clone as the shared primary worktree |
| `handoff:check` | EXPECTED FAIL: dirty state, primary-worktree feature branch, no feature upstream, existing merged branches; its attempted fetch also failed |
| First requested commit | BLOCKED: Git cannot create `.git/index.lock` because `.git` is mounted read-only |

The separate scoped reviewer read `REVIEW.md`; the remaining optional nit is a free-tier provenance fixture missing `fetched_at` (a warning only). The `go` workflow was applied for local verification/review, with outbound steps excluded by the orchestrator's explicit instructions. No simplify skill is available. Safe fail-before mutation was not run: the repository mutation tool requires a clean committed tree, which the Git mount prevents. No historical review backlog records were changed.

Read-only live check: `GET https://api.strale.io/health` returned `{"status":"ok","commit":"1d7bba99331d"}`. This does not establish deployment of this change. No production database or settings were touched.

### Blocked continuation (preserve the requested order)

All Round 2 and Round 3 edits remain uncommitted. The first commit was attempted with the exact requested subject but failed before hooks could run. `scratchpad/codex-rules.md` was read and contains no attribution lines; the attempted trailer was `Co-Authored-By: Claude <noreply@anthropic.com>`, matching recent history without a model name.

Once Git metadata is writable, commit the current change with the requested subject, then run `git fetch origin main && git merge origin/main` (never rebase). Keep main's manifest-text 0128/M071 intact; move and rename this cost block to 0129/M072 after it in source and `BLOCKS`, update its import/describe/list/max-number tests, and use the ledger writer to generate the new row. This renumbering was deliberately left pending because the first commit and merge could not happen. Resolve generated conflicts from main and run the repository generators; the staged-index hook can regenerate archive/handoff indexes and the inventory. Run all requested post-merge checks and the full suite again, write a distinct post-merge receipt (receipts are immutable), append the outcome here, and commit locally. Do not push or open a PR.

Startup reachability was checked: Dockerfile builds apps/api and starts `apps/api/dist/index.js`; `apps/api/src/index.ts` imports `runStartupMigrations` and calls it through `withStartupDbRetry`. Production verification remains with the orchestrator after deployment: inspect `information_schema.columns` for `transactions.cost_cents` and `transactions.cost_breakdown`, verify fresh settled rows have cost data, and run the margin report as described earlier in this handoff. No live DB-backed checks were possible or claimed.

## Merge with main (orchestrator)

Main had already taken block 0128 (`0128_manifestTextHash`, M071, #776). This branch's cost block is renumbered to `0129_transactionCost` (ledger M072, appended with `check-migration-ledger.mjs --update`); there is no column overlap. Post-merge: API typecheck clean, migrations check and test pass, full API suite 6,562 passed, 349 skipped.
