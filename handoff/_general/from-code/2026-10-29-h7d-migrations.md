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

Local evidence: fresh Postgres 16, drizzle push + all blocks — 73 block
outcomes identical to `main` apart from block 0109's own timestamp, and
`pg_dump --schema-only` identical; integration lane 37 files / 359 tests pass;
compiled `dist/` boot against a fresh DB passes `scripts/ci/boot-probe.mjs`
(327 executors). No Docker daemon in this sandbox; CI runs the real image.

## PR 2 and PR 3

Not started at the time of this note; see T7 `next_action`.
