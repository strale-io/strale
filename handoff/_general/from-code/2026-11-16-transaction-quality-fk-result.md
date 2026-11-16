Intent: rerun `transaction-quality-fk` after #1074 deployed (`f8ef0ec71c58`, live on `/health` at about 05:42Z) and record what it says about the A-7 deletion-cause item.

Evidence: `archive/receipts/2026-11-16-check-a7-transaction-quality-fk-banded.json`, banded under Q3b. It answered 200 in 1.7 s and the orphan count completed. The earlier 500 (`archive/receipts/2026-11-16-check-a7-transaction-quality-fk-timeout.json`) was the same count on a cold cache.

- **The foreign key exists in production.** It runs from `transaction_quality.transaction_id` to `transactions.id`, with ON DELETE CASCADE, is validated, and is not deferrable.
- **Yet 103,416 quality rows point at a call row that no longer exists.**
  - Fewer than 5 of them have a debit: the dangling-reference debits already settled as owing nothing.
  - None of them are soft-deleted.
  - `transaction_id` is NOT NULL in the schema, so these are not null references.
- **A validated cascading foreign key and orphans cannot both arise through ordinary deletes.** A delete on `transactions` fires the cascade trigger, and validation checks every row as it stands at that moment. So these rows lost their call rows in an operation that bypassed the foreign-key triggers.
  - Examples of such operations: a session with `session_replication_role = replica`, `ALTER TABLE ... DISABLE TRIGGER ALL`, or a data-only restore with triggers disabled.
  - Another possibility: the call rows were removed before the constraint was last created and validated. But validating with orphans present would have failed, so this is less likely.
  - No tracked code sets `session_replication_role` or disables triggers (`git grep`, 2026-11-16).
  - The cause is not identified. Confidence that the deletion happened outside the application: moderate.
- **Money impact: none beyond what is already settled.** The rows with a debit are the dangling-reference debits from `archive/receipts/2026-11-16-check-a7-orphan-debit-trace-banded.json`, which owe nothing. The rest have no debit.

A-7 status:
- the refund owed is €0, measured (`archive/receipts/2026-11-16-check-a7-burst-debit-refund-banded.json`);
- the deletion cause remains open.

Next authorised action: one aggregate-only ops-read check that dates the orphaned quality rows. It should not publish months. Instead it gives counts before and after named incident dates, chiefly the 2026-05-04 Postgres crash-loop and recovery, so the bypassing operation can be matched to an event | Owner: Strale master | Blocker: none
