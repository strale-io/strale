/**
 * Shared Etherscan V2 client with rate limiting.
 * All Etherscan capabilities import from here to share the 5 req/s limit.
 */

const ETHERSCAN_BASE = "https://api.etherscan.io/v2/api";
let lastCallTime = 0;
const MIN_INTERVAL_MS = 210; // ~5 req/s with margin

export async function etherscanFetch(params: Record<string, string>): Promise<any> {
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
