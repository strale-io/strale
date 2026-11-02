Intent: Make sure Strale's own test traffic never pays an upstream vendor (Petter, 2026-11-02: "stop those test calls immediately").

[BACKFILL] Cloud session; no Notion write was made.

## What was found

- The existing gate (`capabilities/guarded-executor.ts` ALLOW_MATRIX) already refuses test, CI and probe calls to every capability classified `paid_prepaid` / `paid_subscription` / unclassified, and the scheduler only selects `free_unlimited` / `free_quota` / `paid_with_free_tier` suites. GitHub workflows carry no vendor keys. Health probes are unauthenticated except Anthropic's `GET /v1/models`, which is not billed. Browserless is self-hosted on Railway (no per-call bill).
- Gap 1: capabilities classified free that still call Claude Haiku on some inputs. `canadian-company-data` (free_unlimited) and `danish-company-data` (free_quota) call Haiku whenever the input is a name rather than a registration number. `canadian-company-data`'s second known_answer fixture looks up "Shopify" by name, so each scheduled run of that suite paid Anthropic. Any generated negative/edge_case suite with free text did the same.
- Gap 2: `company-status-check` (free_quota) calls sub-capabilities through `getExecutor`, which bypasses the gate by design, so a paid sub-capability could run under a free parent (no paid call seen for its numeric fixtures; the guard covers it anyway).
- Not measured: production spend from these calls. The read-only production DB URL is PC-only since 2026-11-01, so this session could not query test_results.

## Delivered

- `apps/api/src/lib/paid-call-guard.ts`: an AsyncLocalStorage scope for non-customer invocations. `createAnthropicClient` (every Anthropic call) and `meteredVendorFetch` for billable vendors (serper, dilisense, esortcode) refuse inside the scope, before any request is sent.
- The scope wraps every non-customer executor call: scheduled tests and regression runs (`test-runner.ts`), `guardedExecute` for non-customer contexts (onboard.ts, smoke-test, onboarding pipeline), onboarding calibration (`capability-onboarding.ts`), admin recalibrate (`routes/internal-tests.ts`) and `db/audit-tests.ts`.
- A blocked test is recorded as a failed run classified `test_infrastructure` (same treatment as an exhausted test budget). It never counts as a pass for negative/edge_case/known_bad suites.
- Customer calls (`/v1/do`, x402, solutions) never enter the scope and are unchanged.

## Evidence

- New `apps/api/src/lib/paid-call-guard.test.ts` (6 tests) fails with the guard removed (3 failing) and passes with it.
- Full API unit suite: 8,119 passed, 0 failed. Root typecheck, models:check, env:check and the API lint guards are green.

## Next

- Next authorised action: after merge and deploy, read `test_results` for `failure_reason LIKE '%paid upstream call blocked%'` (PC session with the verify URL) to list which suites were paying; then point those suites at registration-number inputs or move them to fixture mode | Owner: Strale orchestrator | Blocker: production DB read is PC-only.
