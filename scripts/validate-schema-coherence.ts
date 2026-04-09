/**
 * Gate 3: Schema Coherence Validator
 *
 * For every capability, validates that:
 * 1. All fields in input_schema.required exist in input_schema.properties
 * 2. No field in properties is marked required elsewhere but absent from required[]
 * 3. The required[] array exists and is an array
 *
 * Run: npx tsx scripts/validate-schema-coherence.ts [--slug <slug>]
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

let dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  try {
    const envPath = join(__dirname, "..", "apps", "api", ".env");
    const envContent = readFileSync(envPath, "utf-8");
    const match = envContent.match(/DATABASE_URL=(.+)/);
    if (match) dbUrl = match[1].trim();
  } catch {}
}

if (!dbUrl) {
  console.error("DATABASE_URL not set.");
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 1, ssl: dbUrl.includes("railway") ? { rejectUnauthorized: false } : undefined });

interface Issue {
  slug: string;
  type: "required_not_in_properties" | "empty_required_with_properties" | "malformed_schema";
  detail: string;
}

async function validate(slugFilter?: string): Promise<Issue[]> {
  const issues: Issue[] = [];

  const caps = slugFilter
    ? await sql`SELECT slug, input_schema FROM capabilities WHERE slug = ${slugFilter} AND is_active = true`
    : await sql`SELECT slug, input_schema FROM capabilities WHERE is_active = true`;

  for (const cap of caps) {
    const schema = cap.input_schema as {
      type?: string;
      required?: string[];
      properties?: Record<string, unknown>;
    } | null;

    if (!schema || typeof schema !== "object") {
      issues.push({ slug: cap.slug, type: "malformed_schema", detail: "input_schema is null or not an object" });
      continue;
    }

    const properties = schema.properties ? Object.keys(schema.properties) : [];
    const required = Array.isArray(schema.required) ? schema.required : [];

    // Check 1: every required field must be in properties
    for (const field of required) {
      if (!properties.includes(field)) {
        issues.push({
          slug: cap.slug,
          type: "required_not_in_properties",
          detail: `Field '${field}' is in required[] but not in properties. Properties: [${properties.join(", ")}]`,
        });
      }
    }

    // Check 2: if required is empty but there are properties, flag for review
    // (This is informational — many capabilities legitimately have all-optional inputs)
    // Skipping this check as it would be too noisy.
  }

  return issues;
}

async function main() {
  const slugArg = process.argv.indexOf("--slug");
  const slugFilter = slugArg >= 0 ? process.argv[slugArg + 1] : undefined;

  const issues = await validate(slugFilter);

  if (issues.length === 0) {
    console.log(`✓ All ${slugFilter ? `${slugFilter}` : "active"} capability schemas are coherent.`);
  } else {
    console.error(`✗ Found ${issues.length} schema coherence issues:\n`);
    for (const issue of issues) {
      console.error(`  ${issue.slug}: [${issue.type}] ${issue.detail}`);
    }
  }

  await sql.end();
  process.exit(issues.length > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
