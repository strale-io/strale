/**
 * Pipeline Phase IV: Onboard a new capability from a YAML manifest.
 *
 * Reads a manifest file, validates all required fields, and inserts:
 *   1. Capability record (lifecycle_state='validating', visible=false)
 *   2. Test suites (known_answer + dependency_health from manifest fixtures,
 *      plus stub suites for schema_check, negative, edge_case)
 *   3. Limitations
 *   4. Field reliability annotations
 *
 * Flags:
 *   --manifest <path>   Path to YAML manifest (required)
 *   --dry-run           Preview changes without inserting to DB
 *   --backfill          Update existing capability (add missing tests, reliability, limitations)
 *   --strict            Abort if execute-and-verify fails
 *   --fix               Auto-correct high-confidence fixture mismatches
 *   --discover          Auto-generate expected_fields from live execution output
 *
 * Usage:
 *   npx tsx scripts/onboard.ts --manifest manifests/new-cap.yaml
 *   npx tsx scripts/onboard.ts --manifest manifests/new-cap.yaml --dry-run
 *   npx tsx scripts/onboard.ts --manifest manifests/new-cap.yaml --discover
 *   npx tsx scripts/onboard.ts --manifest manifests/new-cap.yaml --backfill --discover --fix
 */

import { openOperatorWriteDrizzle } from "../src/lib/operator-db.js";
import { suitesAreSchedulable } from "../src/lib/onboard-scheduling.js";
import { dependencyHealthChecks } from "../src/lib/onboard-dependency-health.js";
import { autonomousAuthority } from "../src/lib/production-authority.js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

// Register all capability executors so --discover and --verify can execute them
import { autoRegisterCapabilities } from "../src/capabilities/auto-register.js";
import { assertDiscoverNotDryRun } from "../src/lib/onboard-guards.js";
// Cluster 2 Phase 1 (F-B-007): enum single-source imports, previously duplicated.
// Cluster 2 Phase 2: orchestrator + types + skipGates, replaces local validateManifest.
import {
  validateCapability,
  GateViolationError,
  type ValidationContext,
} from "../src/lib/onboarding-gates.js";
import type { Manifest, ManifestExpectedField, ManifestLimitation, ManifestKnownAnswerFixture } from "../src/lib/capability-manifest-types.js";
import { getKnownAnswerFixtures } from "../src/lib/capability-manifest-types.js";
import { openOperatorDrizzle as readOnlyDbForValidation } from "../src/lib/operator-db.js";
import { capabilities as capabilitiesTable } from "../src/db/schema.js";
import { logWarn } from "../src/lib/log.js";
// Cluster 2 Phase 3 C1: transactional persist + hook wiring.
import { persistCapability, diffAndUpdateLimitations } from "../src/lib/capability-persistence.js";
// Cluster 2 Phase 3 C2: Manifest → DB-row normalizer.
import { normalizeManifestToRow } from "../src/lib/capability-manifest.js";

import { eq, and } from "drizzle-orm";
import {
  capabilities,
  testSuites,
  capabilityLimitations,
} from "../src/db/schema.js";
import * as yaml from "js-yaml";
import { validateFixture } from "../src/lib/fixture-quality.js";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getExecutor } from "../src/capabilities/index.js";
import {
  guardedExecute,
  seedCostMetaForOnboarding,
  COST_CLASSES,
  type CostClass,
} from "../src/capabilities/guarded-executor.js";
// Phase 3a runtime sentinel (PR #109): strict-missing-only assertion on
// guaranteed fields. Reused here at onboard time so the same gate fires
// before a manifest can be committed.
import { checkGuaranteedFieldsPresent } from "../src/lib/guaranteed-fields-sentinel.js";

// ─── Types ───────────────────────────────────────────────────────────────────
// Manifest / ManifestExpectedField / ManifestLimitation moved to
// src/lib/capability-manifest-types.ts (Cluster 2 Phase 2, F-B-006).

interface FixtureMismatch {
  field: string;
  expected: { operator: string; value?: unknown };
  actual_value: unknown | undefined;
  fix_type: "auto" | "suggest";
  suggested_fix: string;
  corrected_expected?: ManifestExpectedField;
}

// ─── Type mappings ───────────────────────────────────────────────────────────

// YAML `data_source_type` → DB `capability_type`.
//
// The manifest-drift audit (2026-04-20) found the DB holds at least 4
// distinct capability_type values (stable_api, ai_assisted, deterministic,
// scraping) while this mapping only produced 3. New authors who wanted
// to declare a capability as ai_assisted had no path through the pipeline
// — this case plugs that gap. Existing ai_assisted rows in DB still have
// data_source_type=api in their manifests (Class 4 drift, SA.2b.c scope).
function dataSourceTypeToCapType(dsType: string): string {
  switch (dsType) {
    case "computed":
      return "deterministic";
    case "scrape":
      return "scraping";
    case "api":
      return "stable_api";
    case "ai_assisted":
      return "ai_assisted";
    default:
      return "stable_api";
  }
}

// ─── Validation ──────────────────────────────────────────────────────────────
// validateManifest moved to src/lib/onboarding-gates.ts (Cluster 2 Phase 2,
// F-B-006). Called here via the `validateCapability` orchestrator.

/**
 * Parse `--skip-gates="gate_name:reason_text,gate_name2:reason2"` into the
 * ctx.skipGates array consumed by validateCapability. Replaces the
 * SKIP_ONBOARDING_GATES env var (DEC-20260420-K OQ-5).
 */
export function parseSkipGates(raw: string | undefined): Array<{ gate: string; reason: string }> {
  if (!raw) return [];
  return raw.split(",").map((entry) => {
    const [gate, ...reasonParts] = entry.split(":");
    const reason = reasonParts.join(":").trim();
    const trimmedGate = gate?.trim() ?? "";
    if (!trimmedGate || !reason) {
      throw new Error(`Invalid --skip-gates entry "${entry}". Format: gate:reason (comma-separated for multiple)`);
    }
    return { gate: trimmedGate, reason };
  });
}

/**
 * Cluster 2 Phase 4a: --force-override-authority interactive guard.
 *
 * Reads exactly `OVERRIDE AUTHORITY` from stdin before letting the
 * backfill proceed. The flag alone is not enough — this prevents
 * reflexive / tab-completed overrides. In batch mode or when stdin is
 * not a TTY (CI runs), the override is refused unconditionally: if you
 * want to bypass authority in CI, you have to build a different flow.
 */
const AUTHORITY_CONFIRM_PHRASE = "OVERRIDE AUTHORITY";

async function confirmAuthorityOverride(isBatch: boolean): Promise<boolean> {
  if (isBatch) {
    console.error("\n--force-override-authority is not allowed in --batch mode. Run single-manifest to override.");
    return false;
  }
  if (!process.stdin.isTTY) {
    console.error("\n--force-override-authority requires interactive stdin. Refusing in non-TTY context.");
    return false;
  }

  console.warn(
    "\n" +
    "═══════════════════════════════════════════════════════════════════\n" +
    "⚠  --force-override-authority\n" +
    "═══════════════════════════════════════════════════════════════════\n" +
    "You are about to OVERWRITE DB-canonical and hybrid fields with\n" +
    "manifest values. Operator tunings (e.g., admin-repriced price_cents,\n" +
    "admin-set freshness_category) will be reset.\n" +
    "\n" +
    "Use this only when intentionally resetting a capability to manifest\n" +
    "defaults. This does NOT bypass manifest-canonical drift errors — if\n" +
    "DB drifted on a manifest-canonical field, fix the manifest instead.\n" +
    "═══════════════════════════════════════════════════════════════════\n",
  );
  process.stdout.write(`Type exactly "${AUTHORITY_CONFIRM_PHRASE}" to continue: `);

  const answer = await new Promise<string>((resolve) => {
    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf-8");
      if (buf.includes("\n")) {
        process.stdin.removeListener("data", onData);
        resolve(buf.split("\n")[0].trim());
      }
    };
    process.stdin.on("data", onData);
  });

  return answer === AUTHORITY_CONFIRM_PHRASE;
}

/**
 * Run the validateCapability orchestrator from the CLI context. Returns the
 * aggregated error-message array (preserves the pre-Phase-2 string[] shape
 * so existing caller code paths can print and process the same way).
 */
async function runOrchestrator(
  manifest: Manifest,
  ctx: ValidationContext,
): Promise<string[]> {
  // Load existing DB row for authority-drift detection in backfill mode.
  let existingRow: Record<string, unknown> & { slug: string } | null = null;
  if (ctx.mode === "backfill") {
    try {
      const [row] = await readOnlyDbForValidation()
        .select()
        .from(capabilitiesTable)
        .where(eq(capabilitiesTable.slug, manifest.slug))
        .limit(1);
      existingRow = row ? (row as Record<string, unknown> & { slug: string }) : null;
    } catch (err) {
      // DB unreachable from the CLI (rare) — proceed without authority check.
      logWarn(
        "orchestrator-db-unreachable",
        "could not load existing row for authority drift check",
        { slug: manifest.slug, err: err instanceof Error ? err.message : String(err) },
      );
    }
  }

  const { violations, warnings } = await validateCapability(manifest, existingRow, ctx);

  for (const w of warnings) {
    logWarn(
      "authority-drift",
      w.detail,
      { slug: manifest.slug, gate: w.gate, source: ctx.source, mode: ctx.mode },
    );
  }

  return violations.map((v) => `[${v.gate}] ${v.detail}`);
}

// ─── Execute-and-Verify (Enhancement 1) ─────────────────────────────────────

/**
 * Chicken-and-egg fix: verifyFixtures and discoverFixtures both execute the
 * capability BEFORE persistCapability, so a new capability has no DB row and
 * the guarded executor would read cost_class NULL → refuse internal_test —
 * making --strict (and --discover on new capabilities) impossible even with
 * cost_class correctly declared in the manifest. The manifest is the
 * authoring surface for cost_class, so seed the gate's cache with the
 * declared value; the DB row written moments later carries the identical
 * value.
 *
 * Scope: this only helps cost classes the ALLOW_MATRIX permits from
 * internal_test (free_unlimited, free_quota, paid_with_free_tier).
 * paid_prepaid / paid_subscription are still refused — by design: onboard
 * verification must never burn paid vendor credits. For those, hand-write
 * known_answer fixtures and verify via production traffic / piggyback.
 *
 * Fail-closed: no declared cost_class → no seed → same refusal as before.
 * An unknown value (e.g. the legacy 'paid_per_call' in some older
 * manifests) warns and skips the seed rather than dying mid-run — the
 * behavior is then identical to pre-fix (refused as unclassified), and
 * the warning names the file to correct.
 *
 * INSERT-MODE ONLY. The caller (onboard()) seeds only when no DB row
 * exists. On the backfill path the row is authoritative and manifest↔DB
 * cost_class drift is a standing condition (238-cap drift audit) — seeding
 * there would let a drifted YAML value (e.g. free_unlimited over the DB's
 * paid_prepaid) launder a paid capability past the ALLOW_MATRIX into live
 * vendor spend, the exact 2026-05-11 failure Phase A0b exists to prevent.
 */
function seedGateFromManifest(manifest: Manifest): void {
  if (manifest.cost_class == null) return;
  if (!COST_CLASSES.includes(manifest.cost_class as CostClass)) {
    console.log(
      `  ⚠ manifests/${manifest.slug}.yaml declares unknown cost_class '${String(manifest.cost_class)}' — ` +
        `valid values: ${COST_CLASSES.join(", ")}. Not seeding the gate; ` +
        `execution will be refused as unclassified until the manifest is corrected.`,
    );
    return;
  }
  seedCostMetaForOnboarding({
    slug: manifest.slug,
    cost_class: manifest.cost_class as CostClass,
    quota_window: manifest.quota_window ?? null,
    quota_cap: manifest.quota_cap ?? null,
    quota_reset_dom: manifest.quota_reset_dom ?? null,
  });
  console.log(`  Seeded cost_class=${manifest.cost_class} from manifest (pre-insert verification gate)`);
}

async function executeCapability(
  slug: string,
  input: Record<string, unknown>,
): Promise<{ output: Record<string, unknown>; error?: string }> {
  const executor = getExecutor(slug);
  if (!executor) {
    return { output: {}, error: `No executor registered for '${slug}'` };
  }

  try {
    // Phase A0b dispatcher gate. onboard.ts execute is an internal_test/manual
    // diagnostic. For a new capability the DB row doesn't exist yet, so
    // verifyFixtures seeds the gate's cost-meta cache from the manifest's
    // declared cost_class before calling this; an unclassified manifest
    // (no cost_class) is still refused — fail-closed.
    const result = await Promise.race([
      guardedExecute(slug, input, {
        kind: "internal_test",
        suiteId: "onboard-script",
        reason: "manual",
      }, "onboarding"),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout after 30s")), 30_000),
      ),
    ]);

    if (!result?.output || typeof result.output !== "object") {
      return { output: {}, error: "Execution returned no output" };
    }
    return { output: result.output as Record<string, unknown> };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: {}, error: msg };
  }
}

function checkFieldAssertion(
  output: Record<string, unknown>,
  ef: ManifestExpectedField,
): { pass: boolean; actual: unknown } {
  const actual = output[ef.field];
  switch (ef.operator) {
    case "not_null":
      return { pass: actual != null, actual };
    case "equals":
      return { pass: actual === ef.value, actual };
    case "contains":
      return {
        pass: typeof actual === "string" && typeof ef.value === "string" && actual.includes(ef.value),
        actual,
      };
    case "gt":
      return { pass: typeof actual === "number" && typeof ef.value === "number" && actual > ef.value, actual };
    case "gte":
      return { pass: typeof actual === "number" && typeof ef.value === "number" && actual >= ef.value, actual };
    case "type":
      return { pass: (Array.isArray(actual) ? "array" : typeof actual) === ef.value, actual };
    default:
      return { pass: true, actual }; // unknown operator — skip
  }
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return d[m][n];
}

function toSnakeCase(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

function toCamelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// ─── Auto-Correct (Enhancement 2) ──────────────────────────────────────────

function analyzeFixtureMismatches(
  expectedFields: ManifestExpectedField[],
  output: Record<string, unknown>,
): FixtureMismatch[] {
  const mismatches: FixtureMismatch[] = [];
  const outputKeys = Object.keys(output);

  for (const ef of expectedFields) {
    const check = checkFieldAssertion(output, ef);
    if (check.pass) continue;

    const mismatch: FixtureMismatch = {
      field: ef.field,
      expected: { operator: ef.operator, value: ef.value },
      actual_value: check.actual,
      fix_type: "suggest",
      suggested_fix: "",
    };

    // ── High-confidence auto-fixes ──

    // Case convention mismatch: is_mobile vs isMobile
    const snaked = toSnakeCase(ef.field);
    const cameled = toCamelCase(ef.field);
    const caseMatch = outputKeys.find(
      (k) => k !== ef.field && (k === snaked || k === cameled || toSnakeCase(k) === snaked),
    );
    if (caseMatch && output[caseMatch] != null) {
      const corrected: ManifestExpectedField = { ...ef, field: caseMatch };
      // Re-check with corrected field name
      const recheck = checkFieldAssertion(output, corrected);
      if (recheck.pass) {
        mismatch.fix_type = "auto";
        mismatch.suggested_fix = `Rename field '${ef.field}' → '${caseMatch}' (case convention)`;
        mismatch.corrected_expected = corrected;
        mismatches.push(mismatch);
        continue;
      }
    }

    // Close field name (Levenshtein ≤ 2)
    if (check.actual === undefined) {
      const closeMatch = outputKeys.find((k) => k !== ef.field && levenshtein(k, ef.field) <= 2);
      if (closeMatch) {
        const corrected: ManifestExpectedField = { ...ef, field: closeMatch };
        const recheck = checkFieldAssertion(output, corrected);
        if (recheck.pass) {
          mismatch.fix_type = "auto";
          mismatch.suggested_fix = `Rename field '${ef.field}' → '${closeMatch}' (close match, Levenshtein ≤ 2)`;
          mismatch.corrected_expected = corrected;
          mismatches.push(mismatch);
          continue;
        }
      }
    }

    // Boolean coercion: true vs "true", 1 vs true
    if (ef.operator === "equals" && check.actual !== undefined) {
      if (
        (ef.value === true && (check.actual === "true" || check.actual === 1)) ||
        (ef.value === false && (check.actual === "false" || check.actual === 0)) ||
        (ef.value === "true" && check.actual === true) ||
        (ef.value === "false" && check.actual === false)
      ) {
        const corrected: ManifestExpectedField = { ...ef, value: check.actual };
        mismatch.fix_type = "auto";
        mismatch.suggested_fix = `Update value: ${JSON.stringify(ef.value)} → ${JSON.stringify(check.actual)} (type coercion)`;
        mismatch.corrected_expected = corrected;
        mismatches.push(mismatch);
        continue;
      }
    }

    // Case-insensitive string match
    if (
      ef.operator === "equals" &&
      typeof ef.value === "string" &&
      typeof check.actual === "string" &&
      ef.value.toLowerCase() === check.actual.toLowerCase()
    ) {
      const corrected: ManifestExpectedField = { ...ef, value: check.actual };
      mismatch.fix_type = "auto";
      mismatch.suggested_fix = `Update value: "${ef.value}" → "${check.actual}" (case difference)`;
      mismatch.corrected_expected = corrected;
      mismatches.push(mismatch);
      continue;
    }

    // ── Low-confidence suggestions ──

    if (check.actual === undefined || check.actual === null) {
      mismatch.suggested_fix = `Field '${ef.field}' not in output. Downgrade reliability from 'guaranteed' to 'common'?`;
    } else if (ef.operator === "equals") {
      mismatch.suggested_fix = `Expected ${JSON.stringify(ef.value)} but got ${JSON.stringify(check.actual)}. Update manifest value?`;
    } else {
      mismatch.suggested_fix = `Assertion '${ef.operator}' failed for '${ef.field}' (actual: ${JSON.stringify(check.actual)})`;
    }

    mismatches.push(mismatch);
  }

  return mismatches;
}

// ─── Discover (Enhancement 3) ──────────────────────────────────────────────

function isAiCapability(manifest: Manifest): boolean {
  return manifest.transparency_tag === "ai_generated" || manifest.transparency_tag === "mixed";
}

function generateExpectedFields(
  output: Record<string, unknown>,
  useLooseAssertions: boolean,
): ManifestExpectedField[] {
  const fields: ManifestExpectedField[] = [];

  for (const [key, value] of Object.entries(output)) {
    if (value === undefined || value === null) continue;

    const field: ManifestExpectedField = {
      field: key,
      operator: "not_null",
      reliability: "guaranteed",
    };

    // Stronger assertions for deterministic values (unless AI-generated)
    if (!useLooseAssertions) {
      if (typeof value === "boolean") {
        field.operator = "equals";
        field.value = value;
      } else if (typeof value === "string" && value.length <= 30 && !/\s/.test(value)) {
        // Short strings without spaces look like enums
        field.operator = "equals";
        field.value = value;
      }
      // Numbers and arrays: keep not_null (values may change between calls)
    }

    fields.push(field);
  }

  return fields;
}

function generateFieldReliability(
  output: Record<string, unknown>,
): Record<string, string> {
  const reliability: Record<string, string> = {};
  for (const key of Object.keys(output)) {
    if (output[key] != null) {
      reliability[key] = "guaranteed";
    }
  }
  return reliability;
}

// ─── Execute-and-verify step ────────────────────────────────────────────────

async function verifyFixtures(
  manifest: Manifest,
  flags: { strict: boolean; fix: boolean },
  manifestPath: string,
): Promise<{ passed: boolean; manifest: Manifest }> {
  const entries = getKnownAnswerFixtures(manifest);

  if (entries.length === 0) {
    console.log("\n─── Fixture Verification ─────────────────────────────────────");
    console.log("  Skipped (no known_answer fixtures)");
    return { passed: true, manifest };
  }

  console.log("\n─── Fixture Verification ─────────────────────────────────────");

  // Single-fixture manifests (the ~300-manifest legacy shape): identical
  // behavior to before, including auto-fix-and-rewrite (applyFixToManifest
  // targets manifest.test_fixtures.known_answer.expected_fields directly,
  // which only exists in this single-object shape).
  if (entries.length === 1) {
    return verifyKnownAnswerEntry(manifest, entries[0], flags, manifestPath, { allowAutoFix: true });
  }

  // Array-form manifests (Gate 5 multi-path fixture coverage,
  // DEC-20260411-B) — verify every entry point's fixture independently.
  // No auto-fix-and-rewrite here: applyFixToManifest has no notion of
  // "which array index", so --fix only reports suggestions for array
  // entries; a human edits the manifest. --strict still aborts on any
  // entry's mismatch, same as the single-fixture path.
  let allPassed = true;
  for (let i = 0; i < entries.length; i++) {
    console.log(`\n  [known_answer entry ${i + 1}/${entries.length}] input=${JSON.stringify(entries[i].input)}`);
    const result = await verifyKnownAnswerEntry(manifest, entries[i], flags, manifestPath, { allowAutoFix: false });
    if (!result.passed) allPassed = false;
  }

  return { passed: allPassed, manifest };
}

/**
 * Verify one known_answer fixture entry against live execution. Shared by
 * both the single-fixture and array-form paths in verifyFixtures() — this
 * is the original single-entry verification body, parameterized on which
 * entry to check instead of always reading manifest.test_fixtures.known_answer
 * directly.
 */
async function verifyKnownAnswerEntry(
  manifest: Manifest,
  entry: ManifestKnownAnswerFixture,
  flags: { strict: boolean; fix: boolean },
  manifestPath: string,
  opts: { allowAutoFix: boolean },
): Promise<{ passed: boolean; manifest: Manifest }> {
  const input = entry?.input;
  const expectedFields = entry?.expected_fields;

  if (!input || !expectedFields?.length) {
    console.log("  Skipped (fixture missing input or expected_fields)");
    return { passed: true, manifest };
  }

  // Fixture-quality gate: reject placeholder / schema-invalid fixtures before
  // they're written to test_suites and leak out to the public capability page.
  // Placeholders can "pass" because schema-shape assertions are satisfied even
  // when the input is meaningless. That's how invoice-validate ended up serving
  // {"invoice": {"key": "value"}} as its official example.
  const quality = validateFixture(input, manifest.input_schema);
  if (!quality.ok) {
    console.log("  ✗ known_answer fixture failed quality gate:");
    for (const r of quality.reasons) console.log(`      - ${r}`);
    console.log("  Supply a real input in test_fixtures.known_answer.input that a");
    console.log("  third-party dev could copy-paste and see a meaningful response.");
    return { passed: false, manifest };
  }

  console.log(`  Executing ${manifest.slug} with known_answer input...`);

  const { output, error } = await executeCapability(manifest.slug, input);

  if (error) {
    console.log(`  ⚠ Could not verify fixtures — ${error}`);
    if (flags.strict) {
      console.log("  ✗ --strict mode: aborting onboarding");
      return { passed: false, manifest };
    }
    // A gate refusal is a permanent policy decision, not weather — saying
    // "transient" here told the operator the opposite of the truth.
    if (/cost_class|refuses invocation|unclassified/i.test(error)) {
      console.log(
        "  Continuing without verification (policy refusal — the cost-class gate blocks " +
          "internal_test for this capability; quality signals will come from production " +
          "traffic and piggyback suites instead)",
      );
    } else {
      console.log("  Continuing without verification (transient failure)");
    }
    return { passed: true, manifest };
  }

  console.log(`  Output: ${Object.keys(output).length} fields returned`);

  // Phase 3b strict-missing gate (DEC-20260513-B + DEC-20260513-C): every
  // field declared `guaranteed` in output_field_reliability must appear as
  // a key in actual_output. Reuses the runtime sentinel from PR #109 so
  // the same assertion fires at onboard time AND at scheduler-tick time.
  // Caught fixtures are rejected before manifest commit; this closes the
  // window between manifest authoring and the runtime sentinel's first tick.
  const reliability = manifest.output_field_reliability ?? null;
  const sentinel = checkGuaranteedFieldsPresent(output, reliability as Record<string, string> | null);
  if (!sentinel.passed) {
    console.log(`  ✗ Strict-missing gate failed: ${sentinel.failureReason}`);
    console.log(
      "  The executor's output is missing a field declared `guaranteed` in " +
        "output_field_reliability. Either fix the executor to populate the field, " +
        "or downgrade the reliability annotation to `common` or `rare`.",
    );
    return { passed: false, manifest };
  }

  // Check each expected field
  let allPass = true;
  for (const ef of expectedFields) {
    const check = checkFieldAssertion(output, ef);
    const icon = check.pass ? "✓" : "✗";
    const detail = ef.operator === "not_null"
      ? `${ef.field}: not_null`
      : `${ef.field}: ${ef.operator} ${JSON.stringify(ef.value)}`;
    const actual = check.pass ? "" : ` (actual: ${JSON.stringify(check.actual)})`;
    console.log(`    ${icon} ${detail}${actual}`);
    if (!check.pass) allPass = false;
  }

  if (allPass) {
    console.log("  ✓ known_answer verified against live output (strict-missing + expected_fields)");
    return { passed: true, manifest };
  }

  // Mismatches detected
  const mismatches = analyzeFixtureMismatches(expectedFields, output);
  const autoFixes = mismatches.filter((m) => m.fix_type === "auto");
  const suggestions = mismatches.filter((m) => m.fix_type === "suggest");

  if (autoFixes.length > 0) {
    console.log(`\n  Auto-correctable (${autoFixes.length}):`);
    for (const m of autoFixes) {
      console.log(`    → ${m.suggested_fix}`);
    }
  }

  if (suggestions.length > 0) {
    console.log(`\n  Manual review needed (${suggestions.length}):`);
    for (const m of suggestions) {
      console.log(`    ? ${m.suggested_fix}`);
    }
  }

  // Apply auto-fixes if --fix (single-fixture manifests only — see opts doc)
  if (opts.allowAutoFix && flags.fix && autoFixes.length > 0) {
    console.log("\n  Applying auto-corrections...");
    let updated = manifest;
    for (const m of autoFixes) {
      if (m.corrected_expected) {
        updated = applyFixToManifest(updated, m);
      }
    }

    // Write corrected manifest back to disk
    writeManifest(manifestPath, updated);
    console.log(`  ✓ Manifest updated: ${manifestPath}`);

    // Re-verify
    const expectedNow = getKnownAnswerFixtures(updated)[0]?.expected_fields ?? [];
    let repass = true;
    for (const ef of expectedNow) {
      const check = checkFieldAssertion(output, ef);
      if (!check.pass) repass = false;
    }

    if (repass) {
      console.log("  ✓ Re-verification passed after auto-correction");
      return { passed: true, manifest: updated };
    } else {
      console.log("  ⚠ Some assertions still fail after auto-correction");
    }
  }

  if (flags.strict) {
    console.log("  ✗ --strict mode: aborting onboarding due to fixture mismatches");
    return { passed: false, manifest };
  }

  console.log("  ⚠ Continuing with mismatched fixtures (test will fail until corrected)");
  return { passed: true, manifest };
}

// ─── Discover step ──────────────────────────────────────────────────────────

async function discoverFixtures(
  manifest: Manifest,
  manifestPath: string,
): Promise<{ manifest: Manifest; discoveryFailed: boolean }> {
  // Array-form known_answer (Gate 5 multi-path fixtures, DEC-20260411-B) is
  // human-curated per entry point — the discovery flow below only knows how
  // to write the single-fixture shape, so it must never overwrite an array
  // with a single discovered object. Fall back to health_check_input only.
  const isArrayForm = Array.isArray(manifest.test_fixtures?.known_answer);
  const singleKnownAnswerInput = isArrayForm
    ? undefined
    : (manifest.test_fixtures?.known_answer as ManifestKnownAnswerFixture | undefined)?.input;
  const input = manifest.test_fixtures?.health_check_input ?? singleKnownAnswerInput;

  if (!input) {
    if (isArrayForm) {
      console.log("  ✗ Cannot discover: known_answer is array-form (multi-entry-point) and no health_check_input is set.");
      console.log("    --discover only writes the single-fixture shape; author array entries by hand and verify them live.");
    } else {
      console.log("  ✗ Cannot discover: no health_check_input or known_answer.input");
    }
    return { manifest, discoveryFailed: true };
  }

  console.log("\n─── Fixture Discovery ───────────────────────────────────────");
  console.log(`  Executing ${manifest.slug} with discovery input...`);

  const { output, error } = await executeCapability(manifest.slug, input);

  if (error) {
    console.log(`  ✗ Cannot discover — execution failed: ${error}`);
    return { manifest, discoveryFailed: true };
  }

  console.log(`  Output: ${Object.keys(output).length} fields`);
  for (const [k, v] of Object.entries(output)) {
    const display = typeof v === "string" && v.length > 50 ? v.slice(0, 50) + "..." : JSON.stringify(v);
    console.log(`    ${k}: ${display}`);
  }

  // Generate field reliability — safe to merge regardless of known_answer
  // shape (additive-only: only fills fields not already annotated).
  const fieldReliability = generateFieldReliability(output);
  console.log(`  Generated ${Object.keys(fieldReliability).length} field reliability entries`);
  if (!manifest.output_field_reliability) {
    manifest.output_field_reliability = {};
  }
  for (const [field, level] of Object.entries(fieldReliability)) {
    if (!manifest.output_field_reliability[field]) {
      manifest.output_field_reliability[field] = level;
    }
  }

  if (isArrayForm) {
    console.log("  ⚠ known_answer is array-form (multi-entry-point) — leaving it untouched.");
    console.log("    Only output_field_reliability was merged from this discovery run.");
    writeManifest(manifestPath, manifest);
    console.log(`  ✓ Manifest updated (output_field_reliability only): ${manifestPath}`);
    return { manifest, discoveryFailed: false };
  }

  // Generate expected_fields (single-fixture shape only)
  const looseAssertions = isAiCapability(manifest);
  const expectedFields = generateExpectedFields(output, looseAssertions);
  console.log(`\n  Generated ${expectedFields.length} expected_fields${looseAssertions ? " (loose — AI capability)" : ""}`);

  // Merge discovered data into manifest
  if (!manifest.test_fixtures) {
    manifest.test_fixtures = {} as any;
  }
  if (!manifest.test_fixtures.known_answer) {
    manifest.test_fixtures.known_answer = {
      input: input,
      expected_fields: [],
    };
  }
  (manifest.test_fixtures.known_answer as ManifestKnownAnswerFixture).input = input;
  (manifest.test_fixtures.known_answer as ManifestKnownAnswerFixture).expected_fields = expectedFields;

  // Write updated manifest
  writeManifest(manifestPath, manifest);
  console.log(`  ✓ Manifest updated: ${manifestPath}`);
  console.log("  Review generated expected_fields and adjust reliability levels as needed.");

  return { manifest, discoveryFailed: false };
}

/**
 * Shared handling for both discoverFixtures call sites. Under --strict a
 * failed discovery must abort: without it, discovery failure left
 * known_answer fixtures empty, verifyFixtures hit its "no fixtures" early
 * return, and --strict onboarded the capability with zero verified
 * fixtures and exit code 0 — silently bypassing the flag on the exact
 * path (--discover) the docs recommend.
 */
function abortIfDiscoveryFailedUnderStrict(
  discoveryFailed: boolean,
  strict: boolean,
): void {
  if (discoveryFailed && strict) {
    console.log("  ✗ --strict mode: aborting — discovery failed, so there are no verified fixtures to onboard with");
    process.exit(1);
  }
}

// ─── Manifest file helpers ──────────────────────────────────────────────────

function applyFixToManifest(manifest: Manifest, fix: FixtureMismatch): Manifest {
  // Only the single-fixture shape is addressable here — callers (see
  // verifyFixtures' allowAutoFix gate) only invoke this when
  // known_answer isn't array-form, but guard defensively anyway since
  // the type is a union.
  const ka = manifest.test_fixtures?.known_answer;
  if (!fix.corrected_expected || !ka || Array.isArray(ka) || !ka.expected_fields) {
    return manifest;
  }

  const fields = ka.expected_fields;
  const idx = fields.findIndex((f) => f.field === fix.field);
  if (idx >= 0) {
    fields[idx] = fix.corrected_expected;
  }

  return manifest;
}

function writeManifest(manifestPath: string, manifest: Manifest): void {
  const yamlStr = yaml.dump(manifest, {
    lineWidth: 120,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });
  writeFileSync(manifestPath, yamlStr, "utf-8");
}

// ─── Onboard ─────────────────────────────────────────────────────────────────

async function onboard(
  manifest: Manifest,
  dryRun: boolean,
  flags: { strict: boolean; fix: boolean; discover: boolean },
  manifestPath: string,
): Promise<void> {
  const db = openOperatorWriteDrizzle(autonomousAuthority("capability_onboarding", "DEC-20260812-A"));

  // Check if capability already exists
  const [existing] = await db
    .select({ slug: capabilities.slug })
    .from(capabilities)
    .where(eq(capabilities.slug, manifest.slug))
    .limit(1);

  if (existing) {
    console.log(`\nCapability '${manifest.slug}' already exists in database.`);
    if (!dryRun) {
      console.log("Use --dry-run to preview what would be created, or choose a different slug.");
      return;
    }
    console.log("(Continuing in dry-run mode for preview)\n");
  }

  // Insert-mode only: no DB row exists yet, so the guarded executor would
  // read cost_class NULL and refuse the discover/verify executions below.
  // Backfill never seeds — there the DB row is authoritative (see the
  // seedGateFromManifest doc comment).
  if (!existing) {
    seedGateFromManifest(manifest);
  }

  // Discover fixtures from live execution (Enhancement 3)
  if (flags.discover) {
    const disc = await discoverFixtures(manifest, manifestPath);
    manifest = disc.manifest;
    abortIfDiscoveryFailedUnderStrict(disc.discoveryFailed, flags.strict);
  }

  const capType = dataSourceTypeToCapType(manifest.data_source_type);

  console.log("\n─── Capability Record ───────────────────────────────────────");
  console.log(`  slug:             ${manifest.slug}`);
  console.log(`  name:             ${manifest.name}`);
  console.log(`  category:         ${manifest.category}`);
  console.log(`  price_cents:      ${manifest.price_cents}`);
  console.log(`  is_free_tier:     ${manifest.is_free_tier ?? false}`);
  console.log(`  capability_type:  ${capType}`);
  console.log(`  data_source:      ${manifest.data_source}`);
  console.log(`  lifecycle_state:  validating`);
  console.log(`  visible:          false`);
  console.log(`  data_class:       ${(manifest as any).data_classification ?? "public"}`);

  // Test suites
  const testSuiteRecords = buildTestSuites(manifest);
  console.log(`\n─── Test Suites (${testSuiteRecords.length}) ────────────────────────────────`);
  for (const ts of testSuiteRecords) {
    console.log(`  ${ts.testType}: ${ts.testName}`);
  }

  // Limitations
  console.log(`\n─── Limitations (${manifest.limitations.length}) ─────────────────────────────────`);
  for (const lim of manifest.limitations) {
    console.log(`  [${lim.category}/${lim.severity ?? "info"}] ${(lim.title ?? lim.text).slice(0, 70)}`);
  }

  // Field reliability
  const fields = Object.entries(manifest.output_field_reliability);
  console.log(`\n─── Field Reliability (${fields.length} fields) ──────────────────────────`);
  for (const [field, level] of fields) {
    console.log(`  ${field}: ${level}`);
  }

  // Execute-and-verify (Enhancement 1) — skip in dry-run
  if (!dryRun) {
    const { passed, manifest: updated } = await verifyFixtures(manifest, flags, manifestPath);
    manifest = updated;
    if (!passed) {
      process.exit(1);
    }
  }

  if (dryRun) {
    console.log("\n[DRY RUN] No changes made. Remove --dry-run to insert.");
    return;
  }

  if (existing) return; // Already exists, don't insert

  // Cluster 2 Phase 3 C1 + C2: transactional persist + post-commit hook
  // (F-B-001, F-B-002, F-B-008, F-B-024). persistCapability wraps the three
  // inserts in one tx, then calls onCapabilityCreated OUTSIDE the tx
  // (design doc §4.3). Hook failure → separate UPDATE setting
  // lifecycle_state='hook_failed' without rolling back the INSERT.
  // normalizeManifestToRow (C2) does the Manifest→DB-row mapping that was
  // previously inline here.
  const persistResult = await persistCapability(
    {
      capability: normalizeManifestToRow(manifest),
      testSuites: testSuiteRecords,
      limitations: manifest.limitations.map((lim, i) => ({
        title: lim.title ?? null,
        limitationText: lim.text,
        category: lim.category,
        severity: lim.severity ?? "info",
        workaround: lim.workaround ?? null,
        sortOrder: i,
      })),
    },
    { mode: "create" },
  );

  if (persistResult.hookFailed) {
    console.log(`\n⚠️  Onboarded '${manifest.slug}' — post-insert hook FAILED, lifecycle_state=hook_failed`);
    console.log(`   Check logs for details. Phase 6 retry scheduler will re-run the hook.`);
  } else {
    console.log(`\n✅ Onboarded '${manifest.slug}' → lifecycle_state=validating, visible=false`);
    console.log(`   Next: npx tsx scripts/validate-capability.ts --slug ${manifest.slug} --apply`);
  }
}

// ─── Build test suite records ────────────────────────────────────────────────

function buildTestSuites(manifest: Manifest) {
  const suites: Array<{
    capabilitySlug: string;
    testName: string;
    testType: string;
    input: unknown;
    validationRules: unknown;
    scheduleTier: string;
    estimatedCostCents: number;
  }> = [];

  const slug = manifest.slug;
  const knownAnswerEntries = getKnownAnswerFixtures(manifest);
  const healthInput = manifest.test_fixtures?.health_check_input;

  const schemaCheckRules = {
    checks: Object.keys(
      (manifest.output_schema?.properties as Record<string, unknown>) ?? {},
    )
      .slice(0, 5)
      .map((field) => ({ field, operator: "not_null" })),
  };

  // 1 & 2. known_answer + schema_check — one pair per entry point.
  //
  // Single-fixture manifests (the ~300-manifest legacy shape) produce
  // exactly one of each, with the original unsuffixed test names — this
  // loop body is byte-for-byte what the old single-object code produced
  // when knownAnswerEntries.length === 1.
  //
  // Array-form manifests (Gate 5 multi-path fixture coverage,
  // DEC-20260411-B — gate5-path-coverage.ts requires a known_answer or
  // schema_check fixture per PRIMARY/SECONDARY entry point) produce one
  // pair per array entry, suffixed by position (`-2`, `-3`, ...) so each
  // entry point gets its own DB row instead of silently overwriting the
  // first.
  knownAnswerEntries.forEach((entry, i) => {
    const suffix = i === 0 ? "" : `-${i + 1}`;

    if (entry?.expected_fields?.length) {
      suites.push({
        capabilitySlug: slug,
        testName: `${slug}-known-answer${suffix}`,
        testType: "known_answer",
        input: entry.input,
        validationRules: {
          checks: entry.expected_fields.map((ef) => {
            const check: Record<string, unknown> = {
              field: ef.field,
              operator: ef.operator,
            };
            if (ef.value !== undefined) check.value = ef.value;
            if (ef.values !== undefined) check.values = ef.values;
            return check;
          }),
        },
        scheduleTier: "B",
        estimatedCostCents: manifest.price_cents,
      });
    }

    suites.push({
      capabilitySlug: slug,
      testName: `${slug}-schema-check${suffix}`,
      testType: "schema_check",
      input: entry?.input ?? healthInput ?? {},
      validationRules: schemaCheckRules,
      scheduleTier: "A",
      estimatedCostCents: 0,
    });
  });

  // No known_answer fixtures at all: still emit a single schema_check
  // suite from health_check_input — matches pre-array-support behavior.
  if (knownAnswerEntries.length === 0) {
    suites.push({
      capabilitySlug: slug,
      testName: `${slug}-schema-check`,
      testType: "schema_check",
      input: healthInput ?? {},
      validationRules: schemaCheckRules,
      scheduleTier: "A",
      estimatedCostCents: 0,
    });
  }

  // 3. negative test (empty input)
  suites.push({
    capabilitySlug: slug,
    testName: `${slug}-negative-empty`,
    testType: "negative",
    input: {},
    validationRules: { checks: [] },
    scheduleTier: "B",
    estimatedCostCents: 0,
  });

  // 4. edge_case test (partial input)
  const inputProps = Object.keys(
    (manifest.input_schema?.properties as Record<string, unknown>) ?? {},
  );
  const partialInput: Record<string, unknown> = {};
  if (inputProps.length > 0) {
    partialInput[inputProps[0]] = "";
  }
  suites.push({
    capabilitySlug: slug,
    testName: `${slug}-edge-empty-field`,
    testType: "edge_case",
    input: partialInput,
    validationRules: { checks: [] },
    scheduleTier: "C",
    estimatedCostCents: 0,
  });

  // 5. dependency_health test
  suites.push({
    capabilitySlug: slug,
    testName: `${slug}-dependency-health`,
    testType: "dependency_health",
    input: healthInput ?? knownAnswerEntries[0]?.input ?? {},
    validationRules: {
      // Only when the manifest declares `status` guaranteed — see
      // onboard-dependency-health.ts. Emitting it unconditionally pinned every
      // capability without a `status` field at a permanent 80% against the
      // 95% promotion bar.
      checks: dependencyHealthChecks(manifest),
    },
    scheduleTier: "A",
    estimatedCostCents: manifest.price_cents,
  });

  // Whether the scheduler may run these at all. Without this the suites are
  // inserted FALSE and skipped forever — see onboard-scheduling.ts for why the
  // predicate keys on cost_class rather than external_cost_cents, and for the
  // gap between it and startup-migrations block 0066 that hid this.
  const schedulable = suitesAreSchedulable(manifest.cost_class);

  return suites.map((s) => ({ ...s, scheduledTestingEligible: schedulable }));
}

// ─── Backfill existing capability ────────────────────────────────────────────

async function backfill(
  manifest: Manifest,
  dryRun: boolean,
  flags: { strict: boolean; fix: boolean; discover: boolean; force: boolean; bypassAuthority?: boolean },
  manifestPath: string,
): Promise<void> {
  const db = openOperatorWriteDrizzle(autonomousAuthority("capability_onboarding", "DEC-20260812-A"));

  // Verify the capability exists AND load the full row for Phase 4a
  // authority decisions (hybrid: fill-null-only; manifest-drift: throw).
  const [existing] = await db
    .select()
    .from(capabilities)
    .where(eq(capabilities.slug, manifest.slug))
    .limit(1);

  if (!existing) {
    console.error(`Capability '${manifest.slug}' not found. Use onboard (without --backfill) to create it.`);
    process.exit(1);
  }

  // Backfill safety banner (manifest drift audit, 2026-04-20).
  // 238 capabilities have YAML fields (price_cents, freshness_category,
  // transparency_tag, data_source) that diverge from DB-canonical values.
  // Backfill currently only UPDATEs a narrow set of columns (tests, PII,
  // limitations, reliability) — not the Class 4 fields — but future edits
  // to this script could widen that UPDATE and silently overwrite correct
  // DB state with stale YAML. This gate forces the operator to acknowledge
  // the risk every time.
  if (!dryRun && !flags.force) {
    console.warn(
      "\n" +
      "═══════════════════════════════════════════════════════════════════\n" +
      `⚠  WARNING: --backfill on existing capability '${manifest.slug}'\n` +
      "═══════════════════════════════════════════════════════════════════\n" +
      "The manifest drift audit (2026-04-20) identified 238 capabilities\n" +
      "where YAML values diverge from DB-canonical values (price_cents,\n" +
      "freshness_category, transparency_tag, data_source, data_source_type).\n" +
      "\n" +
      "Today the backfill path writes only test suites, PII classification,\n" +
      "field reliability, and limitations — so Class 4 fields are safe.\n" +
      "But: verify this slug's YAML is consistent with DB before proceeding,\n" +
      "and re-check if this script is widened in the future.\n" +
      "\n" +
      "See archive/sessions/audit-reports/manifest_drift_inventory.md Class 4 for full list.\n" +
      "\n" +
      "Re-run with --force to proceed.\n" +
      "═══════════════════════════════════════════════════════════════════\n"
    );
    console.error("Aborted. Add --force to proceed.");
    process.exit(1);
  }

  // Discover fixtures from live execution (Enhancement 3)
  if (flags.discover) {
    const disc = await discoverFixtures(manifest, manifestPath);
    manifest = disc.manifest;
    abortIfDiscoveryFailedUnderStrict(disc.discoveryFailed, flags.strict);
  }

  // Execute-and-verify (Enhancement 1)
  if (!dryRun) {
    const { passed, manifest: updated } = await verifyFixtures(manifest, flags, manifestPath);
    manifest = updated;
    if (!passed) {
      process.exit(1);
    }
  }

  // Check which test types already exist.
  //
  // Dedup is COUNT-based per test type, not Set-membership — needed so a
  // multi-entry-point manifest (Gate 5 array-form known_answer,
  // DEC-20260411-B) can add its 2nd/3rd fixture as a genuinely new suite,
  // instead of being silently dropped because *a* known_answer row of
  // *some* content already exists (the bug this backfill path had before:
  // Set(testType).has("known_answer") is true after the very first row,
  // so every later array entry was filtered out of `missing` and never
  // inserted). For the single-fixture legacy shape (the ~300-manifest
  // majority), buildTestSuites emits exactly one suite per type, so this
  // reduces to the original check bit-for-bit: existing>=1 → skip.
  //
  // Only ACTIVE rows count toward "already covered" — matches Gate 5's own
  // active-only fixture accounting (gate5-path-coverage.ts
  // traceFixtureCoverage queries `active = true`), so a fully
  // quarantined/deactivated type doesn't block backfill from restoring it.
  const existingTests = await db
    .select({ testType: testSuites.testType, active: testSuites.active })
    .from(testSuites)
    .where(eq(testSuites.capabilitySlug, manifest.slug));

  const existingTypes = new Set(existingTests.map((t) => t.testType)); // display only
  const existingActiveCountByType = new Map<string, number>();
  for (const t of existingTests) {
    if (!t.active) continue;
    existingActiveCountByType.set(t.testType, (existingActiveCountByType.get(t.testType) ?? 0) + 1);
  }

  const allSuites = buildTestSuites(manifest);
  const generatedSeenByType = new Map<string, number>();
  const missing = allSuites.filter((s) => {
    const already = existingActiveCountByType.get(s.testType) ?? 0;
    const seen = generatedSeenByType.get(s.testType) ?? 0;
    generatedSeenByType.set(s.testType, seen + 1);
    return seen >= already;
  });

  console.log(`\n─── Backfill: ${manifest.slug} ────────────────────────────────`);
  console.log(`  Existing test types: ${[...existingTypes].join(", ") || "(none)"}`);
  console.log(`  Missing test types:  ${missing.map((s) => s.testType).join(", ") || "(none)"}`);

  // Check if known_answer needs updating (e.g., after --discover or --fix)
  const hasKnownAnswerUpdate = flags.discover || flags.fix;
  const existingKnownAnswer = existingTypes.has("known_answer");
  const isArrayForm = Array.isArray(manifest.test_fixtures?.known_answer);

  // Field reliability
  const fields = Object.entries(manifest.output_field_reliability);
  console.log(`  Field reliability:   ${fields.length} fields`);

  // Limitations
  const limCount = manifest.limitations?.length ?? 0;
  console.log(`  Limitations:         ${limCount}`);

  if (missing.length === 0 && fields.length === 0 && !hasKnownAnswerUpdate) {
    console.log("  Nothing to backfill.");
    return;
  }

  if (dryRun) {
    if (missing.length > 0) {
      console.log("\n  Would add test suites:");
      for (const s of missing) console.log(`    + ${s.testType}: ${s.testName}`);
    }
    if (hasKnownAnswerUpdate && existingKnownAnswer) {
      console.log("  Would update known_answer test suite with corrected fixtures.");
    }
    console.log("\n  [DRY RUN] No changes made.");
    return;
  }

  // Insert missing test suites
  for (const ts of missing) {
    await db.insert(testSuites).values(ts);
    console.log(`  + Added ${ts.testType}: ${ts.testName}`);
  }

  // Update existing known_answer if fixtures were corrected.
  // CRITICAL: any change to .input invalidates baseline_output. Fixture-mode
  // tests replay baseline_output verbatim, so leaving a stale baseline means
  // the test keeps "passing" by matching its own stale self even when the
  // real input would produce different output. Clear baseline + force
  // test_mode='live' so the next run executes and recaptures fresh baseline.
  // Also applies to schema_check and dependency_health which share input
  // derivation with known_answer via buildTestSuites.
  //
  // Scoped to the single-fixture shape: this UPDATE has no testName filter
  // (matches every known_answer row for the slug), which is fine when
  // there's exactly one row to mean. For array-form (multi-entry-point)
  // manifests there's no unambiguous 1:1 mapping from "the corrected
  // fixture" to "which of N existing known_answer rows to overwrite" — a
  // blind blast-update would stomp every entry point's row with the same
  // single input. discoverFixtures() already refuses to mutate an
  // array-form known_answer for the same reason; --fix's auto-apply is
  // similarly disabled for arrays in verifyFixtures(). Skip here too and
  // tell the operator to hand-edit.
  if (hasKnownAnswerUpdate && existingKnownAnswer && !isArrayForm) {
    const knownAnswerSuite = allSuites.find((s) => s.testType === "known_answer");
    if (knownAnswerSuite) {
      await db
        .update(testSuites)
        .set({
          input: knownAnswerSuite.input as any,
          validationRules: knownAnswerSuite.validationRules as any,
          baselineOutput: null,
          baselineCapturedAt: null,
          testMode: "live",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(testSuites.capabilitySlug, manifest.slug),
            eq(testSuites.testType, "known_answer"),
          ),
        );
      console.log(`  ✓ Updated known_answer test suite with corrected fixtures`);
      console.log(`    (baseline cleared — next test run will recapture)`);
    }
  } else if (hasKnownAnswerUpdate && existingKnownAnswer && isArrayForm) {
    console.log(
      "  ⚠ Skipping known_answer row update — known_answer is array-form (multiple entry points). " +
        "Re-run with --dry-run to review, then hand-edit the specific DB row or re-onboard that entry point.",
    );
  }

  // Cluster 2 Phase 3 C2: consolidate the backfill UPDATE fragments
  // (field reliability + PII) into one persistCapability({mode:'update'})
  // call via the partial normalizer. Partial mode omits undefined fields
  // so DB-canonical columns (price_cents, freshness_category, etc.) are
  // NOT clobbered — only the fields the manifest actually declares get
  // updated. The post-commit hook runs once (outside the tx), regardless
  // of which sub-fields changed.
  const hasReliabilityUpdate = fields.length > 0;
  const hasPiiUpdate = manifest.processes_personal_data !== undefined;
  if (hasReliabilityUpdate || hasPiiUpdate) {
    // Phase 4a: pass existing DB row for authority decisions (hybrid
    // fill-null, manifest-canonical drift-throw) and the bypass flag for
    // --force-override-authority. The normalizer strips db + hybrid-set
    // fields; throws AuthorityViolationError on manifest-canonical drift.
    await persistCapability(
      {
        capability: normalizeManifestToRow(manifest, {
          partial: true,
          existingRow: existing as unknown as Record<string, unknown>,
          bypassAuthority: flags.bypassAuthority === true,
        }),
      },
      { mode: "update" },
    );
    if (hasReliabilityUpdate) {
      console.log(`  ✓ Updated output_field_reliability (${fields.length} fields)`);
    }
    if (hasPiiUpdate) {
      console.log(
        `  ✓ Updated PII classification: processes_personal_data=${manifest.processes_personal_data}, categories=[${(manifest.personal_data_categories ?? []).join(", ")}]`,
      );
    }
  }

  // F-B-012: diff-by-hash backfill. Previously the block at this location
  // only INSERTed when existingLimitations.length === 0 — so any manifest
  // edits (add/remove/edit/reorder) silently no-opped once ≥1 row existed.
  // diffAndUpdateLimitations DELETEs orphans, INSERTs new, UPDATEs
  // sort_order on moves — called regardless of existing-row count.
  const manifestLimRows = (manifest.limitations ?? []).map((lim) => ({
    title: lim.title ?? null,
    limitationText: lim.text,
    category: lim.category,
    severity: lim.severity ?? "info",
    workaround: lim.workaround ?? null,
  }));
  const limResult = await diffAndUpdateLimitations(db, manifest.slug, manifestLimRows);
  if (limResult.deleted + limResult.inserted + limResult.reordered > 0) {
    console.log(
      `  ✓ Limitations synced: deleted=${limResult.deleted} inserted=${limResult.inserted} reordered=${limResult.reordered}`,
    );
  }

  console.log(`  ✅ Backfill complete for '${manifest.slug}'`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

// ─── Single-manifest processing ────────────────────────────────────────────

interface OnboardResult {
  slug: string;
  status: "success" | "failed" | "skipped";
  timeMs: number;
  error?: string;
}

async function processSingleManifest(
  manifestPath: string,
  dryRun: boolean,
  isBackfill: boolean,
  flags: {
    strict: boolean;
    fix: boolean;
    discover: boolean;
    skipGates: Array<{ gate: string; reason: string }>;
    force: boolean;
    bypassAuthority?: boolean;
  },
): Promise<OnboardResult> {
  const start = Date.now();
  let raw: string;
  try {
    raw = readFileSync(manifestPath, "utf-8");
  } catch {
    return { slug: manifestPath, status: "failed", timeMs: 0, error: "Could not read file" };
  }

  let manifest: Manifest;
  try {
    manifest = yaml.load(raw) as Manifest;
  } catch (err) {
    return { slug: manifestPath, status: "failed", timeMs: 0, error: `YAML parse: ${err instanceof Error ? err.message : err}` };
  }

  const errors = await runOrchestrator(manifest, {
    mode: isBackfill ? "backfill" : "insert",
    source: "manifest",
    skipGates: flags.skipGates,
    discover: flags.discover,
  });
  if (errors.length > 0) {
    return { slug: manifest.slug ?? manifestPath, status: "failed", timeMs: 0, error: errors.join("; ") };
  }

  try {
    if (isBackfill) {
      await backfill(manifest, dryRun, flags, manifestPath);
    } else {
      await onboard(manifest, dryRun, flags, manifestPath);
    }
    return { slug: manifest.slug, status: "success", timeMs: Date.now() - start };
  } catch (err) {
    return { slug: manifest.slug, status: "failed", timeMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Batch processing ────────────────────────────────────────────────────────

async function runBatch(
  manifestDir: string,
  dryRun: boolean,
  isBackfill: boolean,
  flags: {
    strict: boolean;
    fix: boolean;
    discover: boolean;
    skipGates: Array<{ gate: string; reason: string }>;
    force: boolean;
    bypassAuthority?: boolean;
  },
  delayMs: number,
): Promise<void> {
  if (!existsSync(manifestDir)) {
    console.error(`Directory not found: ${manifestDir}`);
    process.exit(1);
  }

  // Find all YAML files
  const files = readdirSync(manifestDir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort()
    .map((f) => join(manifestDir, f));

  if (files.length === 0) {
    console.error(`No .yaml files found in ${manifestDir}`);
    process.exit(1);
  }

  console.log(`\n[batch] Found ${files.length} manifests in ${manifestDir}`);

  // Parse all manifests upfront for validation
  const manifests: Array<{ path: string; manifest: Manifest; errors: string[] }> = [];
  for (const file of files) {
    try {
      const raw = readFileSync(file, "utf-8");
      const manifest = yaml.load(raw) as Manifest;
      const errors = await runOrchestrator(manifest, {
        mode: isBackfill ? "backfill" : "insert",
        source: "manifest",
        skipGates: flags.skipGates,
        discover: flags.discover,
      });
      manifests.push({ path: file, manifest, errors });
    } catch (err) {
      manifests.push({
        path: file,
        manifest: { slug: file } as any,
        errors: [`YAML parse error: ${err instanceof Error ? err.message : err}`],
      });
    }
  }

  // Fail fast if any manifests are invalid
  const invalid = manifests.filter((m) => m.errors.length > 0);
  if (invalid.length > 0) {
    console.error(`\n[batch] ${invalid.length} invalid manifests — fix before batch processing:`);
    for (const m of invalid) {
      console.error(`  ${m.manifest.slug ?? m.path}: ${m.errors.join("; ")}`);
    }
    process.exit(1);
  }

  // Resumability: check which capabilities already exist
  const db = openOperatorWriteDrizzle(autonomousAuthority("capability_onboarding", "DEC-20260812-A"));
  const existingRows = await db
    .select({ slug: capabilities.slug })
    .from(capabilities);
  const existingSlugs = new Set(existingRows.map((r) => r.slug));

  const toProcess = isBackfill
    ? manifests // backfill mode processes all
    : manifests.filter((m) => !existingSlugs.has(m.manifest.slug));
  const skippedCount = manifests.length - toProcess.length;

  if (skippedCount > 0 && !isBackfill) {
    console.log(`[batch] ${skippedCount} already onboarded — skipping`);
  }
  console.log(`[batch] Processing ${toProcess.length} manifests (${isBackfill ? "backfill" : "onboard"} mode)\n`);

  // Process sequentially with delay between capabilities
  const results: OnboardResult[] = [];
  for (let i = 0; i < toProcess.length; i++) {
    const { path: mPath } = toProcess[i];
    const shortName = mPath.split(/[/\\]/).pop() ?? mPath;
    console.log(`[batch] (${i + 1}/${toProcess.length}) Processing ${shortName}...`);

    const result = await processSingleManifest(mPath, dryRun, isBackfill, flags);
    results.push(result);

    if (result.status === "failed") {
      console.error(`  FAILED: ${result.error}`);
    } else {
      console.log(`  OK (${(result.timeMs / 1000).toFixed(1)}s)`);
    }

    // Delay between capabilities to avoid rate-limiting upstreams
    if (i < toProcess.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  // Add skipped results
  if (!isBackfill) {
    for (const m of manifests.filter((m) => existingSlugs.has(m.manifest.slug))) {
      results.push({ slug: m.manifest.slug, status: "skipped", timeMs: 0 });
    }
  }

  // Summary table
  const succeeded = results.filter((r) => r.status === "success");
  const failed = results.filter((r) => r.status === "failed");
  const skipped = results.filter((r) => r.status === "skipped");

  console.log("\n" + "═".repeat(60));
  console.log("BATCH SUMMARY");
  console.log("═".repeat(60));
  console.log(`  Total manifests:  ${manifests.length}`);
  console.log(`  Succeeded:        ${succeeded.length}`);
  console.log(`  Failed:           ${failed.length}`);
  console.log(`  Skipped (exists): ${skipped.length}`);
  console.log(`  Total time:       ${(results.reduce((s, r) => s + r.timeMs, 0) / 1000).toFixed(1)}s`);

  if (failed.length > 0) {
    console.log("\nFailed capabilities:");
    for (const r of failed) {
      console.log(`  ${r.slug}: ${r.error}`);
    }
  }

  if (failed.length > 0) {
    process.exit(1);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Register executors so --discover and fixture verification can execute capabilities
  await autoRegisterCapabilities();

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const isBackfill = args.includes("--backfill");
  const strict = args.includes("--strict");
  const fix = args.includes("--fix");
  const discover = args.includes("--discover");
  const isBatch = args.includes("--batch");
  // --force bypasses the backfill safety banner (manifest drift audit, 2026-04-20).
  const force = args.includes("--force");

  // Cluster 2 Phase 2 (OQ-5 / DEC-20260420-K): --skip-gates replaces the
  // old SKIP_ONBOARDING_GATES env var. Format:
  //   --skip-gates="gate1_manifest:reason,gate3_schema:other reason"
  const skipGatesIdx = args.indexOf("--skip-gates");
  const skipGatesRaw = skipGatesIdx !== -1 ? args[skipGatesIdx + 1] : undefined;
  let skipGates: Array<{ gate: string; reason: string }>;
  try {
    skipGates = parseSkipGates(skipGatesRaw);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Cluster 2 Phase 4a (DEC-20260421-D, DEC-20260421-E):
  // --force-override-authority lets operator overwrite db/hybrid fields
  // from manifest (the "reset to manifest defaults" workflow). Requires
  // interactive stdin confirmation — the flag alone is not enough. Does
  // NOT bypass manifest-canonical drift errors (those indicate a real
  // bug, not an override case).
  const bypassAuthority = args.includes("--force-override-authority");
  if (bypassAuthority) {
    const confirmed = await confirmAuthorityOverride(isBatch);
    if (!confirmed) {
      console.error("--force-override-authority aborted by operator.");
      process.exit(1);
    }
  }

  const flags = { strict, fix, discover, force, skipGates, bypassAuthority };

  // F-B-005: refuse --discover under --dry-run. Applies to single- and
  // batch-mode, onboard- and backfill-paths uniformly because both call
  // sites (onboard() and backfill()) invoke discoverFixtures() without
  // checking dryRun.
  assertDiscoverNotDryRun(dryRun, discover);

  // Batch mode
  if (isBatch) {
    const dirIdx = args.indexOf("--manifest-dir");
    if (dirIdx === -1 || !args[dirIdx + 1]) {
      console.error("Batch usage: npx tsx scripts/onboard.ts --batch --manifest-dir <dir> [--discover] [--backfill] [--dry-run] [--delay-ms N]");
      process.exit(1);
    }
    const manifestDir = resolve(args[dirIdx + 1]);
    const delayIdx = args.indexOf("--delay-ms");
    const delayMs = delayIdx !== -1 ? parseInt(args[delayIdx + 1], 10) || 2000 : 2000;
    await runBatch(manifestDir, dryRun, isBackfill, flags, delayMs);
    return;
  }

  // Single manifest mode
  const manifestIdx = args.indexOf("--manifest");
  if (manifestIdx === -1 || !args[manifestIdx + 1]) {
    console.error("Usage: npx tsx scripts/onboard.ts --manifest <path> [--dry-run] [--backfill] [--strict] [--fix] [--discover]");
    console.error("Batch: npx tsx scripts/onboard.ts --batch --manifest-dir <dir> [--discover] [--backfill] [--dry-run]");
    process.exit(1);
  }

  const manifestPath = resolve(args[manifestIdx + 1]);
  console.log(`Reading manifest: ${manifestPath}`);

  let raw: string;
  try {
    raw = readFileSync(manifestPath, "utf-8");
  } catch (err) {
    console.error(`Could not read file: ${manifestPath}`);
    process.exit(1);
  }

  let manifest: Manifest;
  try {
    manifest = yaml.load(raw) as Manifest;
  } catch (err) {
    console.error(`YAML parse error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // Validate via orchestrator (Cluster 2 Phase 2)
  const errors = await runOrchestrator(manifest, {
    mode: isBackfill ? "backfill" : "insert",
    source: "manifest",
    skipGates,
    discover,
  });
  if (errors.length > 0) {
    console.error("\nManifest validation failed:");
    for (const e of errors) {
      console.error(`  ✗ ${e}`);
    }
    process.exit(1);
  }
  console.log("Manifest validation: all checks passed");

  if (isBackfill) {
    await backfill(manifest, dryRun, flags, manifestPath);
  } else {
    await onboard(manifest, dryRun, flags, manifestPath);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
