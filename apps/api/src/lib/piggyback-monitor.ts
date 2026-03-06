/**
 * Piggyback monitoring — validates output from real /v1/do traffic
 * and records it as a test data point. Zero cost since we're just
 * validating output we already have from a customer call.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { testSuites, testResults } from "../db/schema.js";

/**
 * Record a piggyback test result from a real customer execution.
 * Fire-and-forget — never blocks the response.
 */
export async function recordPiggybackResult(
  capabilitySlug: string,
  output: unknown,
  outputSchema: Record<string, unknown>,
  responseTimeMs: number,
): Promise<void> {
  const db = getDb();

  // Get or create the piggyback test suite for this capability
  const suiteId = await getOrCreatePiggybackSuite(capabilitySlug);

  // Validate output against schema
  const schemaValid = validateOutputAgainstSchema(output, outputSchema);

  await db.insert(testResults).values({
    testSuiteId: suiteId,
    capabilitySlug,
    passed: schemaValid,
    actualOutput: output as Record<string, unknown>,
    failureReason: schemaValid ? null : "Output does not match output_schema",
    responseTimeMs: Math.min(responseTimeMs, 30_000),
  });
}

// ─── Internal helpers ────────────────────────────────────────────────────────

// In-memory cache of piggyback suite IDs
const piggybackSuiteCache = new Map<string, string>();

async function getOrCreatePiggybackSuite(capabilitySlug: string): Promise<string> {
  const cached = piggybackSuiteCache.get(capabilitySlug);
  if (cached) return cached;

  const db = getDb();

  // Look for existing piggyback suite
  const [existing] = await db
    .select({ id: testSuites.id })
    .from(testSuites)
    .where(
      and(
        eq(testSuites.capabilitySlug, capabilitySlug),
        eq(testSuites.testType, "piggyback"),
      ),
    )
    .limit(1);

  if (existing) {
    piggybackSuiteCache.set(capabilitySlug, existing.id);
    return existing.id;
  }

  // Create new piggyback suite
  const [created] = await db
    .insert(testSuites)
    .values({
      capabilitySlug,
      testName: `${capabilitySlug} — piggyback monitor`,
      testType: "piggyback",
      input: {},
      validationRules: { checks: [] },
      scheduleTier: "A", // irrelevant — runs on customer traffic, not schedule
      estimatedCostCents: 0,
    })
    .returning({ id: testSuites.id });

  piggybackSuiteCache.set(capabilitySlug, created.id);
  return created.id;
}

function validateOutputAgainstSchema(
  output: unknown,
  schema: Record<string, unknown>,
): boolean {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return schema.type !== "object";
  }

  const outputObj = output as Record<string, unknown>;
  const required = (schema as { required?: string[] }).required ?? [];

  for (const field of required) {
    if (!(field in outputObj) || outputObj[field] == null) {
      return false;
    }
  }

  return true;
}
