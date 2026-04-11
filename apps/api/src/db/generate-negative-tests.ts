import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { capabilities, testSuites } from "./schema.js";
import { eq, and } from "drizzle-orm";
import { assignTier } from "../lib/test-generation.js";

// ─── Validation helpers ─────────────────────────────────────────────────────

function checks(
  ...c: Array<{ field: string; operator: string; value?: unknown }>
) {
  return { checks: c };
}

// ─── Negative test input generation ─────────────────────────────────────────
// Goal: send invalid/missing required inputs. Test PASSES if the capability
// returns a structured error (not a crash).

function generateNegativeInput(
  inputSchema: Record<string, unknown>,
): Record<string, unknown> {
  // Send completely empty input — all required fields missing
  return {};
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function generate() {
  const db = getDb();

  const allCaps = await db
    .select()
    .from(capabilities)
    .where(eq(capabilities.isActive, true));

  console.log(`Found ${allCaps.length} active capabilities.`);

  const existing = await db
    .select({ capabilitySlug: testSuites.capabilitySlug })
    .from(testSuites)
    .where(and(eq(testSuites.testType, "negative"), eq(testSuites.active, true)));

  const hasNeg = new Set(existing.map((s) => s.capabilitySlug));
  console.log(`${hasNeg.size} capabilities already have negative tests.`);

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const cap of allCaps) {
    if (hasNeg.has(cap.slug)) {
      skipped++;
      continue;
    }

    const inputSchema = (cap.inputSchema ?? {}) as Record<string, unknown>;
    const testInput = generateNegativeInput(inputSchema);

    try {
      await db.insert(testSuites).values({
        capabilitySlug: cap.slug,
        testName: `${cap.name} — negative (missing required input)`,
        testType: "negative",
        input: testInput,
        expectedOutput: null,
        validationRules: checks(), // pass = structured error, not crash
        scheduleTier: assignTier(cap.transparencyTag, cap.maintenanceClass),
        estimatedCostCents: 0,
      });

      created++;
      console.log(`  + ${cap.slug}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${cap.slug}: ${msg}`);
      console.error(`  ! ${cap.slug}: ${msg}`);
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Done.`);
  console.log(`  Created: ${created} negative tests`);
  console.log(`  Skipped: ${skipped} (already had negative)`);
  console.log(`  Errors:  ${errors.length}`);

  if (errors.length > 0) {
    console.log(`\nErrors:`);
    for (const e of errors) console.log(`  - ${e}`);
  }

  process.exit(0);
}

generate().catch((err) => {
  console.error("Generate failed:", err);
  process.exit(1);
});
