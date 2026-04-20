/**
 * Onboarding Gates — blocking validation for solution and capability changes.
 *
 * Gates 1, 3, 4a run as blocking checks before any solution or capability
 * write lands in the database.
 *
 * Escape hatch: per-call `ctx.skipGates: [{gate, reason}]` on
 * `validateCapability`. Replaces the old module-scoped
 * SKIP_ONBOARDING_GATES env var (DEC-20260420-K OQ-5, Cluster 2 Phase 2).
 * Benefits: per-capability granularity, audit-trailed reason string,
 * no production-env blast radius from an accidentally-set var.
 */

import { sql as sqlTag } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, solutions, solutionSteps } from "../db/schema.js";
import { eq, inArray } from "drizzle-orm";
import { logWarn } from "./log.js";
import type { Manifest } from "./capability-manifest-types.js";

const INPUT_REF = /^\$input\.(.+)$/;
const STEP_REF = /^\$steps\[(\d+)\]\.(.+)$/;
const AUTO_INJECTED = new Set(["registration_number", "jurisdiction", "entity_name"]);

interface GateViolation {
  gate: string;
  severity: "error" | "warning";
  detail: string;
}

function parseSchema(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return null; } }
  if (typeof raw === "object" && raw !== null) {
    try { return JSON.parse(JSON.stringify(raw)); } catch { return raw as Record<string, unknown>; }
  }
  return null;
}

/**
 * Validate a solution against all three gates.
 * Called before solution INSERT or UPDATE.
 *
 * @param solutionSlug - The solution being created/updated
 * @param inputSchema - The solution's input_schema
 * @param steps - The solution's step definitions
 * @returns Array of violations (empty = all gates pass)
 */
export async function validateSolution(
  solutionSlug: string,
  inputSchema: unknown,
  steps: Array<{ capabilitySlug: string; stepOrder: number; inputMap: unknown }>,
): Promise<GateViolation[]> {
  const violations: GateViolation[] = [];
  const db = getDb();

  const parsedInputSchema = parseSchema(inputSchema) as { properties?: Record<string, unknown> } | null;
  const declaredInputFields = parsedInputSchema?.properties ? Object.keys(parsedInputSchema.properties) : [];

  // Load capability schemas for all referenced capabilities
  const capSlugs = [...new Set(steps.map((s) => s.capabilitySlug))];
  const capRows = capSlugs.length > 0
    ? await db.select({ slug: capabilities.slug, inputSchema: capabilities.inputSchema, outputSchema: capabilities.outputSchema })
        .from(capabilities).where(inArray(capabilities.slug, capSlugs))
    : [];
  const capSchemas = new Map<string, { input: Record<string, unknown> | null; output: Record<string, unknown> | null }>();
  for (const c of capRows) {
    capSchemas.set(c.slug, {
      input: parseSchema(c.inputSchema),
      output: parseSchema(c.outputSchema),
    });
  }

  // Build step output field map
  const stepOutputFields = new Map<number, Set<string>>();
  for (let i = 0; i < steps.length; i++) {
    const cap = capSchemas.get(steps[i].capabilitySlug);
    const props = (cap?.output as Record<string, unknown>)?.properties;
    stepOutputFields.set(i, props ? new Set(Object.keys(props as Record<string, unknown>)) : new Set());
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const inputMap = parseInputMap(step.inputMap);

    for (const [destField, sourceExpr] of Object.entries(inputMap)) {
      if (sourceExpr === "$all_results") continue;

      // Gate 1: $input.X references
      const inputMatch = INPUT_REF.exec(sourceExpr);
      if (inputMatch) {
        const topField = inputMatch[1].split(/[.\[]/)[0];
        if (!declaredInputFields.includes(topField)) {
          violations.push({
            gate: "gate1_input_mapping",
            severity: "error",
            detail: `${solutionSlug} step ${step.stepOrder} (${step.capabilitySlug}): $input.${topField} not in solution input schema. Available: [${declaredInputFields.join(", ")}]`,
          });
        }
      }

      // Gate 4a: $steps[N].Y references
      const stepMatch = STEP_REF.exec(sourceExpr);
      if (stepMatch) {
        const refIdx = parseInt(stepMatch[1], 10);
        const refField = stepMatch[2].split(/[.\[]/)[0];

        // Forward reference check
        if (refIdx >= i) {
          violations.push({
            gate: "gate4a_step_ordering",
            severity: "error",
            detail: `${solutionSlug} step ${step.stepOrder}: forward reference $steps[${refIdx}] at step index ${i}`,
          });
        }

        // Field exists in referenced step's output
        const refFields = stepOutputFields.get(refIdx);
        if (refFields && refFields.size > 0 && !refFields.has(refField)) {
          violations.push({
            gate: "gate4a_step_ref",
            severity: "error",
            detail: `${solutionSlug} step ${step.stepOrder} (${step.capabilitySlug}): $steps[${refIdx}].${refField} not in ${steps[refIdx]?.capabilitySlug} output schema`,
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Validate a capability's schema coherence.
 * Called before capability INSERT or schema UPDATE.
 *
 * @param slug - Capability slug
 * @param inputSchema - The capability's input_schema
 * @returns Array of violations
 */
export function validateCapabilitySchema(
  slug: string,
  inputSchema: unknown,
): GateViolation[] {
  const violations: GateViolation[] = [];
  const parsed = parseSchema(inputSchema) as {
    type?: string;
    required?: string[];
    properties?: Record<string, unknown>;
  } | null;

  if (!parsed || typeof parsed !== "object") {
    violations.push({
      gate: "gate3_schema_coherence",
      severity: "error",
      detail: `${slug}: input_schema is null or not an object`,
    });
    return violations;
  }

  const properties = parsed.properties ? Object.keys(parsed.properties) : [];
  const required = Array.isArray(parsed.required) ? parsed.required : [];

  for (const field of required) {
    if (!properties.includes(field)) {
      violations.push({
        gate: "gate3_schema_coherence",
        severity: "error",
        detail: `${slug}: required field '${field}' not in properties. Properties: [${properties.join(", ")}]`,
      });
    }
  }

  return violations;
}

/**
 * Run all gates and throw if any violations found.
 * Call this before writing to the database.
 */
export function enforceGates(violations: GateViolation[]): void {
  const errors = violations.filter((v) => v.severity === "error");
  if (errors.length === 0) return;

  const messages = errors.map((v) => `[${v.gate}] ${v.detail}`);
  throw new Error(
    `Onboarding gate check failed (${errors.length} violation${errors.length > 1 ? "s" : ""}):\n` +
    messages.join("\n"),
  );
}

/**
 * Gate 1: Structural validation (blocking at insert time).
 * Checks 1-12 from validate-capability.ts — the subset that can run
 * before fixtures/limitations exist. Checks 13-16 (test suites,
 * limitations, field reliability, Gate 5) remain post-insert.
 */

// Cluster 2 Phase 1 (F-B-007): these three enums were previously duplicated
// between scripts/onboard.ts (pre-insert validateManifest) and this module
// (post-insert validateCapabilityStructure). Exported now as the single
// canonical source; onboard.ts imports rather than redeclaring.
export const VALID_CATEGORIES = [
  "company-data", "compliance", "developer-tools", "finance",
  "data-processing", "web-scraping", "monitoring", "validation",
  "data-extraction", "legal-regulatory", "file-conversion",
  "agent-tooling", "competitive-intelligence", "content-writing",
  "document-extraction", "financial", "security", "text-processing",
  "trade", "utility", "web-intelligence",
];

// Includes `null` to accept capabilities that haven't declared a tag yet.
// Phase 5 (Cluster 2 design) removes the null option once detectTransparencyTag
// heuristic is deleted and transparency_tag becomes required at authoring time.
export const VALID_TRANSPARENCY_TAGS = ["algorithmic", "ai_generated", "mixed", null];

export const VALID_MAINTENANCE_CLASSES = [
  "free-stable-api",
  "commercial-stable-api",
  "pure-computation",
  "scraping-stable-target",
  "scraping-fragile-target",
  "requires-domain-expertise",
];

// SA.2b (F-A-003, F-A-009): canonical PII category taxonomy. Declared
// per-capability in manifest as `personal_data_categories: string[]`.
// Enforced by validateCapabilityStructure (DB-row re-validation) and by
// validateManifest() in scripts/onboard.ts (pre-insert authoring gate).
export const PII_CATEGORY_ENUM = [
  "name",
  "email",
  "phone",
  "address",
  "date_of_birth",
  "government_id",
  "financial",
  "professional",
  "behavioral",
  "biometric",
  "health",
  "sensitive_special",
] as const;

export type PiiCategory = typeof PII_CATEGORY_ENUM[number];

export function validateCapabilityStructure(cap: {
  slug: string;
  name: string | null;
  description: string | null;
  category: string;
  priceCents: number;
  isFreeTier: boolean | null;
  inputSchema: unknown;
  outputSchema: unknown;
  dataSource: string | null;
  dataClassification: string | null;
  transparencyTag: string | null;
  maintenanceClass: string | null;
  processesPersonalData?: boolean | null;
  personalDataCategories?: string[] | null;
}): GateViolation[] {
  const violations: GateViolation[] = [];

  // Check 3: Name is not empty
  if (!cap.name || cap.name.trim().length === 0) {
    violations.push({ gate: "gate1_structure", severity: "error", detail: `${cap.slug}: name is null or empty` });
  }

  // Check 4: Slug matches URL-safe pattern
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(cap.slug)) {
    violations.push({ gate: "gate1_structure", severity: "error", detail: `${cap.slug}: slug is not URL-safe (expected lowercase, hyphens, no spaces)` });
  }

  // Check 5: Description >= 20 chars
  if (!cap.description || cap.description.trim().length < 20) {
    violations.push({ gate: "gate1_structure", severity: "error", detail: `${cap.slug}: description is ${cap.description?.length ?? 0} chars (minimum 20)` });
  }

  // Check 6: Category is valid
  if (!VALID_CATEGORIES.includes(cap.category)) {
    violations.push({ gate: "gate1_structure", severity: "error", detail: `${cap.slug}: category '${cap.category}' not valid. Options: ${VALID_CATEGORIES.join(", ")}` });
  }

  // Check 7: Price is valid
  const priceOk = cap.isFreeTier ? cap.priceCents >= 0 : cap.priceCents > 0;
  if (!priceOk) {
    violations.push({ gate: "gate1_structure", severity: "error", detail: `${cap.slug}: priceCents is ${cap.priceCents} (must be > 0 for non-free-tier)` });
  }

  // Check 8: Input schema is valid
  const inputParsed = parseSchema(cap.inputSchema);
  if (!inputParsed || (inputParsed as any).type !== "object") {
    violations.push({ gate: "gate1_structure", severity: "error", detail: `${cap.slug}: inputSchema missing type:object or not parseable` });
  }

  // Check 9: Output schema is valid
  const outputParsed = parseSchema(cap.outputSchema);
  if (!outputParsed || (outputParsed as any).type !== "object") {
    violations.push({ gate: "gate1_structure", severity: "error", detail: `${cap.slug}: outputSchema missing type:object or not parseable` });
  }

  // Check 10: Data source is not empty
  if (!cap.dataSource || cap.dataSource.trim().length === 0) {
    violations.push({ gate: "gate1_structure", severity: "error", detail: `${cap.slug}: dataSource is null or empty` });
  }

  // Check 12: Transparency tag is valid
  if (!VALID_TRANSPARENCY_TAGS.includes(cap.transparencyTag)) {
    violations.push({ gate: "gate1_structure", severity: "error", detail: `${cap.slug}: transparencyTag '${cap.transparencyTag}' not valid. Options: algorithmic, ai_generated, mixed, null` });
  }

  // Check 13: maintenance_class is required and valid
  if (!cap.maintenanceClass || !VALID_MAINTENANCE_CLASSES.includes(cap.maintenanceClass)) {
    violations.push({
      gate: "gate1_structure",
      severity: "error",
      detail: `${cap.slug}: maintenance_class is required. Choose from: ${VALID_MAINTENANCE_CLASSES.join(", ")}`,
    });
  }

  // Check 14 (SA.2b F-A-003, F-A-009): PII classification required.
  // Blocking for capabilities onboarded post-SA.2b.b. Pre-existing rows
  // with NULL values are grandfathered via runtime fallback until SA.2b.c.
  // This gate fires on re-validation (e.g. manifest re-application); the
  // authoring-time gate lives in scripts/onboard.ts:validateManifest().
  if (cap.processesPersonalData === undefined) {
    violations.push({
      gate: "gate1_structure",
      severity: "error",
      detail: `${cap.slug}: processes_personal_data is required. Declare 'false' for pure-algorithmic or infrastructure capabilities; 'true' with populated personal_data_categories for anything processing user-identifiable data at any stage.`,
    });
  }

  if (cap.personalDataCategories && cap.personalDataCategories.length > 0) {
    for (const cat of cap.personalDataCategories) {
      if (!(PII_CATEGORY_ENUM as readonly string[]).includes(cat)) {
        violations.push({
          gate: "gate1_structure",
          severity: "error",
          detail: `${cap.slug}: personal_data_categories entry '${cat}' is not in the canonical taxonomy. Allowed: ${PII_CATEGORY_ENUM.join(", ")}`,
        });
      }
    }
    if (cap.processesPersonalData === false) {
      violations.push({
        gate: "gate1_structure",
        severity: "error",
        detail: `${cap.slug}: personal_data_categories is populated but processes_personal_data is false. Either set processes_personal_data: true, or clear the categories.`,
      });
    }
  }

  return violations;
}

/**
 * Gate 4b: Solution dry-run composition check (DEC-20260409-D Layer B).
 * Threads mock outputs through the step chain to catch composition failures.
 */
export { runSolutionDryRun, retrospectiveSolutionDryRun } from "./gate4b-solution-dryrun.js";

/**
 * Gate 5: Path coverage enforcement (DEC-20260411-B).
 * Checks that multi-path capabilities have fixtures for all entry points.
 * Called after fixture generation, since it requires fixtures to exist.
 */
export { runGate5, retrospectiveCheck } from "./gate5-path-coverage.js";

function parseInputMap(raw: unknown): Record<string, string> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      result[k] = typeof v === "string" ? v : String(v);
    }
    return result;
  }
  return {};
}

// ─── Cluster 2 Phase 2: validateManifest + validateCapability orchestrator ──
//
// validateManifest was previously in scripts/onboard.ts. Moved here (unchanged
// body) so the src-local orchestrator can call it without a scripts->src
// cross-boundary import that the build-scope tsconfig doesn't allow.

/**
 * Gate 1 (manifest): authoring-time, pre-insert validation of a YAML manifest.
 * Returns a list of error message strings (empty = pass).
 */
export function validateManifest(m: Manifest, discover: boolean): string[] {
  const errors: string[] = [];

  if (!m.slug || typeof m.slug !== "string") errors.push("slug is required");
  if (!m.name || typeof m.name !== "string") errors.push("name is required");
  if (!m.description || m.description.length < 20) errors.push("description must be >= 20 chars");
  if (!m.category) errors.push("category is required");
  if (m.price_cents == null || (m.price_cents < 0)) errors.push("price_cents must be >= 0");
  if (!m.input_schema || typeof m.input_schema !== "object") errors.push("input_schema is required");
  if (!m.output_schema || typeof m.output_schema !== "object") errors.push("output_schema is required");
  if (!m.data_source) errors.push("data_source is required");
  if (!m.data_source_type) errors.push("data_source_type is required");

  // maintenance_class is required for new capabilities
  if (!m.maintenance_class || !VALID_MAINTENANCE_CLASSES.includes(m.maintenance_class)) {
    errors.push(`maintenance_class is required. Choose from: ${VALID_MAINTENANCE_CLASSES.join(", ")}`);
  }

  // Slug pattern
  if (m.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(m.slug)) {
    errors.push("slug must be lowercase alphanumeric with hyphens");
  }

  // Schema structure
  if (m.input_schema && ((m.input_schema as any).type !== "object" || !m.input_schema.properties)) {
    errors.push("input_schema must have type:'object' and properties");
  }
  if (m.output_schema && ((m.output_schema as any).type !== "object" || !m.output_schema.properties)) {
    errors.push("output_schema must have type:'object' and properties");
  }

  // Test fixtures — in --discover mode, expected_fields can be empty
  if (!discover) {
    if (!m.test_fixtures?.known_answer?.input) {
      errors.push("test_fixtures.known_answer.input is required");
    }
    if (!m.test_fixtures?.known_answer?.expected_fields?.length) {
      errors.push("test_fixtures.known_answer.expected_fields must have at least 1 entry");
    }
  } else {
    // In discover mode, we need at least health_check_input or known_answer.input
    if (!m.test_fixtures?.health_check_input && !m.test_fixtures?.known_answer?.input) {
      errors.push("--discover requires test_fixtures.health_check_input or test_fixtures.known_answer.input");
    }
  }

  // Field reliability — in --discover mode, can be empty (will be generated)
  if (!discover) {
    if (!m.output_field_reliability || Object.keys(m.output_field_reliability).length === 0) {
      errors.push("output_field_reliability must have at least 1 field");
    }
  }

  // Limitations
  if (!m.limitations || m.limitations.length === 0) {
    errors.push("at least 1 limitation is required");
  }

  // SA.2b (F-A-003, F-A-009): PII classification required for authoring-time
  // validation. Gate mirrored in validateCapabilityStructure for DB-row
  // re-validation.
  if (m.processes_personal_data === undefined) {
    errors.push(
      "processes_personal_data is required (boolean). Declare 'false' for pure-algorithmic or infrastructure capabilities; 'true' with populated personal_data_categories for anything processing user-identifiable data at any stage.",
    );
  }
  if (Array.isArray(m.personal_data_categories)) {
    for (const cat of m.personal_data_categories) {
      if (!(PII_CATEGORY_ENUM as readonly string[]).includes(cat)) {
        errors.push(`personal_data_categories entry '${cat}' is not in the canonical taxonomy. Allowed: ${PII_CATEGORY_ENUM.join(", ")}`);
      }
    }
    if (m.processes_personal_data === false && m.personal_data_categories.length > 0) {
      errors.push("personal_data_categories is populated but processes_personal_data is false. Either set processes_personal_data: true, or clear the categories.");
    }
  }

  return errors;
}

// ─── Orchestrator (Cluster 2 Phase 2, F-B-006) ─────────────────────────────

export type ValidationMode = "insert" | "backfill";
export type CapabilitySource = "manifest" | "seed" | "api";

export interface ValidationContext {
  mode: ValidationMode;
  source: CapabilitySource;
  /** Per-call gate skips with an audit-trailed reason. Replaces
   *  SKIP_ONBOARDING_GATES env var (OQ-5 / DEC-20260420-K). */
  skipGates?: Array<{ gate: string; reason: string }>;
  /** In `--discover` mode the authoring requires relaxed expected_fields
   *  presence. Forwarded to validateManifest. */
  discover?: boolean;
}

export interface GateWarning {
  gate: string;
  detail: string;
}

/**
 * Shape of the row returned by `SELECT * FROM capabilities` (camelCase
 * per Drizzle). Used for existing-row comparison in backfill mode.
 */
export type CapabilityRow = Record<string, unknown> & { slug: string };

export interface ValidationResult {
  violations: GateViolation[];
  warnings: GateWarning[];
  /** Post-normalization view of the candidate. Phase 2 returns the manifest
   *  as-is; Phase 3 (persistCapability) adds default merging, enum casts,
   *  and null->undefined conversions per design Section 3.4. */
  normalized: Manifest;
}

export class GateViolationError extends Error {
  constructor(public readonly violations: GateViolation[]) {
    super(
      `Onboarding gate failed (${violations.length} violation${violations.length === 1 ? "" : "s"}):\n` +
        violations.map((v) => `  [${v.gate}] ${v.detail}`).join("\n"),
    );
    this.name = "GateViolationError";
  }
}

// FIELD_CATEGORIES — single source of truth for the hybrid authority model
// (DEC-20260420-K OQ-1). Used by checkAuthorityDrift to emit warnings when a
// backfill manifest declares a value for a DB-canonical field that differs
// from the existing DB row. Phase 2 emits warnings; Phase 4 hardens to
// preservation enforcement.
//
// Derived from audit-reports/cluster_2_design.md Section 2.
const FIELD_CATEGORIES: Record<string, "manifest-canonical" | "DB-canonical" | "system-managed"> = {
  // manifest-canonical — overwritten on backfill
  slug: "manifest-canonical",
  name: "manifest-canonical",
  description: "manifest-canonical",
  category: "manifest-canonical",
  input_schema: "manifest-canonical",
  output_schema: "manifest-canonical",
  maintenance_class: "manifest-canonical",
  processes_personal_data: "manifest-canonical",
  personal_data_categories: "manifest-canonical",
  data_source: "manifest-canonical",
  data_source_type: "manifest-canonical",
  output_field_reliability: "manifest-canonical",
  // DB-canonical — preserved on backfill (manifest value ignored post-Phase-4)
  price_cents: "DB-canonical",
  is_free_tier: "DB-canonical",
  freshness_category: "DB-canonical",
  transparency_tag: "DB-canonical",
  geography: "DB-canonical",
  data_classification: "DB-canonical",
  lifecycle_state: "DB-canonical",
  visible: "DB-canonical",
  is_active: "DB-canonical",
  // system-managed — runtime jobs (SQS, trust columns)
  matrix_sqs: "system-managed",
  qp_score: "system-managed",
  rp_score: "system-managed",
};

/**
 * Convert a Manifest field name (snake_case) to the corresponding DB-row
 * field name (camelCase). DB-row comes from Drizzle's select().
 */
function manifestFieldToDbField(field: string): string {
  return field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== typeof b) return false;
  if (typeof a === "object") {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
  }
  return false;
}

/**
 * Authority-drift check (Phase 2: warnings only; Phase 4: preservation
 * enforcement at persist time). Returns a warning per DB-canonical field
 * where the manifest declares a value that differs from the existing
 * DB row.
 */
function checkAuthorityDrift(
  manifest: Manifest,
  existing: CapabilityRow,
): GateWarning[] {
  const warnings: GateWarning[] = [];

  for (const [field, category] of Object.entries(FIELD_CATEGORIES)) {
    if (category !== "DB-canonical") continue;

    const manifestVal = (manifest as unknown as Record<string, unknown>)[field];
    if (manifestVal === undefined) continue; // not declared, no drift

    const dbField = manifestFieldToDbField(field);
    const dbVal = existing[dbField];

    if (valuesEqual(manifestVal, dbVal)) continue;

    warnings.push({
      gate: "authority",
      detail: `${field} is DB-canonical; manifest value ${JSON.stringify(manifestVal)} differs from DB value ${JSON.stringify(dbVal)} — DB value preserved (slug=${manifest.slug}). Phase 4 will enforce preservation at write time.`,
    });
  }

  return warnings;
}

/**
 * Single entry point for capability validation (Cluster 2 Phase 2).
 *
 * Orchestrates the three existing gate functions:
 *   - gate1_manifest  (validateManifest): authoring-time YAML shape check
 *   - gate1_structure (validateCapabilityStructure): DB-row re-validation
 *   - gate3_schema    (validateCapabilitySchema): required ⊆ properties
 *
 * Plus authority-drift warnings when mode === 'backfill' and an existing
 * row is present.
 *
 * Callers:
 *   - scripts/onboard.ts (Phase 2): manifest path
 *   - src/lib/capability-onboarding.ts (Phase 3): seed + CLI post-insert
 *     hook path; deferred because that pathway currently operates on
 *     DB-row shape, and unifying shape semantics is a Phase 3 concern
 *     coupled with persistCapability.
 */
export async function validateCapability(
  candidate: Manifest,
  existing: CapabilityRow | null,
  ctx: ValidationContext,
): Promise<ValidationResult> {
  const violations: GateViolation[] = [];
  const warnings: GateWarning[] = [];
  const skipSet = new Map((ctx.skipGates ?? []).map((s) => [s.gate, s.reason] as const));

  // Emit a skip-warning per-call per-gate (SD-4 semantics: no dedup).
  for (const [gate, reason] of skipSet) {
    logWarn(
      "gate-skipped",
      "gate-skipped by ctx.skipGates",
      {
        gate,
        reason,
        slug: candidate.slug,
        source: ctx.source,
        mode: ctx.mode,
      },
    );
  }

  // Gate 1 manifest (authoring-time)
  if (!skipSet.has("gate1_manifest")) {
    const manifestErrors = validateManifest(candidate, ctx.discover ?? false);
    for (const detail of manifestErrors) {
      violations.push({ gate: "gate1_manifest", severity: "error", detail });
    }
  }

  // Gate 3 schema coherence (required ⊆ properties) — runs on the
  // candidate's input_schema regardless of mode.
  if (!skipSet.has("gate3_schema")) {
    const schemaViolations = validateCapabilitySchema(candidate.slug, candidate.input_schema);
    violations.push(...schemaViolations);
  }

  // Authority-drift warnings (Phase 2: log only; Phase 4: preservation
  // enforcement). Only meaningful in backfill against an existing row.
  if (existing && ctx.mode === "backfill") {
    warnings.push(...checkAuthorityDrift(candidate, existing));
  }

  // gate1_structure is intentionally NOT invoked here in Phase 2: it's
  // the post-insert DB-row re-validation that runs from capability-
  // onboarding.ts (seed hook path). The CLI path has no committed row
  // to re-validate until Phase 3 adds persistCapability.

  // Normalization: Phase 2 returns the manifest as-is. Phase 3 expands.
  const normalized = candidate;

  return { violations, warnings, normalized };
}
