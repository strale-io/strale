/**
 * Withdrawal guard for the `/v1/public/ops/*` surface.
 *
 * **Why this is a response guard and not another WHERE clause.** Four rounds
 * of review chased "does this query filter `visible`" through ~90 reads of the
 * `capabilities` table, and the fourth round found four more leaks that a
 * hundred such greps could never have found: `/v1/public/ops/events`,
 * `/onboarding/readiness`, `/limitations/solutions/:slug`,
 * `/tests/solutions/:slug` and `/tests/capabilities/:slug/example-output` read
 * `health_monitor_events`, `test_suites`, `test_results` and `solution_steps`
 * — tables that carry `capability_slug` as a bare string with no foreign key
 * and no join to `capabilities` at all. The query-side rule cannot see them,
 * and the next table to carry a slug will be invisible to it too.
 *
 * So the guard is on the output. Whatever a public-ops handler produces, and
 * however it produced it, a slug the platform has withdrawn does not leave
 * this boundary. That also survives someone adding a route later without
 * knowing any of this history, which the query-side rule does not.
 *
 * **Why only `/v1/public/ops/*`.** The same routers are mounted at
 * `/v1/internal/*` for operators, who must see withdrawn capabilities — that
 * is most of what an operator looks at. `app.ts` already treats the allowlist
 * rather than the router as the access boundary; this sits in the same place,
 * for the same reason.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { log } from "./log.js";

/**
 * Withdrawn capability slugs, plus every solution slug.
 *
 * The second set exists because `slug` is a generic key: a solutions payload
 * uses it for the solution's own slug, and the two tables are separate
 * namespaces with nothing stopping a collision. There is none today (checked),
 * but "safe because two things happen not to collide" is the reasoning that
 * left the x402 rail open in this same change — a capability was unreachable
 * there only because the quality floor happens to clear two flags together,
 * and the unpublish endpoint clears one. So the guard does not rely on it.
 */
let cache: { at: number; withdrawn: Set<string>; solutionSlugs: Set<string> } | null = null;
const CACHE_TTL_MS = 60_000;

/** Keys whose value is a capability slug somewhere in the public-ops surface. */
const SLUG_KEYS = ["capability_slug", "capabilitySlug", "slug"] as const;

/** The withdrawn capabilities, and the solution namespace to keep clear of. */
export interface WithdrawalSets {
  at: number;
  withdrawn: Set<string>;
  solutionSlugs: Set<string>;
}

export function resetWithdrawnCacheForTests(): void {
  cache = null;
}

/**
 * The withdrawn set, cached for a minute.
 *
 * Fails CLOSED on a database error — an empty set would mean "nothing is
 * withdrawn", which is exactly the disclosure this exists to stop, so a stale
 * set is preferred and a missing one is reported rather than assumed benign.
 */
export async function withdrawnSlugs(): Promise<WithdrawalSets> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache;
  try {
    const db = getDb();
    const [caps, sols] = await Promise.all([
      db.execute(sql`SELECT slug FROM capabilities WHERE visible = false`),
      db.execute(sql`SELECT slug FROM solutions`),
    ]);
    cache = {
      at: now,
      withdrawn: new Set((caps as unknown as Array<{ slug: string }>).map((r) => r.slug)),
      solutionSlugs: new Set((sols as unknown as Array<{ slug: string }>).map((r) => r.slug)),
    };
    return cache;
  } catch (error) {
    log.error(
      { label: "public-ops-withdrawn-lookup-failed", err: String(error) },
      "public-ops-withdrawn-lookup-failed",
    );
    // Keep serving the last known sets rather than declaring nothing withdrawn.
    if (cache) return cache;
    throw error;
  }
}

/** True when `value` is a plain object we should walk into. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The capability slug this node names, if any.
 *
 * `capability_slug` is unambiguous. A bare `slug` is not — it is also how a
 * solution names itself — so a value that is a known solution slug is not
 * treated as a capability, whatever a same-named capability's visibility is.
 */
function slugOf(node: unknown, sets: WithdrawalSets): string | null {
  if (!isRecord(node)) return null;
  for (const key of SLUG_KEYS) {
    const v = node[key];
    if (typeof v !== "string" || v.length === 0) continue;
    if (key === "slug" && sets.solutionSlugs.has(v)) return null;
    return v;
  }
  return null;
}

/**
 * Remove every node naming a withdrawn capability.
 *
 * Array elements are dropped, and so are object ENTRIES whose key is a
 * withdrawn slug — `/v1/public/ops/trust/capabilities/batch` answers with a
 * map keyed by slug (`{"page-speed-test": {badge, pass_rate, …}}`), so a guard
 * that only inspected values walked straight past it. Found by fetching the
 * endpoint rather than by reading the pruner, which is the same lesson this
 * whole change keeps relearning.
 *
 * An object that names one at its root is the caller asking about it
 * directly; the middleware answers 404 for that rather than an empty shell,
 * because a 200 with the fields blanked still confirms the slug exists.
 */
export function pruneWithdrawn(node: unknown, sets: WithdrawalSets): unknown {
  if (Array.isArray(node)) {
    return node
      .filter((item) => {
        const slug = slugOf(item, sets);
        return !(slug && sets.withdrawn.has(slug));
      })
      .map((item) => pruneWithdrawn(item, sets));
  }
  if (isRecord(node)) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      // A key that is a withdrawn capability slug is a slug-keyed map entry.
      // The solution namespace is respected here too: a solutions batch keyed
      // by solution slug must survive even if a capability of that name is
      // withdrawn.
      if (sets.withdrawn.has(key) && !sets.solutionSlugs.has(key)) continue;
      out[key] = pruneWithdrawn(value, sets);
    }
    return out;
  }
  return node;
}

/**
 * Does this request name a withdrawn capability directly — in its path or in a
 * `capability_slug` query parameter? Those get 404, not a pruned body.
 */
export function requestNamesWithdrawn(
  path: string,
  query: Record<string, string | undefined>,
  sets: WithdrawalSets,
): boolean {
  const fromQuery = query.capability_slug ?? query.slug;
  if (fromQuery && sets.withdrawn.has(fromQuery)) return true;
  // /v1/public/ops/tests/capabilities/<slug>[/...] and
  // /v1/public/ops/limitations/<slug>. A path segment naming a SOLUTION is
  // left alone even if a withdrawn capability shares the name — the solution
  // is a different resource and refusing it would be a new outage, not a fix.
  for (const segment of path.split("/")) {
    if (!segment || sets.solutionSlugs.has(segment)) continue;
    if (sets.withdrawn.has(segment)) return true;
  }
  return false;
}
