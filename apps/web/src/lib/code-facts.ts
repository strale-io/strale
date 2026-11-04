// Facts the public API does not publish but the site must state correctly,
// read from the API source at build time so the code stays the one source.
// A constant that moves or is renamed fails the build instead of going stale.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT } from "./site-data.ts";

function constant(file: string, name: string): number {
  const text = readFileSync(resolve(REPO_ROOT, file), "utf8");
  const m = text.match(new RegExp(`const ${name}\\s*=\\s*(\\d+)`));
  if (!m) throw new Error(`apps/web expected ${name} in ${file}; update src/lib/code-facts.ts if it moved`);
  return Number(m[1]);
}

/**
 * Anonymous calls a calendar month to free tools, per IP address (`free_tier_monthly_limit` in
 * apps/api/src/lib/platform-facts.ts, enforced by free-tier-allowance.ts). It replaced the
 * daily limit on main; the site read the old constant until 2026-11-02.
 */
export const FREE_TIER_MONTHLY_LIMIT = (() => {
  const file = "apps/api/src/lib/platform-facts.ts";
  const m = readFileSync(resolve(REPO_ROOT, file), "utf8").match(/free_tier_monthly_limit:\s*(\d+)/);
  if (!m) throw new Error(`apps/web expected free_tier_monthly_limit in ${file}; update src/lib/code-facts.ts if it moved`);
  return Number(m[1]);
})();
/** Smallest wallet top-up, in EUR cents (apps/api/src/lib/pricing-constants.ts). */
export const MIN_TOPUP_CENTS = constant("apps/api/src/lib/pricing-constants.ts", "MIN_TOPUP_CENTS");

/** The provenance.source string an executor writes, when it is a literal. */
export function executorSource(slug: string): string | null {
  try {
    const text = readFileSync(resolve(REPO_ROOT, "apps/api/src/capabilities", `${slug}.ts`), "utf8");
    return text.match(/provenance:\s*\{[^}]*?source:\s*"([^"]+)"/)?.[1] ?? null;
  } catch {
    return null;
  }
}
/** Hard ceiling on max_price_cents for one API call, in EUR cents (apps/api/src/routes/do.ts). */
export const MAX_PRICE_CAP_CENTS = constant("apps/api/src/routes/do.ts", "MAX_PRICE_CAP_CENTS");
