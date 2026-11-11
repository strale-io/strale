# Converter caller fairness report

## Files changed and caller-scope wiring

- `apps/api/src/lib/caller-scope.ts` — AsyncLocalStorage scope; `runAsCaller` preserves an outer key (lines 1–14).
- `apps/api/src/lib/do/dispatch.ts` — `/v1/do` and `/v1/do/batch` account executions use `acct:<userId>` in the shared `executeWithRetry` wrapper (lines 116–127). Anonymous `/v1/do` uses the request's already-hashed IP (`ip:<hash>` or `ip:unknown`), while verified x402-on-`/v1/do` uses its lower-cased payer address (lines 295–301, 371–376). Async `/v1/do` also inherits this wrapper.
- `apps/api/src/routes/x402-gateway-v2.ts` — x402 solutions set the payer/IP scope around `executeSolution` (lines 1355–1367); x402 capability calls set it around the retry/executor call (lines 1782–1794).
- `apps/api/src/routes/solution-execute.ts` — account solution execution sets `acct:<userId>` around `executeSolution` (lines 338–343); every nested solution step retains that outer scope.
- `apps/api/src/capabilities/lib/readability-convert.ts` — enforces one active/queued page per scoped caller, a 30-second caller cooldown after time/memory limits, bounded/expiring cooldown bookkeeping, and cleanup on every completion path (lines 65–125, 326–362). Unscoped callers retain the global queue behavior.
- `apps/api/src/lib/capability-refusal.ts` — maps busy and cooldown refusals to retryable advice through the existing refusal mechanism.
- `apps/api/src/capabilities/lib/readability-convert.test.ts`, `apps/api/src/lib/caller-scope.test.ts`, `apps/api/src/lib/invocation-facts.test.ts` — fairness, cooldown, bounded bookkeeping, scope nesting and structural-wiring coverage.

## Tests added and what they pin

- Same caller cannot enqueue a second page while a first is converting; another caller is admitted and served next (`readability-convert.test.ts`, lines 57–80).
- A converter timeout cools down only that caller, then accepts it after the cooldown; another caller remains unaffected (lines 82–101).
- 10,001 cooldown insertions retain only 10,000 entries (lines 103–106).
- Caller scope is absent by default and nested scopes preserve the original caller (`caller-scope.test.ts`).
- Existing unscoped queue tests continue to pin the five-position global behavior, while existing worker tests cover success, queue refusal, timeout, crash, spawn failure, exit watchdog and shutdown cleanup.
- Existing invocation-fact and retry-parity structural tests were updated/preserved to pin the new anonymous caller-key argument without weakening account/free-tier separation or shared retry policy.

## Commands and results

- `npm install` — failed because `c2pa-node` postinstall could not reach GitHub (`ENETUNREACH`).
- `npm install --ignore-scripts` — passed; dependencies installed offline except package postinstall assets.
- `cd apps/api && npx vitest run src/capabilities/lib/readability-convert.test.ts src/lib/caller-scope.test.ts` — passed, 20 tests.
- `npm --workspace=packages/mcp-server run build && npm --workspace=packages/sdk-typescript run build && npm run typecheck` — passed.
- `cd apps/api && npx vitest run src/capabilities/lib/readability-convert src/capabilities/url-to-markdown src/lib/caller-scope.test.ts src/lib/refusal-consistency.test.ts` — 54 passed, one performance-timing failure in `url-to-markdown-parse-bound.test.ts` (`872 ms` event-loop gap vs `500 ms`).
- `cd apps/api && npx vitest run` — started and ran for more than seven minutes, then was interrupted after reporting performance-timing failures in `company-enrich/structured-metadata.test.ts`, `stripped-text-length.test.ts`, and `url-to-markdown-parse-bound.test.ts`, plus two structural failures caused by the initial wrapper formatting. The structural failures were fixed and the relevant tests rerun successfully. The performance tests were not changed by this work.
- `cd apps/api && npx vitest run src/lib/invocation-facts.test.ts src/lib/retry.executor-parity.test.ts src/capabilities/lib/readability-convert.test.ts src/lib/caller-scope.test.ts` — passed, 47 tests.

## Incomplete items

- The full suite did not reach its final summary before being interrupted after more than seven minutes. Its observed failures are listed above. I did not run a second full suite against `origin/main`; therefore I cannot claim a direct origin/main comparison. The three remaining observed failures were wall-clock performance thresholds in untouched files, and the focused converter suite showed the same timing sensitivity once before passing its converter-only rerun.
- No network, database, fetch path, worker implementation, output, or price was changed.

## Review follow-up

The independent review initially found missing explicit wiring coverage and a structural x402 settlement-order regression. The fairness test now submits five simultaneous pages for caller A, executor-level scope tests observe both `acct:` and opaque `ip:` keys, and the settlement-order marker was updated without changing its verify/execute/settle ordering assertions. `cd apps/api && npx vitest run src/routes/x402-gateway-v2.settlement-order.test.ts src/lib/retry.executor-parity.test.ts src/lib/caller-scope.test.ts src/capabilities/lib/readability-convert.test.ts` then passed all 41 tests.

A second independent review confirmed the x402 regression and A×5/B-next coverage were resolved. It requested a more granular scoped cleanup matrix and production-duration fake-timer cooldown test beyond the existing path tests; those additional test refinements were not completed in this batch. The anonymous wiring test was subsequently changed to feed a raw IP through the repository's production `hashIp` and `anonymousCallerKey` helpers and observe the opaque executor scope. The final structural/wiring rerun (`caller-scope`, `invocation-facts`, x402 settlement-order, retry parity) passed all 41 tests.
