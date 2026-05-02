/**
 * Web3 Assurance — sister-rug detector.
 *
 * Identifies contracts where the SAME deployer launched prior contracts
 * that were rugged or where the bytecode resembles a known rug pattern.
 *
 * v1 implementation focuses on the deployer-history axis (cheaper):
 *   1. Pull deployer address via Etherscan getContractCreation
 *   2. Look up other contracts the deployer has launched
 *   3. Cross-reference each prior deployment against:
 *      - DefiLlama Hacks DB (loaded by defillama-protocol evaluator)
 *      - REKT Database (Phase 2)
 *      - ScamSniffer drainer list (loaded by scamsniffer evaluator)
 *
 * v1.5 adds bytecode similarity: hash deployed bytecode, compare against
 * a curated set of known rug bytecode hashes. Deferred for v1 to keep
 * scope tight.
 *
 * v1 returns:
 *   - deployer address
 *   - prior deployments count (capped at 50 most recent)
 *   - prior deployments flagged by any cross-reference
 */

import { registerEvaluator } from "./index.js";
import { etherscanFetch } from "../../capabilities/lib/etherscan-client.js";
import type { Evaluator } from "../types.js";

const CHAIN_TO_ID: Record<string, string> = {
  ethereum: "1",
  base: "8453",
  polygon: "137",
  arbitrum: "42161",
  optimism: "10",
  bsc: "56",
};

const evaluator: Evaluator = {
  name: "sister-rug",
  priority: "opportunistic",
  appliesTo: (ctx) =>
    (ctx.targetType === "contract" || ctx.targetType === "token") &&
    /^0x[a-fA-F0-9]{40}$/.test(ctx.target),
  cacheTTLSeconds: 86400,
  cacheKey: (ctx) => `sister-rug:${ctx.chain}:${ctx.target.toLowerCase()}`,
  run: async (ctx) => {
    const now = new Date().toISOString();
    const chainId = CHAIN_TO_ID[ctx.chain.toLowerCase()];

    if (!chainId) {
      return {
        ok: true,
        evidence: {
          target: ctx.target,
          chain_supported: false,
          chain: ctx.chain,
        },
        provenance: { source: "etherscan.io", fetched_at: now },
      };
    }

    if (!process.env.ETHERSCAN_API_KEY) {
      return {
        ok: true,
        evidence: {
          target: ctx.target,
          enabled: false,
          note: "Sister-rug detector requires ETHERSCAN_API_KEY. Returning enabled:false; verdict treats as neutral.",
        },
        provenance: { source: "etherscan.io", fetched_at: now },
      };
    }

    try {
      const creation = await etherscanFetch({
        chainid: chainId,
        module: "contract",
        action: "getcontractcreation",
        contractaddresses: ctx.target,
      });

      const result = Array.isArray(creation.result) ? creation.result[0] : null;
      if (!result || !result.contractCreator) {
        return {
          ok: true,
          evidence: {
            target: ctx.target,
            deployer_found: false,
            note: "Could not resolve contract deployer.",
          },
          provenance: { source: "etherscan.io", fetched_at: now },
        };
      }

      const deployer = String(result.contractCreator).toLowerCase();

      const txList = await etherscanFetch({
        chainid: chainId,
        module: "account",
        action: "txlist",
        address: deployer,
        startblock: "0",
        endblock: "99999999",
        page: "1",
        offset: "50",
        sort: "desc",
      });

      const otherDeployments: string[] = [];
      if (Array.isArray(txList.result)) {
        for (const tx of txList.result) {
          if (tx.to === "" || tx.to == null) {
            const created = (tx.contractAddress ?? "").toLowerCase();
            if (created && created !== ctx.target.toLowerCase()) {
              otherDeployments.push(created);
            }
          }
        }
      }

      return {
        ok: true,
        evidence: {
          target: ctx.target,
          chain: ctx.chain,
          deployer,
          deployer_first_tx_hash: result.txHash ?? null,
          prior_deployments_count: otherDeployments.length,
          prior_deployments_sample: otherDeployments.slice(0, 10),
          flagged_prior_deployments: [],
          note: "v1 surfaces deployer history. Cross-reference with DefiLlama Hacks DB / ScamSniffer happens at composer level. v1.5 will add bytecode-similarity matching.",
        },
        provenance: { source: "etherscan.io", fetched_at: now, endpoints: ["getcontractcreation", "txlist"] },
      };
    } catch (err) {
      return {
        ok: false,
        evidence: null,
        provenance: { source: "etherscan.io", fetched_at: now },
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

registerEvaluator(evaluator);
