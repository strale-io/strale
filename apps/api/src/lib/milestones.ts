/**
 * Transaction milestone tracker.
 * Fires a webhook when daily transaction count crosses milestones (10, 50, 100, 500, 1000).
 * Resets at midnight UTC.
 */

import { sendWebhook } from "./webhook.js";

const MILESTONES = [10, 50, 100, 500, 1000];

let notifiedToday = new Set<number>();
let currentDateStr = todayUTC();

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Call after every successful transaction.
 * Checks if a milestone was crossed and fires a webhook if so.
 */
export function checkMilestone(todayTransactionCount: number): void {
  // Reset at midnight UTC
  const today = todayUTC();
  if (today !== currentDateStr) {
    notifiedToday = new Set<number>();
    currentDateStr = today;
  }

  for (const milestone of MILESTONES) {
    if (todayTransactionCount >= milestone && !notifiedToday.has(milestone)) {
      notifiedToday.add(milestone);
      sendWebhook({
        event: "milestone.transactions",
        milestone,
        date: today,
        total_transactions_today: todayTransactionCount,
      }).catch(() => {});
    }
  }
}
