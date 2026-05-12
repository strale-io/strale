import { Hono } from "hono";
import { eq, and, sql, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, solutions, solutionSteps } from "../db/schema.js";
import { apiError } from "../lib/errors.js";
import { authMiddleware } from "../lib/middleware.js";
import { getAllHealth } from "../lib/circuit-breaker.js";
import type { AppEnv } from "../types.js";

// Capabilities are public — no auth required (lets developers browse before signing up)
export const capabilitiesRoute = new Hono<AppEnv>();

// GET /v1/capabilities — List available capabilities
capabilitiesRoute.get("/", async (c) => {
  const db = getDb();
  const rows = await db
    .select({
      id: capabilities.id,
      slug: capabilities.slug,
      name: capabilities.name,
      description: capabilities.description,
      category: capabilities.category,
      price_cents: capabilities.priceCents,
      input_schema: capabilities.inputSchema,
      output_schema: capabilities.outputSchema,
      transparency_tag: capabilities.transparencyTag,
      geography: capabilities.geography,
      data_source: capabilities.dataSource,
      is_free_tier: capabilities.isFreeTier,
      search_tags: capabilities.searchTags,
      freshness_level: capabilities.freshnessLevel,
      last_tested_at: capabilities.lastTestedAt,
      // Phase A0c.1.v3 (2026-05-13): cost_class for frontend display logic.
      // A0c.1.v2 added it to the detail handler only; the frontend reads
      // from this list endpoint for both /capabilities and /capabilities/:slug
      // surfaces (via useCapability filtering useCapabilities locally), so
      // the badge silently failed everywhere until this field landed here.
      cost_class: capabilities.costClass,
    })
    .from(capabilities)
    .where(
      and(
        eq(capabilities.isActive, true),
        eq(capabilities.visible, true),
        // strale.dev surfacing per DEC-20260503-A — internal callers
        // (do.ts, products, routing, lifecycle) bypass this filter.
        eq(capabilities.marketplaceEligible, true),
        inArray(capabilities.lifecycleState, ["active", "degraded"]),
      ),
    );

  // Phase A0c.1.v3: batch-fetch last_customer_call_at per capability via a
  // single GROUP BY query. Same filter convention as the detail handler
  // (lib/daily-digest/fetch-platform.ts:20-24): exclude transactions whose
  // user_id is the system test user. Customer paths set user_id = real_user
  // or NULL (free-tier); test-runner.ts:1270 writes user_id = system user.
  //
  // Performance note: the new compound index
  // `transactions_capability_id_created_at_idx` (Block 0078, added in this
  // PR) makes the GROUP BY an index-only aggregate. Without it the query
  // would seq-scan the status='completed' filtered set, which is fine at
  // pre-launch scale but degrades as transactions grow.
  const lccRows = await db.execute(sql`
    SELECT t.capability_id, MAX(t.created_at) AS last_customer_call_at
      FROM transactions t
     WHERE t.status = 'completed'
       AND (t.user_id IS NULL OR t.user_id != (
         SELECT id FROM users WHERE email = 'system@strale.internal' LIMIT 1
       ))
     GROUP BY t.capability_id
  `);
  const lccResultRows = Array.isArray(lccRows)
    ? lccRows
    : (lccRows as { rows?: unknown[] })?.rows ?? [];
  const lccByCapId = new Map<string, Date | string>();
  for (const row of lccResultRows as Array<{ capability_id?: string; last_customer_call_at?: Date | string | null }>) {
    if (row.capability_id && row.last_customer_call_at != null) {
      lccByCapId.set(row.capability_id, row.last_customer_call_at);
    }
  }

  const capabilitiesList = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    description: r.description,
    category: r.category,
    price_cents: r.price_cents,
    input_schema: r.input_schema,
    output_schema: r.output_schema,
    transparency_tag: r.transparency_tag,
    geography: r.geography ?? "global",
    data_source: r.data_source,
    is_free_tier: r.is_free_tier,
    search_tags: r.search_tags ?? [],
    freshness_level: r.freshness_level ?? "fresh",
    last_tested_at: r.last_tested_at?.toISOString() ?? null,
    cost_class: r.cost_class,
    last_customer_call_at: lccByCapId.get(r.id) ?? null,
  }));

  return c.json({ capabilities: capabilitiesList });
});

// GET /v1/capabilities/health — Circuit breaker health status (auth required)
capabilitiesRoute.get("/health", authMiddleware, async (c) => {
  const healthData = await getAllHealth();

  const openCount = healthData.filter((h) => h.state === "open").length;
  const halfOpenCount = healthData.filter((h) => h.state === "half_open").length;

  return c.json({
    total_tracked: healthData.length,
    open: openCount,
    half_open: halfOpenCount,
    closed: healthData.length - openCount - halfOpenCount,
    capabilities: healthData,
  });
});

// GET /v1/capabilities/:slug — Get capability details
capabilitiesRoute.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();

  // Phase A0c.1 (DEC-20260512-A): expose cost_class so the frontend can
  // distinguish paid_prepaid / paid_subscription caps awaiting customer
  // traffic from caps that are genuinely unverified for other reasons.
  const [cap] = await db
    .select({
      id: capabilities.id,
      slug: capabilities.slug,
      name: capabilities.name,
      description: capabilities.description,
      category: capabilities.category,
      price_cents: capabilities.priceCents,
      input_schema: capabilities.inputSchema,
      output_schema: capabilities.outputSchema,
      transparency_tag: capabilities.transparencyTag,
      geography: capabilities.geography,
      data_source: capabilities.dataSource,
      is_free_tier: capabilities.isFreeTier,
      cost_class: capabilities.costClass,
    })
    .from(capabilities)
    .where(
      and(
        eq(capabilities.slug, slug),
        eq(capabilities.isActive, true),
        // strale.dev surfacing per DEC-20260503-A.
        eq(capabilities.marketplaceEligible, true),
        inArray(capabilities.lifecycleState, ["active", "degraded"]),
      ),
    )
    .limit(1);

  if (!cap) {
    return c.json(
      apiError("not_found", `Capability '${slug}' not found.`),
      404,
    );
  }

  // Phase A0c.1: last_customer_call_at via the daily-digest filter
  // convention (lib/daily-digest/fetch-platform.ts:20-24, 56, 63, 70,
  // 78, 92). Excludes internal test-runner transactions, identified by
  // user_id = the system user. Customer paths set a real user_id or
  // NULL (free-tier); test-runner.ts:1270 writes user_id = system user.
  //
  // Run as a separate query rather than a correlated subquery in the
  // outer SELECT — Drizzle's `${capabilities.id}` interpolation inside
  // a `sql` template tag within a .select({}) builder doesn't reliably
  // produce the table-qualified reference needed to correlate to the
  // outer FROM in postgres-js. A plain SELECT keyed on the resolved
  // cap.id is both readable and provably correct.
  const lastCustomerCallRows = await db.execute(sql`
    SELECT MAX(t.created_at) AS last_customer_call_at
      FROM transactions t
     WHERE t.capability_id = ${cap.id}
       AND t.status = 'completed'
       AND (t.user_id IS NULL OR t.user_id != (
         SELECT id FROM users WHERE email = 'system@strale.internal' LIMIT 1
       ))
  `);
  const lccRows = Array.isArray(lastCustomerCallRows)
    ? lastCustomerCallRows
    : (lastCustomerCallRows as { rows?: unknown[] })?.rows ?? [];
  const lastCustomerCallAt =
    (lccRows[0] as { last_customer_call_at?: Date | string | null } | undefined)
      ?.last_customer_call_at ?? null;

  // Reverse lookup: which solutions include this capability?
  const parentSolutions = await db
    .selectDistinct({
      slug: solutions.slug,
      name: solutions.name,
      description: solutions.description,
      priceCents: solutions.priceCents,
      category: solutions.category,
      geography: solutions.geography,
    })
    .from(solutions)
    .innerJoin(solutionSteps, eq(solutionSteps.solutionId, solutions.id))
    .where(
      and(
        eq(solutionSteps.capabilitySlug, slug),
        eq(solutions.isActive, true),
      ),
    );

  // Batch step counts for all parent solutions in one query
  const solSlugs = parentSolutions.map((s) => s.slug);
  const stepCounts = solSlugs.length > 0
    ? await db
        .select({
          slug: solutions.slug,
          count: sql<number>`count(*)`,
        })
        .from(solutionSteps)
        .innerJoin(solutions, eq(solutionSteps.solutionId, solutions.id))
        .where(inArray(solutions.slug, solSlugs))
        .groupBy(solutions.slug)
    : [];
  const stepCountMap = new Map(stepCounts.map((r) => [r.slug, Number(r.count)]));

  const partOfSolutions = parentSolutions.map((sol) => ({
    slug: sol.slug,
    name: sol.name,
    description: sol.description,
    price_cents: sol.priceCents,
    category: sol.category,
    geography: sol.geography,
    step_count: stepCountMap.get(sol.slug) ?? 0,
  }));

  // Strip internal cap.id from the response — it was selected only to
  // drive the last_customer_call_at lookup above; the public catalog
  // shape exposes the slug, not the internal UUID.
  const { id: _internalId, ...capPublic } = cap;
  return c.json({
    ...capPublic,
    last_customer_call_at: lastCustomerCallAt,
    partOfSolutions,
  });
});
