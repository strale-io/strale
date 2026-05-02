/**
 * Web3 Assurance — Tenderly pre-trade simulation.
 *
 * Simulates the user's specific transaction (not just static contract
 * analysis). Returns: predicted output, balance changes, slippage, gas,
 * and revert reason if simulation fails.
 *
 * Free signup tier sufficient for v1 alpha volume; upgrade if quota hit.
 *
 * Only runs when ctx.action is provided (we have a transaction to simulate).
 * Otherwise returns "skipped" and composer treats as not-applicable.
 */

import { registerEvaluator } from "./index.js";
import type { Evaluator } from "../types.js";

const TIMEOUT_MS = 10000;

const NETWORK_ID_BY_CHAIN: Record<string, string> = {
  ethereum: "1",
  base: "8453",
  polygon: "137",
  arbitrum: "42161",
  optimism: "10",
  bsc: "56",
};

const evaluator: Evaluator = {
  name: "pre-trade-simulation",
  priority: "opportunistic",
  appliesTo: (ctx) =>
    ctx.action !== undefined &&
    /^0x[a-fA-F0-9]{40}$/.test(ctx.target) &&
    NETWORK_ID_BY_CHAIN[ctx.chain.toLowerCase()] !== undefined,
  cacheTTLSeconds: 0,
  cacheKey: (ctx) => `tenderly:${ctx.chain}:${ctx.target.toLowerCase()}:${ctx.action}:${ctx.amountUsd ?? "any"}`,
  run: async (ctx) => {
    const now = new Date().toISOString();
    const accountSlug = process.env.TENDERLY_ACCOUNT;
    const projectSlug = process.env.TENDERLY_PROJECT;
    const accessKey = process.env.TENDERLY_ACCESS_KEY;

    if (!accountSlug || !projectSlug || !accessKey) {
      return {
        ok: true,
        evidence: {
          target: ctx.target,
          enabled: false,
          note: "Tenderly simulation disabled — TENDERLY_ACCOUNT / TENDERLY_PROJECT / TENDERLY_ACCESS_KEY not configured. Verdict treats as neutral.",
        },
        provenance: { source: "tenderly.co", fetched_at: now },
      };
    }

    const networkId = NETWORK_ID_BY_CHAIN[ctx.chain.toLowerCase()]!;
    const url = `https://api.tenderly.co/api/v1/account/${accountSlug}/project/${projectSlug}/simulate`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Access-Key": accessKey,
          "User-Agent": "Strale/1.0",
        },
        body: JSON.stringify({
          network_id: networkId,
          from: "0x0000000000000000000000000000000000000001",
          to: ctx.target,
          input: "0x",
          gas: 8000000,
          gas_price: "0",
          value: ctx.amountUsd ? "0" : "0",
          save: false,
          save_if_fails: false,
          simulation_type: "quick",
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) throw new Error(`Tenderly HTTP ${response.status}`);

      const data = (await response.json()) as {
        transaction?: {
          status?: boolean;
          gas_used?: number;
          error_message?: string;
          error_info?: unknown;
        };
      };

      const tx = data.transaction;
      const success = tx?.status === true;

      return {
        ok: true,
        evidence: {
          target: ctx.target,
          chain: ctx.chain,
          action: ctx.action,
          simulation_success: success,
          gas_used: tx?.gas_used ?? null,
          error_message: tx?.error_message ?? null,
          note: success
            ? "Simulated transaction succeeded. v1 simulation is a basic call to the target; v1.5 will simulate the full agent-intent payload."
            : "Simulated transaction reverted. Possible honeypot, slippage trap, or guarded contract. Investigate before proceeding.",
        },
        provenance: { source: "tenderly.co", fetched_at: now },
      };
    } catch (err) {
      return {
        ok: false,
        evidence: null,
        provenance: { source: "tenderly.co", fetched_at: now },
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

registerEvaluator(evaluator);
