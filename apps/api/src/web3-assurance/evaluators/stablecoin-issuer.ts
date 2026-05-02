/**
 * Web3 Assurance — stablecoin issuer-jurisdiction evaluator.
 *
 * For wallets receiving stablecoin payment, classify each held stablecoin
 * by issuer regulatory jurisdiction, freeze capability, reserve disclosure,
 * and MiCA-authorisation status. Direct value for EU-CASP buyers ahead of
 * MiCA Q3 2026 enforcement.
 *
 * v0.1: classifies the wallet's USDC/USDT/DAI/PYUSD/USDe/FDUSD/USDP holdings
 * via the existing Etherscan tokentx API. Reads the wallet's recent token
 * transfers, identifies stablecoin contract matches, classifies each.
 *
 * v0.2: extend to top-50 stablecoins + non-EVM chains (Solana SPL stables).
 *
 * Per DEC-20260428-A, Strale itself does not scrape; the issuer registry
 * is hand-curated from public regulator filings + issuer disclosures.
 */

import { registerEvaluator } from "./index.js";
import { etherscanFetch } from "../../capabilities/lib/etherscan-client.js";
import { lookupStablecoinIssuer } from "../data/stablecoin-issuers.js";
import type { Evaluator } from "../types.js";

const CHAIN_TO_ID: Record<string, string> = {
  ethereum: "1",
  base: "8453",
  polygon: "137",
  arbitrum: "42161",
  optimism: "10",
};

interface EtherscanTokenTx {
  contractAddress: string;
  tokenSymbol: string;
  to: string;
  from: string;
  timeStamp: string;
  value: string;
  tokenDecimal: string;
}

const evaluator: Evaluator = {
  name: "stablecoin-issuer",
  priority: "opportunistic",
  appliesTo: (ctx) =>
    ctx.targetType === "wallet" &&
    /^0x[a-fA-F0-9]{40}$/.test(ctx.target) &&
    CHAIN_TO_ID[ctx.chain.toLowerCase()] !== undefined,
  cacheTTLSeconds: 1800,
  cacheKey: (ctx) => `stablecoin-issuer:${ctx.chain}:${ctx.target.toLowerCase()}`,
  run: async (ctx) => {
    const now = new Date().toISOString();

    if (!process.env.ETHERSCAN_API_KEY) {
      return {
        ok: true,
        evidence: {
          target: ctx.target,
          enabled: false,
          note: "Stablecoin-issuer evaluator requires ETHERSCAN_API_KEY; verdict treats absence as neutral.",
        },
        provenance: { source: "etherscan.io", fetched_at: now },
      };
    }

    try {
      const data = await etherscanFetch({
        chainid: CHAIN_TO_ID[ctx.chain.toLowerCase()]!,
        module: "account",
        action: "tokentx",
        address: ctx.target,
        page: "1",
        offset: "100",
        sort: "desc",
      });

      const transfers = (Array.isArray(data.result) ? data.result : []) as EtherscanTokenTx[];

      const seen: Map<string, { received_count: number; last_received_at: string | null }> = new Map();
      const lower = ctx.target.toLowerCase();
      for (const tx of transfers) {
        if ((tx.to ?? "").toLowerCase() !== lower) continue;
        const key = (tx.contractAddress ?? "").toLowerCase();
        if (!key) continue;
        const existing = seen.get(key) ?? { received_count: 0, last_received_at: null };
        existing.received_count += 1;
        const ts = parseInt(tx.timeStamp, 10);
        const iso = new Date(ts * 1000).toISOString();
        if (!existing.last_received_at || iso > existing.last_received_at) {
          existing.last_received_at = iso;
        }
        seen.set(key, existing);
      }

      const stablecoinHoldings: Array<Record<string, unknown>> = [];
      const jurisdictionsSeen = new Set<string>();
      const nonMicaSymbols: string[] = [];
      let nonFreezableCount = 0;

      for (const [contract, stats] of seen.entries()) {
        const entry = lookupStablecoinIssuer(contract, ctx.chain);
        if (!entry) continue;

        stablecoinHoldings.push({
          contract_address: contract,
          symbol: entry.symbol,
          issuer: entry.issuer,
          jurisdiction: entry.jurisdiction,
          freeze_capability: entry.freeze_capability,
          reserve_disclosure: entry.reserve_disclosure,
          mica_compliant: entry.mica_compliant,
          received_count: stats.received_count,
          last_received_at: stats.last_received_at,
          notes: entry.notes,
        });
        jurisdictionsSeen.add(entry.jurisdiction);
        if (!entry.mica_compliant) nonMicaSymbols.push(entry.symbol);
        if (entry.freeze_capability === "non_freezable") nonFreezableCount += 1;
      }

      let issuerRiskLevel: "high" | "medium" | "low" | "unknown";
      if (stablecoinHoldings.length === 0) {
        issuerRiskLevel = "unknown";
      } else if (nonMicaSymbols.length === stablecoinHoldings.length) {
        issuerRiskLevel = "high";
      } else if (nonMicaSymbols.length > 0) {
        issuerRiskLevel = "medium";
      } else {
        issuerRiskLevel = "low";
      }

      return {
        ok: true,
        evidence: {
          target: ctx.target,
          chain: ctx.chain,
          stablecoin_holdings_classified: stablecoinHoldings,
          stablecoin_holdings_count: stablecoinHoldings.length,
          jurisdictions_held: Array.from(jurisdictionsSeen),
          non_mica_compliant_symbols: nonMicaSymbols,
          non_freezable_count: nonFreezableCount,
          issuer_risk_level: issuerRiskLevel,
          mica_q3_2026_relevant: nonMicaSymbols.length > 0,
        },
        provenance: { source: "etherscan.io", fetched_at: now },
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
