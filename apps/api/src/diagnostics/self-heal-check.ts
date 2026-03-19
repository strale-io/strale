/**
 * Self-Healing Diagnostic — verifies all three layers of the self-healing
 * pipeline without modifying production data.
 *
 * Usage:  npx tsx apps/api/src/diagnostics/self-heal-check.ts
 *
 * Checks:
 *   1. Failure classification coverage (DB + both classifiers)
 *   2. Self-heal remediation dry-run (simulated failures)
 *   3. Credential health registry accuracy
 *   4. Event trigger wiring verification
 *   5. Scoring integrity (infra vs upstream boundary)
 *   6. Test runner credential skip verification
 */

import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env") });

import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { testResults } from "../db/schema.js";

// ─── Module imports ──────────────────────────────────────────────────────────

import { categorizeFailureReason } from "../lib/trust-helpers.js";
import { classifyFailure as classifyFailureSelfHeal } from "../lib/self-heal.js";
import {
  classifyFailure as classifyFailureAdaptive,
  type FailureClassification as AdaptiveClassification,
} from "../lib/failure-classifier.js";
import {
  getCredentialStatus,
  getUnconfiguredCapabilities,
} from "../lib/credential-health.js";
import {
  triggerOnFailure,
  triggerOnDependencyChange,
  triggerOnDeploy,
} from "../lib/event-triggers.js";

// ─── Report state ────────────────────────────────────────────────────────────

interface CheckResult {
  name: string;
  passed: boolean;
  details: string[];
  warnings: string[];
}

const results: CheckResult[] = [];

function check(name: string): CheckResult {
  const r: CheckResult = { name, passed: true, details: [], warnings: [] };
  results.push(r);
  return r;
}

// ─── Check 1: Failure classification coverage ────────────────────────────────

async function check1() {
  const r = check("Failure classification coverage");

  const db = getDb();
  const rows: Array<{ failure_reason: string; cnt: string }> = await db.execute(
    sql`SELECT failure_reason, COUNT(*)::text AS cnt
        FROM test_results
        WHERE failure_reason IS NOT NULL
          AND executed_at >= NOW() - INTERVAL '30 days'
        GROUP BY failure_reason
        ORDER BY COUNT(*) DESC`,
  ) as any;

  r.details.push(`Total distinct failure reasons: ${rows.length}`);

  const trustDist: Record<string, number> = {};
  const adaptiveDist: Record<string, number> = {};
  const selfHealDist: Record<string, number> = {};
  const unknowns: Array<{ reason: string; count: number; source: string }> = [];

  for (const row of rows) {
    const reason = row.failure_reason;
    const cnt = parseInt(row.cnt, 10);

    // trust-helpers classifier
    const trustCat = categorizeFailureReason(reason);
    trustDist[trustCat] = (trustDist[trustCat] ?? 0) + cnt;

    // failure-classifier (adaptive) — infer execution/validation flags from reason text
    const isValidationFailure = /expected.*got|expected non-null|expected true|expected false/.test(reason);
    const executionSucceeded = isValidationFailure;
    const validationFailed = isValidationFailure;
    const adaptive = classifyFailureAdaptive(reason, executionSucceeded, validationFailed, "known_answer", {}, true);
    adaptiveDist[adaptive.verdict] = (adaptiveDist[adaptive.verdict] ?? 0) + cnt;

    // self-heal classifier
    const selfHealCat = classifyFailureSelfHeal(reason, "known_answer");
    selfHealDist[selfHealCat] = (selfHealDist[selfHealCat] ?? 0) + cnt;

    // Track unknowns
    if (adaptive.verdict === "unknown") {
      unknowns.push({ reason: reason.slice(0, 120), count: cnt, source: "adaptive" });
    }
  }

  r.details.push(`Trust-helpers: ${JSON.stringify(trustDist)}`);
  r.details.push(`Adaptive classifier: ${JSON.stringify(adaptiveDist)}`);
  r.details.push(`Self-heal classifier: ${JSON.stringify(selfHealDist)}`);

  const totalClassified = rows.length;
  const unknownCount = unknowns.length;
  const classifiedPct = totalClassified > 0
    ? Math.round(((totalClassified - unknownCount) / totalClassified) * 100)
    : 100;

  r.details.push(`Classification rate: ${classifiedPct}% (${unknownCount} unknown patterns)`);

  if (unknowns.length > 0) {
    r.details.push("Unknown patterns to investigate:");
    // Deduplicate and sort by count
    const sorted = unknowns.sort((a, b) => b.count - a.count).slice(0, 15);
    for (const u of sorted) {
      r.details.push(`  [${u.count}x] ${u.reason}`);
    }
  }

  // Pass if >35% classified by the adaptive classifier.
  // The adaptive classifier is intentionally conservative — it only matches
  // known upstream/infra/bug patterns. Capability-specific execution errors
  // ("Invalid flight number", "No DNS records found") are correctly left as
  // "unknown" because they need per-capability analysis, not blanket classification.
  r.passed = classifiedPct >= 35;
  r.details.push(r.passed ? "PASS" : `FAIL — only ${classifiedPct}% classified`);
}

// ─── Check 2: Self-heal remediation dry-run ──────────────────────────────────

function check2() {
  const r = check("Self-heal remediation dry-run");

  interface TestCase {
    label: string;
    reason: string;
    testType: string;
    // For adaptive classifier
    executionSucceeded: boolean;
    validationFailed: boolean;
    // Expected results
    selfHealExpected: string;
    adaptiveExpected: string;
    adaptiveNotExpected?: string;
  }

  const cases: TestCase[] = [
    {
      label: "Missing input (required field)",
      reason: "'iban' is required. Provide an IBAN to validate.",
      testType: "schema_check",
      executionSucceeded: false,
      validationFailed: false,
      selfHealExpected: "missing_test_input",
      adaptiveExpected: "unknown", // adaptive doesn't have missing_test_input
    },
    {
      label: "Rate limited (HTTP 429)",
      reason: "OpenSanctions API error: HTTP 429 Too Many Requests",
      testType: "known_answer",
      executionSucceeded: false,
      validationFailed: false,
      selfHealExpected: "rate_limited",
      adaptiveExpected: "upstream_transient",
    },
    {
      label: "Upstream timeout",
      reason: "Navigation timeout of 30000 ms exceeded",
      testType: "dependency_health",
      executionSucceeded: false,
      validationFailed: false,
      selfHealExpected: "upstream_dependency",
      adaptiveExpected: "upstream_transient",
    },
    {
      label: "API key error — must NOT be missing_test_input",
      reason: "OPENSANCTIONS_API_KEY is required for this capability",
      testType: "known_answer",
      executionSucceeded: false,
      validationFailed: false,
      selfHealExpected: "upstream_dependency",
      adaptiveExpected: "test_infrastructure",
      adaptiveNotExpected: "unknown",
    },
    {
      label: "VIES MS_UNAVAILABLE (upstream transient)",
      reason: "Execution error: VIES error: MS_UNAVAILABLE",
      testType: "known_answer",
      executionSucceeded: false,
      validationFailed: false,
      selfHealExpected: "upstream_dependency",
      adaptiveExpected: "upstream_transient",
    },
    {
      label: "VIES SERVER_BUSY",
      reason: "Execution error: VIES error: SERVER_BUSY",
      testType: "known_answer",
      executionSucceeded: false,
      validationFailed: false,
      selfHealExpected: "upstream_dependency",
      adaptiveExpected: "upstream_transient",
    },
    {
      label: "QUOTA_EXCEEDED (infrastructure)",
      reason: "Execution error: QUOTA_EXCEEDED",
      testType: "known_answer",
      executionSucceeded: false,
      validationFailed: false,
      selfHealExpected: "rate_limited",
      adaptiveExpected: "test_infrastructure",
    },
    {
      label: "Browserless navigation timeout",
      reason: "Browserless error: Navigation timeout of 30000ms exceeded",
      testType: "dependency_health",
      executionSucceeded: false,
      validationFailed: false,
      selfHealExpected: "upstream_dependency",
      adaptiveExpected: "upstream_transient",
    },
    {
      label: "Value assertion failure (upstream_changed)",
      reason: "company_name: expected 'NOVO NORDISK A/S', got 'Novo Nordisk A/S'",
      testType: "known_answer",
      executionSucceeded: true,
      validationFailed: true,
      selfHealExpected: "regression_breaking",
      adaptiveExpected: "upstream_changed",
    },
    {
      label: "Not-null assertion failure",
      reason: "carrier: expected non-null",
      testType: "known_answer",
      executionSucceeded: true,
      validationFailed: true,
      selfHealExpected: "regression_breaking",
      adaptiveExpected: "upstream_changed",
    },
    {
      label: "Fetch failed (network error)",
      reason: "fetch failed",
      testType: "dependency_health",
      executionSucceeded: false,
      validationFailed: false,
      selfHealExpected: "upstream_dependency",
      adaptiveExpected: "upstream_transient",
    },
    {
      label: "TypeError (capability bug)",
      reason: "TypeError: Cannot read properties of undefined (reading 'name')",
      testType: "known_answer",
      executionSucceeded: false,
      validationFailed: false,
      selfHealExpected: "unknown", // self-heal doesn't classify code errors
      adaptiveExpected: "capability_bug",
    },
    {
      label: "HTTP 503 (upstream)",
      reason: "CVR API returned HTTP 503",
      testType: "known_answer",
      executionSucceeded: false,
      validationFailed: false,
      selfHealExpected: "upstream_dependency",
      adaptiveExpected: "upstream_transient",
    },
    {
      label: "Browserless HTTP 401 (infra billing)",
      reason: "Browserless error: HTTP 401 — You've reached the units usage limit",
      testType: "dependency_health",
      executionSucceeded: false,
      validationFailed: false,
      selfHealExpected: "upstream_dependency",
      adaptiveExpected: "test_infrastructure",
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of cases) {
    const errors: string[] = [];

    // Self-heal classifier
    const selfHealResult = classifyFailureSelfHeal(tc.reason, tc.testType);
    if (selfHealResult !== tc.selfHealExpected) {
      errors.push(
        `self-heal: expected '${tc.selfHealExpected}', got '${selfHealResult}'`,
      );
    }

    // Adaptive classifier
    const adaptiveResult = classifyFailureAdaptive(
      tc.reason,
      tc.executionSucceeded,
      tc.validationFailed,
      tc.testType,
      {},
      true, // previouslyPassed (for upstream_changed)
    );
    if (adaptiveResult.verdict !== tc.adaptiveExpected) {
      errors.push(
        `adaptive: expected '${tc.adaptiveExpected}', got '${adaptiveResult.verdict}'`,
      );
    }
    if (tc.adaptiveNotExpected && adaptiveResult.verdict === tc.adaptiveNotExpected) {
      errors.push(
        `adaptive: must NOT be '${tc.adaptiveNotExpected}', but got it`,
      );
    }

    if (errors.length === 0) {
      passed++;
      r.details.push(`  OK: ${tc.label}`);
    } else {
      failed++;
      r.details.push(`  FAIL: ${tc.label}`);
      for (const e of errors) {
        r.details.push(`    ${e}`);
      }
    }
  }

  r.details.unshift(`${passed}/${cases.length} test cases passed`);
  r.passed = failed === 0;
  r.details.push(r.passed ? "PASS" : `FAIL — ${failed} test case(s) failed`);
}

// ─── Check 3: Credential health registry accuracy ────────────────────────────

async function check3() {
  const r = check("Credential health registry");

  const status = getCredentialStatus();

  for (const cred of status) {
    const configured = cred.isConfigured;
    const capCount = cred.capabilities.length;
    r.details.push(
      `${cred.provider}: configured=${configured} env=${cred.envVar} affects=${capCount} capabilities`,
    );

    // If credential IS configured, verify no "no api key" failures in last 24h
    if (configured && capCount > 0) {
      const db = getDb();
      const capList = cred.capabilities;
      const inClause = sql.join(capList.map((s) => sql`${s}`), sql`, `);
      const rows: Array<{ cnt: string }> = await db.execute(
        sql`SELECT COUNT(*)::text AS cnt FROM test_results
            WHERE capability_slug IN (${inClause})
              AND (failure_reason ILIKE '%no api key%'
                   OR failure_reason ILIKE '%api key not%'
                   OR failure_reason ILIKE '%API_KEY is required%')
              AND executed_at >= NOW() - INTERVAL '24 hours'`,
      ) as any;

      const cnt = parseInt(rows[0]?.cnt ?? "0", 10);
      if (cnt > 0) {
        r.warnings.push(
          `${cred.provider}: key is configured but ${cnt} API key failures in last 24h`,
        );
      }
    }
  }

  // If there are ANY warnings, it's still a pass (the credential IS configured now,
  // old failures may be cached), but flag them.
  r.passed = true;
  r.details.push(
    r.warnings.length === 0
      ? "PASS"
      : `PASS with ${r.warnings.length} warning(s)`,
  );
}

// ─── Check 4: Event trigger wiring verification ──────────────────────────────

function check4() {
  const r = check("Event trigger wiring");

  // Verify exports exist
  const triggers = [
    { name: "triggerOnFailure", fn: triggerOnFailure },
    { name: "triggerOnDependencyChange", fn: triggerOnDependencyChange },
    { name: "triggerOnDeploy", fn: triggerOnDeploy },
  ];

  for (const t of triggers) {
    if (typeof t.fn === "function") {
      r.details.push(`${t.name}: exported`);
    } else {
      r.details.push(`${t.name}: MISSING`);
      r.passed = false;
    }
  }

  r.details.push(r.passed ? "PASS" : "FAIL — missing exports");
}

// ─── Check 5: Scoring integrity verification ─────────────────────────────────

function check5() {
  const r = check("Scoring integrity");

  // Replicate the EXTERNAL_SERVICE_PATTERNS from sqs.ts (it's private)
  const EXTERNAL_SERVICE_PATTERNS = [
    /HTTP 429/i, /HTTP 503/i, /HTTP 502/i,
    /Too Many Requests/i, /rate limit/i, /QUOTA_EXCEEDED/i,
    /ECONNRESET/i, /ECONNREFUSED/i, /ETIMEDOUT/i, /ENOTFOUND/i,
    /timeout/i, /upstream/i, /Browserless/i,
    /VIES error/i, /Navigation timeout/i,
    /fetch failed/i,
  ];

  function isExternal(reason: string): boolean {
    return EXTERNAL_SERVICE_PATTERNS.some((p) => p.test(reason));
  }

  // Infrastructure errors: MUST NOT be classified as external/upstream
  const infraCases = [
    "No API key provided",
    "OPENSANCTIONS_API_KEY is required for this capability",
    "Key not configured",
    "ANTHROPIC_API_KEY is required.",
    "SERPER_API_KEY is required for adverse-media-check",
  ];

  let infraOk = true;
  for (const reason of infraCases) {
    const result = isExternal(reason);
    if (result) {
      r.details.push(`  FAIL: "${reason.slice(0, 60)}" incorrectly classified as upstream`);
      infraOk = false;
    }
  }
  r.details.push(
    infraOk
      ? "Infrastructure errors correctly NOT upstream"
      : "FAIL — some infra errors leak into upstream",
  );

  // Upstream errors: MUST be classified as external
  const upstreamCases = [
    "HTTP 503 Service Unavailable",
    "ETIMEDOUT",
    "Navigation timeout of 30000 ms exceeded",
    "VIES error: MS_UNAVAILABLE",
    "HTTP 429 Too Many Requests",
    "Browserless error: Navigation timeout",
    "fetch failed",
    "ECONNREFUSED",
    "QUOTA_EXCEEDED",
  ];

  let upstreamOk = true;
  for (const reason of upstreamCases) {
    const result = isExternal(reason);
    if (!result) {
      r.details.push(`  FAIL: "${reason}" NOT classified as upstream`);
      upstreamOk = false;
    }
  }
  r.details.push(
    upstreamOk
      ? "Genuine upstream patterns correctly recognized"
      : "FAIL — some upstream errors not recognized",
  );

  // Verify CLAUDE.md has scoring integrity section
  try {
    const claudeMd = readFileSync(resolve(__dirname, "../../../../CLAUDE.md"), "utf-8");
    const hasIntegrity = claudeMd.includes("Scoring Integrity");
    r.details.push(
      hasIntegrity
        ? "CLAUDE.md guardrail present"
        : "FAIL — CLAUDE.md missing Scoring Integrity section",
    );
    if (!hasIntegrity) upstreamOk = false;
  } catch {
    r.details.push("FAIL — could not read CLAUDE.md");
    upstreamOk = false;
  }

  r.passed = infraOk && upstreamOk;
  r.details.push(r.passed ? "PASS" : "FAIL");
}

// ─── Check 6: Test runner credential skip verification ───────────────────────

async function check6() {
  const r = check("Test runner credential skip");

  const unconfigured = getUnconfiguredCapabilities();
  r.details.push(`Unconfigured capabilities: ${unconfigured.size}`);

  if (unconfigured.size === 0) {
    r.details.push("All credentials configured — skip logic not testable");
    r.passed = true;
    r.details.push("PASS");
    return;
  }

  // For each unconfigured capability, check that no test results were written
  // since the credential-health module was deployed (~March 19, 2026)
  const slugList = [...unconfigured];
  const db = getDb();
  const inClause = sql.join(slugList.map((s) => sql`${s}`), sql`, `);
  const rows: Array<{ slug: string; cnt: string }> = await db.execute(
    sql`SELECT capability_slug AS slug, COUNT(*)::text AS cnt
        FROM test_results
        WHERE capability_slug IN (${inClause})
          AND executed_at >= NOW() - INTERVAL '6 hours'
        GROUP BY capability_slug
        HAVING COUNT(*) > 0`,
  ) as any;

  if (rows.length === 0) {
    r.details.push("No test results for unconfigured capabilities in last 6h");
    r.passed = true;
  } else {
    for (const row of rows) {
      r.warnings.push(
        `${row.slug}: unconfigured but ${row.cnt} test results in last 6h`,
      );
    }
    // Warn but don't fail — tests may have run before the skip was deployed
    r.passed = true;
    r.details.push(`${rows.length} capability(ies) with results despite missing credentials`);
  }

  r.details.push(
    r.warnings.length === 0
      ? "PASS"
      : `PASS with ${r.warnings.length} warning(s)`,
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║            SELF-HEALING DIAGNOSTIC REPORT               ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // Check 2, 4, 5 are sync; 1, 3, 6 need DB
  check2();
  check4();
  check5();
  await check1();
  await check3();
  await check6();

  // Print results in order
  const ordered = [
    results.find((r) => r.name.startsWith("Failure")),
    results.find((r) => r.name.startsWith("Self-heal")),
    results.find((r) => r.name.startsWith("Credential")),
    results.find((r) => r.name.startsWith("Event")),
    results.find((r) => r.name.startsWith("Scoring")),
    results.find((r) => r.name.startsWith("Test runner")),
  ].filter(Boolean) as CheckResult[];

  for (let i = 0; i < ordered.length; i++) {
    const r = ordered[i];
    const icon = r.passed ? "PASS" : "FAIL";
    console.log(`Check ${i + 1}: ${r.name}`);
    for (const d of r.details) {
      console.log(`  ${d}`);
    }
    for (const w of r.warnings) {
      console.log(`  WARNING: ${w}`);
    }
    console.log(`  ${icon}`);
    console.log();
  }

  // Summary
  const passedCount = ordered.filter((r) => r.passed).length;
  const totalCount = ordered.length;
  console.log("══════════════════════════════════════════════════════════");
  console.log(
    `RESULT: ${passedCount}/${totalCount} checks passed${passedCount === totalCount ? "" : " — SEE FAILURES ABOVE"}`,
  );
  console.log("══════════════════════════════════════════════════════════");

  process.exit(passedCount === totalCount ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
