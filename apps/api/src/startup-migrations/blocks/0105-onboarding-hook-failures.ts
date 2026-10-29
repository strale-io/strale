import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * WP10 (CR-08) — durable attempt budget for the onboarding retry sweeper.
 *
 * The sweeper's first implementation counted its own attempts by querying
 * `health_monitor_events`. That table is pruned at 30 days
 * (jobs/db-retention.ts), which would have reset every capability's retry
 * budget monthly and, worse, aged out the escalation marker — so a capability
 * an operator had already been asked to look at would silently rejoin the
 * retry set forever, in 30-day cycles, re-escalating each time.
 *
 * The counter therefore lives on the capability row, mirroring
 * `test_suites.fixture_recapture_failures` (block 0093), which exists for the
 * same reason and is not pruned.
 */
export async function runMigration0105_onboardingHookFailures(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    ALTER TABLE capabilities
      ADD COLUMN IF NOT EXISTS onboarding_hook_failures integer NOT NULL DEFAULT 0
  `);

  return {
    block: "0105_onboarding_hook_failures",
    outcome: "column ensured (capabilities.onboarding_hook_failures)",
    duration_ms: Date.now() - startedAt,
  };
}
