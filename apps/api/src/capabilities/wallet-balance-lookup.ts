import { registerCapability, type CapabilityInput } from "./index.js";
import {
  alchemyRpc, assetTransfers, hexToBigInt, hexToNumber, requireAddress, resolveChain, TRANSFER_CHAINS, weiToEth,
  type AssetTransfer,
} from "./lib/alchemy-client.js";

// Rebuilt 2026-09-11 onto Alchemy (standard eth_getBalance plus its transfer
// index) after Etherscan's free API was found to forbid commercial use.
const RECENT = 100;
const MAX_TOKENS = 20;

/** Pure: unique tokens from the most recent transfers, newest first. Exported for tests. */
export function recentTokens(transfers: AssetTransfer[]): { address: string; symbol: string }[] {
  const byBlock = [...transfers].sort((a, b) => (hexToNumber(b.blockNum) ?? 0) - (hexToNumber(a.blockNum) ?? 0));
  const seen = new Map<string, { address: string; symbol: string }>();
  for (const t of byBlock.slice(0, RECENT)) {
    const address = t.rawContract?.address ?? "";
    const key = address.toLowerCase();
    if (key && !seen.has(key)) seen.set(key, { address, symbol: t.asset ?? "???" });
  }
  return [...seen.values()];
}

registerCapability("wallet-balance-lookup", async (input: CapabilityInput) => {
  const address = requireAddress(input.address ?? input.wallet ?? input.wallet_address, "address");
  const chain = resolveChain(input, TRANSFER_CHAINS, "chain_id", "chain");

  const [balanceHex, incoming, outgoing] = await Promise.all([
    alchemyRpc<string>(chain, "eth_getBalance", [address, "latest"]),
    assetTransfers({ chain, address, direction: "to", category: ["erc20"], order: "desc", maxCount: RECENT }),
    assetTransfers({ chain, address, direction: "from", category: ["erc20"], order: "desc", maxCount: RECENT }),
  ]);
  const balanceWei = hexToBigInt(balanceHex) ?? 0n;
  const transfers = [...incoming, ...outgoing];
  const tokens = recentTokens(transfers).slice(0, MAX_TOKENS);

  // Token names are not in the transfer index; one metadata call per token.
  const names = await Promise.allSettled(
    tokens.map((t) => alchemyRpc<{ name?: string | null }>(chain, "alchemy_getTokenMetadata", [t.address])),
  );

  return {
    output: {
      address,
      chain_id: chain.id,
      native_symbol: chain.nativeSymbol,
      native_balance_wei: balanceWei.toString(),
      native_balance_eth: weiToEth(balanceWei),
      recent_tokens: tokens.map((t, i) => {
        const r = names[i];
        const name = r.status === "fulfilled" && r.value?.name ? r.value.name : "Unknown";
        return { name, symbol: t.symbol, address: t.address };
      }),
      token_transfer_count: Math.min(transfers.length, RECENT),
      note: "recent_tokens is derived from the last 100 token transfers, not actual balances.",
    },
    provenance: { source: `${chain.host} (via Alchemy)`, fetched_at: new Date().toISOString() },
  };
});
