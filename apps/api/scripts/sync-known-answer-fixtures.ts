/**
 * Resync known_answer fixtures: manifest → DB (Readiness P1, 2026-08-12).
 *
 *   npx tsx scripts/sync-known-answer-fixtures.ts --slugs slug1,slug2 [--dry-run]
 *
 * WHY: the P0 prod sweep found DB test_suites rows that had drifted from their
 * manifests — point-in-time `equals` values captured by old --discover runs
 * (dates that advance, upstream-controlled attributes), garbage placeholder
 * rows, and inputs the manifest had long since corrected. The manifest is the
 * authoring source of truth for fixtures; this script re-derives the DB rows
 * from it, exactly the way onboard.ts builds them at insert time, for an
 * explicit list of slugs.
 *
 * Behavior per slug (in one transaction):
 *   - Survivor = the healthiest active known_answer row (live-mode + normal
 *     status preferred, then oldest by created_at); updated in place with the
 *     manifest's input + rebuilt validation_rules. Its stale baseline
 *     (baseline_output / baseline_captured_at) is CLEARED — it was captured
 *     against the old input and would produce false drift signals.
 *   - Other active known_answer rows are DEACTIVATED (not deleted) —
 *     duplicates caused the llm-cost-calculate garbage-fixture incident.
 *   - The slug's schema_check row's input is resynced too (onboard.ts builds
 *     it from the same known_answer input).
 *
 * Fixture refresh is platform-authority work under the DEC-20260812-A
 * escalation contract. Nothing here touches executors or pricing.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import * as yaml from "js-yaml";
config({ path: resolve(import.meta.dirname, "../../../.env") });

const SLUG_RE = /^[a-z0-9-]+$/;

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
  const bad = slugs.filter((s) => !SLUG_RE.test(s));
  if (bad.length) {
    console.error(`invalid slug(s): ${bad.join(", ")} — lowercase letters, digits and hyphens only`);
    process.exit(1);
  }

  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

  // Say which database is about to be rewritten — the operator may have
  // .env pointed at prod (the normal case for this repo).
  const target = await sql<{ db: string; host: string }[]>`
    SELECT current_database() AS db, COALESCE(inet_server_addr()::text, 'local') AS host`;
  console.log(`target database: ${target[0].db} @ ${target[0].host}${dryRun ? "  (dry run — no writes)" : ""}\n`);

  for (const slug of slugs) {
    let manifest: any;
    try {
      manifest = yaml.load(readFileSync(resolve(import.meta.dirname, `../../../manifests/${slug}.yaml`), "utf8"));
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

    const rows = await sql<{ id: string; test_status: string; test_mode: string | null }[]>`
      SELECT id, test_status, test_mode FROM test_suites
      WHERE capability_slug = ${slug} AND test_type = 'known_answer' AND active = true
      ORDER BY (test_status = 'normal') DESC, (test_mode = 'live') DESC, created_at ASC, id ASC`;
    if (rows.length === 0) {
      console.log(`${slug}: SKIP — no active known_answer row in DB`);
      continue;
    }
    const keep = rows[0];
    const extras = rows.slice(1).map((r) => r.id);

    if (dryRun) {
      console.log(`${slug}: would update row ${keep.id} (${keep.test_status}/${keep.test_mode})${extras.length ? `, deactivate [${extras.join(",")}]` : ""} + schema_check input`);
      console.log(`  input: ${JSON.stringify(ka.input)}`);
      console.log(`  checks: ${validationRules.checks.length}`);
      continue;
    }

    await sql.begin(async (tx) => {
      await tx`
        UPDATE test_suites
        SET input = ${tx.json(ka.input)},
            validation_rules = ${tx.json(validationRules)},
            baseline_output = NULL,
            baseline_captured_at = NULL
        WHERE id = ${keep.id}`;
      if (extras.length) {
        await tx`UPDATE test_suites SET active = false WHERE id = ANY(${extras})`;
      }
      // onboard.ts derives the schema_check input from the known_answer input;
      // leaving it stale would keep exercising the old (possibly broken) input.
      await tx`
        UPDATE test_suites
        SET input = ${tx.json(ka.input)}
        WHERE capability_slug = ${slug} AND test_type = 'schema_check' AND active = true`;
    });
    console.log(`${slug}: updated row ${keep.id} (${validationRules.checks.length} checks, baseline cleared, schema_check input synced)${extras.length ? `; deactivated duplicates [${extras.join(",")}]` : ""}`);
  }
  await sql.end();
}

main().catch((e) => {
  console.error("sync failed:", e?.message ?? e);
  process.exit(1);
});
