/**
 * Automated capability onboarding hook.
 * When a new capability is inserted, auto-generates test suites
 * and detects the transparency tag.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, testSuites } from "../db/schema.js";
import { generateTestInput } from "./test-input-generator.js";
import { getExecutor } from "../capabilities/index.js";

/**
 * Call after a capability is inserted or updated in the database.
 * Idempotent — safe to call multiple times for the same slug.
 */
export async function onCapabilityCreated(capabilitySlug: string): Promise<void> {
  const db = getDb();

  const [cap] = await db
    .select()
    .from(capabilities)
    .where(eq(capabilities.slug, capabilitySlug))
    .limit(1);

  if (!cap) return;

  // 1. Generate test suites if none exist
  const existingSuites = await db
    .select({ id: testSuites.id })
    .from(testSuites)
    .where(eq(testSuites.capabilitySlug, capabilitySlug))
    .limit(1);

  if (existingSuites.length === 0) {
    const inputSchema = (cap.inputSchema ?? {}) as Record<string, unknown>;
    const outputSchema = (cap.outputSchema ?? {}) as Record<string, unknown>;

    // Prefer manifest health_check_input > known_answer input > heuristic generation
    const testInput = resolveOnboardingInput(inputSchema, cap.onboardingManifest);
    const outputChecks = getOutputChecks(outputSchema);

    // Schema check test (dry_run — FREE)
    await db.insert(testSuites).values({
      capabilitySlug,
      testName: `${cap.name} — schema check`,
      testType: "schema_check",
      input: testInput,
      validationRules: outputChecks,
      scheduleTier: "B",
      estimatedCostCents: 0, // dry-run, no external calls
    });

    // Error handling test (negative — fails fast, near-free)
    await db.insert(testSuites).values({
      capabilitySlug,
      testName: `${cap.name} — empty input`,
      testType: "negative",
      input: {},
      validationRules: { checks: [] },
      scheduleTier: "B",
      estimatedCostCents: 0,
    });

    console.log(`[onboarding] Created test suites for ${capabilitySlug}`);

    // Validate fixtures against real execution (fire-and-forget).
    // NOTE: getExecutor may return null during seed.ts if the capability file
    // hasn't been imported yet. In that case, validation is skipped — it will
    // happen on the first scheduled test run via the self-heal system.
    validateTestFixtures(capabilitySlug).catch((err) => {
      console.warn(`[onboarding] Fixture validation failed for ${capabilitySlug}: ${err.message}`);
    });
  }

  // 2. Auto-detect transparency tag if not set
  if (!cap.transparencyTag) {
    const tag = detectTransparencyTag(capabilitySlug);
    if (tag) {
      await db
        .update(capabilities)
        .set({ transparencyTag: tag, updatedAt: new Date() })
        .where(eq(capabilities.id, cap.id));
      console.log(`[onboarding] Set transparency tag for ${capabilitySlug}: ${tag}`);
    }
  }

  // 3. Validate metadata completeness (warnings only — does not block creation)
  const metadataWarnings = validateMetadataCompleteness(cap);
  if (metadataWarnings.length > 0) {
    console.log(`[onboarding] Metadata warnings for ${capabilitySlug}:`);
    for (const w of metadataWarnings) {
      const icon = w.severity === "warning" ? "⚠️" : "ℹ️";
      console.log(`  ${icon} ${w.field}: ${w.message}`);
    }
  }
}

// ─── Metadata completeness validation ────────────────────────────────────────

export interface MetadataWarning {
  field: string;
  severity: "warning" | "info";
  message: string;
}

export function validateMetadataCompleteness(
  cap: typeof capabilities.$inferSelect,
): MetadataWarning[] {
  const warnings: MetadataWarning[] = [];

  // 1. Name quality — becomes the <title> tag on strale.dev
  if (!cap.name || cap.name.trim().length === 0) {
    warnings.push({ field: "name", severity: "warning", message: "Missing name — required for SEO page title" });
  } else if (cap.name.length < 5) {
    warnings.push({ field: "name", severity: "warning", message: `Name too short (${cap.name.length} chars) — weak SEO signal` });
  }

  // 2. Description quality — becomes <meta description>
  if (!cap.description || cap.description.trim().length === 0) {
    warnings.push({ field: "description", severity: "warning", message: "Missing description — required for SEO meta description and agent tool selection" });
  } else if (cap.description.length < 50) {
    warnings.push({ field: "description", severity: "warning", message: `Description too short (${cap.description.length} chars) — aim for 50-160 chars for SEO` });
  } else if (cap.description.length > 300) {
    warnings.push({ field: "description", severity: "info", message: `Description long (${cap.description.length} chars) — will be truncated to 155 chars in meta description` });
  }

  // 3. Category — needed for filtering and search
  if (!cap.category || cap.category.trim().length === 0) {
    warnings.push({ field: "category", severity: "warning", message: "Missing category" });
  }

  // 4. Input schema parameter descriptions — affects MCP Scoreboard Schema Completeness score
  const inputSchema = cap.inputSchema as Record<string, any> | null;
  if (inputSchema?.properties) {
    const props = inputSchema.properties as Record<string, any>;
    const propsWithoutDesc = Object.entries(props)
      .filter(([_, prop]) => !prop.description || prop.description.trim().length === 0)
      .map(([key]) => key);
    if (propsWithoutDesc.length > 0) {
      warnings.push({
        field: "inputSchema",
        severity: "warning",
        message: `${propsWithoutDesc.length} parameter(s) missing descriptions: ${propsWithoutDesc.join(", ")} — hurts MCP Scoreboard schema score and agent tool selection`,
      });
    }
  } else {
    warnings.push({ field: "inputSchema", severity: "warning", message: "Missing inputSchema — agents cannot discover parameters" });
  }

  // 5. Output schema — helps agents understand what they'll get back
  const outputSchema = cap.outputSchema as Record<string, any> | null;
  if (!outputSchema?.properties || Object.keys(outputSchema.properties).length === 0) {
    warnings.push({ field: "outputSchema", severity: "info", message: "Missing or empty outputSchema — agents cannot validate responses" });
  }

  // 6. Price — needed for agent cost awareness
  if (cap.priceCents === null || cap.priceCents === undefined) {
    warnings.push({ field: "priceCents", severity: "warning", message: "Missing price" });
  }

  return warnings;
}

// ─── Input generation (shared with generate-tests.ts) ────────────────────────

function getOutputChecks(
  outputSchema: Record<string, unknown>,
): { checks: Array<{ field: string; operator: string }> } {
  const props = (outputSchema as { properties?: Record<string, any> }).properties;
  if (!props) return { checks: [] };
  const keys = Object.keys(props).slice(0, 3);
  return { checks: keys.map((k) => ({ field: k, operator: "not_null" })) };
}

// ─── Input resolution for onboarding ─────────────────────────────────────────

function resolveOnboardingInput(
  inputSchema: Record<string, unknown>,
  onboardingManifest: unknown,
): Record<string, unknown> {
  const manifest = onboardingManifest as Record<string, unknown> | null;
  const testFixtures = (manifest?.test_fixtures ?? null) as Record<string, unknown> | null;

  // 1. Try manifest health_check_input (hand-written, most reliable)
  if (testFixtures?.health_check_input && typeof testFixtures.health_check_input === "object") {
    const hci = testFixtures.health_check_input as Record<string, unknown>;
    if (Object.keys(hci).length > 0) {
      // Merge any missing required fields from heuristics
      const heuristic = generateTestInput(inputSchema);
      const required = (inputSchema as { required?: string[] }).required ?? [];
      for (const field of required) {
        if (!(field in hci) || hci[field] == null) {
          if (field in heuristic) hci[field] = heuristic[field];
        }
      }
      return hci;
    }
  }

  // 2. Try manifest known_answer input
  if (testFixtures?.known_answer) {
    const ka = testFixtures.known_answer as Record<string, unknown>;
    if (ka?.input && typeof ka.input === "object") {
      const kaInput = ka.input as Record<string, unknown>;
      if (Object.keys(kaInput).length > 0) return kaInput;
    }
  }

  // 3. Fall back to heuristic generation
  return generateTestInput(inputSchema);
}

// ─── Post-creation fixture validation ────────────────────────────────────────

/**
 * Validate test fixtures by executing the capability and calibrating assertions
 * against real output. Fire-and-forget — failures are logged but don't block
 * onboarding.
 */
export async function validateTestFixtures(
  capabilitySlug: string,
): Promise<void> {
  const executor = getExecutor(capabilitySlug);
  if (!executor) {
    console.warn(`[onboarding] No executor for ${capabilitySlug} — skipping fixture validation`);
    return;
  }

  const db = getDb();

  // Load field reliability metadata to generate correct assertions
  const [capRow] = await db
    .select({ fieldReliability: capabilities.outputFieldReliability })
    .from(capabilities)
    .where(eq(capabilities.slug, capabilitySlug))
    .limit(1);
  const fieldReliability = (capRow?.fieldReliability ?? {}) as Record<string, string>;

  // Get a non-negative, non-edge_case suite to use as the execution input
  const suites = await db
    .select()
    .from(testSuites)
    .where(
      and(
        eq(testSuites.capabilitySlug, capabilitySlug),
        eq(testSuites.active, true),
      ),
    );

  const calibratable = suites.filter(
    (s) => s.testType !== "negative" && s.testType !== "edge_case" && s.testType !== "piggyback",
  );
  if (calibratable.length === 0) return;

  // Execute with the first calibratable suite's input
  const execInput = calibratable[0].input as Record<string, unknown>;
  let realOutput: Record<string, unknown>;

  try {
    const result = await executor(execInput);
    if (!result?.output || Object.keys(result.output).length === 0) {
      console.warn(`[onboarding] ${capabilitySlug} returned no output — skipping calibration`);
      return;
    }
    realOutput = result.output;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[onboarding] Fixture validation execution failed for ${capabilitySlug}: ${msg}`);
    return;
  }

  // Calibrate assertions for each non-negative suite
  let calibrated = 0;
  for (const suite of calibratable) {
    const calibratedChecks: Array<{ field: string; operator: string; value?: unknown }> = [];

    // Only assert not_null on fields marked 'guaranteed' in output_field_reliability.
    // Fields marked 'common' or 'rare' (or absent from the map) are skipped — they may
    // be null in certain execution paths, causing stale fixture drift (DEC-20260319-D).
    for (const [key, value] of Object.entries(realOutput)) {
      if (value !== null && value !== undefined) {
        const reliability = fieldReliability[key];
        if (reliability === "guaranteed") {
          calibratedChecks.push({ field: key, operator: "not_null" });
        }
      }
    }

    // For known_answer: preserve existing value-based checks that match real output
    if (suite.testType === "known_answer") {
      const existing = (suite.validationRules as { checks?: Array<{ field: string; operator: string; value?: unknown }> })?.checks ?? [];
      for (const check of existing) {
        if (check.operator === "not_null") continue;
        if (check.field in realOutput) {
          if (!calibratedChecks.some((c) => c.field === check.field && c.operator === check.operator)) {
            calibratedChecks.push(check);
          }
        }
      }
    }

    await db
      .update(testSuites)
      .set({
        validationRules: { checks: calibratedChecks },
        baselineOutput: realOutput,
        baselineCapturedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(testSuites.id, suite.id));

    calibrated++;
  }

  console.log(`[onboarding] Validated and calibrated ${calibrated} test fixtures for ${capabilitySlug}`);
}

// ─── Transparency tag detection ──────────────────────────────────────────────

// Known algorithmic capabilities (no AI/LLM involved)
const KNOWN_ALGORITHMIC_PATTERNS = [
  "validate", "lookup", "check", "parse", "convert", "calculate",
  "generate-reference", "detect", "explain", "format", "decode",
  "estimate", "classify",
];

const KNOWN_AI_PATTERNS = [
  "extract", "enrich", "analyze", "summarize", "redact", "translate",
  "search", // some search capabilities use Claude
];

function detectTransparencyTag(slug: string): string | null {
  const lower = slug.toLowerCase();

  // Check for AI patterns first (these override algorithmic)
  for (const pattern of KNOWN_AI_PATTERNS) {
    if (lower.includes(pattern)) return "ai_generated";
  }

  for (const pattern of KNOWN_ALGORITHMIC_PATTERNS) {
    if (lower.includes(pattern)) return "algorithmic";
  }

  // Default to algorithmic — safer assumption
  return "algorithmic";
}
