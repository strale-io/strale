/**
 * Rich provenance builder for regulatory-grade audit trails.
 *
 * Provides structured provenance that satisfies:
 * - EU AI Act Art. 12 — automatic logging including data sources
 * - US Inference Data Use Records — full inference chain
 * - ISO/IEC 24970 — AI system logging standard
 */

import { createHash } from "node:crypto";

export interface RichProvenance {
  source: string;
  source_url?: string;
  fetched_at: string;

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
 * Determine processing jurisdictions based on capability characteristics.
 * Strale infrastructure is always EU (Railway EU West).
 * Anthropic API calls cross to US.
 */
export function getProcessingJurisdictions(
  capabilityType: string,
  transparencyTag: string | null,
): string[] {
  const jurisdictions = ["EU"];
  if (
    capabilityType === "ai_assisted" ||
    transparencyTag === "ai_generated" ||
    transparencyTag === "mixed"
  ) {
    jurisdictions.push("US"); // Anthropic API is US-based
  }
  return jurisdictions;
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
