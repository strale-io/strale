/**
 * Shared list of Ethereum mainnet JSON-RPC endpoints.
 *
 * Single source of truth used by:
 *   - ENS capability executors (ens-resolve, ens-reverse-lookup)
 *   - alchemy-eth dependency health probe (via its fallbackBaseUrls)
 *
 * Order: Alchemy first (authenticated, known 100k CU/day quota) when the
 * env var is present, then a pool of free public RPCs as fallbacks. The
 * capability tries each in order and returns as soon as one succeeds, so a
 * throttled free endpoint never takes the capability down.
 *
 * Alchemy's URL is built at request time because it embeds the API key in
 * the path; other endpoints are static.
 */

const FREE_POOL: readonly string[] = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.llamarpc.com",
  "https://cloudflare-eth.com",
  "https://rpc.ankr.com/eth",
] as const;

/**
 * Get the ordered list of RPC endpoints to try for ENS resolution.
 * Reads ALCHEMY_API_KEY at call time so env changes take effect without
 * a restart.
 */
export function getEthRpcEndpoints(): string[] {
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  if (alchemyKey && alchemyKey.length > 0) {
    return [
      `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`,
      ...FREE_POOL,
    ];
  }
  return [...FREE_POOL];
}

/**
 * Host portion of an RPC URL, used for provenance reporting. Alchemy URLs
 * include the API key in the path — strip it so provenance never leaks the
 * key into test fixtures, logs, or API responses.
 */
export function rpcEndpointHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown-rpc";
  }
}
