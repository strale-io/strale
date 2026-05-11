/**
 * Rule F read-back for DEC-20260511-E (stuck-in-validating sweep).
 *
 * Inserts a synthetic capability row in lifecycle_state='validating' plus a
 * matching lifecycle_transition health_monitor_events row dated 50h ago.
 * Runs checkValidationQueueStuck() and asserts:
 *
 *   1. result.passed === false
 *   2. result.affected includes the synthetic slug
 *   3. (best-effort) if GITHUB_TOKEN with `issues: write` is present, a
 *      GitHub Issue titled `[stuck-validating] <slug>` was opened
 *
 * Then cleans up: deletes both DB rows and closes the Issue if one was opened.
 *
 * The synthetic slug is deliberately distinguishable so it can never be
 * confused with a real capability: `__readback_test_dec_20260511_e`.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });
import { sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { checkValidationQueueStuck } from "../src/lib/meta-monitoring.js";
import { closeStuckValidatingIssue } from "../src/lib/github-issues.js";

const SLUG = "__readback_test_dec_20260511_e";
const FIFTY_HOURS_AGO_SQL = sql`NOW() - INTERVAL '50 hours'`;

const db = getDb();

async function cleanupDb() {
  await db.execute(sql`
    DELETE FROM health_monitor_events
    WHERE capability_slug = ${SLUG}
  `);
  await db.execute(sql`DELETE FROM capabilities WHERE slug = ${SLUG}`);
}

// Returns true if a [stuck-validating] issue for SLUG was found and closed,
// false if no such issue existed OR if the close attempt failed silently
// (GitHub's labels-list query has eventual consistency — the read-back's
// sub-second create→cleanup sequence frequently sees a stale empty list
// and skips the close. Production's daily Railway cadence is well clear of
// the window; an orphaned read-back issue is auto-closed by the next tick).
async function cleanupIssue(): Promise<boolean> {
  return closeStuckValidatingIssue(SLUG);
}

async function run() {
  console.log("=== Rule F read-back for DEC-20260511-E ===");
  console.log("");

  // Pre-cleanup in case a prior aborted run left rows behind
  await cleanupDb();
  await cleanupIssue();

  console.log("Step 1 — baseline check (expect passed=true, no stuck caps):");
  const baseline = await checkValidationQueueStuck();
  console.log(`  passed=${baseline.passed}  details="${baseline.details}"`);
  if (!baseline.passed) {
    console.warn("  WARN: there are real stuck caps in prod; the read-back will still work but the stuck set will be larger than 1.");
  }
  console.log("");

  console.log("Step 2 — inserting synthetic capability row in 'validating' (using DEC-20260423-B emergency bypass token)...");
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('strale.capability_insert_token', 'persistCapability', true)`);
    await tx.execute(sql`
      INSERT INTO capabilities
        (name, slug, description, category, input_schema, output_schema,
         price_cents, lifecycle_state, is_active, visible, capability_type,
         maintenance_class)
      VALUES
        ('Read-back synthetic for DEC-20260511-E',
         ${SLUG},
         'Synthetic row inserted by readback-dec-20260511-e.ts to verify the stuck-in-validating sweep fires. Deleted at end of script.',
         'utility',
         '{"type":"object","properties":{}}'::jsonb,
         '{"type":"object","properties":{}}'::jsonb,
         0, 'validating', true, false, 'pure-computation',
         'pure-computation')
    `);
  });

  console.log("Step 3 — inserting lifecycle_transition event dated 50h ago...");
  await db.execute(sql`
    INSERT INTO health_monitor_events
      (event_type, capability_slug, tier, action_taken, details, created_at)
    VALUES
      ('lifecycle_transition',
       ${SLUG},
       1,
       'draft → validating: synthetic read-back',
       '{"from":"draft","to":"validating","reason":"readback","triggered_by":"admin"}'::jsonb,
       ${FIFTY_HOURS_AGO_SQL})
  `);
  console.log("");

  console.log("Step 4 — running checkValidationQueueStuck()...");
  const result = await checkValidationQueueStuck();
  console.log(`  passed=${result.passed}  details="${result.details}"`);
  console.log(`  affected=${JSON.stringify(result.affected ?? [])}`);

  const stuckFoundUs = (result.affected ?? []).includes(SLUG);
  const passingCorrectly = result.passed === false && stuckFoundUs;

  console.log("");
  console.log("=== Assertions ===");
  console.log(`  passed === false                          : ${result.passed === false ? "PASS" : "FAIL"}`);
  console.log(`  affected contains synthetic slug          : ${stuckFoundUs ? "PASS" : "FAIL"}`);
  console.log(`  GitHub Issue created (best-effort)        : check logs above for [github-issues-created] or [github-issues-no-token]`);
  console.log("");

  if (!passingCorrectly) {
    console.error("READ-BACK FAILED — leaving rows in place for manual inspection. Run again to clean up.");
    process.exit(1);
  }

  console.log("Step 5 — cleaning up synthetic rows + closing Issue (if any)...");
  await cleanupDb();
  const issueClosed = await cleanupIssue();
  const postCleanup = await checkValidationQueueStuck();
  console.log(`  post-cleanup check: passed=${postCleanup.passed} details="${postCleanup.details}"`);
  console.log(`  synthetic issue closed: ${issueClosed ? "yes" : "no (GitHub label-index lag or token missing; next daily tick will close it)"}`);

  // Negative assertion — baseline must be restored. If cleanupDb partially
  // failed (e.g. event row deleted but capability row stayed), the script
  // must exit nonzero so a green read-back log can be trusted.
  const baselineRestored = !(postCleanup.affected ?? []).includes(SLUG);
  console.log(`  baseline restored (synthetic slug not in affected) : ${baselineRestored ? "PASS" : "FAIL"}`);
  console.log("");

  if (!baselineRestored) {
    console.error("READ-BACK FAILED — cleanup did not restore the baseline. Inspect the capabilities + health_monitor_events tables for leftover rows with slug=" + SLUG);
    process.exit(1);
  }

  console.log("READ-BACK PASSED");
  process.exit(0);
}

run().catch(async (err) => {
  console.error("Read-back errored:", err);
  await cleanupDb().catch(() => {});
  await cleanupIssue().catch(() => {});
  process.exit(1);
});
