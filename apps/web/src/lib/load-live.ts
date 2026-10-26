// Live data: everything the site shows about the catalogue comes from the
// production API at build time. A failure here fails the build; the site is
// never published from stale or partial data.
import type { Capability, PlatformFacts, Solution, Trust, X402Catalog } from "./types.ts";

const TIMEOUT_MS = 30_000;
const RETRIES = 3;

export async function getJson<T>(base: string, path: string): Promise<T> {
  const url = `${base}${path}`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "strale-web-build" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) return (await res.json()) as T;
      lastError = new Error(`${url} answered ${res.status}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  throw new Error(`Site build could not read ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

/** Runs fn over items with at most `limit` in flight, keeping order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function loadLive(base: string) {
  const [facts, caps, sols, x402] = await Promise.all([
    getJson<PlatformFacts>(base, "/v1/platform/facts"),
    getJson<{ capabilities: Capability[] }>(base, "/v1/capabilities"),
    getJson<{ solutions: Solution[] }>(base, "/v1/solutions"),
    getJson<X402Catalog>(base, "/x402/catalog"),
  ]);
  if (!Array.isArray(caps.capabilities) || caps.capabilities.length === 0) throw new Error("/v1/capabilities returned no tools; refusing to build an empty catalogue");

  // Test status comes only from the trust batch endpoint (MESSAGING-LEVELS L3.10): /v1/capabilities'
  // own last_tested_at disagrees with it and is never shown.
  const trust = new Map<string, Trust>();
  const batches = chunks(caps.capabilities.map((c) => c.slug), 100);
  const results = await mapLimit(batches, 3, (slugs) =>
    getJson<Record<string, Trust>>(base, `/v1/public/ops/trust/capabilities/batch?slugs=${slugs.map(encodeURIComponent).join(",")}`),
  );
  for (const r of results) for (const [slug, t] of Object.entries(r)) trust.set(slug, { tested: t.tested, last_tested_at: t.last_tested_at, pass_rate: t.pass_rate });

  return { facts, capabilities: caps.capabilities, solutions: sols.solutions, x402, trust };
}
