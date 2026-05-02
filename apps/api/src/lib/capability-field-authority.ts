/**
 * Cluster 2 Phase 4a: FIELD_CATEGORIES authority taxonomy.
 *
 * Per DEC-20260420-K OQ-1 (hybrid split ownership) and DEC-20260421-E
 * (FIELD_CATEGORIES canonicity model), every column on the capabilities
 * table is categorised by which side is authoritative:
 *
 *   - `manifest` — manifest is authoritative. Create: manifest value
 *     written. Backfill: manifest value written. If DB drifts from
 *     manifest, backfill throws `AuthorityViolationError` (real bug; fix
 *     manifest or re-seed, no `--force-override-authority` bypass).
 *
 *   - `db` — DB (operator/runtime) is authoritative. Create: manifest
 *     value written as seed. Backfill: manifest value STRIPPED from
 *     payload. Operator-tuned values (e.g., admin-repriced `price_cents`)
 *     are preserved. Operator may use `--force-override-authority` to
 *     intentionally reset to manifest.
 *
 *   - `hybrid` — manifest-default overridable by DB. Create: manifest
 *     value written. Backfill: manifest value written ONLY if the DB
 *     value is currently null (fills gaps without overwriting operator
 *     tuning).
 *
 * Column-by-column rationale is in the entries below. When adding a new
 * column to schema.ts, add an entry here — a test (`capability-field-
 * authority.test.ts`) asserts schema-vs-taxonomy parity and will fail
 * until the new column is categorised.
 *
 * This taxonomy is consumed by:
 *   - `normalizeManifestToRow` (capability-manifest.ts): strips `db`
 *     fields and conditionally-strips `hybrid` fields in partial mode.
 *   - `checkAuthorityDrift` (onboarding-gates.ts): upgrades warnings to
 *     errors for `manifest` mismatches; downgrades `db`/`hybrid` mismatches
 *     to DEBUG logs (strip already prevented the problem).
 */

export type FieldCategory = "manifest" | "db" | "hybrid";

export interface FieldAuthorityEntry {
  category: FieldCategory;
  /** Sentence explaining *why* this side is canonical. Future readers
   *  consult this before re-categorising. */
  reason: string;
}

/**
 * Keyed by **snake_case DB column name** (not camelCase). Consumers that
 * compare against manifest-shape fields do snake_case lookup on the
 * mapped name (e.g., manifest.`input_schema` → DB `input_schema`).
 *
 * Columns intentionally omitted: `id`, `created_at`, `updated_at` —
 * system-managed timestamps/PK, handled by DB defaults, never driven
 * by manifest or operator.
 */
export const FIELD_CATEGORIES: Record<string, FieldAuthorityEntry> = {
  // ── manifest-canonical: authored in the YAML manifest ────────────────
  slug: {
    category: "manifest",
    reason: "Capability identifier; manifest is the authoring surface.",
  },
  name: {
    category: "manifest",
    reason: "Human-readable name declared in the manifest.",
  },
  description: {
    category: "manifest",
    reason: "Description declared in the manifest; SEO/title source.",
  },
  category: {
    category: "manifest",
    reason: "Taxonomy declared in the manifest.",
  },
  input_schema: {
    category: "manifest",
    reason: "Input contract declared in the manifest. Gate 3 enforces `required ⊆ properties` at authoring time.",
  },
  output_schema: {
    category: "manifest",
    reason: "Output contract declared in the manifest. Documentation-only per DEC-16.",
  },
  data_source: {
    category: "manifest",
    reason: "Data source declaration (audit trail requirement).",
  },
  processes_personal_data: {
    category: "manifest",
    reason: "GDPR PII classification (F-A-003/SA.2b.d). Required field; NOT NULL in schema.",
  },
  personal_data_categories: {
    category: "manifest",
    reason: "GDPR PII taxonomy (SA.2b). Manifest declares the canonical set.",
  },
  maintenance_class: {
    category: "manifest",
    reason: "Operational tier (tiered test scheduling). Declared in manifest.",
  },
  output_field_reliability: {
    category: "manifest",
    reason: "Field-level reliability map; informs test assertions and SQS.",
  },

  // ── db-canonical: operator or runtime writes; backfill preserves ────
  price_cents: {
    category: "db",
    reason: "Operator-tuned pricing. Phase 3 validation Gate 2 proved silent-overwrite risk (manifest 10 overwrote admin-tuned 5 on lei-lookup).",
  },
  is_free_tier: {
    category: "db",
    reason: "Pricing policy bit; tied to price_cents. Admin-toggled.",
  },
  transparency_tag: {
    category: "db",
    reason: "Drift audit Section 6 Finding 5.1: 5 manifests carry invalid `external_api` value that DB corrected. Manifests are stale; DB is corrected.",
  },
  is_active: {
    category: "db",
    reason: "Runtime lifecycle flag; admin toggle. Not authored in manifest.",
  },
  visible: {
    category: "db",
    reason: "Public-catalog visibility flag; hook + admin control.",
  },
  lifecycle_state: {
    category: "db",
    reason: "State machine managed by onCapabilityCreated + admin endpoints.",
  },
  deactivation_reason: {
    category: "db",
    reason: "Admin-recorded reason on suspension.",
  },
  avg_latency_ms: {
    category: "db",
    reason: "Measured at runtime by test runner; not authored.",
  },
  success_rate: {
    category: "db",
    reason: "Measured at runtime by test runner.",
  },
  qp_score: {
    category: "db",
    reason: "Computed by SQS job (DEC-20260319-A).",
  },
  rp_score: {
    category: "db",
    reason: "Computed by SQS job (reliability-profile score).",
  },
  matrix_sqs: {
    category: "db",
    reason: "Composite SQS score; computed by SQS job per DEC-20260319-A.",
  },
  matrix_sqs_raw: {
    category: "db",
    reason: "Raw SQS score (pre-rounding); computed by SQS job.",
  },
  trend: {
    category: "db",
    reason: "Computed by SQS trend analysis.",
  },
  freshness_level: {
    category: "db",
    reason: "Computed by staleness-refresh job.",
  },
  last_tested_at: {
    category: "db",
    reason: "Updated by test runner after each run.",
  },
  freshness_decayed_at: {
    category: "db",
    reason: "Updated by staleness-refresh job.",
  },
  data_update_cycle_days: {
    category: "db",
    reason: "Runtime-tracked dataset freshness cycle.",
  },
  dataset_last_updated: {
    category: "db",
    reason: "Runtime-tracked dataset update timestamp.",
  },
  guidance_usable: {
    category: "db",
    reason: "Computed by test runner (execution guidance cache).",
  },
  guidance_strategy: {
    category: "db",
    reason: "Computed by test runner (execution guidance cache).",
  },
  guidance_confidence: {
    category: "db",
    reason: "Computed by test runner (execution guidance cache).",
  },
  fallback_capability_slug: {
    category: "db",
    reason: "Operator-configured fallback routing; not authored in manifest.",
  },
  fallback_coverage: {
    category: "db",
    reason: "Operator-configured fallback coverage declaration.",
  },
  fallback_verification_level: {
    category: "db",
    reason: "Operator-configured fallback verification level.",
  },
  error_codes_json: {
    category: "db",
    reason: "Populated at runtime; error-code observations.",
  },
  search_tags: {
    category: "db",
    reason: "Operator-tuned search tags; not authored in manifest today.",
  },
  onboarding_manifest: {
    category: "db",
    reason: "JSONB snapshot of the manifest written at insert time. Never manifest-authored.",
  },
  degraded_recovery_count: {
    category: "db",
    reason: "Lifecycle-recovery counter (DEC-20260319-A).",
  },
  x402_enabled: {
    category: "db",
    reason: "Operator-toggled x402 payment-gateway exposure (DB-driven, no-deploy).",
  },
  x402_method: {
    category: "db",
    reason: "Operator-configured x402 HTTP method.",
  },
  gdpr_art_22_classification: {
    category: "manifest",
    reason:
      "Bucket C (migration 0058): per-capability GDPR Art. 22 classification " +
      "(data_lookup | screening_signal | risk_synthesis). Manifest-canonical " +
      "from 2026-04-30 (the next session after the initial backfill); the " +
      "manifest YAML's gdpr_art_22_classification field is the authoring " +
      "surface. Validated at authoring time by validateCapabilityStructure " +
      "(gate 15) against VALID_GDPR_ART_22_CLASSIFICATIONS. Optional in the " +
      "manifest; the DB column applies a 'data_lookup' default when unset.",
  },

  // ── hybrid: manifest seeds on create/when DB is null; DB preserved ──
  capability_type: {
    category: "hybrid",
    reason: "Derived from manifest `data_source_type` via dataSourceTypeToCapType mapping. Drift audit Section 6 Finding 5.2: 77 rows have `ai_assisted` that cannot round-trip from manifest. Hybrid preserves drifted rows.",
  },
  freshness_category: {
    category: "hybrid",
    reason: "Mix of NULL + operator-set values in drift audit. Backfill fills NULL; preserves operator values. F-B-003 context.",
  },
  geography: {
    category: "hybrid",
    reason: "Some rows NULL, some operator-set. Backfill fills NULL; preserves set values. F-B-004 context.",
  },
  data_classification: {
    category: "hybrid",
    reason: "Defaults to 'public' on create; operator may tune to 'personal'/'public_financial_data'/etc. Backfill fills NULL; preserves set values.",
  },
};

/** Convert a snake_case field name to the Drizzle camelCase column key. */
export function snakeToCamel(field: string): string {
  return field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Decide for a given snake_case field + existing DB row whether the
 * manifest value should be preserved in the backfill payload, stripped,
 * or flagged as a manifest-canonical authority violation.
 *
 * Returns:
 *   - `keep`: field passes through to the UPDATE
 *   - `strip-db`: field removed (db-canonical)
 *   - `strip-hybrid-dbset`: field removed (hybrid, DB already has a value)
 *   - `keep-hybrid-dbnull`: field passes through (hybrid, DB is null)
 *   - `violation-manifest`: manifest-canonical field with drifted DB value
 *   - `unknown`: field not in FIELD_CATEGORIES — default safe strip + log
 */
export type AuthorityDecision =
  | { action: "keep"; category: FieldCategory }
  | { action: "strip-db" }
  | { action: "strip-hybrid-dbset" }
  | { action: "keep-hybrid-dbnull" }
  | { action: "violation-manifest"; dbValue: unknown; manifestValue: unknown }
  | { action: "unknown" };

export function decideFieldAuthority(
  field: string,
  manifestValue: unknown,
  existingRow: Record<string, unknown> | null,
  opts: { bypassAuthority?: boolean } = {},
): AuthorityDecision {
  const entry = FIELD_CATEGORIES[field];
  if (!entry) return { action: "unknown" };

  if (opts.bypassAuthority) {
    // --force-override-authority: manifest wins for db + hybrid fields.
    // Manifest-canonical violations STILL throw (real manifest-drift bug).
    if (entry.category === "manifest") {
      // fall through to violation check below
    } else {
      return { action: "keep", category: entry.category };
    }
  }

  if (entry.category === "manifest") {
    // Check for drift: manifest declares value, DB holds different value
    if (existingRow != null && manifestValue !== undefined) {
      const dbField = snakeToCamel(field);
      const dbValue = existingRow[dbField];
      if (dbValue !== undefined && !valuesEqual(manifestValue, dbValue)) {
        return { action: "violation-manifest", dbValue, manifestValue };
      }
    }
    return { action: "keep", category: "manifest" };
  }

  if (entry.category === "db") {
    return { action: "strip-db" };
  }

  // hybrid: check whether DB has a value
  if (existingRow == null) {
    // No existing row (should be create mode, but defensive)
    return { action: "keep", category: "hybrid" };
  }
  const dbField = snakeToCamel(field);
  const dbValue = existingRow[dbField];
  if (dbValue == null) {
    return { action: "keep-hybrid-dbnull" };
  }
  return { action: "strip-hybrid-dbset" };
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!valuesEqual(a[i], b[i])) return false;
    }
    return true;
  }
  // Plain objects: compare by key-set + recursive valuesEqual on values.
  // Order-insensitive — fixes false-positive authority drift when manifest
  // and DB JSONB store the same logical map with different key ordering.
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao);
  const bKeys = Object.keys(bo);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
    if (!valuesEqual(ao[k], bo[k])) return false;
  }
  return true;
}

/**
 * Thrown when backfill detects manifest-canonical drift — the DB holds
 * a value that differs from the manifest on a field the manifest should
 * own. This indicates a real problem: either the manifest is stale (fix
 * the manifest) or the DB was directly edited (re-seed from manifest).
 * `--force-override-authority` does NOT bypass this — that escape hatch
 * only applies to the db/hybrid strip logic.
 */
export class AuthorityViolationError extends Error {
  constructor(
    public readonly violations: Array<{ field: string; manifestValue: unknown; dbValue: unknown; reason: string }>,
  ) {
    super(
      `Authority violation — manifest drift on manifest-canonical fields:\n` +
      violations.map((v) =>
        `  [${v.field}] manifest=${JSON.stringify(v.manifestValue)} db=${JSON.stringify(v.dbValue)}\n` +
        `    reason: ${v.reason}\n` +
        `    fix: update the manifest to match DB, or re-seed the DB to match manifest.`,
      ).join("\n"),
    );
    this.name = "AuthorityViolationError";
  }
}
