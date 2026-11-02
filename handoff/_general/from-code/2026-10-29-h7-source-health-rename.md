Intent: H7 (platform-hardening T7), rename the circuit-breaker table capability_health to source_health with no window where running code and schema disagree.

# H7 — capability_health → source_health (2026-10-29)

## What changed (expand step)

- Block 0134 (`runMigration0134_renameCapabilityHealthToSourceHealth`, policy
  `every_boot`) renames the table, renames its `capability_health_*` constraints and
  indexes to `source_health_*` (the names drizzle derives, so production
  matches a fresh database), and creates `capability_health` as a view
  `SELECT * FROM source_health`. All of that is one `DO` statement, so it is
  one transaction although the runner opens none: the old name never resolves
  to nothing.
- The view is automatically updatable. A build deployed before 0134 keeps
  serving through it while the new one boots, and a rollback to such a build
  keeps working while the view exists. Verified on Postgres 16: inserts with
  base-table defaults, `ON CONFLICT (capability_slug)`, updates and
  `SELECT ... FOR UPDATE` through the view
  (`apps/api/src/lib/source-health-rename.integration.test.ts`).
- Code: drizzle export `capabilityHealth` → `sourceHealth`, raw SQL and
  operator-facing strings switched to `source_health`. No behaviour change.
  Left as they are on purpose: block 0118 (merged blocks are immutable), the
  authority label `capability_health_breaker` (an action-class id in
  `production-authority.ts`, not a table name), and historical strings quoted
  from stored rows in tests.
- `schema.ts` also declares the view (`capabilityHealthCompat`, a drizzle
  `pgView`). Fresh databases (CI's integration-db, local) are built with
  `drizzle-kit push` and then run every block in order, and block 0118 still
  runs `UPDATE capability_health` there. Without the view that block fails on
  a fresh database. Keep the declaration after the contract step too: 0118
  runs before the drop on a fresh database. In that PR, reword the schema.ts
  comment: the view then exists only so fresh databases can run 0118.

## Workload (DEC-20260504-B)

Not measured in production: this session has no DB access. A rename is a
catalogue update whose cost does not depend on size, and the unique
constraint bounds the table to one row per capability slug (the catalogue has
about 340). Block 0134 measures rows and bytes before renaming and reports
them in its boot-log outcome. It needs a brief ACCESS EXCLUSIVE lock; the
runner's 2 s lock_timeout and retries bound the wait.

## Post-deploy verification (DEC-20260504-C), for the daily run

1. Boot log: `startup-migration-block 0134_renameCapabilityHealthToSourceHealth`
   with outcome `renamed capability_health to source_health (N rows, B bytes)
   and left a capability_health view`; later boots skip it.
2. Query production:
   - `SELECT relname, relkind FROM pg_class WHERE relname IN ('capability_health', 'source_health');`
     expect `source_health r` and `capability_health v`.
   - `SELECT conname FROM pg_constraint WHERE conrelid = 'source_health'::regclass;`
     expect `source_health_pkey` and `source_health_capability_slug_unique`.
   - `SELECT count(*), pg_total_relation_size('source_health') FROM source_health;`
     matches the boot-log numbers.
   - `SELECT state, count(*) FROM source_health GROUP BY state;` circuit
     breakers still record (compare with the open-breaker count on the
     metrics surface before the deploy).

## Contract step (next)

Drop the view in a new block once production shows no reads of the old name.
Postgres keeps no read counters for views, so the usable signal is the deploy
record: the Railway deployment from before 0134 is gone and only the renamed
build is live. Only if `pg_stat_statements` happens to be installed, also
check `SELECT calls, query FROM pg_stat_statements WHERE query ILIKE
'%capability_health%' AND query NOT ILIKE '%pg_stat_statements%'`; do not wait
for it otherwise. Block 0118 returns before its UPDATE in production (recorded
as applied), so it is not a reader.

The drop block is `DROP VIEW IF EXISTS capability_health` and must check the
relkind is `v` first, so it can never drop a table. After it lands, a rollback
to a build older than 0134 breaks the breaker; say so in that PR.
