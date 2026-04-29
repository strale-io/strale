/**
 * Test scheduler policy — per-status retry intervals.
 *
 * Replaces the old hardcoded allowlist of test_status values in the scheduler
 * query. Every status defines a minimum retry interval; a capability is
 * eligible for retesting when its last_tested_at is older than
 * max(tier_interval, status_interval).
 *
 * Invariant: no test_status creates a black hole. Even quarantined
 * capabilities re-enter the queue at the policy interval and self-heal if
 * they start passing again. A new test_status added later defaults (via the
 * SQL ELSE branch) to "tier interval only" — failing safe by retesting at
 * normal cadence rather than silently dropping.
 *
 * Background:
 *   The previous query filtered ts.test_status IN ('normal', 'env_dependent',
 *   'upstream_broken'). When auto-classification moved a suite to
 *   'infra_limited' or 'quarantined', the cap's last_tested_at froze
 *   indefinitely. SQS staleness compounded silently. See incident notes in
 *   `handoff/_general/from-code/2026-04-26-scheduler-staleness-investigation.md`.
 */

export type TestStatus =
  | "normal"
  | "env_dependent"
  | "upstream_broken"
  | "infra_limited"
  | "quarantined";

export type ScheduleTier = "A" | "B" | "C";

export const TIER_INTERVAL_HOURS: Record<ScheduleTier, number> = {
  A: 6,
  B: 24,
  C: 72,
};

/**
 * Per-status minimum retry interval in hours. Effective retry interval
 * for a (tier, status) pair is max(TIER_INTERVAL_HOURS[tier], this floor).
 *
 *   normal / env_dependent — no extra floor; tier governs.
 *   upstream_broken        — back off to daily even on tier A; the
 *                            upstream is known broken, no point hammering.
 *   infra_limited          — same back-off as upstream_broken; failing
 *                            because of our own infra (Browserless flake,
 *                            rate limits) and 6h retries don't add signal.
 *   quarantined            — weekly retry. If the underlying issue
 *                            resolves, we detect it within 7d. If not, the
 *                            cap stays parked at marginal cost.
 */
export const STATUS_RETRY_HOURS: Record<TestStatus, number> = {
  normal: 0,
  env_dependent: 0,
  upstream_broken: 24,
  infra_limited: 24,
  quarantined: 168,
};

export function effectiveRetryHours(status: TestStatus, tier: ScheduleTier): number {
  return Math.max(TIER_INTERVAL_HOURS[tier], STATUS_RETRY_HOURS[status] ?? 0);
}
