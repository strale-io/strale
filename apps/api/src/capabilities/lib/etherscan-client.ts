/**
 * Shared Etherscan V2 client with rate limiting.
 * All Etherscan capabilities import from here to share the 5 req/s limit.
 *
 * Licence gate (vendor-terms audit, 2026-09-10): Etherscan's API terms
 * license API Content "strictly for personal use only but not for commercial
 * use" and prohibit providing it "for commercial purposes". Strale holds only
 * a free key, and every caller — the capabilities and web3-assurance's
 * evaluators alike — is commercial use. So this client refuses to call
 * Etherscan until a commercial plan is held and ETHERSCAN_COMMERCIAL_PLAN is
 * set to "true". One gate here covers every path, including the evaluators
 * that import this client directly rather than going through a capability.
 */

const ETHERSCAN_BASE = "https://api.etherscan.io/v2/api";
let lastCallTime = 0;
const MIN_INTERVAL_MS = 210; // ~5 req/s with margin

export function etherscanCommercialUseLicensed(): boolean {
  return process.env.ETHERSCAN_COMMERCIAL_PLAN === "true";
}

export async function etherscanFetch(params: Record<string, string>): Promise<any> {
  if (!etherscanCommercialUseLicensed()) {
    throw new Error("Etherscan data is unavailable: Strale's Etherscan plan does not permit commercial use.");
  }
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) throw new Error("ETHERSCAN_API_KEY environment variable is required for this capability.");

  // Simple rate limiter — wait if too soon after last call
  const now = Date.now();
  const elapsed = now - lastCallTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
  }
  lastCallTime = Date.now();

  const url = new URL(ETHERSCAN_BASE);
  url.searchParams.set("apikey", key);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const response = await fetch(url.toString(), {
    headers: { "User-Agent": "Strale/1.0" },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) throw new Error(`Etherscan API returned HTTP ${response.status}`);

  const data = await response.json();

  // Etherscan error handling
  if (data.status === "0" && data.message !== "No transactions found") {
    const result = typeof data.result === "string" ? data.result : "";
    if (result.includes("rate limit") || result.includes("Max rate limit")) {
      throw new Error("Etherscan rate limit exceeded. Try again in a few seconds.");
    }
    if (result.includes("Invalid API Key")) {
      throw new Error("Invalid ETHERSCAN_API_KEY");
    }
  }

  return data;
}
