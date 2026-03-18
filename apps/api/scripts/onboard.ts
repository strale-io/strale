/**
 * Pipeline Phase IV: Onboard a new capability from a YAML manifest.
 *
 * Reads a manifest file, validates all required fields, and inserts:
 *   1. Capability record (lifecycle_state='validating', visible=false)
 *   2. Test suites (known_answer + dependency_health from manifest fixtures,
 *      plus stub suites for schema_check, negative, edge_case)
 *   3. Limitations
 *   4. Field reliability annotations
 *
 * Usage:
 *   npx tsx scripts/onboard.ts --manifest manifests/new-cap.yaml
 *   npx tsx scripts/onboard.ts --manifest manifests/new-cap.yaml --dry-run
 *
 * After onboarding, run:
 *   npx tsx scripts/validate-capability.ts --slug <slug> --apply
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { eq } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import {
  capabilities,
  testSuites,
  capabilityLimitations,
} from "../src/db/schema.js";
import * as yaml from "js-yaml";
import { readFileSync } from "node:fs";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ManifestExpectedField {
  field: string;
  operator: string;
  value?: unknown;
  values?: unknown[];
  reliability?: string;
}

interface ManifestLimitation {
  title?: string | null;
  text: string;
  category: string;
  severity?: string;
  workaround?: string | null;
}

interface Manifest {
  slug: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  is_free_tier?: boolean;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  data_source: string;
  data_source_type: string;
  transparency_tag?: string | null;
  freshness_category?: string;
  test_fixtures: {
    known_answer?: {
      input: Record<string, unknown>;
      expected_fields: ManifestExpectedField[];
    };
    health_check_input?: Record<string, unknown>;
  };
  output_field_reliability: Record<string, string>;
  limitations: ManifestLimitation[];
}

// ─── Type mappings ───────────────────────────────────────────────────────────

function dataSourceTypeToCapType(dsType: string): string {
  switch (dsType) {
    case "computed":
      return "deterministic";
    case "scrape":
      return "scraping";
    case "api":
      return "stable_api";
    default:
      return "stable_api";
  }
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validateManifest(m: Manifest): string[] {
  const errors: string[] = [];

  if (!m.slug || typeof m.slug !== "string") errors.push("slug is required");
  if (!m.name || typeof m.name !== "string") errors.push("name is required");
  if (!m.description || m.description.length < 20) errors.push("description must be >= 20 chars");
  if (!m.category) errors.push("category is required");
  if (m.price_cents == null || (m.price_cents < 0)) errors.push("price_cents must be >= 0");
  if (!m.input_schema || typeof m.input_schema !== "object") errors.push("input_schema is required");
  if (!m.output_schema || typeof m.output_schema !== "object") errors.push("output_schema is required");
  if (!m.data_source) errors.push("data_source is required");
  if (!m.data_source_type) errors.push("data_source_type is required");

  // Slug pattern
  if (m.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(m.slug)) {
    errors.push("slug must be lowercase alphanumeric with hyphens");
  }

  // Schema structure
  if (m.input_schema && ((m.input_schema as any).type !== "object" || !m.input_schema.properties)) {
    errors.push("input_schema must have type:'object' and properties");
  }
  if (m.output_schema && ((m.output_schema as any).type !== "object" || !m.output_schema.properties)) {
    errors.push("output_schema must have type:'object' and properties");
  }

  // Test fixtures
  if (!m.test_fixtures?.known_answer?.input) {
    errors.push("test_fixtures.known_answer.input is required");
  }
  if (!m.test_fixtures?.known_answer?.expected_fields?.length) {
    errors.push("test_fixtures.known_answer.expected_fields must have at least 1 entry");
  }

  // Field reliability
  if (!m.output_field_reliability || Object.keys(m.output_field_reliability).length === 0) {
    errors.push("output_field_reliability must have at least 1 field");
  }

  // Limitations
  if (!m.limitations || m.limitations.length === 0) {
    errors.push("at least 1 limitation is required");
  }

  return errors;
}

// ─── Onboard ─────────────────────────────────────────────────────────────────

async function onboard(manifest: Manifest, dryRun: boolean): Promise<void> {
  const db = getDb();

  // Check if capability already exists
  const [existing] = await db
    .select({ slug: capabilities.slug })
    .from(capabilities)
    .where(eq(capabilities.slug, manifest.slug))
    .limit(1);

  if (existing) {
    console.log(`\nCapability '${manifest.slug}' already exists in database.`);
    if (!dryRun) {
      console.log("Use --dry-run to preview what would be created, or choose a different slug.");
      return;
    }
    console.log("(Continuing in dry-run mode for preview)\n");
  }

  const capType = dataSourceTypeToCapType(manifest.data_source_type);

  console.log("\n─── Capability Record ───────────────────────────────────────");
  console.log(`  slug:             ${manifest.slug}`);
  console.log(`  name:             ${manifest.name}`);
  console.log(`  category:         ${manifest.category}`);
  console.log(`  price_cents:      ${manifest.price_cents}`);
  console.log(`  is_free_tier:     ${manifest.is_free_tier ?? false}`);
  console.log(`  capability_type:  ${capType}`);
  console.log(`  data_source:      ${manifest.data_source}`);
  console.log(`  lifecycle_state:  validating`);
  console.log(`  visible:          false`);
  console.log(`  data_class:       ${(manifest as any).data_classification ?? "public"}`);

  // Test suites
  const testSuiteRecords = buildTestSuites(manifest);
  console.log(`\n─── Test Suites (${testSuiteRecords.length}) ────────────────────────────────`);
  for (const ts of testSuiteRecords) {
    console.log(`  ${ts.testType}: ${ts.testName}`);
  }

  // Limitations
  console.log(`\n─── Limitations (${manifest.limitations.length}) ─────────────────────────────────`);
  for (const lim of manifest.limitations) {
    console.log(`  [${lim.category}/${lim.severity ?? "info"}] ${(lim.title ?? lim.text).slice(0, 70)}`);
  }

  // Field reliability
  const fields = Object.entries(manifest.output_field_reliability);
  console.log(`\n─── Field Reliability (${fields.length} fields) ──────────────────────────`);
  for (const [field, level] of fields) {
    console.log(`  ${field}: ${level}`);
  }

  if (dryRun) {
    console.log("\n[DRY RUN] No changes made. Remove --dry-run to insert.");
    return;
  }

  if (existing) return; // Already exists, don't insert

  // Insert capability
  await db.insert(capabilities).values({
    slug: manifest.slug,
    name: manifest.name,
    description: manifest.description,
    category: manifest.category,
    priceCents: manifest.price_cents,
    isFreeTier: manifest.is_free_tier ?? false,
    inputSchema: manifest.input_schema,
    outputSchema: manifest.output_schema,
    dataSource: manifest.data_source,
    dataClassification: (manifest as any).data_classification ?? "public",
    transparencyTag: manifest.transparency_tag ?? null,
    capabilityType: capType,
    outputFieldReliability: manifest.output_field_reliability,
    lifecycleState: "validating",
    visible: false,
    isActive: true,
  });

  // Insert test suites
  for (const ts of testSuiteRecords) {
    await db.insert(testSuites).values(ts);
  }

  // Insert limitations
  for (let i = 0; i < manifest.limitations.length; i++) {
    const lim = manifest.limitations[i];
    await db.insert(capabilityLimitations).values({
      capabilitySlug: manifest.slug,
      title: lim.title ?? null,
      limitationText: lim.text,
      category: lim.category,
      severity: lim.severity ?? "info",
      workaround: lim.workaround ?? null,
      sortOrder: i,
    });
  }

  console.log(`\n✅ Onboarded '${manifest.slug}' → lifecycle_state=validating, visible=false`);
  console.log(`   Next: npx tsx scripts/validate-capability.ts --slug ${manifest.slug} --apply`);
}

// ─── Build test suite records ────────────────────────────────────────────────

function buildTestSuites(manifest: Manifest) {
  const suites: Array<{
    capabilitySlug: string;
    testName: string;
    testType: string;
    input: unknown;
    validationRules: unknown;
    scheduleTier: string;
    estimatedCostCents: number;
  }> = [];

  const slug = manifest.slug;
  const knownAnswer = manifest.test_fixtures?.known_answer;
  const healthInput = manifest.test_fixtures?.health_check_input;

  // 1. known_answer test
  if (knownAnswer) {
    suites.push({
      capabilitySlug: slug,
      testName: `${slug}-known-answer`,
      testType: "known_answer",
      input: knownAnswer.input,
      validationRules: {
        checks: knownAnswer.expected_fields.map((ef) => {
          const check: Record<string, unknown> = {
            field: ef.field,
            operator: ef.operator,
          };
          if (ef.value !== undefined) check.value = ef.value;
          if (ef.values !== undefined) check.values = ef.values;
          return check;
        }),
      },
      scheduleTier: "B",
      estimatedCostCents: manifest.price_cents,
    });
  }

  // 2. schema_check test (dry-run test that validates schema structure)
  suites.push({
    capabilitySlug: slug,
    testName: `${slug}-schema-check`,
    testType: "schema_check",
    input: knownAnswer?.input ?? healthInput ?? {},
    validationRules: {
      checks: Object.keys(
        (manifest.output_schema?.properties as Record<string, unknown>) ?? {},
      )
        .slice(0, 5)
        .map((field) => ({ field, operator: "not_null" })),
    },
    scheduleTier: "A",
    estimatedCostCents: 0,
  });

  // 3. negative test (empty input)
  suites.push({
    capabilitySlug: slug,
    testName: `${slug}-negative-empty`,
    testType: "negative",
    input: {},
    validationRules: { checks: [] },
    scheduleTier: "B",
    estimatedCostCents: 0,
  });

  // 4. edge_case test (partial input)
  const inputProps = Object.keys(
    (manifest.input_schema?.properties as Record<string, unknown>) ?? {},
  );
  const partialInput: Record<string, unknown> = {};
  if (inputProps.length > 0) {
    partialInput[inputProps[0]] = "";
  }
  suites.push({
    capabilitySlug: slug,
    testName: `${slug}-edge-empty-field`,
    testType: "edge_case",
    input: partialInput,
    validationRules: { checks: [] },
    scheduleTier: "C",
    estimatedCostCents: 0,
  });

  // 5. dependency_health test
  suites.push({
    capabilitySlug: slug,
    testName: `${slug}-dependency-health`,
    testType: "dependency_health",
    input: healthInput ?? knownAnswer?.input ?? {},
    validationRules: {
      checks: [{ field: "status", operator: "not_null" }],
    },
    scheduleTier: "A",
    estimatedCostCents: manifest.price_cents,
  });

  return suites;
}

// ─── Main ───────────────────────────────────────────────────────────────────

// ─── Backfill existing capability ────────────────────────────────────────────

async function backfill(manifest: Manifest, dryRun: boolean): Promise<void> {
  const db = getDb();

  // Verify the capability exists
  const [existing] = await db
    .select({ slug: capabilities.slug, id: capabilities.id })
    .from(capabilities)
    .where(eq(capabilities.slug, manifest.slug))
    .limit(1);

  if (!existing) {
    console.error(`Capability '${manifest.slug}' not found. Use onboard (without --backfill) to create it.`);
    process.exit(1);
  }

  // Check which test types already exist
  const existingTests = await db
    .select({ testType: testSuites.testType })
    .from(testSuites)
    .where(eq(testSuites.capabilitySlug, manifest.slug));

  const existingTypes = new Set(existingTests.map((t) => t.testType));
  const allSuites = buildTestSuites(manifest);
  const missing = allSuites.filter((s) => !existingTypes.has(s.testType));

  console.log(`\n─── Backfill: ${manifest.slug} ────────────────────────────────`);
  console.log(`  Existing test types: ${[...existingTypes].join(", ") || "(none)"}`);
  console.log(`  Missing test types:  ${missing.map((s) => s.testType).join(", ") || "(none)"}`);

  // Field reliability
  const fields = Object.entries(manifest.output_field_reliability);
  console.log(`  Field reliability:   ${fields.length} fields`);

  // Limitations
  const limCount = manifest.limitations?.length ?? 0;
  console.log(`  Limitations:         ${limCount}`);

  if (missing.length === 0 && fields.length === 0) {
    console.log("  Nothing to backfill.");
    return;
  }

  if (dryRun) {
    if (missing.length > 0) {
      console.log("\n  Would add test suites:");
      for (const s of missing) console.log(`    + ${s.testType}: ${s.testName}`);
    }
    console.log("\n  [DRY RUN] No changes made.");
    return;
  }

  // Insert missing test suites
  for (const ts of missing) {
    await db.insert(testSuites).values(ts);
    console.log(`  + Added ${ts.testType}: ${ts.testName}`);
  }

  // Update field reliability on the capability record
  if (fields.length > 0) {
    await db
      .update(capabilities)
      .set({
        outputFieldReliability: manifest.output_field_reliability,
        updatedAt: new Date(),
      })
      .where(eq(capabilities.slug, manifest.slug));
    console.log(`  ✓ Updated output_field_reliability (${fields.length} fields)`);
  }

  // Insert limitations if none exist
  const existingLimitations = await db
    .select({ id: capabilityLimitations.id })
    .from(capabilityLimitations)
    .where(eq(capabilityLimitations.capabilitySlug, manifest.slug))
    .limit(1);

  if (existingLimitations.length === 0 && manifest.limitations?.length > 0) {
    for (let i = 0; i < manifest.limitations.length; i++) {
      const lim = manifest.limitations[i];
      await db.insert(capabilityLimitations).values({
        capabilitySlug: manifest.slug,
        title: lim.title ?? null,
        limitationText: lim.text,
        category: lim.category,
        severity: lim.severity ?? "info",
        workaround: lim.workaround ?? null,
        sortOrder: i,
      });
    }
    console.log(`  ✓ Added ${manifest.limitations.length} limitation(s)`);
  }

  console.log(`  ✅ Backfill complete for '${manifest.slug}'`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const manifestIdx = args.indexOf("--manifest");
  const dryRun = args.includes("--dry-run");
  const isBackfill = args.includes("--backfill");

  if (manifestIdx === -1 || !args[manifestIdx + 1]) {
    console.error("Usage: npx tsx scripts/onboard.ts --manifest <path> [--dry-run] [--backfill]");
    process.exit(1);
  }

  const manifestPath = resolve(args[manifestIdx + 1]);
  console.log(`Reading manifest: ${manifestPath}`);

  let raw: string;
  try {
    raw = readFileSync(manifestPath, "utf-8");
  } catch (err) {
    console.error(`Could not read file: ${manifestPath}`);
    process.exit(1);
  }

  let manifest: Manifest;
  try {
    manifest = yaml.load(raw) as Manifest;
  } catch (err) {
    console.error(`YAML parse error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // Validate
  const errors = validateManifest(manifest);
  if (errors.length > 0) {
    console.error("\nManifest validation failed:");
    for (const e of errors) {
      console.error(`  ✗ ${e}`);
    }
    process.exit(1);
  }
  console.log("Manifest validation: all checks passed");

  if (isBackfill) {
    await backfill(manifest, dryRun);
  } else {
    await onboard(manifest, dryRun);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
