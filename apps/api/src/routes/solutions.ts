import { Hono } from "hono";
import { eq, and, asc, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { solutions, solutionSteps, capabilities } from "../db/schema.js";
import { apiError } from "../lib/errors.js";
import { getRelatedSolutions } from "../lib/related-items.js";
import { sqsLabel, gradeFromScore, computeSolutionScore, computeSolutionTrend, worstFreshnessLevel, oldestTestedAt } from "../lib/trust-labels.js";
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
      searchTags: solutions.searchTags,
      id: solutions.id,
    })
    .from(solutions)
    .where(and(...conditions))
    .orderBy(asc(solutions.displayOrder));

  // Batch-fetch ALL steps for ALL solutions in one query (eliminates N+1)
  const solIds = rows.map((r) => r.id);
  const allSteps = solIds.length > 0
    ? await db
        .select({
          solutionId: solutionSteps.solutionId,
          capabilitySlug: solutionSteps.capabilitySlug,
          matrixSqs: capabilities.matrixSqs,
          qpScore: capabilities.qpScore,
          rpScore: capabilities.rpScore,
          trend: capabilities.trend,
          freshnessLevel: capabilities.freshnessLevel,
          lastTestedAt: capabilities.lastTestedAt,
          guidanceUsable: capabilities.guidanceUsable,
          guidanceStrategy: capabilities.guidanceStrategy,
          dataSource: capabilities.dataSource,
        })
        .from(solutionSteps)
        .leftJoin(capabilities, eq(solutionSteps.capabilitySlug, capabilities.slug))
        .where(inArray(solutionSteps.solutionId, solIds))
        .orderBy(solutionSteps.solutionId, asc(solutionSteps.stepOrder))
    : [];

  // Group steps by solution ID
  const stepsBySolution = new Map<string, typeof allSteps>();
  for (const step of allSteps) {
    const list = stepsBySolution.get(step.solutionId) ?? [];
    list.push(step);
    stepsBySolution.set(step.solutionId, list);
  }

  const gradeOrder = ["A", "B", "C", "D", "F", "pending"];
  const strategyOrder = ["direct", "retry_with_backoff", "queue_for_later", "unavailable"];

  const result = rows.map((row) => {
    const steps = stepsBySolution.get(row.id) ?? [];
    const stepSqs = steps.map((s) => s.matrixSqs ? parseFloat(s.matrixSqs) : 0);
    const sqs = computeSolutionScore(stepSqs);

    const worstQuality = steps.reduce((w, s) => {
      const g = gradeFromScore(s.qpScore);
      return gradeOrder.indexOf(g) > gradeOrder.indexOf(w) ? g : w;
    }, "A");
    const worstReliability = steps.reduce((w, s) => {
      const g = gradeFromScore(s.rpScore);
      return gradeOrder.indexOf(g) > gradeOrder.indexOf(w) ? g : w;
    }, "A");

    const allUsable = steps.every((s) => s.guidanceUsable ?? true);
    const worstStrategy = steps.reduce((w, s) => {
      const st = s.guidanceStrategy ?? "direct";
      return strategyOrder.indexOf(st) > strategyOrder.indexOf(w) ? st : w;
    }, "direct");

    return {
      slug: row.slug,
      name: row.name,
      description: row.description,
      category: row.category,
      price_cents: row.priceCents,
      step_count: steps.length,
      geography: row.geography,
      transparency_tag: row.transparencyTag,
      compliance_coverage: row.complianceCoverage ?? [],
      search_tags: row.searchTags ?? [],
      capabilities: steps.map((s) => s.capabilitySlug),
      data_sources: [...new Set(steps.map((s) => s.dataSource).filter(Boolean))],
      sqs,
      sqs_label: sqsLabel(sqs),
      quality: worstQuality,
      reliability: worstReliability,
      trend: computeSolutionTrend(steps.map((s) => s.trend ?? "stable")),
      freshness_level: worstFreshnessLevel(steps.map((s) => s.freshnessLevel ?? "fresh")),
      last_tested_at: oldestTestedAt(steps.map((s) => s.lastTestedAt)),
      usable: allUsable,
      strategy: worstStrategy,
    };
  });

  return c.json({ solutions: result, total: result.length });
});

// GET /v1/solutions/:slug — Full solution detail
solutionsRoute.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();

  const [sol] = await db
    .select({
      id: solutions.id,
      slug: solutions.slug,
      name: solutions.name,
      marketingName: solutions.marketingName,
      description: solutions.description,
      longDescription: solutions.longDescription,
      agentDescription: solutions.agentDescription,
      category: solutions.category,
      priceCents: solutions.priceCents,
      componentSumCents: solutions.componentSumCents,
      valueTier: solutions.valueTier,
      geography: solutions.geography,
      transparencyTag: solutions.transparencyTag,
      targetAudience: solutions.targetAudience,
      inputSchema: solutions.inputSchema,
      exampleInput: solutions.exampleInput,
      exampleOutput: solutions.exampleOutput,
      complianceCoverage: solutions.complianceCoverage,
      extendsWith: solutions.extendsWith,
    })
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
    marketing_name: sol.marketingName,
    description: sol.description,
    long_description: sol.longDescription ?? null,
    agent_description: sol.agentDescription ?? null,
    category: sol.category,
    price_cents: sol.priceCents,
    component_sum_cents: sol.componentSumCents,
    value_tier: sol.valueTier,
    geography: sol.geography,
    transparency_tag: sol.transparencyTag,
    target_audience: sol.targetAudience,
    input_schema: sol.inputSchema,
    example_input: sol.exampleInput,
    example_output: sol.exampleOutput,
    compliance_coverage: sol.complianceCoverage ?? [],
    steps: steps.map((s) => ({
      step_order: s.stepOrder,
      capability_slug: s.capabilitySlug,
      capability_name: s.capabilityName,
      capability_price_cents: s.capabilityPriceCents,
      can_parallel: s.canParallel,
      parallel_group: s.parallelGroup,
      input_map: s.inputMap,
      data_source: s.dataSource,
    })),
    extends_with: extendsCaps.map((cap) => ({
      slug: cap.slug,
      name: cap.name,
      description: cap.description,
      price_cents: cap.priceCents,
      category: cap.category,
    })),
    related_solutions: related.map((r) => ({
      slug: r.slug,
      name: r.name,
      price_cents: r.price_cents,
      category: r.category,
      geography: r.geography,
      reason: r.reason,
      step_count: r.step_count,
    })),
  });
});
