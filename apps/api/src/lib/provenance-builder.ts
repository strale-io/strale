/**
 * Rich provenance builder for regulatory-grade audit trails.
 *
 * Provides structured provenance that satisfies:
 * - EU AI Act Art. 12 — automatic logging including data sources
 * - US Inference Data Use Records — full inference chain
 * - ISO/IEC 24970 — AI system logging standard
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { getStraleJurisdiction } from "./processing-location.js";
import { logError, logWarn } from "./log.js";

// Acquisition method per DEC-20260428-A (third-party scraping doctrine).
// Identifies how the upstream vendor obtained the data, so customers can
// reason about provenance under EU AMLR / US BSA enhanced-due-diligence.
export type AcquisitionMethod =
  | "direct_api"        // direct call to authoritative API (e.g. SEC EDGAR, GLEIF, VIES)
  | "licensed_bulk"     // bulk feed under licence (e.g. FL Sunbiz download, vendor-licensed snapshot)
  | "vendor_aggregation" // multi-source aggregator with mixed methods
  | "vendor_scraping"   // vendor scrapes public-records portal (permitted under DEC-20260428-A Tier 2)
  | "primary_source";    // direct primary-source document retrieval (e.g. court filing, registry doc)

export interface RichProvenance {
  source: string;
  source_url?: string;
  fetched_at: string;

  // Attribution / licensing. Required for data served under CC BY 4.0 (or
  // equivalent) — notably EU High-Value Datasets under Reg. (EU) 2023/138
  // such as Bolagsverket HVD, KVK HVDS, Brreg, CVR, PRH, ARES, Ariregister.
  // Capabilities sourcing from open-data APIs should set all four.
  // Hash-anchored via integrity-hash.ts (the full provenance object is
  // included in the tamper-evident payload).
  attribution?: string;
  license?: string;
  license_url?: string;
  source_note?: string;

  // Upstream sourcing disclosure (DEC-20260428-A Tier 2(c)(d)).
  // Set when data passes through a third-party vendor before reaching Strale.
  // Required for vendor_scraping; recommended for licensed_bulk and vendor_aggregation.
  upstream_vendor?: string;            // e.g. "cobalt-intelligence", "govlink", "brightquery"
  acquisition_method?: AcquisitionMethod;
  primary_source_reference?: string;   // URL, filing ID, screenshot handle, document hash

  // AI-specific fields
  ai_model?: string;
  ai_prompt_hash?: string;
  ai_raw_output_hash?: string;
  ai_processing_description?: string;

  // Operational
  response_time_ms?: number;
  retry_count?: number;
  fallback_used?: string;
  cache_hit?: boolean;

  // Jurisdiction
  processing_jurisdictions?: string[];

  // Error context (for failure audit trails)
  failed?: boolean;
  error_category?: string;

  // Allow additional fields
  [key: string]: unknown;
}

export function buildProvenance(
  options: Partial<RichProvenance> & { source: string },
): RichProvenance {
  return {
    fetched_at: new Date().toISOString(),
    ...options,
  };
}

// CRIT-10 / F-AUDIT-17: Zod gate at the provenance boundary.
//
// Pre-fix: RichProvenance had an open index signature and was never
// validated at runtime. A capability that returned provenance: null,
// provenance: {}, or provenance lacking DEC-20260428-A Tier-2 fields
// (upstream_vendor / acquisition_method / primary_source_reference)
// silently produced a "compliance-grade" audit with no provenance. With
// 290+ capabilities including Tier-2 vendor-mediated sources, this was
// producing wrong audits in prod today.
//
// This gate runs at the executor result boundary (do.ts and friends call
// validateProvenanceAtBoundary on capResult.provenance after the executor
// returns). Failures are warn-then-block:
//
//   - source missing or non-string                → WARN every time, accept
//   - acquisition_method is "vendor_scraping" but
//     upstream_vendor or primary_source_reference
//     missing                                     → WARN every time, accept
//   - acquisition_method missing for capability
//     where data_source_type = "scrape"           → WARN every time, accept
//   - schema-shape errors                         → WARN once per slug, accept
//
// "Block" escalation is v1.1 once we've seen which capabilities trip each
// warning in production logs. For v1, visibility is the goal: regulators
// looking at audit_trail.provenance need to see what's missing instead of
// finding silently empty fields.

const acquisitionMethodSchema = z.enum([
  "direct_api",
  "licensed_bulk",
  "vendor_aggregation",
  "vendor_scraping",
  "primary_source",
]);

const richProvenanceSchema = z
  .object({
    source: z.string().min(1),
    source_url: z.string().optional(),
    fetched_at: z.string(),
    attribution: z.string().optional(),
    license: z.string().optional(),
    license_url: z.string().optional(),
    source_note: z.string().optional(),
    upstream_vendor: z.string().optional(),
    acquisition_method: acquisitionMethodSchema.optional(),
    primary_source_reference: z.string().optional(),
    ai_model: z.string().optional(),
    ai_prompt_hash: z.string().optional(),
    ai_raw_output_hash: z.string().optional(),
    ai_processing_description: z.string().optional(),
    response_time_ms: z.number().optional(),
    retry_count: z.number().optional(),
    fallback_used: z.string().optional(),
    cache_hit: z.boolean().optional(),
    processing_jurisdictions: z.array(z.string()).optional(),
    failed: z.boolean().optional(),
    error_category: z.string().optional(),
  })
  .passthrough(); // additional fields allowed; the open index signature is preserved

const _shapeWarnedSlugs = new Set<string>();

export interface ProvenanceValidationContext {
  /** Capability slug. Used to deduplicate "shape warning" logs per-slug. */
  slug: string;
  /** From capabilities.data_source_type — "scrape" requires DEC-20260428-A Tier-2 fields. */
  dataSourceType: string | null;
}

export interface ProvenanceValidationResult {
  /** True when provenance is structurally valid. False = log-and-accept (warn). */
  ok: boolean;
  /** True when one or more DEC-20260428-A Tier-2 fields were expected but missing. */
  tier2Incomplete: boolean;
  /** Provenance object as-passed (for use after validation). */
  provenance: unknown;
}

export function validateProvenanceAtBoundary(
  provenance: unknown,
  ctx: ProvenanceValidationContext,
): ProvenanceValidationResult {
  // Hard reject: provenance is null / not an object. Audit body cannot
  // claim "compliance-grade" when there's literally nothing to attest to.
  // We log + return ok:false but still ACCEPT (don't throw); the audit
  // builder will surface failed:true in the audit's provenance field.
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
    if (!_shapeWarnedSlugs.has(ctx.slug)) {
      logError(
        "provenance-missing-or-invalid",
        new Error(`Capability ${ctx.slug} returned non-object provenance`),
        { slug: ctx.slug, type: typeof provenance },
      );
      _shapeWarnedSlugs.add(ctx.slug);
    }
    return { ok: false, tier2Incomplete: false, provenance };
  }

  const parsed = richProvenanceSchema.safeParse(provenance);
  if (!parsed.success) {
    if (!_shapeWarnedSlugs.has(ctx.slug)) {
      logWarn(
        "provenance-shape-invalid",
        `Capability ${ctx.slug} returned provenance failing RichProvenance schema`,
        {
          slug: ctx.slug,
          issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path, code: i.code, message: i.message })),
        },
      );
      _shapeWarnedSlugs.add(ctx.slug);
    }
    return { ok: false, tier2Incomplete: false, provenance };
  }

  // DEC-20260428-A Tier-2 completeness check.
  const p = parsed.data;
  let tier2Incomplete = false;
  if (p.acquisition_method === "vendor_scraping") {
    if (!p.upstream_vendor || !p.primary_source_reference) {
      tier2Incomplete = true;
      logWarn(
        "provenance-tier2-incomplete",
        `Capability ${ctx.slug}: vendor_scraping requires upstream_vendor + primary_source_reference per DEC-20260428-A`,
        { slug: ctx.slug, has_upstream_vendor: !!p.upstream_vendor, has_primary_source_reference: !!p.primary_source_reference },
      );
    }
  } else if (ctx.dataSourceType === "scrape" && !p.acquisition_method) {
    // Capability is classified scrape in its manifest but provenance
    // doesn't declare acquisition_method. Doctrine requires explicit
    // disclosure under Tier-2.
    tier2Incomplete = true;
    logWarn(
      "provenance-tier2-acquisition-method-missing",
      `Capability ${ctx.slug}: data_source_type=scrape but provenance lacks acquisition_method per DEC-20260428-A`,
      { slug: ctx.slug, dataSourceType: ctx.dataSourceType },
    );
  }

  return { ok: true, tier2Incomplete, provenance };
}

// Test-only — resets the warned-slugs set so tests don't leak state.
export function __resetProvenanceWarningsForTests(): void {
  _shapeWarnedSlugs.clear();
}

export function hashString(s: string): string {
  return createHash("sha256").update(s).digest("hex").substring(0, 32);
}

/**
 * Determine processing jurisdictions for a capability call.
 *
 * Composition (in order, deduped):
 *   1. Strale's own processing region — read from RAILWAY_REPLICA_REGION
 *      via processing-location.getStraleJurisdiction(). Today: "US"
 *      (Railway us-east-4). Was previously hardcoded as "EU" — F-AUDIT-18.
 *   2. "US" if the call invokes a US-hosted model provider (Anthropic via
 *      capabilityType=ai_assisted or transparencyTag in
 *      [ai_generated, mixed]).
 *
 * NOT YET captured (chunk 1.5 follow-up):
 *   - Per-capability vendor-side jurisdictions, e.g. Dilisense in Frankfurt
 *     (DE/EU), Browserless region, etc. These should be manifest-declared
 *     and merged in here. The "US" today is honest about Strale's own
 *     processing without claiming knowledge we don't have about vendors.
 *
 * Returns a deduped, deterministic-order list. "unknown" is dropped from
 * the output (audit body must not assert jurisdictions we cannot derive).
 */
export function getProcessingJurisdictions(
  capabilityType: string,
  transparencyTag: string | null,
): string[] {
  const out: string[] = [];
  const strale = getStraleJurisdiction();
  if (strale && strale !== "unknown") out.push(strale);
  const usesAnthropic =
    capabilityType === "ai_assisted" ||
    transparencyTag === "ai_generated" ||
    transparencyTag === "mixed";
  if (usesAnthropic && !out.includes("US")) out.push("US");
  return out;
}

/**
 * Build a failure provenance object — captures what we know even when
 * execution fails (required for EU AI Act Art. 12 compliance).
 */
export function buildFailureProvenance(
  dataSource: string | null,
  capabilityType: string,
  transparencyTag: string | null,
  errorCategory: string,
): RichProvenance {
  return {
    source: dataSource ?? "unknown",
    fetched_at: new Date().toISOString(),
    failed: true,
    error_category: errorCategory,
    processing_jurisdictions: getProcessingJurisdictions(capabilityType, transparencyTag),
  };
}
