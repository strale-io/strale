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
  "system@strale.internal",
  "test@example.com",
  ...EXTRA_EXCLUDED_EMAILS,
];
