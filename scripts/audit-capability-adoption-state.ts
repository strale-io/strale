/**
 * Capability Adoption-Package Discovery Scan
 * 2026-04-08
 *
 * Read-only audit of what each capability currently has vs what's missing.
 * Queries the production API (no direct DB access needed — all data is
 * available via GET /v1/capabilities).
 *
 * Checks:
 * 1. DB fields via API (description, schemas, examples, etc.)
 * 2. Public capability page existence on strale.dev
 * 3. Local repo artifacts (tests, docs, manifests)
 *
 * Output:
 * - scripts/output/capability-adoption-audit-2026-04-08.csv
 * - scripts/output/capability-adoption-audit-summary-2026-04-08.md
 */

import { writeFileSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : dirname(fileURLToPath(import.meta.url));

const API_BASE = "https://api.strale.io";
const FRONTEND_BASE = "https://strale.dev";
const REPO_ROOT = join(__dirname, "..");
const APPS_API = join(REPO_ROOT, "apps", "api");
const FRONTEND_DIR = "c:/Users/pette/Projects/strale-frontend";

// ── Helpers ──────────────────────────────────────────────────────────────────

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function countFilesMatching(dir: string, slug: string, extensions: string[]): number {
  let count = 0;
  try {
    const walk = (d: string) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        const full = join(d, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
          try {
            const content = readFileSync(full, "utf-8");
            if (content.includes(slug)) count++;
          } catch {}
        }
      }
    };
    walk(dir);
  } catch {}
  return count;
}

// ── Fetch all capabilities from API ─────────────────────────────────────────

interface ApiCapability {
  slug: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  input_schema: Record<string, unknown> | null;
  output_schema: Record<string, unknown> | null;
  is_free_tier?: boolean;
  transparency_tag?: string;
  geography?: string;
  data_source?: string;
  freshness_category?: string;
  capability_type?: string;
  lifecycle_state?: string;
  search_tags?: string[];
  avg_latency_ms?: number;
  [key: string]: unknown;
}

async function fetchAllCapabilities(): Promise<ApiCapability[]> {
  const resp = await fetch(`${API_BASE}/v1/capabilities?limit=500`);
  const data = await resp.json();
  return Array.isArray(data) ? data : (data as any).capabilities ?? [];
}

// ── Check if a capability page exists on strale.dev ─────────────────────────

/**
 * strale.dev is a React SPA — all capability pages are client-side rendered
 * from the same HTML shell via CapabilityDetail.tsx. Server-side fetch returns
 * the shell, not the rendered page. Instead of checking the rendered output,
 * we verify the CapabilityDetail component exists and assume all capabilities
 * that are returned by GET /v1/capabilities have a working page.
 *
 * For structured data: the SPA includes SEO.tsx which generates OG tags
 * dynamically. We check the component source for these features once.
 */
const SPA_PAGE_EXISTS = existsSync(join(FRONTEND_DIR, "src", "pages", "CapabilityDetail.tsx"));
const SPA_HAS_SEO = existsSync(join(FRONTEND_DIR, "src", "components", "SEO.tsx"));

let spaPageContent = "";
let spaHasCodeExample = false;
let spaHasResponseExample = false;
let spaHasStructuredData = false;
try {
  spaPageContent = readFileSync(join(FRONTEND_DIR, "src", "pages", "CapabilityDetail.tsx"), "utf-8");
  spaHasCodeExample = spaPageContent.includes("CodeBlock") || spaPageContent.includes("CodeResponseSplit");
  spaHasResponseExample = spaPageContent.includes("exampleOutput") || spaPageContent.includes("CodeResponseSplit");
  const seoContent = readFileSync(join(FRONTEND_DIR, "src", "components", "SEO.tsx"), "utf-8");
  spaHasStructuredData = seoContent.includes("og:title") || seoContent.includes("application/ld+json") || seoContent.includes("schema.org");
} catch {}

function checkCapabilityPage(_slug: string): {
  exists: boolean;
  length: number;
  hasStructuredData: boolean;
  hasCodeExample: boolean;
  hasResponseExample: boolean;
} {
  return {
    exists: SPA_PAGE_EXISTS,
    length: spaPageContent.length,
    hasStructuredData: spaHasStructuredData,
    hasCodeExample: spaHasCodeExample,
    hasResponseExample: spaHasResponseExample,
  };
}

// ── Count repo artifacts ────────────────────────────────────────────────────

function countTestFiles(slug: string): number {
  // Check test_suites in manifests and test files
  let count = 0;
  const testDir = join(APPS_API, "src");
  count += countFilesMatching(testDir, slug, [".test.ts", ".test.js", ".spec.ts"]);
  // Also check manifests
  const manifestPath = join(REPO_ROOT, "manifests", `${slug}.yaml`);
  if (existsSync(manifestPath)) count++;
  return count;
}

function countDocsFiles(slug: string): number {
  let count = 0;
  // Check strale-frontend for docs references
  if (existsSync(FRONTEND_DIR)) {
    count += countFilesMatching(join(FRONTEND_DIR, "src"), slug, [".md", ".mdx"]);
  }
  // Check repo root for docs
  count += countFilesMatching(join(REPO_ROOT, "docs"), slug, [".md", ".mdx"]);
  return count;
}

function countSampleFiles(slug: string): number {
  let count = 0;
  // Check for executor file
  const executorPath = join(APPS_API, "src", "capabilities", `${slug}.ts`);
  if (existsSync(executorPath)) count++;
  return count;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Fetching capabilities from API...");
  const caps = await fetchAllCapabilities();
  console.log(`Found ${caps.length} capabilities`);

  // Build CSV rows
  const rows: Record<string, string>[] = [];
  const PAGE_BATCH_SIZE = 10;

  for (let i = 0; i < caps.length; i += PAGE_BATCH_SIZE) {
    const batch = caps.slice(i, i + PAGE_BATCH_SIZE);
    console.log(`Processing ${i + 1}-${Math.min(i + PAGE_BATCH_SIZE, caps.length)} of ${caps.length}...`);

    for (let j = 0; j < batch.length; j++) {
      const c = batch[j];
      const page = checkCapabilityPage(c.slug);

      const desc = c.description || "";
      const inputSchema = c.input_schema;
      const outputSchema = c.output_schema;
      const outputExample = outputSchema && typeof outputSchema === "object" && "example" in outputSchema;
      const hasInputSchema = inputSchema && typeof inputSchema === "object" && Object.keys(inputSchema).length > 0;
      const hasOutputSchema = outputSchema && typeof outputSchema === "object" && Object.keys(outputSchema).length > 0;

      // Count examples in output_schema
      const exampleCallsCount = hasInputSchema && (inputSchema as any).properties ? Object.keys((inputSchema as any).properties).length : 0;
      const exampleResponsesCount = outputExample ? 1 : 0;

      const testFiles = countTestFiles(c.slug);
      const docsFiles = countDocsFiles(c.slug);
      const sampleFiles = countSampleFiles(c.slug);

      rows.push({
        slug: c.slug,
        category: c.category,
        title: c.name,
        has_short_description: desc.length > 0 ? "yes" : "no",
        short_description_length: String(desc.length),
        has_long_description: desc.length > 100 ? "yes" : "no",
        long_description_length: String(desc.length),
        has_input_schema: hasInputSchema ? "yes" : "no",
        has_output_schema: hasOutputSchema ? "yes" : "no",
        example_calls_count: String(exampleCallsCount),
        example_responses_count: String(exampleResponsesCount),
        has_capability_page: page.exists ? "yes" : "no",
        capability_page_length: String(page.length),
        has_structured_data_markup: page.hasStructuredData ? "yes" : "no",
        page_has_code_example: page.hasCodeExample ? "yes" : "no",
        page_has_response_example: page.hasResponseExample ? "yes" : "no",
        test_files_count: String(testFiles),
        docs_files_count: String(docsFiles),
        sample_files_count: String(sampleFiles),
        tier_classification: c.is_free_tier ? "free" : "paid",
        maintenance_class: (c as any).maintenance_class ?? "",
        last_updated: "",
      });
    }
  }

  // Write CSV
  const csvColumns = [
    "slug", "category", "title", "has_short_description", "short_description_length",
    "has_long_description", "long_description_length", "has_input_schema", "has_output_schema",
    "example_calls_count", "example_responses_count", "has_capability_page", "capability_page_length",
    "has_structured_data_markup", "page_has_code_example", "page_has_response_example",
    "test_files_count", "docs_files_count", "sample_files_count", "tier_classification",
    "maintenance_class", "last_updated",
  ];

  const csvLines = [csvColumns.join(",")];
  for (const row of rows) {
    csvLines.push(csvColumns.map((col) => {
      const val = row[col] ?? "";
      return val.includes(",") || val.includes('"') || val.includes("\n")
        ? `"${val.replace(/"/g, '""')}"`
        : val;
    }).join(","));
  }

  const csvPath = join(REPO_ROOT, "scripts", "output", "capability-adoption-audit-2026-04-08.csv");
  writeFileSync(csvPath, csvLines.join("\n"), "utf-8");
  console.log(`CSV written: ${csvPath} (${rows.length} rows)`);

  // ── Generate summary ────────────────────────────────────────────────────

  const descLengths = rows.map((r) => parseInt(r.short_description_length)).filter((n) => !isNaN(n));
  const pageLengths = rows.map((r) => parseInt(r.capability_page_length)).filter((n) => !isNaN(n) && n > 0);

  const catCounts: Record<string, number> = {};
  for (const r of rows) catCounts[r.category] = (catCounts[r.category] || 0) + 1;

  const zeroExampleCalls = rows.filter((r) => r.example_calls_count === "0").length;
  const zeroExampleResponses = rows.filter((r) => r.example_responses_count === "0").length;
  const noPage = rows.filter((r) => r.has_capability_page === "no").length;
  const noStructuredData = rows.filter((r) => r.has_structured_data_markup === "no").length;
  const noCodeExample = rows.filter((r) => r.page_has_code_example === "no").length;

  // Completeness score (count of "yes" / non-zero fields)
  function completeness(r: Record<string, string>): number {
    let score = 0;
    if (r.has_short_description === "yes") score++;
    if (r.has_long_description === "yes") score++;
    if (r.has_input_schema === "yes") score++;
    if (r.has_output_schema === "yes") score++;
    if (parseInt(r.example_calls_count) > 0) score++;
    if (parseInt(r.example_responses_count) > 0) score++;
    if (r.has_capability_page === "yes") score++;
    if (r.has_structured_data_markup === "yes") score++;
    if (r.page_has_code_example === "yes") score++;
    if (r.page_has_response_example === "yes") score++;
    if (parseInt(r.test_files_count) > 0) score++;
    if (parseInt(r.sample_files_count) > 0) score++;
    return score;
  }

  const withScores = rows.map((r) => ({ ...r, score: completeness(r) }));
  const top10Complete = [...withScores].sort((a, b) => b.score - a.score).slice(0, 10);
  const top10Incomplete = [...withScores].sort((a, b) => a.score - b.score).slice(0, 10);

  const summary = `# Capability Adoption-Package Discovery Scan
**Date:** 2026-04-08
**Source:** Production API (api.strale.io) + local repo scan

## Headline Numbers

| Metric | Value |
|--------|-------|
| Total capabilities scanned | ${rows.length} |
| Capabilities with zero example responses | ${zeroExampleResponses} |
| Capabilities without a public page | ${noPage} |
| Capabilities without structured data markup | ${noStructuredData} |
| Capabilities without code example on page | ${noCodeExample} |

## Capabilities by Category

| Category | Count |
|----------|-------|
${Object.entries(catCounts).sort((a, b) => b[1] - a[1]).map(([cat, cnt]) => `| ${cat} | ${cnt} |`).join("\n")}

## Description Length Distribution

| Metric | Short description |
|--------|------------------|
| Min | ${Math.min(...descLengths)} |
| P25 | ${percentile(descLengths, 25)} |
| P50 (median) | ${percentile(descLengths, 50)} |
| P75 | ${percentile(descLengths, 75)} |
| P90 | ${percentile(descLengths, 90)} |
| Max | ${Math.max(...descLengths)} |

Note: The API exposes a single \`description\` field. There is no separate long_description column in the DB.

## Page Length Distribution (capabilities with pages)

| Metric | HTML length (chars) |
|--------|-------------------|
| Min | ${pageLengths.length ? Math.min(...pageLengths) : 0} |
| P50 | ${percentile(pageLengths, 50)} |
| P90 | ${percentile(pageLengths, 90)} |
| Max | ${pageLengths.length ? Math.max(...pageLengths) : 0} |
| Count with pages | ${pageLengths.length} |

## Example Coverage

| Metric | Count |
|--------|-------|
| Capabilities with input schema params (proxy for example calls) | ${rows.filter((r) => parseInt(r.example_calls_count) > 0).length} |
| Capabilities with example response in output_schema | ${rows.filter((r) => parseInt(r.example_responses_count) > 0).length} |
| Capabilities with zero example responses | ${zeroExampleResponses} |

## Top 10 by Completeness (most fields populated)

| Slug | Category | Score (/12) |
|------|----------|-------------|
${top10Complete.map((r) => `| \`${r.slug}\` | ${r.category} | ${r.score} |`).join("\n")}

## Top 10 by Incompleteness (fewest fields populated)

| Slug | Category | Score (/12) |
|------|----------|-------------|
${top10Incomplete.map((r) => `| \`${r.slug}\` | ${r.category} | ${r.score} |`).join("\n")}

## Executor Coverage

| Metric | Count |
|--------|-------|
| Capabilities with executor file in src/capabilities/ | ${rows.filter((r) => parseInt(r.sample_files_count) > 0).length} |
| Capabilities with manifest in manifests/ | ${rows.filter((r) => parseInt(r.test_files_count) > 0).length} |
`;

  const summaryPath = join(REPO_ROOT, "scripts", "output", "capability-adoption-audit-summary-2026-04-08.md");
  writeFileSync(summaryPath, summary, "utf-8");
  console.log(`Summary written: ${summaryPath}`);

  // Print headline
  console.log("\n=== HEADLINE FINDINGS ===");
  console.log(`Total capabilities: ${rows.length}`);
  console.log(`Zero example responses: ${zeroExampleResponses}`);
  console.log(`Without public capability page: ${noPage}`);
  console.log(`Without structured data markup: ${noStructuredData}`);
  console.log(`Without code example on page: ${noCodeExample}`);
  console.log(`Categories: ${Object.keys(catCounts).length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
