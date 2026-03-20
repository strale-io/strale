/**
 * Capability readiness checker — single source of truth for
 * "is this capability fully onboarded and ready for production traffic?"
 *
 * Checks 6 dimensions: executor, DB row, test suites, latency estimate,
 * transparency tag, and schema completeness.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, testSuites } from "../db/schema.js";
import { getExecutor } from "../capabilities/index.js";
import { getDeactivatedCapabilities } from "../capabilities/auto-register.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ReadinessCheck {
  slug: string;
  ready: boolean;
  deactivated: boolean;
  dimensions: {
    has_executor: boolean;
    has_db_row: boolean;
    is_active: boolean;
    has_test_suites: boolean;
    test_suite_count: number;
    has_latency_estimate: boolean;
    avg_latency_ms: number | null;
    has_transparency_tag: boolean;
    transparency_tag: string | null;
    has_input_schema: boolean;
    has_output_schema: boolean;
  };
  issues: string[];
}

// ─── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: ReadinessCheck; expiresAt: number }>();

export function clearReadinessCache(): void {
  cache.clear();
}

function getCached(slug: string): ReadinessCheck | null {
  const entry = cache.get(slug);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) cache.delete(slug);
    return null;
  }
  return entry.data;
}

function setCache(slug: string, data: ReadinessCheck): void {
  cache.set(slug, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Schema helpers ────────────────────────────────────────────────────────────

function hasProperties(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return false;
  const s = schema as Record<string, unknown>;
  const props = s.properties;
  if (!props || typeof props !== "object") return false;
  return Object.keys(props).length > 0;
}

// ─── Core ──────────────────────────────────────────────────────────────────────

export async function checkReadiness(slug: string): Promise<ReadinessCheck> {
  const cached = getCached(slug);
  if (cached) return cached;

  const deactivated = getDeactivatedCapabilities();
  const isDeactivated = deactivated.has(slug);

  const hasExecutor = !!getExecutor(slug);

  const db = getDb();

  const [row] = await db
    .select({
      isActive: capabilities.isActive,
      avgLatencyMs: capabilities.avgLatencyMs,
      transparencyTag: capabilities.transparencyTag,
      inputSchema: capabilities.inputSchema,
      outputSchema: capabilities.outputSchema,
    })
    .from(capabilities)
    .where(eq(capabilities.slug, slug))
    .limit(1);

  const hasDbRow = !!row;
  const isActive = row?.isActive ?? false;
  const hasLatency = row?.avgLatencyMs != null;
  const hasTransparency = !!row?.transparencyTag;
  const hasInputSchema = hasProperties(row?.inputSchema);
  const hasOutputSchema = hasProperties(row?.outputSchema);

  let testSuiteCount = 0;
  if (hasDbRow) {
    const suites = await db
      .select({ id: testSuites.id })
      .from(testSuites)
      .where(eq(testSuites.capabilitySlug, slug));
    testSuiteCount = suites.length;
  }

  const issues: string[] = [];
  if (isDeactivated) issues.push(`Deactivated: ${deactivated.get(slug)}`);
  if (!hasExecutor) issues.push("No executor registered");
  if (!hasDbRow) issues.push("No database row in capabilities table");
  if (hasDbRow && !isActive) issues.push("Capability is_active = false");
  if (testSuiteCount === 0) issues.push("No test suites — quality scoring is blind");
  if (hasDbRow && !hasLatency) issues.push("Missing avg_latency_ms (sync/async routing defaults to sync)");
  if (hasDbRow && !hasTransparency) issues.push("Missing transparency_tag");
  if (hasDbRow && !hasInputSchema) issues.push("Input schema has no properties — agents cannot discover parameters");
  if (hasDbRow && !hasOutputSchema) issues.push("Output schema has no properties — agents cannot validate responses");

  const ready =
    hasExecutor &&
    hasDbRow &&
    isActive &&
    testSuiteCount > 0 &&
    hasLatency &&
    hasTransparency &&
    hasInputSchema &&
    hasOutputSchema &&
    !isDeactivated;

  const result: ReadinessCheck = {
    slug,
    ready,
    deactivated: isDeactivated,
    dimensions: {
      has_executor: hasExecutor,
      has_db_row: hasDbRow,
      is_active: isActive,
      has_test_suites: testSuiteCount > 0,
      test_suite_count: testSuiteCount,
      has_latency_estimate: hasLatency,
      avg_latency_ms: row?.avgLatencyMs ?? null,
      has_transparency_tag: hasTransparency,
      transparency_tag: row?.transparencyTag ?? null,
      has_input_schema: hasInputSchema,
      has_output_schema: hasOutputSchema,
    },
    issues,
  };

  setCache(slug, result);
  return result;
}

export async function isReady(slug: string): Promise<boolean> {
  const check = await checkReadiness(slug);
  return check.ready;
}

export async function checkAllReadiness(): Promise<Map<string, ReadinessCheck>> {
  const db = getDb();

  // Get all slugs from DB
  const dbRows = await db
    .select({ slug: capabilities.slug })
    .from(capabilities);

  const allSlugs = new Set(dbRows.map((r) => r.slug));

  // Also include deactivated slugs (they have executor files but no DB rows usually)
  for (const slug of getDeactivatedCapabilities().keys()) {
    allSlugs.add(slug);
  }

  const results = new Map<string, ReadinessCheck>();
  for (const slug of [...allSlugs].sort()) {
    results.set(slug, await checkReadiness(slug));
  }

  return results;
}
