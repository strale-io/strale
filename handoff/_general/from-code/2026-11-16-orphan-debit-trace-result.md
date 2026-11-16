Intent: run `orphan-debit-trace` (merged in #1071, deployed as 9bfb7d9117dc) once on production and record what it explains about the two open A-7 items.

Evidence: `archive/receipts/2026-11-16-check-a7-orphan-debit-trace-banded.json`. It follows the Q3b privacy rule: no months, counts from 1 to 4 shown as `<5`, groups smaller than 5 given in cents only, and no field that would let such a count be worked out. The check answered 200 in about 1 second.

A. Debits whose reference matches no call. There are fewer than 5, totalling 65 cents, and all are capability debits.
- Each one has a surviving `transaction_quality` row for its reference. The charging path of that era inserted the call row before it wrote the quality row, so the call did run.
- Each call row is now gone. `transaction_quality.transaction_id` references `transactions.id` with ON DELETE CASCADE, so an ordinary delete would have removed the quality row too. The row must therefore have been removed while that foreign key was missing or bypassed in production. This has not been measured, and the cause of the deletion is unknown.
- No current code path deletes paid call rows. Outside tests, only the health probe and the x402 price-0 claims delete call rows.
- Before WP3, the charging code in `apps/api/src/routes/do.ts` charged a sync call only on success. For a failed async call, it wrote the refund against the same reference before recording quality (DEC-14). These references have no refund, so the charges were for calls that finished.
- **No refund owed** on these, with moderate-to-high confidence. This rests on the deployed code having matched that path.

B. The 27 no-reference debits (5840 cents), compared with Q2b's 23 pre-WP3 solution calls (5240 cents):
- The debits on failed or partial calls (300 cents) are all refunded nearby, so they are settled.
- The debits that match no call (150 cents) are also refunded nearby, so they are settled.
- The debits that match the 23 completed calls total 5390 cents, which is 150 cents more than those calls' recorded prices. **Up to €1.50 may be a second charge for a completed call.**
- The matching is ambiguous: 12 debits fall in bursts where repeated identical calls share a time window.
- Whether the possible €1.50 was refunded has not been measured.
- WP3 replaced the pre-WP3 solution charging path that produced these debits, so no live defect remains here.

Refund owed: €0 proven and at most €1.50 possible. No refund runs before the refund-caps decision, which was proposed on 2026-11-16 and is waiting on Petter.

Status against the brief's results table: orphan debits route to "a remediation batch, plus a refund measurement". Both remain open. A-7 is **not yet verified**, for two reasons:
- the refund measurement for the possible €1.50 is not finished;
- the cause of the deleted call rows is not found.

Next authorised action: open the remediation batch: one narrow check of the burst calls to measure whether the possible €1.50 was refunded, and one check of whether the cascade from `transactions` to `transaction_quality` exists in production. After the refund-caps decision, refund what that measurement shows is owed | Owner: Strale master | Blocker: the refund waits on the refund-caps decision (Petter); the checks have no blocker
