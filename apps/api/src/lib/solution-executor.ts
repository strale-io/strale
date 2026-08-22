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

import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, solutionSteps } from "../db/schema.js";
import { getExecutor } from "../capabilities/index.js";
import { isServableCapability } from "./x402-eligibility.js";
import {
  assertGuardedAllow,
  CapabilityInvocationRefusedError,
  CapabilityNotClassifiedError,
  BudgetExhaustedError,
} from "../capabilities/guarded-executor.js";
import { sanitizeFailureReason } from "./sanitize.js";
import {
  outcomeFromError,
  outcomeFromOutput,
  outcomeFromPlatformFault,
} from "./execution-outcome.js";
import { recordPaidInvocation } from "./invocation-facts.js";
import { enrichCompanyOutput } from "../capabilities/lib/enrich-company-output.js";
import { logWarn } from "./log.js";

/**
 * True iff a step's recorded value is real capability output — not an error,
 * not skipped-for-missing-inputs, not unavailable.
 *
 * Money-integrity 2026-08-12: this predicate is the billing boundary. The
 * wallet path used `step_count - errors.length`, which counted SKIPPED steps
 * as successes — a solution whose step 1 failed (starving every downstream
 * step's inputs) billed full price for zero executed checks. The x402 path
 * already refused settlement on this exact predicate; both rails now share
 * it. DEC-14: no successful step ⇒ no charge.
 */
export function isSuccessfulStepOutput(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  // Executor markers ONLY (review H-1): capabilities legitimately return
  // soft verdicts like {valid:false, error:"Invalid IBAN checksum"} — that
  // is the purchased answer, not a failure. The executor's own failure
  // marker is EXACTLY {error: string} (single key, written in the catch
  // block above); skipped/unavailable carry their boolean flags.
  if (obj.skipped === true || obj.unavailable === true) return false;
  if (Object.keys(obj).length === 1 && typeof obj.error === "string") return false;
  return true;
}

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
  // F-B-016: null entries mean "this step index hasn't completed yet".
  // Preallocation to steps.length lets $steps[N] resolve by authoring
  // order (= stepOrder) regardless of parallel-group completion order.
  completedSteps: Array<Record<string, unknown> | null>,
  stepResults: Record<string, unknown>,
): unknown {
  // $input.<path>
  const inputMatch = INPUT_REF.exec(sourceExpr);
  if (inputMatch) {
    const pathStr = inputMatch[1];
    const segments = parsePath(pathStr);
    // If the top-level field isn't in the user's inputs, resolve to null.
    // This handles optional solution fields (e.g. domain, contact_name)
    // that the user didn't provide. The downstream capability decides
    // whether a null input is acceptable.
    if (segments.length > 0 && segments[0].kind === "key" && !(segments[0].name in inputs)) {
      return null;
    }
    return walkPath(inputs, segments, sourceExpr);
  }

  // $steps[N].<path> — with fallback to $input.<field> when step output is empty
  const stepMatch = STEP_REF.exec(sourceExpr);
  if (stepMatch) {
    const idx = parseInt(stepMatch[1], 10);
    const pathStr = stepMatch[2];
    if (idx < 0 || idx >= completedSteps.length) {
      throw new Error(`Input mapping error: ${sourceExpr} — step ${idx} is out of range (solution has ${completedSteps.length} steps)`);
    }
    // F-B-016: null means the step with that sorted index hasn't completed
    // yet — treated the same as "walkPath got null" so the $input fallback
    // below still runs. Gate 4a catches literal forward references at
    // onboarding; this is the runtime-defensive branch.
    const stepOutput = completedSteps[idx];
    const segments = parsePath(pathStr);
    if (stepOutput !== null) {
      try {
        const value = walkPath(stepOutput, segments, sourceExpr);
        // If step output resolved to a non-null value, use it
        if (value !== null && value !== undefined) return value;
      } catch {
        // walkPath threw — step output was null/undefined at some segment
      }
    }
    // Fallback: if the field name matches an $input field, use that instead.
    // This handles the cascade where step 0 returns empty output but the
    // user provided the same data via $input (e.g., company_name).
    const topField = segments.length > 0 && segments[0].kind === "key" ? segments[0].name : null;
    if (topField && topField in inputs) {
      logWarn("solution-executor-input-fallback", "input reference resolved to null; falling back", {
        source_expr: sourceExpr,
        fallback_field: topField,
      });
      return walkPath(inputs, segments, sourceExpr);
    }
    return null;
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
  /**
   * Set when a gate step's precondition tripped. The remaining steps were not
   * executed and the caller must not be charged: the bundle could not do the
   * work it was sold for. The answer it CAN give is still in `steps`.
   */
  gated?: { capabilitySlug: string; field: string; observed: unknown; reason: string };
}

/** A step's optional precondition. Deliberately a literal comparison and not
 *  an expression language — the value comes from a seeded definition, and a
 *  bundle definition is not a place to accept arbitrary code. */
export interface GateCondition {
  field: string;
  /**
   * A JSON SCALAR. Objects and arrays are rejected at parse time rather than
   * supported: the persisted value and the step's output are deserialized
   * separately, so `===` between two structurally-equal objects is always
   * false. Such a gate would be accepted, stored, and then silently never
   * trip — protecting nothing while looking like protection.
   */
  equals: string | number | boolean | null;
  /** Caller-facing sentence explaining why the rest was skipped. */
  reason?: string;
}

/** JSON scalars are the only values `===` can compare meaningfully here. */
export function isGateScalar(v: unknown): v is string | number | boolean | null {
  return v === null || ["string", "number", "boolean"].includes(typeof v);
}

/** Parse a persisted gate_condition. Anything malformed is treated as absent —
 *  a broken gate must not silently start blocking a working bundle. */
export function parseGateCondition(raw: unknown): GateCondition | null {
  const obj = typeof raw === "string" ? safeJson(raw) : raw;
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const g = obj as Record<string, unknown>;
  if (typeof g.field !== "string" || !g.field) return null;
  if (!("equals" in g)) return null;
  if (!isGateScalar(g.equals)) return null;
  return { field: g.field, equals: g.equals, reason: typeof g.reason === "string" ? g.reason : undefined };
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

/** A step as the gate evaluator needs to see it. */
export interface GateEvaluable {
  capabilitySlug: string;
  gateCondition: unknown;
  output: Record<string, unknown> | null;
}

/**
 * Pure gate evaluation over one settled group. Extracted from the execution
 * loop so enforcement — not just parsing and comparison — is testable without
 * a database. Cross-provider review pointed out that the first version of
 * these tests would still pass if the whole enforcement block were deleted.
 *
 * Returns the first tripped gate in group order, or null.
 */
export function evaluateGates(
  group: GateEvaluable[],
): SolutionExecutionResult["gated"] | null {
  for (const step of group) {
    const gate = parseGateCondition(step.gateCondition);
    if (!gate) continue;
    if (!gateTrips(step.output, gate)) continue;
    return {
      capabilitySlug: step.capabilitySlug,
      field: gate.field,
      observed: (step.output as Record<string, unknown>)[gate.field],
      reason: gate.reason
        ?? `${step.capabilitySlug} reported ${gate.field}=${JSON.stringify(gate.equals)}; the remaining checks could not be performed.`,
    };
  }
  return null;
}

/**
 * Fill in the steps a tripped gate prevented. Never overwrites a step that
 * already ran — a gate stops what is left, it does not rewrite history.
 */
export function markSkippedByGate(
  allSlugs: string[],
  stepResults: Record<string, unknown>,
  reason: string,
): void {
  for (const slug of allSlugs) {
    if (slug in stepResults) continue;
    stepResults[slug] = { skipped: true, reason: `Not run — ${reason}` };
  }
}

/** Does this step's output trip its gate? */
export function gateTrips(output: unknown, gate: GateCondition): boolean {
  if (!output || typeof output !== "object" || Array.isArray(output)) return false;
  const value = (output as Record<string, unknown>)[gate.field];
  return value === gate.equals;
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
  /**
   * Who the per-step invocation facts belong to (WP9). Required, not optional:
   * a defaulted actor would silently attribute every step to nobody, and "the
   * parameter was threaded in and then never written" is a mistake this
   * codebase has already shipped once. The x402 rail genuinely has no account,
   * which is why `userId` is nullable rather than the parameter being absent.
   */
  actor: { userId: string | null },
): Promise<SolutionExecutionResult | null> {
  const db = getDb();
  // WP8: eligibility is deliberately NOT read here. It is re-read per group at
  // execution time (see the loop below), because a snapshot taken at solution
  // start goes stale while later groups run — a capability quarantined mid-run
  // would still execute. Joining it here as well would leave a tempting stale
  // copy in scope, which is how the first version of this gate went wrong.
  const steps = await db
    .select({
      capabilitySlug: solutionSteps.capabilitySlug,
      stepOrder: solutionSteps.stepOrder,
      inputMap: solutionSteps.inputMap,
      canParallel: solutionSteps.canParallel,
      parallelGroup: solutionSteps.parallelGroup,
      gateCondition: solutionSteps.gateCondition,
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
  let gated: SolutionExecutionResult["gated"] = undefined;
  // F-B-016: Preallocate by sorted-steps length and assign by each step's
  // index in the sorted array (stepOrder-sorted, see `orderBy` above).
  // Previously this was `.push(output)` inside a Promise.all map callback,
  // so parallel-group completion order — not authoring order — determined
  // which output $steps[N] resolved to. Preallocation + indexed assignment
  // makes $steps[N] deterministic: always the N-th step in stepOrder.
  const completedSteps: Array<Record<string, unknown> | null> = new Array(steps.length).fill(null);
  const stepIndex = new Map<typeof steps[number], number>();
  for (let i = 0; i < steps.length; i++) stepIndex.set(steps[i], i);
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

  // Context propagation: after first group, extract registration_number + jurisdiction
  // from step 0 and inject into inputs as optional context for downstream steps.
  // This enables downstream capabilities to use the entity's code without explicit
  // $steps[0].registration_number mappings in every solution definition.
  let entityContext: Record<string, unknown> = {};

  for (const { steps: groupSteps } of sortedGroups) {
    // WP8 remediation — eligibility is re-read PER GROUP, not once per run.
    //
    // The first version loaded visible/is_active/lifecycle_state for every step
    // in one query before execution began. A solution runs its groups in
    // sequence and can take seconds to minutes, so a capability quarantined
    // after the run started would still execute in a later group from a stale
    // snapshot. WP8 closed exactly this shape on the x402 catalogue cache and
    // called it a delisting race; leaving it open here would be the same defect
    // with a shorter window and no justification for the inconsistency.
    //
    // The invariant, stated so it is testable: a quarantine stops all step
    // execution that has not already begun. Steps already in flight when the
    // quarantine lands are allowed to finish — stopping those would mean
    // killing work the customer is about to receive, which is the same
    // reasoning WP3 used for reservation TTLs.
    //
    // One indexed read per group. Groups are few (typically one to four), and
    // this is the path where a wrong answer runs a capability we withdrew.
    const groupSlugs = groupSteps.map((s) => s.capabilitySlug);
    const freshRows = await db
      .select({
        slug: capabilities.slug,
        isActive: capabilities.isActive,
        lifecycleState: capabilities.lifecycleState,
        visible: capabilities.visible,
      })
      .from(capabilities)
      .where(inArray(capabilities.slug, groupSlugs));
    const freshBySlug = new Map(freshRows.map((r) => [r.slug, r]));

    const executions = groupSteps.map(async (step) => {
      // WP8: is this capability fit to run at all? Checked BEFORE the executor
      // lookup, because a registered executor for a quarantined capability is
      // exactly the case that used to slip through — the code was present, so
      // the step ran, even though the platform had decided to stop serving it.
      //
      // Solution steps consulted no eligibility rule of any kind before this.
      // Not yet a live incident (every offending step in production sits in an
      // already-inactive solution), but 103 live solutions depend on 99
      // capabilities and 19 moved to a non-servable state in the last 90 days,
      // with the quality floor quarantining automatically. The gap was one
      // quarantine away from putting a delisted capability inside a paid bundle.
      // The FRESH row, not the one loaded with the step list. A capability
      // absent from the fresh read was deleted mid-run and is not servable.
      const fresh = freshBySlug.get(step.capabilitySlug);
      const servable =
        fresh != null &&
        isServableCapability({
          isActive: fresh.isActive,
          lifecycleState: fresh.lifecycleState,
          visible: fresh.visible,
        });

      const executor = servable ? getExecutor(step.capabilitySlug) : undefined;
      if (!executor) {
        stepErrors.push(
          servable
            ? `${step.capabilitySlug}: executor unavailable`
            : `${step.capabilitySlug}: capability is not currently servable`,
        );
        // Money-integrity 2026-08-12: the step must still APPEAR — a bare
        // return made deactivated steps vanish from the audit trail entirely
        // (a solution advertising 14 steps audited 13 with no gap marker).
        stepResults[step.capabilitySlug] = {
          unavailable: true,
          // Distinguished because the two mean different things for BILLING.
          // A capability we withheld is our decision, not partial delivery.
          ...(servable ? {} : { platform_withheld: true }),
          reason: servable
            ? "capability unavailable (not deployed) — this step did not run"
            : "capability was withheld by Strale (quarantined or deactivated) — this step did not run",
        };
        completedSteps[stepIndex.get(step)!] = {};
        stepTimings.push({ capabilitySlug: step.capabilitySlug, latencyMs: 0 });
        return;
      }

      // Phase A0b dispatcher gate. Solution executions are customer-initiated
      // (the outer route already authenticated the customer), so each step
      // runs under customer_paid context. ALLOW_MATRIX permits all classes.
      try {
        await assertGuardedAllow(step.capabilitySlug, {
          kind: "customer_paid",
          userId: null,
          transactionId: null,
        });
      } catch (err) {
        if (
          err instanceof CapabilityInvocationRefusedError ||
          err instanceof CapabilityNotClassifiedError ||
          err instanceof BudgetExhaustedError
        ) {
          stepErrors.push(`${step.capabilitySlug}: ${err.message}`);
          // Same audit-visibility rule as the executor-unavailable branch.
          stepResults[step.capabilitySlug] = {
            unavailable: true,
            reason: sanitizeFailureReason(err.message),
          };
          completedSteps[stepIndex.get(step)!] = {};
          stepTimings.push({ capabilitySlug: step.capabilitySlug, latencyMs: 0 });
          return;
        }
        throw err;
      }

      const stepStartMs = Date.now();
      // Which phase threw. This try covers OUR input mapping and OUR output
      // enrichment as well as the capability's executor, and WP9 turns what
      // used to be an unrecorded step failure into a row an armed floor reads.
      // Without this, a bug in our own plumbing counts toward delisting a
      // capability that did nothing wrong.
      let phase: "input" | "executor" | "enrich" = "input";
      try {
        // Map solution inputs to step inputs using seed-data syntax
        const stepInput: Record<string, unknown> = {};
        const inputMap = step.inputMap as Record<string, string>;
        for (const [stepField, sourceExpr] of Object.entries(inputMap)) {
          stepInput[stepField] = resolveInputRef(sourceExpr, inputs, completedSteps, stepResults);
        }

        // Skip steps where ALL mapped inputs resolved to null (optional
        // fields the caller didn't provide). No point calling a capability
        // with entirely empty inputs — it would just error.
        const allNull = Object.values(stepInput).every((v) => v === null || v === undefined);
        if (allNull && Object.keys(stepInput).length > 0) {
          stepResults[step.capabilitySlug] = { skipped: true, reason: "All required inputs were not provided" };
          // F-B-016: index by step position, not append order.
          completedSteps[stepIndex.get(step)!] = {};
          stepTimings.push({ capabilitySlug: step.capabilitySlug, latencyMs: 0 });
          return;
        }

        // Inject entity context from step 0 as low-priority defaults.
        // Only adds fields that aren't already in the step input and
        // that the capability could use (e.g., jurisdiction, registration_number).
        if (Object.keys(entityContext).length > 0) {
          for (const [ctxKey, ctxVal] of Object.entries(entityContext)) {
            if (!(ctxKey in stepInput) && ctxVal != null) {
              stepInput[ctxKey] = ctxVal;
            }
          }
        }

        // Remove null entries so capabilities only see fields the user
        // actually provided (avoids "field X is required" errors from
        // capabilities that validate their own inputs).
        for (const [k, v] of Object.entries(stepInput)) {
          if (v === null || v === undefined) delete stepInput[k];
        }

        phase = "executor";
        const result = await executor(stepInput);
        phase = "enrich";
        // Enrich company data outputs with derived fields (e.g., vat_number)
        const output = enrichCompanyOutput(
          step.capabilitySlug,
          result.output as Record<string, unknown>,
        );
        // WP9 — the defect this package exists to close. A bundle writes ONE
        // transaction with `capability_id = NULL`, so before this line a
        // capability invoked only inside solutions produced no per-capability
        // record anywhere and the quality floor could not see it at all: it
        // could fail every bundle call it served and never become
        // quarantinable, because as far as the floor's query was concerned it
        // had no traffic.
        //
        // Assessed on the ENRICHED output, which is what the customer receives
        // and what the solution's own aggregate outcome is computed from —
        // assessing the raw result here would let the step's quality record and
        // its billing verdict disagree about the same call.
        await recordPaidInvocation({
          capabilitySlug: step.capabilitySlug,
          rail: "solution_step",
          solutionId,
          userId: actor.userId,
          latencyMs: Date.now() - stepStartMs,
          outcome: outcomeFromOutput(step.capabilitySlug, output),
        });
        stepResults[step.capabilitySlug] = output;
        // F-B-016: index by step position, not completion order.
        completedSteps[stepIndex.get(step)!] = output;
        stepTimings.push({ capabilitySlug: step.capabilitySlug, latencyMs: Date.now() - stepStartMs });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await recordPaidInvocation({
          capabilitySlug: step.capabilitySlug,
          rail: "solution_step",
          solutionId,
          userId: actor.userId,
          latencyMs: Date.now() - stepStartMs,
          outcome:
            phase === "executor" ? outcomeFromError(err) : outcomeFromPlatformFault(err),
        });
        stepErrors.push(`${step.capabilitySlug}: ${msg.slice(0, 200)}`);
        stepResults[step.capabilitySlug] = { error: sanitizeFailureReason(msg) };
        // F-B-016: on error, still mark the slot with an error marker so
        // downstream $steps[N] references see "completed with error" (the
        // walkPath fallback then falls through to $input). Previously the
        // array wasn't advanced on error, shifting later step indices.
        completedSteps[stepIndex.get(step)!] = { error: sanitizeFailureReason(msg) };
        stepTimings.push({ capabilitySlug: step.capabilitySlug, latencyMs: Date.now() - stepStartMs });
      }
    });

    await Promise.all(executions);

    // Gate evaluation, after the group settles. A tripped gate stops the run:
    // the remaining steps are recorded as skipped-by-gate rather than executed,
    // and the caller is refunded upstream (routes/solution-execute.ts). Without
    // this, a bundle whose first step legitimately reports "there is nothing
    // here" ran and billed for every step behind it.
    gated = evaluateGates(groupSteps.map((step) => ({
      capabilitySlug: step.capabilitySlug,
      gateCondition: step.gateCondition,
      output: completedSteps[stepIndex.get(step)!],
    }))) ?? undefined;
    if (gated) {
      logWarn("solution-executor-gated", "gate condition tripped; skipping remaining steps", {
        capability_slug: gated.capabilitySlug, field: gated.field,
      });
      markSkippedByGate(steps.map((s) => s.capabilitySlug), stepResults, gated.reason);
      break;
    }

    // After first group completes, extract entity context for downstream propagation
    if (entityContext && Object.keys(entityContext).length === 0 && completedSteps[0] != null) {
      const step0 = completedSteps[0];
      if (step0 && typeof step0 === "object") {
        const regNum = (step0 as Record<string, unknown>).registration_number;
        const jurisdiction = (step0 as Record<string, unknown>).jurisdiction;
        const companyName = (step0 as Record<string, unknown>).company_name;
        if (regNum) entityContext.registration_number = regNum;
        if (jurisdiction) entityContext.jurisdiction = jurisdiction;
        if (companyName) entityContext.entity_name = companyName;
      }
    }
  }

  const latencyMs = Date.now() - startMs;

  return {
    steps: stepResults,
    errors: stepErrors,
    latency_ms: latencyMs,
    step_count: steps.length,
    stepTimings,
    ...(gated ? { gated } : {}),
  };
}
