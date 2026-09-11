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
 * Ethereum mainnet only. The production key's enabled networks are not
 * verifiable from here, and customers asked for mainnet in all but a handful
 * of calls; callers refuse any other chain rather than guess.
 */
import { getEthRpcEndpoints, NO_LICENSED_ETH_RPC } from "../../lib/eth-rpc-endpoints.js";
import { readJsonWithLimit } from "../../lib/resource-limits.js";

export const SUPPORTED_CHAIN_ID = "1";

/** The chain a caller asked for, or a refusal naming the one it can serve. */
export function requireMainnet(input: Record<string, unknown>, ...keys: string[]): string {
  let raw: unknown;
  for (const k of keys) if (input[k] !== undefined && input[k] !== null && input[k] !== "") { raw = input[k]; break; }
  const chainId = raw === undefined ? SUPPORTED_CHAIN_ID : String(raw).trim().toLowerCase();
  if (chainId === SUPPORTED_CHAIN_ID || chainId === "ethereum" || chainId === "mainnet" || chainId === "eth") {
    return SUPPORTED_CHAIN_ID;
  }
  throw new Error(`'chain_id' must be 1 (Ethereum mainnet); '${String(raw)}' is not supported by this capability.`);
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

export async function alchemyRpc<T>(method: string, params: unknown[]): Promise<T> {
  const [endpoint] = getEthRpcEndpoints();
  if (!endpoint) throw new Error(NO_LICENSED_ETH_RPC);
  // unguarded-fetch-ok: fixed Alchemy host from eth-rpc-endpoints; user input travels only in the JSON-RPC body
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Strale/1.0" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 429) throw new Error("Ethereum RPC is rate-limiting requests right now. Retry shortly.");
  if (!res.ok) throw new Error(`Ethereum RPC returned HTTP ${res.status}.`);
  const body = await readJsonWithLimit<{ result?: T; error?: { message?: string } }>(res);
  if (body.error) throw new Error(`Ethereum RPC error: ${body.error.message ?? "unknown"}`);
  if (body.result === undefined) throw new Error("Ethereum RPC returned no result.");
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
  const result = await alchemyRpc<{ transfers?: AssetTransfer[] }>("alchemy_getAssetTransfers", [params]);
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
