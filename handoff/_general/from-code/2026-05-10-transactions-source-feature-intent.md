# Future feature: transactions.source column

## Decision
Customer / test / retry separation on the transactions table. Decided
2026-05-10 (chat session). Forward-only — NEW transactions get tagged with
their source going forward; OLD transactions remain NULL (back-compat). No
retroactive backfill.

## Status
**Captured for future pickup.** Not yet shipped. Original prototype lived
in `.claude/worktrees/practical-maxwell` worktree, deleted as part of
orphan cleanup PR #81 on 2026-05-10. This document is the surviving
record.

## Why
Today, the transactions table contains undifferentiated records: real
customer payments, test calls, retries — all indistinguishable. Analytics
queries like "how many customer transactions this month" require mental
subtraction of test data every time. The source column makes the
distinction first-class.

Rough analytics gain (per chat memory): ~500 paid x402 calls in the 5
days preceding 2026-05-03 across multiple paying users. Tracking that
metric cleanly requires the column.

## Schema design

Addition to `apps/api/src/db/schema.ts` (transactions table), inserted
after the `isFreeTier` column and before the compliance-infrastructure
block:

```typescript
    // Source of the transaction — separates real customer traffic from internal test runs.
    // 'customer' = authenticated or free-tier external call via /v1/do
    // 'test' = scheduled test run (test-runner.ts, system@strale.internal)
    // 'retry' = customer retry attempt
    // NULL on rows created before this column existed — treat NULL as 'customer' for back-compat.
    source: varchar("source", { length: 16 }),
```

## Migration SQL

Original migration from practical-maxwell (numbered 0045 there; that slot
is now taken in trunk by `0045_baseline_invalidation_trigger.sql`).
Renumber to migration `0100_transaction_source.sql` when shipping (trunk's
highest existing migration is `0099_suggest_log.sql` as of 2026-05-10).

```sql
-- Add source column to transactions to separate customer traffic from test runs.
-- Backfills existing rows: any row written by the system test user = 'test';
-- all others = 'customer'. New rows default to NULL; writers explicitly set it.

ALTER TABLE "transactions" ADD COLUMN "source" varchar(16);

-- Backfill: mark all historical test-runner rows with source='test'
UPDATE "transactions" t
SET "source" = 'test'
FROM "users" u
WHERE t.user_id = u.id AND u.email = 'system@strale.internal';

-- Backfill: mark remaining rows as 'customer' (includes free-tier anonymous)
UPDATE "transactions"
SET "source" = 'customer'
WHERE "source" IS NULL;

-- Index for the common filter used in dashboards/digest
CREATE INDEX IF NOT EXISTS "transactions_source_created_at_idx"
  ON "transactions" ("source", "created_at" DESC);
```

**Reconciliation note:** the original prototype migration above retroactively
backfills historical rows. The chat decision (2026-05-10) was forward-only —
no backfill, OLD rows stay NULL. When picking up, drop the two `UPDATE`
statements; keep the `ALTER TABLE` and `CREATE INDEX`. The picker-up may
revisit this if backfill turns out to be cheap and worth it after running
the row-count audit on the live transactions table.

## When picking up — additional scope

The practical-maxwell prototype shipped schema-only. To make the column
useful, the writer code that INSERTs into transactions needs updating to
populate `source` per insertion site:

- Customer payment flow → `source: 'customer'`
- Test endpoints / sandbox → `source: 'test'`
- Retry logic → `source: 'retry'`
- Anything ambiguous → `source: 'customer'` as default (or NULL)

The pickup prompt's audit phase should run `git grep` for transaction
INSERT sites (Drizzle `.insert(transactions)`, raw SQL inserts, anything
that creates a transaction row) and enumerate the writer updates needed.
If the writer-update scope exceeds 5 sites, consider splitting into
schema-PR + writer-update-PR.

## Notes

- Drizzle-kit migrate handles application via `npx drizzle-kit migrate`;
  the practical-maxwell `run-migration-0045.ts` runner script was a
  workaround for that worktree's specific drizzle journal state and
  isn't needed on trunk.
- Index design: `transactions_source_created_at_idx` on `(source,
  created_at)` is useful for analytics queries like "all customer
  transactions in the last month." Worth keeping.
- The migration is forward-additive on a nullable column — no data
  migration risk, no downtime.

## Reference
- Chat session 2026-05-10 (this decision)
- DEC-20260428-B (do-not-fabricate doctrine — context for why intent
  capture matters: "make state observable, not assumed").
- Original worktree: `.claude/worktrees/practical-maxwell` (removed in
  PR #81).
