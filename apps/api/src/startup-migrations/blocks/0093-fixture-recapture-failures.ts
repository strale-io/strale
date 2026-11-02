import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0093: fixture_recapture_failures on test_suites ─────────────────
//
// Browserless harness-burn mitigation (branch ops/cut-browserless-harness-burn,
// 2026-08-18), HIGH-2b of the Codex closing-pass review. Adds the counter
// column `recordFixtureRecaptureFailure` (test-runner.ts) increments on a
// failed fixture-recapture attempt and `captureBaseline` resets to 0 on
// success — bounds a permanently-failing fixture suite to
// MAX_FIXTURE_RECAPTURE_FAILURES live retries before it quarantines, instead
// of retrying forever.
//
// `fixture_last_refreshed` (used by the sibling HIGH-1 max-age staleness
// fix) already exists in prod as of this migration — added by an earlier,
// untracked manual apply — so this block does not touch it; ADD COLUMN IF
// NOT EXISTS on it would be a harmless no-op if ever re-added here, but
// there is no need.
//
// MEDIUM (Codex closing-pass round 2, 2026-08-18): the original shape here
// was check-then-ALTER — SELECT information_schema.columns, branch, and only
// if absent run a bare `ADD COLUMN` (no `IF NOT EXISTS`). That's a TOCTOU
// race: two overlapping boots (a Railway deploy that briefly runs old and
// new instances together) can both read "column absent" from the SELECT,
// then both attempt the bare ALTER — the second one fails with Postgres's
// "column already exists" error, and `runStartupMigrations()` aborts boot on
// any block throwing (by design — see this file's header). The instance that
// loses the race never starts. `ADD COLUMN IF NOT EXISTS` is the pattern
// every other column-adding block since 0060 uses (0067, 0078, 0083, 0086,
// 0088) specifically because it's a single atomic DDL statement Postgres
// itself no-ops safely — no read-then-write gap for a second boot to land
// in. Adopting it here for the same reason; the check-then-ALTER shape
// (0029, 0030) predates that convention and was the wrong template to copy.

export async function runMigration0093_fixtureRecaptureFailures(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    ALTER TABLE "test_suites"
      ADD COLUMN IF NOT EXISTS "fixture_recapture_failures" integer DEFAULT 0 NOT NULL
  `);

  return {
    block: "0093_fixture_recapture_failures",
    outcome: "column ensured (fixture_recapture_failures)",
    duration_ms: Date.now() - startedAt,
  };
}
