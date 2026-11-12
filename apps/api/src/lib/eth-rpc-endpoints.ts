/**
 * The Ethereum mainnet JSON-RPC endpoints Strale may use commercially.
 *
 * Used by the ENS capability executors (ens-resolve, ens-reverse-lookup) and
 * the web3-assurance evaluators that read chain state.
 *
 * Alchemy only. Until 2026-09-10 a pool of four free public endpoints followed
 * it as fallbacks; the vendor-terms audit removed all four
 * (docs/security/2026-09-10-vendor-terms-audit-batch-2.md):
 *   - PublicNode: terms bar selling, re-using or distributing "the Service or
 *     the Service Content commercially" except as expressly authorized.
 *   - Ankr: terms bar "commercial exploitation of ... any element of the
 *     Service" without prior written consent.
 *   - LlamaRPC and Cloudflare's gateway: both answered HTTP 525 when probed;
 *     Cloudflare's anonymous endpoint no longer exists. LlamaRPC's terms page
 *     could not be read.
 * Alchemy's terms bar reselling access to Alchemy itself, not using it as the
 * backend of a product, which is what an ENS lookup is.
 *
 * Adding an endpoint here is a vendor-terms decision, not a reliability one:
 * vendor-terms.test.ts fails on any host in PROHIBITED_UPSTREAM_HOSTS.
 *
 * Alchemy's URL is built at request time because it embeds the API key in
 * the path. With no key the list is empty and callers report that no
 * licensed endpoint is configured.
 */

import { fetchUnavailable, httpUnavailable, UpstreamUnavailableError } from "./upstream-result.js";

/**
 * Get the ordered list of RPC endpoints to try. Reads ALCHEMY_API_KEY at call
 * time so env changes take effect without a restart.
 */
export function getEthRpcEndpoints(): string[] {
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  if (alchemyKey && alchemyKey.length > 0) {
    return [`https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`];
  }
  return [];
}

/** The error callers throw when getEthRpcEndpoints() is empty. */
export const NO_LICENSED_ETH_RPC = "No licensed Ethereum RPC endpoint is configured (ALCHEMY_API_KEY is not set).";

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

/**
 * Remove the Alchemy API key from any text that may carry an RPC URL. viem's
 * HttpRequestError message includes the request URL verbatim ("URL:
 * https://eth-mainnet.g.alchemy.com/v2/<key>"), and its cause chain carries
 * it too, so an error message built from one would put the key into logs,
 * failure records and API responses.
 */
export function redactRpcSecrets(text: string): string {
  let out = text.replace(/(alchemy\.com\/v2\/)[^\s"'/?#]+/gi, "$1[redacted]");
  const key = process.env.ALCHEMY_API_KEY;
  if (key && key.length >= 8) out = out.split(key).join("[redacted]");
  return out;
}

/**
 * The error for an RPC call that threw. viem wraps the transport failure (an
 * HTTP status, a timeout, a network error) several causes deep
 * (ContractFunctionExecutionError > CallExecutionError > HttpRequestError),
 * so the chain is walked for it and a classified, unbilled
 * UpstreamUnavailableError is returned. Anything else becomes a plain error
 * whose message has the key redacted, with no cause attached, so no URL
 * reaches a log through the cause chain either.
 */
export function ethRpcFailure(upstream: string, prefix: string, err: unknown): Error {
  for (let e: unknown = err, depth = 0; e && depth < 8; e = (e as { cause?: unknown }).cause, depth++) {
    const status = (e as { status?: unknown }).status;
    if (typeof status === "number") return withoutCause(httpUnavailable(upstream, status));
    const typed = fetchUnavailable(upstream, e);
    if (typed instanceof UpstreamUnavailableError) return withoutCause(typed);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new Error(`${prefix}: ${redactRpcSecrets(message)}`);
}

function withoutCause(err: Error): Error {
  // The classified message never quotes the URL; the cause (viem's error)
  // does, so it is dropped rather than carried into logs.
  if ("cause" in err) {
    try { delete (err as { cause?: unknown }).cause; } catch { /* degraded-ok: a non-configurable cause stays; the message itself carries no URL. */ }
  }
  return err;
}
