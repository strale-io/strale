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

// Path segment: either a key (object property) or an index (array element)
type PathSegment = { kind: "key"; name: string } | { kind: "index"; index: number };

/**
 * Parse a dotted path like "license.spdx" or "items[0].name" into segments.
 * Supports: dot notation, bracket-integer notation, arbitrary depth, mixed.
 * Rejects: wildcards [*], negative indices [-1], quoted keys ['x'], predicates.
 */
export function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = [];
  let i = 0;
  while (i < path.length) {
    if (path[i] === "[") {
      // Bracket notation — must be a non-negative integer
      const close = path.indexOf("]", i);
      if (close === -1) throw new Error(`Malformed path: unclosed bracket in '${path}'`);
      const inner = path.slice(i + 1, close);
      if (/[*?]/.test(inner)) throw new Error(`Unsupported path syntax: wildcards not supported in '${path}'`);
      if (inner.startsWith("-")) throw new Error(`Unsupported path syntax: negative indices not supported in '${path}'`);
      if (inner.startsWith("'") || inner.startsWith('"')) throw new Error(`Unsupported path syntax: quoted keys not supported in '${path}'`);
      const idx = parseInt(inner, 10);
      if (isNaN(idx)) throw new Error(`Malformed path: non-integer bracket index '${inner}' in '${path}'`);
      segments.push({ kind: "index", index: idx });
      i = close + 1;
      if (i < path.length && path[i] === ".") i++; // skip trailing dot
    } else if (path[i] === ".") {
      i++; // skip leading dot
    } else {
      // Key — read until next dot or bracket
      let end = i;
      while (end < path.length && path[end] !== "." && path[end] !== "[") end++;
      segments.push({ kind: "key", name: path.slice(i, end) });
      i = end;
    }
  }
  return segments;
}

/**
 * Walk a parsed path against a root value, returning the resolved value.
 * Throws descriptive errors identifying which segment failed.
 */
export function walkPath(root: unknown, segments: PathSegment[], fullRef: string): unknown {
  let current = root;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const pathSoFar = segments.slice(0, i + 1).map((s) => s.kind === "key" ? `.${s.name}` : `[${s.index}]`).join("");

    if (current === null || current === undefined) {
      throw new Error(`Input mapping error: ${fullRef} — value is ${current} at ${pathSoFar}`);
    }

    if (seg.kind === "key") {
      if (typeof current !== "object" || Array.isArray(current)) {
        throw new Error(`Input mapping error: ${fullRef} — expected object at ${pathSoFar} but got ${Array.isArray(current) ? "array" : typeof current}`);
      }
      current = (current as Record<string, unknown>)[seg.name];
    } else {
      if (!Array.isArray(current)) {
        throw new Error(`Input mapping error: ${fullRef} — expected array at ${pathSoFar} but got ${typeof current}`);
      }
      if (seg.index < 0 || seg.index >= current.length) {
        throw new Error(`Input mapping error: ${fullRef} — index ${seg.index} out of bounds (array has ${current.length} items) at ${pathSoFar}`);
      }
      current = current[seg.index];
    }
  }
  return current ?? null;
}

/**
 * Resolve a single input_map reference to a concrete value.
 *
 * Patterns:
 *   $input.<path>       → walk path from inputs (supports nested: $input.company.name)
 *   $steps[N].<path>    → walk path from completedSteps[N] (supports nested: $steps[0].license.spdx)
 *   $all_results        → all prior step outputs keyed by slug
 *   anything else       → literal pass-through
 */
export function resolveInputRef(
  sourceExpr: string,
  inputs: Record<string, unknown>,
  completedSteps: Array<Record<string, unknown>>,
  stepResults: Record<string, unknown>,
): unknown {
  // $input.<path>
  const inputMatch = INPUT_REF.exec(sourceExpr);
  if (inputMatch) {
    const pathStr = inputMatch[1];
    const segments = parsePath(pathStr);
    // Check first segment exists in inputs (required field validation)
    if (segments.length > 0 && segments[0].kind === "key" && !(segments[0].name in inputs)) {
      throw new Error(`Input mapping error: $input.${pathStr} — field '${segments[0].name}' not found in solution inputs. Available: ${Object.keys(inputs).join(", ") || "(none)"}`);
    }
    return walkPath(inputs, segments, sourceExpr);
  }

  // $steps[N].<path>
  const stepMatch = STEP_REF.exec(sourceExpr);
  if (stepMatch) {
    const idx = parseInt(stepMatch[1], 10);
    const pathStr = stepMatch[2];
    if (idx < 0 || idx >= completedSteps.length) {
      throw new Error(`Input mapping error: ${sourceExpr} — step ${idx} has not completed yet (${completedSteps.length} steps completed so far)`);
    }
    const segments = parsePath(pathStr);
    return walkPath(completedSteps[idx], segments, sourceExpr);
  }

  // $all_results — aggregate all prior step outputs
  if (sourceExpr === ALL_RESULTS_REF) {
    return { ...stepResults };
  }

  // Literal value — pass through unchanged
  return sourceExpr;
}

export interface StepTiming {
  capabilitySlug: string;
  latencyMs: number;
}

export interface SolutionExecutionResult {
  steps: Record<string, unknown>;
  errors: string[];
  latency_ms: number;
  step_count: number;
  stepTimings: StepTiming[];
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
  const stepTimings: StepTiming[] = [];

  // Group steps for execution ordering:
  // - Steps with parallelGroup != null share a group and run concurrently
  // - Steps with parallelGroup == null are sequential (each in its own group)
  // Groups execute in order of their earliest member's stepOrder.
  type StepGroup = { minStepOrder: number; steps: typeof steps };
  const groupMap = new Map<string, StepGroup>();
  for (const step of steps) {
    // Use a unique key: "parallel:<N>" for parallel groups, "seq:<stepOrder>" for sequential
    const key = step.parallelGroup != null
      ? `parallel:${step.parallelGroup}`
      : `seq:${step.stepOrder}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.steps.push(step);
      existing.minStepOrder = Math.min(existing.minStepOrder, step.stepOrder);
    } else {
      groupMap.set(key, { minStepOrder: step.stepOrder, steps: [step] });
    }
  }

  // Sort groups by the earliest stepOrder in each group
  const sortedGroups = [...groupMap.values()].sort((a, b) => a.minStepOrder - b.minStepOrder);

  for (const { steps: groupSteps } of sortedGroups) {
    const executions = groupSteps.map(async (step) => {
      const executor = getExecutor(step.capabilitySlug);
      if (!executor) {
        stepErrors.push(`${step.capabilitySlug}: executor unavailable`);
        return;
      }

      const stepStartMs = Date.now();
      try {
        // Map solution inputs to step inputs using seed-data syntax
        const stepInput: Record<string, unknown> = {};
        const inputMap = step.inputMap as Record<string, string>;
        for (const [stepField, sourceExpr] of Object.entries(inputMap)) {
          stepInput[stepField] = resolveInputRef(sourceExpr, inputs, completedSteps, stepResults);
        }

        const result = await executor(stepInput);
        const output = result.output as Record<string, unknown>;
        stepResults[step.capabilitySlug] = output;
        completedSteps.push(output);
        stepTimings.push({ capabilitySlug: step.capabilitySlug, latencyMs: Date.now() - stepStartMs });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stepErrors.push(`${step.capabilitySlug}: ${msg.slice(0, 200)}`);
        stepResults[step.capabilitySlug] = { error: sanitizeFailureReason(msg) };
        stepTimings.push({ capabilitySlug: step.capabilitySlug, latencyMs: Date.now() - stepStartMs });
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
    stepTimings,
  };
}
