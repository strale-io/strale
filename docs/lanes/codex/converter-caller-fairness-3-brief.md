Intent: Codex builder brief: close the test gaps the independent review found in converter-caller-fairness round 2.

# Brief: converter-caller-fairness round 3 (tests only)

- **Requester:** the Strale master (session_01RFNL6WAcqYWJKtyJRfBGCw), 2026-11-11.
- **Why:** the independent review of `codex/converter-caller-fairness-2` at dd612f6a gave NO-GO. The production code passed on all six fixes, and the full suite and typecheck were green. Two tests the round-2 brief required are missing or cannot fail.
- **Branch:** push only `codex/converter-caller-fairness-3`. It starts from `codex/converter-caller-fairness-2`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only, with no secrets. Tests run offline.
- **Read first:**
  - `docs/lanes/codex/converter-caller-fairness-2-brief.md` and your round-2 report;
  - `apps/api/src/capabilities/lib/readability-convert.ts` and its test file.

## Scope

Change only these:
- `apps/api/src/capabilities/lib/readability-convert.test.ts`;
- one line in `apps/api/src/lib/capability-refusal.ts` (L2 below);
- `readability-convert.ts`, but only for the export L2 needs.

Do not change converter behaviour, the global limits, the worker, url-to-markdown, or any price. Do not reformat lines you do not otherwise change.

## Fix these

1. **MEDIUM M1: the missing test 4 from round 2.**
   - **The gap:** no test covers a keyed caller after out-of-memory, a worker crash, `stopConversionWorkers` or a spawn failure. The review changed the OOM path's `releaseCaller(job, true)` (about line 253) to `releaseCaller(job)`, and every test still passed.
   - **The test:** under `runAsCaller("ip:<name>")`, drive each path with the fake worker:
     - a successful reply;
     - a quick `{ ok: false, tooComplex: true }` reply;
     - a worker `error` or a non-zero `exit` mid-job (the crash);
     - `stopConversionWorkers()` while the page is converting;
     - a worker factory that throws (the spawn failure);
     - an out-of-memory exit, using the error the code treats as out-of-memory.
   - **Expected:**
     - after each path except OOM, `assertConverterAvailableForCaller()` does not throw for that caller;
     - after OOM it throws `ConversionCallerCooldownError`.
   - **Check by hand:** change `releaseCaller(job, true)` on the OOM path to `releaseCaller(job)` and confirm the test fails, then revert. Say in the report that you did this, with the result.

2. **MEDIUM M2: make the round-robin test able to fail.**
   - **The gap:** `"dispatches queued caller buckets A, B, C, A in round-robin order"` queues `a, b, c, a`, so FIFO dispatch gives the same order and the test cannot catch a FIFO regression.
   - **The fix:**
     - queue A's two pages first, then B, then C: `a, a, b, c`;
     - expect the conversion order `a, b, c, a`;
     - assert the order in which pages reach the worker, not only the order of results.
   - **Check by hand:** set the dispatch pick to the first queued page (FIFO) and confirm the test fails, then revert.

3. **LOW L1: the cool-down expiry assertion cannot fail.**
   - **The gap:** about line 353, `expect(() => runAsCaller(..., async () => ...)).not.toThrow()` never throws synchronously.
   - **The fix:** `await expect(runAsCaller("ip:cool", async () => assertConverterAvailableForCaller())).resolves.toBeUndefined()`, or an equivalent that awaits.
   - **Check by hand:** advance the timers one millisecond short of the cool-down and confirm the assertion fails, then revert.

4. **LOW L2: the busy refusal's retry time is hard-coded.**
   - **The gap:** `capability-refusal.ts` has `retry_after_seconds: 5` for `ConversionBusyError`.
   - **The fix:** give `ConversionBusyError` a `retryAfterSeconds` property derived from `CONVERSION_LIMITS`, the same way `ConversionCallerCooldownError` has one. Keep the value at 5 seconds. Read it in `refusalDetails`, as the cool-down branch does.
   - **The test:** in `refusal-consistency.test.ts` or the converter test, `refusalDetails(new ConversionBusyError(...))` returns the constant-derived value.

## Done when

- This passes:
  ```
  cd apps/api && npx vitest run src/capabilities/lib/readability-convert src/capabilities/url-to-markdown src/lib/caller-scope.test.ts src/lib/invocation-facts.test.ts src/lib/retry.executor-parity.test.ts src/routes/x402-gateway-v2.settlement-order.test.ts src/lib/refusal-consistency.test.ts
  ```
- `npm run typecheck` passes. Build `packages/mcp-server` and `packages/sdk-typescript` first.
- `docs/lanes/codex/converter-caller-fairness-3-report.md` lists:
  - each fix, with its test name;
  - each hand check, with its result;
  - the commands run, with their results;
  - anything not done, and why.
