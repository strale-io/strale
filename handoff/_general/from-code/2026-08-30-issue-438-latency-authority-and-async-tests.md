# 2026-08-30 — Issue #438: routing metadata from executions, and executeAsync finally tested

Intent: stop `fix-latency` deriving routing metadata from tests that never executed, cover `executeAsync`/`executeInBackground`, and decide the null-routing default on measurement rather than argument.

## Outcome: SHIPPED — two operator writes outstanding

- PR [#439](https://github.com/strale-io/strale/pull/439) squash-merged as `c501f277`; CI green on the exact reviewed head `59362a96`; prod cut over at 22:55 UTC, verified live.
- **#438 stays open** until two rows are written. Both are Petter's, prepared with evidence in the issue.

## Needs Petter — two SQL statements

```sql
UPDATE capabilities SET avg_latency_ms = 20000, updated_at = now() WHERE slug = 'page-speed-test';
UPDATE capabilities SET avg_latency_ms = 28734, updated_at = now() WHERE slug = 'company-news';
```

**`page-speed-test` is still 8000** — #436 was closed without its update being applied. Verified against production, not assumed from the issue state; the brief was right to insist on checking.

## The correction worth reading

**The filter this issue proposed — my own text — would have been wrong in both directions.** #438 said to exclude `negative` and `known_bad`. Measuring by suite type:

| type | n | median | | type | n | median |
|---|---|---|---|---|---|---|
| schema_check | 1,071 | **3 ms** | | known_answer | 206 | 14,430 ms |
| negative | 391 | **6 ms** | | known_bad | 155 | **17,723 ms** |
| edge_case | 410 | **9 ms** | | dependency_health | 213 | 7,879 ms |

`known_bad` **does** execute — it feeds a real input the upstream rejects. And `edge_case` spans both behaviours (median 9 ms, max 60,020 ms). Neither the label nor a duration threshold separates "executed" from "returned before executing", which is why the brief's "no crude threshold" instruction mattered.

The answer was to change the *population*, not the filter: `transactions` rows exist only because the capability ran. p95 rather than a mean, because the question is whether calls cross a hard 15s wall. And the estimator can now **refuse** — the old `heuristicLatency` wrote 20 ms for anything tagged `algorithmic` with zero executions behind it.

## Null routing: measured, then kept

All 39 active nulls, via a new read-only dry-run script: **38** would get a measured value, of which exactly **one** (`company-news`) crosses the threshold; the next highest p95 is 9,232 ms. One (`uk-gazette-notice-search`) is refused — it has never executed.

Flipping the default to async would have moved 38 correctly-routed fast capabilities onto a 202-and-poll contract to fix one. Decision: **keep sync, populate the field**, recorded in `execution-routing.ts` with the table.

## executeAsync coverage

18 tests in `do.async.test.ts` — the "second DB-shaped mock surface" `do.core.test.ts:80` said was needed. The seam that made it possible: mocking `trackBackgroundTask` to capture the promise, so the test awaits the exact background work the route launched instead of racing it.

The terminal-state guard is asserted by rendering the predicate through drizzle's own dialect — the predicate is SQL, so the honest assertion is the SQL, not a poke at the object graph.

It does **not** claim to cover the wallet debit, which runs through `walletService` and belongs to `do.core` and the concurrency integration suite. Stated in the test rather than implied by omission.

## Process notes

- **12/12 mutations caught**, including the estimator inventing a value, mean-instead-of-p95, test results back in the population, async settling twice, the failure path charging, and the terminal-state guard removed.
- The local full-suite run showed ~10s timeouts under sustained machine load (hours of heavy suites); all pass in isolation, and CI on a clean runner is green — that is the authoritative check.
- Three times this session a structural check tripped on my own explanatory comment. Each time the fix was to make the check precise (assert the *definition*, assert the *selected column*) rather than delete the prose — a check that forbids mentioning a removed mistake pressures the next author to drop the explanation.
- Worktree `strale-wt-wp19` (removed at session end).

## Left open

`uk-gazette-notice-search` stays null and sync — it has never executed, so nothing can be said about its duration. `audit-execution-routing.ts` is what surfaces it if that changes.
