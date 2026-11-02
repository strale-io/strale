Intent: Make sure Strale's own test traffic never pays an upstream vendor (Petter, 2026-11-02: "stop those test calls immediately").

[BACKFILL] Cloud session; no Notion write was made.

## What was found

- The existing gate (`capabilities/guarded-executor.ts` ALLOW_MATRIX) already refuses test, CI and probe calls to every capability classified `paid_prepaid` / `paid_subscription` / unclassified, and the scheduler only selects `free_unlimited` / `free_quota` / `paid_with_free_tier` suites. GitHub workflows carry no vendor keys. Health probes are unauthenticated except Anthropic's `GET /v1/models`, which is not billed. Browserless is self-hosted on Railway (no per-call bill).
- Gap 1: capabilities classified free that still call Claude Haiku on some inputs. `canadian-company-data` (free_unlimited) and `danish-company-data` (free_quota) call Haiku whenever the input is a name rather than a registration number. `canadian-company-data`'s second known_answer fixture looks up "Shopify" by name, so each scheduled run of that suite paid Anthropic. Any generated negative/edge_case suite with free text did the same.
- Gap 2: `company-status-check` (free_quota) calls sub-capabilities through `getExecutor`, which bypasses the gate by design, so a paid sub-capability could run under a free parent (no paid call seen for its numeric fixtures; the guard covers it anyway).
- Not measured: production spend from these calls. The read-only production DB URL is PC-only since 2026-11-01, so this session could not query test_results.

## Delivered

- `apps/api/src/lib/paid-call-guard.ts`: an AsyncLocalStorage scope for non-customer invocations. Inside it these refuse before any request is sent:
  - `createAnthropicClient` (every Anthropic call);
  - `meteredVendorFetch` for serper, dilisense and esortcode;
  - the raw fetches to openapi.com product calls, Cobalt, sec-api.io and EINsearch.
- The scope wraps the automated non-customer executor paths:
  - scheduled and regression tests (`test-runner.ts`);
  - `guardedExecute` for non-customer contexts (onboard.ts, smoke-test, onboarding pipeline);
  - onboarding calibration (`capability-onboarding.ts`);
  - admin recalibrate (`routes/internal-tests.ts`);
  - fixture verification (`db/seed-tests.ts`) and `db/audit-tests.ts`.
- Operator scripts a person runs by hand to exercise live upstreams are named exemptions in the guard header. `sweep-paid-fixtures.ts` spends on purpose under the EUR 25 sweep cap.
- A blocked scheduled run is skipped like an exhausted test budget: no test_results row, no internal transaction, no fixture-recapture count, and a `test-runner-skip-paid-call-blocked` warn line naming the suite. It never shows as a pass or a public failure.
- Customer calls (`/v1/do`, x402, solutions) never enter the scope and are unchanged.
- Independent review (fresh same-provider agent, separate context): PASS WITH FIXES. Its findings 1-4 and 7 are fixed. Findings 5 (a capability that swallows the block) and 6 (a blocked free_quota run still uses a test-budget slot) are noted and not fixed.

## Evidence

- `paid-call-guard.test.ts` (7 tests), `test-runner.paid-call-skip.test.ts` (4), and 2 new cases in `guarded-executor.test.ts`.
- With the guard calls removed: 3 tests fail. With the runSingleTest/guardedExecute wraps removed: 4 fail. Restored: all pass.
- Full API unit suite: 8,126 passed, 0 failed. Root typecheck, models:check, env:check and the API lint guards are green.

## Next

- Next authorised action: after merge and deploy, search the production logs for `test-runner-skip-paid-call-blocked` to list which suites were paying; then point those suites at registration-number inputs or move them to fixture mode | Owner: Strale orchestrator | Blocker: none once deployed; the log search needs log access (Better Stack once live, or Railway logs from the PC).
