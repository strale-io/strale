import { registerCapability, type CapabilityInput } from "./index.js";

// GoPlus Security — Address Security API (free, no key required)
const API = "https://api.gopluslabs.io/api/v1/address_security";

const RISK_FIELD_LABELS: Record<string, string> = {
  blacklist_doubt: "blacklist",
  honeypot_related_address: "honeypot_related",
  phishing_activities: "phishing",
  blackmail_activities: "blackmail",
  stealing_attack: "stealing",
  fake_kyc: "fake_kyc",
  malicious_mining_activities: "malicious_mining",
  darkweb_transactions: "darkweb",
  cybercrime: "cybercrime",
  money_laundering: "money_laundering",
  financial_crime: "financial_crime",
};

registerCapability("wallet-risk-score", async (input: CapabilityInput) => {
  const address = (
    (input.address as string) ??
    (input.wallet as string) ??
    (input.wallet_address as string) ??
    ""
  ).trim();
  if (!address) throw new Error("'address' is required. Provide a wallet address (0x...).");
  if (address.length < 10) throw new Error("'address' must be a valid wallet address.");

  const chainId = ((input.chain_id as string) ?? (input.chain as string) ?? "1").trim();

  const url = `${API}/${encodeURIComponent(address)}?chain_id=${encodeURIComponent(chainId)}`;
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
  const now = new Date().toISOString();

  // GoPlus address_security returns a flat object (not keyed by address)
  // Check if result has direct risk fields or is nested by address
  const isFlat = typeof result.cybercrime === "string" || typeof result.phishing_activities === "string";
  const entry = isFlat ? result : (result[address.toLowerCase()] ?? result[Object.keys(result)[0]] ?? null);

  if (!entry || Object.keys(entry).length === 0) {
    return {
      output: {
        address,
        chain_id: chainId,
        risk_level: "unknown",
        is_malicious: false,
        risk_labels: [],
        details: null,
        note: "No security data available for this address on the specified chain.",
      },
      provenance: { source: "api.gopluslabs.io", fetched_at: now },
    };
  }

  // Convert "0"/"1" string fields to booleans and collect risk labels
  const riskLabels: string[] = [];
  const details: Record<string, boolean> = {};

  for (const [field, label] of Object.entries(RISK_FIELD_LABELS)) {
    const val = entry[field] === "1" || entry[field] === 1;
    details[field] = val;
    if (val) riskLabels.push(label);
  }

  const isMalicious = riskLabels.length > 0;
  const riskLevel = isMalicious ? "high" : "low";

  return {
    output: {
      address,
      chain_id: chainId,
      risk_level: riskLevel,
      is_malicious: isMalicious,
      risk_labels: riskLabels,
      details,
    },
    provenance: { source: "api.gopluslabs.io", fetched_at: now },
  };
});
