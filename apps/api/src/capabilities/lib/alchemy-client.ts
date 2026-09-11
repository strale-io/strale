/**
 * Shared Alchemy JSON-RPC client for the Ethereum capabilities.
 *
 * Rebuilt 2026-09-11 onto Alchemy after the vendor-terms audit took these
 * capabilities off Etherscan's free API, whose terms forbid commercial use
 * (docs/security/2026-09-10-vendor-terms-audit-batch-2.md). Alchemy's terms
 * bar reselling access to Alchemy itself, not using it as the backend of a
 * product: its services may not be resold "except as integrated with its own
 * offerings that provide additional functionality to its end users". Every
 * caller here returns its own answer (a balance, fee tiers, a wallet's age),
 * never Alchemy access.
 *
 * Chains (2026-09-11): one key serves every Alchemy network by default. Each
 * capability declares which of the chains below it serves, and only chains
 * whose needed methods Alchemy documents are listed: the transfer index and
 * its block timestamps ("withMetadata") are documented for Ethereum, Base,
 * Polygon, Arbitrum and Optimism only. Each served chain also has its own
 * known_answer suite, so production proves every chain separately.
 */
import { NO_LICENSED_ETH_RPC } from "../../lib/eth-rpc-endpoints.js";
import { readJsonWithLimit } from "../../lib/resource-limits.js";

export interface Chain {
  /** Decimal chain id, as returned in outputs. */
  id: string;
  name: string;
  /** Alchemy network prefix: https://<host>.g.alchemy.com/v2/<key>. */
  host: string;
  /** The chain's native coin, which native balances and transfer values are in. */
  nativeSymbol: string;
  /** Names callers use for it, besides the id. */
  aliases: string[];
}

export const CHAINS: Record<string, Chain> = {
  "1": { id: "1", name: "Ethereum", host: "eth-mainnet", nativeSymbol: "ETH", aliases: ["ethereum", "eth", "mainnet"] },
  "8453": { id: "8453", name: "Base", host: "base-mainnet", nativeSymbol: "ETH", aliases: ["base"] },
  "42161": { id: "42161", name: "Arbitrum One", host: "arb-mainnet", nativeSymbol: "ETH", aliases: ["arbitrum", "arb", "arbitrum-one"] },
  "10": { id: "10", name: "OP Mainnet", host: "opt-mainnet", nativeSymbol: "ETH", aliases: ["optimism", "op", "op-mainnet"] },
  "137": { id: "137", name: "Polygon PoS", host: "polygon-mainnet", nativeSymbol: "POL", aliases: ["polygon", "matic", "pol"] },
  "56": { id: "56", name: "BNB Smart Chain", host: "bnb-mainnet", nativeSymbol: "BNB", aliases: ["bnb", "bsc", "binance"] },
};

/** Chains with Alchemy's transfer index and block timestamps (documented). */
export const TRANSFER_CHAINS = ["1", "8453", "42161", "10", "137"] as const;

/** Resolve a caller's chain against the chains a capability serves, or refuse naming them. */
export function resolveChain(input: Record<string, unknown>, served: readonly string[], ...keys: string[]): Chain {
  let raw: unknown;
  for (const k of keys) if (input[k] !== undefined && input[k] !== null && input[k] !== "") { raw = input[k]; break; }
  const wanted = raw === undefined ? "1" : String(raw).trim().toLowerCase();
  const byId = /^0x[0-9a-f]+$/.test(wanted) ? String(Number.parseInt(wanted, 16)) : wanted;
  const chain = CHAINS[byId] ?? Object.values(CHAINS).find((c) => c.aliases.includes(wanted));
  if (chain && served.includes(chain.id)) return chain;
  const list = served.map((id) => `${id} (${CHAINS[id].name})`).join(", ");
  throw new Error(`'chain_id' must be one of ${list}; '${String(raw)}' is not supported by this capability.`);
}

function alchemyUrl(chain: Chain): string {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error(NO_LICENSED_ETH_RPC);
  return `https://${chain.host}.g.alchemy.com/v2/${key}`;
}

/** A 0x-prefixed 20-byte address, or a refusal. */
export function requireAddress(raw: unknown, field: string): string {
  const address = typeof raw === "string" ? raw.trim() : "";
  if (!address) throw new Error(`'${field}' is required. Provide an Ethereum address (0x...).`);
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error(`'${field}' must be an Ethereum address (0x followed by 40 hex characters).`);
  }
  return address;
}

export async function alchemyRpc<T>(chain: Chain, method: string, params: unknown[]): Promise<T> {
  const endpoint = alchemyUrl(chain);
  // unguarded-fetch-ok: host comes from the fixed CHAINS registry; user input travels only in the JSON-RPC body
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Strale/1.0" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 429) throw new Error(`${chain.name} RPC is rate-limiting requests right now. Retry shortly.`);
  if (!res.ok) throw new Error(`${chain.name} RPC returned HTTP ${res.status}.`);
  const body = await readJsonWithLimit<{ result?: T; error?: { message?: string } }>(res);
  if (body.error) throw new Error(`${chain.name} RPC error: ${body.error.message ?? "unknown"}`);
  if (body.result === undefined) throw new Error(`${chain.name} RPC returned no result.`);
  return body.result;
}

export interface AssetTransfer {
  blockNum: string;
  hash: string;
  from: string;
  to: string | null;
  value: number | null;
  asset: string | null;
  category: string;
  rawContract?: { address?: string | null; value?: string | null; decimal?: string | null };
  metadata?: { blockTimestamp?: string };
}

/**
 * alchemy_getAssetTransfers in one direction. Alchemy filters by either
 * fromAddress or toAddress per request, so a wallet's full view is two calls.
 */
export async function assetTransfers(opts: {
  chain: Chain;
  address: string;
  direction: "from" | "to";
  category: string[];
  order: "asc" | "desc";
  maxCount: number;
}): Promise<AssetTransfer[]> {
  const params: Record<string, unknown> = {
    fromBlock: "0x0",
    toBlock: "latest",
    category: opts.category,
    order: opts.order,
    maxCount: `0x${opts.maxCount.toString(16)}`,
    withMetadata: true,
    excludeZeroValue: false,
  };
  params[opts.direction === "from" ? "fromAddress" : "toAddress"] = opts.address;
  const result = await alchemyRpc<{ transfers?: AssetTransfer[] }>(opts.chain, "alchemy_getAssetTransfers", [params]);
  return Array.isArray(result.transfers) ? result.transfers : [];
}

export const hexToNumber = (hex: string | null | undefined): number | null => {
  if (typeof hex !== "string" || !/^0x[0-9a-f]+$/i.test(hex)) return null;
  const n = Number.parseInt(hex, 16);
  return Number.isFinite(n) ? n : null;
};

export const hexToBigInt = (hex: string | null | undefined): bigint | null => {
  if (typeof hex !== "string" || !/^0x[0-9a-f]*$/i.test(hex)) return null;
  return hex === "0x" ? 0n : BigInt(hex);
};

/** Wei (as bigint) to a rounded decimal number of ETH (6 places). */
export function weiToEth(wei: bigint): number {
  const whole = wei / 10n ** 12n; // micro-ether units
  return Number(whole) / 1e6;
}
