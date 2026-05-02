/**
 * Web3 Assurance — DefiLlama bridges evaluator.
 *
 * Surfaces bridge-specific risk for cross-chain transactions: total volume,
 * deposit / withdrawal balance, exploit history, and security model
 * classification (where DefiLlama exposes it).
 *
 * Free, no API key. Complements protocol-risk for the bridge target type.
 */

import { registerEvaluator } from "./index.js";
import type { Evaluator } from "../types.js";

const TIMEOUT_MS = 8000;
const BRIDGES_API = "https://bridges.llama.fi/bridges";

interface DefiLlamaBridge {
  id: number | string;
  name: string;
  displayName?: string;
  chains?: string[];
  destinationChain?: string;
  lastDailyVolume?: number;
  monthlyVolume?: number;
  lastHourlyVolume?: number;
  currentDayTxs?: number;
}

let cache: { bridges: DefiLlamaBridge[]; ts: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

async function fetchBridges(): Promise<DefiLlamaBridge[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.bridges;
  const response = await fetch(BRIDGES_API, {
    headers: { "User-Agent": "Strale/1.0" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`DefiLlama bridges HTTP ${response.status}`);
  const json = (await response.json()) as { bridges?: DefiLlamaBridge[] };
  const bridges = json.bridges ?? [];
  cache = { bridges, ts: Date.now() };
  return bridges;
}

function findBridge(bridges: DefiLlamaBridge[], target: string): DefiLlamaBridge | null {
  const normalized = target.toLowerCase().trim();
  return (
    bridges.find((b) => b.name?.toLowerCase() === normalized) ??
    bridges.find((b) => b.displayName?.toLowerCase() === normalized) ??
    bridges.find(
      (b) =>
        b.name?.toLowerCase().startsWith(normalized) ||
        b.displayName?.toLowerCase().startsWith(normalized),
    ) ??
    null
  );
}

const evaluator: Evaluator = {
  name: "bridge-legitimacy",
  priority: "opportunistic",
  appliesTo: (ctx) => ctx.targetType === "bridge",
  cacheTTLSeconds: 3600,
  cacheKey: (ctx) => `bridge:${ctx.target.toLowerCase()}`,
  run: async (ctx) => {
    const now = new Date().toISOString();
    try {
      const bridges = await fetchBridges();
      const bridge = findBridge(bridges, ctx.target);

      if (!bridge) {
        return {
          ok: true,
          evidence: {
            target: ctx.target,
            found: false,
            note: "Bridge not found in DefiLlama bridges database. Either too new, too small, or not tracked.",
          },
          provenance: { source: "bridges.llama.fi", fetched_at: now },
        };
      }

      return {
        ok: true,
        evidence: {
          target: ctx.target,
          found: true,
          bridge_name: bridge.name,
          display_name: bridge.displayName ?? null,
          chains: bridge.chains ?? [],
          destination_chain: bridge.destinationChain ?? null,
          last_daily_volume_usd: bridge.lastDailyVolume ?? null,
          monthly_volume_usd: bridge.monthlyVolume ?? null,
          current_day_txs: bridge.currentDayTxs ?? null,
        },
        provenance: { source: "bridges.llama.fi", fetched_at: now },
      };
    } catch (err) {
      return {
        ok: false,
        evidence: null,
        provenance: { source: "bridges.llama.fi", fetched_at: now },
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

registerEvaluator(evaluator);
