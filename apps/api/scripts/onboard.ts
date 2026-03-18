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
 * Flags:
 *   --manifest <path>   Path to YAML manifest (required)
 *   --dry-run           Preview changes without inserting to DB
 *   --backfill          Update existing capability (add missing tests, reliability, limitations)
 *   --strict            Abort if execute-and-verify fails
 *   --fix               Auto-correct high-confidence fixture mismatches
 *   --discover          Auto-generate expected_fields from live execution output
 *
 * Usage:
 *   npx tsx scripts/onboard.ts --manifest manifests/new-cap.yaml
 *   npx tsx scripts/onboard.ts --manifest manifests/new-cap.yaml --dry-run
 *   npx tsx scripts/onboard.ts --manifest manifests/new-cap.yaml --discover
 *   npx tsx scripts/onboard.ts --manifest manifests/new-cap.yaml --backfill --discover --fix
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

// Side-effect imports to register all executors
import "../src/app.js";

import { eq, and } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import {
  capabilities,
  testSuites,
  capabilityLimitations,
} from "../src/db/schema.js";
import * as yaml from "js-yaml";
import { readFileSync, writeFileSync } from "node:fs";
import { getExecutor } from "../src/capabilities/index.js";

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

interface FixtureMismatch {
  field: string;
  expected: { operator: string; value?: unknown };
  actual_value: unknown | undefined;
  fix_type: "auto" | "suggest";
  suggested_fix: string;
  corrected_expected?: ManifestExpectedField;
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

function validateManifest(m: Manifest, discover: boolean): string[] {
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

  // Test fixtures — in --discover mode, expected_fields can be empty
  if (!discover) {
    if (!m.test_fixtures?.known_answer?.input) {
      errors.push("test_fixtures.known_answer.input is required");
    }
    if (!m.test_fixtures?.known_answer?.expected_fields?.length) {
      errors.push("test_fixtures.known_answer.expected_fields must have at least 1 entry");
    }
  } else {
    // In discover mode, we need at least health_check_input or known_answer.input
    if (!m.test_fixtures?.health_check_input && !m.test_fixtures?.known_answer?.input) {
      errors.push("--discover requires test_fixtures.health_check_input or test_fixtures.known_answer.input");
    }
  }

  // Field reliability — in --discover mode, can be empty (will be generated)
  if (!discover) {
    if (!m.output_field_reliability || Object.keys(m.output_field_reliability).length === 0) {
      errors.push("output_field_reliability must have at least 1 field");
    }
  }

  // Limitations
  if (!m.limitations || m.limitations.length === 0) {
    errors.push("at least 1 limitation is required");
  }

  return errors;
}

// ─── Execute-and-Verify (Enhancement 1) ─────────────────────────────────────

async function executeCapability(
  slug: string,
  input: Record<string, unknown>,
): Promise<{ output: Record<string, unknown>; error?: string }> {
  const executor = getExecutor(slug);
  if (!executor) {
    return { output: {}, error: `No executor registered for '${slug}'` };
  }

  try {
    const result = await Promise.race([
      executor(input),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout after 30s")), 30_000),
      ),
    ]);

    if (!result?.output || typeof result.output !== "object") {
      return { output: {}, error: "Execution returned no output" };
    }
    return { output: result.output as Record<string, unknown> };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: {}, error: msg };
  }
}

function checkFieldAssertion(
  output: Record<string, unknown>,
  ef: ManifestExpectedField,
): { pass: boolean; actual: unknown } {
  const actual = output[ef.field];
  switch (ef.operator) {
    case "not_null":
      return { pass: actual != null, actual };
    case "equals":
      return { pass: actual === ef.value, actual };
    case "contains":
      return {
        pass: typeof actual === "string" && typeof ef.value === "string" && actual.includes(ef.value),
        actual,
      };
    case "gt":
      return { pass: typeof actual === "number" && typeof ef.value === "number" && actual > ef.value, actual };
    case "gte":
      return { pass: typeof actual === "number" && typeof ef.value === "number" && actual >= ef.value, actual };
    case "type":
      return { pass: typeof actual === ef.value, actual };
    default:
      return { pass: true, actual }; // unknown operator — skip
  }
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return d[m][n];
}

function toSnakeCase(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

function toCamelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// ─── Auto-Correct (Enhancement 2) ──────────────────────────────────────────

function analyzeFixtureMismatches(
  expectedFields: ManifestExpectedField[],
  output: Record<string, unknown>,
): FixtureMismatch[] {
  const mismatches: FixtureMismatch[] = [];
  const outputKeys = Object.keys(output);

  for (const ef of expectedFields) {
    const check = checkFieldAssertion(output, ef);
    if (check.pass) continue;

    const mismatch: FixtureMismatch = {
      field: ef.field,
      expected: { operator: ef.operator, value: ef.value },
      actual_value: check.actual,
      fix_type: "suggest",
      suggested_fix: "",
    };

    // ── High-confidence auto-fixes ──

    // Case convention mismatch: is_mobile vs isMobile
    const snaked = toSnakeCase(ef.field);
    const cameled = toCamelCase(ef.field);
    const caseMatch = outputKeys.find(
      (k) => k !== ef.field && (k === snaked || k === cameled || toSnakeCase(k) === snaked),
    );
    if (caseMatch && output[caseMatch] != null) {
      const corrected: ManifestExpectedField = { ...ef, field: caseMatch };
      // Re-check with corrected field name
      const recheck = checkFieldAssertion(output, corrected);
      if (recheck.pass) {
        mismatch.fix_type = "auto";
        mismatch.suggested_fix = `Rename field '${ef.field}' → '${caseMatch}' (case convention)`;
        mismatch.corrected_expected = corrected;
        mismatches.push(mismatch);
        continue;
      }
    }

    // Close field name (Levenshtein ≤ 2)
    if (check.actual === undefined) {
      const closeMatch = outputKeys.find((k) => k !== ef.field && levenshtein(k, ef.field) <= 2);
      if (closeMatch) {
        const corrected: ManifestExpectedField = { ...ef, field: closeMatch };
        const recheck = checkFieldAssertion(output, corrected);
        if (recheck.pass) {
          mismatch.fix_type = "auto";
          mismatch.suggested_fix = `Rename field '${ef.field}' → '${closeMatch}' (close match, Levenshtein ≤ 2)`;
          mismatch.corrected_expected = corrected;
          mismatches.push(mismatch);
          continue;
        }
      }
    }

    // Boolean coercion: true vs "true", 1 vs true
    if (ef.operator === "equals" && check.actual !== undefined) {
      if (
        (ef.value === true && (check.actual === "true" || check.actual === 1)) ||
        (ef.value === false && (check.actual === "false" || check.actual === 0)) ||
        (ef.value === "true" && check.actual === true) ||
        (ef.value === "false" && check.actual === false)
      ) {
        const corrected: ManifestExpectedField = { ...ef, value: check.actual };
        mismatch.fix_type = "auto";
        mismatch.suggested_fix = `Update value: ${JSON.stringify(ef.value)} → ${JSON.stringify(check.actual)} (type coercion)`;
        mismatch.corrected_expected = corrected;
        mismatches.push(mismatch);
        continue;
      }
    }

    // Case-insensitive string match
    if (
      ef.operator === "equals" &&
      typeof ef.value === "string" &&
      typeof check.actual === "string" &&
      ef.value.toLowerCase() === check.actual.toLowerCase()
    ) {
      const corrected: ManifestExpectedField = { ...ef, value: check.actual };
      mismatch.fix_type = "auto";
      mismatch.suggested_fix = `Update value: "${ef.value}" → "${check.actual}" (case difference)`;
      mismatch.corrected_expected = corrected;
      mismatches.push(mismatch);
      continue;
    }

    // ── Low-confidence suggestions ──

    if (check.actual === undefined || check.actual === null) {
      mismatch.suggested_fix = `Field '${ef.field}' not in output. Downgrade reliability from 'guaranteed' to 'common'?`;
    } else if (ef.operator === "equals") {
      mismatch.suggested_fix = `Expected ${JSON.stringify(ef.value)} but got ${JSON.stringify(check.actual)}. Update manifest value?`;
    } else {
      mismatch.suggested_fix = `Assertion '${ef.operator}' failed for '${ef.field}' (actual: ${JSON.stringify(check.actual)})`;
    }

    mismatches.push(mismatch);
  }

  return mismatches;
}

// ─── Discover (Enhancement 3) ──────────────────────────────────────────────

function isAiCapability(manifest: Manifest): boolean {
  return manifest.transparency_tag === "ai_generated" || manifest.transparency_tag === "mixed";
}

function generateExpectedFields(
  output: Record<string, unknown>,
  useLooseAssertions: boolean,
): ManifestExpectedField[] {
  const fields: ManifestExpectedField[] = [];

  for (const [key, value] of Object.entries(output)) {
    if (value === undefined || value === null) continue;

    const field: ManifestExpectedField = {
      field: key,
      operator: "not_null",
      reliability: "guaranteed",
    };

    // Stronger assertions for deterministic values (unless AI-generated)
    if (!useLooseAssertions) {
      if (typeof value === "boolean") {
        field.operator = "equals";
        field.value = value;
      } else if (typeof value === "string" && value.length <= 30 && !/\s/.test(value)) {
        // Short strings without spaces look like enums
        field.operator = "equals";
        field.value = value;
      }
      // Numbers and arrays: keep not_null (values may change between calls)
    }

    fields.push(field);
  }

  return fields;
}

function generateFieldReliability(
  output: Record<string, unknown>,
): Record<string, string> {
  const reliability: Record<string, string> = {};
  for (const key of Object.keys(output)) {
    if (output[key] != null) {
      reliability[key] = "guaranteed";
    }
  }
  return reliability;
}

// ─── Execute-and-verify step ────────────────────────────────────────────────

async function verifyFixtures(
  manifest: Manifest,
  flags: { strict: boolean; fix: boolean },
  manifestPath: string,
): Promise<{ passed: boolean; manifest: Manifest }> {
  const input = manifest.test_fixtures?.known_answer?.input;
  const expectedFields = manifest.test_fixtures?.known_answer?.expected_fields;

  if (!input || !expectedFields?.length) {
    console.log("\n─── Fixture Verification ─────────────────────────────────────");
    console.log("  Skipped (no known_answer fixtures)");
    return { passed: true, manifest };
  }

  console.log("\n─── Fixture Verification ─────────────────────────────────────");
  console.log(`  Executing ${manifest.slug} with known_answer input...`);

  const { output, error } = await executeCapability(manifest.slug, input);

  if (error) {
    console.log(`  ⚠ Could not verify fixtures — ${error}`);
    if (flags.strict) {
      console.log("  ✗ --strict mode: aborting onboarding");
      return { passed: false, manifest };
    }
    console.log("  Continuing without verification (transient failure)");
    return { passed: true, manifest };
  }

  console.log(`  Output: ${Object.keys(output).length} fields returned`);

  // Check each expected field
  let allPass = true;
  for (const ef of expectedFields) {
    const check = checkFieldAssertion(output, ef);
    const icon = check.pass ? "✓" : "✗";
    const detail = ef.operator === "not_null"
      ? `${ef.field}: not_null`
      : `${ef.field}: ${ef.operator} ${JSON.stringify(ef.value)}`;
    const actual = check.pass ? "" : ` (actual: ${JSON.stringify(check.actual)})`;
    console.log(`    ${icon} ${detail}${actual}`);
    if (!check.pass) allPass = false;
  }

  if (allPass) {
    console.log("  ✓ known_answer verified against live output");
    return { passed: true, manifest };
  }

  // Mismatches detected
  const mismatches = analyzeFixtureMismatches(expectedFields, output);
  const autoFixes = mismatches.filter((m) => m.fix_type === "auto");
  const suggestions = mismatches.filter((m) => m.fix_type === "suggest");

  if (autoFixes.length > 0) {
    console.log(`\n  Auto-correctable (${autoFixes.length}):`);
    for (const m of autoFixes) {
      console.log(`    → ${m.suggested_fix}`);
    }
  }

  if (suggestions.length > 0) {
    console.log(`\n  Manual review needed (${suggestions.length}):`);
    for (const m of suggestions) {
      console.log(`    ? ${m.suggested_fix}`);
    }
  }

  // Apply auto-fixes if --fix
  if (flags.fix && autoFixes.length > 0) {
    console.log("\n  Applying auto-corrections...");
    let updated = manifest;
    for (const m of autoFixes) {
      if (m.corrected_expected) {
        updated = applyFixToManifest(updated, m);
      }
    }

    // Write corrected manifest back to disk
    writeManifest(manifestPath, updated);
    console.log(`  ✓ Manifest updated: ${manifestPath}`);

    // Re-verify
    const expectedNow = updated.test_fixtures?.known_answer?.expected_fields ?? [];
    let repass = true;
    for (const ef of expectedNow) {
      const check = checkFieldAssertion(output, ef);
      if (!check.pass) repass = false;
    }

    if (repass) {
      console.log("  ✓ Re-verification passed after auto-correction");
      return { passed: true, manifest: updated };
    } else {
      console.log("  ⚠ Some assertions still fail after auto-correction");
    }
  }

  if (flags.strict) {
    console.log("  ✗ --strict mode: aborting onboarding due to fixture mismatches");
    return { passed: false, manifest };
  }

  console.log("  ⚠ Continuing with mismatched fixtures (test will fail until corrected)");
  return { passed: true, manifest };
}

// ─── Discover step ──────────────────────────────────────────────────────────

async function discoverFixtures(
  manifest: Manifest,
  manifestPath: string,
): Promise<Manifest> {
  const input = manifest.test_fixtures?.health_check_input
    ?? manifest.test_fixtures?.known_answer?.input;

  if (!input) {
    console.log("  ✗ Cannot discover: no health_check_input or known_answer.input");
    return manifest;
  }

  console.log("\n─── Fixture Discovery ───────────────────────────────────────");
  console.log(`  Executing ${manifest.slug} with discovery input...`);

  const { output, error } = await executeCapability(manifest.slug, input);

  if (error) {
    console.log(`  ✗ Cannot discover — execution failed: ${error}`);
    return manifest;
  }

  console.log(`  Output: ${Object.keys(output).length} fields`);
  for (const [k, v] of Object.entries(output)) {
    const display = typeof v === "string" && v.length > 50 ? v.slice(0, 50) + "..." : JSON.stringify(v);
    console.log(`    ${k}: ${display}`);
  }

  // Generate expected_fields
  const looseAssertions = isAiCapability(manifest);
  const expectedFields = generateExpectedFields(output, looseAssertions);
  console.log(`\n  Generated ${expectedFields.length} expected_fields${looseAssertions ? " (loose — AI capability)" : ""}`);

  // Generate field reliability
  const fieldReliability = generateFieldReliability(output);
  console.log(`  Generated ${Object.keys(fieldReliability).length} field reliability entries`);

  // Merge discovered data into manifest
  if (!manifest.test_fixtures) {
    manifest.test_fixtures = {} as any;
  }
  if (!manifest.test_fixtures.known_answer) {
    manifest.test_fixtures.known_answer = {
      input: input,
      expected_fields: [],
    };
  }
  manifest.test_fixtures.known_answer.input = input;
  manifest.test_fixtures.known_answer.expected_fields = expectedFields;

  // Merge field reliability (keep existing entries, add new ones)
  if (!manifest.output_field_reliability) {
    manifest.output_field_reliability = {};
  }
  for (const [field, level] of Object.entries(fieldReliability)) {
    if (!manifest.output_field_reliability[field]) {
      manifest.output_field_reliability[field] = level;
    }
  }

  // Write updated manifest
  writeManifest(manifestPath, manifest);
  console.log(`  ✓ Manifest updated: ${manifestPath}`);
  console.log("  Review generated expected_fields and adjust reliability levels as needed.");

  return manifest;
}

// ─── Manifest file helpers ──────────────────────────────────────────────────

function applyFixToManifest(manifest: Manifest, fix: FixtureMismatch): Manifest {
  if (!fix.corrected_expected || !manifest.test_fixtures?.known_answer?.expected_fields) {
    return manifest;
  }

  const fields = manifest.test_fixtures.known_answer.expected_fields;
  const idx = fields.findIndex((f) => f.field === fix.field);
  if (idx >= 0) {
    fields[idx] = fix.corrected_expected;
  }

  return manifest;
}

function writeManifest(manifestPath: string, manifest: Manifest): void {
  const yamlStr = yaml.dump(manifest, {
    lineWidth: 120,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });
  writeFileSync(manifestPath, yamlStr, "utf-8");
}

// ─── Onboard ─────────────────────────────────────────────────────────────────

async function onboard(
  manifest: Manifest,
  dryRun: boolean,
  flags: { strict: boolean; fix: boolean; discover: boolean },
  manifestPath: string,
): Promise<void> {
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

  // Discover fixtures from live execution (Enhancement 3)
  if (flags.discover) {
    manifest = await discoverFixtures(manifest, manifestPath);
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

  // Execute-and-verify (Enhancement 1) — skip in dry-run
  if (!dryRun) {
    const { passed, manifest: updated } = await verifyFixtures(manifest, flags, manifestPath);
    manifest = updated;
    if (!passed) {
      process.exit(1);
    }
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
  if (knownAnswer?.expected_fields?.length) {
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

// ─── Backfill existing capability ────────────────────────────────────────────

async function backfill(
  manifest: Manifest,
  dryRun: boolean,
  flags: { strict: boolean; fix: boolean; discover: boolean },
  manifestPath: string,
): Promise<void> {
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

  // Discover fixtures from live execution (Enhancement 3)
  if (flags.discover) {
    manifest = await discoverFixtures(manifest, manifestPath);
  }

  // Execute-and-verify (Enhancement 1)
  if (!dryRun) {
    const { passed, manifest: updated } = await verifyFixtures(manifest, flags, manifestPath);
    manifest = updated;
    if (!passed) {
      process.exit(1);
    }
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

  // Check if known_answer needs updating (e.g., after --discover or --fix)
  const hasKnownAnswerUpdate = flags.discover || flags.fix;
  const existingKnownAnswer = existingTypes.has("known_answer");

  // Field reliability
  const fields = Object.entries(manifest.output_field_reliability);
  console.log(`  Field reliability:   ${fields.length} fields`);

  // Limitations
  const limCount = manifest.limitations?.length ?? 0;
  console.log(`  Limitations:         ${limCount}`);

  if (missing.length === 0 && fields.length === 0 && !hasKnownAnswerUpdate) {
    console.log("  Nothing to backfill.");
    return;
  }

  if (dryRun) {
    if (missing.length > 0) {
      console.log("\n  Would add test suites:");
      for (const s of missing) console.log(`    + ${s.testType}: ${s.testName}`);
    }
    if (hasKnownAnswerUpdate && existingKnownAnswer) {
      console.log("  Would update known_answer test suite with corrected fixtures.");
    }
    console.log("\n  [DRY RUN] No changes made.");
    return;
  }

  // Insert missing test suites
  for (const ts of missing) {
    await db.insert(testSuites).values(ts);
    console.log(`  + Added ${ts.testType}: ${ts.testName}`);
  }

  // Update existing known_answer if fixtures were corrected
  if (hasKnownAnswerUpdate && existingKnownAnswer) {
    const knownAnswerSuite = allSuites.find((s) => s.testType === "known_answer");
    if (knownAnswerSuite) {
      await db
        .update(testSuites)
        .set({
          input: knownAnswerSuite.input as any,
          validationRules: knownAnswerSuite.validationRules as any,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(testSuites.capabilitySlug, manifest.slug),
            eq(testSuites.testType, "known_answer"),
          ),
        );
      console.log(`  ✓ Updated known_answer test suite with corrected fixtures`);
    }
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
  const strict = args.includes("--strict");
  const fix = args.includes("--fix");
  const discover = args.includes("--discover");

  if (manifestIdx === -1 || !args[manifestIdx + 1]) {
    console.error("Usage: npx tsx scripts/onboard.ts --manifest <path> [--dry-run] [--backfill] [--strict] [--fix] [--discover]");
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
  const errors = validateManifest(manifest, discover);
  if (errors.length > 0) {
    console.error("\nManifest validation failed:");
    for (const e of errors) {
      console.error(`  ✗ ${e}`);
    }
    process.exit(1);
  }
  console.log("Manifest validation: all checks passed");

  const flags = { strict, fix, discover };

  if (isBackfill) {
    await backfill(manifest, dryRun, flags, manifestPath);
  } else {
    await onboard(manifest, dryRun, flags, manifestPath);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
