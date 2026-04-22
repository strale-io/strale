/**
 * READ-ONLY diagnostic audit of all capabilities.
 *
 * Collects: SQS scores (dual-profile), test coverage, failure analysis,
 * executor status, and health distribution across the entire catalog.
 *
 * Usage:
 *   cd apps/api
 *   npx tsx src/db/audit-capabilities.ts
 *
 * Outputs:
 *   audit-report.json  — full structured data
 *   audit-summary.txt  — human-readable report
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { writeFileSync } from "node:fs";
import { sql, eq, and } from "drizzle-orm";
import { getDb } from "./index.js";
import { capabilities, testSuites, testResults, capabilityHealth } from "./schema.js";
import { getExecutor } from "../capabilities/index.js";
import { computeDualProfileSQS, type DualProfileSQSResult } from "../lib/sqs.js";
import { categorizeFailureReason, toLegacyCategory } from "../lib/trust-helpers.js";

// ─── Side-effect imports: populate executor registry ────────────────────────
// Mirrors apps/api/src/app.ts lines 27–302

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

// ─── Types ──────────────────────────────────────────────────────────────────

interface CapAudit {
  slug: string;
  name: string;
  category: string;
  data_source: string | null;
  transparency_tag: string | null;
  capability_type: string | null;
  is_active: boolean;
  is_free_tier: boolean;
  has_executor: boolean;
  test_suites: Record<string, number>;
  test_results_30d: { total: number; passed: number; failed: number };
  failure_analysis: Record<string, number>;
  top_failure_reasons: string[];
  sqs: {
    matrix_score: number;
    matrix_label: string;
    qp_grade: string;
    qp_score: number;
    rp_grade: string;
    rp_score: number;
    legacy_score: number;
    pending: boolean;
    error: string | null;
  };
  health: {
    state: string | null;
    consecutive_failures: number;
  };
  last_tested_at: string | null;
  tier: "green" | "yellow" | "orange" | "red" | "pending";
}

// ─── Tier classification ────────────────────────────────────────────────────

const BASE_TEST_TYPES = ["known_answer", "schema_check", "negative", "edge_case", "dependency_health"];

function classifyTier(cap: CapAudit): CapAudit["tier"] {
  const { sqs, has_executor, test_results_30d, test_suites, failure_analysis } = cap;

  if (sqs.pending) return "pending";
  if (sqs.error) return "red";
  if (!has_executor) return "red";
  if (test_results_30d.total === 0) return "red";
  if (sqs.matrix_score < 25) return "red";

  const hasAllTypes = BASE_TEST_TYPES.every((t) => (test_suites[t] ?? 0) > 0);
  const totalFail = failure_analysis.external_service + failure_analysis.internal + failure_analysis.unknown;
  const upstreamPct = totalFail > 0 ? failure_analysis.external_service / totalFail : 0;

  if (sqs.matrix_score >= 75 && hasAllTypes) return "green";
  if (sqs.matrix_score >= 50) return "yellow";
  if (upstreamPct > 0.5) return "orange";
  return "orange";
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const db = getDb();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString();

  console.log("=== STRALE CAPABILITY QUALITY AUDIT ===");
  console.log(`Date: ${new Date().toISOString().split("T")[0]}`);
  console.log("");

  // ── 1. Fetch all active capabilities ────────────────────────────────────
  const allCaps = await db
    .select({
      slug: capabilities.slug,
      name: capabilities.name,
      category: capabilities.category,
      dataSource: capabilities.dataSource,
      transparencyTag: capabilities.transparencyTag,
      capabilityType: capabilities.capabilityType,
      isActive: capabilities.isActive,
      isFreeTier: capabilities.isFreeTier,
    })
    .from(capabilities)
    .where(eq(capabilities.isActive, true))
    .orderBy(capabilities.slug);

  console.log(`Total active capabilities: ${allCaps.length}`);
  console.log("");

  // ── 2. Batch-fetch test suite counts per slug ───────────────────────────
  const rawSuites = await db.execute(sql`
    SELECT capability_slug, test_type, COUNT(*)::int AS cnt
    FROM test_suites
    WHERE active = true
    GROUP BY capability_slug, test_type
  `);
  const suiteRows = (Array.isArray(rawSuites) ? rawSuites : (rawSuites as any)?.rows ?? []) as
    { capability_slug: string; test_type: string; cnt: number }[];

  const suiteMap = new Map<string, Record<string, number>>();
  for (const r of suiteRows) {
    const existing = suiteMap.get(r.capability_slug) ?? {};
    existing[r.test_type] = r.cnt;
    suiteMap.set(r.capability_slug, existing);
  }

  // ── 3. Batch-fetch 30-day test results per slug ─────────────────────────
  const rawResults = await db.execute(sql`
    SELECT
      capability_slug,
      COUNT(*)::int AS total,
      SUM(CASE WHEN passed THEN 1 ELSE 0 END)::int AS passed_count,
      MAX(executed_at)::text AS last_tested
    FROM test_results
    WHERE executed_at >= ${cutoff}::timestamptz
    GROUP BY capability_slug
  `);
  const resultRows = (Array.isArray(rawResults) ? rawResults : (rawResults as any)?.rows ?? []) as
    { capability_slug: string; total: number; passed_count: number; last_tested: string | null }[];

  const resultMap = new Map<string, { total: number; passed: number; failed: number; last_tested: string | null }>();
  for (const r of resultRows) {
    resultMap.set(r.capability_slug, {
      total: r.total,
      passed: r.passed_count,
      failed: r.total - r.passed_count,
      last_tested: r.last_tested,
    });
  }

  // ── 4. Batch-fetch failure reasons (30d) ────────────────────────────────
  const rawFailures = await db.execute(sql`
    SELECT capability_slug, failure_reason
    FROM test_results
    WHERE executed_at >= ${cutoff}::timestamptz
      AND passed = false
      AND failure_reason IS NOT NULL
  `);
  const failureRows = (Array.isArray(rawFailures) ? rawFailures : (rawFailures as any)?.rows ?? []) as
    { capability_slug: string; failure_reason: string }[];

  // Group failure reasons by slug
  const failuresBySlug = new Map<string, string[]>();
  for (const r of failureRows) {
    const list = failuresBySlug.get(r.capability_slug) ?? [];
    list.push(r.failure_reason);
    failuresBySlug.set(r.capability_slug, list);
  }

  // ── 5. Batch-fetch health state ─────────────────────────────────────────
  const healthRows = await db
    .select({
      slug: capabilityHealth.capabilitySlug,
      state: capabilityHealth.state,
      consecutiveFailures: capabilityHealth.consecutiveFailures,
    })
    .from(capabilityHealth);

  const healthMap = new Map(healthRows.map((r) => [r.slug, r]));

  // ── 6. Compute dual-profile SQS for all capabilities ───────────────────
  console.log("Computing SQS for all capabilities (this may take a minute)...");
  const BATCH = 20;
  const sqsMap = new Map<string, DualProfileSQSResult | null>();
  const sqsErrors = new Map<string, string>();

  for (let i = 0; i < allCaps.length; i += BATCH) {
    const batch = allCaps.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map((cap) => computeDualProfileSQS(cap.slug)),
    );
    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled") {
        sqsMap.set(batch[j].slug, r.value);
      } else {
        sqsMap.set(batch[j].slug, null);
        sqsErrors.set(batch[j].slug, r.reason?.message ?? String(r.reason));
      }
    }
    if (i % 100 === 0 && i > 0) {
      console.log(`  ... ${i}/${allCaps.length}`);
    }
  }
  console.log(`  Done. ${sqsErrors.size} errors encountered.`);
  console.log("");

  // ── 7. Build per-capability audit records ───────────────────────────────
  const audits: CapAudit[] = [];

  for (const cap of allCaps) {
    const suites = suiteMap.get(cap.slug) ?? {};
    const results = resultMap.get(cap.slug) ?? { total: 0, passed: 0, failed: 0, last_tested: null };
    const failures = failuresBySlug.get(cap.slug) ?? [];
    const health = healthMap.get(cap.slug);
    const dual = sqsMap.get(cap.slug);
    const sqsError = sqsErrors.get(cap.slug) ?? null;

    // Classify failures (use legacy categories for audit summary)
    const failureAnalysis: Record<string, number> = { external_service: 0, internal: 0, unknown: 0 };
    const reasonCounts = new Map<string, number>();
    for (const reason of failures) {
      const cat = categorizeFailureReason(reason);
      const legacy = toLegacyCategory(cat);
      failureAnalysis[legacy] = (failureAnalysis[legacy] ?? 0) + 1;
      // Truncate reason for grouping
      const key = reason.length > 120 ? reason.slice(0, 120) + "…" : reason;
      reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
    }

    // Top 5 failure reasons for this capability
    const topReasons = [...reasonCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => `${count}× ${reason}`);

    const audit: CapAudit = {
      slug: cap.slug,
      name: cap.name,
      category: cap.category,
      data_source: cap.dataSource,
      transparency_tag: cap.transparencyTag,
      capability_type: cap.capabilityType,
      is_active: cap.isActive,
      is_free_tier: cap.isFreeTier,
      has_executor: !!getExecutor(cap.slug),
      test_suites: suites,
      test_results_30d: { total: results.total, passed: results.passed, failed: results.failed },
      failure_analysis: failureAnalysis,
      top_failure_reasons: topReasons,
      sqs: {
        matrix_score: dual?.matrix.score ?? 0,
        matrix_label: dual?.matrix.label ?? (sqsError ? "Error" : "Pending"),
        qp_grade: dual?.qp.grade ?? "pending",
        qp_score: dual?.qp.score ?? 0,
        rp_grade: dual?.rp.grade ?? "pending",
        rp_score: dual?.rp.score ?? 0,
        legacy_score: dual?.legacy_score ?? 0,
        pending: dual?.matrix.pending ?? true,
        error: sqsError,
      },
      health: {
        state: health?.state ?? null,
        consecutive_failures: health?.consecutiveFailures ?? 0,
      },
      last_tested_at: results.last_tested,
      tier: "pending", // will be set below
    };

    audit.tier = classifyTier(audit);
    audits.push(audit);
  }

  // ── 8. Compute summary statistics ───────────────────────────────────────
  const tierCounts = { green: 0, yellow: 0, orange: 0, red: 0, pending: 0 };
  for (const a of audits) tierCounts[a.tier]++;

  // By transparency tag
  const tagStats = new Map<string, { count: number; sqsSum: number; sqsCount: number }>();
  for (const a of audits) {
    const tag = a.transparency_tag ?? "unknown";
    const existing = tagStats.get(tag) ?? { count: 0, sqsSum: 0, sqsCount: 0 };
    existing.count++;
    if (!a.sqs.pending && !a.sqs.error) {
      existing.sqsSum += a.sqs.matrix_score;
      existing.sqsCount++;
    }
    tagStats.set(tag, existing);
  }

  // By category
  const categoryStats = new Map<string, { count: number; sqsSum: number; sqsCount: number }>();
  for (const a of audits) {
    const cat = a.category;
    const existing = categoryStats.get(cat) ?? { count: 0, sqsSum: 0, sqsCount: 0 };
    existing.count++;
    if (!a.sqs.pending && !a.sqs.error) {
      existing.sqsSum += a.sqs.matrix_score;
      existing.sqsCount++;
    }
    categoryStats.set(cat, existing);
  }

  // By data source pattern
  const dsPatterns = new Map<string, number>();
  for (const a of audits) {
    const ds = a.data_source;
    let pattern = "none";
    if (ds) {
      if (/browserless/i.test(ds)) pattern = "Browserless + LLM";
      else if (/claude|anthropic/i.test(ds)) pattern = "Claude API";
      else if (/api|registry|vies|gleif/i.test(ds)) pattern = "Direct API";
      else if (/algorithmic|computed|node|pure/i.test(ds)) pattern = "Algorithmic";
      else if (/serper|google/i.test(ds)) pattern = "Serper/Search";
      else pattern = "Other external";
    }
    dsPatterns.set(pattern, (dsPatterns.get(pattern) ?? 0) + 1);
  }

  // Test type coverage
  const missingTypes: Record<string, string[]> = {};
  for (const t of BASE_TEST_TYPES) missingTypes[t] = [];
  let allTypesCount = 0;
  for (const a of audits) {
    const hasAll = BASE_TEST_TYPES.every((t) => (a.test_suites[t] ?? 0) > 0);
    if (hasAll) allTypesCount++;
    for (const t of BASE_TEST_TYPES) {
      if ((a.test_suites[t] ?? 0) === 0) missingTypes[t].push(a.slug);
    }
  }

  // Global top failure reasons
  const globalReasonCounts = new Map<string, { count: number; classification: string }>();
  for (const r of failureRows) {
    const key = r.failure_reason.length > 120 ? r.failure_reason.slice(0, 120) + "…" : r.failure_reason;
    const existing = globalReasonCounts.get(key);
    if (existing) {
      existing.count++;
    } else {
      globalReasonCounts.set(key, { count: 1, classification: categorizeFailureReason(r.failure_reason) });
    }
  }
  const topGlobalReasons = [...globalReasonCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20);

  // No executor
  const noExecutor = audits.filter((a) => !a.has_executor);

  // Zero results in 30d
  const zeroResults = audits.filter((a) => a.test_results_30d.total === 0);

  // Upstream-dominated
  const upstreamDominated = audits.filter((a) => {
    const total = a.failure_analysis.external_service + a.failure_analysis.internal + a.failure_analysis.unknown;
    return total >= 3 && a.failure_analysis.external_service / total > 0.8;
  });

  // ── 9. Write audit-report.json ──────────────────────────────────────────
  const report = {
    generated_at: new Date().toISOString(),
    total_active: allCaps.length,
    tier_distribution: tierCounts,
    transparency_tags: Object.fromEntries(
      [...tagStats.entries()].map(([k, v]) => [k, {
        count: v.count,
        avg_sqs: v.sqsCount > 0 ? Math.round(v.sqsSum / v.sqsCount * 10) / 10 : null,
      }]),
    ),
    categories: Object.fromEntries(
      [...categoryStats.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .map(([k, v]) => [k, {
          count: v.count,
          avg_sqs: v.sqsCount > 0 ? Math.round(v.sqsSum / v.sqsCount * 10) / 10 : null,
        }]),
    ),
    data_source_patterns: Object.fromEntries(dsPatterns),
    test_type_coverage: {
      all_5_types: allTypesCount,
      missing: Object.fromEntries(
        Object.entries(missingTypes).map(([k, v]) => [k, v.length]),
      ),
    },
    no_executor: noExecutor.map((a) => a.slug),
    zero_results_30d: zeroResults.map((a) => a.slug),
    upstream_dominated: upstreamDominated.map((a) => ({
      slug: a.slug,
      total_failures: a.failure_analysis.external_service + a.failure_analysis.internal + a.failure_analysis.unknown,
      upstream_count: a.failure_analysis.external_service,
      top_reason: a.top_failure_reasons[0] ?? "—",
    })),
    top_20_failure_reasons: topGlobalReasons.map(([reason, info]) => ({
      count: info.count,
      classification: info.classification,
      reason,
    })),
    capabilities: audits,
  };

  const jsonPath = resolve(import.meta.dirname, "../../audit-report.json");
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`Wrote ${jsonPath}`);

  // ── 10. Write audit-summary.txt ─────────────────────────────────────────
  const lines: string[] = [];
  const p = (s: string) => lines.push(s);
  const pct = (n: number, total: number) => total > 0 ? `${Math.round(n / total * 100)}%` : "—";

  p(`=== STRALE CAPABILITY QUALITY AUDIT ===`);
  p(`Date: ${new Date().toISOString().split("T")[0]}`);
  p(`Total active capabilities: ${allCaps.length}`);
  p(``);
  p(`--- TIER DISTRIBUTION ---`);
  p(`Green  (SQS ≥75, full coverage): ${String(tierCounts.green).padStart(4)} (${pct(tierCounts.green, allCaps.length)})`);
  p(`Yellow (SQS 50–74, partial):     ${String(tierCounts.yellow).padStart(4)} (${pct(tierCounts.yellow, allCaps.length)})`);
  p(`Orange (SQS 25–49, upstream):    ${String(tierCounts.orange).padStart(4)} (${pct(tierCounts.orange, allCaps.length)})`);
  p(`Red    (SQS <25, broken):        ${String(tierCounts.red).padStart(4)} (${pct(tierCounts.red, allCaps.length)})`);
  p(`Pending (insufficient data):     ${String(tierCounts.pending).padStart(4)} (${pct(tierCounts.pending, allCaps.length)})`);
  p(``);

  p(`--- BY TRANSPARENCY TAG ---`);
  for (const [tag, stats] of tagStats) {
    const avg = stats.sqsCount > 0 ? Math.round(stats.sqsSum / stats.sqsCount * 10) / 10 : "—";
    p(`${tag.padEnd(20)} ${String(stats.count).padStart(4)}  (avg SQS: ${avg})`);
  }
  p(``);

  p(`--- BY CATEGORY ---`);
  for (const [cat, stats] of [...categoryStats.entries()].sort((a, b) => b[1].count - a[1].count)) {
    const avg = stats.sqsCount > 0 ? Math.round(stats.sqsSum / stats.sqsCount * 10) / 10 : "—";
    p(`${cat.padEnd(28)} ${String(stats.count).padStart(3)}  (avg SQS: ${avg})`);
  }
  p(``);

  p(`--- BY DATA SOURCE PATTERN ---`);
  for (const [pattern, count] of [...dsPatterns.entries()].sort((a, b) => b[1] - a[1])) {
    p(`${pattern.padEnd(24)} ${String(count).padStart(4)}`);
  }
  p(``);

  p(`--- TEST TYPE COVERAGE ---`);
  p(`Capabilities with all 5 types: ${allTypesCount}`);
  for (const t of BASE_TEST_TYPES) {
    p(`Missing ${t.padEnd(20)}: ${missingTypes[t].length}`);
  }
  p(``);

  // Red tier details
  const redCaps = audits.filter((a) => a.tier === "red");
  p(`--- RED TIER DETAILS (${redCaps.length}) ---`);
  for (const a of redCaps) {
    const reason: string[] = [];
    if (!a.has_executor) reason.push("no executor");
    if (a.test_results_30d.total === 0) reason.push("0 test results");
    if (a.sqs.error) reason.push(`SQS error: ${a.sqs.error.slice(0, 80)}`);
    else if (a.sqs.matrix_score < 25 && !a.sqs.pending) reason.push(`SQS ${a.sqs.matrix_score}`);
    p(`  ${a.slug.padEnd(40)} SQS ${String(a.sqs.matrix_score).padStart(5)} | ${reason.join("; ")} | last: ${a.last_tested_at?.split("T")[0] ?? "never"}`);
  }
  p(``);

  // Orange tier details
  const orangeCaps = audits.filter((a) => a.tier === "orange");
  p(`--- ORANGE TIER DETAILS (${orangeCaps.length}) ---`);
  for (const a of orangeCaps) {
    const totalFail = a.failure_analysis.external_service + a.failure_analysis.internal + a.failure_analysis.unknown;
    const upPct = totalFail > 0 ? Math.round(a.failure_analysis.external_service / totalFail * 100) : 0;
    p(`  ${a.slug.padEnd(40)} SQS ${String(a.sqs.matrix_score).padStart(5)} | ${upPct}% upstream | ${a.top_failure_reasons[0] ?? "—"}`);
  }
  p(``);

  // Pending tier details
  const pendingCaps = audits.filter((a) => a.tier === "pending");
  p(`--- PENDING TIER DETAILS (${pendingCaps.length}) ---`);
  for (const a of pendingCaps) {
    p(`  ${a.slug.padEnd(40)} QP:${a.sqs.qp_grade.padEnd(8)} RP:${a.sqs.rp_grade.padEnd(8)} tests:${a.test_results_30d.total} last:${a.last_tested_at?.split("T")[0] ?? "never"}`);
  }
  p(``);

  p(`--- TOP 20 FAILURE REASONS ---`);
  for (const [reason, info] of topGlobalReasons) {
    p(`  ${String(info.count).padStart(5)} | ${info.classification.padEnd(16)} | ${reason}`);
  }
  p(``);

  if (noExecutor.length > 0) {
    p(`--- CAPABILITIES WITH NO EXECUTOR (${noExecutor.length}) ---`);
    for (const a of noExecutor) p(`  ${a.slug}`);
    p(``);
  }

  if (zeroResults.length > 0) {
    p(`--- CAPABILITIES WITH ZERO TEST RESULTS (30d) (${zeroResults.length}) ---`);
    for (const a of zeroResults) p(`  ${a.slug}`);
    p(``);
  }

  if (upstreamDominated.length > 0) {
    p(`--- UPSTREAM-DOMINATED FAILURES >80% (${upstreamDominated.length}) ---`);
    for (const a of upstreamDominated) {
      const total = a.failure_analysis.external_service + a.failure_analysis.internal + a.failure_analysis.unknown;
      p(`  ${a.slug.padEnd(40)} ${a.failure_analysis.external_service}/${total} upstream | ${a.top_failure_reasons[0] ?? "—"}`);
    }
    p(``);
  }

  // SQS computation errors
  if (sqsErrors.size > 0) {
    p(`--- SQS COMPUTATION ERRORS (${sqsErrors.size}) ---`);
    for (const [slug, err] of sqsErrors) {
      p(`  ${slug.padEnd(40)} ${err.slice(0, 100)}`);
    }
    p(``);
  }

  const txtPath = resolve(import.meta.dirname, "../../audit-summary.txt");
  writeFileSync(txtPath, lines.join("\n"));
  console.log(`Wrote ${txtPath}`);

  // Print summary to console too
  console.log("");
  console.log(lines.slice(0, 25).join("\n"));
  console.log("...");
  console.log(`\nFull report: ${txtPath}`);
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
