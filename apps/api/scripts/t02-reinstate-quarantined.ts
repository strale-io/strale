/**
 * T0.2 reinstatement script — Codebase Quality Program, Phase 0.
 *
 * Reverses quality-floor quarantines (DEC-20260812-A) that were driven by the
 * pre-#278 transaction-failure-taxonomy bug (correct refusals counted as
 * capability faults) rather than by a genuine failure. See the audit at
 * `archive/sessions/2026-08-16-t02-quality-floor-quarantine-audit.md` for the
 * full per-capability evidence and verdicts this script encodes.
 *
 * DRY-RUN BY DEFAULT. Prints what it would do and exits. Pass --apply to
 * actually write. Nothing in this repo invokes --apply automatically — this
 * script is not wired into any job or startup path, and running it requires
 * an explicit human (or explicitly-authorized agent) invocation.
 *
 * Mirrors jobs/quality-floor.ts's own write pattern: the capability-flag
 * flip and its health_monitor_events audit row commit together in one
 * transaction (M-2 — a listing change without its evidence must be
 * impossible), same as the floor's own quarantine path.
 *
 * Usage:
 *   npx tsx --env-file=../../.env scripts/t02-reinstate-quarantined.ts            # dry run
 *   npx tsx --env-file=../../.env scripts/t02-reinstate-quarantined.ts --apply    # writes
 */
import postgres from "postgres";

interface Reinstatement {
  slug: string;
  /** What the recomputed (post-#278 taxonomy) 30d completion looks like. */
  reason: string;
}

// Only capabilities where the T0.2 audit found the taxonomy bug was the
// entire driver of the quarantine — i.e. under the corrected taxonomy,
// completion recomputes at or above the 70% floor. Capabilities whose
// failures are genuine (screenshot-url's waitForSelector bug,
// brazilian-company-data's ReceitaWS rate-limiting, url-to-text's upstream
// unavailability) are deliberately NOT listed here — reinstating them would
// just relist a capability that still fails most real calls.
const REINSTATEMENTS: Reinstatement[] = [
  {
    slug: "us-company-data",
    reason:
      "Quarantined 2026-08-12T20:18:02Z at completion 64% (7/11 eligible). Recomputed under the " +
      "corrected taxonomy (PR #278, transaction-failure-taxonomy.ts): all 4 non-completed calls in " +
      "the eligible window classify caller_input (missing cik/company_name; 'No US company found " +
      "matching \"Braize\"'; ambiguous-match refusal for \"Apple\"; an LLM refusal string passed in as " +
      "the company name). Corrected completion is 100% (7/7). Re-verified against prod on 2026-08-16 " +
      "(both the as-of-quarantine 30d window and the current rolling 30d window recompute the same way). " +
      "No genuine failure in the window except one pre-existing SEC EDGAR HTTP 500, which the taxonomy " +
      "already correctly counted before and after the fix.",
  },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const sql = postgres(connStr, { max: 1 });

  try {
    for (const r of REINSTATEMENTS) {
      const [cap] = await sql`
        SELECT slug, visible, x402_enabled, lifecycle_state, deactivation_reason, is_active
        FROM capabilities WHERE slug = ${r.slug}`;

      if (!cap) {
        console.log(`SKIP ${r.slug}: not found in capabilities table`);
        continue;
      }
      if (cap.visible) {
        console.log(`SKIP ${r.slug}: already visible (visible=true) — nothing to reinstate`);
        continue;
      }
      if (cap.deactivation_reason) {
        console.log(
          `SKIP ${r.slug}: has deactivation_reason set ("${cap.deactivation_reason}") — that is a ` +
            `human "no", not a floor quarantine. This script only reverses floor quarantines and will ` +
            `not touch a deliberate deactivation.`,
        );
        continue;
      }

      console.log(`${apply ? "APPLYING" : "WOULD APPLY"} reinstatement for ${r.slug}`);
      console.log(`  current: visible=${cap.visible} x402_enabled=${cap.x402_enabled} lifecycle_state=${cap.lifecycle_state}`);
      console.log(`  reason: ${r.reason}`);

      if (!apply) continue;

      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO health_monitor_events (event_type, capability_slug, tier, action_taken, details)
          VALUES (
            'quality_floor',
            ${r.slug},
            2,
            'reinstated_taxonomy_correction',
            ${sql.json({
              dec: "DEC-20260812-A",
              mode: "manual_ops",
              reason: r.reason,
              source: "T0.2 audit — archive/sessions/2026-08-16-t02-quality-floor-quarantine-audit.md",
            })}
          )`;
        await tx`
          UPDATE capabilities
          SET visible = true, x402_enabled = true, updated_at = NOW()
          WHERE slug = ${r.slug}`;
      });
      console.log(`  done: ${r.slug} visible=true x402_enabled=true`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  if (!apply) {
    console.log("\nDry run only — no writes made. Re-run with --apply to write.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
