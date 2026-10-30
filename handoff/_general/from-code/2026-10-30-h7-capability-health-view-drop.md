Intent: close platform-hardening T7 (H7) — drop the capability_health compatibility view (the contract half of block 0134's rename) and record the production verification H7 still owed.

# H7 close — block 0141 drops the capability_health view (2026-10-30)

## What shipped

**Block 0141 (`runMigration0141_dropCapabilityHealthCompatView`, policy `once`).**
Block 0134 renamed `capability_health` to `source_health` and left a view under
the old name in the same statement, so a build deployed before the rename kept
working while the new one booted. 0141 removes the view.

It refuses unless the old name is relkind `v`, so it can never drop the table,
refuses when `source_health` is absent (then the view is the only breaker
surface), and uses a bare `DROP VIEW` — never `CASCADE` — so a dependent object
fails the boot loudly instead of being dropped with it.

`schema.ts` keeps the `capabilityHealthCompat` declaration on purpose: on a
fresh database `drizzle-kit push` creates the view, block 0118 updates through
it by name, and 0141 — which runs after 0118 — drops it again, so a fresh
database ends in production's shape. The comment there now says so and says not
to add a reader.

Ledger M084. `npm run migrations:check` passes over 84 blocks.

**Rollback hazard, stated plainly.** After this block runs, a build between
0132 and 0134 can no longer reach the circuit-breaker table, so its breaker
reads fail. Rolling back that far needs the view recreated by hand:
`CREATE VIEW capability_health AS SELECT * FROM source_health`. A build older
than 0132 is already incompatible for a second reason, raised in review: block
0132 dropped the SQS residual columns and `sqs_daily_snapshot`, which the view
does not bring back. So the view is the fix for a narrow rollback window, not
for any older build.

## Why it was safe to drop now

Postgres keeps no read counters for views, so the signal is the deploy record,
as the rename handoff said it would be. Checked read-only in production on
2026-10-30, commit `928513ffc4c5`: 0134 first applied `2026-10-29T16:22:53Z`
and production has served the renamed build since; `pg_stat_statements` is not
installed, so there was nothing further to read; and the only remaining writer
by the old name is block 0118, which returns before its UPDATE on any database
where it has already run (production: first and last applied
`2026-10-29T01:21:42Z`).

## Evidence

Tests: [receipt](../../../archive/receipts/2026-10-30-test-run-h7-capability-health-view-drop.json)
— six new integration cases on real Postgres 16, plus the migration registry
and schema suites. Production: [receipt](../../../archive/receipts/2026-10-30-check-h7-production-verification.json).

## The production checks H7 still owed — all answered

| check | result |
|---|---|
| block 0132: SQS residual columns on `capabilities` | none |
| block 0132: `sqs_daily_snapshot` | absent |
| any public column named `guidance*` or `*sqs*` | none |
| block 0134: `capability_health` / `source_health` relkind | `v` / `r` |
| `source_health` constraints | `source_health_pkey`, `source_health_capability_slug_unique` |
| `source_health` rows and size | 318 rows, 155,648 bytes |
| breaker states | 317 closed, 1 open |
| block 0137: the three compliance columns and the index | all present |
| block 0139: target rows remaining | **0** |
| block 0139: customer deletions it restored | **17** |
| once/retired blocks re-run by either 2026-10-30 boot | **none** |

Every row above is a query result, not a log reading. The last row in
particular compares `startup_migration_applied.last_applied_at` across blocks:
0030, 0087, 0089 and 0103 still read `2026-10-29T17:22Z` while the `every_boot`
blocks moved to `2026-10-30T10:47Z`. Absence of a log line would prove nothing
here — Railway drops messages above 500 per second per replica.

Two method notes. Block 0139's own `rows_affected` is no longer readable —
Railway keeps logs per deployment and that boot was `2026-10-29T17:51:25Z` — so
the 17 is measured at the effect level instead, which DEC-20260504-C prefers
anyway: 0139 sets `deleted_at` to the quality row's time, which the live delete
route does not, and all 17 `user_request` rows with a quality `deleted_at` have
the two timestamps equal. And `us-court-search` is still off after 0089 was
retired, which is the DQ-4 decision 0089 executed; retiring it stops it
re-deactivating a row an operator switches back on, it does not switch the row
on.

## T7 is done

`tracks.yaml` records T7 `done` with the four evidence paths, and T3 (H3)
becomes the active track — its remaining work is a production check that deploy
text and drift agree and that guaranteed-field measurements are recorded.

## Open, for whoever picks this up

- The rollback hazard above, which is now a property of production.
- Review raised two things left as they are. The `oldKind !== "v"` guard is
  partly redundant with Postgres, which refuses `DROP VIEW` on a table anyway;
  it stays because it gives the operator a sentence instead of a driver error,
  and it is now tested at the relation level rather than only on its message.
  And a future block or CI step that names `capability_health` would pass on a
  fresh database and fail in production, which is why the `schema.ts` comment
  says not to add a reader.
