import { eq, and, asc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "../db/index.js";
import {
  solutions,
  solutionSteps,
  capabilities,
} from "../db/schema.js";
import { embedQuery, embedDocuments, cosineSimilarity } from "./embeddings.js";
import { tokenize } from "./tokenize.js";
import { getCapabilityQuality, getSolutionQuality } from "./quality-aggregation.js";
import { determineBadge, getTestResultsForSlug } from "./trust-helpers.js";
import { computeDualProfileSQS, computeSolutionSQS } from "./sqs.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TrustSummary {
  badge: string;
  badge_label: string;
  avg_response_time_ms: number | null;
  tests_passing: number;
  tests_total: number;
  last_tested_at: string | null;
  data_source: "internal_testing" | "blended" | "customer_transactions";
  sqs: number;
  sqs_label: string;
}

interface CatalogItem {
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
  embedding: number[];
  embeddingText: string;
  tokens: Set<string>;
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

interface SuggestResponse {
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
  if (queryCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of queryCache) {
      if (now > v.expiresAt) queryCache.delete(k);
    }
  }
  queryCache.set(key, {
    response,
    expiresAt: Date.now() + QUERY_CACHE_TTL_MS,
  });
}

// ─── Catalog cache ──────────────────────────────────────────────────────────

const CATALOG_CACHE_TTL_MS = 10 * 60 * 1000; // Match SQS cache TTL for consistent trust data
let catalog: CatalogItem[] | null = null;
let catalogCachedAt = 0;
let catalogLoading: Promise<CatalogItem[]> | null = null;
let useEmbeddings = true;

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
        })
        .from(solutions)
        .where(eq(solutions.isActive, true))
        .orderBy(asc(solutions.displayOrder));

      const solItems: CatalogItem[] = await Promise.all(
        solRows.map(async (sol) => {
          const steps = await db
            .select({
              capabilitySlug: solutionSteps.capabilitySlug,
              parallelGroup: solutionSteps.parallelGroup,
              capabilityName: capabilities.name,
            })
            .from(solutionSteps)
            .leftJoin(
              capabilities,
              eq(solutionSteps.capabilitySlug, capabilities.slug),
            )
            .where(eq(solutionSteps.solutionId, sol.id))
            .orderBy(asc(solutionSteps.stepOrder));

          const stepNames = steps
            .map((s) => s.capabilityName ?? s.capabilitySlug)
            .join(", ");
          const embeddingText = sol.agentDescription
            ? `${sol.name}. ${sol.agentDescription}. ${sol.description}. Category: ${sol.category}. Geography: ${sol.geography}. Includes: ${stepNames}.`
            : `${sol.name}. ${sol.description}. Category: ${sol.category}. Geography: ${sol.geography}. Includes: ${stepNames}.`;
          const tokenText = `${sol.name} ${sol.description} ${sol.agentDescription ?? ""} ${sol.category} ${sol.geography} ${sol.slug} ${steps.map((s) => s.capabilitySlug).join(" ")}`;

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
            embedding: [],
            embeddingText,
            tokens: tokenize(tokenText),
          };
        }),
      );

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
        })
        .from(capabilities)
        .where(
          and(
            eq(capabilities.isActive, true),
            eq(capabilities.visible, true),
            eq(capabilities.lifecycleState, "active"),
          ),
        );

      const capItems: CatalogItem[] = capRows.map((cap) => {
        const slugWords = cap.slug.replace(/-/g, " ");
        const embeddingText = `${cap.name}. ${cap.description}. Category: ${cap.category}. Also known as: ${slugWords}.`;
        const tokenText = `${cap.name} ${cap.description} ${cap.category} ${cap.slug}`;

        return {
          type: "capability" as const,
          slug: cap.slug,
          name: cap.name,
          description: cap.description,
          category: cap.category,
          priceCents: cap.priceCents,
          isFreeTier: cap.isFreeTier,
          geography: cap.geography ?? "global",
          embedding: [],
          embeddingText,
          tokens: tokenize(tokenText),
        };
      });

      const allItems = [...solItems, ...capItems];

      // Build reverse index: capability → solutions containing it
      for (const cap of capItems) {
        const parents = solItems.filter((sol) =>
          sol.steps?.some((s) => s.capabilitySlug === cap.slug),
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

      // Precompute trust summaries for all items
      // TODO: batch trust data queries — currently individual calls, OK since catalog refresh is every 5 min
      await Promise.all(
        allItems.map(async (item) => {
          try {
            if (item.type === "solution") {
              // Aggregate trust across solution steps
              const solQuality = await getSolutionQuality(item.slug);
              const stepSlugs = (item.steps ?? []).map((s) => s.capabilitySlug);
              const stepTestResults = await Promise.all(
                stepSlugs.map((s) => getTestResultsForSlug(s)),
              );
              const totalPassed = stepTestResults.reduce((s, r) => s + r.passed, 0);
              const totalFailed = stepTestResults.reduce((s, r) => s + r.failed, 0);
              const totalTests = stepTestResults.reduce((s, r) => s + r.total_tests, 0);
              const lastRuns = stepTestResults
                .map((r) => r.last_run)
                .filter((t): t is string => t !== null)
                .sort();
              const lastTestedAt = lastRuns[lastRuns.length - 1] ?? null;

              const totalTxns = solQuality?.totalTransactionsAll ?? 0;
              const { badge, badge_label } = determineBadge(
                totalTxns,
                0,
                solQuality?.successRate ?? null,
              );

              const sqs = await computeSolutionSQS(stepSlugs);
              item.trustSummary = {
                badge,
                badge_label,
                avg_response_time_ms: solQuality?.avgResponseTimeMs ?? null,
                tests_passing: totalPassed,
                tests_total: totalTests,
                last_tested_at: lastTestedAt,
                data_source: totalTxns > 0 ? "internal_testing" : "internal_testing",
                sqs: sqs.score,
                sqs_label: sqs.label,
              };
            } else {
              // Individual capability trust
              const quality = await getCapabilityQuality(item.slug);
              const testData = await getTestResultsForSlug(item.slug);

              const testTxns = quality.totalTransactionsAll;
              const { badge, badge_label } = determineBadge(
                testTxns,
                0,
                quality.successRate,
              );

              const dual = await computeDualProfileSQS(item.slug);
              item.trustSummary = {
                badge,
                badge_label,
                avg_response_time_ms: quality.avgResponseTimeMs,
                tests_passing: testData.passed,
                tests_total: testData.total_tests,
                last_tested_at: testData.last_run,
                data_source: testTxns > 0 ? "internal_testing" : "internal_testing",
                sqs: dual.score,
                sqs_label: dual.label,
              };
            }
          } catch (err) {
            console.warn(`[suggest] Failed to load trust data for ${item.slug}:`, err);
          }
        }),
      );

      // Embed if Voyage API key is available
      if (process.env.VOYAGE_API_KEY) {
        useEmbeddings = true;
        const texts = allItems.map((item) => item.embeddingText);
        const vectors = await embedDocuments(texts);
        for (let i = 0; i < allItems.length; i++) {
          allItems[i].embedding = vectors[i];
        }
        console.log(
          `[suggest] Catalog loaded: ${solItems.length} solutions + ${capItems.length} capabilities, embeddings computed`,
        );
      } else {
        useEmbeddings = false;
        console.warn(
          "[suggest] VOYAGE_API_KEY not set — using keyword fallback",
        );
      }

      // Clear query cache when catalog refreshes (embeddings changed)
      queryCache.clear();

      catalog = allItems;
      catalogCachedAt = Date.now();
      return allItems;
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
  sqs: number | null;
  sqs_label: string | null;
  is_free_tier?: boolean;
  step_count?: number;
  match_snippet?: string;
}

export interface TypeaheadResponse {
  results: TypeaheadResult[];
  total: number;
}

export async function typeahead(
  query: string,
  limit: number,
  geo?: string,
  typeFilter?: "solution" | "capability",
): Promise<TypeaheadResponse> {
  const items = await loadCatalog();
  const qLower = query.toLowerCase().trim();
  const qWords = qLower.split(/\s+/).filter((w) => w.length > 0);

  if (qWords.length === 0) {
    return { results: [], total: 0 };
  }

  const scored: Array<{ item: CatalogItem; score: number; snippet?: string }> = [];

  for (const item of items) {
    // Type filter: skip items that don't match the requested type
    if (typeFilter && item.type !== typeFilter) continue;
    let score = 0;
    let snippet: string | undefined;

    // Token matching: +1 for each query word found in item tokens
    for (const word of qWords) {
      if (item.tokens.has(word)) score++;
    }

    // Exact slug match: +2
    if (qWords.some((w) => w === item.slug)) score += 2;

    // Prefix matching on name/description words for partial matches
    const nameLower = item.name.toLowerCase();
    const descLower = item.description.toLowerCase();
    const nameWords = nameLower.split(/[\s\-—]+/);
    const descWords = descLower.split(/[\s\-—]+/);

    for (const qw of qWords) {
      if (nameWords.some((nw) => nw.startsWith(qw) && !item.tokens.has(qw))) {
        score++;
        // Build snippet from name if prefix matched
        if (!snippet) snippet = item.name;
      }
      if (descWords.some((dw) => dw.startsWith(qw) && !item.tokens.has(qw))) {
        score++;
      }
    }

    // Solutions-first: +3 bonus
    if (item.type === "solution" && score > 0) score += 3;

    // Geography boost: +1 if geo param matches
    if (geo && score > 0 && item.geography) {
      const geoUpper = geo.toUpperCase();
      const geoLower = geo.toLowerCase();
      if (
        item.geography.toUpperCase().includes(geoUpper) ||
        item.geography.toLowerCase().includes(geoLower)
      ) {
        score++;
      }
    }

    if (score > 0) {
      scored.push({ item, score, snippet });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const total = scored.length;
  const topItems = scored.slice(0, limit);

  const results: TypeaheadResult[] = topItems.map(({ item, snippet }) => {
    const result: TypeaheadResult = {
      type: item.type,
      slug: item.slug,
      name: item.name,
      description: item.description,
      category: item.category,
      // DEC-20260304-A: price_cents MUST be null for capabilities
      price_cents: item.type === "solution" ? item.priceCents : null,
      geography: item.geography,
      sqs: item.trustSummary?.sqs ?? null,
      sqs_label: item.trustSummary?.sqs_label ?? null,
      is_free_tier: item.isFreeTier || undefined,
    };
    if (item.type === "solution" && item.stepCount) {
      result.step_count = item.stepCount;
    }
    if (snippet) {
      result.match_snippet = snippet;
    }
    return result;
  });

  // Fallback: if type filter produced zero results, retry without filter
  if (results.length === 0 && typeFilter) {
    return typeahead(query, limit, geo);
  }

  return { results, total };
}

// ─── Main suggest function ──────────────────────────────────────────────────

export async function suggest(req: {
  query: string;
  limit?: number;
}): Promise<SuggestResponse> {
  const normalized = normalizeQuery(req.query);
  const limit = req.limit ?? 3;

  // Check query cache first
  const cached = getQueryCached(normalized);
  if (cached) return cached;

  const items = await loadCatalog();

  let result: SuggestResponse;
  if (useEmbeddings && items[0]?.embedding.length > 0) {
    result = await suggestSemantic(normalized, req.query, items, limit);
  } else {
    result = suggestKeyword(normalized, items, limit);
  }

  setQueryCache(normalized, result);
  return result;
}

// ─── Semantic path (Voyage + Claude) ────────────────────────────────────────

async function suggestSemantic(
  normalized: string,
  originalQuery: string,
  items: CatalogItem[],
  limit: number,
): Promise<SuggestResponse> {
  const queryEmbedding = await embedQuery(normalized);

  const scored = items.map((item) => ({
    item,
    similarity: cosineSimilarity(queryEmbedding, item.embedding),
  }));
  scored.sort((a, b) => b.similarity - a.similarity);

  const RETRIEVAL_THRESHOLD = 0.3;
  const candidates = scored
    .filter((s) => s.similarity >= RETRIEVAL_THRESHOLD)
    .slice(0, 10);

  if (candidates.length === 0) {
    return {
      recommendation: null,
      alternatives: [],
      total_matches: 0,
      query_understood_as: originalQuery.trim(),
    };
  }

  // Phase 2: Claude re-ranking (pass original query for natural phrasing)
  return rerankWithClaude(originalQuery, candidates, limit);
}

async function rerankWithClaude(
  query: string,
  candidates: Array<{ item: CatalogItem; similarity: number }>,
  limit: number,
): Promise<SuggestResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return fallbackRanking(query, candidates, limit);
  }

  const client = new Anthropic({ apiKey });

  const candidateDescriptions = candidates
    .map(({ item, similarity }, i) => {
      let desc = `[${i}] ${item.type.toUpperCase()}: "${item.name}" (slug: ${item.slug})`;
      desc += `\n    ${item.description}`;
      desc += `\n    Category: ${item.category}, Price: €${(item.priceCents / 100).toFixed(2)}`;
      if (item.geography) desc += `, Geography: ${item.geography}`;
      if (item.steps && item.steps.length > 0) {
        desc += `\n    Steps: ${item.steps.map((s) => s.name).join(" → ")}`;
      }
      if (item.partOfSolutions && item.partOfSolutions.length > 0) {
        desc += `\n    Part of solutions: ${item.partOfSolutions.map((s) => s.name).join(", ")}`;
      }
      desc += `\n    Semantic similarity: ${similarity.toFixed(3)}`;
      return desc;
    })
    .join("\n\n");

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `You are the recommendation engine for Strale, a marketplace of API capabilities for AI agents.

A developer searched for: "${query}"

Here are the top ${candidates.length} semantic matches from our catalog:

${candidateDescriptions}

Your job:
1. Pick the SINGLE best match for the developer's intent. Prefer solutions over individual capabilities when the developer's query implies a multi-step workflow. But if they clearly want a single specific function, prefer the matching capability.
2. Pick up to ${limit} alternatives. Rules:
   - If the best match is a solution, alternatives can be other matching solutions OR individual capabilities that are NOT components of the best match.
   - If the best match is a capability that is part of a solution, include that solution as an alternative (upsell).
   - Never include capabilities that are steps within the recommended solution.
3. For each pick, write a one-sentence match_reason explaining WHY it fits the developer's query — do NOT repeat the item's description.
   Bad: "Verifies a Swedish company's identity and registration details" (that's just the description).
   Good: "Best match for Swedish company verification — bundles company data, VAT, and sanctions in one call".
   The match_reason must reference the user's query and explain the fit, not describe what the item does.
4. Rephrase the developer's query into a clean, concise label (query_understood_as).
5. CRITICAL: Set total_relevant to 0 if NONE of the candidates actually match the developer's intent. Semantic similarity alone is not enough — the candidate must functionally do what the developer is asking for.

Here are examples of good output:

Example 1 — Clear solution match:
Query: "check if a swedish company exists"
Candidates: [0: Nordic KYC — Sweden (solution), 1: Swedish Company Data (capability), 2: VAT Validate (capability)]
Good output:
{"best_index": 0, "best_match_reason": "Combines company lookup, VAT validation, and sanctions screening into one compliance check for Swedish companies", "alternatives": [{"index": 1, "match_reason": "Individual company data lookup if you only need basic company info without full verification"}], "query_understood_as": "Swedish company verification", "total_relevant": 2}

Example 2 — No relevant match (veto):
Query: "translate my website to french"
Candidates: [0: Website Carbon Estimate (capability, similarity 0.31), 1: OG Image Check (capability, similarity 0.30)]
Good output:
{"best_index": 0, "best_match_reason": "", "alternatives": [], "query_understood_as": "Website translation to French", "total_relevant": 0}
Note: total_relevant is 0 because none of the candidates actually do translation. The system will return null.

Example 3 — Capability that's part of a solution (upsell):
Query: "dns records for a domain"
Candidates: [0: DNS Lookup (capability), 1: Domain Intelligence (solution containing DNS Lookup), 2: SSL Certificate Check (capability)]
Good output:
{"best_index": 0, "best_match_reason": "Queries A, AAAA, MX, TXT, CNAME, and NS records for any domain", "alternatives": [{"index": 1, "match_reason": "Full domain analysis including DNS, SSL, WHOIS, and reputation — use if you need more than just DNS records"}], "query_understood_as": "DNS record lookup", "total_relevant": 2}

Return ONLY valid JSON:
{
  "best_index": <number>,
  "best_match_reason": "one sentence",
  "alternatives": [
    { "index": <number>, "match_reason": "one sentence" }
  ],
  "query_understood_as": "clean rephrased query",
  "total_relevant": <how many of the ${candidates.length} candidates are actually relevant to the query>
}`,
        },
      ],
    });

    const responseText =
      response.content[0].type === "text"
        ? response.content[0].text.trim()
        : "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(
        "[suggest] Claude re-ranking returned invalid JSON, falling back",
      );
      return fallbackRanking(query, candidates, limit);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Claude veto: if it says no candidates are relevant, return null
    if (parsed.total_relevant === 0) {
      return {
        recommendation: null,
        alternatives: [],
        total_matches: 0,
        query_understood_as: parsed.query_understood_as ?? query.trim(),
      };
    }

    const bestIdx: number = parsed.best_index;
    const best = candidates[bestIdx]?.item;

    if (!best) {
      return fallbackRanking(query, candidates, limit);
    }

    const recommendation = buildRecommendation(
      best,
      parsed.best_match_reason,
    );

    const alternatives: SuggestRecommendation[] = [];
    const usedSlugs = new Set([best.slug]);

    for (const alt of parsed.alternatives ?? []) {
      const altItem = candidates[alt.index]?.item;
      if (altItem && !usedSlugs.has(altItem.slug)) {
        usedSlugs.add(altItem.slug);
        alternatives.push(buildRecommendation(altItem, alt.match_reason));
      }
      if (alternatives.length >= limit) break;
    }

    return {
      recommendation,
      alternatives,
      total_matches: parsed.total_relevant ?? candidates.length,
      query_understood_as: parsed.query_understood_as ?? query.trim(),
    };
  } catch (err) {
    console.warn("[suggest] Claude re-ranking failed, falling back:", err);
    return fallbackRanking(query, candidates, limit);
  }
}

function fallbackRanking(
  query: string,
  candidates: Array<{ item: CatalogItem; similarity: number }>,
  limit: number,
): SuggestResponse {
  const reranked = candidates.map(({ item, similarity }) => {
    let score = similarity;
    if (item.type === "solution" && similarity > 0.3) score += 0.03;
    return { item, score };
  });
  reranked.sort((a, b) => b.score - a.score);

  const best = reranked[0].item;
  const recommendation = buildRecommendation(
    best,
    best.description.split(".")[0],
  );

  const primaryComponentSlugs = new Set(
    best.type === "solution"
      ? (best.steps ?? []).map((s) => s.capabilitySlug)
      : [],
  );

  const alternatives: SuggestRecommendation[] = [];
  for (const { item } of reranked.slice(1)) {
    if (alternatives.length >= limit) break;
    if (
      item.type === "capability" &&
      primaryComponentSlugs.has(item.slug)
    )
      continue;
    alternatives.push(
      buildRecommendation(item, item.description.split(".")[0]),
    );
  }

  return {
    recommendation,
    alternatives,
    total_matches: candidates.length,
    query_understood_as: query.trim(),
  };
}

// ─── Keyword fallback (no Voyage) ───────────────────────────────────────────

function suggestKeyword(
  query: string,
  items: CatalogItem[],
  limit: number,
): SuggestResponse {
  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) {
    return {
      recommendation: null,
      alternatives: [],
      total_matches: 0,
      query_understood_as: query.trim(),
    };
  }

  const scored: Array<{ item: CatalogItem; score: number }> = [];

  for (const item of items) {
    let score = 0;
    for (const token of queryTokens) {
      if (item.tokens.has(token)) score++;
    }
    if (queryTokens.has(item.slug)) score += 2;
    if (item.type === "solution" && score > 0) score += 3;

    if (score > 0) scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      recommendation: null,
      alternatives: [],
      total_matches: 0,
      query_understood_as: query.trim(),
    };
  }

  const best = scored[0].item;
  const recommendation = buildRecommendation(
    best,
    best.description.split(".")[0],
  );

  const excludedSlugs = new Set<string>();
  if (best.type === "solution") {
    for (const step of best.steps ?? []) {
      excludedSlugs.add(step.capabilitySlug);
    }
  }

  const alternatives: SuggestRecommendation[] = [];
  for (const { item } of scored.slice(1)) {
    if (alternatives.length >= limit) break;
    if (
      item.type === "capability" &&
      excludedSlugs.has(item.slug)
    )
      continue;
    alternatives.push(
      buildRecommendation(item, item.description.split(".")[0]),
    );
  }

  if (best.type === "capability" && best.partOfSolutions?.length) {
    const parentSlug = best.partOfSolutions[0].slug;
    if (!alternatives.some((a) => a.slug === parentSlug)) {
      const parentItem = items.find(
        (i) => i.type === "solution" && i.slug === parentSlug,
      );
      if (parentItem && alternatives.length < limit) {
        alternatives.push(
          buildRecommendation(
            parentItem,
            parentItem.description.split(".")[0],
          ),
        );
      }
    }
  }

  return {
    recommendation,
    alternatives,
    total_matches: scored.length,
    query_understood_as: query.trim(),
  };
}

// ─── Build response ─────────────────────────────────────────────────────────

function buildRecommendation(
  item: CatalogItem,
  matchReason: string,
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
        extra_description: parent.otherCapabilityNames.length > 0
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
