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
  // SA.2b (F-A-003, F-A-009): per-capability PII classification.
  // Required for all new capabilities onboarded post-SA.2b.b.
  processes_personal_data?: boolean;
  personal_data_categories?: string[];
}
