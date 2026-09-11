import { registerCapability, type CapabilityInput } from "./index.js";
import { assetTransfers, hexToNumber, requireAddress, requireMainnet, type AssetTransfer } from "./lib/alchemy-client.js";

// Rebuilt 2026-09-11 onto Alchemy's transfer index after Etherscan's free API
// was found to forbid commercial use. The index lists top-level ETH transfers
// without receipts, so gas_used and is_error are no longer known (null).
const NOTE = "Top-level ETH transfers to and from the address (Ethereum mainnet). Gas used and failure status are not available from this source and are null.";

/** Pure: newest-first merge of both directions, capped. Exported for tests. */
export function mergeTransactions(address: string, incoming: AssetTransfer[], outgoing: AssetTransfer[], limit: number) {
  const self = address.toLowerCase();
  const seen = new Set<string>();
  const merged = [...incoming, ...outgoing]
    .filter((t) => (seen.has(t.hash + t.from + t.to) ? false : (seen.add(t.hash + t.from + t.to), true)))
    .sort((a, b) => (hexToNumber(b.blockNum) ?? 0) - (hexToNumber(a.blockNum) ?? 0))
    .slice(0, limit);
  let sent = 0;
  let received = 0;
  const transactions = merged.map((t) => {
    const isSent = (t.from ?? "").toLowerCase() === self;
    if (isSent) sent++; else received++;
    return {
      hash: t.hash,
      from: t.from,
      to: t.to,
      value_eth: typeof t.value === "number" ? Math.round(t.value * 1e6) / 1e6 : 0,
      timestamp: t.metadata?.blockTimestamp ?? null,
      block_number: hexToNumber(t.blockNum),
      gas_used: null,
      is_error: null,
      direction: isSent ? "sent" : "received",
    };
  });
  return { transactions, sent_count: sent, received_count: received };
}

registerCapability("wallet-transactions-lookup", async (input: CapabilityInput) => {
  const address = requireAddress(input.address ?? input.wallet ?? input.wallet_address, "address");
  const chainId = requireMainnet(input, "chain_id", "chain");
  const rawLimit = typeof input.limit === "number" ? input.limit : 20;
  const limit = Math.min(Math.max(Math.floor(rawLimit), 1), 50);

  const [incoming, outgoing] = await Promise.all([
    assetTransfers({ address, direction: "to", category: ["external"], order: "desc", maxCount: limit }),
    assetTransfers({ address, direction: "from", category: ["external"], order: "desc", maxCount: limit }),
  ]);
  const { transactions, sent_count, received_count } = mergeTransactions(address, incoming, outgoing, limit);

  return {
    output: {
      address,
      chain_id: chainId,
      total_returned: transactions.length,
      sent_count,
      received_count,
      transactions,
      note: NOTE,
    },
    provenance: { source: "ethereum-mainnet (via Alchemy)", fetched_at: new Date().toISOString() },
  };
});
