/**
 * Shared solution orchestration logic.
 *
 * Extracted from x402-gateway-v2.ts to enable reuse across multiple
 * execution surfaces (x402, POST /v1/solutions/:slug/execute, etc.).
 *
 * Handles: step iteration, parallel group execution via Promise.all,
 * cross-step input mapping, partial failure handling, result aggregation.
 *
 * NOTE: The input mapping logic at sourceExpr.startsWith("steps.") has a
 * known bug — it does not match the seed data format which uses "$steps[0]."
 * and "$input." prefixes. This bug is preserved intentionally in this
 * extraction and will be fixed in a subsequent commit (P1.2).
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { solutionSteps } from "../db/schema.js";
import { getExecutor } from "../capabilities/index.js";
import { sanitizeFailureReason } from "./sanitize.js";

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

      // Map solution inputs to step inputs
      const stepInput: Record<string, unknown> = {};
      const inputMap = step.inputMap as Record<string, string>;
      for (const [stepField, sourceExpr] of Object.entries(inputMap)) {
        // sourceExpr is either a direct field name from solution input
        // or a "steps.<slug>.<field>" reference to a previous step's output
        if (sourceExpr.startsWith("steps.")) {
          const parts = sourceExpr.split(".");
          const refSlug = parts[1];
          const refField = parts.slice(2).join(".");
          const refResult = stepResults[refSlug] as Record<string, unknown> | undefined;
          stepInput[stepField] = refResult?.[refField] ?? null;
        } else {
          stepInput[stepField] = (inputs as any)[sourceExpr] ?? null;
        }
      }

      try {
        const result = await executor(stepInput);
        stepResults[step.capabilitySlug] = result.output;
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
