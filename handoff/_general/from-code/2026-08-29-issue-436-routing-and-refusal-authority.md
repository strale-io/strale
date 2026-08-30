# 2026-08-29 — Issue #436: one refusal authority, one routing policy, and a remediation I had recommended that was wrong

Intent: fix `page-speed-test`'s sync/async routing mismatch and remove the duplicated refusal-matching semantics that had caused repeated health-consumer inconsistencies.

## Outcome: SHIPPED — with one operator action outstanding

- PR [#437](https://github.com/strale-io/strale/pull/437) squash-merged as `d2078c13`; CI green on the exact reviewed head `03a9fbf1`; prod cut over `524350db → d2078c13` at 21:26 UTC, verified live.
- **#436 stays open** until one scoped production UPDATE runs. It is Petter's, prepared with evidence, in the issue.
- Follow-up **#438** filed.

## Needs Petter — one SQL statement

```sql
UPDATE capabilities SET avg_latency_ms = 20000, updated_at = now()
 WHERE slug = 'page-speed-test';
```

Pre-write state captured (8000, `updated_at` 19:06:52Z), expected diff is one row and one column, reversible, reconciliation steps in the issue. The true mean of successful executions is **10,152 ms** — already above the 10,000 threshold, so even a strictly honest correction routes it async; 20,000 is recommended so it does not oscillate 1.5% either side of the line.

## The correction worth reading first

**#436's own recommended remediation was wrong, and I wrote it.** It said `POST /v1/internal/onboarding/fix-latency` was "the intended path" for null latencies. That endpoint medians `test_results.response_time_ms` across *all* suites — including the negative and known_bad ones that fail validation in ~5 ms without executing. `page-speed-test` medians **6 ms** over 1,592 results and 11,208 ms over the 617 that actually ran. Running it would route slow capabilities **sync**, the opposite of the fix. The audit script now says so where an operator will read it.

## Refusal matching: three implementations, not two

I filed this saying "two matchers". There were three — the taxonomy also spread the fragments into a RegExp as unanchored, case-insensitive sources, which I had not found when writing the issue. All three now call `isRefusalMessage`; the array is imported nowhere else; an AST test fails CI if a fourth appears.

The house style (`'field' must be …`) is recognised by **shape**, from one source string the taxonomy imports rather than copies. That made #434's bespoke entry unnecessary, so it is deleted — a fix that was needed a week ago no longer is, which is the point of fixing an authority instead of adding a string.

**Round 3 found a consumer that already disagreed:** `quality-capture` bucketed 502/503/504 as upstream and a plain **500** as `internal_error` — our defect — while the taxonomy called the same string `upstream`. 34 real production failures on `page-speed-test` alone, scored against us on the trust surfaces.

## The audit script is the durable part

A one-time query cannot keep finding this: the decision is made on a central-tendency statistic against a hard limit, so it is structurally blind to the tail. `scripts/audit-execution-routing.ts` (read-only) found a second, worse instance — **`company-news`**, `avg_latency_ms` NULL so routed sync by default, p95 29,405 ms, **52.2%** of executions past the wall.

## Honest impact

The harness calls executors directly, never through `/v1/do`, so it never meets the wall — completed rows exist at 49.9 s. Only real callers on the paid path are subject to it, and `page-speed-test` has had **one non-harness call in 90 days** (11.5 s, survived). The defect is structural and provable; it has not yet cost a customer, and I have not implied otherwise.

## Process notes

- **13/13 mutations caught**, including reverting each consumer to its own matcher and having `do.ts` restate the threshold.
- 3270 tests pass serially; the 3 parallel-load timeouts all pass in isolation (known pattern).
- **Two CI failures, both mine, both caught by guards that exist for exactly that:** a stale row-shape cast that only `typecheck:scripts` covers, and the audit script reaching for the read-write pool while its docstring promised read-only. The second guard then flagged my *comment* naming the accessor — rewording the comment was the fix; weakening the guard was not.
- Worktree `strale-wt-wp18` (removed at session end).

## Dispositions

- **PSI API key** — deferred, optional. Zero quota failures in 90 days; nothing asked of Petter.
- **Sitemap parser** — confirmed linear and bounded at the 50 MB protocol max; **no change**. The 50,000-URL cap was rejected: `total_urls` is a reported output, so capping the scan would report 50,000 for a larger sitemap — a wrong answer traded for a bound that is already adequate.
- **#438** — `fix-latency` measuring the wrong population, `executeAsync`'s documented test-coverage gap, the 36 null latencies, and the deeper "average against a hard limit" shape.
