/**
 * Resync known_answer fixtures: manifest → DB (Readiness P1, 2026-08-12).
 *
 *   npx tsx scripts/sync-known-answer-fixtures.ts --slugs slug1,slug2 [--dry-run]
 *
 * WHY: the P0 prod sweep found DB test_suites rows that had drifted from their
 * manifests — point-in-time `equals` values captured by old --discover runs
 * (dates that advance, upstream-controlled attributes), garbage placeholder
 * rows, and inputs the manifest had long since corrected. The manifest is the
 * authoring source of truth for fixtures; this script re-derives the DB row
 * from it, exactly the way onboard.ts builds it at insert time (same
 * checks mapping), for an explicit list of slugs.
 *
 * Behavior per slug:
 *   - The lowest-id active known_answer row is updated in place
 *     (input + validation_rules rebuilt from the manifest).
 *   - Any additional active known_answer rows are DEACTIVATED (not deleted) —
 *     duplicates have already caused one garbage-fixture incident
 *     (llm-cost-calculate's `model: "test_value"` row).
 *
 * Fixture refresh is platform-authority work under the DEC-20260812-A
 * escalation contract. Nothing here touches executors or pricing.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import * as yaml from "js-yaml";
const parseYaml = (s: string) => yaml.load(s);
config({ path: resolve(import.meta.dirname, "../../../.env") });

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const slugsIdx = args.indexOf("--slugs");
  const slugsArg = slugsIdx >= 0 ? args[slugsIdx + 1] : undefined;
  if (!slugsArg || slugsArg.startsWith("--")) {
    console.error("--slugs slug1,slug2 required (explicit list — this rewrites DB fixtures)");
    process.exit(1);
  }
  const slugs = slugsArg.split(",").map((s) => s.trim()).filter(Boolean);

  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

  for (const slug of slugs) {
    let manifest: any;
    try {
      manifest = parseYaml(readFileSync(resolve(import.meta.dirname, `../../../manifests/${slug}.yaml`), "utf8"));
    } catch (e: any) {
      console.log(`${slug}: SKIP — cannot read manifest (${e.message})`);
      continue;
    }
    const ka = manifest?.test_fixtures?.known_answer;
    if (!ka?.input || !Array.isArray(ka?.expected_fields) || ka.expected_fields.length === 0) {
      console.log(`${slug}: SKIP — manifest has no usable known_answer fixture`);
      continue;
    }
    // Same mapping onboard.ts uses at insert time.
    const validationRules = {
      checks: ka.expected_fields.map((ef: any) => {
        const check: Record<string, unknown> = { field: ef.field, operator: ef.operator };
        if (ef.value !== undefined) check.value = ef.value;
        if (ef.values !== undefined) check.values = ef.values;
        return check;
      }),
    };

    const rows = await sql<{ id: number }[]>`
      SELECT id FROM test_suites
      WHERE capability_slug = ${slug} AND test_type = 'known_answer' AND active = true
      ORDER BY id`;
    if (rows.length === 0) {
      console.log(`${slug}: SKIP — no active known_answer row in DB`);
      continue;
    }
    const keep = rows[0].id;
    const extras = rows.slice(1).map((r) => r.id);

    if (dryRun) {
      console.log(`${slug}: would update row ${keep}${extras.length ? `, deactivate [${extras.join(",")}]` : ""}`);
      console.log(`  input: ${JSON.stringify(ka.input)}`);
      console.log(`  checks: ${validationRules.checks.length}`);
      continue;
    }

    await sql`
      UPDATE test_suites
      SET input = ${sql.json(ka.input)}, validation_rules = ${sql.json(validationRules)}
      WHERE id = ${keep}`;
    if (extras.length) {
      await sql`UPDATE test_suites SET active = false WHERE id = ANY(${extras})`;
    }
    console.log(`${slug}: updated row ${keep} (${validationRules.checks.length} checks)${extras.length ? `; deactivated duplicates [${extras.join(",")}]` : ""}`);
  }
  await sql.end();
}

main().catch((e) => {
  console.error("sync failed:", e?.message ?? e);
  process.exit(1);
});
