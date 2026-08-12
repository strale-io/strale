/**
 * Canonical internal-account exclusion list.
 *
 * Any transaction attributed to these emails is Strale's own traffic
 * (founder, test accounts, system) and must be excluded from real-traffic
 * metrics — completion rates, demand analysis, revenue. The quality floor
 * (DEC-20260812-A) reads completion rates, so pollution here directly
 * changes catalog decisions.
 *
 * Runtime consumers import from here; scripts/lib/internal-accounts.ts
 * re-exports for operator tooling. The hand-copied lists still in
 * since-last-ext.ts / today-overview.ts / window-*.ts are a P2 cleanup item.
 */
export const EXCLUDED_INTERNAL_EMAILS = [
  "petter@strale.io",
  "test@strale.io",
  "test2@strale.io",
  "system@strale.internal",
  "test@example.com",
];
