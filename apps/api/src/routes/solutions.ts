import { Hono } from "hono";
import { eq, and, asc, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { solutions, solutionSteps, capabilities } from "../db/schema.js";
import { apiError } from "../lib/errors.js";
import { getRelatedSolutions } from "../lib/related-items.js";
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
      complianceCoverage: solutions.complianceCoverage,
      id: solutions.id,
    })
    .from(solutions)
    .where(and(...conditions))
    .orderBy(asc(solutions.displayOrder));

  // For each solution, get step slugs + cached dual-profile data from step capabilities
  const result = await Promise.all(
    rows.map(async (row) => {
      const steps = await db
        .select({
          capabilitySlug: solutionSteps.capabilitySlug,
          matrixSqs: capabilities.matrixSqs,
          qpScore: capabilities.qpScore,
          rpScore: capabilities.rpScore,
          guidanceUsable: capabilities.guidanceUsable,
          guidanceStrategy: capabilities.guidanceStrategy,
        })
        .from(solutionSteps)
        .leftJoin(capabilities, eq(solutionSteps.capabilitySlug, capabilities.slug))
        .where(eq(solutionSteps.solutionId, row.id))
        .orderBy(asc(solutionSteps.stepOrder));

      // Solution-level SQS = avg capped at weakest + 20
      const stepSqs = steps.map((s) => s.matrixSqs ? parseFloat(s.matrixSqs) : 0);
      const avgSqs = stepSqs.length > 0 ? stepSqs.reduce((a, b) => a + b, 0) / stepSqs.length : 0;
      const minSqs = stepSqs.length > 0 ? Math.min(...stepSqs) : 0;
      const sqs = Math.round(Math.min(avgSqs, minSqs + 20) * 10) / 10;

      const gradeOrder = ["A", "B", "C", "D", "F", "pending"];
      function gradeFromScore(score: string | null): string {
        const v = score ? parseFloat(score) : null;
        if (v == null) return "pending";
        if (v >= 90) return "A";
        if (v >= 75) return "B";
        if (v >= 50) return "C";
        if (v >= 25) return "D";
        return "F";
      }
      function sqsLabel(s: number): string {
        if (s >= 90) return "Excellent";
        if (s >= 75) return "Good";
        if (s >= 50) return "Fair";
        if (s >= 25) return "Poor";
        return "Degraded";
      }

      const worstQuality = steps.reduce((w, s) => {
        const g = gradeFromScore(s.qpScore);
        return gradeOrder.indexOf(g) > gradeOrder.indexOf(w) ? g : w;
      }, "A");
      const worstReliability = steps.reduce((w, s) => {
        const g = gradeFromScore(s.rpScore);
        return gradeOrder.indexOf(g) > gradeOrder.indexOf(w) ? g : w;
      }, "A");

      const allUsable = steps.every((s) => s.guidanceUsable ?? true);
      const strategyOrder = ["direct", "retry_with_backoff", "queue_for_later", "unavailable"];
      const worstStrategy = steps.reduce((w, s) => {
        const st = s.guidanceStrategy ?? "direct";
        return strategyOrder.indexOf(st) > strategyOrder.indexOf(w) ? st : w;
      }, "direct");

      return {
        slug: row.slug,
        name: row.name,
        description: row.description,
        category: row.category,
        priceCents: row.priceCents,
        stepCount: steps.length,
        geography: row.geography,
        transparencyTag: row.transparencyTag,
        complianceCoverage: row.complianceCoverage ?? [],
        capabilities: steps.map((s) => s.capabilitySlug),
        sqs,
        sqs_label: sqsLabel(sqs),
        quality: worstQuality,
        reliability: worstReliability,
        trend: "stable" as const,
        usable: allUsable,
        strategy: worstStrategy,
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
      dataSource: capabilities.dataSource,
    })
    .from(solutionSteps)
    .leftJoin(
      capabilities,
      eq(solutionSteps.capabilitySlug, capabilities.slug),
    )
    .where(eq(solutionSteps.solutionId, sol.id))
    .orderBy(asc(solutionSteps.stepOrder));

  // Fetch extends_with capabilities
  const extendsSlugs = (sol.extendsWith as string[] | null) ?? [];
  const extendsCaps = extendsSlugs.length > 0
    ? await db
        .select({
          slug: capabilities.slug,
          name: capabilities.name,
          description: capabilities.description,
          priceCents: capabilities.priceCents,
          category: capabilities.category,
        })
        .from(capabilities)
        .where(inArray(capabilities.slug, extendsSlugs))
    : [];

  // Related solutions: smart matching (shared capabilities > same geo > same category)
  const related = await getRelatedSolutions(sol.slug, 4);

  return c.json({
    slug: sol.slug,
    name: sol.name,
    marketingName: sol.marketingName,
    description: sol.description,
    long_description: sol.longDescription ?? null,
    agent_description: sol.agentDescription ?? null,
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
    complianceCoverage: sol.complianceCoverage ?? [],
    steps: steps.map((s) => ({
      stepOrder: s.stepOrder,
      capabilitySlug: s.capabilitySlug,
      capabilityName: s.capabilityName,
      capabilityPriceCents: s.capabilityPriceCents,
      canParallel: s.canParallel,
      parallelGroup: s.parallelGroup,
      inputMap: s.inputMap,
      dataSource: s.dataSource,
    })),
    extendsWith: extendsCaps.map((cap) => ({
      slug: cap.slug,
      name: cap.name,
      description: cap.description,
      price_cents: cap.priceCents,
      category: cap.category,
    })),
    relatedSolutions: related.map((r) => ({
      slug: r.slug,
      name: r.name,
      priceCents: r.price_cents,
      category: r.category,
      geography: r.geography,
      reason: r.reason,
    })),
  });
});
