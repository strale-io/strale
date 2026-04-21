/**
 * Capability readiness checker — single source of truth for
 * "is this capability fully onboarded and ready for production traffic?"
 *
 * Checks 8 dimensions: executor, DB row, test suites, latency estimate,
 * transparency tag, schema completeness, output_field_reliability coverage,
 * and capability_limitations presence.
 *
 * The last two dimensions were added per DEC-20260423-B (Stage A, warning
 * mode): DEC-20260320-B claims the onboarding pipeline populates these two
 * fields, but until 2026-04-23 the hook `onCapabilityCreated` did not, and
 * `checkReadiness` did not gate on them. 34 caps shipped to prod with NULL
 * reliability (see audit-reports/... or C:\tmp\dec-20260320-b-audit.md).
 *
 * BLOCKING_GATE_FIELDS controls whether missing reliability/limitations
 * affects `ready` (Stage D = true) or is warn-only (Stage A = false).
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, capabilityLimitations, testSuites } from "../db/schema.js";
import { getExecutor } from "../capabilities/index.js";
import { getDeactivatedCapabilities } from "../capabilities/auto-register.js";

/**
 * Controls whether the DEC-20260423-B reliability + limitations checks
 * affect the `ready` verdict, or are warn-only.
 *
 * Stage A (2026-04-23 initial): false — warn-only; DB-gap caps still
 *   `ready: true`, but surface warnings in `issues` for visibility.
 * Stage D (2026-04-23 later, after 21-cap backfill): true — gaps fail
 *   `ready`; new onboarding halts if reliability/limitations not populated.
 *
 * The flip from false → true is the Stage D commit.
 */
export const BLOCKING_GATE_FIELDS = {
  reliability: false as boolean,
  limitations: false as boolean,
};

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
    /** DEC-20260423-B: output_field_reliability column non-NULL and covers
     *  every property in output_schema. */
    has_reliability: boolean;
    reliability_missing_fields: string[];
    /** DEC-20260423-B: at least one active row in capability_limitations. */
    has_limitations: boolean;
    limitation_count: number;
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

function getOutputSchemaProperties(schema: unknown): string[] {
  if (!schema || typeof schema !== "object") return [];
  const s = schema as Record<string, unknown>;
  const props = s.properties;
  if (!props || typeof props !== "object") return [];
  return Object.keys(props as Record<string, unknown>);
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
      outputFieldReliability: capabilities.outputFieldReliability,
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

  // DEC-20260423-B: reliability coverage + limitations presence
  const reliabilityRaw = row?.outputFieldReliability as Record<string, string> | null | undefined;
  const reliabilityKeys = reliabilityRaw && typeof reliabilityRaw === "object"
    ? Object.keys(reliabilityRaw)
    : [];
  const outputSchemaProps = getOutputSchemaProperties(row?.outputSchema);
  const reliabilityMissingFields = outputSchemaProps.filter(
    (p) => !reliabilityKeys.includes(p),
  );
  const hasReliability = hasDbRow
    && reliabilityKeys.length > 0
    && reliabilityMissingFields.length === 0;

  let limitationCount = 0;
  if (hasDbRow) {
    const lims = await db
      .select({ id: capabilityLimitations.id })
      .from(capabilityLimitations)
      .where(
        and(
          eq(capabilityLimitations.capabilitySlug, slug),
          eq(capabilityLimitations.active, true),
        ),
      );
    limitationCount = lims.length;
  }
  const hasLimitations = limitationCount > 0;

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
  // DEC-20260423-B — warn (Stage A) or block (Stage D, controlled by BLOCKING_GATE_FIELDS):
  if (hasDbRow && !hasReliability) {
    const mode = BLOCKING_GATE_FIELDS.reliability ? "blocks ready" : "warn-only (pre-Stage-D)";
    if (reliabilityKeys.length === 0) {
      issues.push(`Missing output_field_reliability — NULL or empty [${mode}]`);
    } else {
      issues.push(
        `Missing output_field_reliability for fields: ${reliabilityMissingFields.join(", ")} [${mode}]`,
      );
    }
  }
  if (hasDbRow && !hasLimitations) {
    const mode = BLOCKING_GATE_FIELDS.limitations ? "blocks ready" : "warn-only (pre-Stage-D)";
    issues.push(`No active capability_limitations rows [${mode}]`);
  }

  const ready =
    hasExecutor &&
    hasDbRow &&
    isActive &&
    testSuiteCount > 0 &&
    hasLatency &&
    hasTransparency &&
    hasInputSchema &&
    hasOutputSchema &&
    (BLOCKING_GATE_FIELDS.reliability ? hasReliability : true) &&
    (BLOCKING_GATE_FIELDS.limitations ? hasLimitations : true) &&
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
      has_reliability: hasReliability,
      reliability_missing_fields: reliabilityMissingFields,
      has_limitations: hasLimitations,
      limitation_count: limitationCount,
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
