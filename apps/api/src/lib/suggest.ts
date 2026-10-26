import { eq, and, asc, inArray, sql } from "drizzle-orm";
import { SERVABLE_LIFECYCLE_STATES } from "./x402-eligibility.js";
import { getDb } from "../db/index.js";
import { solutions, solutionSteps, capabilities } from "../db/schema.js";
import { createKeywordIndex, type SearchItem } from "./search/keyword.js";
import { groupSolutionVariants } from "./search/ranking.js";
import { createSearchRanker, buildCatalogPrompt } from "./search/smart.js";
export {
  applyConditionalSolutionBonus,
  isSlugFamilyMatch,
} from "./search/ranking.js";
import { determineBadge } from "./trust-helpers.js";
import { logError, logWarn } from "./log.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TrustSummary {
  badge: string;
  badge_label: string;
  avg_response_time_ms: number | null;
  tests_passing: number;
  tests_total: number;
  last_tested_at: string | null;
  data_source: "internal_testing" | "blended" | "customer_transactions";
}

export interface CatalogItem extends SearchItem {
  type: "solution" | "capability";
  slug: string;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  geography: string | null;
  steps?: Array<{
    name: string;
    capabilitySlug: string;
    parallelGroup: number | null;
  }>;
  stepCount?: number;
  partOfSolutions?: Array<{
    slug: string;
    name: string;
    priceCents: number;
    otherCapabilityNames: string[];
  }>;
  isFreeTier: boolean;
  search_tags: string[];
  trustSummary?: TrustSummary;
}

interface SuggestRecommendation {
  type: "solution" | "capability";
  slug: string;
  name: string;
  description: string;
  match_reason: string;
  price_cents: number;
  steps?: Array<{
    name: string;
    capability_slug: string;
    parallel_group: number | null;
  }>;
  step_count?: number;
  geography?: string;
  badge?: string;
  category?: string;
  part_of_solution?: {
    slug: string;
    name: string;
    price_cents: number;
    extra_description: string;
  } | null;
  trust?: TrustSummary;
}

export interface SuggestResponse {
  recommendation: SuggestRecommendation | null;
  alternatives: SuggestRecommendation[];
  total_matches: number;
  query_understood_as: string;
}

// ─── Query normalization ────────────────────────────────────────────────────

const FILLER_PREFIXES = [
  "i want to ",
  "i need to ",
  "i'd like to ",
  "i would like to ",
  "can you help me ",
  "help me ",
  "how do i ",
  "how can i ",
  "please ",
  "i'm looking for ",
  "i am looking for ",
  "find me ",
  "show me ",
  "search for ",
  "looking for ",
  "we need to ",
  "my agent needs to ",
];

function normalizeQuery(raw: string): string {
  let q = raw.toLowerCase().trim();

  for (const prefix of FILLER_PREFIXES) {
    if (q.startsWith(prefix)) {
      q = q.slice(prefix.length);
      break;
    }
  }

  q = q.replace(/[?.!]+$/, "").trim();
  return q;
}

// ─── Query result cache ─────────────────────────────────────────────────────

interface QueryCacheEntry {
  response: SuggestResponse;
  expiresAt: number;
}

const queryCache = new Map<string, QueryCacheEntry>();
const QUERY_CACHE_TTL_MS = 10 * 60 * 1000;

function getQueryCached(key: string): SuggestResponse | null {
  const entry = queryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    queryCache.delete(key);
    return null;
  }
  return entry.response;
}

function setQueryCache(key: string, response: SuggestResponse): void {
  if (queryCache.size >= 500) {
    const now = Date.now();
    for (const [k, v] of queryCache) {
      if (now > v.expiresAt) queryCache.delete(k);
    }
  }
  if (queryCache.size >= 500)
    queryCache.delete(queryCache.keys().next().value!);
  queryCache.set(key, {
    response,
    expiresAt: Date.now() + QUERY_CACHE_TTL_MS,
  });
}

// ─── Catalog cache ──────────────────────────────────────────────────────────

const CATALOG_CACHE_TTL_MS = 10 * 60 * 1000; // Catalogue and trust data refresh together
let catalog: CatalogItem[] | null = null;
let catalogCachedAt = 0;
let catalogLoading: Promise<CatalogItem[]> | null = null;
let keywordIndex: ReturnType<typeof createKeywordIndex<CatalogItem>> | null =
  null;
let catalogPrompt = "";
const rankWithModel = createSearchRanker();

async function loadCatalog(): Promise<CatalogItem[]> {
  const now = Date.now();
  if (catalog && now - catalogCachedAt < CATALOG_CACHE_TTL_MS) return catalog;

  // Thundering herd guard
  if (catalogLoading) return catalogLoading;

  catalogLoading = (async () => {
    try {
      const db = getDb();
      // Load solutions with steps
      const solRows = await db
        .select({
          id: solutions.id,
          slug: solutions.slug,
          name: solutions.name,
          description: solutions.description,
          agentDescription: solutions.agentDescription,
          category: solutions.category,
          priceCents: solutions.priceCents,
          geography: solutions.geography,
          searchTags: solutions.searchTags,
        })
        .from(solutions)
        .where(eq(solutions.isActive, true))
        .orderBy(asc(solutions.displayOrder));
      // Batch-fetch ALL steps for ALL solutions in one query (eliminates N+1)
      const solIds = solRows.map((s) => s.id);
      const allSolSteps =
        solIds.length > 0
          ? await db
              .select({
                solutionId: solutionSteps.solutionId,
                capabilitySlug: solutionSteps.capabilitySlug,
                parallelGroup: solutionSteps.parallelGroup,
                capabilityName: capabilities.name,
              })
              .from(solutionSteps)
              // Same withdrawal rule as GET /v1/solutions. These names reach the
              // public response as `extra_description`: "also includes …", so a
              // withdrawn capability was being suggested by name to a caller
              // whenever it shared a solution with a matched one.
              .innerJoin(
                capabilities,
                and(
                  eq(solutionSteps.capabilitySlug, capabilities.slug),
                  eq(capabilities.visible, true)
                )
              )
              .where(inArray(solutionSteps.solutionId, solIds))
              .orderBy(solutionSteps.solutionId, asc(solutionSteps.stepOrder))
          : [];
      const stepsBySolId = new Map<string, typeof allSolSteps>();
      for (const step of allSolSteps) {
        const list = stepsBySolId.get(step.solutionId) ?? [];
        list.push(step);
        stepsBySolId.set(step.solutionId, list);
      }

      const solItems: CatalogItem[] = solRows.map((sol) => {
        const steps = stepsBySolId.get(sol.id) ?? [];
        return {
          type: "solution" as const,
          slug: sol.slug,
          name: sol.name,
          description: sol.description,
          category: sol.category,
          priceCents: sol.priceCents,
          isFreeTier: false,
          geography: sol.geography,
          steps: steps.map((s) => ({
            name: s.capabilityName ?? s.capabilitySlug,
            capabilitySlug: s.capabilitySlug,
            parallelGroup: s.parallelGroup,
          })),
          stepCount: steps.length,
          search_tags: sol.searchTags ?? [],
        };
      });

      // Load capabilities
      const capRows = await db
        .select({
          slug: capabilities.slug,
          name: capabilities.name,
          description: capabilities.description,
          category: capabilities.category,
          priceCents: capabilities.priceCents,
          isFreeTier: capabilities.isFreeTier,
          geography: capabilities.geography,
          searchTags: capabilities.searchTags,
        })
        .from(capabilities)
        .where(
          and(
            eq(capabilities.isActive, true),
            eq(capabilities.visible, true),
            // strale.dev surfacing per DEC-20260503-A — semantic suggest
            // mirrors the public marketplace.
            eq(capabilities.marketplaceEligible, true),
            // WP8: was ["active","degraded"] — MORE permissive than the
            // servability floor, so this recommended capabilities /v1/do then
            // refused. A recommender may be stricter than the floor; it may
            // never be looser.
            inArray(capabilities.lifecycleState, [...SERVABLE_LIFECYCLE_STATES])
          )
        );

      const capItems: CatalogItem[] = capRows.map((cap) => {
        return {
          type: "capability" as const,
          slug: cap.slug,
          name: cap.name,
          description: cap.description,
          category: cap.category,
          priceCents: cap.priceCents,
          isFreeTier: cap.isFreeTier,
          geography: cap.geography ?? "global",
          search_tags: cap.searchTags ?? [],
        };
      });

      const allItems = [...solItems, ...capItems];

      // Build reverse index: capability → solutions containing it
      for (const cap of capItems) {
        const parents = solItems.filter((sol) =>
          sol.steps?.some((s) => s.capabilitySlug === cap.slug)
        );
        if (parents.length > 0) {
          cap.partOfSolutions = parents.map((sol) => ({
            slug: sol.slug,
            name: sol.name,
            priceCents: sol.priceCents,
            otherCapabilityNames: (sol.steps ?? [])
              .filter((s) => s.capabilitySlug !== cap.slug)
              .map((s) => s.name),
          }));
        }
      }

      // Batch-fetch persisted success-rate / latency and test counts (2 queries instead of ~5,355)
      const allCapSlugs = capItems.map((c) => c.slug);
      const allStepSlugs = solItems.flatMap((s) =>
        (s.steps ?? []).map((st) => st.capabilitySlug)
      );
      const allSlugsNeeded = [...new Set([...allCapSlugs, ...allStepSlugs])];

      const [persistedRows, testCountRows] = await Promise.all([
        // Query 1: Persisted success-rate + latency from capabilities table
        allSlugsNeeded.length > 0
          ? db
              .select({
                slug: capabilities.slug,
                successRate: capabilities.successRate,
                avgLatencyMs: capabilities.avgLatencyMs,
              })
              .from(capabilities)
              .where(
                and(
                  eq(capabilities.isActive, true),
                  inArray(capabilities.slug, allSlugsNeeded)
                )
              )
          : Promise.resolve([]),
        // Query 2: Batch test pass/fail counts + last tested (one query for all slugs)
        allSlugsNeeded.length > 0
          ? db.execute(sql`
              WITH latest_results AS (
                SELECT DISTINCT ON (tr.test_suite_id)
                  tr.capability_slug,
                  tr.passed,
                  tr.executed_at
                FROM test_results tr
                INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
                WHERE ts.active = true
                  AND tr.capability_slug IN (${sql.join(
                    allSlugsNeeded.map((s) => sql`${s}`),
                    sql`, `
                  )})
                ORDER BY tr.test_suite_id, tr.executed_at DESC
              )
              SELECT
                capability_slug,
                COUNT(*) FILTER (WHERE passed = true)::int AS passed,
                COUNT(*)::int AS total,
                MAX(executed_at) AS last_tested_at
              FROM latest_results
              GROUP BY capability_slug
            `)
          : Promise.resolve([]),
      ]);

      // Build lookup maps
      const persistedMap = new Map(persistedRows.map((r) => [r.slug, r]));
      const testCountRaw = Array.isArray(testCountRows)
        ? testCountRows
        : (testCountRows as any)?.rows ?? [];
      const testCountMap = new Map<
        string,
        { passed: number; total: number; last_tested_at: string | null }
      >();
      for (const r of testCountRaw as any[]) {
        testCountMap.set(r.capability_slug, {
          passed: Number(r.passed),
          total: Number(r.total),
          last_tested_at: r.last_tested_at
            ? new Date(r.last_tested_at).toISOString()
            : null,
        });
      }

      // Assign trust summaries from batch data
      for (const item of allItems) {
        try {
          if (item.type === "capability") {
            const persisted = persistedMap.get(item.slug);
            const tests = testCountMap.get(item.slug);
            const sr = persisted?.successRate
              ? parseFloat(persisted.successRate)
              : null;
            const { badge, badge_label } = determineBadge(
              tests?.total ?? 0,
              0,
              sr
            );

            item.trustSummary = {
              badge,
              badge_label,
              avg_response_time_ms: persisted?.avgLatencyMs ?? null,
              tests_passing: tests?.passed ?? 0,
              tests_total: tests?.total ?? 0,
              last_tested_at: tests?.last_tested_at ?? null,
              data_source: "internal_testing",
            };
          } else {
            // Solution: aggregate from step capabilities
            const stepSlugs = (item.steps ?? []).map((s) => s.capabilitySlug);
            let totalPassed = 0;
            let totalTests = 0;
            let lastTestedAt: string | null = null;

            for (const ss of stepSlugs) {
              const tests = testCountMap.get(ss);
              if (tests) {
                totalPassed += tests.passed;
                totalTests += tests.total;
                if (tests.last_tested_at) {
                  if (!lastTestedAt || tests.last_tested_at > lastTestedAt) {
                    lastTestedAt = tests.last_tested_at;
                  }
                }
              }
            }

            const { badge, badge_label } = determineBadge(totalTests, 0, null);

            item.trustSummary = {
              badge,
              badge_label,
              avg_response_time_ms: null,
              tests_passing: totalPassed,
              tests_total: totalTests,
              last_tested_at: lastTestedAt,
              data_source: "internal_testing",
            };
          }
        } catch (err) {
          logWarn("suggest-trust-load-failed", "failed to load trust data", {
            slug: item.slug,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // One immutable search index and deterministic prompt per catalogue load.
      keywordIndex = createKeywordIndex(allItems);
      catalogPrompt = buildCatalogPrompt(allItems);
      queryCache.clear();

      catalog = allItems;
      catalogCachedAt = Date.now();
      return allItems;
    } catch (err) {
      logError("suggest-catalog-load-failed", err);
      throw err;
    } finally {
      catalogLoading = null;
    }
  })();

  return catalogLoading;
}

/** Pre-warm the catalog on startup. */
export async function warmCatalog(): Promise<void> {
  await loadCatalog();
}

// ─── Typeahead (in-memory, no LLM) ──────────────────────────────────────────

export interface TypeaheadResult {
  type: "solution" | "capability";
  slug: string;
  name: string;
  description: string;
  category: string;
  price_cents: number | null;
  geography: string | null;
  is_free_tier?: boolean;
  step_count?: number;
  match_snippet?: string;
  also_available_for?: string[];
}

export interface TypeaheadResponse {
  results: TypeaheadResult[];
  total: number;
}

export async function typeahead(
  query: string,
  limit: number,
  geo?: string,
  typeFilter?: "solution" | "capability"
): Promise<TypeaheadResponse> {
  const items = await loadCatalog();
  return typeaheadFromCatalog(
    items,
    keywordIndex!,
    query,
    limit,
    geo,
    typeFilter
  );
}

/** Pure wire adapter used by the offline harness and contract tests. */
export function typeaheadFromCatalog(
  items: CatalogItem[],
  index: ReturnType<typeof createKeywordIndex<CatalogItem>>,
  query: string,
  limit: number,
  geo?: string,
  typeFilter?: "solution" | "capability"
): TypeaheadResponse {
  const scored = index.search(query, { geo, type: typeFilter });
  const deduped = groupSolutionVariants(scored, items);
  const total = deduped.length;
  const topItems = deduped.slice(0, limit);

  const results: TypeaheadResult[] = topItems.map(
    ({ item, alsoAvailable, snippet }) => {
      const result: TypeaheadResult = {
        type: item.type,
        slug: item.slug,
        name: item.name,
        description: item.description,
        category: item.category,
        // DEC-20260304-A: price_cents MUST be null for capabilities
        price_cents: item.type === "solution" ? item.priceCents : null,
        geography: item.geography,
        is_free_tier: item.isFreeTier || undefined,
      };
      if (item.type === "solution" && item.stepCount) {
        result.step_count = item.stepCount;
      }
      if (snippet) result.match_snippet = snippet;
      if (alsoAvailable && alsoAvailable.length > 0) {
        result.also_available_for = alsoAvailable;
      }
      return result;
    }
  );

  // Fallback: if type filter produced zero results, retry without filter
  if (results.length === 0 && typeFilter) {
    return typeaheadFromCatalog(items, index, query, limit, geo);
  }

  return { results, total };
}

// ─── Main suggest function ──────────────────────────────────────────────────

/**
 * Longest query this engine will consider.
 *
 * Enforced here rather than only at the route, because a route-level cap
 * protects one caller and this engine has more than one. `POST /v1/suggest`
 * capped queries at 500 characters; `POST /a2a` reached the same engine with
 * whatever text a message part carried, bounded only by a 256 KB body limit.
 * A query can reach a billed Anthropic search request, so the ceiling
 * belongs with the work, not with one of the doors to it.
 */
export const MAX_SUGGEST_QUERY_CHARS = 500;

/** Thrown when a caller exceeds {@link MAX_SUGGEST_QUERY_CHARS}. Callers map
 *  this onto whatever their protocol's client-error shape is. */
export class SuggestQueryTooLongError extends Error {
  readonly maxChars = MAX_SUGGEST_QUERY_CHARS;
  constructor(actualChars: number) {
    super(
      `Query must be under ${MAX_SUGGEST_QUERY_CHARS} characters (received ${actualChars}).`
    );
    this.name = "SuggestQueryTooLongError";
  }
}

/**
 * Throw unless `query` is within the ceiling.
 *
 * Both routes pre-validate so they can answer in their own error shape rather
 * than let the throw escape, and `suggest()` checks again as its own guard.
 * That is three call sites, so the comparison itself lives here — the shared
 * constant keeps the threshold from drifting, but only a shared function keeps
 * the semantics from drifting (trimmed or not, `>` or `>=`).
 */
export function assertSuggestQueryLength(query: string): void {
  if (query.length > MAX_SUGGEST_QUERY_CHARS) {
    throw new SuggestQueryTooLongError(query.length);
  }
}

export async function suggest(req: {
  query: string;
  limit?: number;
  clientIp?: string;
}): Promise<SuggestResponse> {
  // Before anything else, including the cache lookup — an oversized query must
  // not be normalized, hashed or stored, only refused.
  assertSuggestQueryLength(req.query);
  if (req.query.trim().length < 2)
    return {
      recommendation: null,
      alternatives: [],
      total_matches: 0,
      query_understood_as: req.query.trim(),
    };

  const normalized = normalizeQuery(req.query);
  const limit = Math.min(
    10,
    Math.max(1, Number.isFinite(req.limit) ? Math.floor(req.limit!) : 3)
  );
  // Load first so a catalogue refresh invalidates query-cache entries too.
  const items = await loadCatalog();
  const cacheKey = `${limit}:${normalized}`;
  const cached = getQueryCached(cacheKey);
  if (cached) return cached;
  const scored = keywordIndex!.search(normalized, { prefix: false });
  const ranking = await rankWithModel({
    prompt: catalogPrompt,
    query: req.query,
    limit,
    ip: req.clientIp ?? "unknown",
    slugs: new Set(items.map((i) => i.slug)),
    confidentKeyword:
      (scored[0]?.coverage ?? 0) >= 0.6 && (scored[0]?.score ?? 0) >= 3,
  });
  const result = ranking
    ? responseFromPicks(
        ranking.understood_as,
        ranking.results.map((r) => ({
          item: items.find((i) => i.slug === r.slug)!,
          reason: r.reason,
        })),
        limit,
        ranking.results.length
      )
    : keywordResponse(normalized, scored, limit, items);
  // Budget-limited/error fallbacks are not cached: one IP must not poison the
  // shared normalized-query cache for other callers or after transient outages.
  if (ranking) setQueryCache(cacheKey, result);
  return result;
}

export function keywordResponse(
  query: string,
  scored: Array<{ item: CatalogItem }>,
  limit: number,
  items: CatalogItem[] = scored.map((s) => s.item)
): SuggestResponse {
  const result = responseFromPicks(
    query,
    scored.map(({ item }) => ({
      item,
      reason: `Matches “${query.trim()}” in the catalogue.`,
    })),
    limit,
    scored.length
  );
  const best = scored[0]?.item;
  const parentSlug =
    best?.type === "capability" ? best.partOfSolutions?.[0]?.slug : undefined;
  if (
    parentSlug &&
    result.alternatives.length < limit &&
    !result.alternatives.some((a) => a.slug === parentSlug)
  ) {
    const parent = items.find(
      (i) => i.type === "solution" && i.slug === parentSlug
    );
    if (parent)
      result.alternatives.push(
        buildRecommendation(
          parent,
          `A broader workflow including ${best!.name}.`
        )
      );
  }
  return result;
}

export function responseFromPicks(
  query: string,
  picks: Array<{ item: CatalogItem; reason: string }>,
  limit: number,
  total: number
): SuggestResponse {
  const [best, ...rest] = picks;
  if (!best)
    return {
      recommendation: null,
      alternatives: [],
      total_matches: 0,
      query_understood_as: query.trim(),
    };
  const excluded = new Set(
    best.item.type === "solution"
      ? best.item.steps?.map((s) => s.capabilitySlug)
      : []
  );
  const alternatives = rest
    .filter((p) => !excluded.has(p.item.slug))
    .slice(0, limit)
    .map((p) => buildRecommendation(p.item, p.reason));
  return {
    recommendation: buildRecommendation(best.item, best.reason),
    alternatives,
    total_matches: total,
    query_understood_as: query.trim(),
  };
}

// ─── Build response ─────────────────────────────────────────────────────────

function buildRecommendation(
  item: CatalogItem,
  matchReason: string
): SuggestRecommendation {
  const rec: SuggestRecommendation = {
    type: item.type,
    slug: item.slug,
    name: item.name,
    description: item.description,
    match_reason: matchReason,
    price_cents: item.priceCents,
  };

  if (item.type === "solution") {
    rec.steps = (item.steps ?? []).map((s) => ({
      name: s.name,
      capability_slug: s.capabilitySlug,
      parallel_group: s.parallelGroup,
    }));
    rec.step_count = item.stepCount;
    rec.geography = item.geography ?? undefined;
    rec.badge = "strale_tested";
  }

  if (item.type === "capability") {
    rec.category = item.category;
    if (item.partOfSolutions && item.partOfSolutions.length > 0) {
      const parent = item.partOfSolutions[0];
      rec.part_of_solution = {
        slug: parent.slug,
        name: parent.name,
        price_cents: parent.priceCents,
        extra_description:
          parent.otherCapabilityNames.length > 0
            ? `also includes ${parent.otherCapabilityNames.join(", ")}`
            : "",
      };
    }
  }

  if (item.trustSummary) {
    rec.trust = item.trustSummary;
  }

  return rec;
}
