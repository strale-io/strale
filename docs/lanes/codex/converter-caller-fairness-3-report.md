# Converter caller fairness round 3 report

## Fixes

- **M1 — keyed caller release coverage.** Added `"releases a keyed caller after every completion path except worker out-of-memory"`. It drives success, quick `tooComplex`, worker crash, `stopConversionWorkers()`, spawn failure, and `ERR_WORKER_OUT_OF_MEMORY` through fake workers. It verifies that only out-of-memory starts `ConversionCallerCooldownError`.
- **M2 — discriminating round-robin coverage.** Updated `"dispatches queued caller buckets A, B, C, A in round-robin order"` to enqueue A, A, B, C and assert the HTML reaches the worker in A, B, C, A order.
- **L1 — awaited cool-down expiry.** Updated `"cools down only after the production-duration timer expires"` to await the caller-scoped availability assertion.
- **L2 — constant-derived busy retry metadata.** Added `CONVERSION_LIMITS.busyRetryAfterMs`, derived `ConversionBusyError.retryAfterSeconds` from it, and made `refusalDetails` read the property. Added `"derives busy refusal retry seconds from the converter limit"`, which changes the mutable test limit to 7 seconds so a hard-coded value cannot pass.

## Hand checks

- Replaced the out-of-memory `releaseCaller(job, true)` with `releaseCaller(job)`. The M1 test failed because the OOM caller was available instead of rejecting with `ConversionCallerCooldownError` (exit 1). Reverted the mutation.
- Replaced the round-robin selection with FIFO (`selected = 0`). The M2 test failed with worker order A, A, B, C instead of A, B, C, A (exit 1). Reverted the mutation.
- Advanced fake timers to one millisecond before cool-down expiry. The L1 assertion failed with `ConversionCallerCooldownError` instead of resolving (exit 1). Reverted the mutation.

## Commands and results

- `npm ci --ignore-scripts` — passed. Ordinary `npm ci` could not download `c2pa-node` test certificates because the environment could not reach GitHub, so lifecycle scripts were skipped for the local dependency installation.
- `cd apps/api && npx vitest run src/capabilities/lib/readability-convert.test.ts -t "dispatches queued|releases a keyed|derives busy|cools down only" --maxWorkers=1` — passed (4 tests).
- `cd apps/api && npx vitest run src/capabilities/lib/readability-convert src/capabilities/url-to-markdown src/lib/caller-scope.test.ts src/lib/invocation-facts.test.ts src/lib/retry.executor-parity.test.ts src/routes/x402-gateway-v2.settlement-order.test.ts src/lib/refusal-consistency.test.ts` — 101 passed and 4 pre-existing performance-sensitive tests failed under Node 20.20.2 (the repository packages require Node 22): three worker conversions exceeded their time/gap thresholds and one timed out. The round-3 tests passed.
- `npm --workspace=packages/mcp-server run build` — passed.
- `npm --workspace=packages/sdk-typescript run build` — passed.
- `npm run typecheck` — passed across all workspaces.
- `git diff --check` — passed.

## Not done

- The exact requested Vitest selection did not go fully green in this container because it provides Node 20.20.2 while current dependencies require Node 22, and `nvm install 22` could not find a downloadable Node 22 release. No threshold or unrelated performance test was changed to mask the environment mismatch.
