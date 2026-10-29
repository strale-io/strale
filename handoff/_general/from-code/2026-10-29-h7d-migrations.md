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

## PR 2 and PR 3

Not started at the time of this note; see T7 `next_action`.
