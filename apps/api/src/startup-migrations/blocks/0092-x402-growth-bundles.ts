import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0092 — put the four growth bundles on the rail that money arrives on.
 *
 * DQ-9 (2026-08-16) settled that the growth bundles get built and sold: they
 * are composed entirely from capabilities we already run, and they are the
 * highest-return work available against M1. Four were created the same day —
 * `competitor-read`, `page-seo-check`, `prospect-brief`, `keyword-scout` — and
 * shipped `is_active = true`, which put them on the public `/v1/solutions`
 * catalogue, and `x402_enabled = false`, which kept them off `/x402/solutions`.
 *
 * Every euro of external revenue arrives over x402. A bundle that is listed but
 * not on the rail cannot earn anything, and returns HTTP 404 to an agent that
 * found it in the catalogue and tried to pay. Verified three ways on 2026-08-18:
 * `x402_enabled = false` in the DB, absent from `GET /x402/catalog`, and 404 on
 * a live probe. `lead-email-verify` is the control — same construction, same
 * price band, `x402_enabled = true`, and 47 external sales in 30 days.
 *
 * This is the same shape of gap as DQ-11: a decision recorded as done, executed
 * on one surface out of two.
 *
 * Safe to enable: the solution gate in `routes/x402-gateway-v2.ts` `ensureCache()`
 * is `x402_enabled AND is_active`, and all fourteen component capabilities across
 * the four bundles pass the stricter capability gate (`is_active`,
 * `marketplace_eligible`, `lifecycle_state IN ('active','probation')`) with
 * healthy recent harness runs and live external traffic.
 *
 * **Why this block retires itself.** Every other block here is idempotent by
 * WHERE clause, which is right for repairs but wrong for a reversible business
 * flag: `WHERE x402_enabled = false` would re-enable a bundle on the next boot
 * after an operator had deliberately switched it off. That is exactly the
 * `scheduled_testing_eligible` footgun CLAUDE.md warns about, where a
 * boot-time rewrite silently reverts hand edits. So the block records itself in
 * `startup_migration_ledger` and reads that ledger before acting: it flips the
 * flag once, ever, and every later boot is a genuine no-op that leaves operator
 * intent alone.
 *
 * Reversal is one flag per bundle (`x402_enabled = false`) and it now stays
 * reversed. Nothing else about the bundles changes — price, composition and
 * catalogue listing are untouched.
 */
export const X402_GROWTH_BUNDLE_SLUGS = [
  "competitor-read",
  "page-seo-check",
  "prospect-brief",
  "keyword-scout",
] as const;

export async function runMigration0092_x402GrowthBundles(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const BLOCK = "0092_x402GrowthBundles";

  // The ledger is created here rather than in a schema block so this migration
  // is self-contained: nothing else depends on the table yet.
  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS startup_migration_ledger (
      block text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      rows_affected integer NOT NULL DEFAULT 0
    )`);

  const prior = (await tx.execute(sql`
    SELECT block FROM startup_migration_ledger WHERE block = ${BLOCK}
  `)) as unknown as Array<{ block: string }>;

  if (prior.length > 0) {
    return {
      block: BLOCK,
      outcome: "no change (already applied once — operator intent is not overwritten)",
      rows_affected: 0,
      duration_ms: Date.now() - startedAt,
    };
  }

  // NOT `slug = ANY(${array})`. drizzle's sql tag does not serialize a JS array
  // as a single Postgres array bind — it expands to the row-value tuple
  // `ANY(($1, $2, $3, $4))`, which Postgres rejects with "op ANY/ALL (array)
  // requires array on right side". See lib/internal-accounts.ts, which documents
  // this as the root cause of a prior production outage (commit 4bf58d0) that
  // has resurfaced three times since. In a startup migration the blast radius is
  // worse than a failed query: runStartupMigrations() throws on first failure and
  // index.ts exits, so the shape below is the difference between a deploy and a
  // crash loop. Built as a parameterized IN-list via sql.join instead.
  const slugList = sql.join(
    X402_GROWTH_BUNDLE_SLUGS.map((slug) => sql`${slug}`),
    sql`, `,
  );
  const res = await tx.execute(sql`
    UPDATE solutions
    SET x402_enabled = true,
        updated_at = now()
    WHERE slug IN (${slugList})
      AND is_active = true
      AND x402_enabled = false
  `);
  const affected = (res as { count?: number }).count ?? 0;

  // Written after the UPDATE, never before: if the UPDATE throws, boot aborts
  // with nothing recorded and the next boot retries. If the ledger write throws
  // after a successful UPDATE, the retry's UPDATE matches nothing
  // (`x402_enabled = false` is already false) and only the ledger row lands.
  await tx.execute(sql`
    INSERT INTO startup_migration_ledger (block, rows_affected)
    VALUES (${BLOCK}, ${affected})
    ON CONFLICT (block) DO NOTHING
  `);

  return {
    block: BLOCK,
    outcome:
      affected === 0
        ? "no change (growth bundles already on the x402 rail)"
        : `${affected} growth bundle(s) put on the x402 rail — listed publicly but unpayable since 2026-08-16`,
    rows_affected: affected,
    duration_ms: Date.now() - startedAt,
  };
}
