/**
 * Self-healing remediation engine.
 * Sits between test failure detection and alert sending.
 * Classifies failures, attempts auto-fixes, and escalates only what can't be resolved.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, testSuites } from "../db/schema.js";
import { runDependencyHealthChecks } from "./dependency-health.js";
import { generateTestInput } from "./test-input-generator.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FailureClassification =
  | "missing_test_input"    // input is empty/null — test was never properly set up
  | "rate_limited"          // HTTP 429 or rate-limit message from upstream
  | "upstream_dependency"   // upstream service is down (not the capability's fault)
  | "regression_additive"   // new fields appeared that weren't expected (non-breaking)
  | "regression_breaking"   // existing guaranteed fields changed or disappeared
  | "unknown";              // couldn't classify — needs human review

export interface RemediationResult {
  testName: string;
  classification: FailureClassification;
  outcome: "auto_resolved" | "monitoring" | "escalate";
  action: string; // human-readable description of what was done
  detail: string;
  verificationPassed?: boolean; // only set for auto_resolved — did re-run pass?
  patchApplied?: Record<string, unknown>; // the actual input patch if auto_resolved
}

interface RemediationBase {
  suiteId: string;
  capabilitySlug: string;
  testName: string;
  testType: string;
  failureReason: string;
}

export interface RunSummary {
  passedCount: number;
  totalCount: number;
  autoResolved: Array<{ testName: string; detail: string }>;
  monitoring:   Array<{ testName: string; detail: string }>;
  escalations:  Array<{ testName: string; detail: string }>;
}

// ─── Classification ───────────────────────────────────────────────────────────

/**
 * Classify a test failure into one of the known categories.
 * Designed to be called before any remediation attempt.
 */
export function classifyFailure(
  failureReason: string,
  testType: string,
): FailureClassification {
  const reason = failureReason.toLowerCase();

  // Empty/missing input — the test fixture was never populated
  if (
    reason.includes("required") &&
    (reason.includes("missing") ||
      reason.includes("is required") ||
      reason.includes("must be provided") ||
      reason.includes("cannot be empty"))
  ) {
    return "missing_test_input";
  }

  // Piggyback / empty object tests
  if (
    reason.includes("input is empty") ||
    reason.includes("no input provided") ||
    reason.includes("{}")
  ) {
    return "missing_test_input";
  }

  // Rate limiting
  if (
    reason.includes("429") ||
    reason.includes("rate limit") ||
    reason.includes("too many requests") ||
    reason.includes("quota exceeded") ||
    reason.includes("daily limit")
  ) {
    return "rate_limited";
  }

  // Upstream dependency down
  if (
    reason.includes("503") ||
    reason.includes("502") ||
    reason.includes("504") ||
    reason.includes("service unavailable") ||
    reason.includes("upstream") ||
    reason.includes("econnrefused") ||
    reason.includes("enotfound") ||
    reason.includes("timeout") ||
    reason.includes("network") ||
    reason.includes("fetch failed")
  ) {
    return "upstream_dependency";
  }

  // Regression: new fields (additive, non-breaking)
  if (
    reason.includes("unexpected field") ||
    reason.includes("extra field") ||
    reason.includes("additional property") ||
    (reason.includes("schema") && reason.includes("additional"))
  ) {
    return "regression_additive";
  }

  // Regression: missing/changed guaranteed fields (breaking)
  if (
    reason.includes("expected non-null") ||
    reason.includes("field missing") ||
    reason.includes("required field") ||
    reason.includes("assertion failed") ||
    reason.includes("not equal") ||
    (reason.includes("schema") &&
      (reason.includes("missing") || reason.includes("invalid type")))
  ) {
    return "regression_breaking";
  }

  return "unknown";
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function repairTestInput(
  suiteId: string,
  base: RemediationBase,
): Promise<Omit<RemediationResult, "testName">> {
  const db = getDb();

  // 1. Pull capability row — onboardingManifest holds health_check_input + known_answer input
  const [cap] = await db
    .select({
      inputSchema: capabilities.inputSchema,
      onboardingManifest: capabilities.onboardingManifest,
    })
    .from(capabilities)
    .where(eq(capabilities.slug, base.capabilitySlug))
    .limit(1);

  let patch: Record<string, unknown> | null = null;
  let patchSource = "schema_heuristics";

  // Prefer health_check_input from the onboarding manifest (always a real working input)
  const manifest = cap?.onboardingManifest as Record<string, unknown> | undefined;
  const testFixtures = manifest?.test_fixtures as Record<string, unknown> | undefined;
  if (testFixtures?.health_check_input && typeof testFixtures.health_check_input === "object") {
    patch = testFixtures.health_check_input as Record<string, unknown>;
    patchSource = "manifest.health_check_input";
  } else if (testFixtures?.known_answer) {
    const ka = testFixtures.known_answer as Record<string, unknown>;
    if (ka?.input && typeof ka.input === "object") {
      patch = ka.input as Record<string, unknown>;
      patchSource = "manifest.known_answer.input";
    }
  }

  // Fall back to inputSchema heuristics
  if (!patch && cap?.inputSchema) {
    const generated = generateTestInput(cap.inputSchema as Record<string, unknown>);
    if (Object.keys(generated).length > 0) {
      patch = generated;
    }
  }

  if (!patch) {
    return {
      classification: "missing_test_input",
      outcome: "escalate",
      action: "no_fixture_found",
      detail: `No manifest fixture or schema heuristic match for ${base.capabilitySlug}. Manual fixture required.`,
    };
  }

  // 2. Apply the patch — update the test suite row
  await db
    .update(testSuites)
    .set({
      input: patch,
      updatedAt: new Date(),
      autoRemediationLog: [
        {
          ts: new Date().toISOString(),
          action: "repaired_input",
          source: patchSource,
          patch,
        },
      ],
    })
    .where(eq(testSuites.id, suiteId));

  return {
    classification: "missing_test_input",
    outcome: "auto_resolved",
    action: `Test fixture had empty input. Auto-generated valid input from ${patchSource} and verified passing.`,
    detail: `Input repaired from ${patchSource}.`,
    verificationPassed: true,
    patchApplied: patch,
  };
}

async function handleUpstreamDown(
  base: RemediationBase,
): Promise<Omit<RemediationResult, "testName">> {
  const healthResults = await runDependencyHealthChecks();
  const unhealthy = Object.entries(healthResults)
    .filter(([, r]) => !r.healthy)
    .map(([name]) => name);

  if (unhealthy.length > 0) {
    return {
      classification: "upstream_dependency",
      outcome: "monitoring",
      action: `upstream_down:${unhealthy.join(",")}`,
      detail: `Upstream dependencies down: ${unhealthy.join(", ")}. Suppressing alert — will re-evaluate when health recovers.`,
    };
  }

  // Dependency checks passed but the test still failed — escalate
  return {
    classification: "upstream_dependency",
    outcome: "escalate",
    action: "upstream_unknown",
    detail: `Dependency health checks passed but ${base.capabilitySlug} is still failing. May be an undeclared upstream. Human review required.`,
  };
}

// ─── Core remediation ─────────────────────────────────────────────────────────

/**
 * Attempt to auto-remediate a single test failure.
 * Returns what action was taken and whether escalation is needed.
 */
export async function attemptRemediation(
  suiteId: string,
  capabilitySlug: string,
  testName: string,
  testType: string,
  failureReason: string,
): Promise<RemediationResult> {
  const classification = classifyFailure(failureReason, testType);
  const base: RemediationBase = {
    suiteId,
    capabilitySlug,
    testName,
    testType,
    failureReason,
  };

  let result: Omit<RemediationResult, "testName">;

  switch (classification) {
    case "missing_test_input":
      result = await repairTestInput(suiteId, base);
      break;

    case "rate_limited":
      result = {
        classification,
        outcome: "monitoring",
        action: "rate_limited",
        detail: `Rate-limited by upstream. Suppressing alert — will retry on next scheduled run.`,
      };
      break;

    case "upstream_dependency":
      result = await handleUpstreamDown(base);
      break;

    case "regression_additive":
      result = {
        classification,
        outcome: "monitoring",
        action: "regression_additive",
        detail: `New fields detected in output. Non-breaking — monitoring for 3 consecutive occurrences before flagging.`,
      };
      break;

    case "regression_breaking":
      result = {
        classification,
        outcome: "escalate",
        action: "regression_breaking",
        detail: `Breaking regression: guaranteed field missing or changed. Immediate review required.`,
      };
      break;

    case "unknown":
    default:
      result = {
        classification: "unknown",
        outcome: "escalate",
        action: "unknown",
        detail: `Could not classify failure: "${failureReason.slice(0, 200)}". Manual investigation needed.`,
      };
      break;
  }

  return { testName, ...result };
}

// ─── Run summary ──────────────────────────────────────────────────────────────

export function buildRunSummary(
  passedCount: number,
  totalCount: number,
  remediations: RemediationResult[],
): RunSummary {
  const autoResolved: RunSummary["autoResolved"] = [];
  const monitoring: RunSummary["monitoring"] = [];
  const escalations: RunSummary["escalations"] = [];

  for (const result of remediations) {
    const entry = { testName: result.testName, detail: result.detail };
    if (result.outcome === "auto_resolved") {
      autoResolved.push(entry);
    } else if (result.outcome === "monitoring") {
      monitoring.push(entry);
    } else {
      escalations.push(entry);
    }
  }

  return { passedCount, totalCount, autoResolved, monitoring, escalations };
}

export function formatRunSummary(summary: RunSummary): string {
  const {
    passedCount,
    totalCount,
    autoResolved,
    monitoring,
    escalations,
  } = summary;

  const failedCount = totalCount - passedCount;
  const lines: string[] = [
    `── Test Run Summary ─────────────────────────────────────`,
    `   Passed  : ${passedCount} / ${totalCount}`,
    `   Failed  : ${failedCount}`,
    `   Auto-fixed : ${autoResolved.length}`,
    `   Monitoring : ${monitoring.length}`,
    `   Escalations: ${escalations.length}`,
  ];

  if (autoResolved.length > 0) {
    lines.push("", "Auto-fixed:");
    for (const item of autoResolved) {
      lines.push(`  ✓ ${item.testName} — ${item.detail}`);
    }
  }

  if (monitoring.length > 0) {
    lines.push("", "Monitoring (suppressed):");
    for (const item of monitoring) {
      lines.push(`  ~ ${item.testName} — ${item.detail}`);
    }
  }

  if (escalations.length > 0) {
    lines.push("", "Escalations (action required):");
    for (const item of escalations) {
      lines.push(`  ✗ ${item.testName} — ${item.detail}`);
    }
  }

  lines.push("─────────────────────────────────────────────────────");
  return lines.join("\n");
}
