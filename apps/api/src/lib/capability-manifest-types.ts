/**
 * Capability manifest shape — the YAML authoring surface.
 *
 * Extracted here (Cluster 2 Phase 2) so both scripts/onboard.ts and
 * src/lib/onboarding-gates.ts can reference the same type. Previously
 * lived in scripts/onboard.ts, but src/ cannot import from scripts/
 * (tsconfig build-include is src/** only), so the orchestrator in
 * onboarding-gates.ts needs this exposed under src/.
 *
 * snake_case matches the YAML / onboarding wire format. The DB-row
 * shape (camelCase) is a separate structure — see db/schema.ts.
 */

export interface ManifestExpectedField {
  field: string;
  operator: string;
  value?: unknown;
  values?: unknown[];
  reliability?: string;
}

export interface ManifestLimitation {
  title?: string | null;
  text: string;
  category: string;
  severity?: string;
  workaround?: string | null;
}

export interface Manifest {
  slug: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  is_free_tier?: boolean;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  data_source: string;
  data_source_type: string;
  transparency_tag?: string | null;
  freshness_category?: string;
  geography?: string;
  test_fixtures: {
    known_answer?: {
      input: Record<string, unknown>;
      expected_fields: ManifestExpectedField[];
    };
    health_check_input?: Record<string, unknown>;
  };
  output_field_reliability: Record<string, string>;
  limitations: ManifestLimitation[];
  maintenance_class?: string;
  // Initial latency seed; test runner overwrites once it has measured data.
  // Db-canonical per FIELD_CATEGORIES — manifest only seeds, never authority.
  avg_latency_ms?: number | null;
  // SA.2b (F-A-003, F-A-009): per-capability PII classification.
  // Required for all new capabilities onboarded post-SA.2b.b.
  processes_personal_data?: boolean;
  personal_data_categories?: string[];
  // Per DEC-20260503-A — strale.dev marketplace surfacing decision.
  // Defaults to true in the DB if omitted from the manifest. Set false
  // for thin passthroughs of paid 3rd-party vendors with significant
  // fixed cost or ToS-prohibited resale terms; PAYG with low fixed cost
  // is fine and stays true. When set false, marketplace_eligible_reason
  // is REQUIRED (non-empty) — enforced by validateManifest and
  // validateCapabilityStructure. See manifests/CLASSIFICATION.md for the
  // full cost-shape, maintenance-burden, and ToS-posture criteria plus
  // the decision tree and reason-string content guide.
  marketplace_eligible?: boolean;
  marketplace_eligible_reason?: string | null;
}
