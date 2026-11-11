Intent: Codex builder brief: review fixes for converter-caller-fairness (round 2).

# Brief: converter-caller-fairness review fixes

- **Requester:** the Strale master (session_01RFNL6WAcqYWJKtyJRfBGCw), 2026-11-11. This round answers the independent review of `codex/converter-caller-fairness` at 23498a5e, verdict NO-GO.
- **Branch:** push only `codex/converter-caller-fairness-2`. It starts from `codex/converter-caller-fairness`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only, with no secrets. Tests run offline.
- **Read first:**
  - `docs/lanes/codex/converter-caller-fairness-brief.md` and your report;
  - `git diff origin/main...HEAD`.

## What passed review (keep it)

- **Caller-key wiring.** The key is set on every rail that reaches url-to-markdown: `/v1/do` sync, async and batch through `executeWithRetry`, both x402 gateway routes, and the account solution route. No key holds a raw IP, an API key or an email.
- **Bookkeeping.** `releaseCaller` runs on every completion path, and the review found no leak.
- **Refusal handling.** Converter refusals are non-billable on every rail. The `refusalDetails` change, which makes busy refusals retryable, is correct.
- **Full suite.** The full apps/api suite passed on the branch. The timing failures in your report did not reproduce.

## Fix these

1. **MEDIUM, master's decision: replace the refusal of a caller's extra pages with fair queuing.**
   - **The problem:** refusing a caller's second page breaks legitimate use. A batch of 5 url-to-markdown items from one account (`BATCH_CONCURRENCY = 5`, `lib/do/batch.ts`) now gets 1 result and 4 refusals; before this change they queued. Parallel SDK calls and async jobs from one account behave the same way.
   - **What to build instead:**
     1. **Admission.** While the queue has room (`queue.length < maxQueued`), admit any page, whoever sends it. A single caller alone keeps exactly today's behaviour.
     2. **A full queue with a keyed caller arriving.**
        - Count the queued pages per caller key. The page that is converting does not count.
        - Let X be the keyed caller with the most queued pages. Ties go to the caller whose newest queued page arrived latest.
        - If X has at least 2 more queued pages than the new caller, refuse X's newest queued page with `ConversionBusyError`, release its bookkeeping and clear its queue timer, then admit the new page.
        - Otherwise refuse the new page with `ConversionBusyError`, as today.
        - Pages with no caller key are never evicted and never evict anyone.
     3. **Dispatch** takes the next page round-robin across callers, not FIFO. Pick the queued page whose caller was served least recently; a caller never served counts as least recent. Ties go to queue order. Unkeyed pages form one bucket of their own.
        - Keep "last served" in a bounded `Map`: cap 10,000, drop the oldest past the cap. Dispatch must stay O(queue length × 1), and the queue is at most 4.
     4. **Remove the one-page-per-caller rule:** drop `activeCallers` or reduce it to what eviction needs.
   - **Tests:**
     - One caller sending 5 pages behaves exactly as on origin/main: 1 converting and 4 queued, all served.
     - Caller A sends 5 pages, then caller B sends 1. A's newest queued page is refused with `ConversionBusyError`, B is admitted, and B is the next page converted after A's current one.
     - Callers A, B and C, with A holding 2 queued pages: dispatch order alternates A, B, C, A.
     - Unkeyed pages are neither evicted nor evicting.
     - An evicted page's caller bookkeeping and queue timer are cleared: a fake-timer advance past `maxQueueWaitMs` rejects nothing twice.
2. **MEDIUM: cool down only on the time or memory limit.** `readability-convert.ts` (around line 187) cools down on any `tooComplex` reply. That includes the worker's quick tag-count and element-count refusals from `html-parse-bound.ts`, which take about 25 ms.
   - **The fix:** cool down only on the timer path and the out-of-memory error path. A `tooComplex` reply releases without a cool-down.
   - **Test:** a fake worker answering `{ ok: false, tooComplex: true }` leaves the caller free to submit at once.
3. **MEDIUM: restore the settlement-order test's anchor.** `x402-gateway-v2.settlement-order.test.ts` anchors on `indexOf("executeSolution(")`. The first match is now a comment near `x402-gateway-v2.ts:1344`, not the call.
   - **The fix:** anchor on the real call (for example `() => executeSolution(sol.id`). Check by hand that the assertion fails if a settle call is moved between the comment and the call. Revert that experiment afterwards.
4. **LOW–MEDIUM: refuse a cooling-down caller before the fetch.**
   - **The problem:** url-to-markdown fetches the page (`tryPlainFetch`, or a paid Browserless render via `fetchRenderedHtml`) before the converter refuses a caller in cool-down.
   - **The fix:**
     - Export `assertConverterAvailableForCaller()` from `readability-convert.ts`. It throws `ConversionCallerCooldownError` when the current caller key is in cool-down and does nothing otherwise.
     - Call it at the top of the url-to-markdown executor, after input validation and before any fetch.
   - **Test:** with the caller in cool-down, the executor refuses and the mocked fetch is never called.
5. **LOW: count IPv6 by /64.**
   - **The fix:**
     - Build anonymous keys from the IP's bucket, `ip:<hashIp(bucket)>`, where the bucket is `trialRateBucket(ip)` from `lib/trial-eligibility.ts`. An IPv4 address stays itself; an IPv6 address becomes its /64.
     - If the bucket is null, use `ip:unknown`.
     - One helper builds the key for every rail, including both x402 routes; replace the inline copies there with it.
     - On `/v1/do`, `requestContext.ipHash` hashes the full IP, so derive the key from the client IP through the same helper rather than from `ipHash`.
   - **Tests:**
     - two IPv6 addresses in one /64 give the same key; different /64s give different keys;
     - IPv4 is unchanged;
     - no key contains the raw IP.
6. **LOW: tests and wording.**
   - Restore the worker factory in `finally` in every converter test that replaces it.
   - Use fake timers for the cool-down test, at the production `callerCooldownMs`.
   - Build both refusal messages and their `retry_after_seconds` from `CONVERSION_LIMITS`; no hard-coded "30".
   - Cool-down message: "Pages you sent recently took too long or too much memory to convert. Please retry in 30 seconds." (30 from the constant).
   - Add the brief's missing test 4: a keyed caller can submit again after success, refusal, crash and stop, and is in cool-down only after a time-out or out-of-memory.

## Do not change

The global limits, the worker, url-to-markdown's output and fetch rules, any price, and the passing wiring above (beyond fix 5's key helper).

## Done when

- `cd apps/api && npx vitest run src/capabilities/lib/readability-convert src/capabilities/url-to-markdown src/lib/caller-scope.test.ts src/lib/invocation-facts.test.ts src/lib/retry.executor-parity.test.ts src/routes/x402-gateway-v2.settlement-order.test.ts src/lib/refusal-consistency.test.ts` passes.
- `npm run typecheck` passes. Build `packages/mcp-server` and `packages/sdk-typescript` first.
- `docs/lanes/codex/converter-caller-fairness-2-report.md` lists:
  - each fix, with its files and tests;
  - the commands run, with their results;
  - anything not done, and why.
