/**
 * Web3 Assurance — cross-protocol exposure evaluator.
 *
 * Tier-2 moat from the 2026-05-01 strategic deep-dive: surface the
 * composability blast radius of a target. The KelpDAO failure cascaded
 * to $177M of Aave bad debt because rsETH was used as collateral elsewhere.
 * Pre-transaction, no counterparty-assurance product surfaces *what
 * downstream protocols you become indirectly exposed to* if the target
 * fails.
 *
 * v0.1 surfaces three first-order dependencies via DefiLlama free data:
 *   - parent_protocol (the protocol family, e.g. Aave V2 -> Aave)
 *   - forked_from (lineage; if the parent has a documented exploit, your
 *     fork inherits the design)
 *   - oracle_dependencies (Chainlink / Pyth / unknown / sketchy)
 *
 * v0.2 will add multi-hop traversal (DefiLlama protocol-token holdings
 * + cross-protocol stable/LST/LRT relationships) for the recursive case
 * (rsETH -> stETH -> Lido validators -> Ethereum staking).
 *
 * Free no-key data; existing DefiLlama integration reused.
 */

import { registerEvaluator } from "./index.js";
import type { Evaluator, EvaluatorContext } from "../types.js";

const PROTOCOL_DETAIL_API = "https://api.llama.fi/protocol";
const PROTOCOLS_LIST_API = "https://api.llama.fi/protocols";
const HACKS_API = "https://api.llama.fi/hacks";
const TIMEOUT_MS = 8000;

const REPUTABLE_ORACLES = new Set<string>([
  "Chainlink",
  "Pyth",
  "RedStone",
  "API3",
  "UMA",
  "Tellor",
]);

interface DefiLlamaProtocolListEntry {
  id: string;
  name: string;
  slug: string;
  address?: string;
  oracles?: string[];
  forkedFrom?: string[];
  parentProtocol?: string;
}

interface DefiLlamaProtocolDetail {
  id: string;
  name: string;
  slug: string;
  oracles?: string[];
  forkedFrom?: string[];
  parentProtocol?: string;
  category?: string;
  audit_links?: string[];
}

interface DefiLlamaHack {
  date: number;
  name: string;
  classification: string;
  amount: number;
  defillamaId?: string;
}

let listCache: { protocols: DefiLlamaProtocolListEntry[]; ts: number } | null = null;
let hacksCache: { hacks: DefiLlamaHack[]; ts: number } | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000;

async function fetchProtocolList(): Promise<DefiLlamaProtocolListEntry[]> {
  if (listCache && Date.now() - listCache.ts < CACHE_TTL_MS) return listCache.protocols;
  const response = await fetch(PROTOCOLS_LIST_API, {
    headers: { "User-Agent": "Strale/1.0" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`DefiLlama protocols HTTP ${response.status}`);
  const data = (await response.json()) as DefiLlamaProtocolListEntry[];
  listCache = { protocols: data, ts: Date.now() };
  return data;
}

async function fetchHacks(): Promise<DefiLlamaHack[]> {
  if (hacksCache && Date.now() - hacksCache.ts < CACHE_TTL_MS) return hacksCache.hacks;
  const response = await fetch(HACKS_API, {
    headers: { "User-Agent": "Strale/1.0" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`DefiLlama hacks HTTP ${response.status}`);
  const data = (await response.json()) as DefiLlamaHack[];
  hacksCache = { hacks: data, ts: Date.now() };
  return data;
}

async function fetchProtocolDetail(slug: string): Promise<DefiLlamaProtocolDetail | null> {
  try {
    const response = await fetch(`${PROTOCOL_DETAIL_API}/${encodeURIComponent(slug)}`, {
      headers: { "User-Agent": "Strale/1.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as DefiLlamaProtocolDetail;
  } catch {
    return null;
  }
}

function findProtocol(
  protocols: DefiLlamaProtocolListEntry[],
  target: string,
): DefiLlamaProtocolListEntry | null {
  const normalized = target.toLowerCase().trim();
  return (
    protocols.find((p) => p.address && p.address.toLowerCase() === normalized) ??
    protocols.find((p) => p.slug?.toLowerCase() === normalized) ??
    protocols.find((p) => p.name?.toLowerCase() === normalized) ??
    protocols.find(
      (p) =>
        p.slug?.toLowerCase().startsWith(`${normalized}-`) ||
        p.name?.toLowerCase().startsWith(`${normalized} `),
    ) ??
    null
  );
}

function classifyOracle(oracle: string): "reputable" | "unknown" {
  return REPUTABLE_ORACLES.has(oracle) ? "reputable" : "unknown";
}

function findRelatedHacks(
  hacks: DefiLlamaHack[],
  candidates: string[],
): DefiLlamaHack[] {
  const lowerCandidates = candidates.map((c) => c.toLowerCase());
  return hacks.filter((h) =>
    lowerCandidates.includes(h.name.toLowerCase()),
  );
}

const evaluator: Evaluator = {
  name: "cross-protocol-exposure",
  priority: "opportunistic",
  appliesTo: (ctx: EvaluatorContext) =>
    ctx.targetType === "protocol" || ctx.targetType === "contract",
  cacheTTLSeconds: 1800,
  cacheKey: (ctx) => `cross-exposure:${ctx.target.toLowerCase()}`,
  run: async (ctx) => {
    const now = new Date().toISOString();
    try {
      const [protocols, hacks] = await Promise.all([fetchProtocolList(), fetchHacks()]);
      const listEntry = findProtocol(protocols, ctx.target);

      if (!listEntry) {
        return {
          ok: true,
          evidence: {
            target: ctx.target,
            found: false,
            note: "Target not in DefiLlama. v0.2 will fall back to on-chain composability traversal for unindexed contracts.",
          },
          provenance: { source: "api.llama.fi", fetched_at: now },
        };
      }

      const detail = await fetchProtocolDetail(listEntry.slug);
      const oracles = detail?.oracles ?? listEntry.oracles ?? [];
      const forkedFrom = detail?.forkedFrom ?? listEntry.forkedFrom ?? [];
      const parent = detail?.parentProtocol ?? listEntry.parentProtocol ?? null;

      const reputableOracles = oracles.filter((o) => classifyOracle(o) === "reputable");
      const unknownOracles = oracles.filter((o) => classifyOracle(o) === "unknown");

      const exposureCandidates: string[] = [
        ...(parent ? [parent] : []),
        ...forkedFrom,
        ...oracles,
      ];
      const relatedHacks = findRelatedHacks(hacks, exposureCandidates);
      const recentHack = relatedHacks
        .sort((a, b) => b.date - a.date)
        .find((h) => (Date.now() - h.date * 1000) / (86400 * 1000) < 365);

      let exposureRiskLevel: "critical" | "high" | "medium" | "low" | "unknown";
      if (recentHack) {
        const daysAgo = Math.floor(
          (Date.now() - recentHack.date * 1000) / (86400 * 1000),
        );
        exposureRiskLevel = daysAgo < 90 ? "critical" : "high";
      } else if (oracles.length === 0 && (forkedFrom.length > 0 || parent)) {
        exposureRiskLevel = "medium";
      } else if (unknownOracles.length > reputableOracles.length) {
        exposureRiskLevel = "medium";
      } else if (oracles.length > 0 && reputableOracles.length === oracles.length) {
        exposureRiskLevel = "low";
      } else {
        exposureRiskLevel = "unknown";
      }

      return {
        ok: true,
        evidence: {
          target: ctx.target,
          found: true,
          protocol_name: listEntry.name,
          parent_protocol: parent,
          forked_from: forkedFrom,
          oracle_dependencies: oracles,
          reputable_oracles: reputableOracles,
          unknown_oracles: unknownOracles,
          related_hacks_count: relatedHacks.length,
          last_related_hack: recentHack
            ? {
                name: recentHack.name,
                date: new Date(recentHack.date * 1000).toISOString(),
                classification: recentHack.classification,
                amount_usd: recentHack.amount,
              }
            : null,
          exposure_risk_level: exposureRiskLevel,
          composability_chain_depth: 1,
          v0_2_planned: "multi-hop traversal via DefiLlama protocol-token holdings",
        },
        provenance: {
          source: "api.llama.fi",
          fetched_at: now,
          endpoints: ["protocols", "protocol/{slug}", "hacks"],
        },
      };
    } catch (err) {
      return {
        ok: false,
        evidence: null,
        provenance: { source: "api.llama.fi", fetched_at: now },
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

registerEvaluator(evaluator);
