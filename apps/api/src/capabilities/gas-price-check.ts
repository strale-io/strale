import { registerCapability, type CapabilityInput } from "./index.js";
import { etherscanFetch } from "./lib/etherscan-client.js";

registerCapability("gas-price-check", async (input: CapabilityInput) => {
  const chainId = (
    (input.chain_id as string) ??
    (input.chain as string) ??
    (input.network as string) ??
    "1"
  ).trim();

  const data = await etherscanFetch({
    chainid: chainId,
    module: "gastracker",
    action: "gasoracle",
  });

  const now = new Date().toISOString();

  if (data.status === "0" || !data.result) {
    throw new Error(`Gas price data unavailable for chain ${chainId}.`);
  }

  const r = data.result;

  return {
    output: {
      chain_id: chainId,
      safe_gas_gwei: parseFloat(r.SafeGasPrice) || null,
      proposed_gas_gwei: parseFloat(r.ProposeGasPrice) || null,
      fast_gas_gwei: parseFloat(r.FastGasPrice) || null,
      base_fee_gwei: parseFloat(r.suggestBaseFee) || null,
      gas_used_ratio: r.gasUsedRatio ?? null,
    },
    provenance: { source: "etherscan.io", fetched_at: now },
  };
});
