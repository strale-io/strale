/**
 * Web3 Assurance — Sourcify decentralized contract verification.
 *
 * Free, no API key, no rate limit, all EVM chains. Verifies bytecode against
 * compile metadata. Complements the contract-verify-check evaluator (which
 * uses Etherscan-family) — when Sourcify says "full match" and Etherscan says
 * "not verified", that's a meaningful disagreement the composer surfaces.
 */

import { registerEvaluator } from "./index.js";
import type { Evaluator } from "../types.js";

const TIMEOUT_MS = 6000;
const FILES_CHECK_BASE = "https://sourcify.dev/server/check-by-addresses";

const CHAIN_TO_ID: Record<string, string> = {
  ethereum: "1",
  base: "8453",
  polygon: "137",
  arbitrum: "42161",
  optimism: "10",
  bsc: "56",
  avalanche: "43114",
  "1": "1",
  "8453": "8453",
  "137": "137",
  "42161": "42161",
  "10": "10",
  "56": "56",
  "43114": "43114",
};

const evaluator: Evaluator = {
  name: "sourcify-verification",
  priority: "opportunistic",
  appliesTo: (ctx) =>
    (ctx.targetType === "contract" || ctx.targetType === "token" || ctx.targetType === "protocol") &&
    /^0x[a-fA-F0-9]{40}$/.test(ctx.target),
  cacheTTLSeconds: 604800,
  cacheKey: (ctx) => `sourcify:${ctx.chain}:${ctx.target.toLowerCase()}`,
  run: async (ctx) => {
    const now = new Date().toISOString();
    const chainId = CHAIN_TO_ID[ctx.chain.toLowerCase()];
    if (!chainId) {
      return {
        ok: true,
        evidence: {
          target: ctx.target,
          status: "chain_not_supported",
          chain: ctx.chain,
        },
        provenance: { source: "sourcify.dev", fetched_at: now },
      };
    }

    try {
      const url = `${FILES_CHECK_BASE}?addresses=${encodeURIComponent(ctx.target)}&chainIds=${chainId}`;
      const response = await fetch(url, {
        headers: { "User-Agent": "Strale/1.0" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`Sourcify HTTP ${response.status}`);
      }

      const data = (await response.json()) as Array<{
        address: string;
        status?: string;
        chainIds?: Array<{ chainId: string; status: string }>;
      }>;

      const entry = data.find(
        (d) => d.address.toLowerCase() === ctx.target.toLowerCase(),
      );

      if (!entry) {
        return {
          ok: true,
          evidence: {
            target: ctx.target,
            chain_id: chainId,
            verified: false,
            match_type: null,
            note: "No Sourcify record found for this address.",
          },
          provenance: { source: "sourcify.dev", fetched_at: now },
        };
      }

      const chainStatus = entry.chainIds?.find((c) => c.chainId === chainId)?.status ??
        entry.status ?? "false";
      const isVerified = chainStatus === "perfect" || chainStatus === "partial";

      return {
        ok: true,
        evidence: {
          target: ctx.target,
          chain_id: chainId,
          verified: isVerified,
          match_type: chainStatus === "perfect" ? "full_match" : chainStatus === "partial" ? "partial_match" : "none",
        },
        provenance: { source: "sourcify.dev", fetched_at: now },
      };
    } catch (err) {
      return {
        ok: false,
        evidence: null,
        provenance: { source: "sourcify.dev", fetched_at: now },
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

registerEvaluator(evaluator);
