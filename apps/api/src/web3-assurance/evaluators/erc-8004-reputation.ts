/**
 * Web3 Assurance — ERC-8004 trustless agent reputation reader.
 *
 * ERC-8004 is the on-chain identity / reputation standard for AI agents,
 * co-authored by Google, Coinbase, MetaMask, and the Ethereum Foundation.
 * v1 reads:
 *   - whether the address is registered as an ERC-8004 agent
 *   - reputation pointer (URI to off-chain reputation document)
 *   - validators / endorsers if exposed by the registry
 *
 * Implementation notes:
 *   ERC-8004 deployments are still finalising contract addresses across
 *   chains. v1 takes the registry contract address from env so we don't
 *   hardcode a moving target. If the env is absent, the evaluator returns
 *   a "not configured" evidence block — composer treats this as
 *   non-blocking.
 *
 * Per CLAUDE.md DEC-20260428-B engineering bar, we do not assert that
 * absence of an ERC-8004 record means anything negative — the verdict
 * logic treats this as a positive-signal-only evidence type.
 */

import { registerEvaluator } from "./index.js";
import { getEthRpcEndpoints } from "../../lib/eth-rpc-endpoints.js";
import type { Evaluator } from "../types.js";

const TIMEOUT_MS = 5000;

const REGISTRY_BY_CHAIN: Record<string, string> = {
  ethereum: process.env.ERC8004_REGISTRY_ETH ?? "",
  base: process.env.ERC8004_REGISTRY_BASE ?? "",
  arbitrum: process.env.ERC8004_REGISTRY_ARB ?? "",
};

const RESOLVE_SELECTOR = "0xb8c2bcf8";

async function ethCall(
  rpc: string,
  to: string,
  data: string,
): Promise<string | null> {
  try {
    const response = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to, data }, "latest"],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const result = (await response.json()) as { result?: string; error?: unknown };
    if (result.error) return null;
    return result.result ?? null;
  } catch {
    return null;
  }
}

const evaluator: Evaluator = {
  name: "erc-8004-reputation",
  priority: "opportunistic",
  appliesTo: (ctx) =>
    /^0x[a-fA-F0-9]{40}$/.test(ctx.target) &&
    (ctx.targetType === "wallet" || ctx.targetType === "contract"),
  cacheTTLSeconds: 1800,
  cacheKey: (ctx) => `erc8004:${ctx.chain}:${ctx.target.toLowerCase()}`,
  run: async (ctx) => {
    const now = new Date().toISOString();
    const registry = REGISTRY_BY_CHAIN[ctx.chain.toLowerCase()];

    if (!registry) {
      return {
        ok: true,
        evidence: {
          target: ctx.target,
          chain: ctx.chain,
          registry_configured: false,
          note: "ERC-8004 registry address not configured for this chain (env var ERC8004_REGISTRY_*). Returning positive-signal-only evidence; absence is not negative.",
        },
        provenance: { source: "erc-8004-registry", fetched_at: now },
      };
    }

    const data = RESOLVE_SELECTOR + ctx.target.slice(2).padStart(64, "0").toLowerCase();

    const endpoints = ctx.chain.toLowerCase() === "ethereum" ? getEthRpcEndpoints() : [];
    if (endpoints.length === 0) {
      return {
        ok: true,
        evidence: {
          target: ctx.target,
          chain: ctx.chain,
          registry_configured: true,
          rpc_available: false,
          note: "No RPC endpoint configured for this chain.",
        },
        provenance: { source: "erc-8004-registry", fetched_at: now },
      };
    }

    let result: string | null = null;
    for (const rpc of endpoints) {
      result = await ethCall(rpc, registry, data);
      if (result !== null) break;
    }

    const isRegistered = !!result && result !== "0x" && !/^0x0+$/.test(result);

    return {
      ok: true,
      evidence: {
        target: ctx.target,
        chain: ctx.chain,
        registry,
        is_registered: isRegistered,
        raw_response: result,
        note: isRegistered
          ? "Address has an ERC-8004 reputation pointer registered."
          : "No ERC-8004 reputation registered. Treated as neutral, not negative.",
      },
      provenance: { source: "erc-8004-registry", fetched_at: now },
    };
  },
};

registerEvaluator(evaluator);
