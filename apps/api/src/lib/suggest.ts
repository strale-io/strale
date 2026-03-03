import { eq, asc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  solutions,
  solutionSteps,
  capabilities,
} from "../db/schema.js";
import { tokenize } from "./tokenize.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SuggestRequest {
  query: string;
  limit?: number;
}

interface SolutionStep {
  name: string;
  capability_slug: string;
  parallel_group: number | null;
}

interface SuggestRecommendation {
  type: "solution" | "capability";
  slug: string;
  name: string;
  description: string;
  match_reason: string;
  price_cents: number;
  steps?: SolutionStep[];
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

// ─── Cached catalog ─────────────────────────────────────────────────────────

interface CachedSolution {
  slug: string;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  geography: string;
  steps: Array<{
    capabilitySlug: string;
    capabilityName: string;
    parallelGroup: number | null;
  }>;
  tokens: Set<string>;
}

interface CachedCapability {
  slug: string;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  tokens: Set<string>;
}

interface Catalog {
  solutions: CachedSolution[];
  capabilities: CachedCapability[];
  // Map from capability slug to solutions that include it
  capToSolutions: Map<string, CachedSolution[]>;
}

let cachedCatalog: Catalog | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadCatalog(): Promise<Catalog> {
  const now = Date.now();
  if (cachedCatalog && now - cachedAt < CACHE_TTL_MS) return cachedCatalog;

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

  const cachedSolutions: CachedSolution[] = await Promise.all(
    solRows.map(async (sol) => {
      const steps = await db
        .select({
          capabilitySlug: solutionSteps.capabilitySlug,
          parallelGroup: solutionSteps.parallelGroup,
          capabilityName: capabilities.name,
        })
        .from(solutionSteps)
        .leftJoin(capabilities, eq(solutionSteps.capabilitySlug, capabilities.slug))
        .where(eq(solutionSteps.solutionId, sol.id))
        .orderBy(asc(solutionSteps.stepOrder));

      const text = `${sol.name} ${sol.description} ${sol.category} ${sol.geography} ${sol.slug} ${steps.map((s) => s.capabilitySlug).join(" ")}`;

      return {
        slug: sol.slug,
        name: sol.name,
        description: sol.description,
        category: sol.category,
        priceCents: sol.priceCents,
        geography: sol.geography,
        steps: steps.map((s) => ({
          capabilitySlug: s.capabilitySlug,
          capabilityName: s.capabilityName ?? s.capabilitySlug,
          parallelGroup: s.parallelGroup,
        })),
        tokens: tokenize(text),
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

  const cachedCapabilities: CachedCapability[] = capRows.map((cap) => {
    const text = `${cap.name} ${cap.description} ${cap.category} ${cap.slug}`;
    return {
      slug: cap.slug,
      name: cap.name,
      description: cap.description,
      category: cap.category,
      priceCents: cap.priceCents,
      tokens: tokenize(text),
    };
  });

  // Build reverse index: capability slug → solutions containing it
  const capToSolutions = new Map<string, CachedSolution[]>();
  for (const sol of cachedSolutions) {
    for (const step of sol.steps) {
      const existing = capToSolutions.get(step.capabilitySlug) ?? [];
      existing.push(sol);
      capToSolutions.set(step.capabilitySlug, existing);
    }
  }

  cachedCatalog = {
    solutions: cachedSolutions,
    capabilities: cachedCapabilities,
    capToSolutions,
  };
  cachedAt = now;
  return cachedCatalog;
}

// ─── Scoring ────────────────────────────────────────────────────────────────

interface ScoredItem {
  type: "solution" | "capability";
  score: number;
  solution?: CachedSolution;
  capability?: CachedCapability;
}

function scoreAll(query: string, catalog: Catalog): ScoredItem[] {
  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) return [];

  const results: ScoredItem[] = [];

  // Score solutions
  for (const sol of catalog.solutions) {
    let score = 0;
    for (const token of queryTokens) {
      if (sol.tokens.has(token)) score++;
    }
    // Bonus: slug exact match
    if (queryTokens.has(sol.slug)) score += 2;
    // Bonus: solutions preferred over capabilities
    if (score > 0) score += 3;

    if (score > 0) {
      results.push({ type: "solution", score, solution: sol });
    }
  }

  // Score capabilities
  for (const cap of catalog.capabilities) {
    let score = 0;
    for (const token of queryTokens) {
      if (cap.tokens.has(token)) score++;
    }
    // Bonus: slug exact match
    if (queryTokens.has(cap.slug)) score += 2;
    // Bonus: category match
    for (const token of queryTokens) {
      if (cap.category.includes(token)) { score += 1; break; }
    }

    if (score > 0) {
      results.push({ type: "capability", score, capability: cap });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  return results;
}

// ─── Response building ──────────────────────────────────────────────────────

function buildRecommendation(
  item: ScoredItem,
  catalog: Catalog,
): SuggestRecommendation {
  if (item.type === "solution" && item.solution) {
    const sol = item.solution;
    return {
      type: "solution",
      slug: sol.slug,
      name: sol.name,
      description: sol.description,
      match_reason: `Combines ${sol.steps.map((s) => s.capabilityName).join(", ")} into a single workflow`,
      price_cents: sol.priceCents,
      steps: sol.steps.map((s) => ({
        name: s.capabilityName,
        capability_slug: s.capabilitySlug,
        parallel_group: s.parallelGroup,
      })),
      step_count: sol.steps.length,
      geography: sol.geography,
      badge: "strale_tested",
    };
  }

  const cap = item.capability!;
  // Check if this capability is part of any solution
  const containingSolutions = catalog.capToSolutions.get(cap.slug);
  let partOfSolution: SuggestRecommendation["part_of_solution"] = null;

  if (containingSolutions && containingSolutions.length > 0) {
    const sol = containingSolutions[0];
    const otherSteps = sol.steps
      .filter((s) => s.capabilitySlug !== cap.slug)
      .map((s) => s.capabilityName);

    partOfSolution = {
      slug: sol.slug,
      name: sol.name,
      price_cents: sol.priceCents,
      extra_description: otherSteps.length > 0
        ? `also includes ${otherSteps.join(", ")}`
        : "",
    };
  }

  return {
    type: "capability",
    slug: cap.slug,
    name: cap.name,
    description: cap.description,
    match_reason: `Individual capability — ${cap.description.split(".")[0].toLowerCase()}`,
    price_cents: cap.priceCents,
    category: cap.category,
    part_of_solution: partOfSolution,
  };
}

function queryUnderstoodAs(query: string): string {
  return query
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function suggest(
  req: SuggestRequest,
): Promise<SuggestResponse> {
  const catalog = await loadCatalog();
  const limit = req.limit ?? 3;
  const scored = scoreAll(req.query, catalog);

  if (scored.length === 0) {
    return {
      recommendation: null,
      alternatives: [],
      total_matches: 0,
      query_understood_as: queryUnderstoodAs(req.query),
    };
  }

  const best = scored[0];
  const recommendation = buildRecommendation(best, catalog);

  // Build alternatives
  const alternativeItems: ScoredItem[] = [];
  const recommendedSlugs = new Set<string>();
  recommendedSlugs.add(best.type === "solution" ? best.solution!.slug : best.capability!.slug);

  // If the recommendation is a solution, also exclude its component capabilities from alternatives
  const excludedCapSlugs = new Set<string>();
  if (best.type === "solution" && best.solution) {
    for (const step of best.solution.steps) {
      excludedCapSlugs.add(step.capabilitySlug);
    }
  }

  for (const item of scored.slice(1)) {
    if (alternativeItems.length >= limit) break;

    const slug = item.type === "solution" ? item.solution!.slug : item.capability!.slug;
    if (recommendedSlugs.has(slug)) continue;

    // Skip capabilities that are steps in the recommended solution
    if (item.type === "capability" && excludedCapSlugs.has(item.capability!.slug)) continue;

    recommendedSlugs.add(slug);
    alternativeItems.push(item);
  }

  // If recommendation is a capability and it's part of a solution, add that solution as alternative
  if (best.type === "capability" && best.capability) {
    const containingSolutions = catalog.capToSolutions.get(best.capability.slug);
    if (containingSolutions) {
      for (const sol of containingSolutions) {
        if (!recommendedSlugs.has(sol.slug) && alternativeItems.length < limit) {
          recommendedSlugs.add(sol.slug);
          alternativeItems.push({
            type: "solution",
            score: 0,
            solution: sol,
          });
        }
      }
    }
  }

  const alternatives = alternativeItems.map((item) =>
    buildRecommendation(item, catalog),
  );

  return {
    recommendation,
    alternatives,
    total_matches: scored.length,
    query_understood_as: queryUnderstoodAs(req.query),
  };
}
