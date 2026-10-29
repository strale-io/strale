import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0100: re-list url-to-markdown — the takedown was wrong ──────────
//
// The quality floor quarantined `url-to-markdown` at 2026-08-22 05:58Z:
// "completion 67% on 15 eligible calls/30d". Reproducing the floor's own
// population against production gave exactly its numbers (15 eligible, 10
// completed, 4 distinct failure days), so the arithmetic was right and the
// evidence behind it was not. The five counted failures:
//
//   1 x "This page returned almost no readable text (0 words). It may require
//       JavaScript to render its content, or the URL may point to a login
//       page."                        — the capability answering correctly
//   2 x "…could not be loaded (HTTP 400)"  — the caller's target site
//   2 x "This site is rate-limiting requests (HTTP 429)" — the caller's target
//
// None is a defect in this capability. Verified three independent ways on the
// morning of the re-listing: the executor's live smoke test passes end to end,
// the harness is 531/531 over 7d (weak evidence on its own — see GOALS.md),
// and the two most recent real external calls, 2026-08-07 and 2026-08-21,
// both completed.
//
// What made it worth fixing at boot rather than waiting: `url-to-markdown` is
// one of the 11 no-signup free-tier capabilities. Quarantine sets
// visible = false, `matchCapability` refuses an invisible capability (WP8 —
// correctly, quarantine must not be bypassable), and the resulting 401 body
// went on advertising `url-to-markdown` as free to try. The front door told
// agents to call something the platform would refuse. lib/free-tier.ts fixes
// the advertisement; this block fixes the thing that should never have been
// withdrawn.
//
// Why an event and not just the flags: the floor's window clamp and the
// promotion job's "was this a takedown?" test both read the most recent
// enforce-mode listing event. Flags without the event leave the capability
// looking freshly quarantined — the next tick re-quarantines it on the same
// July rows, and the promotion job keeps flagging it for a human who has
// already decided. Flags and event commit together, as jobs/quality-floor.ts
// does for the reverse direction: a listing change without its evidence must
// be impossible.
//
// Ledger-guarded, deliberately. This is a one-time correction of one specific
// decision, not a standing policy that `url-to-markdown` is listed. If it is
// ever quarantined again on fresh evidence, that quarantine stands — this
// block will not undo it on the next deploy.
//
// Authority: DEC-20260815-A (quarantine and promotion are platform-acts-alone).

export async function runMigration0100_relistUrlToMarkdown(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const BLOCK = "0100_relistUrlToMarkdown";
  const SLUG = "url-to-markdown";

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

  // Narrow by construction: only the exact post-quarantine shape matches. If
  // anything has already re-listed it, this is a no-op and the ledger row is
  // still written, so the block never fires twice.
  const res = await tx.execute(sql`
    UPDATE capabilities
       SET visible = true,
           x402_enabled = true,
           updated_at = now()
     WHERE slug = ${SLUG}
       AND is_active = true
       AND visible = false
  `);
  const affected = (res as { count?: number }).count ?? 0;

  // Written only when the flags actually moved. An event claiming a promotion
  // that did not happen is the same class of lie as a quarantine without its
  // evidence, and both the floor's window clamp and the promotion job would
  // read it as fact.
  if (affected > 0) {
    await tx.execute(sql`
      INSERT INTO health_monitor_events (event_type, capability_slug, tier, action_taken, details, human_override)
      VALUES (
        'capability_promotion',
        ${SLUG},
        1,
        'promoted_with_x402',
        ${JSON.stringify({
          mode: "enforce",
          dec: "DEC-20260815-A",
          reason:
            "Re-listed by operator decision: the 2026-08-22 quarantine counted five failures, of which one was a correct no-content refusal and four were the caller's target site (2x HTTP 400, 2x HTTP 429). Live execution, harness and the two most recent real calls all pass.",
          source: "startup-migration 0100",
          quarantined_at: "2026-08-22T05:58:42Z",
          quarantine_completion: 0.6667,
        })}::jsonb,
        true
      )
    `);
  }

  await tx.execute(sql`
    INSERT INTO startup_migration_ledger (block, rows_affected)
    VALUES (${BLOCK}, ${affected})
    ON CONFLICT (block) DO NOTHING
  `);

  return {
    block: BLOCK,
    outcome:
      affected === 0
        ? "no change (url-to-markdown was already listed)"
        : "url-to-markdown re-listed with its promotion event",
    rows_affected: affected,
    duration_ms: Date.now() - startedAt,
  };
}
