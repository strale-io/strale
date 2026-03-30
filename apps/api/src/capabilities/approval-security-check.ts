import { registerCapability, type CapabilityInput } from "./index.js";

// GoPlus Security — Token Approval Security API v2 (free, no key required)
const API = "https://api.gopluslabs.io/api/v2/token_approval_security";

// Max uint256 in decimal (or close to it) — signals unlimited approval
const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

registerCapability("approval-security-check", async (input: CapabilityInput) => {
  const address = (
    (input.address as string) ??
    (input.wallet as string) ??
    (input.wallet_address as string) ??
    ""
  ).trim();
  if (!address) throw new Error("'address' is required. Provide a wallet address (0x...).");
  if (address.length < 10) throw new Error("'address' must be a valid wallet address.");

  const chainId = ((input.chain_id as string) ?? (input.chain as string) ?? "1").trim();

  const url = `${API}/${encodeURIComponent(chainId)}?addresses=${encodeURIComponent(address)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Strale/1.0" },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) throw new Error(`GoPlus API returned HTTP ${response.status}`);

  const data = (await response.json()) as any;
  const now = new Date().toISOString();

  if (data.code !== 1 && data.code !== "1") {
    throw new Error(`GoPlus API error: ${data.message ?? "unknown error"}`);
  }

  const result = data.result ?? {};
  const addrKey = address.toLowerCase();
  const approvalList = result[addrKey] ?? result[Object.keys(result)[0]] ?? [];

  // If no approvals found, return clean result
  if (!Array.isArray(approvalList) || approvalList.length === 0) {
    return {
      output: {
        address,
        chain_id: chainId,
        total_approvals: 0,
        risky_approvals: 0,
        risk_level: "none",
        approvals: [],
      },
      provenance: { source: "api.gopluslabs.io", fetched_at: now },
    };
  }

  const approvals: Array<Record<string, unknown>> = [];
  let riskyCount = 0;

  for (const item of approvalList) {
    const approvedAmount = item.approved_amount ?? item.allowance ?? "0";
    const isUnlimited = approvedAmount === MAX_UINT256 ||
      (typeof approvedAmount === "string" && approvedAmount.length > 60);
    const spenderRisk = item.address_risk ?? item.is_contract === "0";

    const isRisky = isUnlimited || spenderRisk;
    if (isRisky) riskyCount++;

    approvals.push({
      token_address: item.token_address ?? null,
      token_name: item.token_name ?? null,
      token_symbol: item.token_symbol ?? null,
      approved_spender: item.approved_spender ?? item.spender ?? null,
      approved_amount: approvedAmount,
      is_unlimited: isUnlimited,
      is_risky: isRisky,
    });
  }

  const riskLevel = riskyCount > 0 ? "high" : "low";

  return {
    output: {
      address,
      chain_id: chainId,
      total_approvals: approvals.length,
      risky_approvals: riskyCount,
      risk_level: riskLevel,
      approvals,
    },
    provenance: { source: "api.gopluslabs.io", fetched_at: now },
  };
});
