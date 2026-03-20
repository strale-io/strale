/**
 * Freshness decay for SQS scoring.
 *
 * Penalizes the matrix SQS score when a capability hasn't been tested
 * within its expected schedule window. Does NOT modify the underlying
 * QP/RP scores — those remain as-computed from test data. Only the
 * composite matrix_sqs gets the penalty, so when a test runs again
 * the decay immediately disappears.
 *
 * Staleness levels:
 *   fresh       0–2× interval     0 decay
 *   aging       2–4× interval     0 decay (visibility only)
 *   stale       4–8× interval     1 pt per interval after the 4th
 *   expired     8–12× interval    same formula, floor at 50
 *   unverified  >12× or >30 days  score forced to 0
 */

export type StalenessLevel = "fresh" | "aging" | "stale" | "expired" | "unverified";

export interface FreshnessResult {
  is_stale: boolean;
  staleness_level: StalenessLevel;
  decay_points: number;
  last_tested_at: string | null;
  intervals_overdue: number;
}

const ABSOLUTE_UNVERIFIED_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function computeFreshnessDecay(
  lastTestedAt: Date | null,
  scheduleTierHours: number,
  now?: Date,
): FreshnessResult {
  const currentTime = now ?? new Date();

  if (!lastTestedAt) {
    return {
      is_stale: true,
      staleness_level: "unverified",
      decay_points: Infinity, // signals "force to 0"
      last_tested_at: null,
      intervals_overdue: Infinity,
    };
  }

  const elapsedMs = currentTime.getTime() - lastTestedAt.getTime();
  const intervalMs = scheduleTierHours * 3600_000;
  const intervalsOverdue = elapsedMs / intervalMs;

  // Absolute cap: >30 days = unverified regardless of tier
  if (elapsedMs > ABSOLUTE_UNVERIFIED_MS) {
    return {
      is_stale: true,
      staleness_level: "unverified",
      decay_points: Infinity,
      last_tested_at: lastTestedAt.toISOString(),
      intervals_overdue: Math.round(intervalsOverdue * 10) / 10,
    };
  }

  if (intervalsOverdue <= 2) {
    return {
      is_stale: false,
      staleness_level: "fresh",
      decay_points: 0,
      last_tested_at: lastTestedAt.toISOString(),
      intervals_overdue: Math.round(intervalsOverdue * 10) / 10,
    };
  }

  if (intervalsOverdue <= 4) {
    return {
      is_stale: false,
      staleness_level: "aging",
      decay_points: 0,
      last_tested_at: lastTestedAt.toISOString(),
      intervals_overdue: Math.round(intervalsOverdue * 10) / 10,
    };
  }

  // Decay: 1 point per interval past the 4th
  const rawDecay = Math.floor(intervalsOverdue - 3);

  if (intervalsOverdue <= 8) {
    return {
      is_stale: true,
      staleness_level: "stale",
      decay_points: rawDecay,
      last_tested_at: lastTestedAt.toISOString(),
      intervals_overdue: Math.round(intervalsOverdue * 10) / 10,
    };
  }

  if (intervalsOverdue <= 12) {
    return {
      is_stale: true,
      staleness_level: "expired",
      decay_points: rawDecay, // applyFreshnessDecay caps at floor of 50
      last_tested_at: lastTestedAt.toISOString(),
      intervals_overdue: Math.round(intervalsOverdue * 10) / 10,
    };
  }

  // >12× interval
  return {
    is_stale: true,
    staleness_level: "unverified",
    decay_points: Infinity,
    last_tested_at: lastTestedAt.toISOString(),
    intervals_overdue: Math.round(intervalsOverdue * 10) / 10,
  };
}

/**
 * Apply freshness decay to a raw matrix SQS score.
 * Returns the decayed score (never below 0).
 *
 * For "expired" level, floor is 50 (so decay can't push below 50).
 * For "unverified", returns 0.
 * For "stale", subtracts decay_points with floor 0.
 */
export function applyFreshnessDecay(
  rawMatrixSqs: number,
  freshness: FreshnessResult,
): number {
  if (freshness.staleness_level === "unverified") return 0;
  if (freshness.decay_points === 0) return rawMatrixSqs;

  if (freshness.staleness_level === "expired") {
    return Math.max(50, rawMatrixSqs - freshness.decay_points);
  }

  // "stale"
  return Math.max(0, rawMatrixSqs - freshness.decay_points);
}

/**
 * Given a freshness result, determine if the trend should be overridden to "stale".
 */
export function shouldOverrideTrend(freshness: FreshnessResult): boolean {
  return (
    freshness.staleness_level === "stale" ||
    freshness.staleness_level === "expired" ||
    freshness.staleness_level === "unverified"
  );
}
