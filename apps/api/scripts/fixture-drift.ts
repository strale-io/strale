/**
 * A fixture the repository has already corrected, and production has not.
 *
 * Production read-only. Run it in the morning health sweep (DAILY-RUN.md
 * step B). It answers one question the rest of the health machinery cannot
 * ask: is a capability being judged on a test input that this repository
 * already knows is wrong?
 *
 * The rationale, the measured population, and the reason the check is narrow
 * are all in `src/lib/fixture-drift.ts`. The short version: `onboard.ts
 * --backfill` never rewrites an existing suite's input from the manifest, so
 * correcting a fixture in the repository is a no-op against production, and
 * until this script existed nothing compared the two. `canadian-company-data`
 * sat that way from 2026-08-12 to 2026-09-12 on a corporation number the
 * Canadian registry says does not exist, passing none of its runs (173 in the
 * fourteen-day window when first measured; the window rolls).
 *
 * Exit code is 0 whether or not it finds anything: this is a report for a
 * human sweep, not a CI gate. It cannot be a CI gate — CI has no production
 * database, and the drift lives in production rows, not in the repository.
 *
 * Usage:
 *   npm run fixtures:drift                 # dependency_health, last 14 days
 *   npx tsx scripts/fixture-drift.ts --days 30 --test-type known_answer
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { load as loadYaml } from "js-yaml";

import {
  findFixtureDrift,
  type ManifestFixture,
  type SuiteRow,
} from "../src/lib/fixture-drift.js";
import { openOperatorDrizzle } from "../src/lib/operator-db.js";

// The operator handle reads DATABASE_URL when it is opened and loads no
// environment of its own — same repo-root .env every other operator script
// reads. See the note in who-called.ts.
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
config({ path: resolve(REPO_ROOT, ".env") });

const MANIFEST_DIR = resolve(REPO_ROOT, "manifests");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const days = Number(arg("days") ?? 14);
const testType = arg("test-type") ?? "dependency_health";

// A non-positive --days puts the cutoff in the future, so every suite reads
// `runs = 0`, every finding is filtered out, and the script cheerfully prints
// "Nothing". That is the same silent-clean failure the readManifests comment
// below exists to prevent, one flag away, so it is refused rather than run.
if (!Number.isInteger(days) || days <= 0) {
  console.error(`--days must be a positive whole number of days; got "${arg("days")}"`);
  process.exit(2);
}

/**
 * Read every manifest's `health_check_input`.
 *
 * A manifest that will not parse is skipped and named, never silently
 * dropped: a YAML error here would otherwise read as "no drift", which is the
 * failure mode this whole script exists to prevent.
 */
function readManifests(): { fixtures: ManifestFixture[]; unreadable: string[] } {
  const fixtures: ManifestFixture[] = [];
  const unreadable: string[] = [];
  for (const file of readdirSync(MANIFEST_DIR).filter((f) => f.endsWith(".yaml"))) {
    let parsed: unknown;
    try {
      parsed = loadYaml(readFileSync(resolve(MANIFEST_DIR, file), "utf8"));
    } catch {
      unreadable.push(file);
      continue;
    }
    const manifest = parsed as { slug?: string; test_fixtures?: { health_check_input?: unknown } };
    if (!manifest?.slug) {
      unreadable.push(file);
      continue;
    }
    fixtures.push({
      slug: manifest.slug,
      healthCheckInput: manifest.test_fixtures?.health_check_input,
    });
  }
  return { fixtures, unreadable };
}

async function main(): Promise<void> {
  const db = openOperatorDrizzle();
  const rows: any = await db.execute(sql`
    SELECT ts.id AS suite_id,
           ts.capability_slug,
           ts.test_type,
           ts.input,
           c.is_active,
           COUNT(tr.id)::int                              AS runs,
           COUNT(tr.id) FILTER (WHERE tr.passed)::int     AS passed,
           -- The LATEST failure, not MAX(): MAX picks the lexically largest
           -- string, which on canadian-company-data surfaced a one-off timeout
           -- instead of the "corporation does not exist" error every other run
           -- gave. A sample that is not the current behaviour misdirects.
           LEFT((array_agg(tr.failure_reason ORDER BY tr.executed_at DESC)
                 FILTER (WHERE tr.failure_reason IS NOT NULL))[1], 160) AS sample_failure
      FROM test_suites ts
      JOIN capabilities c ON c.slug = ts.capability_slug
      LEFT JOIN test_results tr
        ON tr.test_suite_id = ts.id
       AND tr.executed_at >= now() - (${days}::text || ' days')::interval
     WHERE ts.test_type = ${testType}
       AND ts.active = true
     -- By suite id, not by (slug, test_type, input): a capability may hold more
     -- than one active suite of a type (risk-narrative-generate does), and
     -- grouping by the value columns merges them into one row with their runs
     -- summed. That under-counted the active suites by one and the divergences
     -- by one on the first run of this script.
     GROUP BY ts.id, ts.capability_slug, ts.test_type, ts.input, c.is_active
  `);

  const suites: SuiteRow[] = (rows.rows ?? rows).map((r: any) => ({
    suiteId: String(r.suite_id),
    capabilitySlug: r.capability_slug,
    testType: r.test_type,
    input: typeof r.input === "string" ? JSON.parse(r.input) : r.input,
    runs: Number(r.runs),
    passed: Number(r.passed),
    sampleFailure: r.sample_failure,
    capabilityActive: r.is_active === true,
  }));

  const { fixtures, unreadable } = readManifests();
  const findings = findFixtureDrift(suites, fixtures, { testType });

  console.log(`fixture drift — ${testType}, last ${days} day(s), production read-only`);
  console.log(`  ${suites.length} active suite(s) · ${fixtures.length} manifest(s)\n`);
  if (unreadable.length > 0) {
    console.log(`  ⚠ ${unreadable.length} manifest(s) unreadable, so not compared: ${unreadable.join(", ")}\n`);
  }

  if (findings.length === 0) {
    console.log("  Nothing: every suite either matches its manifest or is passing on the");
    console.log("  fixture production holds. Suites that match and still fail are a real");
    console.log("  upstream problem and belong to `npm run vendor:status`, not here.");
  } else {
    console.log(`  ${findings.length} suite(s) failing on a fixture the repository has already corrected:\n`);
    for (const f of findings) {
      console.log(`  ${f.slug}${f.capabilityActive ? "" : "  (capability switched off)"}`);
      console.log(`      suite      : ${f.suiteId}`);
      console.log(`      production : ${f.productionInput}`);
      console.log(`      manifest   : ${f.manifestInput}`);
      console.log(`      ${f.runs} run(s), 0 passed — ${f.sampleFailure ?? "no failure recorded"}`);
      console.log("");
    }
    console.log("  Each needs the production row rewritten from the manifest. `onboard.ts");
    console.log("  --backfill` will NOT do it: it inserts missing test types and updates");
    console.log("  only known_answer. Applying these is a production write, which needs an");
    console.log("  authorised attended session (see DECISION-QUEUE.md DQ-27).");
  }
}

// Same shape as who-called.ts: the operator handle holds an open pool, so the
// process is ended explicitly rather than waited out.
main().then(
  () => process.exit(0),
  (e) => { console.error(e); process.exit(1); },
);
