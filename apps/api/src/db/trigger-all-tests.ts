/**
 * Trigger manual test runs for all Browserless-dependent capabilities against
 * the production API at https://api.strale.io.
 *
 * Usage:
 *   ADMIN_SECRET=<secret> npx tsx apps/api/src/db/trigger-all-tests.ts
 *
 * The endpoint is: POST /v1/internal/tests/run?slug=<slug>
 * Auth:            Authorization: Bearer <ADMIN_SECRET>
 */

export {}; // make this file a module so top-level await is valid

const BASE_URL = "https://api.strale.io";
const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error("ERROR: ADMIN_SECRET env var is required.");
  console.error("Usage: ADMIN_SECRET=<secret> npx tsx apps/api/src/db/trigger-all-tests.ts");
  process.exit(1);
}

const SLUGS = [
  // EU company registries (Browserless + Claude extraction)
  "belgian-company-data",
  "dutch-company-data",
  "german-company-data",
  "austrian-company-data",
  "irish-company-data",
  "latvian-company-data",
  "lithuanian-company-data",
  "swiss-company-data",
  "spanish-company-data",
  "italian-company-data",
  "portuguese-company-data",
  "swedish-company-data",
  // Web scraping / rendering
  "url-to-markdown",
  "screenshot-url",
  "cookie-scan",
  "seo-audit",
  "tech-stack-detect",
  "landing-page-roast",
  "html-to-pdf",
  "structured-scrape",
  "competitor-compare",
  "pricing-page-extract",
];

interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  avgResponseTimeMs: number;
  results: Array<{
    testType: string;
    passed: boolean;
    failureReason?: string;
    responseTimeMs: number;
  }>;
}

async function runTestsForSlug(slug: string): Promise<{ status: number; body: TestSummary | null; error?: string }> {
  try {
    const resp = await fetch(`${BASE_URL}/v1/internal/tests/run?slug=${encodeURIComponent(slug)}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ADMIN_SECRET}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(120_000), // 2 min per capability
    });

    const text = await resp.text();
    let body: TestSummary | null = null;
    try {
      body = JSON.parse(text);
    } catch {
      return { status: resp.status, body: null, error: text.slice(0, 200) };
    }

    return { status: resp.status, body };
  } catch (err) {
    return { status: 0, body: null, error: (err as Error).message };
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Run all ─────────────────────────────────────────────────────────────────

console.log(`=== Triggering test runs for ${SLUGS.length} Browserless capabilities ===`);
console.log(`Target: ${BASE_URL}`);
console.log(`Started: ${new Date().toISOString()}\n`);

const summary: Array<{ slug: string; passed: number; total: number; failures: string[] }> = [];

for (let i = 0; i < SLUGS.length; i++) {
  const slug = SLUGS[i];
  process.stdout.write(`[${i + 1}/${SLUGS.length}] ${slug} ... `);

  const { status, body, error } = await runTestsForSlug(slug);

  if (error || !body || status !== 200) {
    console.log(`HTTP ${status || "ERR"} — ${error ?? JSON.stringify(body)?.slice(0, 100)}`);
    summary.push({ slug, passed: 0, total: 0, failures: [error ?? `HTTP ${status}`] });
  } else {
    const passRate = body.total > 0 ? `${body.passed}/${body.total}` : "0/0";
    const avgMs = body.avgResponseTimeMs ? `${body.avgResponseTimeMs}ms avg` : "";
    console.log(`${passRate} passed  ${avgMs}`);

    const failures: string[] = [];
    for (const r of body.results ?? []) {
      if (!r.passed) {
        const reason = r.failureReason ?? "unknown";
        const short = reason.length > 100 ? reason.slice(0, 100) + "..." : reason;
        console.log(`  ❌ [${r.testType}] ${short}`);
        failures.push(`[${r.testType}] ${reason}`);
      }
    }

    summary.push({ slug, passed: body.passed, total: body.total, failures });
  }

  if (i < SLUGS.length - 1) {
    await sleep(2000);
  }
}

// ─── Final summary ────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(60)}`);
console.log(`SUMMARY — ${new Date().toISOString()}`);
console.log(`${"=".repeat(60)}`);

const allPassed = summary.filter((s) => s.failures.length === 0);
const hasFailed = summary.filter((s) => s.failures.length > 0);

console.log(`\n✅ All tests passed (${allPassed.length} capabilities):`);
for (const s of allPassed) {
  console.log(`   ${s.slug}  ${s.passed}/${s.total}`);
}

if (hasFailed.length > 0) {
  console.log(`\n❌ Had failures (${hasFailed.length} capabilities):`);
  for (const s of hasFailed) {
    console.log(`   ${s.slug}  ${s.passed}/${s.total}`);
    for (const f of s.failures) {
      const short = f.length > 120 ? f.slice(0, 120) + "..." : f;
      console.log(`      ${short}`);
    }
  }
}

const totalTests = summary.reduce((acc, s) => acc + s.total, 0);
const totalPassed = summary.reduce((acc, s) => acc + s.passed, 0);
console.log(`\nOverall: ${totalPassed}/${totalTests} tests passed across ${SLUGS.length} capabilities`);
