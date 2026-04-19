/**
 * Onboarding Gates — blocking validation for solution and capability changes.
 *
 * Gates 1, 3, 4a run as blocking checks before any solution or capability
 * write lands in the database.
 *
 * Environment variable SKIP_ONBOARDING_GATES=true bypasses all checks
 * (emergency escape hatch, logged with warning).
 */

import { sql as sqlTag } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, solutions, solutionSteps } from "../db/schema.js";
import { eq, inArray } from "drizzle-orm";
import { logWarn } from "./log.js";

const SKIP_GATES = process.env.SKIP_ONBOARDING_GATES === "true";

if (SKIP_GATES) {
  logWarn(
    "onboarding-gates-bypassed",
    "SKIP_ONBOARDING_GATES=true — all gate checks bypassed. Emergency-only.",
  );
}

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
  if (SKIP_GATES) return [];

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
  if (SKIP_GATES) return [];

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

const VALID_CATEGORIES = [
  "company-data", "compliance", "developer-tools", "finance",
  "data-processing", "web-scraping", "monitoring", "validation",
  "data-extraction", "legal-regulatory", "file-conversion",
  "agent-tooling", "competitive-intelligence", "content-writing",
  "document-extraction", "financial", "security", "text-processing",
  "trade", "utility", "web-intelligence",
];

const VALID_TRANSPARENCY_TAGS = ["algorithmic", "ai_generated", "mixed", null];

const VALID_MAINTENANCE_CLASSES = [
  "free-stable-api",
  "commercial-stable-api",
  "pure-computation",
  "scraping-stable-target",
  "scraping-fragile-target",
  "requires-domain-expertise",
];

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
}): GateViolation[] {
  if (SKIP_GATES) return [];
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
