Intent: H7e PR A (platform-hardening T7), fix the pre-existing startup-migration block issues 0087, 0089 and 0030 with new blocks, never an edit to the old ones.

# H7e PR A — startup-migration block repairs (2026-10-29)

## What was wrong (confirmed in code and on Postgres 16)

- **0087 + 0103 un-deleted customer deletions.** 0103's trigger pins
  `deletion_reason` on every update of a redacted row. So a customer deleting a
  transaction older than 90 days (already `content_retention_purge`) got
  `deleted_at` set but kept the retention reason, and 0087, every boot, cleared
  `deleted_at` again. Reproduced in the integration test. The 1095-day purge
  hits the same path but self-heals (its selector is `deleted_at IS NULL`).
- **0089** re-deactivated `us-court-search` every boot, against its header.
- **0030** checks only `integrity_hash`; a partial run (no transaction around a
  block) would skip forever.

## The fix

- New run policy `retired` (`run-policy.ts`, `applied.ts`): like `once`, but
  `force` / `STARTUP_MIGRATIONS_FORCE=1` does not re-run it either. Still runs
  on a database where it never ran. 0087 and 0089 are `retired`.
- **0135** (every_boot) replaces the trigger function: the reason may change
  only when the old reason is a content redaction and the row is deleted after
  the update. Art. 17 `account_closure_erasure` stays pinned (tested). Takes
  over 0103's restore-the-trigger duty; 0103 is now `once`, so it no longer
  writes the old function back each boot.
- **0136** (once) re-deletes the affected rows: redacted, retention reason,
  `transaction_quality.deleted_at` set (only the user-delete route writes that
  column). `deleted_at` = the quality row's time when NULL, reason
  `user_request`. Batches of 1000, measured first, throws if any remain.
  Rows without a quality row cannot be identified and are left alone.
- **0134** (once) ensures all three 0030 columns and the index; 0030 is `once`.
- Ledger M077-M079; known_overlaps added for 0030/0134 (ADD COLUMN only) and
  0087/0136 (resolved by retiring 0087).

Evidence: [receipt](../../../archive/receipts/2026-10-29-test-run-h7-migration-block-repairs.json).

## Owed in production (no DB or Railway log access in this session)

After deploy, the boot log's `0136_redeleteCustomerDeletedRedactedRows` outcome
gives the number of customer deletions that had been undone. Daily run query:

```sql
SELECT count(*) FROM transactions t JOIN transaction_quality q ON q.transaction_id = t.id
 WHERE t.redacted_at IS NOT NULL AND q.deleted_at IS NOT NULL
   AND t.deletion_reason IN ('content_retention_purge','pii_retention_purge');  -- expect 0
SELECT function_name FROM startup_migration_applied
 WHERE function_name LIKE 'runMigration013%';  -- expect 0130 to 0136
```

If 0136 restored any rows, those customers saw deleted transactions reappear
in their history for a while; whether that needs telling them is Petter's call.
