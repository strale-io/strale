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

/** Slugs of capabilities the platform has withdrawn (`visible = false`). */
let cache: { at: number; slugs: Set<string> } | null = null;
const CACHE_TTL_MS = 60_000;

/** Keys whose value is a capability slug somewhere in the public-ops surface. */
const SLUG_KEYS = ["capability_slug", "capabilitySlug", "slug"] as const;

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
export async function withdrawnSlugs(): Promise<Set<string>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.slugs;
  try {
    const rows = (await getDb().execute(
      sql`SELECT slug FROM capabilities WHERE visible = false`,
    )) as unknown as Array<{ slug: string }>;
    cache = { at: now, slugs: new Set(rows.map((r) => r.slug)) };
    return cache.slugs;
  } catch (error) {
    log.error(
      { label: "public-ops-withdrawn-lookup-failed", err: String(error) },
      "public-ops-withdrawn-lookup-failed",
    );
    // Keep serving the last known set rather than declaring nothing withdrawn.
    if (cache) return cache.slugs;
    throw error;
  }
}

/** True when `value` is a plain object we should walk into. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The capability slug this node names, if any. */
function slugOf(node: unknown): string | null {
  if (!isRecord(node)) return null;
  for (const key of SLUG_KEYS) {
    const v = node[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

/**
 * Remove every node naming a withdrawn capability.
 *
 * Array elements are dropped. An object that names one at its root is the
 * caller asking about it directly, which `redactWithdrawn` reports separately
 * so the route can answer 404 rather than an empty shell — a 200 with the
 * fields blanked still confirms the slug exists.
 */
export function pruneWithdrawn(node: unknown, withdrawn: Set<string>): unknown {
  if (Array.isArray(node)) {
    return node
      .filter((item) => {
        const slug = slugOf(item);
        return !(slug && withdrawn.has(slug));
      })
      .map((item) => pruneWithdrawn(item, withdrawn));
  }
  if (isRecord(node)) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] = pruneWithdrawn(value, withdrawn);
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
  withdrawn: Set<string>,
): boolean {
  const fromQuery = query.capability_slug ?? query.slug;
  if (fromQuery && withdrawn.has(fromQuery)) return true;
  // /v1/public/ops/tests/capabilities/<slug>[/...] and
  // /v1/public/ops/limitations/<slug>
  for (const segment of path.split("/")) {
    if (segment && withdrawn.has(segment)) return true;
  }
  return false;
}
