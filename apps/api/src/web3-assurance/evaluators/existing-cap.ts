/**
 * Web3 Assurance — wrappers around existing Strale capabilities.
 *
 * Strale already has 7+ live crypto capabilities (wallet-risk-score,
 * wallet-age-check, wallet-transactions-lookup, token-security-check,
 * contract-verify-check, approval-security-check, wallet-balance-lookup).
 * The composer reuses them via getDirectExecutor — the Web3 Assurance call
 * is one billing event for the customer; the underlying capabilities aren't
 * billed separately.
 */

import { getDirectExecutor, type CapabilityInput } from "../../capabilities/index.js";
import { registerEvaluator } from "./index.js";
import type { EvaluatorContext, Evaluator, EvaluatorPriority } from "../types.js";

interface WrapperOptions {
  name: string;
  capabilitySlug: string;
  priority: EvaluatorPriority;
  appliesTo: (ctx: EvaluatorContext) => boolean;
  buildInput: (ctx: EvaluatorContext) => CapabilityInput;
  cacheTTLSeconds: number;
}

function makeWrapper(opts: WrapperOptions): Evaluator {
  return {
    name: opts.name,
    priority: opts.priority,
    appliesTo: opts.appliesTo,
    cacheTTLSeconds: opts.cacheTTLSeconds,
    cacheKey: (ctx) => `${opts.name}:${ctx.chain}:${ctx.target.toLowerCase()}`,
    run: async (ctx) => {
      const exec = getDirectExecutor(opts.capabilitySlug);
      if (!exec) {
        return {
          ok: false,
          evidence: null,
          provenance: { source: "internal", fetched_at: new Date().toISOString() },
          error: `Capability '${opts.capabilitySlug}' not registered`,
        };
      }
      try {
        const input = opts.buildInput(ctx);
        const result = await exec(input);
        return {
          ok: true,
          evidence: result.output,
          provenance: result.provenance,
        };
      } catch (err) {
        return {
          ok: false,
          evidence: null,
          provenance: {
            source: opts.capabilitySlug,
            fetched_at: new Date().toISOString(),
          },
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

const isEvmChain = (chain: string): boolean =>
  ["1", "8453", "137", "42161", "10", "56", "43114", "ethereum", "base", "polygon", "arbitrum", "optimism"].includes(
    chain.toLowerCase(),
  );

const chainToId = (chain: string): string => {
  const map: Record<string, string> = {
    ethereum: "1",
    base: "8453",
    polygon: "137",
    arbitrum: "42161",
    optimism: "10",
    bsc: "56",
    avalanche: "43114",
  };
  return map[chain.toLowerCase()] ?? chain;
};

registerEvaluator(
  makeWrapper({
    name: "wallet-identity",
    capabilitySlug: "wallet-age-check",
    priority: "opportunistic",
    appliesTo: (ctx) => ctx.targetType === "wallet" && isEvmChain(ctx.chain),
    buildInput: (ctx) => ({ address: ctx.target, chain_id: chainToId(ctx.chain) }),
    cacheTTLSeconds: 86400,
  }),
);

registerEvaluator(
  makeWrapper({
    name: "wallet-history-risk",
    capabilitySlug: "wallet-risk-score",
    priority: "critical",
    appliesTo: (ctx) => ctx.targetType === "wallet" && isEvmChain(ctx.chain),
    buildInput: (ctx) => ({ address: ctx.target, chain_id: chainToId(ctx.chain) }),
    cacheTTLSeconds: 3600,
  }),
);

registerEvaluator(
  makeWrapper({
    name: "wallet-transactions",
    capabilitySlug: "wallet-transactions-lookup",
    priority: "opportunistic",
    appliesTo: (ctx) => ctx.targetType === "wallet" && isEvmChain(ctx.chain),
    buildInput: (ctx) => ({ address: ctx.target, chain_id: chainToId(ctx.chain), limit: 20 }),
    cacheTTLSeconds: 1800,
  }),
);

registerEvaluator(
  makeWrapper({
    name: "wallet-balance",
    capabilitySlug: "wallet-balance-lookup",
    priority: "opportunistic",
    appliesTo: (ctx) => ctx.targetType === "wallet" && isEvmChain(ctx.chain),
    buildInput: (ctx) => ({ address: ctx.target, chain_id: chainToId(ctx.chain) }),
    cacheTTLSeconds: 600,
  }),
);

registerEvaluator(
  makeWrapper({
    name: "token-safety",
    capabilitySlug: "token-security-check",
    priority: "critical",
    appliesTo: (ctx) => ctx.targetType === "token" && isEvmChain(ctx.chain),
    buildInput: (ctx) => ({ contract_address: ctx.target, chain_id: chainToId(ctx.chain) }),
    cacheTTLSeconds: 1800,
  }),
);

registerEvaluator(
  makeWrapper({
    name: "contract-verification",
    capabilitySlug: "contract-verify-check",
    priority: "opportunistic",
    appliesTo: (ctx) =>
      (ctx.targetType === "contract" || ctx.targetType === "token") && isEvmChain(ctx.chain),
    buildInput: (ctx) => ({ contract_address: ctx.target, chain_id: chainToId(ctx.chain) }),
    cacheTTLSeconds: 604800,
  }),
);

registerEvaluator(
  makeWrapper({
    name: "approval-inventory",
    capabilitySlug: "approval-security-check",
    priority: "opportunistic",
    appliesTo: (ctx) => ctx.targetType === "wallet" && isEvmChain(ctx.chain),
    buildInput: (ctx) => ({ address: ctx.target, chain_id: chainToId(ctx.chain) }),
    cacheTTLSeconds: 300,
  }),
);

/**
 * Sanctions screening via Dilisense name search.
 *
 * Only fires for target types whose `ctx.target` is a human-readable
 * string (protocol slug, domain). For hex-address targets — wallet,
 * contract, token, bridge — name search against a 42-char `0x…` is a
 * category error: it always returns zero matches and burns one
 * Dilisense quota unit per call. The right primitive for hex-target
 * sanctions screening is OFAC SDN's Specially Designated Nationals
 * crypto-address list (a separate dataset, not yet wired into Strale).
 *
 * Until OFAC SDN crypto-address lookup ships, hex-address targets
 * produce no sanctions evidence and `computeVerdict` honestly notes
 * this in `suggested_action` ("sanctions evidence unavailable…").
 */
registerEvaluator(
  makeWrapper({
    name: "sanctions",
    capabilitySlug: "sanctions-check",
    priority: "critical",
    appliesTo: (ctx) => ctx.targetType === "protocol" || ctx.targetType === "domain",
    buildInput: (ctx) => ({ name: ctx.target, type: ctx.targetType }),
    cacheTTLSeconds: 3600,
  }),
);
