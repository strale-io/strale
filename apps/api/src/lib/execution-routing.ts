/**
 * Whether a capability executes synchronously or asynchronously (DEC-22).
 *
 * Extracted from `routes/do.ts` in #436 so the policy has a name, a test, and
 * one definition that the route, the audit script and the tests all read. It
 * was previously an inline expression, which meant the only way to check a
 * capability against it was to reason about a line number.
 *
 * ## Why the threshold and the wall are different numbers, and why that matters
 *
 * The sync path runs the executor INSIDE the wallet transaction, under
 * `SET LOCAL idle_in_transaction_session_timeout = '15s'`. The transaction is
 * genuinely idle while the executor works, so an execution longer than 15s
 * aborts with Postgres `25P03` and surfaces as `execution_timeout` — unbilled,
 * but also unanswered.
 *
 * The routing threshold is 10s. So there is a five-second band in which a
 * capability is routed sync and can still be killed by the wall, and the
 * decision is made on a CENTRAL-TENDENCY statistic against a HARD limit — an
 * average says nothing about the tail that actually hits it.
 *
 * `page-speed-test` sat in that band: `avg_latency_ms = 8000` while p95 was
 * 19,029 ms and 54 of 433 successful executions (12.5%) ran past 15s (#434,
 * measured over 90 days).
 *
 * ## Why it stayed invisible
 *
 * `avg_latency_ms` is measured from `test_results`, and the test runner calls
 * executors DIRECTLY — never through `/v1/do` — so the harness never meets the
 * wall. Completed transaction rows exist at 49.9s. Only a real caller on the
 * paid `/v1/do` path is subject to it, and this capability has had one
 * non-harness call in 90 days. The defect is structural and provable from the
 * distribution; it has not yet cost a customer, and saying otherwise would
 * overstate it.
 *
 * `scripts/audit-execution-routing.ts` is the recurring check.
 */

/** Above this declared average, `/v1/do` executes async and returns 202 (DEC-22). */
export const ASYNC_THRESHOLD_MS = 10_000;

/**
 * The wall the SYNC path runs under — `idle_in_transaction_session_timeout`
 * in `executeSync`'s wallet transaction. Not a routing input; the number a
 * routing decision has to respect.
 */
export const SYNC_TRANSACTION_WALL_MS = 15_000;

/**
 * A null latency routes SYNC. #436 flagged that as the riskiest possible
 * default — an unmeasured capability is exactly the one whose duration nobody
 * knows — and #438 measured it before deciding, rather than flipping it on the
 * argument alone.
 *
 * All 39 active capabilities with a null `avg_latency_ms`, against their real
 * completed executions (2026-08-29):
 *
 *     would get a measured value        38   (n from 236 to 4,860 each)
 *     of those, p95 above the threshold  1   (company-news, p95 28,734 ms)
 *     next highest p95                       us-product-recall-search, 9,232 ms
 *     unmeasurable (zero executions)     1   (uk-gazette-notice-search)
 *
 * So the population is not "unmeasured and therefore dangerous"; it is
 * "unmeasured and, bar one, demonstrably fast". Flipping the default to async
 * would move 38 correctly-routed fast capabilities onto a 202-and-poll
 * contract to fix one — changing the response shape for every caller of each,
 * to solve a problem that populating the field solves exactly.
 *
 * Decision: keep sync, and populate. The residual is
 * `uk-gazette-notice-search`, which has never executed, so nothing can be said
 * about its duration — it stays null and stays sync, and if it is ever called
 * and is slow, `audit-execution-routing.ts` is what surfaces it.
 * `capability-readiness.ts` already reports a null as an issue.
 */
export function shouldExecuteAsync(avgLatencyMs: number | null | undefined): boolean {
  return (avgLatencyMs ?? 0) > ASYNC_THRESHOLD_MS;
}
