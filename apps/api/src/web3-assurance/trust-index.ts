/**
 * Strale Trust Index — public DeFi protocol ranking.
 *
 * GET /v1/web3-assurance/trust-index
 *
 * Tier-2 distribution play from the strategic memo: a public ranking of
 * top DeFi protocols by Strale Web3 Assurance verdict. Recurring artifact
 * for SEO + earned media + builder reference.
 *
 * v0.1 ships with a curated set of ~25 top protocols. Computes assurance
 * verdicts lazily, caches for 6 hours. First request triggers a refresh;
 * subsequent requests serve cached snapshot. Verdicts run in batches of 5
 * with 200ms spacing to stay friendly to upstream rate limits.
 *
 * v0.2: scheduled cron refresh + persistence to Postgres + historical
 * trend lines per protocol.
 */

import { Hono } from "hono";
import { compose, computeVerdict } from "./index.js";
import type { AppEnv } from "../types.js";
import type { ComposeResult } from "./composer.js";
import type { VerdictResult } from "./verdict.js";

const REFRESH_TTL_MS = 6 * 60 * 60 * 1000;
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 200;

interface ProtocolEntry {
  slug: string;
  display_name: string;
  category: string;
  chain: string;
}

const TOP_PROTOCOLS: ProtocolEntry[] = [
  { slug: "aave-v3", display_name: "Aave V3", category: "Lending", chain: "ethereum" },
  { slug: "compound-v3", display_name: "Compound V3", category: "Lending", chain: "ethereum" },
  { slug: "morpho", display_name: "Morpho", category: "Lending", chain: "ethereum" },
  { slug: "uniswap-v3", display_name: "Uniswap V3", category: "DEX", chain: "ethereum" },
  { slug: "uniswap-v4", display_name: "Uniswap V4", category: "DEX", chain: "ethereum" },
  { slug: "curve-dex", display_name: "Curve", category: "DEX", chain: "ethereum" },
  { slug: "balancer-v2", display_name: "Balancer V2", category: "DEX", chain: "ethereum" },
  { slug: "lido", display_name: "Lido", category: "LST", chain: "ethereum" },
  { slug: "rocket-pool", display_name: "Rocket Pool", category: "LST", chain: "ethereum" },
  { slug: "ether-fi-stake", display_name: "Ether.fi", category: "LRT", chain: "ethereum" },
  { slug: "renzo", display_name: "Renzo", category: "LRT", chain: "ethereum" },
  { slug: "kelpdao", display_name: "KelpDAO", category: "LRT", chain: "ethereum" },
  { slug: "eigenlayer", display_name: "EigenLayer", category: "Restaking", chain: "ethereum" },
  { slug: "pendle", display_name: "Pendle", category: "Yield", chain: "ethereum" },
  { slug: "stargate", display_name: "Stargate", category: "Bridge", chain: "ethereum" },
  { slug: "across", display_name: "Across", category: "Bridge", chain: "ethereum" },
  { slug: "hop-protocol", display_name: "Hop Protocol", category: "Bridge", chain: "ethereum" },
  { slug: "makerdao", display_name: "MakerDAO", category: "CDP", chain: "ethereum" },
  { slug: "spark", display_name: "Spark", category: "Lending", chain: "ethereum" },
  { slug: "convex-finance", display_name: "Convex", category: "Yield", chain: "ethereum" },
  { slug: "yearn-finance", display_name: "Yearn Finance", category: "Yield", chain: "ethereum" },
  { slug: "ondo-finance", display_name: "Ondo Finance", category: "RWA", chain: "ethereum" },
  { slug: "ethena", display_name: "Ethena", category: "Synthetic", chain: "ethereum" },
  { slug: "frax", display_name: "Frax", category: "Stablecoin", chain: "ethereum" },
  { slug: "sky-money", display_name: "Sky", category: "Stablecoin", chain: "ethereum" },
];

interface TrustIndexEntry {
  slug: string;
  display_name: string;
  category: string;
  chain: string;
  verdict: string;
  confidence: number;
  reason_codes: string[];
  critical_flags: string[];
  evidence_completeness: string;
  computed_at: string;
}

interface TrustIndexCache {
  entries: TrustIndexEntry[];
  computed_at: string;
  ts: number;
}

let cache: TrustIndexCache | null = null;
let inFlight: Promise<TrustIndexCache> | null = null;

function summarizeEntry(
  entry: ProtocolEntry,
  composed: ComposeResult,
  verdict: VerdictResult,
): TrustIndexEntry {
  return {
    slug: entry.slug,
    display_name: entry.display_name,
    category: entry.category,
    chain: entry.chain,
    verdict: verdict.verdict,
    confidence: verdict.confidence,
    reason_codes: verdict.reason_codes,
    critical_flags: verdict.critical_flags,
    evidence_completeness: verdict.evidence_completeness,
    computed_at: composed.context.target ? new Date().toISOString() : new Date().toISOString(),
  };
}

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function refresh(): Promise<TrustIndexCache> {
  const entries: TrustIndexEntry[] = [];
  for (let i = 0; i < TOP_PROTOCOLS.length; i += BATCH_SIZE) {
    const batch = TOP_PROTOCOLS.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (entry) => {
        const composed = await compose({
          target: entry.slug,
          target_type: "protocol",
          chain: entry.chain,
        });
        const verdict = computeVerdict(composed);
        return summarizeEntry(entry, composed, verdict);
      }),
    );
    entries.push(...batchResults);
    if (i + BATCH_SIZE < TOP_PROTOCOLS.length) await delay(BATCH_DELAY_MS);
  }

  const next: TrustIndexCache = {
    entries,
    computed_at: new Date().toISOString(),
    ts: Date.now(),
  };
  cache = next;
  return next;
}

async function getOrRefresh(): Promise<TrustIndexCache> {
  if (cache && Date.now() - cache.ts < REFRESH_TTL_MS) return cache;
  if (inFlight) return inFlight;
  inFlight = refresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

const VERDICT_ORDER: Record<string, number> = {
  block: 4,
  review: 3,
  insufficient_evidence: 2,
  proceed: 1,
};

export const trustIndexRoute = new Hono<AppEnv>();

trustIndexRoute.get("/", async (c) => {
  const force = c.req.query("force") === "true";
  if (force) cache = null;

  let snapshot: TrustIndexCache;
  try {
    snapshot = await getOrRefresh();
  } catch (err) {
    return c.json(
      {
        error: "trust_index_refresh_failed",
        message: err instanceof Error ? err.message : "unknown",
      },
      503,
    );
  }

  const sorted = [...snapshot.entries].sort((a, b) => {
    const orderDiff =
      (VERDICT_ORDER[b.verdict] ?? 0) - (VERDICT_ORDER[a.verdict] ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return b.critical_flags.length - a.critical_flags.length;
  });

  const counts: Record<string, number> = {
    proceed: 0,
    review: 0,
    block: 0,
    insufficient_evidence: 0,
  };
  for (const e of sorted) counts[e.verdict] = (counts[e.verdict] ?? 0) + 1;

  return c.json(
    {
      product: "Strale Trust Index",
      version: "v0.1",
      universe_size: snapshot.entries.length,
      computed_at: snapshot.computed_at,
      verdict_counts: counts,
      methodology: {
        scope: "Top 25 DeFi protocols on Ethereum mainnet",
        evaluator_set: "Full Web3 Assurance composer (25 evaluators, outbound mode)",
        sort_order: "Highest-severity verdict first; ties broken by critical-flags count",
        refresh_cadence: "Lazy-cached 6 hours; v0.2 will move to scheduled cron + persistent history",
      },
      entries: sorted,
    },
    200,
    {
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  );
});
