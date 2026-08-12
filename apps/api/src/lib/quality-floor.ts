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
 * see transaction-failure-taxonomy.ts) and free-tier traffic (anonymous,
 * €0-cost — the cheapest way to fabricate failures; review H-1).
 *
 * Abuse resistance (review H-1): counted failures must span at least
 * `minDistinctFailureDays` calendar days — a single burst, whoever sent it,
 * never quarantines by itself. Paired with the job's enforcement gate
 * (dry-run by default until a human flips QUALITY_FLOOR_ENFORCE), this keeps
 * v1 honest about its Sybil exposure instead of pretending thresholds fix it.
 *
 * Self-throttle (DEC-20260504-B): at most `maxQuarantinesPerRun` per tick.
 *
 * Scope: lifecycle 'active' AND 'degraded' — both are publicly listed
 * (routes/capabilities.ts lists both), so both must be floor-eligible
 * (review M-7). Probation/validating/deactivated are out of scope.
 *
 * Recovery: quarantined capabilities receive no catalog traffic, so their
 * completion rate cannot self-heal. Promotion is NOT automatic in v1 — the
 * platform-doctor flow re-verifies via the prod sweep and restores the flags
 * with the fix that made it pass. Deliberate, documented gap.
 *
 * Known scope boundary (review M-6): solution-step executions do not write
 * per-capability transaction rows, so bundle traffic is invisible here, and
 * quarantine does not block the solution executor's in-process dispatch.
 * The floor governs the direct-call surface only; solutions integrity is a
 * separate P3.5 item.
 */

export interface FloorStats {
  slug: string;
  lifecycleState: string;
  visible: boolean;
  x402Enabled: boolean;
  /** External, non-free-tier calls whose failure class is not caller-attributable. */
  eligibleCalls: number;
  completedCalls: number;
  /** Revenue in the window (completed price_cents sum). */
  revenueCents: number;
  /** Distinct calendar days on which counted (non-caller) failures occurred. */
  distinctFailureDays: number;
  /** Same counters over the trailing 7 days — the recovery override. */
  recentEligibleCalls: number;
  recentCompletedCalls: number;
}

export interface FloorConfig {
  quarantineBelow: number;   // 0.70
  deactivateBelow: number;   // 0.30
  minCalls: number;          // 10
  maxQuarantinesPerRun: number;
  /** Counted failures must span at least this many calendar days. */
  minDistinctFailureDays: number;
}

export const DEFAULT_FLOOR_CONFIG: FloorConfig = {
  quarantineBelow: 0.7,
  deactivateBelow: 0.3,
  minCalls: 10,
  maxQuarantinesPerRun: 3,
  minDistinctFailureDays: 2,
};

export interface FloorDecision {
  slug: string;
  action: "quarantine" | "none";
  /** Set when 30d completion < deactivateBelow — surfaced to the doctor report; never auto-applied. */
  deactivateProposal: boolean;
  /** Deactivation of a revenue earner is a Petter-only decision (escalation contract). */
  requiresHuman: boolean;
  completion: number;
  eligibleCalls: number;
  reason: string;
}

const FLOOR_LIFECYCLES = new Set(["active", "degraded"]);

export function evaluateFloor(
  rows: FloorStats[],
  config: FloorConfig = DEFAULT_FLOOR_CONFIG,
): FloorDecision[] {
  const decisions: FloorDecision[] = [];
  let quarantinesLeft = config.maxQuarantinesPerRun;

  // Deterministic order: worst completion first, so the throttle spends its
  // budget on the most broken capabilities.
  const candidates = rows
    .filter((r) => FLOOR_LIFECYCLES.has(r.lifecycleState))
    // Already delisted → nothing further to do automatically.
    .filter((r) => r.visible || r.x402Enabled)
    .filter((r) => r.eligibleCalls >= config.minCalls)
    .map((r) => ({ ...r, completion: r.completedCalls / r.eligibleCalls }))
    .sort((a, b) => a.completion - b.completion);

  for (const r of candidates) {
    if (r.completion >= config.quarantineBelow) continue;

    const belowDeactivate = r.completion < config.deactivateBelow;
    const requiresHuman = belowDeactivate && r.revenueCents > 0;

    // Burst guard (H-1): failures concentrated in fewer calendar days than
    // the minimum never quarantine on their own — could be one incident or
    // one adversary. Deferred loudly; the doctor sees the flag either way.
    if (r.distinctFailureDays < config.minDistinctFailureDays) {
      decisions.push({
        slug: r.slug,
        action: "none",
        deactivateProposal: belowDeactivate,
        requiresHuman,
        completion: r.completion,
        eligibleCalls: r.eligibleCalls,
        reason: `completion ${(r.completion * 100).toFixed(0)}% on ${r.eligibleCalls} eligible calls/30d, but counted failures span only ${r.distinctFailureDays} day(s) (< ${config.minDistinctFailureDays}) — burst, not a trend; deferred`,
      });
      continue;
    }

    // Recovery override (M-5 hardened): the trailing week must carry real
    // volume relative to the window — flat "3 lucky calls" cannot defer a
    // high-volume disaster. The deactivation PROPOSAL is still emitted from
    // the 30d figure; only the quarantine action defers.
    const recentRequired = Math.max(3, Math.ceil(0.25 * r.eligibleCalls * (7 / 30)));
    if (
      r.recentEligibleCalls >= recentRequired &&
      r.recentCompletedCalls / r.recentEligibleCalls >= config.quarantineBelow
    ) {
      decisions.push({
        slug: r.slug,
        action: "none",
        deactivateProposal: belowDeactivate,
        requiresHuman,
        completion: r.completion,
        eligibleCalls: r.eligibleCalls,
        reason: `30d completion ${(r.completion * 100).toFixed(0)}% is below floor, but the trailing 7d (${r.recentCompletedCalls}/${r.recentEligibleCalls}, required ≥${recentRequired}) shows recovery — deferring`,
      });
      continue;
    }

    if (quarantinesLeft <= 0) {
      decisions.push({
        slug: r.slug,
        action: "none",
        deactivateProposal: belowDeactivate,
        requiresHuman,
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
      requiresHuman,
      completion: r.completion,
      eligibleCalls: r.eligibleCalls,
      reason: belowDeactivate
        ? `completion ${(r.completion * 100).toFixed(0)}% on ${r.eligibleCalls} eligible calls/30d — below the 30% deactivation floor; quarantined now, deactivation is a ${r.revenueCents > 0 ? "Petter-only (revenue-earning)" : "human"} decision`
        : `completion ${(r.completion * 100).toFixed(0)}% on ${r.eligibleCalls} eligible calls/30d — below the 70% quarantine floor`,
    });
  }

  return decisions;
}
