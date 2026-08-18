/**
 * Startup schema validation — catches missing DB columns/tables/indexes
 * before requests are served.
 *
 * Historically this carried a hand-maintained `REQUIRED_COLUMNS` array that
 * authors were supposed to append to whenever a `startup-migrations.ts`
 * block added a column. It rotted the way every curated parallel list in
 * this codebase eventually does (see CLAUDE.md's "derived beats curated"
 * rule, and the four stale Browserless dependency lists it cites): its
 * last entry covered migration 0050, while `startup-migrations.ts` has
 * since shipped 43 more blocks (up to 0093) whose columns, tables, and
 * indexes this check never once verified existed. That gap is exactly the
 * PR-42 outage shape (DEC-20260504-C): a migration silently not running,
 * discovered only when a request 500s.
 *
 * `validateSchema()` now derives what to check straight from
 * `startup-migrations.ts`'s SQL via `migration-artifact-audit.ts`, instead
 * of a hand-maintained registry. A new migration block needs no separate
 * "also register this column here" step — the `ADD COLUMN` / `CREATE
 * TABLE` / `CREATE INDEX` statement it already has to write is the only
 * source of truth, and this check reads it directly.
 *
 * Runs AFTER `runStartupMigrations()` in index.ts, so it sees the
 * post-migration state — a genuine post-deploy verification of the exact
 * kind DEC-20260504-C asks for ("query prod for the expected effect"),
 * just automated at every boot instead of performed by hand after each
 * deploy.
 */

import { getDb } from "../db/index.js";
import { log } from "./log.js";
import { StartupFatalError } from "./startup-fatal.js";
import { auditMigrationArtifacts, artifactLabel, type MigrationArtifact } from "./migration-artifact-audit.js";

/**
 * Validate that every schema artifact `startup-migrations.ts`'s blocks are
 * supposed to have created (columns, tables, indexes) actually exists.
 *
 * On mismatch: logs the missing artifacts grouped by the migration block
 * that owns them, then throws so index.ts's main().catch pages the
 * operator and aborts boot before the API starts listening.
 */
export async function validateSchema(): Promise<void> {
  const db = getDb();
  const { missing } = await auditMigrationArtifacts(db);

  if (missing.length === 0) {
    log.info(
      { label: "startup-schema-ok" },
      "Schema validation passed — all migration-derived artifacts present",
    );
    return;
  }

  const byBlock = new Map<string, MigrationArtifact[]>();
  for (const artifact of missing) {
    if (!byBlock.has(artifact.block)) byBlock.set(artifact.block, []);
    byBlock.get(artifact.block)!.push(artifact);
  }

  log.error(
    {
      label: "startup-schema-mismatch",
      missing_by_block: Object.fromEntries(
        [...byBlock.entries()].map(([block, artifacts]) => [block, artifacts.map(artifactLabel)]),
      ),
      fix: "The block(s) named above ran (or should have) inside runStartupMigrations() but their schema artifact isn't in the DB. Check Railway logs for the block's startup-migration-block log line — if it's missing entirely, the migration never executed; if present, the ALTER/CREATE statement itself failed or targeted the wrong name.",
    },
    "SCHEMA MISMATCH — DB is missing artifacts startup-migrations.ts's blocks are supposed to have created.",
  );

  const missingList = missing.map(artifactLabel).join(", ");
  throw new StartupFatalError(
    `Schema validation failed — DB is missing migration artifacts: ${missingList}`,
    `The database is missing schema (columns/tables/indexes) the deployed code expects (${missingList}). ` +
      `This is a deploy/code problem, not an outage that heals itself — restarting won't fix it. ` +
      `Roll back: Railway dashboard -> Deployments -> previous working deploy -> Redeploy.`,
  );
}
