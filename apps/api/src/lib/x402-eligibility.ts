/**
 * Canonical x402 payment-rail eligibility for capabilities.
 *
 * WP0 containment (see docs/remediation/FABLE-REAUDIT.md §3.1). Before this
 * module, `/x402/:slug` and the x402 branch of `/v1/do` disagreed about which
 * capabilities may be paid for with USDC:
 *
 *   - `/x402/:slug` required x402_enabled + is_active + marketplace_eligible
 *     + lifecycle_state IN ('active','probation')
 *   - `/v1/do` (X-Payment header) required only is_active && !is_free_tier
 *
 * The quality floor delists a failing capability by clearing `x402_enabled`
 * (and `visible`). Because `/v1/do` never read that flag, a delisted
 * capability remained purchasable through the `/v1/do` X-Payment path — at
 * re-audit time 30 capabilities in production were `x402_enabled = false`
 * while still `is_active = true` and non-free.
 *
 * This module is the single predicate. WP8 (policy convergence) folds it into
 * the broader ExecutionEligibility authority and migrates the gateway's
 * cache-building SQL filter onto the same rule; until then, any new x402
 * payment path MUST consume `isX402PayableCapability` rather than re-deriving
 * the check.
 */

/** Lifecycle states permitted to transact on the x402 rail. */
export const X402_PAYABLE_LIFECYCLE_STATES = ["active", "probation"] as const;

/**
 * The capability fields the x402 eligibility decision depends on. Any query
 * feeding `isX402PayableCapability` must select all of these.
 */
export interface X402EligibilityFields {
  isActive: boolean;
  isFreeTier: boolean | null;
  x402Enabled: boolean;
  marketplaceEligible: boolean;
  lifecycleState: string;
}

/**
 * True when a capability may be purchased over the x402 rail.
 *
 * Free-tier capabilities are excluded because they are served without payment;
 * charging for them on the x402 rail would double-bill a caller who could have
 * had the call for free.
 */
export function isX402PayableCapability(cap: X402EligibilityFields): boolean {
  if (!cap.isActive) return false;
  if (cap.isFreeTier) return false;
  if (!cap.x402Enabled) return false;
  if (!cap.marketplaceEligible) return false;
  return (X402_PAYABLE_LIFECYCLE_STATES as readonly string[]).includes(
    cap.lifecycleState,
  );
}

// ─── The general question, of which x402 payability is one special case ──────

/**
 * The fields "may this capability be served at all" depends on.
 *
 * Deliberately smaller than `X402EligibilityFields`: whether something is
 * free-tier, x402-enabled or marketplace-eligible answers "may it be sold on
 * THAT rail", which is a different question from "is it fit to run".
 */
export interface ServabilityFields {
  isActive: boolean;
  lifecycleState: string;
}

/** Lifecycle states in which a capability is fit to execute. */
export const SERVABLE_LIFECYCLE_STATES = ["active", "probation"] as const;

/**
 * May this capability execute right now, on any rail?
 *
 * WP8. Before this, "may it be served" was answered by two different columns
 * consulted by different rails: `/v1/do` gated on `isActive`, the x402 gateway
 * on `lifecycle_state`. They already disagree in production — six capabilities
 * sit at lifecycle 'validating' with is_active = true, so the wallet rail would
 * run them and the x402 rail would not. Same capability, same instant, two
 * answers, decided by which rail the caller happened to use.
 *
 * And solution steps consulted NEITHER. lib/solution-executor.ts had no
 * eligibility check of any kind, so a capability the platform had decided to
 * stop serving still ran as a step inside the bundles that are the most
 * expensive thing we sell. That has not yet bitten a live bundle — every
 * offending step today sits in an already-inactive solution — but 103 live
 * solutions depend on 99 capabilities, 19 capabilities moved to a non-servable
 * state in the last 90 days, and the quality floor quarantines automatically.
 * The gap is one quarantine away from being real, which is the wrong time to
 * discover it.
 *
 * Both conditions, not either: `is_active` is the operator's switch and
 * `lifecycle_state` is the platform's own assessment. A capability needs both
 * to be fit, and requiring both is what makes the two columns stop disagreeing.
 */
export function isServableCapability(cap: ServabilityFields): boolean {
  if (!cap.isActive) return false;
  return (SERVABLE_LIFECYCLE_STATES as readonly string[]).includes(
    cap.lifecycleState,
  );
}
