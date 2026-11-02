/** Shared freshness display helpers for solution steps. */

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
