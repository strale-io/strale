import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { capabilities, testSuites } from "./schema.js";
import { eq } from "drizzle-orm";
import { generateTestInput } from "../lib/test-input-generator.js";

// ─── Helpers (same patterns as seed-tests.ts) ──────────────────────────────

function checks(
  ...c: Array<{
    field: string;
    operator: string;
    value?: unknown;
    values?: unknown[];
  }>
) {
  return { checks: c };
}

function notNull(field: string) {
  return { field, operator: "not_null" };
}

// ─── Extract expected output keys for schema_check ─────────────────────────

function getOutputChecks(
  outputSchema: Record<string, unknown>,
): ReturnType<typeof checks> {
  const props = (outputSchema as { properties?: Record<string, any> })
    .properties;
  if (!props) return checks();

  // Pick up to 3 top-level keys to check for not_null
  const keys = Object.keys(props).slice(0, 3);
  return checks(...keys.map((k) => notNull(k)));
}

// ─── Cost estimation by transparency tag ───────────────────────────────────

function estimateCostCents(
  _priceCents: number,
  _transparencyTag: string | null,
): number {
  // schema_check tests now use dry-run mode — no external API calls, zero cost
  return 0;
}

// ─── Schedule tier by cost ─────────────────────────────────────────────────

function assignTier(transparencyTag: string | null): string {
  // Algorithmic caps are cheap — test more frequently
  if (transparencyTag === "algorithmic") return "B";
  // AI/mixed caps cost money — daily is fine
  return "B";
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function generateTests() {
  const db = getDb();

  // Get all active capabilities
  const allCaps = await db
    .select()
    .from(capabilities)
    .where(eq(capabilities.isActive, true));

  console.log(`Found ${allCaps.length} active capabilities.`);

  // Get existing test suites to determine which capabilities already have tests
  const existingSuites = await db
    .select({ capabilitySlug: testSuites.capabilitySlug })
    .from(testSuites);

  const existingSlugs = new Set(existingSuites.map((s) => s.capabilitySlug));
  console.log(`${existingSlugs.size} capabilities already have tests.`);

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const cap of allCaps) {
    if (existingSlugs.has(cap.slug)) {
      skipped++;
      continue;
    }

    const inputSchema = (cap.inputSchema ?? {}) as Record<string, unknown>;
    const outputSchema = (cap.outputSchema ?? {}) as Record<string, unknown>;

    const testInput = generateTestInput(inputSchema);
    const outputChecks = getOutputChecks(outputSchema);
    const tier = assignTier(cap.transparencyTag);
    const costCents = estimateCostCents(cap.priceCents, cap.transparencyTag);

    try {
      // Tier 1: Schema validation test (call with reasonable input, check output keys)
      await db.insert(testSuites).values({
        capabilitySlug: cap.slug,
        testName: `${cap.name} — schema check`,
        testType: "schema_check",
        input: testInput,
        expectedOutput: null,
        validationRules: outputChecks,
        scheduleTier: tier,
        estimatedCostCents: costCents,
      });

      // Tier 2: Error handling test (call with empty input, verify structured error)
      await db.insert(testSuites).values({
        capabilitySlug: cap.slug,
        testName: `${cap.name} — empty input`,
        testType: "negative",
        input: {},
        expectedOutput: null,
        validationRules: checks(),
        scheduleTier: tier,
        estimatedCostCents: 0, // Negative tests should fail fast, no external cost
      });

      created++;
      const inputPreview = JSON.stringify(testInput).slice(0, 80);
      const checksCount = outputChecks.checks.length;
      console.log(
        `  + ${cap.slug} (${checksCount} checks, input: ${inputPreview}${inputPreview.length >= 80 ? "..." : ""})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${cap.slug}: ${msg}`);
      console.error(`  ! ${cap.slug}: ${msg}`);
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Done.`);
  console.log(`  Created: ${created} capabilities × 2 tests = ${created * 2} test suites`);
  console.log(`  Skipped: ${skipped} (already had tests)`);
  console.log(`  Errors:  ${errors.length}`);
  console.log(`  Total capabilities: ${allCaps.length}`);

  if (errors.length > 0) {
    console.log(`\nErrors:`);
    for (const e of errors) console.log(`  - ${e}`);
  }

  process.exit(0);
}

generateTests().catch((err) => {
  console.error("Generate failed:", err);
  process.exit(1);
});
