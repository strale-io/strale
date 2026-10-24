// Wire shapes the site reads, as the API serialises them (field names verbatim).
// Sources: apps/api/src/routes/capabilities.ts, solutions.ts, platform-facts.ts,
// x402-gateway-v2.ts (catalog), public-trust.ts (batch), internal-limitations.ts.

export type JsonSchema = {
  type?: string;
  required?: string[];
  properties?: Record<string, { type?: string | string[]; description?: string; enum?: unknown[]; [k: string]: unknown }>;
  example?: Record<string, unknown>;
  [k: string]: unknown;
};

export interface Capability {
  slug: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  input_schema: JsonSchema | null;
  output_schema: JsonSchema | null;
  transparency_tag: string | null;
  geography: string | null;
  data_source: string | null;
  is_free_tier: boolean;
  search_tags?: string[];
}

export interface Solution {
  slug: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  step_count: number;
  geography: string | null;
  transparency_tag: string | null;
  capabilities: string[];
  data_sources?: string[];
}

export interface PlatformFacts {
  capability_counts: { active_visible: number; active_total: number; catalogued: number; free_tier_slugs: string[] };
  solution_count_active: number;
  countries: { company_data_active: string[]; company_data_ever: string[] };
  processing_jurisdiction: string;
  static: {
    vendors: Record<string, string>;
    retention_days_default: number;
    pii_retention_days: number;
    controller?: { legal_name?: string; contact_email?: string; incorporation_jurisdiction?: string };
    tos_version_current?: string;
  };
  as_of: string;
}

export interface X402Item {
  slug: string;
  name: string;
  price_usd: number;
  method: string;
  endpoint: string;
}

export interface X402Catalog {
  network: string;
  capabilities: X402Item[];
  solutions: X402Item[];
}

export interface Trust {
  tested: boolean;
  last_tested_at: string | null;
  pass_rate: number | null;
}

export interface Limitation {
  title?: string;
  /** Set on bundled-check limitations: the step the limitation belongs to. */
  step?: string;
  text: string;
  category: string;
  severity: string;
  workaround?: string | null;
}

/** Fields the public API does not expose, read from manifests/<slug>.yaml at build time. */
export interface ManifestExtras {
  output_field_reliability: Record<string, "guaranteed" | "common" | "rare">;
  example_input: Record<string, unknown> | null;
  gdpr_art_22_classification?: string;
}

export type DataMode = "live" | "manifests";

export interface SiteData {
  mode: DataMode;
  /** Where the data came from: the API base URL, or the repository path for preview builds. */
  source: string;
  loaded_at: string;
  facts: PlatformFacts;
  capabilities: Capability[];
  solutions: Solution[];
  x402: X402Catalog;
  trust: Map<string, Trust>;
  manifests: Map<string, ManifestExtras>;
  /** Per tool, as the public limitations endpoint serves them (manifests in preview). */
  limitations: Map<string, Limitation[]>;
  /** Per bundled check, flattened across its steps. */
  solutionLimitations: Map<string, Limitation[]>;
}
