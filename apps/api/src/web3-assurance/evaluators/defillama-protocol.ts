/**
 * Web3 Assurance — DefiLlama protocol risk evaluator.
 *
 * Free, no API key, no rate limit. The single most useful free source in
 * crypto: 7,000+ protocols, 500+ chains, $140B+ TVL tracked, exploits DB.
 *
 * For a contract / protocol / token target, this evaluator finds the protocol
 * (by contract address or slug match) and surfaces:
 *   - TVL trend (current, change_1d, change_7d, change_1m)
 *   - Hack/exploit history (severity, dates, recovery)
 *   - Governance signal (audit list, oracle list, listed_at)
 *   - Treasury / forks / parent protocol context
 */

import { registerEvaluator } from "./index.js";
import type { Evaluator, EvaluatorContext } from "../types.js";

const PROTOCOLS_API = "https://api.llama.fi/protocols";
const HACKS_API = "https://api.llama.fi/hacks";
const TIMEOUT_MS = 8000;

interface DefiLlamaProtocol {
  id: string;
  name: string;
  slug: string;
  tvl: number;
  change_1d?: number;
  change_7d?: number;
  change_1m?: number;
  category?: string;
  chains?: string[];
  audits?: string;
  audit_links?: string[];
  oracles?: string[];
  forkedFrom?: string[];
  listedAt?: number;
  address?: string;
  symbol?: string;
}

interface DefiLlamaHack {
  date: number;
  name: string;
  classification: string;
  technique?: string;
  amount: number;
  source?: string;
  returnedFunds?: number;
  chain?: string;
  defillamaId?: string;
}

let protocolCache: { protocols: DefiLlamaProtocol[]; ts: number } | null = null;
let hackCache: { hacks: DefiLlamaHack[]; ts: number } | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000;

async function fetchProtocols(): Promise<DefiLlamaProtocol[]> {
  if (protocolCache && Date.now() - protocolCache.ts < CACHE_TTL_MS) {
    return protocolCache.protocols;
  }
  const response = await fetch(PROTOCOLS_API, {
    headers: { "User-Agent": "Strale/1.0" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`DefiLlama protocols HTTP ${response.status}`);
  const data = (await response.json()) as DefiLlamaProtocol[];
  protocolCache = { protocols: data, ts: Date.now() };
  return data;
}

async function fetchHacks(): Promise<DefiLlamaHack[]> {
  if (hackCache && Date.now() - hackCache.ts < CACHE_TTL_MS) {
    return hackCache.hacks;
  }
  const response = await fetch(HACKS_API, {
    headers: { "User-Agent": "Strale/1.0" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`DefiLlama hacks HTTP ${response.status}`);
  const data = (await response.json()) as DefiLlamaHack[];
  hackCache = { hacks: data, ts: Date.now() };
  return data;
}

function findProtocol(
  protocols: DefiLlamaProtocol[],
  target: string,
): { protocol: DefiLlamaProtocol | null; ambiguous_candidates?: string[] } {
  const normalized = target.toLowerCase().trim();
  const byAddress = protocols.find(
    (p) => p.address && p.address.toLowerCase() === normalized,
  );
  if (byAddress) return { protocol: byAddress };
  const bySlug = protocols.find((p) => p.slug?.toLowerCase() === normalized);
  if (bySlug) return { protocol: bySlug };
  const byName = protocols.find((p) => p.name?.toLowerCase() === normalized);
  if (byName) return { protocol: byName };

  const familyMatches = protocols.filter(
    (p) =>
      p.slug?.toLowerCase().startsWith(`${normalized}-`) ||
      p.slug?.toLowerCase().startsWith(`${normalized}_`) ||
      p.name?.toLowerCase().startsWith(`${normalized} `),
  );
  if (familyMatches.length === 1) return { protocol: familyMatches[0] };
  if (familyMatches.length > 1) {
    const sorted = familyMatches.sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0));
    return {
      protocol: sorted[0],
      ambiguous_candidates: sorted.slice(0, 5).map((p) => p.slug ?? p.name ?? ""),
    };
  }

  return { protocol: null };
}

function findRelevantHacks(
  hacks: DefiLlamaHack[],
  protocolName: string | null,
  protocolId: string | null,
): DefiLlamaHack[] {
  if (!protocolName && !protocolId) return [];
  return hacks.filter((h) => {
    if (protocolId && h.defillamaId === protocolId) return true;
    if (protocolName && h.name.toLowerCase() === protocolName.toLowerCase()) return true;
    return false;
  });
}

const evaluator: Evaluator = {
  name: "protocol-risk",
  priority: "opportunistic",
  appliesTo: (ctx: EvaluatorContext) =>
    ctx.targetType === "protocol" || ctx.targetType === "contract",
  cacheTTLSeconds: 3600,
  cacheKey: (ctx) => `protocol-risk:${ctx.target.toLowerCase()}`,
  run: async (ctx) => {
    const now = new Date().toISOString();
    try {
      const [protocols, hacks] = await Promise.all([fetchProtocols(), fetchHacks()]);
      const { protocol, ambiguous_candidates } = findProtocol(protocols, ctx.target);

      if (!protocol) {
        return {
          ok: true,
          evidence: {
            target: ctx.target,
            found: false,
            note: "Protocol not found in DefiLlama database. Either too new, too small (<$1M TVL typical threshold), or not on a tracked chain.",
          },
          provenance: { source: "api.llama.fi", fetched_at: now },
        };
      }

      const relevantHacks = findRelevantHacks(hacks, protocol.name, protocol.id);
      const lastHack = relevantHacks.length > 0
        ? relevantHacks.sort((a, b) => b.date - a.date)[0]
        : null;
      const totalLost = relevantHacks.reduce((sum, h) => sum + (h.amount ?? 0), 0);
      const totalRecovered = relevantHacks.reduce((sum, h) => sum + (h.returnedFunds ?? 0), 0);

      const daysSinceLastIncident = lastHack
        ? Math.floor((Date.now() - lastHack.date * 1000) / (86400 * 1000))
        : null;

      const audits = (protocol.audit_links ?? []).length;
      const oracles = (protocol.oracles ?? []).length;

      let riskLevel: "low" | "medium" | "high" | "unknown";
      if (relevantHacks.length === 0 && audits > 0) riskLevel = "low";
      else if (lastHack && daysSinceLastIncident !== null && daysSinceLastIncident < 90) riskLevel = "high";
      else if (relevantHacks.length > 0) riskLevel = "medium";
      else if (audits === 0) riskLevel = "medium";
      else riskLevel = "low";

      return {
        ok: true,
        evidence: {
          target: ctx.target,
          found: true,
          ambiguous_match: !!ambiguous_candidates,
          ambiguous_candidates: ambiguous_candidates ?? null,
          protocol_name: protocol.name,
          protocol_slug: protocol.slug,
          category: protocol.category ?? null,
          chains: protocol.chains ?? [],
          tvl_usd: protocol.tvl,
          tvl_change_1d_pct: protocol.change_1d ?? null,
          tvl_change_7d_pct: protocol.change_7d ?? null,
          tvl_change_1m_pct: protocol.change_1m ?? null,
          listed_at: protocol.listedAt ? new Date(protocol.listedAt * 1000).toISOString() : null,
          audits_count: audits,
          oracles: protocol.oracles ?? [],
          forked_from: protocol.forkedFrom ?? [],
          incidents: {
            count: relevantHacks.length,
            total_lost_usd: totalLost,
            total_recovered_usd: totalRecovered,
            last_incident: lastHack
              ? {
                  date: new Date(lastHack.date * 1000).toISOString(),
                  classification: lastHack.classification,
                  technique: lastHack.technique ?? null,
                  amount_usd: lastHack.amount,
                  source: lastHack.source ?? null,
                }
              : null,
            days_since_last_incident: daysSinceLastIncident,
          },
          risk_level: riskLevel,
        },
        provenance: {
          source: "api.llama.fi",
          fetched_at: now,
          endpoints: ["protocols", "hacks"],
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
