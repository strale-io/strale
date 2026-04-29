/**
 * Rich provenance builder for regulatory-grade audit trails.
 *
 * Provides structured provenance that satisfies:
 * - EU AI Act Art. 12 — automatic logging including data sources
 * - US Inference Data Use Records — full inference chain
 * - ISO/IEC 24970 — AI system logging standard
 */

import { createHash } from "node:crypto";
import { getStraleJurisdiction } from "./processing-location.js";

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
