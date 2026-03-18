/**
 * Pipeline Phase IV: Generate onboarding manifests for all active capabilities.
 *
 * Pulls structured metadata from the database and writes YAML manifests to
 * ../../manifests/{slug}.yaml. These serve as baseline documentation and
 * as templates for future capability onboarding.
 *
 * Usage:
 *   npx tsx scripts/generate-manifests.ts
 *   npx tsx scripts/generate-manifests.ts --slug iban-validate
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { eq, and } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import {
  capabilities,
  testSuites,
  capabilityLimitations,
} from "../src/db/schema.js";
import * as yaml from "js-yaml";
import { writeFileSync, mkdirSync } from "node:fs";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ManifestExpectedField {
  field: string;
  operator: string;
  value?: unknown;
  values?: unknown[];
  reliability: string;
}

interface ManifestLimitation {
  title: string | null;
  text: string;
  category: string;
  severity: string;
  workaround: string | null;
}

interface Manifest {
  slug: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  is_free_tier: boolean;
  input_schema: unknown;
  output_schema: unknown;
  data_source: string | null;
  data_source_type: string;
  transparency_tag: string | null;
  freshness_category: string;
  test_fixtures: {
    known_answer?: {
      input: unknown;
      expected_fields: ManifestExpectedField[];
    };
    health_check_input?: unknown;
  };
  output_field_reliability: Record<string, string>;
  limitations: ManifestLimitation[];
}

// ─── Mappings ────────────────────────────────────────────────────────────────

function capTypeToDataSourceType(capType: string): string {
  switch (capType) {
    case "deterministic":
      return "computed";
    case "stable_api":
      return "api";
    case "scraping":
      return "scrape";
    case "ai_assisted":
      return "api";
    default:
      return "api";
  }
}

function inferFreshnessCategory(dataSource: string | null, capType: string): string {
  if (capType === "deterministic") return "computed";
  if (!dataSource) return "live-fetch";
  const lower = dataSource.toLowerCase();
  if (
    lower.includes("algorithmic") ||
    lower.includes("computed") ||
    lower.includes("node.js") ||
    lower.includes("validation logic")
  ) {
    return "computed";
  }
  if (
    lower.includes("reference") ||
    lower.includes("iso ") ||
    lower.includes("standard") ||
    lower.includes("specification")
  ) {
    return "reference-data";
  }
  return "live-fetch";
}

// ─── Generator ───────────────────────────────────────────────────────────────

async function generateManifest(slug: string): Promise<Manifest | null> {
  const db = getDb();

  // Fetch capability
  const [cap] = await db
    .select()
    .from(capabilities)
    .where(eq(capabilities.slug, slug))
    .limit(1);

  if (!cap) return null;

  // Fetch test suites
  const suites = await db
    .select()
    .from(testSuites)
    .where(
      and(eq(testSuites.capabilitySlug, slug), eq(testSuites.active, true)),
    );

  // Fetch limitations
  const lims = await db
    .select()
    .from(capabilityLimitations)
    .where(
      and(
        eq(capabilityLimitations.capabilitySlug, slug),
        eq(capabilityLimitations.active, true),
      ),
    );

  // Build test_fixtures
  const knownAnswerSuite = suites.find((s) => s.testType === "known_answer");
  const healthCheckSuite = suites.find((s) => s.testType === "dependency_health");
  const reliability = (cap.outputFieldReliability ?? {}) as Record<string, string>;

  const testFixtures: Manifest["test_fixtures"] = {};

  if (knownAnswerSuite) {
    const rules = knownAnswerSuite.validationRules as { checks: Array<{ field: string; operator: string; value?: unknown; values?: unknown[] }> } | null;
    const expectedFields: ManifestExpectedField[] = (rules?.checks ?? []).map((check) => {
      const topField = check.field.split(".")[0];
      const entry: ManifestExpectedField = {
        field: check.field,
        operator: check.operator,
        reliability: reliability[topField] ?? "common",
      };
      if (check.value !== undefined) entry.value = check.value;
      if (check.values !== undefined) entry.values = check.values;
      return entry;
    });

    testFixtures.known_answer = {
      input: knownAnswerSuite.input,
      expected_fields: expectedFields,
    };
  }

  if (healthCheckSuite) {
    testFixtures.health_check_input = healthCheckSuite.input;
  }

  const capType = cap.capabilityType ?? "stable_api";

  const manifest: Manifest = {
    slug: cap.slug,
    name: cap.name,
    description: cap.description,
    category: cap.category,
    price_cents: cap.priceCents,
    is_free_tier: cap.isFreeTier,
    input_schema: cap.inputSchema,
    output_schema: cap.outputSchema,
    data_source: cap.dataSource,
    data_source_type: capTypeToDataSourceType(capType),
    transparency_tag: cap.transparencyTag ?? null,
    freshness_category: inferFreshnessCategory(cap.dataSource, capType),
    test_fixtures: testFixtures,
    output_field_reliability: reliability,
    limitations: lims.map((l) => ({
      title: l.title,
      text: l.limitationText,
      category: l.category,
      severity: l.severity,
      workaround: l.workaround,
    })),
  };

  return manifest;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const slugIdx = args.indexOf("--slug");
  const specificSlug = slugIdx !== -1 ? args[slugIdx + 1] : null;
  const db = getDb();

  const manifestDir = resolve(import.meta.dirname, "../../../manifests");
  mkdirSync(manifestDir, { recursive: true });

  // Get capabilities to process
  const rows = specificSlug
    ? await db
        .select({ slug: capabilities.slug })
        .from(capabilities)
        .where(eq(capabilities.slug, specificSlug))
    : await db
        .select({ slug: capabilities.slug })
        .from(capabilities)
        .where(eq(capabilities.isActive, true));

  console.log(`Generating manifests for ${rows.length} capabilities...\n`);

  let generated = 0;
  let failed = 0;
  const failures: string[] = [];
  const typeBreakdown: Record<string, number> = {};

  for (const row of rows) {
    try {
      const manifest = await generateManifest(row.slug);
      if (!manifest) {
        failures.push(`${row.slug}: not found`);
        failed++;
        continue;
      }

      const header = `# Auto-generated from database on ${new Date().toISOString().slice(0, 10)}\n# Review and adjust before using as onboarding template\n\n`;
      const yamlContent = header + yaml.dump(manifest, {
        lineWidth: 120,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false,
        sortKeys: false,
      });

      const filePath = resolve(manifestDir, `${row.slug}.yaml`);
      writeFileSync(filePath, yamlContent, "utf-8");
      generated++;

      typeBreakdown[manifest.data_source_type] =
        (typeBreakdown[manifest.data_source_type] ?? 0) + 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${row.slug}: ${msg.slice(0, 60)}`);
      failed++;
    }
  }

  // Summary
  console.log("═".repeat(60));
  console.log(`MANIFEST GENERATION SUMMARY`);
  console.log(`  Total: ${rows.length}`);
  console.log(`  Generated: ${generated}`);
  console.log(`  Failed: ${failed}`);
  console.log(`\n  By data_source_type:`);
  for (const [type, count] of Object.entries(typeBreakdown).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${type}: ${count}`);
  }

  if (failures.length > 0) {
    console.log(`\n  Failures:`);
    for (const f of failures) {
      console.log(`    ${f}`);
    }
  }

  console.log(`\n  Output directory: ${manifestDir}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
