/**
 * Gate 4b — Solution Dry-Run Composition Check (DEC-20260409-D Layer B)
 *
 * Runs the full solution step chain with mock outputs generated from each
 * capability's output_schema. Catches composition failures where step N's
 * output doesn't satisfy step N+1's input mapping without spending money
 * on real API calls.
 *
 * Mock generation: for each capability, generates a placeholder output
 * from its output_schema (string fields get "mock_value", numbers get 1,
 * booleans get true, etc.). This is sufficient to verify that input mapping
 * references ($steps[N].field) resolve to non-null values.
 */

import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, solutions, solutionSteps } from "../db/schema.js";
import { resolveInputRef } from "./solution-executor.js";

export interface CompositionFailure {
  stepIndex: number;
  stepSlug: string;
  type: "MISSING_FIELD" | "MAPPING_ERROR" | "DRY_RUN_UNSUPPORTED";
  field: string;
  detail: string;
}

export interface StepDryRunResult {
  slug: string;
  stepOrder: number;
  mockOutput: Record<string, unknown> | null;
  inputMappingResult: Record<string, unknown> | null;
  failures: CompositionFailure[];
  skipped: boolean;
  skipReason?: string;
}

export interface Gate4bResult {
  solutionSlug: string;
  passed: boolean;
  steps: StepDryRunResult[];
  compositionFailures: CompositionFailure[];
}

/**
 * Generate a mock output object from a JSON Schema.
 * Prefers the schema's `example` field when available (preserves nested
 * object structure). Falls back to placeholder values for type checking.
 */
function generateMockFromSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  const example = schema.example as Record<string, unknown> | undefined;

  // Start with the example (preserves nested structures), then fill in
  // any properties that exist in the schema but are missing from the example.
  const mock: Record<string, unknown> = {};
  if (example && typeof example === "object" && !Array.isArray(example)) {
    // Copy non-null example values. Null values in examples mean "field exists
    // but wasn't populated in this example" — we'll generate a mock value below.
    for (const [k, v] of Object.entries(example)) {
      if (v !== null && v !== undefined) mock[k] = v;
    }
  }
  if (!properties) return mock;

  for (const [field, propSchema] of Object.entries(properties)) {
    if (field in mock) continue; // already populated from example
    const type = propSchema.type as string | undefined;
    switch (type) {
      case "string":
        mock[field] = `mock_${field}`;
        break;
      case "number":
      case "integer":
        mock[field] = 1;
        break;
      case "boolean":
        mock[field] = true;
        break;
      case "array":
        mock[field] = [generateMockFromSchema((propSchema.items as Record<string, unknown>) ?? {})];
        break;
      case "object":
        // Use the field-level example if available
        if (propSchema.example && typeof propSchema.example === "object") {
          mock[field] = propSchema.example;
        } else if (propSchema.properties) {
          mock[field] = generateMockFromSchema(propSchema);
        } else {
          mock[field] = { mock_key: `mock_${field}_value` };
        }
        break;
      default:
        mock[field] = `mock_${field}`;
    }
  }
  return mock;
}

/**
 * Run a dry-run composition check for a solution.
 * Threads mock outputs through the step chain using the real input mapping logic.
 */
export async function runSolutionDryRun(solutionSlug: string): Promise<Gate4bResult> {
  const db = getDb();

  // Load solution and its steps
  const [sol] = await db
    .select()
    .from(solutions)
    .where(eq(solutions.slug, solutionSlug))
    .limit(1);

  if (!sol) {
    return {
      solutionSlug,
      passed: false,
      steps: [],
      compositionFailures: [{
        stepIndex: -1,
        stepSlug: "",
        type: "MAPPING_ERROR",
        field: "",
        detail: `Solution '${solutionSlug}' not found`,
      }],
    };
  }

  const steps = await db
    .select()
    .from(solutionSteps)
    .where(eq(solutionSteps.solutionId, sol.id))
    .orderBy(solutionSteps.stepOrder);

  // Load capability output schemas for all step capabilities
  const capSlugs = [...new Set(steps.map((s) => s.capabilitySlug))];
  const capRows = capSlugs.length > 0
    ? await db
        .select({ slug: capabilities.slug, outputSchema: capabilities.outputSchema })
        .from(capabilities)
        // F-0-007: use parameter-bound inArray instead of raw SQL interpolation.
        // An apostrophe in a capability slug would previously break out of
        // the array literal. Drizzle's `inArray` binds each value safely.
        .where(inArray(capabilities.slug, capSlugs))
    : [];

  const outputSchemas = new Map<string, Record<string, unknown>>();
  for (const c of capRows) {
    const schema = typeof c.outputSchema === "string"
      ? JSON.parse(c.outputSchema)
      : c.outputSchema;
    if (schema && typeof schema === "object") {
      outputSchemas.set(c.slug, schema as Record<string, unknown>);
    }
  }

  // Generate mock solution input from the solution's input schema
  const solInputSchema = typeof sol.inputSchema === "string"
    ? JSON.parse(sol.inputSchema)
    : sol.inputSchema;
  const mockSolutionInput = generateMockFromSchema(
    (solInputSchema as Record<string, unknown>) ?? {},
  );

  // Execute step chain with mock outputs
  const completedSteps: Array<Record<string, unknown>> = [];
  const stepResults: Record<string, unknown> = {};
  const allStepResults: StepDryRunResult[] = [];
  const allFailures: CompositionFailure[] = [];

  // Sort steps by stepOrder, handling parallel groups
  const sortedSteps = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);

  for (let i = 0; i < sortedSteps.length; i++) {
    const step = sortedSteps[i];
    const slug = step.capabilitySlug;
    const inputMap = parseInputMap(step.inputMap);

    const stepResult: StepDryRunResult = {
      slug,
      stepOrder: step.stepOrder,
      mockOutput: null,
      inputMappingResult: null,
      failures: [],
      skipped: false,
    };

    // Check if we have an output schema for this capability
    const schema = outputSchemas.get(slug);
    if (!schema) {
      stepResult.skipped = true;
      stepResult.skipReason = `No output schema for '${slug}'`;
      stepResult.failures.push({
        stepIndex: i,
        stepSlug: slug,
        type: "DRY_RUN_UNSUPPORTED",
        field: "",
        detail: `Capability '${slug}' has no output_schema — composition check skipped`,
      });
      // Still push a minimal mock so downstream steps don't fail on missing index
      completedSteps.push({});
      stepResults[slug] = {};
      allStepResults.push(stepResult);
      continue;
    }

    // Resolve input mappings
    const resolvedInput: Record<string, unknown> = {};
    for (const [destField, sourceExpr] of Object.entries(inputMap)) {
      try {
        const value = resolveInputRef(sourceExpr, mockSolutionInput, completedSteps, stepResults);
        resolvedInput[destField] = value;

        if (value === null || value === undefined) {
          // $steps[N].field resolved to null. This is only a composition failure
          // if there's no $input fallback available. The solution executor falls
          // back to $input.field when $steps[N].field is null, so if the field
          // exists in the solution's input schema, it's not a real failure.
          if (sourceExpr.startsWith("$steps[")) {
            const stepRefMatch = /^\$steps\[\d+\]\.(.+)$/.exec(sourceExpr);
            const topField = stepRefMatch ? stepRefMatch[1].split(/[.\[]/)[0] : null;
            const hasInputFallback = topField && topField in mockSolutionInput;
            if (!hasInputFallback) {
              stepResult.failures.push({
                stepIndex: i,
                stepSlug: slug,
                type: "MISSING_FIELD",
                field: destField,
                detail: `${sourceExpr} resolved to null and no $input.${topField} fallback available`,
              });
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stepResult.failures.push({
          stepIndex: i,
          stepSlug: slug,
          type: "MAPPING_ERROR",
          field: destField,
          detail: `${sourceExpr}: ${msg}`,
        });
      }
    }

    stepResult.inputMappingResult = resolvedInput;

    // Generate mock output for this step
    const mockOutput = generateMockFromSchema(schema);
    stepResult.mockOutput = mockOutput;

    completedSteps.push(mockOutput);
    stepResults[slug] = mockOutput;

    allFailures.push(...stepResult.failures);
    allStepResults.push(stepResult);
  }

  // Filter to only real composition failures (not DRY_RUN_UNSUPPORTED warnings)
  const realFailures = allFailures.filter((f) => f.type !== "DRY_RUN_UNSUPPORTED");

  return {
    solutionSlug,
    passed: realFailures.length === 0,
    steps: allStepResults,
    compositionFailures: allFailures,
  };
}

/**
 * Run Gate 4b retrospectively against all active solutions.
 */
export async function retrospectiveSolutionDryRun(): Promise<{
  totalChecked: number;
  passing: number;
  failing: number;
  skipped: number;
  results: Gate4bResult[];
}> {
  const db = getDb();

  const allSolutions = await db
    .select({ slug: solutions.slug, isActive: solutions.isActive })
    .from(solutions)
    .where(eq(solutions.isActive, true));

  let passing = 0;
  let failing = 0;
  let skipped = 0;
  const failingResults: Gate4bResult[] = [];

  for (const sol of allSolutions) {
    const result = await runSolutionDryRun(sol.slug);

    // A solution is "skipped" if all failures are DRY_RUN_UNSUPPORTED
    const realFailures = result.compositionFailures.filter((f) => f.type !== "DRY_RUN_UNSUPPORTED");
    const onlySkips = result.compositionFailures.length > 0 && realFailures.length === 0;

    if (onlySkips) {
      skipped++;
    } else if (result.passed) {
      passing++;
    } else {
      failing++;
      failingResults.push(result);
    }
  }

  return {
    totalChecked: allSolutions.length,
    passing,
    failing,
    skipped,
    results: failingResults,
  };
}

function parseInputMap(raw: unknown): Record<string, string> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      result[k] = typeof v === "string" ? v : String(v);
    }
    return result;
  }
  return {};
}
