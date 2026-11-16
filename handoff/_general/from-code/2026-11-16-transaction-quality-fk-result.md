Intent: rerun `transaction-quality-fk` after #1074 deployed (`f8ef0ec71c58`, live on `/health` at about 06:42 Stockholm time) and record what it says about the A-7 deletion-cause item.

Evidence: `archive/receipts/2026-11-16-check-a7-transaction-quality-fk-banded.json`, banded under Q3b.
- The check answered 200 in 1.7 s, and the orphan count completed.
- The earlier 500 (`archive/receipts/2026-11-16-check-a7-transaction-quality-fk-timeout.json`) was a 7.1 s run against the 5 s timeout. A cold cache is the likely reason the same count was slower then. That is an inference, not a measurement.

**The foreign key exists in production.** It runs from `transaction_quality.transaction_id` to `transactions.id`, with ON DELETE CASCADE, is validated, and is not deferrable.

**Yet 103,416 quality rows reference no existing call row.**
- Fewer than 5 of them have a debit.
- None of them are soft-deleted.
- `transaction_id` is NOT NULL in `apps/api/src/db/schema.ts`. That is not verified in production. The count uses `NOT EXISTS`, so NULL references, if any exist, are included in it.

**What the combination means.** A validated, non-deferrable cascading key with orphan rows means the referential-integrity triggers did not run for those rows. Where the parent row is gone, that happens through:
- `session_replication_role = replica`;
- `ALTER TABLE ... DISABLE TRIGGER ALL`;
- a restore or load done with triggers disabled, which could also insert quality rows whose call rows were never loaded.

Storage or index corruption is not excluded either. No tracked code sets `session_replication_role` or disables triggers (`git grep`, 2026-11-16).

**Cause:** not identified. Confidence that it happened outside the application: moderate.

**Money:**
- The rows with a debit are the dangling-reference debits in `archive/receipts/2026-11-16-check-a7-orphan-debit-trace-banded.json`: 65 cents debited, 0 refunded.
- `handoff/_general/from-code/2026-11-16-orphan-debit-trace-result.md` concludes that those calls completed and no refund is owed. That is an inference from the charging path of that era, rated moderate-to-high confidence, not a measurement.
- The no-reference debits are measured: €0 owed (`archive/receipts/2026-11-16-check-a7-burst-debit-refund-banded.json`).
- The remaining orphan rows have no debit.

**A-7 status:**
- The refund owed is €0, measured for the no-reference debits.
- It is €0 by inference, at moderate-to-high confidence, for the 65 dangling-reference cents.
- The cause of the deletion or load is still open.

Next authorised action: build one aggregate-only ops-read check that places the orphaned quality rows before or after named incident dates (chiefly the 2026-05-04 Postgres crash-loop and recovery). It publishes no month-level split, and any band under 5 reads `<5` | Owner: Strale master | Blocker: none
