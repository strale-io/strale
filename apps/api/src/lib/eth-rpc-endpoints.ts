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
 * True when an RPC error is the contract's own answer rather than the provider
 * failing: a revert (viem's ExecutionRevertedError /
 * ContractFunctionRevertedError, JSON-RPC code 3), an empty return
 * (ContractFunctionZeroDataError) or a return that does not decode
 * (AbiDecoding*Error). Such an error is never typed as unavailable, whatever
 * its text says.
 */
export function isContractAnswer(err: unknown): boolean {
  let answer = false;
  for (let e: unknown = err, depth = 0; e && depth < 8; e = (e as { cause?: unknown }).cause, depth++) {
    const name = (e as { name?: unknown }).name;
    // An offchain (CCIP-read) gateway's failure is not the contract's answer,
    // whatever viem wraps around it or finds under it.
    if (typeof name === "string" && name.startsWith("OffchainLookup")) return false;
    // viem wraps a JSON-RPC internal error (-32603) as
    // ContractFunctionRevertedError, so only one that says it reverted is.
    if (isInternalRpcError(e) && !/revert/i.test(rpcText(e))) return false;
    if (typeof name === "string" && /Revert|ZeroData|AbiDecoding/.test(name)) answer = true;
    if ((e as { code?: unknown }).code === 3) answer = true;
    // The EVM stopping the contract (out of gas, an invalid opcode such as an
    // old Solidity assert, a bad jump or stack) is the contract's answer too;
    // nodes report it as a JSON-RPC error with the reason in its text.
    if (typeof (e as { code?: unknown }).code === "number" && VM_EXECUTION_ERROR.test(rpcText(e))) answer = true;
  }
  return answer;
}

const VM_EXECUTION_ERROR = /out of gas|invalid opcode|stack (?:under|over)flow|invalid jump/i;

function isInternalRpcError(e: unknown): boolean {
  return (e as { code?: unknown }).code === -32603;
}

/**
 * The text of one node of a viem error chain. The innermost node is the raw
 * JSON-RPC error object, whose reason is only in `message`.
 */
function rpcText(e: unknown): string {
  const node = e as { details?: unknown; shortMessage?: unknown; message?: unknown };
  return [node.details, node.shortMessage, node.message]
    .filter((t): t is string => typeof t === "string")
    .join(" ");
}

/** The upstream named for a failing offchain gateway; a fixed label, never its URL. */
export const ENS_OFFCHAIN_GATEWAY = "ENS offchain gateway";

/**
 * The error for a name whose resolver hands the lookup to an offchain
 * (CCIP-read, EIP-3668) gateway that then fails. The gateway is chosen by the
 * name's owner, not by Strale, so its failure is the target's: unbilled and
 * never counted against the capability or opened on Alchemy's breaker. The
 * gateway's URL is never put in the message.
 *
 * viem wraps everything that fails after the resolver's OffchainLookup revert
 * in an OffchainLookupError: the gateway's HTTP status or silence
 * (HttpRequestError), an answer that is not hex
 * (OffchainLookupResponseMalformedError), a sender mismatch, and the callback
 * eth_call that hands the gateway's answer back to the resolver
 * (CallExecutionError). A revert of that callback is the resolver rejecting
 * its own gateway's answer, so it is the target's too; any other callback
 * failure is the provider's, and null is returned so the caller classifies it.
 */
function offchainGatewayFailure(lookup: unknown): UpstreamUnavailableError | null {
  const unusable = (code: string) =>
    new UpstreamUnavailableError(ENS_OFFCHAIN_GATEWAY, "the name's offchain gateway answered with data that cannot be used.", {
      code,
      retryable: false,
      targetFault: true,
    });
  const cause = (lookup as { cause?: unknown }).cause;
  // The callback reverted with a second OffchainLookup and that lookup failed:
  // classify the inner one, whose failure may be the provider's.
  if ((cause as { name?: unknown } | undefined)?.name === "OffchainLookupError") return offchainGatewayFailure(cause);
  if ((cause as { name?: unknown } | undefined)?.name === "CallExecutionError") {
    return isContractAnswer(cause) ? unusable("CallbackReverted") : null;
  }
  for (let e: unknown = cause, depth = 0; e && depth < 8; e = (e as { cause?: unknown }).cause, depth++) {
    const name = (e as { name?: unknown }).name;
    // A malformed answer or a sender mismatch will not change on a retry.
    if (typeof name === "string" && name.startsWith("OffchainLookup")) return unusable(name);
    const status = (e as { status?: unknown }).status;
    if (typeof status === "number") {
      return new UpstreamUnavailableError(ENS_OFFCHAIN_GATEWAY, `the name's offchain gateway answered HTTP ${status}.`, {
        code: `HTTP ${status}`,
        retryable: status >= 500 || status === 408 || status === 429,
        targetFault: true,
      });
    }
  }
  return new UpstreamUnavailableError(ENS_OFFCHAIN_GATEWAY, "the name's offchain gateway did not answer; retry later.", {
    retryable: true,
    targetFault: true,
  });
}

/**
 * Classify a JSON-RPC error body (code + message) that names a provider
 * failure rather than an answer: a rate limit (Alchemy sends code 429, or
 * -32005, inside an HTTP 200 or a JSON 429) or a rejected key (Alchemy
 * answers HTTP 401/403 with a JSON-RPC body, code -32600, which viem
 * surfaces without an HTTP status). Returns null for anything else, which
 * callers keep as a plain error.
 */
export function jsonRpcUnavailable(upstream: string, code: unknown, text: string): UpstreamUnavailableError | null {
  // A revert is the contract's answer, whatever its reason string says.
  if (code === 3 || /execution reverted/i.test(text)) return null;
  if (code === 429 || code === -32005 || /compute units|rate.?limit|too many requests/i.test(text)) {
    return httpUnavailable(upstream, 429);
  }
  if (/must be authenticated|invalid api key|unauthori[sz]ed/i.test(text)) return httpUnavailable(upstream, 401);
  if (/not on (the )?whitelist/i.test(text)) return httpUnavailable(upstream, 403);
  // An internal error that is not a revert is the provider failing.
  if (code === -32603) {
    return new UpstreamUnavailableError(upstream, "internal error (JSON-RPC -32603); retry shortly.", {
      code: "JSON-RPC -32603",
      retryable: true,
    });
  }
  return null;
}

/**
 * The error for an RPC call that threw. viem wraps the transport failure (an
 * HTTP status, a timeout, a network error, a JSON-RPC error body) several
 * causes deep (ContractFunctionExecutionError > CallExecutionError >
 * HttpRequestError | RpcRequestError), so the chain is walked for it and a
 * classified, unbilled UpstreamUnavailableError is returned. A contract
 * revert or undecodable return is never classified. Anything else becomes a plain error built from
 * viem's short message (never its full message, which quotes the request
 * URL), redacted, with no cause attached, so no URL reaches a log through the
 * cause chain either.
 */
export function ethRpcFailure(upstream: string, prefix: string, err: unknown): Error {
  if (!isContractAnswer(err)) {
    for (let e: unknown = err, depth = 0; e && depth < 8; e = (e as { cause?: unknown }).cause, depth++) {
      // An offchain gateway's failure is the name's, not Alchemy's; only a
      // provider failure on the callback call walks on down the chain.
      const name = (e as { name?: unknown }).name;
      if (name === "OffchainLookupError") {
        const gateway = offchainGatewayFailure(e);
        if (gateway) return gateway;
      }
      const status = (e as { status?: unknown }).status;
      if (typeof status === "number") return withoutCause(httpUnavailable(upstream, status));
      const typed = fetchUnavailable(upstream, e);
      if (typed instanceof UpstreamUnavailableError) return withoutCause(typed);
      const code = (e as { code?: unknown }).code;
      if (typeof code === "number") {
        const rpc = jsonRpcUnavailable(upstream, code, rpcText(e));
        if (rpc) return rpc;
      }
    }
  }
  return new Error(`${prefix}: ${safeRpcMessage(err)}`);
}

/** viem's short message (plus details), redacted, without long hex blobs. */
function safeRpcMessage(err: unknown): string {
  const short = (err as { shortMessage?: unknown })?.shortMessage;
  const details = (err as { details?: unknown })?.details;
  let text: string;
  if (typeof short === "string" && short) {
    text = typeof details === "string" && details && !short.includes(details) ? `${short} (${details})` : short;
  } else {
    text = err instanceof Error ? err.message : String(err);
  }
  return redactRpcSecrets(text).replace(/0x[0-9a-f]{16,}/gi, "0x…");
}

export function withoutCause(err: Error): Error {
  // The classified message never quotes the URL; the cause (viem's error)
  // does, so it is dropped rather than carried into logs.
  if ("cause" in err) {
    try { delete (err as { cause?: unknown }).cause; } catch { /* degraded-ok: a non-configurable cause stays; the message itself carries no URL. */ }
  }
  return err;
}
