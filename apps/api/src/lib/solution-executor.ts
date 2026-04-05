/**
 * Shared solution orchestration logic.
 *
 * Extracted from x402-gateway-v2.ts to enable reuse across multiple
 * execution surfaces (x402, POST /v1/solutions/:slug/execute, etc.).
 *
 * Handles: step iteration, parallel group execution via Promise.all,
 * cross-step input mapping, partial failure handling, result aggregation.
 *
 * Input mapping syntax (defined in solution_steps.input_map JSONB):
 *   $input.<field>      — resolves to caller's inputs[<field>]
 *   $steps[N].<field>   — resolves to step N's output[<field>] (0-indexed by execution order)
 *   $all_results        — resolves to an object of ALL prior step outputs keyed by slug
 *   anything else       — passed through as a literal value
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { solutionSteps } from "../db/schema.js";
import { getExecutor } from "../capabilities/index.js";
import { sanitizeFailureReason } from "./sanitize.js";

// ─── Input reference resolution ─────────────────────────────────────────────

const INPUT_REF = /^\$input\.(.+)$/;
const STEP_REF = /^\$steps\[(\d+)\]\.(.+)$/;
const ALL_RESULTS_REF = "$all_results";

/**
 * Resolve a single input_map reference to a concrete value.
 *
 * Patterns:
 *   $input.<field>      → inputs[<field>]
 *   $steps[N].<field>   → completedSteps[N][<field>]
 *   $all_results        → all prior step outputs keyed by slug
 *   anything else       → literal pass-through
 */
export function resolveInputRef(
  sourceExpr: string,
  inputs: Record<string, unknown>,
  completedSteps: Array<Record<string, unknown>>,
  stepResults: Record<string, unknown>,
): unknown {
  // $input.<field>
  const inputMatch = INPUT_REF.exec(sourceExpr);
  if (inputMatch) {
    const field = inputMatch[1];
    if (!(field in inputs)) {
      throw new Error(`Input mapping error: $input.${field} — field '${field}' not found in solution inputs. Available: ${Object.keys(inputs).join(", ") || "(none)"}`);
    }
    return inputs[field];
  }

  // $steps[N].<field>
  const stepMatch = STEP_REF.exec(sourceExpr);
  if (stepMatch) {
    const idx = parseInt(stepMatch[1], 10);
    const field = stepMatch[2];
    if (idx < 0 || idx >= completedSteps.length) {
      throw new Error(`Input mapping error: $steps[${idx}].${field} — step ${idx} has not completed yet (${completedSteps.length} steps completed so far)`);
    }
    const stepOutput = completedSteps[idx];
    return stepOutput?.[field] ?? null;
  }

  // $all_results — aggregate all prior step outputs
  if (sourceExpr === ALL_RESULTS_REF) {
    return { ...stepResults };
  }

  // Literal value — pass through unchanged
  return sourceExpr;
}

export interface SolutionExecutionResult {
  steps: Record<string, unknown>;
  errors: string[];
  latency_ms: number;
  step_count: number;
}

/**
 * Execute a solution's steps with parallel group support and partial failure handling.
 *
 * @param solutionId - UUID of the solution (used to query solution_steps)
 * @param inputs - Caller-provided inputs matching the solution's input_schema
 * @returns Aggregated step results, errors, and timing — or null if no steps configured
 */
export async function executeSolution(
  solutionId: string,
  inputs: Record<string, unknown>,
): Promise<SolutionExecutionResult | null> {
  const db = getDb();
  const steps = await db
    .select({
      capabilitySlug: solutionSteps.capabilitySlug,
      stepOrder: solutionSteps.stepOrder,
      inputMap: solutionSteps.inputMap,
      canParallel: solutionSteps.canParallel,
      parallelGroup: solutionSteps.parallelGroup,
    })
    .from(solutionSteps)
    .where(eq(solutionSteps.solutionId, solutionId))
    .orderBy(solutionSteps.stepOrder);

  if (steps.length === 0) {
    return null;
  }

  const startMs = Date.now();
  const stepResults: Record<string, unknown> = {};
  const stepErrors: string[] = [];
  // Track outputs in execution order for $steps[N] references
  const completedSteps: Array<Record<string, unknown>> = [];

  // Group steps by parallelGroup for concurrent execution
  const groups = new Map<number, typeof steps>();
  for (const step of steps) {
    const group = step.parallelGroup ?? step.stepOrder;
    const list = groups.get(group) ?? [];
    list.push(step);
    groups.set(group, list);
  }

  for (const [, groupSteps] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const executions = groupSteps.map(async (step) => {
      const executor = getExecutor(step.capabilitySlug);
      if (!executor) {
        stepErrors.push(`${step.capabilitySlug}: executor unavailable`);
        return;
      }

      // Map solution inputs to step inputs using seed-data syntax
      const stepInput: Record<string, unknown> = {};
      const inputMap = step.inputMap as Record<string, string>;
      for (const [stepField, sourceExpr] of Object.entries(inputMap)) {
        stepInput[stepField] = resolveInputRef(sourceExpr, inputs, completedSteps, stepResults);
      }

      try {
        const result = await executor(stepInput);
        const output = result.output as Record<string, unknown>;
        stepResults[step.capabilitySlug] = output;
        completedSteps.push(output);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stepErrors.push(`${step.capabilitySlug}: ${msg.slice(0, 200)}`);
        stepResults[step.capabilitySlug] = { error: sanitizeFailureReason(msg) };
      }
    });

    await Promise.all(executions);
  }

  const latencyMs = Date.now() - startMs;

  return {
    steps: stepResults,
    errors: stepErrors,
    latency_ms: latencyMs,
    step_count: steps.length,
  };
}
