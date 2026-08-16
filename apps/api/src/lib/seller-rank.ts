/**
 * Ranking machine-readable catalogues by what agents actually buy.
 *
 * Every discovery surface Strale publishes is a shelf, and until 2026-08-15
 * every one of them was stocked in arbitrary order. The agent card listed 406
 * skills starting with whatever the database returned first; the x402 discovery
 * file lists 334 endpoints the same way. An agent reading either one sees the
 * top of the list, not the middle of it.
 *
 * The fix is the same everywhere: order by external revenue over a rolling
 * window, so the shelf leads with what other agents have already paid for.
 * Shared here rather than copied so a second surface cannot drift from the
 * first — the agent card's copy of this logic is the reason this module exists.
 *
 * Two properties this must never lose:
 *
 *  - **The canonical internal filter.** ~98% of platform traffic is our own
 *    test harness. Ranking without the filter would sort the shelf by what WE
 *    test, which is the wrong-population error catalogued in
 *    docs/company/MEASUREMENT.md — four times in one day.
 *  - **Failing open.** A discovery surface that 500s because a ranking query
 *    failed is worse than one in arbitrary order. Every caller gets an empty
 *    map on error and falls back to alphabetical.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { INTERNAL_EMAIL_LIKE_PATTERNS, EXTRA_EXCLUDED_EMAILS } from "./internal-accounts.js";
import { logWarn } from "./log.js";

const CACHE_TTL_MS = 15 * 60 * 1000;
let cache: Map<string, number> | null = null;
let cachedAt = 0;

/**
 * Cents of external revenue per capability/solution slug over the window.
 * Cached — discovery surfaces are hot and this is a reporting-grade number,
 * not a billing one.
 */
export async function sellerRevenueBySlug(windowDays = 28): Promise<Map<string, number>> {
  const now = Date.now();
  if (cache && now - cachedAt < CACHE_TTL_MS) return cache;
  try {
    const likeAny = sql.join(
      INTERNAL_EMAIL_LIKE_PATTERNS.map((p) => sql`email LIKE ${p}`), sql` OR `);
    const eqAny = sql.join(
      EXTRA_EXCLUDED_EMAILS.map((e) => sql`email = ${e}`), sql` OR `);
    // COALESCE, not a JOIN on capabilities.
    //
    // The join form was capabilities-only, so every solution scored 0 and
    // `rankBySales` over a solution catalogue collapsed to an alphabetical
    // sort wearing a revenue label. Solution executions carry
    // `solution_slug` with `capability_id IS NULL` (schema.ts:244), so they
    // could never match the join — the function's own docstring said
    // "capability/solution slug" while the query could only ever return one
    // of the two.
    const rows = (await getDb().execute(sql`
      SELECT COALESCE(t.solution_slug, c.slug) AS slug,
             COALESCE(SUM(t.price_cents), 0)::int AS cents
      FROM transactions t LEFT JOIN capabilities c ON c.id = t.capability_id
      WHERE t.status = 'completed' AND t.price_cents > 0
        AND COALESCE(t.solution_slug, c.slug) IS NOT NULL
        AND t.created_at > now() - (${String(windowDays)} || ' days')::interval
        AND (t.user_id IS NULL OR t.user_id NOT IN (
          SELECT id FROM users WHERE (${likeAny}) OR (${eqAny})))
      GROUP BY 1`)) as unknown as Array<{ slug: string; cents: number }>;
    cache = new Map(rows.map((r) => [r.slug, Number(r.cents)]));
    cachedAt = now;
    return cache;
  } catch (err) {
    // Fail open: arbitrary order beats a broken discovery surface.
    logWarn("seller-rank-failed", "ranking query failed; discovery falls back to alphabetical", { err: String(err) });
    return new Map();
  }
}

/**
 * Sort a catalogue so proven sellers lead, then free items (an agent's
 * cheapest first step), then everything else alphabetically for stability.
 * `slugOf` lets callers pass their own row shape.
 */
export function rankBySales<T>(
  items: T[],
  revenue: Map<string, number>,
  slugOf: (item: T) => string,
  isFree: (item: T) => boolean = () => false,
): T[] {
  return [...items].sort((a, b) => {
    const ra = revenue.get(slugOf(a)) ?? 0;
    const rb = revenue.get(slugOf(b)) ?? 0;
    if (ra !== rb) return rb - ra;
    const fa = isFree(a) ? 0 : 1;
    const fb = isFree(b) ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return slugOf(a).localeCompare(slugOf(b));
  });
}

/** Test seam — discovery surfaces are cached for 15 minutes in production. */
export function __resetSellerRankCache(): void {
  cache = null;
  cachedAt = 0;
}
