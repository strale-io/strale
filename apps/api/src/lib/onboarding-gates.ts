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
import { eq } from "drizzle-orm";

const SKIP_GATES = process.env.SKIP_ONBOARDING_GATES === "true";

if (SKIP_GATES) {
  console.warn("[onboarding-gates] ⚠ SKIP_ONBOARDING_GATES=true — all gate checks bypassed. This should only be used for emergency fixes.");
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
        .from(capabilities).where(sqlTag`slug = ANY(${capSlugs})`)
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
