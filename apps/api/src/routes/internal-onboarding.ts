import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { eq, isNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, testResults } from "../db/schema.js";
import { checkReadiness, checkAllReadiness, clearReadinessCache } from "../lib/capability-readiness.js";
import { apiError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

function isValidAdminAuth(auth: string | undefined): boolean {
  if (!auth || !ADMIN_SECRET) return false;
  const expected = Buffer.from(`Bearer ${ADMIN_SECRET}`, "utf-8");
  const provided = Buffer.from(auth, "utf-8");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

function heuristicLatency(transparencyTag: string | null): number {
  switch (transparencyTag) {
    case "algorithmic": return 20;
    case "ai_generated": return 3000;
    case "mixed": return 2000;
    default: return 1000;
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
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
    .select({
      slug: capabilities.slug,
      transparencyTag: capabilities.transparencyTag,
    })
    .from(capabilities)
    .where(isNull(capabilities.avgLatencyMs));

  if (missing.length === 0) {
    return c.json({ updated: [], count: 0 });
  }

  const updated: Array<{ slug: string; old_ms: null; new_ms: number; source: string }> = [];

  for (const cap of missing) {
    const measurements = await db
      .select({ responseTimeMs: testResults.responseTimeMs })
      .from(testResults)
      .where(eq(testResults.capabilitySlug, cap.slug));

    const times = measurements.map((m) => m.responseTimeMs).filter((t) => t > 0);

    let newMs: number;
    let source: string;

    if (times.length >= 3) {
      newMs = median(times);
      source = `median of ${times.length} test results`;
    } else {
      newMs = heuristicLatency(cap.transparencyTag);
      source = `heuristic (${cap.transparencyTag ?? "no tag"})`;
    }

    await db
      .update(capabilities)
      .set({ avgLatencyMs: newMs, updatedAt: new Date() })
      .where(eq(capabilities.slug, cap.slug));

    updated.push({ slug: cap.slug, old_ms: null, new_ms: newMs, source });
  }

  clearReadinessCache();
  return c.json({ updated, count: updated.length });
});
