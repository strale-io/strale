import { registerCapability, type CapabilityInput } from "./index.js";

// GoPlus Security — Token Security API (free, no key required)
const API = "https://api.gopluslabs.io/api/v1/token_security";

function toBool(val: unknown): boolean {
  return val === "1" || val === 1 || val === true;
}

function parseTax(val: unknown): number {
  if (val == null || val === "") return 0;
  const n = parseFloat(String(val));
  return isNaN(n) ? 0 : n;
}

registerCapability("token-security-check", async (input: CapabilityInput) => {
  const contractAddress = (
    (input.contract_address as string) ??
    (input.address as string) ??
    (input.token as string) ??
    (input.contract as string) ??
    ""
  ).trim();
  if (!contractAddress) throw new Error("'contract_address' is required. Provide a token contract address (0x...).");
  if (contractAddress.length < 10) throw new Error("'contract_address' must be a valid contract address.");

  const chainId = ((input.chain_id as string) ?? (input.chain as string) ?? "1").trim();

  const url = `${API}/${encodeURIComponent(chainId)}?contract_addresses=${encodeURIComponent(contractAddress)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Strale/1.0" },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) throw new Error(`GoPlus API returned HTTP ${response.status}`);

  const data = (await response.json()) as any;

  if (data.code !== 1 && data.code !== "1") {
    throw new Error(`GoPlus API error: ${data.message ?? "unknown error"}`);
  }

  const result = data.result ?? {};
  const addrKey = contractAddress.toLowerCase();
  const entry = result[addrKey] ?? result[Object.keys(result)[0]] ?? null;

  const now = new Date().toISOString();

  if (!entry || Object.keys(entry).length === 0) {
    return {
      output: {
        contract_address: contractAddress,
        chain_id: chainId,
        risk_level: "unknown",
        is_honeypot: false,
        sell_tax: "0",
        buy_tax: "0",
        note: "No security data available for this token on the specified chain.",
      },
      provenance: { source: "api.gopluslabs.io", fetched_at: now },
    };
  }

  const isHoneypot = toBool(entry.is_honeypot);
  const sellTax = parseTax(entry.sell_tax);
  const buyTax = parseTax(entry.buy_tax);
  const isMintable = toBool(entry.is_mintable);
  const hiddenOwner = toBool(entry.hidden_owner);
  const canTakeBackOwnership = toBool(entry.can_take_back_ownership);
  const isBlacklisted = toBool(entry.is_blacklisted);
  const isOpenSource = toBool(entry.is_open_source);
  const isProxy = toBool(entry.is_proxy);
  const isInDex = toBool(entry.is_in_dex);
  const isAntiWhale = toBool(entry.is_anti_whale);

  // Compute risk level
  let riskLevel: string;
  if (isHoneypot || sellTax > 0.5) {
    riskLevel = "critical";
  } else if (hiddenOwner || canTakeBackOwnership || isMintable) {
    riskLevel = "high";
  } else if (isBlacklisted || sellTax > 0.1) {
    riskLevel = "medium";
  } else {
    riskLevel = "low";
  }

  const holderCount = entry.holder_count != null ? parseInt(String(entry.holder_count), 10) : null;

  return {
    output: {
      contract_address: contractAddress,
      chain_id: chainId,
      token_name: entry.token_name ?? null,
      token_symbol: entry.token_symbol ?? null,
      risk_level: riskLevel,
      is_honeypot: isHoneypot,
      sell_tax: String(sellTax),
      buy_tax: String(buyTax),
      is_mintable: isMintable,
      hidden_owner: hiddenOwner,
      can_take_back_ownership: canTakeBackOwnership,
      is_blacklisted: isBlacklisted,
      is_open_source: isOpenSource,
      is_proxy: isProxy,
      is_in_dex: isInDex,
      is_anti_whale: isAntiWhale,
      holder_count: isNaN(holderCount as number) ? null : holderCount,
      total_supply: entry.total_supply ?? null,
      creator_address: entry.creator_address ?? null,
      owner_address: entry.owner_address ?? null,
    },
    provenance: { source: "api.gopluslabs.io", fetched_at: now },
  };
});
