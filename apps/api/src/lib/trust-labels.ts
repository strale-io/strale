/**
 * Shared trust display helpers — single source of truth for score-to-label
 * mappings, grade conversions, and solution-level aggregation logic.
 *
 * These are DISPLAY functions, not scoring functions. They format data
 * that has already been computed and stored in the capabilities table.
 */

// ─── Score → Label ──────────────────────────────────────────────────────────

/** Map SQS score (0-100) to human-readable label. */
export function sqsLabel(score: number | null): string {
  if (score == null) return "Pending";
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 50) return "Fair";
  if (score >= 25) return "Poor";
  return "Degraded";
}

// ─── Score → Grade ──────────────────────────────────────────────────────────

/** Map QP/RP score to letter grade. Accepts both number and string (Drizzle NUMERIC columns). */
export function gradeFromScore(score: number | string | null): string {
  if (score == null) return "pending";
  const n = typeof score === "string" ? parseFloat(score) : score;
  if (isNaN(n)) return "pending";
  if (n >= 90) return "A";
  if (n >= 75) return "B";
  if (n >= 50) return "C";
  if (n >= 25) return "D";
  return "F";
}

// ─── Solution-level aggregation ─────────────────────────────────────────────

/** Solution SQS = average of step scores, capped at weakest step + 20. */
export function computeSolutionScore(stepScores: number[]): number {
  if (stepScores.length === 0) return 0;
  const avg = stepScores.reduce((a, b) => a + b, 0) / stepScores.length;
  const min = Math.min(...stepScores);
  return Math.round(Math.min(avg, min + 20) * 10) / 10;
}

/** Majority-vote trend from step trends. Stale overrides all. */
export function computeSolutionTrend(stepTrends: (string | null)[]): string {
  const counts: Record<string, number> = {};
  for (const t of stepTrends) {
    const key = t ?? "stable";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  if ((counts["stale"] ?? 0) > 0) return "stale";
  if ((counts["declining"] ?? 0) > (counts["improving"] ?? 0)) return "declining";
  if ((counts["improving"] ?? 0) > (counts["declining"] ?? 0)) return "improving";
  return "stable";
}

const FRESHNESS_ORDER = ["fresh", "aging", "stale", "expired", "unverified"];

/** Returns the worst freshness level among steps. */
export function worstFreshnessLevel(levels: (string | null)[]): string {
  let worst = 0;
  for (const l of levels) {
    const idx = FRESHNESS_ORDER.indexOf(l ?? "fresh");
    if (idx > worst) worst = idx;
  }
  return FRESHNESS_ORDER[worst];
}

/** Returns the oldest last_tested_at among steps. Null if any step was never tested. */
export function oldestTestedAt(dates: (Date | null)[]): string | null {
  let oldest: Date | null = null;
  for (const d of dates) {
    if (d == null) return null;
    if (oldest == null || d < oldest) oldest = d;
  }
  return oldest?.toISOString() ?? null;
}

// ─── Drizzle SQL result helper ──────────────────────────────────────────────

/**
 * Normalize Drizzle db.execute() results. Drizzle returns either an array
 * directly or an object with a `.rows` property depending on the driver.
 * This helper handles both shapes with proper typing.
 */
export function sqlRows<T = Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}
