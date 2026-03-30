import { registerCapability, type CapabilityInput } from "./index.js";
import { etherscanFetch } from "./lib/etherscan-client.js";

registerCapability("wallet-balance-lookup", async (input: CapabilityInput) => {
  const address = (
    (input.address as string) ??
    (input.wallet as string) ??
    (input.wallet_address as string) ??
    ""
  ).trim();
  if (!address) throw new Error("'address' is required. Provide a wallet address (0x...).");
  if (address.length < 10) throw new Error("'address' must be a valid wallet address.");

  const chainId = ((input.chain_id as string) ?? (input.chain as string) ?? "1").trim();

  // 1. Native balance
  const balanceData = await etherscanFetch({
    chainid: chainId,
    module: "account",
    action: "balance",
    address,
    tag: "latest",
  });

  const balanceWei = balanceData.result ?? "0";
  const balanceEth = parseFloat(balanceWei) / 1e18;

  // 2. Recent ERC-20 token transfers
  const tokenData = await etherscanFetch({
    chainid: chainId,
    module: "account",
    action: "tokentx",
    address,
    page: "1",
    offset: "100",
    sort: "desc",
  });

  const now = new Date().toISOString();

  // Extract unique tokens from recent transfers
  const tokenMap = new Map<string, { name: string; symbol: string; address: string }>();
  const transfers = Array.isArray(tokenData.result) ? tokenData.result : [];
  for (const tx of transfers) {
    const addr = (tx.contractAddress ?? "").toLowerCase();
    if (addr && !tokenMap.has(addr)) {
      tokenMap.set(addr, {
        name: tx.tokenName ?? "Unknown",
        symbol: tx.tokenSymbol ?? "???",
        address: tx.contractAddress,
      });
    }
  }

  return {
    output: {
      address,
      chain_id: chainId,
      native_balance_wei: balanceWei,
      native_balance_eth: Math.round(balanceEth * 1e6) / 1e6,
      recent_tokens: [...tokenMap.values()].slice(0, 20),
      token_transfer_count: transfers.length,
      note: "recent_tokens is derived from the last 100 token transfers, not actual balances.",
    },
    provenance: { source: "etherscan.io", fetched_at: now },
  };
});
