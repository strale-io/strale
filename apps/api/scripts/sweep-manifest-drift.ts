/** Read-only manifest/DB sweep. --strict fails only sync-writable differences on writable tools.
 * Missing DB rows are not implicit onboarding; malformed manifests fail closed.
 * Post-deploy: DATABASE_URL=<read-only role> npx tsx scripts/sweep-manifest-drift.ts --strict
 */
import { config } from "dotenv";
import { resolve, basename } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import * as yaml from "js-yaml";
import postgres from "postgres";
import { manifestDrift, driftExitCode } from "../src/lib/manifest-drift.js";
config({ path: resolve(import.meta.dirname, "../../../.env") });
if (process.argv.includes("--apply")) {
  console.error("This sweep is read-only. Apply text through the boot sync; DB-owned differences require human review.");
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set; sweep verified nothing. Supply a read-only DB credential.");
  process.exit(2);
}
const strict = process.argv.includes("--strict");
const db = postgres(process.env.DATABASE_URL, { max: 1, ssl: "require", connection: { default_transaction_read_only: true } });
let differences = 0, failures = 0, missing = 0, examined = 0;
const sections: Record<"writable" | "reportOnly" | "nonSynced" | "dbOwned", string[]> = {
  writable: [], reportOnly: [], nonSynced: [], dbOwned: [],
};
try {
  const directory = resolve(import.meta.dirname, "../../../manifests");
  const files = readdirSync(directory).filter(f => /\.ya?ml$/.test(f));
  if (!files.length) throw new Error("No manifests found");
  for (const file of files) {
    const slug = basename(file).replace(/\.ya?ml$/, "");
    try {
      const manifest = yaml.load(readFileSync(resolve(directory, file), "utf8")) as Record<string, unknown>;
      if (manifest.slug !== slug) throw new Error("Manifest slug mismatch");
      const [row] = await db`SELECT * FROM capabilities WHERE slug = ${slug}`;
      if (!row) { missing++; continue; }
      examined++;
      const limitations = await db`SELECT title, limitation_text AS "limitationText", category, severity, workaround
        FROM capability_limitations WHERE capability_slug = ${slug} AND active = true ORDER BY sort_order`;
      const drift = manifestDrift(manifest, row, limitations);
      differences += drift.writable.length;
      for (const section of ["writable", "reportOnly", "nonSynced", "dbOwned"] as const) {
        if (drift[section].length || section === "reportOnly" && drift.publicationPending)
          sections[section].push(`${slug}: ${drift[section].join(", ") || "no text differences"}`);
      }
    } catch {
      failures++;
      console.error(`${slug}: sweep failed; inspect manifest or DB availability`);
    }
  }
  if (!examined) { failures++; console.error("No existing capabilities examined; sweep verified nothing"); }
} finally { await db.end(); }
for (const [section, title] of Object.entries({
  writable: "Sync-writable drift (strict failures)",
  reportOnly: "Report-only tools: awaiting Petter's publication",
  nonSynced: "Manifest columns not written by sync (report only)",
  dbOwned: "DB/hybrid-owned columns (report only)",
})) {
  console.log(`\n${title}`);
  for (const line of sections[section as keyof typeof sections]) console.log(line);
  if (!sections[section as keyof typeof sections].length) console.log("(none)");
}
console.log(JSON.stringify({ examined, sync_writable_differences: differences, missing, failed: failures }));
process.exitCode = driftExitCode(strict, differences, failures);
