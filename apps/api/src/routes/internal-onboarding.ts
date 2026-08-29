import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, transactions } from "../db/schema.js";
import { checkReadiness, checkAllReadiness, clearReadinessCache } from "../lib/capability-readiness.js";
import { apiError } from "../lib/errors.js";
import { estimateRoutingLatency } from "../lib/latency-estimate.js";
import type { AppEnv } from "../types.js";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

function isValidAdminAuth(auth: string | undefined): boolean {
  if (!auth || !ADMIN_SECRET) return false;
  const expected = Buffer.from(`Bearer ${ADMIN_SECRET}`, "utf-8");
  const provided = Buffer.from(auth, "utf-8");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export const internalOnboardingRoute = new Hono<AppEnv>();

// GET /v1/internal/onboarding/readiness?slug=xxx — single capability
// GET /v1/internal/onboarding/readiness — all capabilities
internalOnboardingRoute.get("/readiness", async (c) => {
  const slug = c.req.query("slug");

  if (slug) {
    const check = await checkReadiness(slug);
    return c.json(check);
  }

  const all = await checkAllReadiness();
  const checks = [...all.values()];
  const ready = checks.filter((c) => c.ready).length;
  const withIssues = checks.filter((c) => !c.ready && !c.deactivated).length;
  const deactivated = checks.filter((c) => c.deactivated).length;

  return c.json({
    summary: {
      total: checks.length,
      ready,
      with_issues: withIssues,
      deactivated,
    },
    capabilities: checks,
  });
});

// POST /v1/internal/onboarding/fix-latency — fix null avg_latency_ms (admin only)
internalOnboardingRoute.post("/fix-latency", async (c) => {
  if (!ADMIN_SECRET) {
    return c.json(apiError("unauthorized", "Admin endpoint is not configured."), 503);
  }
  if (!isValidAdminAuth(c.req.header("Authorization"))) {
    return c.json(apiError("unauthorized", "Invalid admin secret."), 401);
  }

  const db = getDb();

  const missing = await db
    .select({ id: capabilities.id, slug: capabilities.slug })
    .from(capabilities)
    .where(isNull(capabilities.avgLatencyMs));

  if (missing.length === 0) {
    return c.json({ updated: [], skipped: [], count: 0 });
  }

  const updated: Array<{ slug: string; old_ms: null; new_ms: number; source: string }> = [];
  const skipped: Array<{ slug: string; reason: string; samples: number }> = [];

  for (const cap of missing) {
    // Completed TRANSACTIONS, not test results (#438). A transaction row
    // exists only because the capability actually ran, so it needs no suite
    // filter and no duration threshold to mean what it says. The old query
    // medianed every test result for the slug, three quarters of which are
    // schema_check / negative / edge_case rows that return in single-digit
    // milliseconds without executing anything — see lib/latency-estimate.ts
    // for the measured breakdown.
    const executions = await db
      .select({ latencyMs: transactions.latencyMs })
      .from(transactions)
      .where(and(eq(transactions.capabilityId, cap.id), eq(transactions.status, "completed")));

    const estimate = estimateRoutingLatency(
      executions.map((e) => e.latencyMs).filter((ms): ms is number => ms != null),
    );

    // Refusing is a first-class outcome. The old implementation could not:
    // with too little evidence it wrote heuristicLatency(transparencyTag) —
    // 20 ms for anything `algorithmic` — a confident tiny number nothing
    // downstream could distinguish from a measurement. A null means
    // "unmeasured", which is true, and capability-readiness.ts already
    // reports it as an issue.
    if (estimate.value === null) {
      skipped.push({ slug: cap.slug, reason: estimate.reason, samples: estimate.samples });
      continue;
    }

    await db
      .update(capabilities)
      .set({ avgLatencyMs: estimate.value, updatedAt: new Date() })
      .where(eq(capabilities.slug, cap.slug));

    updated.push({ slug: cap.slug, old_ms: null, new_ms: estimate.value, source: estimate.reason });
  }

  clearReadinessCache();
  return c.json({ updated, skipped, count: updated.length });
});
