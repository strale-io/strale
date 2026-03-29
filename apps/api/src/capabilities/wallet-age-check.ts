import { registerCapability, type CapabilityInput } from "./index.js";
import { etherscanFetch } from "./lib/etherscan-client.js";

registerCapability("wallet-age-check", async (input: CapabilityInput) => {
  const address = (
    (input.address as string) ??
    (input.wallet as string) ??
    (input.wallet_address as string) ??
    ""
  ).trim();
  if (!address) throw new Error("'address' is required. Provide a wallet address (0x...).");
  if (address.length < 10) throw new Error("'address' must be a valid wallet address.");

  const chainId = ((input.chain_id as string) ?? (input.chain as string) ?? "1").trim();

  const data = await etherscanFetch({
    chainid: chainId,
    module: "account",
    action: "txlist",
    address,
    startblock: "0",
    endblock: "99999999",
    page: "1",
    offset: "1",
    sort: "asc",
  });

  const now = new Date().toISOString();

  // No transactions found
  if (data.status === "0" || !data.result || data.result.length === 0) {
    return {
      output: {
        address,
        chain_id: chainId,
        has_activity: false,
        first_tx_date: null,
        first_tx_hash: null,
        age_days: 0,
      },
      provenance: { source: "etherscan.io", fetched_at: now },
    };
  }

  const firstTx = data.result[0];
  const timestamp = parseInt(String(firstTx.timeStamp), 10);
  const firstTxDate = new Date(timestamp * 1000).toISOString();
  const ageDays = Math.floor((Date.now() - timestamp * 1000) / (86400 * 1000));

  return {
    output: {
      address,
      chain_id: chainId,
      has_activity: true,
      first_tx_date: firstTxDate,
      first_tx_hash: firstTx.hash ?? null,
      age_days: ageDays,
    },
    provenance: { source: "etherscan.io", fetched_at: now },
  };
});
