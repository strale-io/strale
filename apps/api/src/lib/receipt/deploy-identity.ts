/**
 * The authoritative runtime source of `deploy_commit` (Phase 4 §D).
 *
 * ## Where it comes from
 *
 * `RAILWAY_GIT_COMMIT_SHA`, **untruncated**. `/health` slices it to 12
 * characters for display; a receipt records the full 40, because 12 hex is a
 * display convenience and 40 is an identity.
 *
 * ## Why production refuses to start without it
 *
 * A receipt whose `implementation.deploy_commit` is missing cannot answer the
 * question it exists to answer — which code produced this result. Phase 2 §9.2
 * classifies that as an invariant failure rather than an absence, and the only
 * way for `missing_deploy_identity` to be genuinely unreachable in a booted
 * process is for the process to refuse to boot without it.
 *
 * So this is a startup assertion, in the same position as the existing
 * schema-validation and cost-class gates: a production process that cannot
 * identify its serving commit does not become ready. That is deliberately
 * stronger than degrading — a process serving receipts with no implementation
 * identity is producing commitments nobody can interpret, and it would do so
 * silently.
 *
 * ## Why dev and test are exempt
 *
 * They have no `RAILWAY_GIT_COMMIT_SHA` and never will. They record the
 * literal `unknown-local-build`, which is a DEFINED representation — it can
 * never be mistaken for a real commit, and it cannot be produced accidentally
 * in production because production takes the refusal path instead.
 *
 * The exemption is keyed on `NODE_ENV === "production"` alone. Anything more
 * clever (a Railway-specific variable, a hostname check) would make the gate
 * depend on a signal that can disappear for reasons unrelated to correctness.
 */

import { LOCAL_BUILD_SENTINEL, requiresDeployIdentity } from "./execution-receipt.js";

export { LOCAL_BUILD_SENTINEL };

const FULL_SHA = /^[0-9a-f]{40}$/;

export class DeployIdentityError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "DeployIdentityError";
  }
}

/**
 * The commit this process is serving.
 *
 * Returns the full SHA in production, or the sentinel outside it. Throws in
 * production when the value is missing or malformed — callers on the request
 * path should not be reaching for this before boot has asserted it, and if
 * they do, throwing is better than handing back a value that looks real.
 */
export function resolveDeployCommit(env = process.env): string {
  const raw = env.RAILWAY_GIT_COMMIT_SHA?.trim();

  if (requiresDeployIdentity(env)) {
    if (!raw) {
      throw new DeployIdentityError(
        "RAILWAY_GIT_COMMIT_SHA is unset in production. Every execution receipt " +
          "records which code produced the result; without it, receipts would " +
          "carry no implementation identity and could not be interpreted later.",
      );
    }
    if (!FULL_SHA.test(raw)) {
      throw new DeployIdentityError(
        `RAILWAY_GIT_COMMIT_SHA is not a full 40-hex commit (got ${JSON.stringify(raw)}). ` +
          "A truncated or decorated value is not an identity — /health truncates for " +
          "display, but a receipt must record the whole thing.",
      );
    }
    return raw;
  }

  // Outside production: use a real commit when one happens to be present (CI
  // often has it), otherwise the sentinel.
  return raw && FULL_SHA.test(raw) ? raw : LOCAL_BUILD_SENTINEL;
}

/**
 * Boot gate. Call before the server listens.
 *
 * Deliberately narrow: it asserts and returns, so the caller decides what
 * "refuse to become ready" means in its own context. Throwing from here would
 * couple this module to the process lifecycle.
 */
export function assertDeployIdentity(env = process.env): {
  deployCommit: string;
  enforced: boolean;
} {
  const enforced = requiresDeployIdentity(env);
  const deployCommit = resolveDeployCommit(env); // throws in production if absent
  return { deployCommit, enforced };
}
