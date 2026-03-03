import { eq, asc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "../db/index.js";
import {
  solutions,
  solutionSteps,
  capabilities,
} from "../db/schema.js";
import { embedQuery, embedDocuments, cosineSimilarity } from "./embeddings.js";
import { tokenize } from "./tokenize.js";

// ─── Types ──────────────────────────────────────────────────────────────────

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
  embedding: number[];
  embeddingText: string;
  tokens: Set<string>;
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
}

interface SuggestResponse {
  recommendation: SuggestRecommendation | null;
  alternatives: SuggestRecommendation[];
  total_matches: number;
  query_understood_as: string;
}

// ─── Catalog cache ──────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;
let catalog: CatalogItem[] | null = null;
let catalogCachedAt = 0;
let catalogLoading: Promise<CatalogItem[]> | null = null;
let useEmbeddings = true;

async function loadCatalog(): Promise<CatalogItem[]> {
  const now = Date.now();
  if (catalog && now - catalogCachedAt < CACHE_TTL_MS) return catalog;

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
          const embeddingText = `${sol.name}. ${sol.description}. Category: ${sol.category}. Geography: ${sol.geography}. Includes: ${stepNames}.`;
          const tokenText = `${sol.name} ${sol.description} ${sol.category} ${sol.geography} ${sol.slug} ${steps.map((s) => s.capabilitySlug).join(" ")}`;

          return {
            type: "solution" as const,
            slug: sol.slug,
            name: sol.name,
            description: sol.description,
            category: sol.category,
            priceCents: sol.priceCents,
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
        })
        .from(capabilities)
        .where(eq(capabilities.isActive, true));

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
          geography: null,
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

// ─── Main suggest function ──────────────────────────────────────────────────

export async function suggest(req: {
  query: string;
  limit?: number;
}): Promise<SuggestResponse> {
  const limit = req.limit ?? 3;
  const items = await loadCatalog();

  if (useEmbeddings && items[0]?.embedding.length > 0) {
    return suggestSemantic(req.query, items, limit);
  }
  return suggestKeyword(req.query, items, limit);
}

// ─── Semantic path (Voyage + Claude) ────────────────────────────────────────

async function suggestSemantic(
  query: string,
  items: CatalogItem[],
  limit: number,
): Promise<SuggestResponse> {
  const queryEmbedding = await embedQuery(query);

  const scored = items.map((item) => ({
    item,
    similarity: cosineSimilarity(queryEmbedding, item.embedding),
  }));
  scored.sort((a, b) => b.similarity - a.similarity);

  const RETRIEVAL_THRESHOLD = 0.2;
  const candidates = scored
    .filter((s) => s.similarity >= RETRIEVAL_THRESHOLD)
    .slice(0, 10);

  if (candidates.length === 0) {
    return {
      recommendation: null,
      alternatives: [],
      total_matches: 0,
      query_understood_as: query.trim(),
    };
  }

  // Phase 2: Claude re-ranking
  return rerankWithClaude(query, candidates, limit);
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
3. For each pick, write a one-sentence match_reason explaining why it fits the developer's query.
4. Rephrase the developer's query into a clean, concise label (query_understood_as).

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

  // If best is a capability in a solution, add solution as alternative
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

  return rec;
}
