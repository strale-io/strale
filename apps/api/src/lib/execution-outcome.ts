/**
 * The canonical answer to "what happened, and may we charge for it" (WP4, CR-02).
 *
 * Before this module, five rails each decided that question their own way:
 *
 *   /v1/do sync      — `executeWithRetry` not throwing IS success
 *   /v1/do async     — promise resolution IS success
 *   wallet solutions — `refundRequired = allFailed || gated !== undefined`
 *   x402 capability  — the executor resolving IS success
 *   x402 solutions   — `anyStepSucceeded` → settle FULL price
 *
 * The sharpest consequence, confirmed by grep rather than inference: the token
 * `gated` appears twelve times in routes/solution-execute.ts and zero times in
 * routes/x402-gateway-v2.ts. So one solution run with a gate tripped refunds
 * the wallet customer in full while charging the x402 customer in full — same
 * execution, opposite billing, decided by which rail the caller happened to
 * use. Nobody chose that. It is what happens when a business fact has five
 * authorities.
 *
 * So: billability is decided here, once, and payment consumes `billable`.
 * A rail may still decide *how* to collect (refund a wallet, decline to settle
 * USDC) — that is genuinely rail-specific. It may not decide *whether*.
 *
 * ── Two rules that look like bugs and are not ────────────────────────────────
 *
 * A soft verdict is billable. `{valid:false, error:"Invalid IBAN checksum"}` is
 * the answer the customer paid for; the check ran and returned a true negative.
 * Treating it as a failure would refund correct work, and — because the same
 * signal feeds the breaker and the quality floor — would eventually delist a
 * capability for being right.
 *
 * A refusal is not a fault. When the guarded executor refuses an invocation it
 * has protected budget or upheld a classification rule; it has not broken. Such
 * an outcome is not billable, not retryable, and attributed to the caller, and
 * it must not count against the capability. This is the failure-taxonomy gap
 * that let the armed quality floor delist capabilities for refusing bad input.
 */

import {
  BudgetExhaustedError,
  CapabilityInvocationRefusedError,
  CapabilityNotClassifiedError,
} from "../capabilities/guarded-executor.js";
import { CAPABILITY_OUTPUT_CONTRACTS } from "./capability-output-contracts.js";

/**
 * Why an execution did not produce a billable answer.
 *
 * The distinctions that earn a member are the ones some consumer acts on
 * differently: payment, retry, the breaker, the quality floor, or the audit
 * trail. Anything finer belongs in the error message.
 */
export type FailureClass =
  /** Upstream unreachable, timed out, or returned 5xx. Provider's fault, worth retrying. */
  | "provider_unavailable"
  /** Upstream reachable and rejected our request — 4xx, malformed response, quota. */
  | "provider_rejected"
  /** The caller's input could not address a real question. */
  | "caller_input_invalid"
  /** The guarded executor declined. Correct behaviour, not a fault. */
  | "capability_refused"
  /** Cost guard hit its ceiling. Strale's own limit, not a capability defect. */
  | "budget_exhausted"
  /** Capability is not cost-classified — a Strale configuration gap. */
  | "not_classified"
  /** A gate step reported the bundle cannot do what it was sold for. */
  | "gate_tripped"
  /** The executor resolved, but with something that is not the purchased answer. */
  | "output_unusable"
  /** Strale's own code broke. */
  | "internal_error";

/** Who is answerable. Drives the breaker and the quality floor, not billing. */
export type Fault = "provider" | "strale" | "caller";

/**
 * What we can say about the value an executor handed back.
 *
 * Deliberately three independent axes rather than one boolean. They disagree in
 * practice, and the disagreements are the interesting cases: a soft verdict is
 * structurally valid, semantically usable, and may be contract-invalid; an
 * `{error, status}` object is structurally valid and NOT semantically usable.
 * Collapsing them is how a convention ends up doing a contract's job.
 */
export interface OutputAssessment {
  /** An object at all — not null, not a primitive, not an array. */
  structurally_valid: boolean;
  /** Real capability output: not an error marker, not skipped, not unavailable. */
  semantically_usable: boolean;
  /**
   * Checked against the capability's declared output contract.
   * `null` means no contract is declared for this slug — most of them — and
   * must never be read as failure. Absence of a contract is not a violation.
   */
  contract_valid: boolean | null;
  /** Non-fatal observations, for audit and quality. Never consulted for billing. */
  quality_flags: string[];
}

export interface ExecutionOutcome {
  success: boolean;
  failure_class: FailureClass | null;
  /** The one field payment reads. Nothing else may decide this. */
  billable: boolean;
  retryable: boolean;
  fault: Fault | null;
  output_assessment: OutputAssessment | null;
  /** Whether this outcome should count against the capability's health. */
  counts_against_capability: boolean;
  error_message: string | null;
}

/**
 * The executor's own failure marker is EXACTLY `{error: string}` — a single
 * key, written in the executor catch block. Anything richer is capability
 * output that happens to carry an `error` field, which is a legitimate shape.
 *
 * WP4 widens this by exactly one case: an object whose ONLY other content is a
 * NUMERIC transport status is also a failure marker. That was the second defect
 * in the package brief — an executor resolving `{error, status: 500}` converted
 * a failure into a billable success purely by having two keys instead of one.
 *
 * The numeric test is load-bearing, not fussiness. `{status: "down", error:
 * "timeout"}` is an uptime check reporting a site down — the deliverable, and
 * billable. Keying on the NAME `status` would unbill a correct answer, which is
 * the precise failure this module's header warns against. An HTTP status code
 * is a number; a verdict is a word.
 */
const TRANSPORT_STATUS_KEYS = new Set(["status", "statusCode", "code", "http_status"]);

function isExecutorFailureMarker(obj: Record<string, unknown>): boolean {
  if (typeof obj.error !== "string") return false;
  return Object.keys(obj).every(
    (k) =>
      k === "error" ||
      (TRANSPORT_STATUS_KEYS.has(k) && typeof obj[k] === "number"),
  );
}

/**
 * Assess a capability's output value.
 *
 * Pure and total: it never throws and never reaches the network or the
 * database, so a rail can call it inside a wallet transaction without widening
 * the window that WP3 exists to bound.
 */
export function assessOutput(
  slug: string,
  output: unknown,
): OutputAssessment {
  const quality_flags: string[] = [];

  if (output === null || output === undefined) {
    return {
      structurally_valid: false,
      semantically_usable: false,
      contract_valid: null,
      quality_flags: ["output_absent"],
    };
  }

  if (typeof output !== "object" || Array.isArray(output)) {
    // Not the executor contract's shape. Recorded rather than thrown: the
    // caller may still have received something, and the audit trail should say
    // what it was.
    return {
      structurally_valid: false,
      semantically_usable: false,
      contract_valid: null,
      quality_flags: [Array.isArray(output) ? "output_is_array" : "output_not_object"],
    };
  }

  const obj = output as Record<string, unknown>;

  if (obj.skipped === true) quality_flags.push("step_skipped");
  if (obj.unavailable === true) quality_flags.push("step_unavailable");

  const isFailureMarker = isExecutorFailureMarker(obj);
  if (isFailureMarker) quality_flags.push("executor_error_marker");

  const semantically_usable =
    !isFailureMarker && obj.skipped !== true && obj.unavailable !== true;

  if (Object.keys(obj).length === 0) {
    quality_flags.push("output_empty_object");
  }

  const contract = CAPABILITY_OUTPUT_CONTRACTS[slug];
  let contract_valid: boolean | null = null;
  if (contract && semantically_usable) {
    const missing = Object.entries(contract.reliability)
      .filter(([, reliability]) => reliability === "guaranteed")
      .map(([field]) => field)
      .filter((field) => !hasPath(obj, field));
    contract_valid = missing.length === 0;
    if (missing.length > 0) {
      quality_flags.push(`contract_missing:${missing.join(",")}`);
    }
  }

  return {
    structurally_valid: true,
    semantically_usable,
    contract_valid,
    quality_flags,
  };
}

/** Dotted-path presence check, so nested contract fields resolve. */
function hasPath(root: Record<string, unknown>, path: string): boolean {
  let cursor: unknown = root;
  for (const segment of path.split(".")) {
    if (cursor === null || typeof cursor !== "object") return false;
    if (!(segment in (cursor as Record<string, unknown>))) return false;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor !== null && cursor !== undefined;
}

/**
 * The outcome for an executor that resolved.
 *
 * Resolving is necessary and not sufficient. A contract violation is recorded
 * but does NOT block the charge: the contract table covers a handful of slugs
 * and exists to correct harness false-alarms, so treating a violation as
 * unbillable would refund correct work on the strength of a declaration we
 * already know drifts. It feeds quality, which is where a drifting declaration
 * should surface.
 */
export function outcomeFromOutput(
  slug: string,
  output: unknown,
): ExecutionOutcome {
  const assessment = assessOutput(slug, output);

  if (!assessment.semantically_usable) {
    const skipped = assessment.quality_flags.includes("step_skipped");
    const unavailable = assessment.quality_flags.includes("step_unavailable");
    return {
      success: false,
      failure_class: "output_unusable",
      billable: false,
      // A skipped step was starved of inputs by an earlier failure; retrying
      // the step alone changes nothing.
      retryable: !skipped,
      fault: unavailable ? "strale" : "provider",
      output_assessment: assessment,
      counts_against_capability: !skipped && !unavailable,
      error_message:
        typeof (output as Record<string, unknown> | null)?.error === "string"
          ? ((output as Record<string, unknown>).error as string)
          : null,
    };
  }

  return {
    success: true,
    failure_class: null,
    billable: true,
    retryable: false,
    fault: null,
    output_assessment: assessment,
    counts_against_capability: false,
    error_message: null,
  };
}

/** Classify a thrown error into the canonical vocabulary. */
export function outcomeFromError(error: unknown): ExecutionOutcome {
  const base = {
    success: false as const,
    output_assessment: null,
    error_message: error instanceof Error ? error.message : String(error),
  };

  // A refusal is the guarded executor working. Not billable, not retryable,
  // and explicitly NOT counted against the capability — see the header note.
  if (error instanceof CapabilityInvocationRefusedError) {
    return {
      ...base,
      failure_class: "capability_refused",
      billable: false,
      retryable: false,
      fault: "caller",
      counts_against_capability: false,
    };
  }

  if (error instanceof BudgetExhaustedError) {
    return {
      ...base,
      failure_class: "budget_exhausted",
      billable: false,
      retryable: false,
      fault: "strale",
      counts_against_capability: false,
    };
  }

  if (error instanceof CapabilityNotClassifiedError) {
    return {
      ...base,
      failure_class: "not_classified",
      billable: false,
      retryable: false,
      fault: "strale",
      counts_against_capability: false,
    };
  }

  const message = base.error_message.toLowerCase();
  const transient =
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("aborted") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("socket hang up") ||
    / 5\d\d\b/.test(message);

  return {
    ...base,
    failure_class: transient ? "provider_unavailable" : "provider_rejected",
    billable: false,
    retryable: transient,
    fault: "provider",
    counts_against_capability: true,
  };
}

/** A gate step reported the bundle cannot do what it was sold for. */
export function outcomeFromGate(
  gate: { capabilitySlug: string; field: string },
): ExecutionOutcome {
  return {
    success: false,
    failure_class: "gate_tripped",
    // The single most important line in this module. The wallet rail already
    // refunded here; the x402 rail settled in full. Both now read this.
    billable: false,
    retryable: false,
    // The gate step answered correctly — it is not the capability's failure.
    fault: "provider",
    output_assessment: null,
    counts_against_capability: false,
    error_message: `gate tripped: ${gate.capabilitySlug}.${gate.field}`,
  };
}

export interface SolutionOutcome extends ExecutionOutcome {
  steps_total: number;
  steps_succeeded: number;
}

/**
 * Fold per-step outcomes into one answer for the bundle.
 *
 * Precedence is deliberate: a tripped gate loses the charge even when steps
 * behind it succeeded, because the bundle could not perform the work it was
 * sold for. Otherwise at least one usable step is billable — a bundle is priced
 * as a bundle, and partial delivery is disclosed in the audit trail rather than
 * priced by the step.
 */
export function aggregateSolutionOutcome(
  stepOutcomes: ExecutionOutcome[],
  gate?: { capabilitySlug: string; field: string },
): SolutionOutcome {
  const steps_total = stepOutcomes.length;
  const steps_succeeded = stepOutcomes.filter((o) => o.success).length;

  if (gate) {
    return { ...outcomeFromGate(gate), steps_total, steps_succeeded };
  }

  if (steps_succeeded === 0) {
    const anyRetryable = stepOutcomes.some((o) => o.retryable);
    return {
      success: false,
      failure_class: "output_unusable",
      billable: false,
      retryable: anyRetryable,
      fault: "provider",
      output_assessment: null,
      counts_against_capability: false,
      error_message: "no step produced usable output",
      steps_total,
      steps_succeeded,
    };
  }

  return {
    success: true,
    failure_class: null,
    billable: true,
    retryable: false,
    fault: null,
    output_assessment: null,
    counts_against_capability: false,
    error_message: null,
    steps_total,
    steps_succeeded,
  };
}

/** The transaction-row vocabulary `/v1/do` and solutions already share. */
export function transactionStatusFor(outcome: ExecutionOutcome): "completed" | "failed" {
  return outcome.success ? "completed" : "failed";
}

/**
 * Thrown when an executor resolved with something that is not the purchased
 * answer.
 *
 * The capability rails are written around "resolved means succeeded", with the
 * charge and the audit write immediately after resolution and every failure
 * path already living in the surrounding catch block. Rather than restructure
 * four call sites around a new return value — which is where a money bug would
 * hide — the unusable case is raised as an error, so it takes the failure path
 * that is already proven: no debit on the sync rail, reservation released on
 * the async rail, transaction marked failed on both.
 */
export class UnbillableOutputError extends Error {
  constructor(
    public readonly slug: string,
    public readonly assessment: OutputAssessment,
  ) {
    super(
      assessment.quality_flags.includes("executor_error_marker")
        ? "Capability returned an error marker rather than output"
        : "Capability returned no usable output",
    );
    this.name = "UnbillableOutputError";
  }
}

/**
 * Gate the capability rails on the same assessment the solution rails use.
 *
 * Note what this does NOT reject: a soft verdict, an uptime check reporting a
 * site down, or an output that violates its declared contract. Those are all
 * billable — see the header, and `outcomeFromOutput`.
 */
export function assertBillableOutput(slug: string, output: unknown): void {
  const outcome = outcomeFromOutput(slug, output);
  if (!outcome.billable) {
    throw new UnbillableOutputError(slug, outcome.output_assessment!);
  }
}
