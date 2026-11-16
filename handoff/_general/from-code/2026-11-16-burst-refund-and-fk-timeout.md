Intent: run the two A-7 remediation checks merged in #1073 (`burst-debit-refund`, `transaction-quality-fk`) on production, record the result, and fix whichever check could not answer.

**Refund owed: €0.** No refund was counted twice (the upper-bound flag is false), though refunds are matched to bursts by wallet, amount and time, not by reference. Evidence: `archive/receipts/2026-11-16-check-a7-burst-debit-refund-banded.json`, following the Q3b privacy rule. That receipt leaves out the burst and debit counts from which a small group's size could be worked out, given `archive/receipts/2026-11-16-check-a7-orphan-debit-trace-banded.json`.

- **Debits matched to completed calls:** 5390 cents, against 5240 cents in recorded prices. That is 150 cents of excess, all of it in fewer than 5 bursts.
- **The excess was refunded:** 150 of its 150 cents were refunded nearby, and 0 cents are unrefunded. No burst was undercharged.
- **The refund total is exact, not an upper bound:**
  - no refund row was counted against two bursts;
  - no refund row sat near another debit as well.
- **Debits with a dangling reference** (65 cents): these were settled earlier, in the orphan-debit-trace handoff. Their calls completed, so nothing is owed.

There is nothing to refund, so this case does not need the refund-caps decision.

**`transaction-quality-fk` could not answer in production.** It returned a 500 after about 7 seconds (`archive/receipts/2026-11-16-check-a7-transaction-quality-fk-timeout.json`). Its count of quality rows whose call row is gone ran past the 5-second statement timeout on about 899k call rows (an estimate, not measured by that run), which aborted the whole check, including the catalog answer about the foreign key.

- **Fix in this branch:** the count now runs inside a savepoint. On a timeout, the check keeps the catalog answer and reports `orphan_counts_complete: false`; any other error still fails it.
- **Tests:** fail-before was verified in the unit suite and in the disposable-Postgres integration suite. The integration suite locks `transaction_quality` from a second connection, so the count times out.
- **Not done:** rewriting the count so it finishes inside the timeout. So the orphan counts may stay incomplete, but the foreign-key answer will come back.

A-7 remains **not verified** on one point only: the cause of the deleted call rows. The first step is whether the cascade from `transactions` to `transaction_quality` exists in production.

Next authorised action: after this branch deploys, confirm `/health` shows its commit, rerun `transaction-quality-fk`, receipt the result (foreign key present, delete action, validated; orphan counts banded or recorded incomplete) and use it for the A-7 deletion-cause item | Owner: Strale master | Blocker: none
