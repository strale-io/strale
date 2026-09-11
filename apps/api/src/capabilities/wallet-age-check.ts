import { registerCapability, type CapabilityInput } from "./index.js";
import { assetTransfers, hexToNumber, requireAddress, requireMainnet, type AssetTransfer } from "./lib/alchemy-client.js";

// A wallet's first on-chain activity: the earliest transfer to or from it.
// Rebuilt 2026-09-11 onto Alchemy's transfer index after Etherscan's free API
// was found to forbid commercial use. Counts ETH, ERC-20, ERC-721 and ERC-1155
// transfers either way, so a wallet that only ever received tokens still has
// an age — Etherscan's txlist saw only transactions it sent or received ETH in.
const CATEGORIES = ["external", "erc20", "erc721", "erc1155"];

/** Pure: the earliest of two single-transfer results. Exported for tests. */
export function earliest(a: AssetTransfer | undefined, b: AssetTransfer | undefined): AssetTransfer | undefined {
  if (!a) return b;
  if (!b) return a;
  return (hexToNumber(a.blockNum) ?? Infinity) <= (hexToNumber(b.blockNum) ?? Infinity) ? a : b;
}

registerCapability("wallet-age-check", async (input: CapabilityInput) => {
  const address = requireAddress(input.address ?? input.wallet ?? input.wallet_address, "address");
  const chainId = requireMainnet(input, "chain_id", "chain");

  const [firstIn, firstOut] = await Promise.all([
    assetTransfers({ address, direction: "to", category: CATEGORIES, order: "asc", maxCount: 1 }),
    assetTransfers({ address, direction: "from", category: CATEGORIES, order: "asc", maxCount: 1 }),
  ]);
  const first = earliest(firstIn[0], firstOut[0]);
  const provenance = { source: "ethereum-mainnet (via Alchemy)", fetched_at: new Date().toISOString() };

  const ts = first?.metadata?.blockTimestamp ? Date.parse(first.metadata.blockTimestamp) : NaN;
  if (!first || Number.isNaN(ts)) {
    return {
      output: { address, chain_id: chainId, has_activity: false, first_tx_date: null, first_tx_hash: null, age_days: 0 },
      provenance,
    };
  }
  return {
    output: {
      address,
      chain_id: chainId,
      has_activity: true,
      first_tx_date: new Date(ts).toISOString(),
      first_tx_hash: first.hash ?? null,
      age_days: Math.floor((Date.now() - ts) / 86_400_000),
    },
    provenance,
  };
});
