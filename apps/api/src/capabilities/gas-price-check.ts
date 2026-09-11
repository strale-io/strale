import { registerCapability, type CapabilityInput } from "./index.js";
import { alchemyRpc, findChain, hexToBigInt, resolveChain } from "./lib/alchemy-client.js";

// Fee tiers computed from eth_feeHistory: the next block's base fee plus the
// median priority fee paid at the 10th / 50th / 90th percentile over the last
// 20 blocks. Rebuilt 2026-09-11 off Etherscan's gas oracle, whose free API
// forbids commercial use; the tiers are Strale's own computation.
const BLOCKS = 20;
const PERCENTILES = [10, 50, 90];

// Ethereum, Polygon and BNB Chain price execution gas only. On rollups the
// larger part of a transaction's cost is the fee for posting its data to
// Ethereum, which eth_feeHistory does not contain; quoting these tiers there
// would understate the cost, so rollups are refused with that reason.
export const GAS_CHAINS = ["1", "137", "56"] as const;
const ROLLUPS = ["8453", "42161", "10"];

function requestedRollup(input: Record<string, unknown>) {
  const { chain } = findChain(input, "chain_id", "chain", "network");
  return chain && ROLLUPS.includes(chain.id) ? chain : undefined;
}

interface FeeHistory {
  baseFeePerGas: string[];
  gasUsedRatio: number[];
  reward?: string[][];
}

const toGwei = (wei: bigint): number => Math.round(Number(wei) / 1e6) / 1e3;

function median(values: bigint[]): bigint {
  if (values.length === 0) return 0n;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sorted[Math.floor(sorted.length / 2)];
}

/** Pure: fee tiers from an eth_feeHistory result. Exported for tests. */
export function feeTiers(h: FeeHistory) {
  const nextBase = hexToBigInt(h.baseFeePerGas[h.baseFeePerGas.length - 1]);
  if (nextBase === null) throw new Error("Gas price data unavailable: no base fee in the fee history.");
  const rewards = Array.isArray(h.reward) ? h.reward : [];
  const tip = (i: number) => median(rewards.map((r) => hexToBigInt(r[i]) ?? 0n));
  return {
    safe_gas_gwei: toGwei(nextBase + tip(0)),
    proposed_gas_gwei: toGwei(nextBase + tip(1)),
    fast_gas_gwei: toGwei(nextBase + tip(2)),
    base_fee_gwei: toGwei(nextBase),
    // Same shape Etherscan's oracle returned: the last five blocks' ratios, comma-separated.
    gas_used_ratio: h.gasUsedRatio.slice(-5).map((r) => String(Math.round(r * 1e6) / 1e6)).join(","),
  };
}

registerCapability("gas-price-check", async (input: CapabilityInput) => {
  const rollup = requestedRollup(input);
  if (rollup) {
    throw new Error(`${rollup.name} is a rollup: most of a transaction's cost there is the fee for posting its data to Ethereum, which these fee tiers cannot include. Supported: 1 (Ethereum), 137 (Polygon PoS), 56 (BNB Smart Chain).`);
  }
  const chain = resolveChain(input, GAS_CHAINS, "chain_id", "chain", "network");
  const history = await alchemyRpc<FeeHistory>(chain, "eth_feeHistory", [`0x${BLOCKS.toString(16)}`, "latest", PERCENTILES]);
  return {
    output: { chain_id: chain.id, ...feeTiers(history), blocks_sampled: BLOCKS },
    provenance: { source: `${chain.host} (eth_feeHistory via Alchemy)`, fetched_at: new Date().toISOString() },
  };
});
