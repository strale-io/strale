/**
 * Quality floor — autonomy ladder L2 (Readiness P3, DEC-20260812-A).
 *
 * Pure decision core: given per-capability real-traffic stats over the floor
 * window, decide who gets quarantined (delisted from catalog + x402, still
 * reachable by explicit slug) and who becomes a deactivation PROPOSAL.
 *
 * The DEC's confirmed thresholds, verbatim:
 *   - window: 30 days, minimum 10 eligible external calls
 *   - completion < 70%  → quarantine
 *   - completion < 30%  → deactivate — but deactivation is NEVER automatic:
 *     it is always a proposal, and for revenue-earning capabilities it is a
 *     Petter-only decision under the escalation contract.
 *
 * "Eligible" excludes failures the caller caused (caller_input, tos_policy —
 * see transaction-failure-taxonomy.ts): a capability spammed with garbage input or
 * blocklisted URLs is not thereby broken.
 *
 * Self-throttle (DEC-20260504-B): at most `maxQuarantinesPerRun` per tick.
 * The first run after a long-broken period is a workload-resumption event —
 * a bounded trickle beats a mass delisting nobody reviewed.
 *
 * Recovery: quarantined capabilities receive no catalog traffic, so their
 * completion rate cannot self-heal. Promotion is therefore NOT automatic in
 * v1 — the platform-doctor flow re-verifies via the prod sweep and restores
 * the flags with the fix that made it pass. This is a deliberate gap,
 * documented, not an oversight.
 */

export interface FloorStats {
  slug: string;
  lifecycleState: string;
  visible: boolean;
  x402Enabled: boolean;
  /** External calls in the window whose failure class is not caller-attributable. */
  eligibleCalls: number;
  /** Completed calls in the window. */
  completedCalls: number;
  /** Revenue in the window (completed price_cents sum). */
  revenueCents: number;
  /** Same counters over the trailing 7 days — the recovery override. */
  recentEligibleCalls: number;
  recentCompletedCalls: number;
}

export interface FloorConfig {
  quarantineBelow: number;   // 0.70
  deactivateBelow: number;   // 0.30
  minCalls: number;          // 10
  maxQuarantinesPerRun: number;
}

export const DEFAULT_FLOOR_CONFIG: FloorConfig = {
  quarantineBelow: 0.7,
  deactivateBelow: 0.3,
  minCalls: 10,
  maxQuarantinesPerRun: 3,
};

export interface FloorDecision {
  slug: string;
  action: "quarantine" | "none";
  /** Set when completion < deactivateBelow — surfaced to the doctor report; never auto-applied. */
  deactivateProposal: boolean;
  /** Deactivation of a revenue earner is a Petter-only decision (escalation contract). */
  requiresHuman: boolean;
  completion: number;
  eligibleCalls: number;
  reason: string;
}

export function evaluateFloor(
  rows: FloorStats[],
  config: FloorConfig = DEFAULT_FLOOR_CONFIG,
): FloorDecision[] {
  const decisions: FloorDecision[] = [];
  let quarantinesLeft = config.maxQuarantinesPerRun;

  // Deterministic order: worst completion first, so the throttle spends its
  // budget on the most broken capabilities.
  const candidates = rows
    .filter((r) => r.lifecycleState === "active")
    // Already delisted → nothing further to do automatically (recovery is
    // doctor-driven, see header).
    .filter((r) => r.visible || r.x402Enabled)
    .filter((r) => r.eligibleCalls >= config.minCalls)
    .map((r) => ({ ...r, completion: r.completedCalls / r.eligibleCalls }))
    .sort((a, b) => a.completion - b.completion);

  for (const r of candidates) {
    if (r.completion >= config.quarantineBelow) continue;

    // Recovery override: a capability fixed DURING the window still drags its
    // pre-fix failures for 30 days. If the trailing 7 days show it healthy
    // (≥3 eligible calls at/above the floor), defer — quarantining a
    // just-repaired capability punishes the fix. (Observed the day this
    // shipped: us-company-data at 50%/30d, fixed in PR #171 the same day.)
    if (
      r.recentEligibleCalls >= 3 &&
      r.recentCompletedCalls / r.recentEligibleCalls >= config.quarantineBelow
    ) {
      decisions.push({
        slug: r.slug,
        action: "none",
        deactivateProposal: false,
        requiresHuman: false,
        completion: r.completion,
        eligibleCalls: r.eligibleCalls,
        reason: `30d completion ${(r.completion * 100).toFixed(0)}% is below floor, but the trailing 7d (${r.recentCompletedCalls}/${r.recentEligibleCalls}) shows recovery — deferring`,
      });
      continue;
    }

    const belowDeactivate = r.completion < config.deactivateBelow;
    if (quarantinesLeft <= 0) {
      decisions.push({
        slug: r.slug,
        action: "none",
        deactivateProposal: belowDeactivate,
        requiresHuman: belowDeactivate && r.revenueCents > 0,
        completion: r.completion,
        eligibleCalls: r.eligibleCalls,
        reason: `below floor (${(r.completion * 100).toFixed(0)}% of ${r.eligibleCalls}) but per-run quarantine budget exhausted — next tick`,
      });
      continue;
    }

    quarantinesLeft--;
    decisions.push({
      slug: r.slug,
      action: "quarantine",
      deactivateProposal: belowDeactivate,
      requiresHuman: belowDeactivate && r.revenueCents > 0,
      completion: r.completion,
      eligibleCalls: r.eligibleCalls,
      reason: belowDeactivate
        ? `completion ${(r.completion * 100).toFixed(0)}% on ${r.eligibleCalls} eligible calls/30d — below the 30% deactivation floor; quarantined now, deactivation is a ${r.revenueCents > 0 ? "Petter-only (revenue-earning)" : "human"} decision`
        : `completion ${(r.completion * 100).toFixed(0)}% on ${r.eligibleCalls} eligible calls/30d — below the 70% quarantine floor`,
    });
  }

  return decisions;
}
