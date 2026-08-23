/**
 * The execution receipt authority (Phase 4 §B).
 *
 * **Exactly one place builds a `strale.execution.v1` payload.** No rail
 * constructs its own receipt object, and no call site chooses which members it
 * fills in — that is the closed-schema rule from Phase 2 §1, and it is enforced
 * here by requiring every fixed-point member as a named argument rather than
 * reading whatever a caller happened to pass.
 *
 * The pattern this avoids is the one Phase 1 found already present:
 * `buildFullAudit` takes `outputSchema?` and `provenance?` as optional, so the
 * audit body — which is inside the integrity hash — differs depending on what
 * the call site remembered. A receipt built that way would mean different
 * things on different rails while carrying the same version string.
 *
 * ## What this produces
 *
 * The canonical bytes, the full 256-bit digest, and the metadata a verifier
 * needs to recompute it offline. Nothing is truncated and nothing is optional.
 *
 * ## What it refuses
 *
 * An unknown rail, a missing production deploy identity, an unresolved
 * manifest digest, and a missing subject are **invariant failures**, not
 * absences (Phase 2 §9.2). Each returns a `failed` outcome carrying a closed
 * reason code, so the caller records *why* rather than leaving a null nobody
 * can interpret.
 */

import { canonicalBytes } from "../canonical/jcs.js";
import { DOMAIN_TAGS, domainDigest } from "../canonical/domain-digest.js";
import {
  assertWellFormedSteps,
  ManifestSnapshotError,
  type SolutionStepIdentity,
} from "./manifest-snapshot.js";

export const RECEIPT_VERSION = "strale.execution.v1";
export const RECEIPT_CANONICALIZATION = "RFC8785";
export const RECEIPT_DIGEST_ALG = "sha256";

/**
 * Semantic rail identity — which interface the caller used.
 *
 * Closed, Strale-owned, and never derived from HTTP noise (no `User-Agent`,
 * no `Referer`). An unmapped caller is a refusal, not an "other" bucket: a
 * receipt asserting the wrong rail is worse than no receipt, and a permissive
 * fallback is how the wrong rail gets asserted.
 */
export const RAILS = ["v1_do", "x402", "mcp", "a2a", "internal"] as const;
export type Rail = (typeof RAILS)[number];

export function isRail(value: unknown): value is Rail {
  return typeof value === "string" && (RAILS as readonly string[]).includes(value);
}

/** Execution method — an execution fact, not a compliance interpretation. */
export const EXECUTION_METHODS = ["algorithmic", "ai_generated", "mixed"] as const;
export type ExecutionMethod = (typeof EXECUTION_METHODS)[number];

/**
 * Source observation (Phase 2 §6).
 *
 * A tagged union rather than a scalar timestamp, because a live registry
 * lookup, a versioned corpus and a pure computation have genuinely different
 * vintage semantics — forcing them into one field fabricates a timestamp for
 * two of the three.
 *
 * `none_declared` is deliberately distinguishable from `computed`: the first
 * says we do not know, the second positively asserts there was no external
 * source. Collapsing them would put a false vintage into a commitment.
 */
export type SourceObservation =
  | { kind: "live_fetch"; observed_at: string }
  | { kind: "dataset"; dataset_version: string; observed_at: string | null }
  | { kind: "computed" }
  | { kind: "none_declared" };

/** Closed reason codes for a receipt that is not `complete`. */
export const RECEIPT_FAILURE_REASONS = [
  "unmapped_rail",
  "missing_deploy_identity",
  "unresolvable_manifest",
  "missing_subject",
  "snapshot_write_failed",
  "canonicalization_error",
  "internal_error",
] as const;
export type ReceiptFailureReason = (typeof RECEIPT_FAILURE_REASONS)[number];

/**
 * Everything the builder needs. Every member is REQUIRED — including the ones
 * that are frequently null — so a call site cannot omit a hashed field by
 * forgetting it. `null` is passed explicitly and means something.
 */
export interface ReceiptInput {
  transactionId: string;
  subjectKind: "capability" | "solution";
  subjectSlug: string;
  /** Full 40-hex commit, or the literal `unknown-local-build` outside production. */
  deployCommit: string | null;
  /** `sha256:<64 hex>` from the manifest snapshot authority. */
  manifestDigest: string | null;
  /** Ordered step identities for a solution; `null` for a capability. */
  steps: SolutionStepIdentity[] | null;
  rail: string;
  /** The validated inputs the executor was invoked with, not the raw HTTP body. */
  inputs: unknown;
  status: "completed" | "failed";
  /** The result AS THE CALLER RECEIVED IT, or null when status is failed. */
  result: unknown;
  /** The sanitised, caller-visible error, or null on success. */
  error: { code: string; message: string } | null;
  method: ExecutionMethod;
  sourceObservation: SourceObservation;
}

export interface ReceiptSuccess {
  outcome: "complete";
  /** The exact RFC 8785 bytes the digest was taken over. */
  canonicalBytes: Buffer;
  payload: Record<string, unknown>;
  digest: string;
  version: string;
  canonicalization: string;
  digestAlg: string;
  manifestDigest: string;
}

export interface ReceiptRefusal {
  outcome: "failed";
  reason: ReceiptFailureReason;
  detail: string;
}

export type ReceiptResult = ReceiptSuccess | ReceiptRefusal;

/**
 * Is this a production process that must know its own commit?
 *
 * Kept next to the refusal it drives so the two cannot drift.
 */
export function requiresDeployIdentity(env = process.env): boolean {
  return env.NODE_ENV === "production";
}

/** The literal recorded outside production. Never mistakable for a real SHA. */
export const LOCAL_BUILD_SENTINEL = "unknown-local-build";

function isFullCommitSha(value: string): boolean {
  return /^[0-9a-f]{40}$/.test(value);
}

/**
 * Build the receipt. Pure: no database, no clock, no environment reads beyond
 * the explicit `env` seam, so the same input always produces the same digest.
 */
export function buildExecutionReceipt(
  input: ReceiptInput,
  env = process.env,
): ReceiptResult {
  // ── Invariant failures, checked before anything is hashed ────────────────

  if (!input.subjectSlug || typeof input.subjectSlug !== "string") {
    return { outcome: "failed", reason: "missing_subject", detail: "subject slug is empty" };
  }

  if (!isRail(input.rail)) {
    return {
      outcome: "failed",
      reason: "unmapped_rail",
      detail: `rail ${JSON.stringify(input.rail)} is not one of ${RAILS.join(", ")}`,
    };
  }

  const deployCommit = input.deployCommit;
  if (requiresDeployIdentity(env)) {
    if (!deployCommit || !isFullCommitSha(deployCommit)) {
      return {
        outcome: "failed",
        reason: "missing_deploy_identity",
        detail:
          "production receipts require a full 40-hex deploy commit; " +
          `got ${JSON.stringify(deployCommit)}`,
      };
    }
  } else if (!deployCommit) {
    return {
      outcome: "failed",
      reason: "missing_deploy_identity",
      detail: `deploy identity must be a commit or the literal ${LOCAL_BUILD_SENTINEL}`,
    };
  }

  if (!input.manifestDigest) {
    return {
      outcome: "failed",
      reason: "unresolvable_manifest",
      detail: "no manifest snapshot digest was resolved for this execution",
    };
  }

  // A solution's step identities are part of its identity; a capability must
  // not carry them. Both directions are refusals, because either would make
  // two different executions share a receipt shape.
  if (input.subjectKind === "solution" && input.steps === null) {
    return {
      outcome: "failed",
      reason: "unresolvable_manifest",
      detail: "a solution receipt requires its ordered step identities",
    };
  }
  if (input.subjectKind === "capability" && input.steps !== null) {
    return {
      outcome: "failed",
      reason: "internal_error",
      detail: "a capability receipt must not carry solution step identities",
    };
  }

  // The step rules live in the snapshot authority, and the FIRST fix applied
  // them only there — so the receipt, which is the artifact the customer holds
  // and the thing the chain anchors, still accepted duplicate step_order,
  // negative and fractional orders, and an empty step list, and still dropped
  // `disposition` from the hashed payload. Reviewer-found: the snapshot is a
  // side table; the receipt is the claim.
  if (input.steps !== null) {
    try {
      assertWellFormedSteps(input.subjectSlug, input.steps);
    } catch (err) {
      return {
        outcome: "failed",
        reason: "unresolvable_manifest",
        detail:
          err instanceof ManifestSnapshotError ? err.message : String(err),
      };
    }
  }

  if (input.status === "failed" && input.error === null) {
    return {
      outcome: "failed",
      reason: "internal_error",
      detail: "a failed execution must bind the caller-visible error",
    };
  }
  if (input.status === "completed" && input.error !== null) {
    return {
      outcome: "failed",
      reason: "internal_error",
      detail: "a completed execution must not carry an error",
    };
  }

  // ── The fixed point. Every member always present. ────────────────────────

  const payload: Record<string, unknown> = {
    version: RECEIPT_VERSION,
    transaction_id: input.transactionId,
    subject: {
      kind: input.subjectKind,
      slug: input.subjectSlug,
    },
    implementation: {
      deploy_commit: deployCommit,
      manifest_digest: input.manifestDigest,
      steps:
        input.steps === null
          ? null
          : [...input.steps]
              .sort((a, b) => a.step_order - b.step_order)
              .map((s) => ({
                step_order: s.step_order,
                slug: s.slug,
                // Without this, `skipped` and `unresolved` produce an IDENTICAL
                // receipt digest — the spec's "the absence recorded" left
                // unimplemented in the one place it is read.
                disposition: s.disposition,
                manifest_digest: s.manifest_digest,
              })),
    },
    request: {
      rail: input.rail,
      inputs: input.inputs ?? null,
    },
    response: {
      status: input.status,
      result: input.status === "failed" ? null : (input.result ?? null),
      error: input.error,
    },
    execution: {
      method: input.method,
      source_observation: input.sourceObservation,
    },
  };

  let bytes: Buffer;
  let digest: string;
  try {
    bytes = canonicalBytes(payload);
    digest = domainDigest(DOMAIN_TAGS.executionReceipt, payload);
  } catch (err) {
    // Customer inputs and results are arbitrary JSON. A value the canonicalizer
    // refuses — a lone surrogate, nesting past the bound — is a receipt that
    // cannot be built, not a receipt that may be built without it.
    return {
      outcome: "failed",
      reason: "canonicalization_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  return {
    outcome: "complete",
    canonicalBytes: bytes,
    payload,
    digest,
    version: RECEIPT_VERSION,
    canonicalization: RECEIPT_CANONICALIZATION,
    digestAlg: RECEIPT_DIGEST_ALG,
    manifestDigest: input.manifestDigest,
  };
}
