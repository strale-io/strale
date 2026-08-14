/**
 * Canonical internal-account rule.
 *
 * Any traffic attributable to these accounts is Strale's own (founder, test
 * accounts, system) and must be excluded from real-traffic metrics —
 * completion rates, demand analysis, revenue. The quality floor
 * (DEC-20260812-A) reads completion rates, so pollution here directly
 * changes catalog decisions.
 *
 * Review H-3 (2026-08-12): this is a SUFFIX rule plus extras — matching
 * lib/daily-digest/fetch-platform.ts, which had the platform's real rule all
 * along — not a literal address list. A literal list silently counted
 * founder debugging accounts (which concentrate on broken capabilities) as
 * customers.
 *
 * Runtime consumers import from here; scripts/lib/internal-accounts.ts
 * re-exports for operator tooling. fetch-platform.ts's local copy is a P2
 * dedup item.
 */

export const INTERNAL_EMAIL_SUFFIXES = [
  "@strale.io",
  "@strale.dev",
  "@strale.internal",
  "@example.com",
];

/**
 * The account the test runner books its own executions against.
 *
 * Exported so the writer — `test-runner.ts`, which creates the account and
 * books against it — shares a definition with the exclusion rule below rather
 * than repeating the address. That one coupling is load-bearing in a way that
 * is easy to miss: the scheduler's
 * executions land in `transactions` as ordinary `status='failed'` rows —
 * including the ALLOW_MATRIX refusals the dispatcher gate raises when it
 * correctly declines to spend vendor credits on a paid capability from a test
 * context. 91 such rows in the last 30 days.
 *
 * Those rows classify as `internal` — the "our bug until proven otherwise"
 * bucket — and would count against the completion rate the quality floor uses
 * to quarantine and propose deactivation (DEC-20260812-A). The only reason
 * they don't is that the floor filters this address out by suffix. Change the
 * address to something outside INTERNAL_EMAIL_SUFFIXES and the floor starts
 * quarantining paid capabilities for a cost-control policy working exactly as
 * intended — silently, since nothing else would look wrong.
 *
 * Wiring the writer is not the same as removing the literal everywhere. The
 * address is still hardcoded, unconnected to this constant, in
 * `routes/capabilities.ts` (:68, :181) and `lib/daily-digest/fetch-platform.ts`
 * (:22) as inline SQL, in `routes/admin.ts` (:298), and in
 * `scripts/since-last-ext.ts` / `scripts/window-inputs.ts`. None of those is a
 * scoring or quarantine consumer — the capabilities.ts pair filter
 * `status='completed'`, admin.ts dumps raw activity, the scripts are operator
 * tooling — so renaming the account would skew reporting rather than trip the
 * floor. Still worth a dedup pass; the point of naming them here is that this
 * constant does not yet make them safe.
 */
export const SYSTEM_ACCOUNT_EMAIL = "system@strale.internal";

export const EXTRA_EXCLUDED_EMAILS = [
  // Founder personal account (Railway CLI, ad-hoc testing).
  "petterlindstrom@hotmail.com",
];

/** SQL LIKE patterns for the suffix rule (postgres `LIKE ANY(...)`). */
export const INTERNAL_EMAIL_LIKE_PATTERNS = INTERNAL_EMAIL_SUFFIXES.map((s) => `%${s}`);

export function isInternalAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return (
    INTERNAL_EMAIL_SUFFIXES.some((s) => e.endsWith(s)) ||
    EXTRA_EXCLUDED_EMAILS.includes(e)
  );
}

/**
 * Back-compat literal list for tools that filter by exact address. Prefer
 * isInternalAccountEmail / the SQL patterns — this cannot express the suffix
 * rule and exists only for the operator scripts' equality filters.
 */
export const EXCLUDED_INTERNAL_EMAILS = [
  "petter@strale.io",
  "test@strale.io",
  "test2@strale.io",
  SYSTEM_ACCOUNT_EMAIL,
  "test@example.com",
  ...EXTRA_EXCLUDED_EMAILS,
];
