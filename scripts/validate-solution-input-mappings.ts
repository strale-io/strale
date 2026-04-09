/**
 * Gate 1: Solution Input Mapping Validator
 *
 * For every solution, validates that all $input.X references in step
 * input maps correspond to fields declared in the solution's inputSchema.
 *
 * Run: npx tsx scripts/validate-solution-input-mappings.ts [--slug <slug>]
 *
 * Returns exit code 1 if any mismatches found.
 */

import postgres from "postgres";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : dirname(fileURLToPath(import.meta.url));

// Load DB URL from .env or environment
let dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  try {
    const envPath = join(__dirname, "..", "apps", "api", ".env");
    const envContent = readFileSync(envPath, "utf-8");
    const match = envContent.match(/DATABASE_URL=(.+)/);
    if (match) dbUrl = match[1].trim();
  } catch {}
}

// If still no URL, try the public URL from Railway
if (!dbUrl) {
  console.error("DATABASE_URL not set. Pass it as an environment variable or use: DATABASE_URL=<url> npx tsx scripts/validate-solution-input-mappings.ts");
  process.exit(1);
}

const INPUT_REF = /^\$input\.(.+)$/;
const sql = postgres(dbUrl, { max: 1, ssl: dbUrl.includes("railway") ? { rejectUnauthorized: false } : undefined });

interface Mismatch {
  solutionSlug: string;
  stepSlug: string;
  stepOrder: number;
  reference: string;
  field: string;
  availableFields: string[];
}

async function validate(slugFilter?: string): Promise<Mismatch[]> {
  const mismatches: Mismatch[] = [];

  // Query all solutions with their steps
  const solutions = slugFilter
    ? await sql`SELECT id, slug, input_schema FROM solutions WHERE slug = ${slugFilter} AND is_active = true`
    : await sql`SELECT id, slug, input_schema FROM solutions WHERE is_active = true`;

  for (const sol of solutions) {
    const rawSchema = sol.input_schema;
    const inputSchema: { properties?: Record<string, unknown> } | null =
      typeof rawSchema === "string" ? (() => { try { return JSON.parse(rawSchema); } catch { return null; } })()
      : (rawSchema as { properties?: Record<string, unknown> } | null);
    const declaredFields = inputSchema?.properties ? Object.keys(inputSchema.properties) : [];

    const steps = await sql`
      SELECT capability_slug, step_order, input_map
      FROM solution_steps
      WHERE solution_id = ${sol.id}
      ORDER BY step_order
    `;

    for (const step of steps) {
      const inputMap = step.input_map as Record<string, string> | null;
      if (!inputMap) continue;

      for (const [, sourceExpr] of Object.entries(inputMap)) {
        const match = INPUT_REF.exec(sourceExpr);
        if (!match) continue;

        // Extract the top-level field name (before any dots/brackets)
        const fullPath = match[1];
        const topField = fullPath.split(/[.\[]/)[0];

        if (!declaredFields.includes(topField)) {
          mismatches.push({
            solutionSlug: sol.slug,
            stepSlug: step.capability_slug,
            stepOrder: step.step_order,
            reference: sourceExpr,
            field: topField,
            availableFields: declaredFields,
          });
        }
      }
    }
  }

  return mismatches;
}

async function main() {
  const slugArg = process.argv.indexOf("--slug");
  const slugFilter = slugArg >= 0 ? process.argv[slugArg + 1] : undefined;

  const mismatches = await validate(slugFilter);

  if (mismatches.length === 0) {
    console.log(`✓ All ${slugFilter ? `${slugFilter}` : "active"} solution input mappings are valid.`);
  } else {
    console.error(`✗ Found ${mismatches.length} input mapping mismatches:\n`);
    for (const m of mismatches) {
      console.error(`  ${m.solutionSlug} step ${m.stepOrder} (${m.stepSlug}): ${m.reference}`);
      console.error(`    Field '${m.field}' not in solution input schema. Available: [${m.availableFields.join(", ")}]`);
      console.error();
    }
  }

  await sql.end();
  process.exit(mismatches.length > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
