import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0112: list the eight free-public-API capabilities ───────────────
//
// PR #518 shipped eight capabilities built from the largest x402 buyer's
// observed basket — scholarly search, developer data and public-record
// lookups it buys from other x402 sellers. A follow-up session created the
// rows on 2026-09-04 and left them dark (`lifecycle_state = 'validating'`,
// `visible = false`, `x402_enabled = false`) to age into the automatic
// "green week" promotion. They cannot get there, for two independent reasons
// measured against production on 2026-09-05:
//
//  1. Six carry a generated `dependency_health` rule asserting a `status`
//     field their output does not contain — the "non-null on an optional
//     field" trap CLAUDE.md warns about. Four of five suites pass, so each
//     sits at a permanent 80% against `capability-promotion`'s 95% bar.
//     `cve-details` genuinely returns `status` (NVD's "Analyzed"), so its
//     identical check is correct and is left alone; `usgs-earthquake-search`
//     was auto-remediated to an empty check list after its second failure,
//     which is the shape this block writes for the other six.
//  2. The seven `cost_class = 'free_quota'` capabilities take a 24h per-suite
//     floor (72h for tier C), so they accrue ~4.3 results/day and would need
//     ~10 days to reach `minTests = 40` — not the week the dark-launch path
//     assumes. Two failures at 40 results is exactly 95.0%, on the boundary,
//     so a single transient upstream blip restarts the wait.
//
// Why now rather than after the wait: the platform's one paying x402 customer
// refunded its wallet with $230 on 2026-09-05 at 01:57Z after running dry on
// 09-03, and resumed calling three minutes later. At its historical burn that
// is ~15 days of runway. Automatic promotion would land around 09-14, at the
// end of that window. These eight were built for this buyer's basket.
//
// Evidence for overriding the gate, not ignoring it. All eight executors were
// run against their live upstreams on 2026-09-05 08:35Z: every one returned
// correct data in 273ms-2.0s with provenance intact (OpenAlex, arXiv, NCBI,
// Algolia HN, SEC EDGAR, NIST NVD, USGS). `known_answer` — the suite the
// promotion gate weights above all others — is green on all eight. Every
// upstream is free, keyless and official, so there is no cost exposure and no
// credential that can silently lapse. The quality floor stays armed and reads
// real customer traffic, which is the instrument that actually matters here.
//
// Why `lifecycle_state` moves too: `/x402/*` requires
// `lifecycle_state IN ('active','probation')` and `/v1/capabilities` requires
// `('active','degraded')`. Flipping `visible` and `x402_enabled` while leaving
// `'validating'` would list nothing and sell nothing — a silent no-op that
// reads as success. All eight already carry `is_active`,
// `marketplace_eligible` and `x402_method = 'POST'`, verified in production,
// so these three columns are the whole change.
//
// The test_suites update cannot disturb fixture baselines: all five suites on
// these capabilities are `test_mode = 'live'` with no baseline, so the
// `updated_at` bump that block 0094 exists to repair has nothing to
// invalidate.
//
// Ledger-guarded like 0100: a one-time correction of one decision, not a
// standing policy. If the floor later quarantines any of these on real
// traffic, that quarantine stands and this block will not undo it.
//
// Authority: DEC-20260815-A (quarantine and promotion are platform-acts-alone).

export async function runMigration0112_promoteFreeApiEight(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const BLOCK = "0112_promoteFreeApiEight";

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
      outcome: "no change (already applied once — a later quarantine is not undone)",
      rows_affected: 0,
      duration_ms: Date.now() - startedAt,
    };
  }

  // Step 1 — drop the fabricated `status` assertion from the six whose output
  // has no such field. Exact-match on the whole rules object: if anything has
  // since edited these rules, this matches nothing rather than clobbering it.
  // cve-details is deliberately absent (its `status` is real).
  const fixed = await tx.execute(sql`
    UPDATE test_suites
       SET validation_rules = '{"checks":[]}'::jsonb,
           updated_at = now()
     WHERE test_type = 'dependency_health'
       AND capability_slug IN (
         'academic-paper-search', 'arxiv-search', 'hacker-news-search',
         'paper-details', 'pubmed-search', 'sec-edgar-filings'
       )
       AND validation_rules = '{"checks":[{"field":"status","operator":"not_null"}]}'::jsonb
  `);
  const fixedCount = (fixed as { count?: number }).count ?? 0;

  // Step 2 — list all eight. Narrow by construction: only the exact dark shape
  // matches, so a capability already listed (or since withdrawn) is untouched.
  const promoted = (await tx.execute(sql`
    UPDATE capabilities
       SET lifecycle_state = 'active',
           visible = true,
           x402_enabled = true,
           updated_at = now()
     WHERE slug IN (
       'academic-paper-search', 'arxiv-search', 'cve-details', 'hacker-news-search',
       'paper-details', 'pubmed-search', 'sec-edgar-filings', 'usgs-earthquake-search'
     )
       AND is_active = true
       AND visible = false
       AND lifecycle_state = 'validating'
       AND deactivation_reason IS NULL
     RETURNING slug
  `)) as unknown as Array<{ slug: string }>;
  const promotedSlugs = promoted.map((r) => r.slug);

  // One event per slug, written only for capabilities whose flags actually
  // moved. The floor's window clamp and the promotion job's "was this a
  // takedown?" test both read the most recent enforce-mode listing event; a
  // listing change without its evidence must be impossible in either
  // direction.
  for (const slug of promotedSlugs) {
    await tx.execute(sql`
      INSERT INTO health_monitor_events (event_type, capability_slug, tier, action_taken, details, human_override)
      VALUES (
        'capability_promotion',
        ${slug},
        1,
        'promoted_with_x402',
        ${JSON.stringify({
          mode: "enforce",
          dec: "DEC-20260815-A",
          reason:
            "Listed by operator decision ahead of the automatic green week. All eight executors verified against their live upstreams 2026-09-05T08:35Z (correct data, 273ms-2.0s, provenance intact); known_answer green on all eight; every upstream free, keyless and official. Automatic promotion was unreachable: six carried a dependency_health assertion on a status field their output lacks (permanent 80% against a 95% bar), and the free_quota 24h suite floor put minTests=40 about ten days out.",
          source: "startup-migration 0112",
          batch: "PR #518 free-public-API capabilities",
        })}::jsonb,
        true
      )
    `);
  }

  await tx.execute(sql`
    INSERT INTO startup_migration_ledger (block, rows_affected)
    VALUES (${BLOCK}, ${promotedSlugs.length + fixedCount})
    ON CONFLICT (block) DO NOTHING
  `);

  return {
    block: BLOCK,
    outcome:
      promotedSlugs.length === 0
        ? `no capability listed (already listed or withdrawn); ${fixedCount} dependency_health rule(s) corrected`
        : `listed ${promotedSlugs.length}: ${promotedSlugs.join(", ")}; ${fixedCount} dependency_health rule(s) corrected`,
    rows_affected: promotedSlugs.length + fixedCount,
    duration_ms: Date.now() - startedAt,
  };
}
