/**
 * Web3 Assurance — ScamSniffer scam-cluster cross-reference.
 *
 * ScamSniffer maintains an open-source repository of phishing wallet addresses
 * and phishing domains, refreshed daily (with a 7-day delay on the open feed;
 * real-time premium tier deferred to Phase 4).
 *
 * v1 fetches the address blacklist from GitHub once per startup + every 6h,
 * caches in memory. The list is small enough (~10k addresses) for in-memory
 * lookup.
 */

import { registerEvaluator } from "./index.js";
import type { Evaluator } from "../types.js";

const ADDRESS_LIST_URL =
  "https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/address.json";
const REFRESH_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10000;

interface ScamCache {
  addresses: Set<string>;
  fetched_at: string;
  ts: number;
}

let cache: ScamCache | null = null;
let inFlight: Promise<ScamCache> | null = null;

async function loadList(): Promise<ScamCache> {
  if (cache && Date.now() - cache.ts < REFRESH_MS) return cache;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const response = await fetch(ADDRESS_LIST_URL, {
        headers: { "User-Agent": "Strale/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`ScamSniffer HTTP ${response.status}`);
      const arr = (await response.json()) as string[];
      const next: ScamCache = {
        addresses: new Set(arr.map((a) => a.toLowerCase())),
        fetched_at: new Date().toISOString(),
        ts: Date.now(),
      };
      cache = next;
      return next;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

const evaluator: Evaluator = {
  name: "scam-cluster",
  priority: "critical",
  appliesTo: (ctx) =>
    ctx.targetType === "wallet" &&
    /^0x[a-fA-F0-9]{40}$/.test(ctx.target),
  cacheTTLSeconds: 21600,
  cacheKey: (ctx) => `scamsniffer:${ctx.target.toLowerCase()}`,
  run: async (ctx) => {
    const now = new Date().toISOString();
    try {
      const list = await loadList();
      const isMatch = list.addresses.has(ctx.target.toLowerCase());
      return {
        ok: true,
        evidence: {
          target: ctx.target,
          is_scam_cluster: isMatch,
          source: "scamsniffer/scam-database",
          list_fetched_at: list.fetched_at,
          list_size: list.addresses.size,
          note: isMatch
            ? "Address present on ScamSniffer phishing-address list. Open feed has 7-day delay; recent inclusion possible."
            : "Address not on ScamSniffer phishing-address list. Open feed has 7-day delay; recent additions may not yet be reflected.",
        },
        provenance: {
          source: "github.com/scamsniffer/scam-database",
          fetched_at: now,
        },
      };
    } catch (err) {
      return {
        ok: false,
        evidence: null,
        provenance: {
          source: "github.com/scamsniffer/scam-database",
          fetched_at: now,
        },
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

registerEvaluator(evaluator);
