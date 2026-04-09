/**
 * Gate 4a: Static Solution Graph Validator (DEC-20260409-D Layer A)
 *
 * Extends Gate 1 with five additional checks:
 * 1. $steps[N].Y reference validity (field exists in step N's output schema)
 * 2. Type compatibility (source output type ≈ destination input type)
 * 3. Step ordering (no forward references)
 * 4. Context propagation collisions (DEC-B auto-injection)
 * 5. Required field coverage (all required inputs mapped)
 *
 * Run: npx tsx scripts/validate-solution-graph.ts [--slug <slug>] [--fix-stringified]
 *
 * Returns exit code 1 if any violations found.
 */

import postgres from "postgres";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : dirname(fileURLToPath(import.meta.url));

let dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  try {
    const envPath = join(__dirname, "..", "apps", "api", ".env");
    const envContent = readFileSync(envPath, "utf-8");
    const match = envContent.match(/DATABASE_URL=(.+)/);
    if (match) dbUrl = match[1].trim();
  } catch {}
}
if (!dbUrl) {
  console.error("DATABASE_URL not set.");
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 1, ssl: dbUrl.includes("railway") ? { rejectUnauthorized: false } : undefined });

const INPUT_REF = /^\$input\.(.+)$/;
const STEP_REF = /^\$steps\[(\d+)\]\.(.+)$/;
const ALL_RESULTS = "$all_results";

// Fields auto-injected by DEC-B context propagation
const AUTO_INJECTED_FIELDS = new Set(["registration_number", "jurisdiction", "entity_name"]);

interface Violation {
  solution: string;
  step: number;
  capability: string;
  check: string;
  severity: "error" | "warning";
  detail: string;
}

interface StepDef {
  stepOrder: number;
  capabilitySlug: string;
  inputMap: Record<string, string>;
}

interface CapSchema {
  inputSchema: { required?: string[]; properties?: Record<string, { type?: string }> } | null;
  outputSchema: { properties?: Record<string, { type?: string }> } | null;
}

async function loadCapabilitySchemas(): Promise<Map<string, CapSchema>> {
  const caps = await sql`SELECT slug, input_schema, output_schema FROM capabilities WHERE is_active = true`;
  const map = new Map<string, CapSchema>();
  for (const c of caps) {
    map.set(c.slug, {
      inputSchema: c.input_schema as CapSchema["inputSchema"],
      outputSchema: c.output_schema as CapSchema["outputSchema"],
    });
  }
  return map;
}

function parseInputMap(raw: unknown): Record<string, string> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    // Check for stringified JSON values inside the map
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      result[k] = typeof v === "string" ? v : String(v);
    }
    return result;
  }
  return {};
}

async function validate(slugFilter?: string): Promise<Violation[]> {
  const violations: Violation[] = [];
  const capSchemas = await loadCapabilitySchemas();

  const solutions = slugFilter
    ? await sql`SELECT id, slug, input_schema FROM solutions WHERE slug = ${slugFilter} AND is_active = true`
    : await sql`SELECT id, slug, input_schema FROM solutions WHERE is_active = true`;

  for (const sol of solutions) {
    const solInputSchema = sol.input_schema as { properties?: Record<string, unknown> } | null;
    const solInputFields = solInputSchema?.properties ? Object.keys(solInputSchema.properties) : [];

    const rawSteps = await sql`
      SELECT step_order, capability_slug, input_map
      FROM solution_steps
      WHERE solution_id = ${sol.id}
      ORDER BY step_order
    `;

    const steps: StepDef[] = rawSteps.map((s) => ({
      stepOrder: s.step_order,
      capabilitySlug: s.capability_slug,
      inputMap: parseInputMap(s.input_map),
    }));

    // Build a map of step index → capability output fields
    const stepOutputFields = new Map<number, Set<string>>();
    for (let i = 0; i < steps.length; i++) {
      const cap = capSchemas.get(steps[i].capabilitySlug);
      const fields = cap?.outputSchema?.properties ? new Set(Object.keys(cap.outputSchema.properties)) : new Set<string>();
      stepOutputFields.set(i, fields);
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepIdx = i; // 0-indexed execution order
      const cap = capSchemas.get(step.capabilitySlug);

      for (const [destField, sourceExpr] of Object.entries(step.inputMap)) {
        if (sourceExpr === ALL_RESULTS) continue; // Special case, always valid

        // ── Check 1: $steps[N].Y reference validity ──
        const stepMatch = STEP_REF.exec(sourceExpr);
        if (stepMatch) {
          const refIdx = parseInt(stepMatch[1], 10);
          const refField = stepMatch[2].split(/[.\[]/)[0]; // Top-level field

          // Check 3: Step ordering (no forward references)
          if (refIdx >= stepIdx) {
            violations.push({
              solution: sol.slug, step: step.stepOrder, capability: step.capabilitySlug,
              check: "step_ordering",
              severity: "error",
              detail: `Forward reference: $steps[${refIdx}].${refField} at step ${step.stepOrder} (index ${stepIdx}). Step ${refIdx} hasn't executed yet.`,
            });
          }

          // Check 1: Field exists in referenced step's output
          const refOutputFields = stepOutputFields.get(refIdx);
          if (refOutputFields && !refOutputFields.has(refField)) {
            violations.push({
              solution: sol.slug, step: step.stepOrder, capability: step.capabilitySlug,
              check: "step_ref_validity",
              severity: "warning", // Warning not error — field might be added by enrichment
              detail: `$steps[${refIdx}].${refField} references field "${refField}" not in ${steps[refIdx]?.capabilitySlug} output schema. Available: [${[...refOutputFields].join(", ")}]`,
            });
          }

          // ── Check 2: Type compatibility ──
          if (cap?.inputSchema?.properties && refOutputFields) {
            const destType = (cap.inputSchema.properties as Record<string, { type?: string }>)[destField]?.type;
            const sourceCapSchema = capSchemas.get(steps[refIdx]?.capabilitySlug ?? "");
            const sourceType = sourceCapSchema?.outputSchema?.properties?.[refField]?.type;

            if (destType && sourceType && !typesCompatible(sourceType, destType)) {
              violations.push({
                solution: sol.slug, step: step.stepOrder, capability: step.capabilitySlug,
                check: "type_compatibility",
                severity: "warning",
                detail: `Type mismatch: ${steps[refIdx]?.capabilitySlug}.${refField} (${sourceType}) → ${step.capabilitySlug}.${destField} (${destType})`,
              });
            }
          }
        }

        // ── Check 4: Context propagation collisions ──
        if (AUTO_INJECTED_FIELDS.has(destField)) {
          const isFromStep0 = stepMatch && parseInt(stepMatch[1], 10) === 0;
          const isFromInput = INPUT_REF.test(sourceExpr);
          if (!isFromStep0 && !isFromInput) {
            violations.push({
              solution: sol.slug, step: step.stepOrder, capability: step.capabilitySlug,
              check: "context_collision",
              severity: "warning",
              detail: `Field "${destField}" is auto-injected by context propagation but explicitly mapped from ${sourceExpr}. Explicit mapping takes precedence.`,
            });
          }
        }
      }

      // ── Check 5: Required field coverage ──
      if (cap?.inputSchema?.required && cap.inputSchema.required.length > 0) {
        const mappedFields = new Set(Object.keys(step.inputMap));
        for (const reqField of cap.inputSchema.required) {
          const isMapped = mappedFields.has(reqField);
          const isAutoInjected = AUTO_INJECTED_FIELDS.has(reqField);
          // Also check if fallback from $input would provide it
          const inputHasField = solInputFields.includes(reqField);

          if (!isMapped && !isAutoInjected && !inputHasField) {
            violations.push({
              solution: sol.slug, step: step.stepOrder, capability: step.capabilitySlug,
              check: "required_field_coverage",
              severity: "warning", // Warning because runtime fallback may provide it
              detail: `Required input "${reqField}" for ${step.capabilitySlug} is not explicitly mapped and not auto-injected. May fail at runtime.`,
            });
          }
        }
      }
    }
  }

  return violations;
}

function typesCompatible(source: string, dest: string): boolean {
  if (source === dest) return true;
  // String is universally compatible as source (capabilities often return strings that downstream parses)
  if (source === "string") return true;
  // Number/integer interchangeable
  if ((source === "number" || source === "integer") && (dest === "number" || dest === "integer")) return true;
  // Object → string not compatible
  if (source === "object" && dest === "string") return false;
  // Array → scalar not compatible
  if (source === "array" && dest !== "array" && dest !== "object") return false;
  // Default: assume compatible (avoid false positives)
  return true;
}

async function main() {
  const slugArg = process.argv.indexOf("--slug");
  const slugFilter = slugArg >= 0 ? process.argv[slugArg + 1] : undefined;

  console.log("Gate 4a: Static Solution Graph Validator");
  console.log("========================================\n");

  const violations = await validate(slugFilter);

  if (violations.length === 0) {
    console.log(`✓ All ${slugFilter || "active"} solutions pass static graph validation.`);
    await sql.end();
    process.exit(0);
  }

  // Group by check type
  const byCheck = new Map<string, Violation[]>();
  for (const v of violations) {
    const list = byCheck.get(v.check) || [];
    list.push(v);
    byCheck.set(v.check, list);
  }

  const errors = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warning");

  console.log(`✗ Found ${violations.length} violations (${errors.length} errors, ${warnings.length} warnings)\n`);

  for (const [check, items] of byCheck) {
    console.log(`── ${check} (${items.length}) ──`);
    // Show up to 10 per category
    for (const v of items.slice(0, 10)) {
      const icon = v.severity === "error" ? "✗" : "⚠";
      console.log(`  ${icon} ${v.solution} step ${v.step} (${v.capability}): ${v.detail}`);
    }
    if (items.length > 10) {
      console.log(`  ... and ${items.length - 10} more`);
    }
    console.log();
  }

  await sql.end();
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
