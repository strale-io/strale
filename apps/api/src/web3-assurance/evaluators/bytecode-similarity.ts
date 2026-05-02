/**
 * Web3 Assurance — bytecode-similarity rug detector (v0.1 exact-match).
 *
 * Tier-2 moat from the strategic memo: hash deployed bytecode after
 * normalizing the metadata block, compare against a curated set of
 * known-rug bytecode hashes. v0.1 ships exact-match against a small
 * seed; v0.2 adds fuzzy matching (n-gram or Jaccard on opcode sequences)
 * so copy-paste rugs with minor parameter changes still match.
 *
 * Honest v0.1 scope: the seed in data/known-rug-bytecodes.ts is empty.
 * The evaluator computes the hash and surfaces it as evidence; lookup
 * returns no_match until the seed is populated. This means the
 * infrastructure (RPC fetch + normalization + hashing + lookup) is in
 * place and the moat begins compounding the moment the first rug is
 * indexed.
 *
 * Compounds: every new rug Strale hashes adds an entry. Competitors
 * cannot replicate without paying the same compute + curation cost.
 */

import { createHash } from "node:crypto";
import { registerEvaluator } from "./index.js";
import { getEthRpcEndpoints } from "../../lib/eth-rpc-endpoints.js";
import {
  lookupRugBytecode,
  getRugBytecodeCount,
} from "../data/known-rug-bytecodes.js";
import type { Evaluator } from "../types.js";

const TIMEOUT_MS = 5000;

const SUPPORTED_CHAINS = new Set(["ethereum", "base", "polygon", "arbitrum", "optimism"]);

function stripMetadataBlock(bytecode: string): string {
  const hex = bytecode.startsWith("0x") ? bytecode.slice(2) : bytecode;
  if (hex.length < 6) return hex.toLowerCase();
  const lastTwoBytes = hex.slice(-4);
  const len = parseInt(lastTwoBytes, 16);
  if (Number.isNaN(len) || len === 0) return hex.toLowerCase();
  const metadataLen = (len + 2) * 2;
  if (hex.length < metadataLen + 2) return hex.toLowerCase();
  return hex.slice(0, hex.length - metadataLen).toLowerCase();
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function fetchCode(rpc: string, address: string): Promise<string | null> {
  try {
    const response = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getCode",
        params: [address.toLowerCase(), "latest"],
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
  name: "bytecode-similarity",
  priority: "opportunistic",
  appliesTo: (ctx) =>
    (ctx.targetType === "contract" || ctx.targetType === "token") &&
    /^0x[a-fA-F0-9]{40}$/.test(ctx.target) &&
    SUPPORTED_CHAINS.has(ctx.chain.toLowerCase()),
  cacheTTLSeconds: 604800,
  cacheKey: (ctx) => `bytecode-sim:${ctx.chain}:${ctx.target.toLowerCase()}`,
  run: async (ctx) => {
    const now = new Date().toISOString();

    if (ctx.chain.toLowerCase() !== "ethereum") {
      return {
        ok: true,
        evidence: {
          target: ctx.target,
          chain_supported: false,
          chain: ctx.chain,
          note: "v0.1 supports Ethereum mainnet only via existing RPC substrate.",
        },
        provenance: { source: "strale-curated-rug-bytecode-index", fetched_at: now },
      };
    }

    const endpoints = getEthRpcEndpoints();
    if (endpoints.length === 0) {
      return {
        ok: true,
        evidence: {
          target: ctx.target,
          enabled: false,
          note: "No RPC endpoint configured.",
        },
        provenance: { source: "strale-curated-rug-bytecode-index", fetched_at: now },
      };
    }

    let code: string | null = null;
    for (const rpc of endpoints) {
      code = await fetchCode(rpc, ctx.target);
      if (code !== null) break;
    }

    if (!code || code === "0x") {
      return {
        ok: true,
        evidence: {
          target: ctx.target,
          has_code: false,
          note: "No bytecode at address (EOA, self-destructed, or never deployed).",
        },
        provenance: { source: "strale-curated-rug-bytecode-index", fetched_at: now },
      };
    }

    const normalized = stripMetadataBlock(code);
    const hash = sha256(normalized);
    const match = lookupRugBytecode(hash);

    return {
      ok: true,
      evidence: {
        target: ctx.target,
        has_code: true,
        bytecode_sha256: hash,
        normalized_bytecode_length: normalized.length / 2,
        seed_size: getRugBytecodeCount(),
        match_found: match !== null,
        match: match
          ? {
              pattern_name: match.pattern_name,
              first_seen_address: match.first_seen_address,
              first_seen_at: match.first_seen_at,
              classification: match.classification,
              amount_lost_usd_estimate: match.amount_lost_usd_estimate,
              notes: match.notes,
            }
          : null,
        v0_2_planned:
          "fuzzy similarity matching (n-gram / Jaccard on opcode sequences) so copy-paste rugs with minor parameter changes still match",
      },
      provenance: { source: "strale-curated-rug-bytecode-index", fetched_at: now },
    };
  },
};

registerEvaluator(evaluator);
