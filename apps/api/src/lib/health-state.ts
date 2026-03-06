export type HealthState = "new" | "unstable" | "recovering" | "stable" | "established";

export function computeHealthState(
  history30d: Array<{ date: string; pass_rate: number }>,
): HealthState {
  if (history30d.length === 0) return "new";

  // History is date-ascending; reverse to check from most recent
  const recent = [...history30d].reverse();

  // Count consecutive perfect days from most recent
  let consecutivePerfect = 0;
  for (const day of recent) {
    if (day.pass_rate >= 100) consecutivePerfect++;
    else break;
  }

  // Check for any failure in last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentFailure = history30d.some(
    (d) => d.pass_rate < 100 && new Date(d.date) >= sevenDaysAgo,
  );

  if (recentFailure && consecutivePerfect < 3) return "unstable";
  if (consecutivePerfect < 7) return "recovering";
  if (consecutivePerfect < 14) return "stable";
  return "established";
}

/** Map health state to test frequency in hours. */
export const HEALTH_STATE_FREQUENCY_HOURS: Record<HealthState, number> = {
  new: 6,
  unstable: 6,
  recovering: 12,
  stable: 24,
  established: 48,
};
