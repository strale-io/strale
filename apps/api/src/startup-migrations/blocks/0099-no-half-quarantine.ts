import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0099 — half-quarantine is invalid, enforced by the database (WP8).
 *
 * `is_active AND NOT visible AND x402_enabled` means "withdrawn from the
 * catalogue, still purchasable on the paid rail". No code path produces it: the
 * quality floor writes both flags together to withdraw, and the promotion job
 * writes both together to restore.
 *
 * Production held it anyway. `danish-company-data` was quarantined 2026-08-12
 * with the intended state recorded in its manifest, and an out-of-band write on
 * 2026-08-21 set `x402_enabled` back to true while leaving it invisible. It was
 * then listed and purchasable while failing 100% of real customer calls — 14 of
 * 14 over 90 days. Nothing detected it; the manifest note is the only reason it
 * was diagnosable at all.
 *
 * A scheduled checker (jobs/invariant-checker.ts) catches the NEXT one, but only
 * after up to two hours during which the capability is on sale. The database can
 * refuse it outright, which is the difference between detecting and preventing.
 *
 * Shape, per block 0095: ADD CONSTRAINT ... NOT VALID first, so no full-table
 * ACCESS EXCLUSIVE scan blocks writes on a hot table, then VALIDATE separately.
 * Failure is logged and retried next boot rather than thrown — a throw aborts
 * boot, and a failed Railway deploy does not cut over.
 *
 * Verified read-only against production before writing: 0 violating rows across
 * 340 capabilities. `solutions` has no `visible` column, so the rule is
 * capability-only by construction.
 */
export async function runMigration0099_noHalfQuarantine(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  let outcome: string;

  try {
    await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
    await tx.execute(sql`
      DO $$
      BEGIN
        ALTER TABLE "capabilities"
          ADD CONSTRAINT "capabilities_no_half_quarantine"
          CHECK (NOT ("is_active" AND NOT "visible" AND "x402_enabled")) NOT VALID;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await tx.execute(sql`
      ALTER TABLE "capabilities" VALIDATE CONSTRAINT "capabilities_no_half_quarantine"
    `);
    outcome = "constraint present and validated";
  } catch (err) {
    // Deferring is safe: until the constraint exists the scheduled invariant
    // check still reports the state, so the platform is not blind in the gap.
    outcome =
      "deferred to next boot: " +
      (err instanceof Error ? err.message.slice(0, 140) : String(err).slice(0, 140));
  }

  return {
    block: "0099_no_half_quarantine",
    outcome: `capabilities_no_half_quarantine — ${outcome}`,
    duration_ms: Date.now() - startedAt,
  };
}
