Intent: H7d (platform-hardening T7), the startup-migration work after H7a to H7c, in three PRs: split the migrations file with the ledger unchanged, skip blocks whose ledger hash is already recorded, then drop the residual SQS schema.

# H7d — startup migrations (2026-10-29)

## PR 1: one file per block, ledger unchanged

- Every `runMigrationNNNN_*` block moved byte for byte from
  `apps/api/src/lib/startup-migrations.ts` to its own file under
  `apps/api/src/startup-migrations/blocks/`. The runner, the advisory lock and
  `BLOCKS` (run order) stay in `lib/startup-migrations.ts`, which re-exports
  every block, so all 98 previous exports and every importer are unchanged.
- `startup-migrations.ledger.json` is byte-identical; `migrations:check` reads
  the runner and every block file and all 73 hashes match.
- Frozen data payloads moved from `lib/` to `apps/api/src/startup-migrations/data/`:
  catalogue-copy-0123, public-descriptions-0124, phase-b1/b3 slug lists,
  llm-capability-costs (+ its test). The two declared `// migration-data:`
  files keep their ledgered path inside the frozen block text; the checker
  reads them through `MIGRATION_DATA_RELOCATIONS` (content unchanged, so the
  hash is unchanged).
- New checker findings: `REGISTERED_BLOCK_NOT_SCANNED` (a block in `BLOCKS`
  the scan never read would run unledgered) and `DUPLICATE_BLOCK_FUNCTION`.
- Boot-path dependency (DEC-20260504-C): schema validation reads migration
  source as text at runtime. `readMigrationSourceFiles` now reads the runner
  plus `dist/startup-migrations/blocks/*.js` and throws if there are none
  (the old reader would have found zero blocks and passed hollow). The
  `startup-schema-ok` log line now carries `artifacts_checked` (87 locally,
  the same 87 artifacts as before the split).
- Found by the split: a `/*` inside a string at old line 5166 made the
  vendor-terms scanner skip 54 KB of the monolith. Block 0082's ip-api.com
  documentation URL (no request) is now seen and exempted with its reason.

Local evidence on Postgres 16 (block outcomes and schema identical to `main`,
integration lane, compiled `dist/` boot probe):
[receipt](../../../archive/receipts/2026-10-29-test-run-h7d-migrations-split.json).
No Docker daemon in this sandbox; CI runs the real image.

Independent review (fresh read-only Claude context): PASS WITH NITS. Fixed in
the PR: an unreadable `BLOCKS` array, an aliased entry, a subfolder or
off-pattern file in `blocks/`, and a relocated data file its block does not
import are each now a checker finding. Left as is: `scripts/vendors-lib.mjs`
reads only block 0111 for the `vendor_accounts` seed (the only seeding block).

## Follow-ups found on the way (pre-existing, not fixed here)

- Block 0087 may be un-deleting rows: block 0103's trigger keeps the old
  `deletion_reason` on an already-redacted row, so a later hard purge or user
  delete leaves `content_retention_purge` with `deleted_at` set, which 0087
  clears on the next boot. Needs a production read and a new block.
- Block 0089 re-deactivates `us-court-search` every boot if an operator
  reactivates it, contrary to its header comment.
- Block 0030's skip check looks only at `integrity_hash`; a partial run would
  skip forever.

## PR 1 in production

PR 805 merged as `7ee63047`; `/health` served `7ee630471e5c` at 01:39 Swedish
time on 2026-10-29, `/health/deep` ok, a free `/v1/do` call completed. The
Railway boot log was not read (no Railway access in that session).

## PR 2: applied-block-hash skip

- Block 0131 creates `startup_migration_applied` (function_name, ledger_id,
  sha256, first/last_applied_at). It is separate from the older
  `startup_migration_ledger`, which blocks use for their own one-shot guards.
- `apps/api/src/startup-migrations/applied.ts` decides per block; the runner
  records every ledgered block after it runs. Before 0131 has created the
  table nothing is skipped, so the first boot after deploy runs all 74 blocks
  as today and records them (the 73 earlier ones are recorded right after
  0131 runs).
- `run-policy.ts` classifies every block: 28 `once`, 45 `every_boot`, plus
  0131 `once`. The classification was done by three read-only agents against
  a fixed rubric (every normal return means done; no live inputs; not a
  reconciler; re-run is a no-op; unsure means every_boot); 0103 and 0106 were
  moved to every_boot because they re-create redaction and immutability
  triggers. After review, every block that creates something schema
  validation cannot see (a unique index, CHECK, view or trigger: 0067, 0070,
  0079, 0080, 0085, 0096, 0102, 0110, 0126) is every_boot too, so a dropped
  money-path unique index is still restored on the next boot. A test requires
  a policy for every registered block.
- A recorded hash that differs from the ledger hash is a `StartupFatalError`
  (boot fails), never a skip. The admin apply-migrations endpoint passes
  `force: true` and runs every block.
- Not what the brief literally asked: a second boot does not run nothing; the
  45 every-boot blocks still run, because skipping them would change what
  production does.
- Evidence: [round 1](../../../archive/receipts/2026-10-29-test-run-h7d-applied-block-skip.json), [after review](../../../archive/receipts/2026-10-29-test-run-h7d-applied-block-skip-review.json).
- Recovery if a skipped block's column or table is dropped by hand: schema
  validation fails boot, and its alert now says to set
  `STARTUP_MIGRATIONS_FORCE=1` in Railway, redeploy, then remove it (the
  admin endpoint needs a running API). Tested on real Postgres.
- A failure to record a block is logged, not fatal; that block runs again on
  the next boot.

## PR 2 in production

PR 807 merged as `ee447a08`; `/health` served `ee447a08d3c3` at 02:22 Swedish
time, `/health/deep` ok, `/v1/do` free call completed. Schema validation
passing proves `startup_migration_applied` exists; its row count (74) and the
next deploy's `skipped_count: 29` were not read (no DB or Railway log access).

## PR 3: residual SQS schema

- Proof nothing reads them: no code path references the drizzle fields or the
  table (the hits are comments, the field-authority and receipt-snapshot
  inventories, a dead stub, and archived scripts), and the public catalogue,
  solutions, x402 catalogue, discovery and trust responses carry none of the
  field names (the three `trend` hits are capability output schemas). The
  sibling frontend repo is outside this session's access.
- Hazard found and handled: code deployed before PR 3 selects whole capability
  rows (`matching.ts`, `capability-onboarding.ts`, `manifest-text-sync.ts`
  and others), so drizzle names these columns, and that instance serves while
  the next one boots. Dropping in the same deploy would fail its catalogue and
  `/v1/do` queries for the overlap. So the build records after listen
  (`0132_sqs_fields_removed_and_serving` in `startup_migration_ledger`) and
  block 0132 drops only once that marker is ten minutes old: the drop lands on
  the first boot after that, normally the next deploy.
- Measured into the boot log before dropping: column count, capabilities row
  count, snapshot rows and bytes. Production numbers were not readable from
  this session; they appear in the 0132 outcome line of that boot.
- After the drop, rolling back to a deploy from before PR 3 would 500 on
  capability reads. Roll forward instead.
- `capability_health` to `source_health`: not done, 22 files reference it, not
  trivial.

## PR 3 evidence

Local Postgres 16, compiled `dist/` boots on a database that still has the SQS
columns and a 500-row `sqs_daily_snapshot`: boot 1 deferred and wrote the
marker after listen, boot 2 deferred, boot 3 (marker backdated 11 minutes)
dropped 8 columns from 356 capabilities rows and the table (500 rows,
98304 bytes) with schema validation green, boot 4 skipped. Receipt below.
Receipt: [h7d-drop-sqs-residual-schema](../../../archive/receipts/2026-10-29-test-run-h7d-drop-sqs-residual-schema.json).
