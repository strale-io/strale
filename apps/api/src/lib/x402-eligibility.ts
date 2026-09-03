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
  /**
   * The platform's primary withdrawal action, and the field this interface
   * lacked until 2026-09-03 while `ServabilityFields` below carried it with a
   * comment explaining why omitting it makes a predicate blind. Every rail now
   * asks the same question.
   */
  visible: boolean;
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
  // A withdrawn capability may not be offered for payment. Without this, an
  // anonymous caller naming the slug of a capability the platform had
  // unpublished was answered with a 402 payment challenge for it.
  if (!cap.visible) return false;
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
  /**
   * THE quarantine signal, and the one this predicate originally missed.
   *
   * jobs/quality-floor.ts quarantines with `{visible: false, x402Enabled:
   * false}` — it changes NEITHER is_active NOR lifecycle_state. So a predicate
   * reading only those two returns true for every floor-quarantined capability,
   * which is how the first version of this function failed to stop the exact
   * thing it was written to stop. Verified in production: page-speed-test was
   * quarantined 2026-08-20 and is still is_active=true, lifecycle_state=active.
   *
   * It also covers pre-launch capabilities, which are invisible for a different
   * reason and equally should not run.
   */
  visible: boolean;
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
  // Quarantined or pre-launch. See the field docs — omitting this made the
  // predicate blind to the platform's own primary delisting action.
  if (!cap.visible) return false;
  return (SERVABLE_LIFECYCLE_STATES as readonly string[]).includes(
    cap.lifecycleState,
  );
}

/**
 * May this capability be SOLD over the x402 rail?
 *
 * Distinct from `isX402PayableCapability`, which is `/v1/do`'s rule and
 * excludes free-tier because that rail serves those calls for nothing. The
 * gateway is different: on it "free" means `price_cents === 0`, and free-tier
 * capabilities carry a real price and are genuinely sold there — six of them,
 * including `email-validate`, the single highest-volume x402 slug.
 *
 * Applying /v1/do's predicate to the gateway inverts its own rule and would
 * have permanently 503'd all six. This mirrors the catalogue-building filter
 * exactly, so the SQL and the runtime check cannot drift — which is the whole
 * point of the package.
 */
export function isX402RailEligible(cap: {
  isActive: boolean;
  x402Enabled: boolean;
  marketplaceEligible: boolean;
  visible: boolean;
  lifecycleState: string;
}): boolean {
  if (!cap.isActive) return false;
  if (!cap.x402Enabled) return false;
  if (!cap.marketplaceEligible) return false;
  // Mirrors the catalogue filter, which is the whole point of this function —
  // the SQL and the runtime check must not drift. Added 2026-09-03 with the
  // catalogue's own visible filter; before that this predicate had no notion
  // of the platform's primary withdrawal action while its sibling
  // isServableCapability did.
  if (!cap.visible) return false;
  return (X402_PAYABLE_LIFECYCLE_STATES as readonly string[]).includes(
    cap.lifecycleState,
  );
}
