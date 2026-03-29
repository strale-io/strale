/**
 * Automated capability onboarding hook.
 * When a new capability is inserted, auto-generates test suites
 * and detects the transparency tag.
 */

import { eq, and, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, solutions, solutionSteps, testSuites } from "../db/schema.js";
import { generateTestInput } from "./test-input-generator.js";
import { getExecutor } from "../capabilities/index.js";
import { classifyFieldVolatility, makeVolatilityAwareCheck } from "./field-volatility.js";
import { getOutputChecks } from "./test-generation.js";
import { checkReadiness, clearReadinessCache } from "./capability-readiness.js";

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

    // Gather baseline outputs + existing reliability metadata for smarter assertions
    const existingBaselines = await db
      .select({ baselineOutput: testSuites.baselineOutput })
      .from(testSuites)
      .where(
        and(
          eq(testSuites.capabilitySlug, capabilitySlug),
          isNotNull(testSuites.baselineOutput),
        ),
      );
    const baselineOutputs = existingBaselines
      .map((b) => b.baselineOutput as Record<string, unknown>)
      .filter(Boolean);
    const existingReliability = (cap.outputFieldReliability ?? null) as Record<string, string> | null;

    const outputChecks = getOutputChecks(outputSchema, {
      existingReliability,
      baselineOutputs,
    });

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

    // For algorithmic capabilities: generate a regression known_answer test
    // by executing the capability once and capturing the output as ground truth.
    // Algorithmic caps are free to test — no external cost — so this is safe.
    if (cap.transparencyTag === "algorithmic") {
      await generateAlgorithmicRegressionTest(cap, testInput).catch((err) => {
        console.warn(`[onboarding] Regression test generation failed for ${capabilitySlug}: ${err.message}`);
      });
    }

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

  // 4. Readiness gate — single source of truth for onboarding completeness
  clearReadinessCache();
  const readiness = await checkReadiness(capabilitySlug);
  if (!readiness.ready) {
    console.warn(`[onboarding] ${capabilitySlug} is NOT fully onboarded. Issues:`);
    for (const issue of readiness.issues) {
      console.warn(`  - ${issue}`);
    }
  } else {
    console.log(`[onboarding] ${capabilitySlug} is fully onboarded`);
  }

  // 5. Visibility gate — verify capability is externally visible
  // Catches silent exclusion issues like visible=false that leave
  // a capability internally healthy but invisible to users for days.
  await verifyCapabilityVisibility(capabilitySlug);
}

// ─── Visibility verification ────────────────────────────────────────────────

/**
 * Verify that a capability will appear in /v1/capabilities.
 * Called as the final step of onCapabilityCreated.
 *
 * Does NOT throw — logs a warning so onboarding isn't rolled back.
 * The capability exists and will work; it just isn't visible to users yet.
 */
async function verifyCapabilityVisibility(slug: string): Promise<void> {
  const db = getDb();

  const [cap] = await db
    .select({
      isActive: capabilities.isActive,
      visible: capabilities.visible,
      lifecycleState: capabilities.lifecycleState,
      dataSource: capabilities.dataSource,
    })
    .from(capabilities)
    .where(eq(capabilities.slug, slug))
    .limit(1);

  if (!cap) {
    console.warn(`[onboarding] Visibility check: '${slug}' not found in DB`);
    return;
  }

  const issues: string[] = [];

  if (!cap.isActive) {
    issues.push("is_active = false — set to true to make it executable");
  }
  if (!cap.visible) {
    issues.push("visible = false — set to true to appear in /v1/capabilities");
  }
  if (cap.lifecycleState !== "active" && cap.lifecycleState !== "degraded") {
    issues.push(`lifecycle_state = '${cap.lifecycleState}' — must be 'active' or 'degraded'`);
  }
  if (!cap.dataSource) {
    issues.push("data_source = NULL — set to describe where this capability gets its data");
  }

  if (issues.length > 0) {
    console.warn(
      `[onboarding] VISIBILITY WARNING: '${slug}' is onboarded but NOT visible to users.\n` +
        `  Issues:\n` +
        issues.map((i) => `  - ${i}`).join("\n") + "\n" +
        `  Fix: UPDATE capabilities SET visible = true, is_active = true, lifecycle_state = 'active' WHERE slug = '${slug}';`,
    );
  } else {
    console.log(`[onboarding] Visibility check passed: '${slug}' is active and visible`);
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

  // Load field reliability + manifest metadata for assertion generation
  const [capRow] = await db
    .select({
      fieldReliability: capabilities.outputFieldReliability,
      onboardingManifest: capabilities.onboardingManifest,
    })
    .from(capabilities)
    .where(eq(capabilities.slug, capabilitySlug))
    .limit(1);
  const fieldReliability = (capRow?.fieldReliability ?? {}) as Record<string, string>;
  const manifest = capRow?.onboardingManifest as Record<string, unknown> | null;
  const fieldVolatilityOverrides = (manifest?.field_volatility ?? null) as Record<string, "stable" | "volatile" | "computed"> | null;

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

    // For known_answer: preserve existing value-based checks, but apply volatility
    // filtering (DEC-20260319-E). Volatile fields (revenue, counts, rates) get type
    // checks instead of equals. Computed fields (is_sanctioned, risk_score) also get
    // type checks since their values change with external data updates.
    if (suite.testType === "known_answer") {
      const existing = (suite.validationRules as { checks?: Array<{ field: string; operator: string; value?: unknown }> })?.checks ?? [];
      for (const check of existing) {
        if (check.operator === "not_null") continue;
        if (!(check.field in realOutput)) continue;
        if (calibratedChecks.some((c) => c.field === check.field && c.operator === check.operator)) continue;

        const volatility = classifyFieldVolatility(check.field, realOutput[check.field], fieldVolatilityOverrides);
        if (volatility === "stable") {
          calibratedChecks.push(check);
        } else {
          // Replace equals with type check for volatile/computed fields
          const typeCheck = makeVolatilityAwareCheck(check.field, realOutput[check.field], volatility);
          if (typeCheck && !calibratedChecks.some((c) => c.field === typeCheck.field && c.operator === typeCheck.operator)) {
            calibratedChecks.push(typeCheck);
          }
        }
      }
    }

    // If this is an auto-generated test with unverified ground truth,
    // verify it now — the first successful execution after generation
    // confirms the ground truth is still valid.
    const shouldVerify =
      suite.generationCapabilityUpdatedAt !== null &&
      suite.groundTruthVerifiedAt === null;

    await db
      .update(testSuites)
      .set({
        validationRules: { checks: calibratedChecks },
        baselineOutput: realOutput,
        baselineCapturedAt: new Date(),
        ...(shouldVerify ? { groundTruthVerifiedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(testSuites.id, suite.id));

    if (shouldVerify) {
      console.log(
        `[onboarding] Ground truth verified for ${capabilitySlug} ` +
          `test "${suite.testName}" — first clean run after generation`,
      );
    }

    calibrated++;
  }

  console.log(`[onboarding] Validated and calibrated ${calibrated} test fixtures for ${capabilitySlug}`);
}

// ─── Algorithmic regression test generation ──────────────────────────────────

/**
 * For algorithmic capabilities: execute with the onboarding input, capture the
 * actual output, and create a known_answer test that asserts the output shape
 * and key boolean fields. This catches regressions in pure-logic capabilities
 * that have zero external cost to test.
 */
async function generateAlgorithmicRegressionTest(
  cap: typeof capabilities.$inferSelect,
  testInput: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  const executor = getExecutor(cap.slug);

  if (!executor) {
    console.warn(`[onboarding] No executor for ${cap.slug} — skipping regression test`);
    return;
  }

  let result: Awaited<ReturnType<typeof executor>> | null = null;
  try {
    result = await executor(testInput);
  } catch (err) {
    console.warn(
      `[onboarding] Regression test execution failed for ${cap.slug}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  if (!result?.output || typeof result.output !== "object") {
    console.warn(`[onboarding] No usable output for ${cap.slug} — skipping regression test`);
    return;
  }

  // Record the capability's current updated_at as generation metadata.
  // This enables temporal contamination detection: if the capability is
  // modified after this timestamp, the ground truth may no longer be valid.
  const [capRow] = await db
    .select({ updatedAt: capabilities.updatedAt })
    .from(capabilities)
    .where(eq(capabilities.slug, cap.slug))
    .limit(1);
  const capabilityUpdatedAt = capRow?.updatedAt ?? new Date();

  const output = result.output as Record<string, unknown>;
  const outputFields = Object.keys(output);

  // Build validation rules: assert top-level output fields are not null
  const validationChecks: Array<{ field: string; operator: string }> = outputFields
    .slice(0, 6)
    .map((field) => ({ field, operator: "not_null" }));

  // Capture exact values for key discriminating boolean fields
  // (fields named 'valid', 'is_*', 'has_*' are worth asserting exact values)
  const exactChecks = outputFields
    .filter((f) => /^(valid|is_|has_|error)/.test(f) && typeof output[f] === "boolean")
    .map((f) => ({ field: f, operator: output[f] ? "is_true" : "is_false" }));

  if (exactChecks.length > 0) {
    validationChecks.push(...exactChecks);
  }

  await db.insert(testSuites).values({
    capabilitySlug: cap.slug,
    testName: `${cap.name} — regression (auto-generated)`,
    testType: "known_answer",
    input: testInput,
    expectedOutput: output,
    validationRules: { checks: validationChecks },
    scheduleTier: "A",
    estimatedCostCents: 0,
    generationCapabilityUpdatedAt: capabilityUpdatedAt,
    groundTruthVerifiedAt: null, // unverified until a clean run confirms it
  });

  console.log(
    `[onboarding] Created regression test for ${cap.slug} with ${validationChecks.length} checks`,
  );
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

// ─── Capability deactivation lifecycle ──────────────────────────────────────

/**
 * Call when a capability is deactivated (is_active set to false).
 * Propagates deactivation to any solutions that depend on this capability.
 *
 * Deactivation cascade logic:
 * - Find all active solutions that have a step referencing this slug
 * - Set those solutions to is_active = false
 * - Log each deactivation with the reason
 *
 * This is intentionally conservative: it deactivates rather than auto-repairs,
 * because fixing a broken solution requires human judgment about replacement.
 *
 * IMPORTANT: This hook must be called any time a capability is deactivated.
 * As of 2026-03-25, no code path in the codebase sets capabilities.isActive = false
 * programmatically — deactivation only happens via direct DB queries. When an admin
 * endpoint or CLI command is added for capability deactivation, it MUST call this
 * hook. Search for: capabilities.isActive = false, set({ isActive: false })
 */
export async function onCapabilityDeactivated(
  capabilitySlug: string,
  reason?: string,
): Promise<{ deactivatedSolutions: string[] }> {
  const db = getDb();
  const deactivatedSolutions: string[] = [];

  // Find all active solutions that include this capability as a step
  const affectedSolutions = await db.execute(sql`
    SELECT DISTINCT s.slug, s.id, s.name
    FROM solutions s
    INNER JOIN solution_steps ss ON ss.solution_id = s.id
    WHERE ss.capability_slug = ${capabilitySlug}
      AND s.is_active = true
  `);

  const rows = (Array.isArray(affectedSolutions)
    ? affectedSolutions
    : (affectedSolutions as any)?.rows ?? []) as Array<{
    slug: string;
    id: string;
    name: string;
  }>;

  if (rows.length === 0) {
    console.log(
      `[capability-lifecycle] Deactivating ${capabilitySlug} — no active solutions affected`,
    );
    return { deactivatedSolutions: [] };
  }

  for (const sol of rows) {
    await db
      .update(solutions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(solutions.id, sol.id));

    deactivatedSolutions.push(sol.slug);

    console.warn(
      `[capability-lifecycle] Deactivated solution '${sol.slug}' (${sol.name}) ` +
        `because capability '${capabilitySlug}' was deactivated` +
        (reason ? ` — reason: ${reason}` : ""),
    );
  }

  console.warn(
    `[capability-lifecycle] Capability '${capabilitySlug}' deactivated. ` +
      `${deactivatedSolutions.length} solution(s) also deactivated: ${deactivatedSolutions.join(", ")}`,
  );

  return { deactivatedSolutions };
}

/**
 * Call when a capability is reactivated (is_active set back to true).
 * Checks whether any solutions that were deactivated due to this capability
 * can now be safely reactivated (all their steps are now active).
 */
export async function onCapabilityReactivated(
  capabilitySlug: string,
): Promise<{ reactivatedSolutions: string[] }> {
  const db = getDb();
  const reactivatedSolutions: string[] = [];

  // Find inactive solutions that reference this capability
  const candidateSolutions = await db.execute(sql`
    SELECT DISTINCT s.slug, s.id, s.name
    FROM solutions s
    INNER JOIN solution_steps ss ON ss.solution_id = s.id
    WHERE ss.capability_slug = ${capabilitySlug}
      AND s.is_active = false
  `);

  const rows = (Array.isArray(candidateSolutions)
    ? candidateSolutions
    : (candidateSolutions as any)?.rows ?? []) as Array<{
    slug: string;
    id: string;
    name: string;
  }>;

  for (const sol of rows) {
    // Check if ALL steps of this solution now have active capabilities
    const allStepsActive = await db.execute(sql`
      SELECT COUNT(*) FILTER (WHERE c.is_active = false OR c.slug IS NULL)::text AS inactive_count
      FROM solution_steps ss
      LEFT JOIN capabilities c ON c.slug = ss.capability_slug
      WHERE ss.solution_id = ${sol.id}
    `);

    const checkRows = (Array.isArray(allStepsActive)
      ? allStepsActive
      : (allStepsActive as any)?.rows ?? []) as Array<{ inactive_count: string }>;

    const inactiveCount = parseInt(checkRows[0]?.inactive_count ?? "1", 10);

    if (inactiveCount === 0) {
      await db
        .update(solutions)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(solutions.id, sol.id));

      reactivatedSolutions.push(sol.slug);
      console.log(
        `[capability-lifecycle] Reactivated solution '${sol.slug}' — all steps now active`,
      );
    }
  }

  return { reactivatedSolutions };
}
