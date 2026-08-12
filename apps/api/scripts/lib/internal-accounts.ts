/**
 * Canonical internal-account exclusion list for analytics and sweep tooling.
 *
 * Any transaction attributed to these emails is Strale's own traffic (founder,
 * test accounts, system) and must be excluded from real-traffic metrics —
 * completion rates, demand analysis, revenue. The quarantine floor
 * (DEC-20260812-A) reads completion rates, so pollution here directly changes
 * catalog decisions.
 *
 * NOTE: since-last-ext.ts, today-overview.ts and window-*.ts still carry
 * hand-copied versions of this list (pre-dating this module). Migrating them
 * is filed under the P2 right-sizing pass — update THIS file first, and sweep
 * the copies until then.
 */
export const EXCLUDED_EMAILS = [
  "petter@strale.io",
  "test@strale.io",
  "test2@strale.io",
  "system@strale.internal",
  "test@example.com",
];
