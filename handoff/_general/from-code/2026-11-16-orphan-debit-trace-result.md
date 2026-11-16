Intent: run `orphan-debit-trace` (merged in #1071, deployed as 9bfb7d9117dc) on production once and record what it explains about the two open A-7 items.

Evidence: `archive/receipts/2026-11-16-check-a7-orphan-debit-trace.json` (Q3b privacy rule: no months, counts 1-4 as `<5`). The check answered 200 in about 1 second.

A. Debits whose reference matches no call (fewer than 5, 65 cents, all capability debits):
- Every one of them has a surviving `transaction_quality` row for that reference, so the call row existed and was deleted later. The wallet user is not closed, and nothing refunds them.
- The code at the time charged a sync call only on success and refunded a failed async call against the same reference (`apps/api/src/routes/do.ts` at 3ff55dc9, DEC-14). With no refund on these references, the charges were for calls that ran. **No refund is owed** (moderate-to-high confidence).
- Why the call rows were deleted is not found. No current code path deletes paid call rows; this was a historical deletion, not a live defect.

B. The 27 no-reference debits (5840 cents) against Q2b's 23 pre-WP3 solution calls (5240 cents):
- 2 debits (300 cents) sit on failed or partial calls, and both have a refund nearby: settled.
- 1 debit (150 cents) matches no call, and it too has a refund nearby: settled.
- 24 debits (5390 cents) match the 23 completed calls, which is 150 cents more than those calls' recorded prices. **One debit of up to €1.50 may be a second charge for a completed call.** The matching is ambiguous here: 12 debits sit in bursts where repeated identical calls share a time window. Whether that debit was refunded is not measured.
- The pre-WP3 solution charging path that produced these debits was replaced by WP3 (2026-08-22), so the open question is money only, not a live defect.

Refund owed: €0 proven; at most €1.50 possible. No refund runs before the refund-caps decision (proposed on 2026-11-16, awaiting Petter).

Next authorised action: after the refund-caps decision, either refund the possible €1.50 under the caps or settle it with one narrow check of the burst calls; A-7's debit half is otherwise verified | Owner: Strale master | Blocker: refund-caps decision (Petter)
