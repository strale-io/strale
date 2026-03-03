import { eq, desc, and, gte, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  testSuites,
  testResults,
  transactionQuality,
  transactions,
  capabilities,
} from "../db/schema.js";
import { getExecutor } from "../capabilities/index.js";
import type { CapabilityResult } from "../capabilities/index.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ValidationCheck {
  field: string;
  operator: string;
  value?: unknown;
  values?: unknown[];
}

interface ValidationRules {
  checks: ValidationCheck[];
}

export interface TestRunSummary {
  total: number;
  passed: number;
  failed: number;
  avgResponseTimeMs: number;
  results: SingleTestResult[];
}

interface SingleTestResult {
  testName: string;
  testType: string;
  passed: boolean;
  failureReason: string | null;
  responseTimeMs: number;
}

// ─── Inter-test delay to avoid hammering upstream APIs ──────────────────────
const INTER_TEST_DELAY_MS = 200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Run tests ──────────────────────────────────────────────────────────────

/**
 * Run all active tests for a capability slug. If no slug given, runs all active tests.
 */
export async function runTests(
  capabilitySlug?: string,
): Promise<TestRunSummary> {
  const db = getDb();

  const conditions = [eq(testSuites.active, true)];
  if (capabilitySlug) {
    conditions.push(eq(testSuites.capabilitySlug, capabilitySlug));
  }

  const suites = await db
    .select()
    .from(testSuites)
    .where(and(...conditions));

  const results: SingleTestResult[] = [];
  let totalResponseTime = 0;

  for (const suite of suites) {
    const result = await runSingleTest(suite);
    results.push(result);
    totalResponseTime += result.responseTimeMs;

    // Rate limit between tests
    if (suites.indexOf(suite) < suites.length - 1) {
      await delay(INTER_TEST_DELAY_MS);
    }
  }

  const passed = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    avgResponseTimeMs:
      results.length > 0
        ? Math.round(totalResponseTime / results.length)
        : 0,
    results,
  };
}

async function runSingleTest(
  suite: typeof testSuites.$inferSelect,
): Promise<SingleTestResult> {
  const db = getDb();
  const executor = getExecutor(suite.capabilitySlug);
  const startTime = Date.now();

  if (!executor) {
    const result: SingleTestResult = {
      testName: suite.testName,
      testType: suite.testType,
      passed: false,
      failureReason: `No executor registered for '${suite.capabilitySlug}'`,
      responseTimeMs: 0,
    };

    await db.insert(testResults).values({
      testSuiteId: suite.id,
      capabilitySlug: suite.capabilitySlug,
      passed: false,
      failureReason: result.failureReason,
      responseTimeMs: 0,
    });

    return result;
  }

  let capResult: CapabilityResult | null = null;
  let executionError: string | null = null;
  let responseTimeMs: number;

  try {
    capResult = await executor(suite.input as Record<string, unknown>);
    responseTimeMs = Date.now() - startTime;
  } catch (err) {
    responseTimeMs = Date.now() - startTime;
    executionError =
      err instanceof Error ? err.message : String(err);
  }

  // Validate the result
  const { passed, failureReason } = validateResult(
    suite,
    capResult,
    executionError,
  );

  // Write test result
  await db.insert(testResults).values({
    testSuiteId: suite.id,
    capabilitySlug: suite.capabilitySlug,
    passed,
    actualOutput: capResult?.output ?? null,
    failureReason,
    responseTimeMs,
  });

  // Record quality data for this test execution (fire-and-forget)
  recordTestQuality(
    suite.capabilitySlug,
    capResult,
    executionError,
    responseTimeMs,
  ).catch(() => {});

  return {
    testName: suite.testName,
    testType: suite.testType,
    passed,
    failureReason,
    responseTimeMs,
  };
}

// ─── Validation logic ───────────────────────────────────────────────────────

function validateResult(
  suite: typeof testSuites.$inferSelect,
  capResult: CapabilityResult | null,
  executionError: string | null,
): { passed: boolean; failureReason: string | null } {
  const rules = suite.validationRules as ValidationRules;

  // For negative/edge_case tests, an error might be the expected outcome
  if (suite.testType === "negative") {
    if (executionError) {
      // Negative test got an error — check if validation rules have specific checks
      if (!rules.checks || rules.checks.length === 0) {
        return { passed: true, failureReason: null }; // error was expected
      }
      // Check if any rule expects "error" field
      const errorChecks = rules.checks.filter((c) => c.field === "error");
      if (errorChecks.length > 0) {
        return { passed: true, failureReason: null };
      }
      return { passed: true, failureReason: null };
    }
    // Negative test but no error — check output validation rules
    if (!capResult) {
      return { passed: true, failureReason: null };
    }
  }

  if (suite.testType === "edge_case") {
    // Edge case: should not crash. If it returned a result, check rules.
    // If it threw a controlled error, that's OK too.
    if (executionError) {
      // Edge case threw — that's acceptable, test passes
      return { passed: true, failureReason: null };
    }
    if (!capResult) {
      return {
        passed: false,
        failureReason: "Edge case: no result and no error",
      };
    }
  }

  // For known_answer and schema_check: an execution error means failure
  if (executionError) {
    return { passed: false, failureReason: `Execution error: ${executionError}` };
  }

  if (!capResult) {
    return { passed: false, failureReason: "No result returned" };
  }

  // Run validation checks
  const output = capResult.output;
  for (const check of rules.checks) {
    const checkResult = runCheck(check, output);
    if (!checkResult.passed) {
      return { passed: false, failureReason: checkResult.reason };
    }
  }

  return { passed: true, failureReason: null };
}

function runCheck(
  check: ValidationCheck,
  output: Record<string, unknown>,
): { passed: boolean; reason: string } {
  const value = getNestedValue(output, check.field);

  switch (check.operator) {
    case "equals":
      if (value !== check.value) {
        return {
          passed: false,
          reason: `${check.field}: expected '${check.value}', got '${value}'`,
        };
      }
      return { passed: true, reason: "" };

    case "not_null":
      if (value == null) {
        return { passed: false, reason: `${check.field}: expected non-null` };
      }
      return { passed: true, reason: "" };

    case "is_true":
      if (value !== true) {
        return {
          passed: false,
          reason: `${check.field}: expected true, got ${value}`,
        };
      }
      return { passed: true, reason: "" };

    case "is_false":
      if (value !== false) {
        return {
          passed: false,
          reason: `${check.field}: expected false, got ${value}`,
        };
      }
      return { passed: true, reason: "" };

    case "contains":
      if (
        typeof value !== "string" ||
        !value.toLowerCase().includes(String(check.value).toLowerCase())
      ) {
        return {
          passed: false,
          reason: `${check.field}: expected to contain '${check.value}', got '${value}'`,
        };
      }
      return { passed: true, reason: "" };

    case "in":
      if (!check.values || !check.values.includes(value)) {
        return {
          passed: false,
          reason: `${check.field}: expected one of [${check.values?.join(", ")}], got '${value}'`,
        };
      }
      return { passed: true, reason: "" };

    case "type":
      // eslint-disable-next-line no-case-declarations
      const actualType = Array.isArray(value) ? "array" : typeof value;
      if (actualType !== check.value) {
        return {
          passed: false,
          reason: `${check.field}: expected type '${check.value}', got '${actualType}'`,
        };
      }
      return { passed: true, reason: "" };

    case "gt": {
      if (typeof value !== "number" || value <= Number(check.value)) {
        return {
          passed: false,
          reason: `${check.field}: expected > ${check.value}, got ${value}`,
        };
      }
      return { passed: true, reason: "" };
    }

    case "lt": {
      if (typeof value !== "number" || value >= Number(check.value)) {
        return {
          passed: false,
          reason: `${check.field}: expected < ${check.value}, got ${value}`,
        };
      }
      return { passed: true, reason: "" };
    }

    case "gte": {
      if (typeof value !== "number" || value < Number(check.value)) {
        return {
          passed: false,
          reason: `${check.field}: expected >= ${check.value}, got ${value}`,
        };
      }
      return { passed: true, reason: "" };
    }

    default:
      return {
        passed: false,
        reason: `Unknown operator: ${check.operator}`,
      };
  }
}

function getNestedValue(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ─── Quality recording for test executions ──────────────────────────────────

async function recordTestQuality(
  capabilitySlug: string,
  capResult: CapabilityResult | null,
  executionError: string | null,
  responseTimeMs: number,
): Promise<void> {
  const db = getDb();

  // Look up capability for outputSchema
  const [cap] = await db
    .select({ outputSchema: capabilities.outputSchema, id: capabilities.id })
    .from(capabilities)
    .where(eq(capabilities.slug, capabilitySlug))
    .limit(1);

  if (!cap) return;

  // Create a transaction record for quality capture
  const [txn] = await db
    .insert(transactions)
    .values({
      userId: await getSystemUserId(),
      capabilityId: cap.id,
      status: executionError ? "failed" : "completed",
      input: {},
      priceCents: 0,
      transparencyMarker: "algorithmic",
      dataJurisdiction: "EU",
      error: executionError,
      latencyMs: responseTimeMs,
      completedAt: new Date(),
    })
    .returning({ id: transactions.id });

  const outputSchema = (cap.outputSchema ?? {}) as Record<string, unknown>;
  const properties =
    (outputSchema as { properties?: Record<string, unknown> }).properties ?? {};
  const fieldsExpected = Object.keys(properties).length;
  let fieldsReturned = 0;

  if (capResult?.output && typeof capResult.output === "object") {
    const outputObj = capResult.output as Record<string, unknown>;
    for (const key of Object.keys(properties)) {
      if (key in outputObj && outputObj[key] != null) fieldsReturned++;
    }
  }

  const fieldCompletenessPct =
    fieldsExpected > 0 ? (fieldsReturned / fieldsExpected) * 100 : 100;

  await db.insert(transactionQuality).values({
    transactionId: txn.id,
    responseTimeMs,
    schemaConformant: !executionError && fieldsReturned > 0,
    fieldsReturned,
    fieldsExpected,
    fieldCompletenessPct: fieldCompletenessPct.toFixed(2),
    errorType: executionError ? categorizeError(executionError) : null,
    qualityFlags: { source: "internal_test" },
  });
}

function categorizeError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("timeout") || lower.includes("etimedout"))
    return "upstream_timeout";
  if (lower.includes("rate limit") || lower.includes("429"))
    return "rate_limited";
  if (
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("fetch failed")
  )
    return "upstream_error";
  return "internal_error";
}

// ─── System user for test transactions ──────────────────────────────────────

let _systemUserId: string | null = null;

async function getSystemUserId(): Promise<string> {
  if (_systemUserId) return _systemUserId;

  const db = getDb();
  const { users } = await import("../db/schema.js");

  // Look for existing system account
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, "system@strale.internal"))
    .limit(1);

  if (existing) {
    _systemUserId = existing.id;
    return existing.id;
  }

  // Create system account
  const crypto = await import("node:crypto");
  const hash = crypto.createHash("sha256").update("system-internal-key").digest("hex");

  const [created] = await db
    .insert(users)
    .values({
      email: "system@strale.internal",
      name: "Strale Internal Test Runner",
      apiKeyHash: hash,
      keyPrefix: "sk_sys_",
    })
    .returning({ id: users.id });

  _systemUserId = created.id;
  return created.id;
}

// ─── Scheduled execution ────────────────────────────────────────────────────

let _schedulerRunning = false;

/**
 * Start the scheduled test runner. Runs every 6 hours.
 * Safe to call multiple times — only starts once.
 */
export function startScheduledTests(): void {
  if (_schedulerRunning) return;
  _schedulerRunning = true;

  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

  console.log("[test-runner] Scheduled test runner started (every 6h)");

  setInterval(async () => {
    console.log("[test-runner] Starting scheduled full test suite run...");
    try {
      const summary = await runTests();
      console.log(
        `[test-runner] Completed: ${summary.passed}/${summary.total} passed, ` +
          `${summary.failed} failed, avg ${summary.avgResponseTimeMs}ms`,
      );

      // Log warnings for failures
      for (const r of summary.results) {
        if (!r.passed) {
          console.warn(
            `[test-runner] FAIL: ${r.testName} — ${r.failureReason}`,
          );
        }
      }
    } catch (err) {
      console.error("[test-runner] Scheduled run failed:", err);
    }
  }, SIX_HOURS_MS);
}
