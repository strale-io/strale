Intent: builder-lane report for the read-only `orphan-debit-trace` ops-read check, which explains the two orphan-debit findings from the first production run of the money checks.

# Report: `orphan-debit-trace`

**Status:** built and tested offline. It has not been run against production; that is the master's step after merge and deploy.
**Files:** `apps/api/src/lib/ops-read.ts`, `apps/api/src/lib/ops-read.test.ts`, this report.

## What it answers

- **Finding A:** fewer than 5 purchase debits (65 cents, March 2026) whose `reference_id` matches no `transactions.id`.
- **Finding B:** 27 purchase debits with `reference_id IS NULL` (5840 cents), against 23 pre-WP3 wallet solution calls counted by Q2b (5240 cents). That leaves 4 debits (600 cents) unexplained.

## What I built

One new entry in `OPS_READ_CHECKS`. It takes no caller input (`prepare: () => null`), binds no parameters at all, and runs three statements. Counts are cast `::int`, cents are cast `::bigint::text`, and months come from `to_char(... AT TIME ZONE 'UTC', 'YYYY-MM')`. Database errors are not caught. Every returned row is built by `pick` from a fixed field list.

```
{ dangling: [ { month, debited_cents,
                in_transaction_quality, in_wallet_reservations, in_capability_invocations,
                in_x402_settlement_intents, in_dispute_requests, in_job_files, in_job_callbacks,
                is_wallet_transaction_id, refunded_cents, wallet_user_closed, debit_type_note } ],
  no_reference_debits: { months: [ { month, debits, debited_cents } ],
                         matched_debits, matched_completed_debits,
                         distinct_matched_solution_calls, distinct_matched_completed_solution_calls,
                         debits_sharing_a_call, unmatched, unmatched_cents,
                         matched_not_completed: { debits, debited_cents, refunded_nearby_debits },
                         unmatched_kinds: [ { month, debit_type_note, solution_call_within_10m,
                                              refunded_nearby, debits, debited_cents } ] } }
```

### Changes from the brief's output shape

These need the master's eye.

- **`no_reference_debits` instead of `no_reference`.** `OUTPUT_FIELDS` is a flat map with one shape per key, and `no_reference` is already kept-charges' boolean. Reusing the name for an object would have meant loosening an existing shape.
- **`matched_completed_debits` (new; named `matched_completed_solution_calls` in 7278c9a7).** It counts the same match with Q2b's `status = 'completed'` added. `matched_debits` minus this number is the matched debits Q2b did not count. Before #350 the solution route could write `status = 'partial'` (commit `80371507`), and Q2b leaves those out.
- **`unmatched_kinds` (new).** It groups the unmatched debits by four columns:
  - month;
  - `debit_type_note`;
  - `solution_call_within_10m`: the same match as above over ±10 minutes. The early solution route debited before it ran the steps, so the call row can be written more than 60 s after the debit.
  - `refunded_nearby`: a no-reference refund of the same amount to the same wallet within 10 minutes after the debit. The early route refunded an "execution error" this way, possibly with no call row at all.

  Without this list, `unmatched` would be a bare count and the 4 debits would stay unexplained.

### Rules and vocabularies

- **Matching rule.** A debit is matched when a solution transaction exists with all of:
  - `solution_slug IS NOT NULL`;
  - `payment_method = 'wallet'`;
  - the same user (`wallets.user_id`);
  - `price_cents = -amount_cents`;
  - `created_at` within ±60 s of the debit.

  Status is not filtered. The match is an EXISTS, not one-to-one pairing, so two debits can match the same call.
- **`debit_type_note` vocabulary.** It is a closed set read from the description prefixes that debit writers have used in git history:

  | Note | Description it comes from |
  |---|---|
  | `capability` | `Capability: ` |
  | `solution` | `Solution: ` |
  | `batch_item` | `Batch item ` |
  | `reservation_capture` | `Sync capability reservation captured` |
  | `none` | NULL |
  | `other` | anything else |

  Matching uses `starts_with`, not LIKE. The raw text is never selected, and a test checks that.
- **`wallet_user_closed`.** This is `users.deleted_at IS NOT NULL`, which the Art. 17 closure sets. It is null if the wallet row is missing.
- **Probed columns.** These are every uuid transaction-id column in `schema.ts`:

  | Column | Foreign key to `transactions.id` |
  |---|---|
  | `transaction_quality` | cascades on delete |
  | `wallet_reservations` | none |
  | `capability_invocations` | none |
  | `x402_settlement_intents` | none |
  | `dispute_requests` | refuses a delete |
  | `job_files` | refuses a delete |
  | `job_callbacks` | refuses a delete |

  The check also probes `wallet_transactions.id`.

  A hit only proves a deleted call when the column has no foreign key, or when the foreign key was missing at the time. With the declared cascade on `transaction_quality`, deleting the call would also have deleted its quality row.

## Review fixes (after GO on 7278c9a7)

- **Debits and calls counted apart.** `matched_solution_calls` counted debits, so several debits matching one call looked fully explained. It is now `matched_debits`, and `matched_completed_solution_calls` is now `matched_completed_debits`.
  - New counts: `distinct_matched_solution_calls` and `distinct_matched_completed_solution_calls` (distinct matched calls) and `debits_sharing_a_call` (debits whose matched call another debit also matches).
  - An internal `pairs (debit_id, call_id, call_status)` CTE holds the matches by row id. No id leaves the statement.
- **Refund status of non-completed matches.** `matched_not_completed: { debits, debited_cents, refunded_nearby_debits }` covers debits matched only to calls that did not complete. It uses the same refund rule as `unmatched_kinds`.
  - The count is `refunded_nearby_debits` because `refunded_nearby` is already a boolean key.
  - The cents key is `debited_cents`, the established cents key name.
- **`in_capability_invocations` is not evidence.** It is always false today, because no writer sets `capability_invocations.transaction_id` (see its comment in `schema.ts`).
- **`refunded_cents` repeats per row.** It is the refund total for the reference, so when two dangling debits share one reference it appears on both rows. Do not sum it across rows.
- **Tests.** The new test "counts debits and distinct calls apart, so one call matched by several debits is visible" fails against `7278c9a7`, along with four updated tests: `5 failed | 90 passed (95)`. All 95 pass with the fix. On a throwaway local Postgres, two debits matched to one completed call plus one refunded partial call gave:
  - `matched_debits` 3 and `distinct_matched_solution_calls` 2;
  - `debits_sharing_a_call` 2;
  - `matched_not_completed` with 1 debit, 250 cents and 1 refunded nearby.

## Indexes, per statement

I checked the plans on a throwaway local Postgres 16 with `enable_seqscan = off`, to prove each index can be used. These are not production plans.

1. **`dangling`**
   - Scans `wallet_transactions` for purchase debits through `wallet_transactions_reference_idx` (`reference_id IS NOT NULL`) or a sequential scan. Q3b does the same scan, and that ran in production.
   - Joins to `transactions_pkey` for the anti-join.
   - Each probe runs only for the fewer than 5 dangling rows, using these indexes:
     - `transaction_quality_transaction_id_key` (unique);
     - `wallet_reservations_transaction_id_unique` (partial, usable for an equality);
     - `capability_invocations_transaction_idx`;
     - `job_files_transaction_id_idx`;
     - `job_callbacks_pkey`;
     - `wallet_transactions_pkey`;
     - `wallet_transactions_reference_idx` for the refunds;
     - `wallets_pkey` and `users_pkey`.
   - `x402_settlement_intents.transaction_id` and `dispute_requests.transaction_id` have no index, so those two probes are sequential scans, at most five each.
2. **`no_reference_debits` months and totals**
   - `nr`: a sequential scan of `wallet_transactions`, since there is no index on `type`, plus `wallets_pkey`.
   - `sol`: `transactions` filtered on `solution_slug IS NOT NULL AND payment_method = 'wallet'`. There is no index on either column, so expect a sequential scan, like Q2b. `transactions_user_id_idx` is usable through the `user_id IN (nr users)` filter if the planner prefers it.
   - `rf`: a sequential scan of `wallet_transactions`.
   - The CTEs are `MATERIALIZED`, so each table is read once. The matching then runs over 27 debits in memory.
3. **`unmatched_kinds`**: the same CTEs as statement 2, rerun as a separate statement under its own 5 s timeout.

The biggest cost is the `transactions` scan in statements 2 and 3, each comparable to Q2b. If either times out, the route answers "The check failed." and a date window can follow.

## Tests

Command: `cd apps/api && npx vitest run src/lib/ops-read.test.ts`. Result: 95 passed. With `src/routes/ops-read.test.ts` included: 107 passed. `npx tsc --noEmit -p .` exits 0, after building `packages/mcp-server` and `packages/sdk-typescript`.

New tests, in `describe("orphan-debit-trace")`:

- takes no caller input;
- returns its exact shape and passes the output contract;
- binds nothing at all, so no Date can reach a query;
- no id, description or email is returned, checked on run()'s own result before the output contract;
- selects no id and no description text: description is read only inside the closed CASE;
- counts debits and distinct calls apart, so one call matched by several debits is visible;
- the dangling statement keeps Q3b's filters and probes every transaction-id column;
- both no-reference statements carry the matching rule; the kinds statement keeps only the unmatched;
- counts are cast to int and every returned cents column to bigint text;
- a missing total row reads as nulls, not zeros;
- a database error in statement 0, 1 and 2 propagates;
- the output contract refuses each of:
  - raw description text as the note;
  - a note outside the vocabulary;
  - a flag as text;
  - negative cents;
  - a month with a day.

The existing test `only the named checks exist` now lists `orphan-debit-trace`.

**Fail-before evidence, first commit.** I ran the new test file against the unchanged `ops-read.ts` (`git checkout HEAD -- apps/api/src/lib/ops-read.ts`), then restored my version:

```
❯ src/lib/ops-read.test.ts (94 tests | 18 failed)
  × only the named checks exist
  × takes no caller input
  × returns its exact shape and passes the output contract
  … (all 18 orphan-debit-trace tests, plus the name list)
```

**Local SQL run.** Outside the test suite, I ran the real check through drizzle against the same throwaway Postgres, which I then deleted. It ran read-only with a 5 s timeout, on seeded cases, and each case classified as intended:

| Seeded case | Result |
|---|---|
| Dangling debit with a surviving quality row, a partial refund and a closed user | as intended |
| Dangling debit whose reference is another ledger row | as intended |
| Matched completed solution call | as intended |
| Matched partial solution call | counted in `matched_debits` (then named `matched_solution_calls`), not in `matched_completed_debits` |
| Solution call 5 minutes after the debit | `solution_call_within_10m` |
| Execution error refunded with no reference | `refunded_nearby` |
| NULL description | `none` |

I also confirmed that `GROUP BY ROLLUP` over zero rows still returns the total row.

## What I could not do

- **No production run.** I have no access, and none was needed. The check's real timing and the counts it returns are the master's to read.
- **The A-7 receipt is not on main.** I worked from the task's description of findings A and B.
- **Schema, not live constraints.** Whether the declared foreign keys on `transaction_quality`, `dispute_requests`, `job_files` and `job_callbacks` exist in production was read from `schema.ts` and the startup blocks, not from production.
- **Per-debit rows are sensitive.** `dangling` returns per-debit rows (month, cents and flags, no ids). As the brief says, they go to the token holder only, and the master applies the privacy table before any receipt.

Next authorised action: review, merge and run orphan-debit-trace on production | Owner: Strale master | Blocker: none
