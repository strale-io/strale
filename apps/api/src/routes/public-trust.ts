import { Hono } from "hono";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { testSuites, solutions, solutionSteps } from "../db/schema.js";
import { apiError } from "../lib/errors.js";

/**
 * Public trust projection — `/v1/public/ops/trust/*`.
 *
 * Why this exists: the published `strale-mcp` package called
 * `/v1/internal/trust/*` for the badges it shows next to search results. Those
 * routes were deleted with the SQS engine (DEC-20260503-B, 2026-05-05), and
 * because `adminOnly` is mounted on the whole `/v1/internal/*` prefix, requests
 * to the now-nonexistent path returned 401 rather than 404. Every public
 * install has therefore started with `0 cap trust, 0 sol trust` since then,
 * logging the failure to stderr and continuing — invisible in an MCP client.
 *
 * The fix is NOT to relax the admin wall. `/v1/internal/*` stays admin-only.
 * This is a deliberately narrow public projection carrying only fields that are
 * already public through `/v1/public/ops/tests/*`, in canonical machine-readable
 * form per the wire-shape rule (integers, ISO dates, no pre-formatted values).
 *
 * What the badge asserts, precisely: that Strale runs its own tests against this
 * capability — not that the capability is currently healthy. `pass_rate` is
 * returned alongside so a consumer can judge that for itself, rather than the
 * badge silently encoding a quality threshold nobody can see. The retired SQS
 * grades, guidance strategy, and raw sub-scores are deliberately NOT projected:
 * they were retired, and reviving them here would recreate a scoring surface
 * the platform decided to stop publishing.
 */
export const publicTrustRoute = new Hono();

/** Fields a public trust entry may ever contain. Asserted in tests. */
export const PUBLIC_TRUST_FIELDS = [
  "badge",
  "badge_label",
  "tested",
  "last_tested_at",
  "pass_rate",
] as const;

export const PUBLIC_SOLUTION_TRUST_FIELDS = [
  ...PUBLIC_TRUST_FIELDS,
  "capabilities_total",
  "capabilities_tested",
] as const;

const MAX_SLUGS = 100;
const BADGE = "strale_tested";
const BADGE_LABEL = "Strale tested";

export interface PublicTrustEntry {
  badge: string | null;
  badge_label: string | null;
  tested: boolean;
  last_tested_at: string | null;
  pass_rate: number | null;
}

function parseSlugs(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_SLUGS);
}

const untested = (): PublicTrustEntry => ({
  badge: null,
  badge_label: null,
  tested: false,
  last_tested_at: null,
  pass_rate: null,
});

/**
 * Latest result per active suite, aggregated per capability slug.
 *
 * Mirrors the DISTINCT ON query the per-slug public tests handler already uses
 * (internal-tests.ts) rather than inventing a second definition of "the latest
 * test result" that could drift from it.
 */
async function capabilityTrust(slugs: string[]): Promise<Map<string, PublicTrustEntry>> {
  const out = new Map<string, PublicTrustEntry>();
  for (const slug of slugs) out.set(slug, untested());
  if (slugs.length === 0) return out;

  const db = getDb();
  const suites = await db
    .select({ id: testSuites.id, slug: testSuites.capabilitySlug })
    .from(testSuites)
    .where(and(inArray(testSuites.capabilitySlug, slugs), eq(testSuites.active, true)));

  if (suites.length === 0) return out;

  const suiteIds = suites.map((s) => s.id);
  const rows = await db.execute<{
    test_suite_id: string;
    passed: boolean;
    executed_at: string | Date;
  }>(sql`
    SELECT DISTINCT ON (test_suite_id) test_suite_id, passed, executed_at
    FROM test_results
    WHERE test_suite_id IN (${sql.join(suiteIds.map((id) => sql`${id}`), sql`, `)})
    ORDER BY test_suite_id, executed_at DESC
  `);
  const list = (Array.isArray(rows) ? rows : (rows as any)?.rows ?? []) as Array<{
    test_suite_id: string;
    passed: boolean;
    executed_at: string | Date;
  }>;
  const bySuite = new Map(list.map((r) => [r.test_suite_id, r]));

  const agg = new Map<string, { total: number; passed: number; last: Date | null }>();
  for (const suite of suites) {
    const latest = bySuite.get(suite.id);
    if (!latest) continue;
    const a = agg.get(suite.slug) ?? { total: 0, passed: 0, last: null };
    a.total += 1;
    if (latest.passed) a.passed += 1;
    const at = latest.executed_at instanceof Date ? latest.executed_at : new Date(latest.executed_at);
    if (!a.last || at > a.last) a.last = at;
    agg.set(suite.slug, a);
  }

  for (const [slug, a] of agg) {
    if (a.total === 0) continue;
    out.set(slug, {
      badge: BADGE,
      badge_label: BADGE_LABEL,
      tested: true,
      last_tested_at: a.last ? a.last.toISOString() : null,
      pass_rate: Math.round((a.passed / a.total) * 100),
    });
  }
  return out;
}

publicTrustRoute.get("/capabilities/batch", async (c) => {
  const slugs = parseSlugs(c.req.query("slugs"));
  if (slugs.length === 0) {
    return c.json(apiError("invalid_request", "slugs query parameter is required"), 400);
  }
  const trust = await capabilityTrust(slugs);
  return c.json(Object.fromEntries(trust));
});

publicTrustRoute.get("/solutions/batch", async (c) => {
  const slugs = parseSlugs(c.req.query("slugs"));
  if (slugs.length === 0) {
    return c.json(apiError("invalid_request", "slugs query parameter is required"), 400);
  }

  const db = getDb();
  const steps = await db
    .select({ solutionSlug: solutions.slug, capabilitySlug: solutionSteps.capabilitySlug })
    .from(solutionSteps)
    .innerJoin(solutions, eq(solutionSteps.solutionId, solutions.id))
    .where(inArray(solutions.slug, slugs));

  const bySolution = new Map<string, string[]>();
  for (const s of slugs) bySolution.set(s, []);
  for (const row of steps) {
    if (!row.capabilitySlug) continue;
    bySolution.get(row.solutionSlug)?.push(row.capabilitySlug);
  }

  const allCaps = [...new Set(steps.map((s) => s.capabilitySlug).filter(Boolean) as string[])];
  const capTrust = await capabilityTrust(allCaps);

  const out: Record<string, PublicTrustEntry & { capabilities_total: number; capabilities_tested: number }> = {};
  for (const slug of slugs) {
    const caps = bySolution.get(slug) ?? [];
    const entries = caps.map((c2) => capTrust.get(c2)).filter(Boolean) as PublicTrustEntry[];
    const tested = entries.filter((e) => e.tested);

    // A solution is only "Strale tested" when every step it runs is. A bundle
    // is exactly as verified as its least-verified step, and claiming otherwise
    // would let an untested step hide behind a tested sibling.
    const allTested = caps.length > 0 && tested.length === caps.length;
    const last = tested
      .map((e) => e.last_tested_at)
      .filter(Boolean)
      .sort()
      .pop() ?? null;

    out[slug] = {
      badge: allTested ? BADGE : null,
      badge_label: allTested ? BADGE_LABEL : null,
      tested: allTested,
      last_tested_at: allTested ? last : null,
      pass_rate: tested.length
        ? Math.round(tested.reduce((s, e) => s + (e.pass_rate ?? 0), 0) / tested.length)
        : null,
      capabilities_total: caps.length,
      capabilities_tested: tested.length,
    };
  }

  return c.json(out);
});
