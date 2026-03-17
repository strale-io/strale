import { eq, and, ne, asc, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  solutions,
  solutionSteps,
  capabilities,
} from "../db/schema.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RelatedCapability {
  slug: string;
  name: string;
  description: string;
  price_cents: number;
  category: string;
  reason: "co-occurrence" | "same-input" | "same-category";
}

export interface RelatedSolution {
  slug: string;
  name: string;
  price_cents: number;
  category: string;
  geography: string | null;
  reason: "shared-capabilities" | "same-geo-diff-category" | "same-category";
  step_count: number;
}

// ─── Cache ──────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const capRelatedCache = new Map<string, CacheEntry<RelatedCapability[]>>();
const solRelatedCache = new Map<string, CacheEntry<RelatedSolution[]>>();

// ─── Related capabilities for a capability ──────────────────────────────────

export async function getRelatedCapabilities(
  slug: string,
  limit: number = 4,
): Promise<RelatedCapability[]> {
  const cached = capRelatedCache.get(slug);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const db = getDb();
  const results: RelatedCapability[] = [];
  const usedSlugs = new Set<string>([slug]);

  // 1. Co-occurrence: capabilities that appear in the same solutions
  const coOccurring = await db
    .selectDistinct({
      slug: capabilities.slug,
      name: capabilities.name,
      description: capabilities.description,
      priceCents: capabilities.priceCents,
      category: capabilities.category,
    })
    .from(solutionSteps)
    .innerJoin(
      // Find solutions containing this capability
      sql`(SELECT DISTINCT solution_id FROM solution_steps WHERE capability_slug = ${slug}) AS s1`,
      sql`s1.solution_id = ${solutionSteps.solutionId}`,
    )
    .innerJoin(capabilities, eq(solutionSteps.capabilitySlug, capabilities.slug))
    .where(
      and(
        ne(solutionSteps.capabilitySlug, slug),
        eq(capabilities.isActive, true),
      ),
    );

  for (const cap of coOccurring) {
    if (results.length >= limit) break;
    if (usedSlugs.has(cap.slug)) continue;
    usedSlugs.add(cap.slug);
    results.push({
      slug: cap.slug,
      name: cap.name,
      description: cap.description,
      price_cents: cap.priceCents,
      category: cap.category,
      reason: "co-occurrence",
    });
  }

  // 2. Same input type: capabilities that accept the same primary input field
  if (results.length < limit) {
    const [thisCap] = await db
      .select({ inputSchema: capabilities.inputSchema })
      .from(capabilities)
      .where(eq(capabilities.slug, slug))
      .limit(1);

    if (thisCap?.inputSchema) {
      const schema = thisCap.inputSchema as {
        required?: string[];
        properties?: Record<string, unknown>;
      };
      const primaryField = schema.required?.[0];

      if (primaryField) {
        // Find other capabilities with the same primary required field
        const allCaps = await db
          .select({
            slug: capabilities.slug,
            name: capabilities.name,
            description: capabilities.description,
            priceCents: capabilities.priceCents,
            category: capabilities.category,
            inputSchema: capabilities.inputSchema,
          })
          .from(capabilities)
          .where(
            and(
              ne(capabilities.slug, slug),
              eq(capabilities.isActive, true),
            ),
          );

        for (const cap of allCaps) {
          if (results.length >= limit) break;
          if (usedSlugs.has(cap.slug)) continue;

          const capSchema = cap.inputSchema as {
            required?: string[];
          };
          if (capSchema?.required?.[0] === primaryField) {
            usedSlugs.add(cap.slug);
            results.push({
              slug: cap.slug,
              name: cap.name,
              description: cap.description,
              price_cents: cap.priceCents,
              category: cap.category,
              reason: "same-input",
            });
          }
        }
      }
    }
  }

  // 3. Same category fallback
  if (results.length < limit) {
    const [thisCap] = await db
      .select({ category: capabilities.category })
      .from(capabilities)
      .where(eq(capabilities.slug, slug))
      .limit(1);

    if (thisCap) {
      const sameCat = await db
        .select({
          slug: capabilities.slug,
          name: capabilities.name,
          description: capabilities.description,
          priceCents: capabilities.priceCents,
          category: capabilities.category,
        })
        .from(capabilities)
        .where(
          and(
            eq(capabilities.category, thisCap.category),
            eq(capabilities.isActive, true),
            ne(capabilities.slug, slug),
          ),
        )
        .limit(limit);

      for (const cap of sameCat) {
        if (results.length >= limit) break;
        if (usedSlugs.has(cap.slug)) continue;
        usedSlugs.add(cap.slug);
        results.push({
          slug: cap.slug,
          name: cap.name,
          description: cap.description,
          price_cents: cap.priceCents,
          category: cap.category,
          reason: "same-category",
        });
      }
    }
  }

  capRelatedCache.set(slug, { data: results, expiresAt: Date.now() + CACHE_TTL_MS });
  return results;
}

// ─── Related solutions for a solution ────────────────────────────────────────

export async function getRelatedSolutions(
  slug: string,
  limit: number = 4,
): Promise<RelatedSolution[]> {
  const cached = solRelatedCache.get(slug);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const db = getDb();
  const results: RelatedSolution[] = [];
  const usedSlugs = new Set<string>([slug]);

  // Get this solution's info
  const [thisSol] = await db
    .select({
      id: solutions.id,
      category: solutions.category,
      geography: solutions.geography,
    })
    .from(solutions)
    .where(and(eq(solutions.slug, slug), eq(solutions.isActive, true)))
    .limit(1);

  if (!thisSol) {
    solRelatedCache.set(slug, { data: results, expiresAt: Date.now() + CACHE_TTL_MS });
    return results;
  }

  // Get this solution's capability slugs
  const thisSteps = await db
    .select({ capabilitySlug: solutionSteps.capabilitySlug })
    .from(solutionSteps)
    .where(eq(solutionSteps.solutionId, thisSol.id));
  const thisCapSlugs = new Set(thisSteps.map((s) => s.capabilitySlug));

  // 1. Shared capabilities: solutions that share 2+ capabilities
  const allSols = await db
    .select({
      id: solutions.id,
      slug: solutions.slug,
      name: solutions.name,
      priceCents: solutions.priceCents,
      category: solutions.category,
      geography: solutions.geography,
    })
    .from(solutions)
    .where(
      and(
        eq(solutions.isActive, true),
        ne(solutions.slug, slug),
      ),
    );

  // For each other solution, count shared capabilities and total steps
  const solsWithSteps = await Promise.all(
    allSols.map(async (sol) => {
      const steps = await db
        .select({ capabilitySlug: solutionSteps.capabilitySlug })
        .from(solutionSteps)
        .where(eq(solutionSteps.solutionId, sol.id));
      const sharedCount = steps.filter((s) => thisCapSlugs.has(s.capabilitySlug)).length;
      return { ...sol, sharedCount, stepCount: steps.length };
    }),
  );

  // Build step count lookup for fallback sections
  const stepCountMap = new Map(solsWithSteps.map((s) => [s.slug, s.stepCount]));

  // Sort by shared count descending
  const sharedSols = solsWithSteps
    .filter((s) => s.sharedCount >= 2)
    .sort((a, b) => b.sharedCount - a.sharedCount);

  for (const sol of sharedSols) {
    if (results.length >= limit) break;
    if (usedSlugs.has(sol.slug)) continue;
    usedSlugs.add(sol.slug);
    results.push({
      slug: sol.slug,
      name: sol.name,
      price_cents: sol.priceCents,
      category: sol.category,
      geography: sol.geography,
      reason: "shared-capabilities",
      step_count: sol.stepCount,
    });
  }

  // 2. Same geography + different category
  if (results.length < limit && thisSol.geography) {
    for (const sol of allSols) {
      if (results.length >= limit) break;
      if (usedSlugs.has(sol.slug)) continue;
      if (
        sol.geography === thisSol.geography &&
        sol.category !== thisSol.category
      ) {
        usedSlugs.add(sol.slug);
        results.push({
          slug: sol.slug,
          name: sol.name,
          price_cents: sol.priceCents,
          category: sol.category,
          geography: sol.geography,
          reason: "same-geo-diff-category",
          step_count: stepCountMap.get(sol.slug) ?? 0,
        });
      }
    }
  }

  // 3. Same category fallback
  if (results.length < limit) {
    for (const sol of allSols) {
      if (results.length >= limit) break;
      if (usedSlugs.has(sol.slug)) continue;
      if (sol.category === thisSol.category) {
        usedSlugs.add(sol.slug);
        results.push({
          slug: sol.slug,
          name: sol.name,
          price_cents: sol.priceCents,
          category: sol.category,
          geography: sol.geography,
          reason: "same-category",
          step_count: stepCountMap.get(sol.slug) ?? 0,
        });
      }
    }
  }

  solRelatedCache.set(slug, { data: results, expiresAt: Date.now() + CACHE_TTL_MS });
  return results;
}
