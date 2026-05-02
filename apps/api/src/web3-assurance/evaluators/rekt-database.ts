/**
 * Web3 Assurance — REKT Database (de.fi) cross-reference.
 *
 * 2,500+ documented exploits, exit scams, and rug pulls. API access via
 * de.fi/rekt-database is free on request (token-gated). Complements
 * DefiLlama Hacks DB by including events DefiLlama doesn't track
 * (exit scams, smaller protocols, off-chain rugs).
 *
 * v1 implementation: load REKT database snapshot at boot via env-supplied
 * token; refresh every 6h. If REKT_API_TOKEN is unset, evaluator returns
 * 'enabled: false' — verdict treats as neutral.
 *
 * For v0.1 alpha, ships in fallback mode (token unset) and returns
 * "enabled: false" for now; live wiring follows token registration.
 */

import { registerEvaluator } from "./index.js";
import type { Evaluator } from "../types.js";

const TIMEOUT_MS = 10000;
const REKT_API = "https://de.fi/api/rekt";
const REFRESH_MS = 6 * 60 * 60 * 1000;

interface RektEntry {
  id: string | number;
  project_name?: string;
  contract_address?: string;
  date?: string;
  category?: string;
  technical_issue?: string;
  funds_lost_usd?: number;
  funds_returned_usd?: number;
}

interface RektCache {
  byProject: Map<string, RektEntry[]>;
  byAddress: Map<string, RektEntry[]>;
  fetched_at: string;
  ts: number;
}

let cache: RektCache | null = null;
let inFlight: Promise<RektCache> | null = null;

async function loadIndex(): Promise<RektCache | null> {
  const token = process.env.REKT_API_TOKEN;
  if (!token) return null;

  if (cache && Date.now() - cache.ts < REFRESH_MS) return cache;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const response = await fetch(REKT_API, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "Strale/1.0" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`REKT HTTP ${response.status}`);
      const entries = (await response.json()) as RektEntry[];

      const byProject = new Map<string, RektEntry[]>();
      const byAddress = new Map<string, RektEntry[]>();
      for (const entry of entries) {
        if (entry.project_name) {
          const key = entry.project_name.toLowerCase();
          (byProject.get(key) ?? byProject.set(key, []).get(key)!).push(entry);
        }
        if (entry.contract_address) {
          const key = entry.contract_address.toLowerCase();
          (byAddress.get(key) ?? byAddress.set(key, []).get(key)!).push(entry);
        }
      }

      const next: RektCache = {
        byProject,
        byAddress,
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
  name: "rekt-database",
  priority: "opportunistic",
  appliesTo: (ctx) =>
    ctx.targetType === "protocol" ||
    ctx.targetType === "contract" ||
    ctx.targetType === "token" ||
    ctx.targetType === "bridge",
  cacheTTLSeconds: 21600,
  cacheKey: (ctx) => `rekt:${ctx.target.toLowerCase()}`,
  run: async (ctx) => {
    const now = new Date().toISOString();
    const index = await loadIndex();

    if (!index) {
      return {
        ok: true,
        evidence: {
          target: ctx.target,
          enabled: false,
          note: "REKT Database integration disabled — REKT_API_TOKEN not set. Verdict treats as neutral; absence is not negative.",
        },
        provenance: { source: "de.fi/rekt-database", fetched_at: now },
      };
    }

    const normalized = ctx.target.toLowerCase().trim();
    const matches = [
      ...(index.byAddress.get(normalized) ?? []),
      ...(index.byProject.get(normalized) ?? []),
    ];

    if (matches.length === 0) {
      return {
        ok: true,
        evidence: {
          target: ctx.target,
          found: false,
          note: "No matching entries in REKT Database.",
        },
        provenance: { source: "de.fi/rekt-database", fetched_at: now, list_fetched_at: index.fetched_at },
      };
    }

    const totalLost = matches.reduce((sum, m) => sum + (m.funds_lost_usd ?? 0), 0);
    const totalReturned = matches.reduce((sum, m) => sum + (m.funds_returned_usd ?? 0), 0);
    const sortedByDate = matches.sort((a, b) =>
      (b.date ?? "").localeCompare(a.date ?? ""),
    );
    const lastEvent = sortedByDate[0];

    return {
      ok: true,
      evidence: {
        target: ctx.target,
        found: true,
        events_count: matches.length,
        total_funds_lost_usd: totalLost,
        total_funds_returned_usd: totalReturned,
        last_event: {
          project: lastEvent.project_name ?? null,
          date: lastEvent.date ?? null,
          category: lastEvent.category ?? null,
          technical_issue: lastEvent.technical_issue ?? null,
          funds_lost_usd: lastEvent.funds_lost_usd ?? null,
        },
      },
      provenance: { source: "de.fi/rekt-database", fetched_at: now, list_fetched_at: index.fetched_at },
    };
  },
};

registerEvaluator(evaluator);
