import { Hono } from "hono";
import { eq, and, ne, asc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { solutions, solutionSteps, capabilities } from "../db/schema.js";
import { apiError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

// Solutions are public — no auth required (catalog data, same as capabilities)
export const solutionsRoute = new Hono<AppEnv>();

// GET /v1/solutions — List active solutions
solutionsRoute.get("/", async (c) => {
  const db = getDb();
  const category = c.req.query("category");

  const conditions = [eq(solutions.isActive, true)];
  if (category) {
    conditions.push(eq(solutions.category, category));
  }

  const rows = await db
    .select({
      slug: solutions.slug,
      name: solutions.name,
      description: solutions.description,
      category: solutions.category,
      priceCents: solutions.priceCents,
      geography: solutions.geography,
      transparencyTag: solutions.transparencyTag,
      id: solutions.id,
    })
    .from(solutions)
    .where(and(...conditions))
    .orderBy(asc(solutions.displayOrder));

  // For each solution, get step count and capability slugs
  const result = await Promise.all(
    rows.map(async (row) => {
      const steps = await db
        .select({ capabilitySlug: solutionSteps.capabilitySlug })
        .from(solutionSteps)
        .where(eq(solutionSteps.solutionId, row.id))
        .orderBy(asc(solutionSteps.stepOrder));

      return {
        slug: row.slug,
        name: row.name,
        description: row.description,
        category: row.category,
        priceCents: row.priceCents,
        stepCount: steps.length,
        geography: row.geography,
        transparencyTag: row.transparencyTag,
        capabilities: steps.map((s) => s.capabilitySlug),
      };
    }),
  );

  return c.json({ solutions: result, total: result.length });
});

// GET /v1/solutions/:slug — Full solution detail
solutionsRoute.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();

  const [sol] = await db
    .select()
    .from(solutions)
    .where(and(eq(solutions.slug, slug), eq(solutions.isActive, true)))
    .limit(1);

  if (!sol) {
    return c.json(
      apiError("not_found", `Solution '${slug}' not found.`),
      404,
    );
  }

  // Get steps with capability details
  const steps = await db
    .select({
      stepOrder: solutionSteps.stepOrder,
      capabilitySlug: solutionSteps.capabilitySlug,
      canParallel: solutionSteps.canParallel,
      parallelGroup: solutionSteps.parallelGroup,
      inputMap: solutionSteps.inputMap,
      capabilityName: capabilities.name,
      capabilityPriceCents: capabilities.priceCents,
    })
    .from(solutionSteps)
    .leftJoin(
      capabilities,
      eq(solutionSteps.capabilitySlug, capabilities.slug),
    )
    .where(eq(solutionSteps.solutionId, sol.id))
    .orderBy(asc(solutionSteps.stepOrder));

  // Related solutions: same category, max 4, excluding current
  const related = await db
    .select({
      slug: solutions.slug,
      name: solutions.name,
      priceCents: solutions.priceCents,
    })
    .from(solutions)
    .where(
      and(
        eq(solutions.category, sol.category),
        eq(solutions.isActive, true),
        ne(solutions.slug, sol.slug),
      ),
    )
    .orderBy(asc(solutions.displayOrder))
    .limit(4);

  return c.json({
    slug: sol.slug,
    name: sol.name,
    marketingName: sol.marketingName,
    description: sol.description,
    category: sol.category,
    priceCents: sol.priceCents,
    componentSumCents: sol.componentSumCents,
    valueTier: sol.valueTier,
    geography: sol.geography,
    transparencyTag: sol.transparencyTag,
    targetAudience: sol.targetAudience,
    inputSchema: sol.inputSchema,
    exampleInput: sol.exampleInput,
    exampleOutput: sol.exampleOutput,
    steps: steps.map((s) => ({
      stepOrder: s.stepOrder,
      capabilitySlug: s.capabilitySlug,
      capabilityName: s.capabilityName,
      capabilityPriceCents: s.capabilityPriceCents,
      canParallel: s.canParallel,
      parallelGroup: s.parallelGroup,
      inputMap: s.inputMap,
    })),
    relatedSolutions: related,
  });
});
