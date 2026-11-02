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
- A blocked scheduled run writes no test_results row, internal transaction or fixture-recapture count, so it never shows as a pass or a public failure. It logs `test-runner-skip-paid-call-blocked`.
- The blocked suite is then parked: `test_status = 'quarantined'` with reason prefix `paid_call_blocked:`.
  - The scheduler's selection queries exclude parked suites.
  - The test runner refuses a parked suite before the budget gate, so it uses no test-budget slot.
  - The health sweep never releases one.
  - Without parking, a skipped suite would be due again every hour and use a free_quota test slot each time (second review round).
  - To unpark: a person moves the suite to a free input, then resets test_status.
- Customer calls (`/v1/do`, x402, solutions) never enter the scope and are unchanged.
- Independent review (fresh same-provider agent, separate context): PASS WITH FIXES. Its findings 1-4 and 7 are fixed. Findings 5 (a capability that swallows the block) and 6 (a blocked free_quota run still uses a test-budget slot) are noted and not fixed.

## Evidence

- `paid-call-guard.test.ts` (7 tests), `test-runner.paid-call-skip.test.ts` (6), and 2 new cases in `guarded-executor.test.ts`.
- With the guard calls removed: 3 tests fail. With the runSingleTest/guardedExecute wraps removed: 4 fail. Restored: all pass.
- Parking: 3 tests fail with it removed, all pass with it.
- Full API unit suite: 8,128 passed, 0 failed. Root typecheck, models:check, env:check and the API lint guards are green.

## Next

- Next authorised action: after merge and deploy, list parked suites with `SELECT capability_slug, test_type, input FROM test_suites WHERE quarantine_reason LIKE 'paid_call_blocked:%'` (or the `test-runner-skip-paid-call-blocked` log line); then point those suites at registration-number inputs or move them to fixture mode | Owner: Strale orchestrator | Blocker: the production DB read is PC-only.
