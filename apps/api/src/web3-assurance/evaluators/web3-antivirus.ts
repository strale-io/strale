/**
 * Web3 Assurance — Web3 Antivirus free API supplement.
 *
 * Web3 Antivirus provides a free public API for wallet risk + poisoning
 * attack detection. Used as a SUPPLEMENT to wallet-history-risk (which
 * uses GoPlus). When the two disagree, the composer surfaces the
 * disagreement — that's a Strale-only output other competitors don't have.
 */

import { registerEvaluator } from "./index.js";
import type { Evaluator } from "../types.js";

const API_BASE = "https://api.web3antivirus.io/v1";
const TIMEOUT_MS = 6000;

const evaluator: Evaluator = {
  name: "web3-antivirus-risk",
  priority: "opportunistic",
  appliesTo: (ctx) =>
    ctx.targetType === "wallet" &&
    /^0x[a-fA-F0-9]{40}$/.test(ctx.target),
  cacheTTLSeconds: 1800,
  cacheKey: (ctx) => `web3av:${ctx.target.toLowerCase()}`,
  run: async (ctx) => {
    const now = new Date().toISOString();
    try {
      const url = `${API_BASE}/wallet/${encodeURIComponent(ctx.target)}/risk`;
      const response = await fetch(url, {
        headers: { "User-Agent": "Strale/1.0", Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (response.status === 404) {
        return {
          ok: true,
          evidence: {
            target: ctx.target,
            found: false,
            note: "Web3 Antivirus has no record for this address.",
          },
          provenance: { source: "web3antivirus.io", fetched_at: now },
        };
      }

      if (!response.ok) throw new Error(`Web3 Antivirus HTTP ${response.status}`);

      const data = (await response.json()) as Record<string, unknown>;

      return {
        ok: true,
        evidence: {
          target: ctx.target,
          found: true,
          raw: data,
        },
        provenance: { source: "web3antivirus.io", fetched_at: now },
      };
    } catch (err) {
      return {
        ok: false,
        evidence: null,
        provenance: { source: "web3antivirus.io", fetched_at: now },
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

registerEvaluator(evaluator);
