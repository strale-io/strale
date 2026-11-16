Intent: builder report for `ops-read-money-checks`: five read-only money-path checks in `GET /v1/ops-read/:check`.

# Report: ops-read money-path checks

**Status:** done; both gates pass. Built by a Claude builder standing in for the Codex task (the Codex route was unavailable), from `origin/main` 9a6429fe.

**Files changed:** `apps/api/src/lib/ops-read.ts`, `apps/api/src/lib/ops-read.test.ts`, this report. Route, token rule, 5-second timeout and the three existing checks are unchanged. No migration, index or env var.

## What was built

`capability-debits` (Q1), `solution-debits` (Q2, Q2b), `kept-charges` (Q3, Q3b, Q3c), `swallowed-failure-exposure` (Q4), `fx-error-rate` (Q5), each `prepare: () => null`.
- Totals: Q1/Q2 keep one ROLLUP statement and select `GROUPING(slug)::int AS is_total`, which `splitRollup` uses and drops. Q4 runs a separate total statement, so the per-slug SQL computes no payer column (rule 2).
- Every returned row is built by `pick(row, fields)` from an explicit list; counts `::int`, cents `::bigint::text`.
- Slugs bind as `c.slug IN ($1, …, $36)` from the exported `SWALLOWED_FAILURE_SLUGS`. The WP3 cutoff is a SQL-text literal `TIMESTAMPTZ '2026-08-22 00:00:00+00'`; the FX window binds as text cast to `date`, as `test-call-cost` does.
- Contract: new `month` shape; vocabularies `payment_method`, `call_status` (used by `status` and `outcome`), `source`; `TEST_TYPES`/`TEST_MODES` moved into the same `VOCABULARIES` map, values unchanged.
- Changes to the reviewed SQL beyond the brief's rules: Q3b's month is now `to_char(w.created_at AT TIME ZONE 'UTC', 'YYYY-MM')` (rule 6; the original truncated in the session time zone). Q4 per-slug orders by `SUM(t.price_cents) DESC, slug, payment_method`, because `recorded_cents` is text and would sort lexically.

## Commands

- `npm ci`: exit 0. Then `npm --workspace=packages/mcp-server run build` (the route test imports `strale-mcp/tools`, which has no dist after a fresh `npm ci`).
- `npm --workspace=apps/api exec vitest run src/lib/ops-read.test.ts src/routes/ops-read.test.ts`: `Test Files 2 passed (2)`, `Tests 89 passed (89)`.
- `npm run typecheck`: exit 0, ending `> strale-cli@0.1.0 typecheck` / `> tsc --noEmit`. The first run failed only in `packages/langchain` (`Cannot find module 'straleio'`), because the SDK was not built yet. After `npm --workspace=packages/sdk-typescript run build`, the step CI runs before typecheck (ci.yml:378), it passed. apps/api passed on both runs.

## Red, then green

- Tests first, no code: `Tests 34 failed | 43 passed (77)`. Every new check test failed (`only the named checks exist`, shape ×5, `no Date reaches a query`, `no id or content key…`, filters ×5, FX window, slug binding, error propagation ×9, slug list, payers, `(total)`, casts, planted text). The 7 `output contract refuses …` cases passed while red, because unlisted keys were already refused; they prove the new vocabularies only after green.
- After implementation: 77/77 in the lib file, 89/89 across both files.
- Mutations, each applied alone and then reverted (scratch script, not committed):
  - `run()` catches and returns empty rows: `promise resolved "{ total: null, slugs: [] }" instead of rejecting`.
  - Payer field on per-slug rows: the shape test and `payers never per slug` fail.
  - Wallet filter dropped from Q2b only: only `reviewed filters … solution-debits` fails.
  - `ANY(${array}::text[])`: the slug-binding test and the filters test fail.
  - `orphan_debits` returned unpicked: `no id or content key…` fails.
  - `'(total)'` slug in Q1: `totals carry no fake '(total)' slug` fails.

## Per statement: expected plan (not measured; no database here)

| Statement | Indexes it can use | Sequential scan expected? |
|---|---|---|
| Q1 | `transactions_status_idx` (low selectivity); `capabilities_pkey`; `wallet_transactions_reference_idx` ×2 per call | Yes, `transactions`. Two correlated index probes per paid call; the likeliest of the five to approach 5s |
| Q2 | `wallet_transactions_reference_idx` ×2 per call; `solutions_slug_unique` | Yes, `transactions` (no `solution_slug`/`created_at` index) |
| Q2b | none useful | Yes, `transactions` |
| Q3 | `transactions_pkey` for the join | Yes, `wallet_transactions` (both CTEs, hash aggregate); probably `transactions` for a hash join |
| Q3b | `transactions_pkey` (anti-join) | Yes, `wallet_transactions` |
| Q3c | `wallet_transactions_reference_idx` (NOT EXISTS), `transactions_pkey` | Yes, `wallet_transactions` (refunds) |
| Q4 ×2 | `capabilities_slug_unique` (36 slugs), then `transactions_capability_id_created_at_idx` | No; nested loop over index scans |
| Q5 calls | `capabilities_slug_unique`, `transactions_capability_id_created_at_idx` (id + range) | No |
| Q5 tests | `test_results_slug_executed_idx` (slug + range), `test_suites_pkey` | No |
| oldest day | `test_results_executed_at_idx` (min) | No |

## Doubts for the master

1. `call_status` covers what the brief lists. Statuses found in code: `pending`/`executing`/`completed`/`failed` (schema.ts:408 comment) and `health_probe` (filtered in jobs/integrity-hash-retry.ts:187). Q3 has no price or date floor beyond one day ago, so it reaches `health_probe` rows only if one has a referencing purchase debit; none should.
2. `slug` uses the existing slug shape. A solution slug longer than 81 characters, or one with an underscore, would fail `solution-debits` loudly.
3. Q1's HAVING keeps the reviewed rule: a slug with only refunds, and no mismatch, is not listed. Its refunds still count in `total.refunded`.
4. If ROLLUP ever returned no grand-total row, `total` would be `null`. Postgres always emits that row, even when there are no input rows.
5. `before_wp3.first_day`/`last_day` and the Q4 days are returned as the brief asks. Folding them for receipts stays the master's step (a7 brief §4).
