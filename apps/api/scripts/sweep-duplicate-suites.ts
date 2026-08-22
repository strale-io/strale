/**
 * Read-only sweep: find capabilities with duplicate-input test suites — the
 * `swedish-company-data` pattern found in Phase 4 (2026-08-17), where five
 * `known_answer` suites (Klarna Bank AB / Volvo Car AB / H&M / IKEA of
 * Sweden AB / a stale name-search variant) all carried the exact same
 * `{"org_number":"556703-7485"}` input as the sixth, correctly-labeled
 * suite ("Spotify AB — known company") — one company tested five times
 * under five different names, quadrupling daily test-budget burn against
 * Block 0084's 100/day cap while adding zero additional coverage.
 *
 * This script generalizes that finding: group ACTIVE test_suites by
 * (capability_slug, test_type, input::text) and report every group with
 * more than one DISTINCT test_name. Grouping includes test_type
 * deliberately — a single input legitimately backs several DIFFERENT test
 * types (the same known-good fixture commonly doubles as the
 * dependency_health ping, the schema_check payload, and the piggyback
 * baseline; that is normal architecture, not the bug). The swedish defect
 * was specifically multiple suites of the SAME test_type (all
 * `known_answer`) carrying different entity labels over one identical
 * input — grouping by test_type is what isolates that pattern from the
 * (much larger, entirely benign) cross-test-type fixture reuse.
 *
 * It does not modify anything — report only, per the restore task's
 * read-only mandate for deliverable 3.
 *
 * Usage:
 *   npx tsx --env-file=<path to .env> scripts/sweep-duplicate-suites.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { sql } from "drizzle-orm";
import { openOperatorDrizzle } from "../src/lib/operator-db.js";

interface DupGroupRow {
  capability_slug: string;
  test_type: string;
  input_text: string;
  suite_count: string | number;
  test_names: string[];
  suite_ids: string[];
}

async function main() {
  const db = openOperatorDrizzle();

  const rows = await db.execute(sql`
    SELECT
      capability_slug,
      test_type,
      input::text AS input_text,
      COUNT(*) AS suite_count,
      array_agg(test_name ORDER BY test_name) AS test_names,
      array_agg(id::text ORDER BY test_name) AS suite_ids
    FROM test_suites
    WHERE active = true
    GROUP BY capability_slug, test_type, input::text
    HAVING COUNT(DISTINCT test_name) > 1
    ORDER BY COUNT(*) DESC, capability_slug
  `);

  const groups = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] })?.rows ?? []) as unknown as DupGroupRow[];

  if (groups.length === 0) {
    console.log("No capabilities found with duplicate-input active test suites.");
    process.exit(0);
  }

  console.log(`Found ${groups.length} same-test-type duplicate-input group(s) across the platform.\n`);
  console.log(
    "slug".padEnd(32) +
      "type".padEnd(16) +
      "input".padEnd(50) +
      "count".padEnd(7) +
      "suite names",
  );
  console.log("-".repeat(170));

  for (const g of groups) {
    const count = typeof g.suite_count === "string" ? parseInt(g.suite_count, 10) : g.suite_count;
    const inputShort = g.input_text.length > 46 ? g.input_text.slice(0, 43) + "..." : g.input_text;
    console.log(
      g.capability_slug.padEnd(32) +
        g.test_type.padEnd(16) +
        inputShort.padEnd(50) +
        String(count).padEnd(7) +
        g.test_names.join(" | "),
    );
  }

  console.log(`\nTotal duplicate-input active suites (excess beyond 1 per group): ${
    groups.reduce((acc, g) => {
      const count = typeof g.suite_count === "string" ? parseInt(g.suite_count, 10) : g.suite_count;
      return acc + (count - 1);
    }, 0)
  }`);
  console.log(
    "\nThis script is read-only. It reports duplicate-input suite groups; it does not\n" +
      "deactivate, merge, or modify anything. Only swedish-company-data has been\n" +
      "remediated so far (Phase 4, 2026-08-17 + this session's restore script).",
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
