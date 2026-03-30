import { registerCapability, type CapabilityInput } from "./index.js";
import { etherscanFetch } from "./lib/etherscan-client.js";

registerCapability("wallet-transactions-lookup", async (input: CapabilityInput) => {
  const address = (
    (input.address as string) ??
    (input.wallet as string) ??
    (input.wallet_address as string) ??
    ""
  ).trim();
  if (!address) throw new Error("'address' is required. Provide a wallet address (0x...).");
  if (address.length < 10) throw new Error("'address' must be a valid wallet address.");

  const chainId = ((input.chain_id as string) ?? (input.chain as string) ?? "1").trim();
  const rawLimit = typeof input.limit === "number" ? input.limit : 20;
  const limit = Math.min(Math.max(Math.floor(rawLimit), 1), 50);

  const data = await etherscanFetch({
    chainid: chainId,
    module: "account",
    action: "txlist",
    address,
    startblock: "0",
    endblock: "99999999",
    page: "1",
    offset: String(limit),
    sort: "desc",
  });

  const now = new Date().toISOString();
  const txList = Array.isArray(data.result) ? data.result : [];
  const addrLower = address.toLowerCase();

  let sentCount = 0;
  let receivedCount = 0;

  const transactions = txList.map((tx: any) => {
    const from = (tx.from ?? "").toLowerCase();
    const isSent = from === addrLower;
    if (isSent) sentCount++; else receivedCount++;

    const valueWei = tx.value ?? "0";
    const valueEth = parseFloat(valueWei) / 1e18;
    const timestamp = parseInt(String(tx.timeStamp), 10);

    return {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value_eth: Math.round(valueEth * 1e6) / 1e6,
      timestamp: isNaN(timestamp) ? null : new Date(timestamp * 1000).toISOString(),
      block_number: tx.blockNumber ? parseInt(tx.blockNumber, 10) : null,
      gas_used: tx.gasUsed ? parseInt(tx.gasUsed, 10) : null,
      is_error: tx.isError === "1",
      direction: isSent ? "sent" : "received",
    };
  });

  return {
    output: {
      address,
      chain_id: chainId,
      total_returned: transactions.length,
      sent_count: sentCount,
      received_count: receivedCount,
      transactions,
    },
    provenance: { source: "etherscan.io", fetched_at: now },
  };
});
