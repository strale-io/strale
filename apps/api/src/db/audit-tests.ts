/**
 * Test Suite Audit: Find structurally broken validation rules.
 *
 * Runs each capability with its test input, compares actual output fields
 * against validation rules, and generates a structured report with auto-fix
 * recommendations.
 *
 * Usage: npx tsx apps/api/src/db/audit-tests.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { testSuites } from "./schema.js";
import { eq } from "drizzle-orm";
import { getExecutor, type CapabilityResult } from "../capabilities/index.js";
import { writeFileSync } from "node:fs";

// ── Register all capability executors (side-effect imports) ─────────────────
import "../capabilities/vat-validate.js";
import "../capabilities/swedish-company-data.js";
import "../capabilities/invoice-extract.js";
import "../capabilities/web-extract.js";
import "../capabilities/annual-report-extract.js";
import "../capabilities/norwegian-company-data.js";
import "../capabilities/danish-company-data.js";
import "../capabilities/finnish-company-data.js";
import "../capabilities/iban-validate.js";
import "../capabilities/pii-redact.js";
import "../capabilities/pdf-extract.js";
import "../capabilities/company-enrich.js";
import "../capabilities/ted-procurement.js";
import "../capabilities/uk-company-data.js";
import "../capabilities/dutch-company-data.js";
import "../capabilities/german-company-data.js";
import "../capabilities/french-company-data.js";
import "../capabilities/belgian-company-data.js";
import "../capabilities/austrian-company-data.js";
import "../capabilities/irish-company-data.js";
import "../capabilities/polish-company-data.js";
import "../capabilities/estonian-company-data.js";
import "../capabilities/latvian-company-data.js";
import "../capabilities/lithuanian-company-data.js";
import "../capabilities/swiss-company-data.js";
import "../capabilities/spanish-company-data.js";
import "../capabilities/italian-company-data.js";
import "../capabilities/portuguese-company-data.js";
import "../capabilities/swift-validate.js";
import "../capabilities/lei-lookup.js";
import "../capabilities/eori-validate.js";
import "../capabilities/email-validate.js";
import "../capabilities/vat-format-validate.js";
import "../capabilities/isbn-validate.js";
import "../capabilities/company-id-detect.js";
import "../capabilities/invoice-validate.js";
import "../capabilities/payment-reference-generate.js";
import "../capabilities/swift-message-parse.js";
import "../capabilities/financial-year-dates.js";
import "../capabilities/sepa-xml-validate.js";
import "../capabilities/us-company-data.js";
import "../capabilities/canadian-company-data.js";
import "../capabilities/australian-company-data.js";
import "../capabilities/indian-company-data.js";
import "../capabilities/singapore-company-data.js";
import "../capabilities/hong-kong-company-data.js";
import "../capabilities/brazilian-company-data.js";
import "../capabilities/japanese-company-data.js";
import "../capabilities/exchange-rate.js";
import "../capabilities/stock-quote.js";
// credit-report-summary deactivated DEC-20260405-B
import "../capabilities/dns-lookup.js";
import "../capabilities/whois-lookup.js";
import "../capabilities/ssl-check.js";
import "../capabilities/tech-stack-detect.js";
import "../capabilities/sanctions-check.js";
import "../capabilities/hs-code-lookup.js";
import "../capabilities/eu-regulation-search.js";
import "../capabilities/translate.js";
import "../capabilities/summarize.js";
import "../capabilities/sentiment-analyze.js";
import "../capabilities/classify-text.js";
import "../capabilities/json-to-csv.js";
import "../capabilities/currency-convert.js";
import "../capabilities/address-parse.js";
import "../capabilities/screenshot-url.js";
import "../capabilities/url-to-markdown.js";
import "../capabilities/url-to-text.js";
import "../capabilities/link-extract.js";
import "../capabilities/structured-scrape.js";
import "../capabilities/google-search.js";
import "../capabilities/meta-extract.js";
import "../capabilities/name-parse.js";
import "../capabilities/phone-normalize.js";
import "../capabilities/date-parse.js";
import "../capabilities/unit-convert.js";
import "../capabilities/csv-clean.js";
import "../capabilities/deduplicate.js";
import "../capabilities/json-repair.js";
import "../capabilities/html-to-pdf.js";
import "../capabilities/markdown-to-html.js";
import "../capabilities/image-to-text.js";
import "../capabilities/image-resize.js";
import "../capabilities/base64-encode-url.js";
import "../capabilities/json-schema-validate.js";
import "../capabilities/url-health-check.js";
import "../capabilities/regex-generate.js";
import "../capabilities/cron-explain.js";
import "../capabilities/diff-json.js";
import "../capabilities/api-health-check.js";
import "../capabilities/landing-page-roast.js";
import "../capabilities/seo-audit.js";
import "../capabilities/competitor-compare.js";
import "../capabilities/pricing-page-extract.js";
import "../capabilities/company-tech-stack.js";
import "../capabilities/blog-post-outline.js";
import "../capabilities/email-draft.js";
import "../capabilities/social-post-generate.js";
import "../capabilities/llm-output-validate.js";
import "../capabilities/prompt-optimize.js";
import "../capabilities/code-review.js";
import "../capabilities/resume-parse.js";
import "../capabilities/contract-extract.js";
import "../capabilities/receipt-categorize.js";
import "../capabilities/meeting-notes-extract.js";
import "../capabilities/timezone-meeting-find.js";
import "../capabilities/startup-domain-check.js";
import "../capabilities/youtube-summarize.js";
import "../capabilities/github-repo-analyze.js";
import "../capabilities/job-posting-analyze.js";
import "../capabilities/brand-mention-search.js";
import "../capabilities/accessibility-audit.js";
import "../capabilities/changelog-generate.js";
import "../capabilities/api-docs-generate.js";
import "../capabilities/dependency-audit.js";
import "../capabilities/agent-trace-analyze.js";
import "../capabilities/token-count.js";
import "../capabilities/tool-call-validate.js";
import "../capabilities/llm-cost-calculate.js";
import "../capabilities/prompt-compress.js";
import "../capabilities/context-window-optimize.js";
import "../capabilities/schema-infer.js";
import "../capabilities/data-quality-check.js";
import "../capabilities/csv-to-json.js";
import "../capabilities/xml-to-json.js";
import "../capabilities/flatten-json.js";
import "../capabilities/fake-data-generate.js";
import "../capabilities/api-mock-response.js";
import "../capabilities/test-case-generate.js";
import "../capabilities/secret-scan.js";
import "../capabilities/header-security-check.js";
import "../capabilities/password-strength.js";
import "../capabilities/cve-lookup.js";
import "../capabilities/dockerfile-generate.js";
import "../capabilities/gitignore-generate.js";
import "../capabilities/env-template-generate.js";
import "../capabilities/nginx-config-generate.js";
import "../capabilities/github-actions-generate.js";
import "../capabilities/sql-generate.js";
import "../capabilities/sql-explain.js";
import "../capabilities/sql-optimize.js";
import "../capabilities/schema-migration-generate.js";
import "../capabilities/openapi-validate.js";
import "../capabilities/openapi-generate.js";
import "../capabilities/http-to-curl.js";
import "../capabilities/curl-to-code.js";
import "../capabilities/jwt-decode.js";
import "../capabilities/webhook-test-payload.js";
import "../capabilities/json-to-typescript.js";
import "../capabilities/json-to-zod.js";
import "../capabilities/json-to-pydantic.js";
import "../capabilities/regex-explain.js";
import "../capabilities/code-convert.js";
import "../capabilities/commit-message-generate.js";
import "../capabilities/pr-description-generate.js";
import "../capabilities/release-notes-generate.js";
import "../capabilities/readme-generate.js";
import "../capabilities/jsdoc-generate.js";
import "../capabilities/docstring-generate.js";
import "../capabilities/log-parse.js";
import "../capabilities/error-explain.js";
import "../capabilities/uptime-check.js";
import "../capabilities/crontab-generate.js";
import "../capabilities/uk-companies-house-officers.js";
import "../capabilities/eu-trademark-search.js";
import "../capabilities/patent-search.js";
import "../capabilities/charity-lookup-uk.js";
import "../capabilities/food-safety-rating-uk.js";
import "../capabilities/weather-lookup.js";
import "../capabilities/ip-geolocation.js";
import "../capabilities/shipping-track.js";
import "../capabilities/flight-status.js";
import "../capabilities/crypto-price.js";
import "../capabilities/port-check.js";
import "../capabilities/mx-lookup.js";
import "../capabilities/redirect-trace.js";
import "../capabilities/robots-txt-parse.js";
import "../capabilities/sitemap-parse.js";
import "../capabilities/github-user-profile.js";
import "../capabilities/npm-package-info.js";
import "../capabilities/pypi-package-info.js";
import "../capabilities/docker-hub-info.js";
import "../capabilities/github-repo-compare.js";
import "../capabilities/gdpr-website-check.js";
import "../capabilities/ssl-certificate-chain.js";
import "../capabilities/domain-reputation.js";
import "../capabilities/barcode-lookup.js";
import "../capabilities/amazon-price.js";
import "../capabilities/bank-bic-lookup.js";
import "../capabilities/ecb-interest-rates.js";
import "../capabilities/country-tax-rates.js";
import "../capabilities/ticker-lookup.js";
import "../capabilities/forex-history.js";
import "../capabilities/eu-court-case-search.js";
import "../capabilities/gdpr-fine-lookup.js";
import "../capabilities/eu-ai-act-classify.js";
import "../capabilities/data-protection-authority-lookup.js";
import "../capabilities/cookie-scan.js";
import "../capabilities/terms-of-service-extract.js";
import "../capabilities/privacy-policy-analyze.js";
import "../capabilities/business-license-check-se.js";
import "../capabilities/customs-duty-lookup.js";
import "../capabilities/incoterms-explain.js";
import "../capabilities/container-track.js";
import "../capabilities/port-lookup.js";
import "../capabilities/country-trade-data.js";
import "../capabilities/iso-country-lookup.js";
import "../capabilities/dangerous-goods-classify.js";
import "../capabilities/salary-benchmark.js";
import "../capabilities/job-board-search.js";
import "../capabilities/skill-extract.js";
import "../capabilities/skill-gap-analyze.js";
import "../capabilities/linkedin-url-validate.js";
import "../capabilities/work-permit-requirements.js";
import "../capabilities/employer-review-summary.js";
import "../capabilities/public-holiday-lookup.js";
import "../capabilities/employment-cost-estimate.js";
import "../capabilities/product-search.js";
import "../capabilities/price-compare.js";
import "../capabilities/product-reviews-extract.js";
import "../capabilities/trustpilot-score.js";
import "../capabilities/vat-rate-lookup.js";
import "../capabilities/shipping-cost-estimate.js";
import "../capabilities/marketplace-fee-calculate.js";
import "../capabilities/return-policy-extract.js";
import "../capabilities/keyword-suggest.js";
import "../capabilities/serp-analyze.js";
import "../capabilities/backlink-check.js";
import "../capabilities/page-speed-test.js";
import "../capabilities/social-profile-check.js";
import "../capabilities/og-image-check.js";
import "../capabilities/email-deliverability-check.js";
import "../capabilities/website-carbon-estimate.js";

// ── Types ───────────────────────────────────────────────────────────────────

interface ValidationCheck {
  field: string;
  operator: string;
  value?: unknown;
  values?: unknown[];
}

interface ValidationRules {
  checks: ValidationCheck[];
}

interface StructuralIssue {
  slug: string;
  testName: string;
  testType: string;
  check: ValidationCheck;
  issue: string;
  actualOutputKeys: string[];
  recommendation: string;
}

interface TypeMismatch {
  slug: string;
  testName: string;
  check: ValidationCheck;
  issue: string;
}

interface ClassificationIssue {
  slug: string;
  testName: string;
  testType: string;
  checks: ValidationCheck[];
  issue: string;
}

interface AuditFix {
  capabilitySlug: string;
  testName: string;
  currentCheck: { field: string; operator: string; value?: unknown };
  proposedCheck: { field: string; operator: string; value?: unknown } | null;
  reason: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function extractAllKeys(obj: unknown, prefix = ""): string[] {
  if (!obj || typeof obj !== "object") return [];
  if (Array.isArray(obj)) return prefix ? [prefix] : [];
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    keys.push(fullKey);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...extractAllKeys(value, fullKey));
    }
  }
  return keys;
}

function findBestAlternativeField(
  outputKeys: string[],
  check: ValidationCheck,
): string | null {
  // Try to find a field that semantically matches
  const fieldName = check.field.split(".").pop() ?? check.field;

  // Direct substring match
  for (const key of outputKeys) {
    const keyPart = key.split(".").pop() ?? key;
    if (keyPart.includes(fieldName) || fieldName.includes(keyPart)) {
      return key;
    }
  }
  return null;
}

async function executeWithTimeout(
  executor: (input: Record<string, unknown>) => Promise<CapabilityResult>,
  input: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ result: CapabilityResult | null; error: string | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ result: null, error: null, timedOut: true });
    }, timeoutMs);

    executor(input)
      .then((result) => {
        clearTimeout(timer);
        resolve({ result, error: null, timedOut: false });
      })
      .catch((err) => {
        clearTimeout(timer);
        resolve({
          result: null,
          error: err instanceof Error ? err.message : String(err),
          timedOut: false,
        });
      });
  });
}

// ── Main audit ──────────────────────────────────────────────────────────────

async function main() {
  const db = getDb();

  // Load all active test suites
  const suites = await db
    .select()
    .from(testSuites)
    .where(eq(testSuites.active, true));

  console.log(`Loaded ${suites.length} active test suites`);

  const structuralIssues: StructuralIssue[] = [];
  const typeMismatches: TypeMismatch[] = [];
  const classificationIssues: ClassificationIssue[] = [];
  const fixes: AuditFix[] = [];

  let passingTests = 0;
  let failingTests = 0;
  let skippedTests = 0;
  let timedOutTests = 0;
  let noExecutorTests = 0;
  let erroredTests = 0;

  // Group by slug for progress tracking
  const slugMap = new Map<string, typeof suites>();
  for (const suite of suites) {
    if (!slugMap.has(suite.capabilitySlug)) slugMap.set(suite.capabilitySlug, []);
    slugMap.get(suite.capabilitySlug)!.push(suite);
  }

  // Cache execution results per slug+input to avoid re-running same capability
  const resultCache = new Map<string, { result: CapabilityResult | null; error: string | null }>();

  let processedSlugs = 0;
  const totalSlugs = slugMap.size;

  for (const [slug, suitesForSlug] of slugMap) {
    processedSlugs++;
    process.stdout.write(`[${processedSlugs}/${totalSlugs}] ${slug}...`);

    for (const suite of suitesForSlug) {
      const rules = suite.validationRules as ValidationRules;
      const hasChecks = rules.checks && rules.checks.length > 0;

      // ── Classification checks (all tests, even without execution) ─────
      if (suite.testType === "known_answer" && hasChecks) {
        const allNotNull = rules.checks.every((c) => c.operator === "not_null");
        if (allNotNull) {
          classificationIssues.push({
            slug: suite.capabilitySlug,
            testName: suite.testName,
            testType: suite.testType,
            checks: rules.checks,
            issue:
              "known_answer test should verify a specific known value, not just field presence",
          });
        }
      }

      if (suite.testType === "schema_check" && hasChecks) {
        const hasValueCheck = rules.checks.some(
          (c) =>
            c.operator === "equals" ||
            c.operator === "is_true" ||
            c.operator === "is_false" ||
            c.operator === "contains",
        );
        if (hasValueCheck) {
          classificationIssues.push({
            slug: suite.capabilitySlug,
            testName: suite.testName,
            testType: suite.testType,
            checks: rules.checks,
            issue:
              "schema_check test verifies specific values — should be classified as known_answer",
          });
        }
      }

      // For tests with no checks, nothing to structurally validate
      if (!hasChecks) {
        // schema_check tests run dry (no execution needed)
        if (suite.testType === "schema_check") {
          skippedTests++;
          continue;
        }
        // negative/edge_case/dependency_health with empty checks are valid
        skippedTests++;
        continue;
      }

      // schema_check tests don't execute the capability — they just check schemas
      // So we can't validate output fields for them unless we execute
      // But we should still check them since their checks reference output fields
      if (suite.testType === "schema_check") {
        // These run dry in the real test runner but we want to verify field names
        // We'll execute them to get actual output for comparison
      }

      // ── Execute capability ────────────────────────────────────────────
      const cacheKey = `${slug}::${JSON.stringify(suite.input)}`;
      let cached = resultCache.get(cacheKey);

      if (!cached) {
        const executor = getExecutor(slug);
        if (!executor) {
          noExecutorTests++;
          continue;
        }

        const { result, error, timedOut } = await executeWithTimeout(
          executor,
          suite.input as Record<string, unknown>,
          30_000,
        );

        if (timedOut) {
          timedOutTests++;
          process.stdout.write(" timeout");
          // Can't validate without output
          continue;
        }

        cached = { result, error };
        resultCache.set(cacheKey, cached);
      }

      // ── For negative tests, we expect errors — skip field validation ──
      if (suite.testType === "negative") {
        if (cached.error || !cached.result) {
          passingTests++;
          continue;
        }
      }

      // If execution errored and test is not negative/edge_case, check if checks
      // reference fields that would exist in error output
      if (cached.error && !cached.result) {
        if (suite.testType === "edge_case") {
          passingTests++;
          continue;
        }
        erroredTests++;
        // We still note structural issues for checks on error output path
        for (const check of rules.checks) {
          structuralIssues.push({
            slug: suite.capabilitySlug,
            testName: suite.testName,
            testType: suite.testType,
            check,
            issue: `Capability threw error: "${cached.error.substring(0, 100)}" — check cannot be evaluated`,
            actualOutputKeys: [],
            recommendation: "Investigate capability error; test may be valid once error is resolved",
          });
        }
        failingTests++;
        continue;
      }

      if (!cached.result) {
        failingTests++;
        continue;
      }

      const output = cached.result.output;
      const outputKeys = extractAllKeys(output);

      // ── Validate each check against actual output ─────────────────────
      let testPassed = true;

      for (const check of rules.checks) {
        const value = getNestedValue(output, check.field);

        // Check 1: Does the field exist?
        if (value === undefined) {
          testPassed = false;
          const alt = findBestAlternativeField(outputKeys, check);
          const recommendation = alt
            ? `Change to ${check.operator}("${alt}") — present in actual output`
            : `Review capability output — available keys: ${outputKeys.slice(0, 10).join(", ")}`;

          structuralIssues.push({
            slug: suite.capabilitySlug,
            testName: suite.testName,
            testType: suite.testType,
            check,
            issue: `Field '${check.field}' is missing from capability output`,
            actualOutputKeys: outputKeys,
            recommendation,
          });

          // Generate auto-fix if we found an alternative
          if (alt) {
            fixes.push({
              capabilitySlug: suite.capabilitySlug,
              testName: suite.testName,
              currentCheck: {
                field: check.field,
                operator: check.operator,
                ...(check.value !== undefined ? { value: check.value } : {}),
              },
              proposedCheck: {
                field: alt,
                operator: check.operator,
                ...(check.value !== undefined ? { value: check.value } : {}),
              },
              reason: `'${check.field}' missing from output; '${alt}' present in all output paths`,
            });
          }
          continue;
        }

        // Check 2: Type mismatches
        if (check.operator === "is_true" || check.operator === "is_false") {
          if (typeof value !== "boolean") {
            typeMismatches.push({
              slug: suite.capabilitySlug,
              testName: suite.testName,
              check,
              issue: `Field '${check.field}' is type '${typeof value}', not boolean (value: ${JSON.stringify(value)})`,
            });
            testPassed = false;
          }
        }

        if (check.operator === "contains" && typeof value !== "string") {
          typeMismatches.push({
            slug: suite.capabilitySlug,
            testName: suite.testName,
            check,
            issue: `Field '${check.field}' is type '${typeof value}', not string — 'contains' operator requires string`,
          });
          testPassed = false;
        }

        if (
          (check.operator === "gt" || check.operator === "lt" || check.operator === "gte") &&
          typeof value !== "number"
        ) {
          typeMismatches.push({
            slug: suite.capabilitySlug,
            testName: suite.testName,
            check,
            issue: `Field '${check.field}' is type '${typeof value}', not number — '${check.operator}' operator requires number`,
          });
          testPassed = false;
        }

        // Check 3: Does the actual value pass the check?
        if (check.operator === "not_null" && value == null) {
          testPassed = false;
        }
        if (check.operator === "equals" && value !== check.value) {
          testPassed = false;
        }
        if (check.operator === "is_true" && value !== true) {
          testPassed = false;
        }
        if (check.operator === "is_false" && value !== false) {
          testPassed = false;
        }
      }

      if (testPassed) {
        passingTests++;
      } else {
        failingTests++;
      }
    }

    process.stdout.write(" done\n");
  }

  // ── Generate report ─────────────────────────────────────────────────────

  // Separate structural issues into categories
  const fieldMissingIssues = structuralIssues.filter(
    (i) => i.issue.startsWith("Field '"),
  );
  const errorIssues = structuralIssues.filter(
    (i) => i.issue.startsWith("Capability threw error"),
  );

  // Count unique tests affected (not per-check)
  const fieldMissingTestKeys = new Set(
    fieldMissingIssues.map((i) => `${i.slug}::${i.testName}`),
  );
  const errorTestKeys = new Set(
    errorIssues.map((i) => `${i.slug}::${i.testName}`),
  );

  const lines: string[] = [];
  lines.push("TEST AUDIT REPORT");
  lines.push("=================");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  // Summary
  lines.push(`TOTAL SUITES: ${suites.length}`);
  lines.push(`PASSING TESTS: ${passingTests}`);
  lines.push(`FAILING TESTS: ${failingTests}`);
  lines.push(`  - Field mismatch: ${fieldMissingTestKeys.size} tests (${fieldMissingIssues.length} individual checks)`);
  lines.push(`  - Capability error: ${errorTestKeys.size} tests (bad test inputs or unavailable services)`);
  lines.push(`SKIPPED (no checks / negative / edge_case): ${skippedTests}`);
  lines.push(`TIMED OUT (>30s): ${timedOutTests}`);
  lines.push(`NO EXECUTOR: ${noExecutorTests}`);
  lines.push(`TYPE MISMATCHES: ${typeMismatches.length}`);
  lines.push(`CLASSIFICATION ISSUES: ${classificationIssues.length}`);
  lines.push("");

  // ── Section 1: FIELD MISMATCHES (the real structural bugs) ──────────
  lines.push("═".repeat(70));
  lines.push("SECTION 1: FIELD MISMATCHES (validation rules reference wrong field names)");
  lines.push("═".repeat(70));
  lines.push("");

  if (fieldMissingIssues.length === 0) {
    lines.push("  None found!");
  } else {
    // Group by capability slug
    const bySlug = new Map<string, StructuralIssue[]>();
    for (const issue of fieldMissingIssues) {
      if (!bySlug.has(issue.slug)) bySlug.set(issue.slug, []);
      bySlug.get(issue.slug)!.push(issue);
    }

    for (const [slug, issues] of bySlug) {
      lines.push(`  ✗ ${slug}`);
      // Deduplicate fields
      const seenFields = new Set<string>();
      for (const issue of issues) {
        if (seenFields.has(issue.check.field)) continue;
        seenFields.add(issue.check.field);
        lines.push(`    - "${issue.check.field}" missing from output`);
      }
      lines.push(`    Actual output keys: [${issues[0].actualOutputKeys.join(", ")}]`);

      // Show matching fix if available
      const slugFixes = fixes.filter((f) => f.capabilitySlug === slug);
      const seenFixFields = new Set<string>();
      for (const fix of slugFixes) {
        if (seenFixFields.has(fix.currentCheck.field)) continue;
        seenFixFields.add(fix.currentCheck.field);
        lines.push(`    FIX: "${fix.currentCheck.field}" → "${fix.proposedCheck?.field}" (${fix.reason.split(";")[0]})`);
      }
      // Show fields with no auto-fix
      for (const field of seenFields) {
        if (!seenFixFields.has(field)) {
          lines.push(`    NO AUTO-FIX: "${field}" — manual review needed`);
        }
      }
      lines.push("");
    }
  }
  lines.push("");

  // ── Section 2: CAPABILITY ERRORS (bad test inputs) ──────────────────
  lines.push("═".repeat(70));
  lines.push("SECTION 2: CAPABILITY ERRORS (tests fail because the capability throws)");
  lines.push("═".repeat(70));
  lines.push("");

  if (errorIssues.length === 0) {
    lines.push("  None found!");
  } else {
    // Group by slug, show error once
    const bySlug = new Map<string, { testName: string; error: string }[]>();
    for (const issue of errorIssues) {
      if (!bySlug.has(issue.slug)) bySlug.set(issue.slug, []);
      const existing = bySlug.get(issue.slug)!;
      if (!existing.find((e) => e.testName === issue.testName)) {
        const errMatch = issue.issue.match(/Capability threw error: "(.+?)"/);
        existing.push({
          testName: issue.testName,
          error: errMatch?.[1]?.substring(0, 120) ?? issue.issue.substring(0, 120),
        });
      }
    }

    for (const [slug, tests] of bySlug) {
      lines.push(`  ✗ ${slug}`);
      for (const t of tests) {
        lines.push(`    - "${t.testName}": ${t.error}`);
      }
      lines.push("");
    }
  }
  lines.push("");

  // ── Section 3: TYPE MISMATCHES ──────────────────────────────────────
  lines.push("═".repeat(70));
  lines.push("SECTION 3: TYPE MISMATCHES (operator doesn't match field type)");
  lines.push("═".repeat(70));
  lines.push("");

  if (typeMismatches.length === 0) {
    lines.push("  None found!");
  } else {
    for (const tm of typeMismatches) {
      lines.push(`  ✗ ${tm.slug} / "${tm.testName}"`);
      lines.push(`    Check: ${tm.check.operator}("${tm.check.field}")`);
      lines.push(`    Issue: ${tm.issue}`);
      lines.push("");
    }
  }
  lines.push("");

  // ── Section 4: CLASSIFICATION ISSUES ────────────────────────────────
  lines.push("═".repeat(70));
  lines.push("SECTION 4: TEST TYPE CLASSIFICATION ISSUES");
  lines.push("═".repeat(70));
  lines.push("");

  if (classificationIssues.length === 0) {
    lines.push("  None found!");
  } else {
    for (const ci of classificationIssues) {
      lines.push(`  ⚠ ${ci.slug} / "${ci.testName}"`);
      lines.push(`    Type: ${ci.testType} → Checks: [${ci.checks.map((c) => `${c.operator}("${c.field}")`).join(", ")}]`);
      lines.push(`    Issue: ${ci.issue}`);
      lines.push("");
    }
  }

  const report = lines.join("\n");

  // Write report to file
  const reportPath = resolve(import.meta.dirname, "../../audit-report.txt");
  writeFileSync(reportPath, report, "utf-8");
  console.log(`\nReport written to: ${reportPath}`);

  // Write auto-fix recommendations
  if (fixes.length > 0) {
    const fixPath = resolve(import.meta.dirname, "../../audit-fixes.json");
    writeFileSync(fixPath, JSON.stringify(fixes, null, 2), "utf-8");
    console.log(`Fix recommendations written to: ${fixPath} (${fixes.length} fixes)`);
  }

  // Print report to stdout too
  console.log("\n" + report);

  process.exit(0);
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
