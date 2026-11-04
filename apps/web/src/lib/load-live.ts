// Live data: everything the site shows about the catalogue comes from the
// production API at build time. A failure here fails the build; the site is
// never published from stale or partial data.
import type { Capability, Limitation, PlatformFacts, Solution, SolutionDetail, Trust, X402Catalog } from "./types.ts";

const TIMEOUT_MS = 30_000;
const RETRIES = 4;

/**
 * /v1/public/ops/* allows 120 requests a minute per IP (apps/api/src/app.ts).
 * The build makes several hundred of them, so it paces itself below that:
 * one request start every OPS_INTERVAL_MS, shared across all concurrent calls.
 * The interval is a parameter so tests against a local API need not wait.
 */
export const OPS_INTERVAL_MS = Number(process.env.STRALE_OPS_INTERVAL_MS ?? 650);
let nextOpsSlot = 0;
async function paceOps(path: string) {
  if (!path.startsWith("/v1/public/ops/") || OPS_INTERVAL_MS <= 0) return;
  const now = Date.now();
  const at = Math.max(now, nextOpsSlot);
  nextOpsSlot = at + OPS_INTERVAL_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

export class HttpError extends Error {
  status: number;
  constructor(url: string, status: number) {
    super(`${url} answered ${status}`);
    this.status = status;
  }
}

export async function getJson<T>(base: string, path: string): Promise<T> {
  const url = `${base}${path}`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    await paceOps(path);
    let wait = 1000 * attempt;
    try {
      const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "strale-web-build" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) return (await res.json()) as T;
      lastError = new HttpError(url, res.status);
      if (res.status === 429) wait = Math.min(Number(res.headers.get("retry-after") ?? 60), 90) * 1000;
      else if (res.status < 500) break;
    } catch (err) {
      lastError = err;
    }
    if (attempt < RETRIES) await new Promise((r) => setTimeout(r, wait));
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  const err = new Error(`Site build could not read ${url}: ${detail}`);
  (err as Error & { status?: number }).status = lastError instanceof HttpError ? lastError.status : undefined;
  throw err;
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

  // The bundle's own input schema, example input and step order exist only on the detail route.
  const details = await mapLimit(sols.solutions, 6, (s) => getJson<SolutionDetail>(base, `/v1/solutions/${encodeURIComponent(s.slug)}`));
  sols.solutions.forEach((s, i) => {
    const d = details[i];
    s.detail = { long_description: d.long_description ?? null, input_schema: d.input_schema ?? null, example_input: d.example_input ?? null, steps: d.steps ?? [] };
  });

  // Limitations are shown as written (SITE-STRUCTURE tool page §7), from the same table the API serves.
  const limitations = new Map<string, Limitation[]>();
  const capLimits = await mapLimit(caps.capabilities, 6, (c) =>
    getJson<{ limitations: Limitation[] }>(base, `/v1/public/ops/limitations/capabilities/${encodeURIComponent(c.slug)}`),
  );
  caps.capabilities.forEach((c, i) => limitations.set(c.slug, capLimits[i].limitations ?? []));
  const solutionLimitations = new Map<string, Limitation[]>();
  // The solutions route answers 404 for a bundle with no visible steps: that, and only that, means "none".
  const solLimits = await mapLimit(sols.solutions, 6, (s) =>
    getJson<{ steps: { capability_slug: string; limitations: Limitation[] }[] }>(base, `/v1/public/ops/limitations/solutions/${encodeURIComponent(s.slug)}`).catch((e: Error & { status?: number }) => {
      if (e.status === 404) return { steps: [] };
      throw e;
    }),
  );
  sols.solutions.forEach((s, i) => solutionLimitations.set(s.slug, solLimits[i].steps.flatMap((st) => st.limitations.map((l) => ({ ...l, step: st.capability_slug })))));

  return { facts, capabilities: caps.capabilities, solutions: sols.solutions, x402, trust, limitations, solutionLimitations };
}
