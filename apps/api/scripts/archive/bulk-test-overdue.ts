/**
 * Bulk-trigger test runs against overdue capabilities to accelerate SQS
 * recovery after the Browserless outage. Hits the production admin endpoint
 * (POST /v1/internal/tests/run?slug=<slug>) so tests run on Railway with
 * production creds and IPs — no local execution.
 *
 * Concurrency is bounded to avoid overwhelming external providers. The
 * scheduler's natural batch is 20 every 5 min with 2s spacing; this script
 * goes faster but still respectfully (default: 4 in flight, 1s gap between
 * starts).
 *
 * Reads ADMIN_SECRET from the local Railway CLI link.
 */
import { execSync } from "node:child_process";

const PROD_BASE = "https://strale-production.up.railway.app";
const CONCURRENCY = 4;
const STAGGER_MS = 1000;
const PER_CALL_TIMEOUT_MS = 90_000; // some scrape caps need ~60s

function getAdminSecret(): string {
  const out = execSync("railway variables --kv", { encoding: "utf8" });
  const m = out.match(/^ADMIN_SECRET=(.+)$/m);
  if (!m) throw new Error("ADMIN_SECRET not found via railway variables");
  return m[1].trim();
}

async function fetchOverdueSlugs(): Promise<string[]> {
  // Use the public ops trust endpoint — gives us all capabilities with their
  // current SQS state. We filter for ones that look stale.
  const res = await fetch(`${PROD_BASE}/v1/capabilities`);
  const data = await res.json();
  const now = Date.now();
  const stale: { slug: string; ageH: number }[] = [];
  for (const c of data.capabilities) {
    const lt = c.last_tested_at ? new Date(c.last_tested_at).getTime() : null;
    if (!lt) {
      stale.push({ slug: c.slug, ageH: Infinity });
      continue;
    }
    const ageH = (now - lt) / 3_600_000;
    if (ageH > 24) stale.push({ slug: c.slug, ageH });
  }
  // Oldest first — same order the scheduler uses
  stale.sort((a, b) => b.ageH - a.ageH);
  return stale.map((s) => s.slug);
}

async function triggerTest(
  slug: string,
  adminSecret: string,
): Promise<{ slug: string; ok: boolean; passed?: number; failed?: number; total?: number; error?: string; ms: number }> {
  const t0 = Date.now();
  try {
    const res = await fetch(
      `${PROD_BASE}/v1/internal/tests/run?slug=${encodeURIComponent(slug)}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${adminSecret}` },
        signal: AbortSignal.timeout(PER_CALL_TIMEOUT_MS),
      },
    );
    const ms = Date.now() - t0;
    if (!res.ok) {
      const text = await res.text();
      return { slug, ok: false, error: `HTTP ${res.status}: ${text.slice(0, 100)}`, ms };
    }
    const json = (await res.json()) as { passed?: number; failed?: number; total?: number };
    return { slug, ok: true, passed: json.passed, failed: json.failed, total: json.total, ms };
  } catch (e: any) {
    return { slug, ok: false, error: e.message?.slice(0, 100) ?? String(e), ms: Date.now() - t0 };
  }
}

async function main() {
  const argMax = Number(process.argv.find((a) => a.startsWith("--max="))?.slice(6)) || Infinity;
  const dryRun = process.argv.includes("--dry-run");

  console.log("Fetching overdue capabilities...");
  const all = await fetchOverdueSlugs();
  const slugs = all.slice(0, argMax);
  console.log(`Total overdue (>24h): ${all.length}, processing: ${slugs.length}`);
  if (dryRun) {
    console.log("--- dry-run: showing first 30 slugs ---");
    for (const s of slugs.slice(0, 30)) console.log(`  ${s}`);
    return;
  }

  const adminSecret = getAdminSecret();
  console.log(`Concurrency: ${CONCURRENCY}, stagger: ${STAGGER_MS}ms`);
  console.log("");

  const queue = [...slugs];
  let inFlight = 0;
  let done = 0;
  const startedAt = Date.now();
  const results = { ok: 0, failed: 0, http_error: 0 };

  await new Promise<void>((resolve) => {
    function dispatch() {
      while (inFlight < CONCURRENCY && queue.length > 0) {
        const slug = queue.shift()!;
        inFlight++;
        triggerTest(slug, adminSecret).then((r) => {
          inFlight--;
          done++;
          const tag = r.ok
            ? `ok (${r.passed}/${r.total} passed)`
            : `ERR ${r.error}`;
          const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
          console.log(`[${done}/${slugs.length}] (${elapsed}s) ${slug.padEnd(35)} ${r.ms}ms ${tag}`);
          if (r.ok) {
            if ((r.failed ?? 0) > 0) results.failed++;
            else results.ok++;
          } else results.http_error++;
          if (queue.length === 0 && inFlight === 0) resolve();
          else setTimeout(dispatch, STAGGER_MS);
        });
      }
    }
    dispatch();
  });

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log("");
  console.log(`=== Done in ${elapsedSec}s ===`);
  console.log(`  ok (all passed):       ${results.ok}`);
  console.log(`  ok (some failed):      ${results.failed}`);
  console.log(`  endpoint errors:       ${results.http_error}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
