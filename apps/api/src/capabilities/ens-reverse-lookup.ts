import { registerCapability, type CapabilityInput } from "./index.js";
import { createPublicClient, http, type Address } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { getEthRpcEndpoints, NO_LICENSED_ETH_RPC, rpcEndpointHost } from "../lib/eth-rpc-endpoints.js";
import { fetchUnavailable, httpUnavailable, UpstreamUnavailableError } from "../lib/upstream-result.js";

const RPC = "Ethereum RPC";

/**
 * The error for an RPC call that threw. viem wraps the transport failure
 * (an HTTP status, a timeout, a network error) several causes deep
 * (ContractFunctionExecutionError > CallExecutionError > HttpRequestError),
 * so the chain is walked for it. Anything else keeps the message it had.
 */
function rpcFailure(err: unknown): Error {
  for (let e: unknown = err, depth = 0; e && depth < 8; e = (e as { cause?: unknown }).cause, depth++) {
    const status = (e as { status?: unknown }).status;
    if (typeof status === "number") return httpUnavailable(RPC, status);
    const typed = fetchUnavailable(RPC, e);
    if (typed instanceof UpstreamUnavailableError) return typed;
  }
  return new Error(`ENS reverse lookup failed on all RPC endpoints: ${err instanceof Error ? err.message : String(err)}`);
}

function makeClient(rpcUrl: string) {
  return createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  });
}

registerCapability("ens-reverse-lookup", async (input: CapabilityInput) => {
  const address = (
    (input.address as string) ??
    (input.wallet as string) ??
    (input.wallet_address as string) ??
    ""
  ).trim();
  if (!address) throw new Error("'address' is required. Provide an Ethereum wallet address (0x...).");
  if (!address.match(/^0x[a-fA-F0-9]{40}$/)) throw new Error("'address' must be a valid Ethereum address (0x + 40 hex characters).");

  const now = new Date().toISOString();

  const endpoints = getEthRpcEndpoints();
  if (endpoints.length === 0) throw new Error(NO_LICENSED_ETH_RPC);
  let lastError: unknown;
  for (let i = 0; i < endpoints.length; i++) {
    const rpcUrl = endpoints[i];
    const isLast = i === endpoints.length - 1;
    try {
      const client = makeClient(rpcUrl);

      const ensName = await client.getEnsName({ address: address as Address });

      if (!ensName) {
        return {
          output: {
            address,
            has_ens: false,
            ens_name: null,
            verified: false,
          },
          provenance: { source: `ens.domains (via ${rpcEndpointHost(rpcUrl)})`, fetched_at: now },
        };
      }

      // Forward verification: confirm the name resolves back to this address.
      // viem answers null for a name with no resolver or no address, which is
      // `verified: false`. An RPC failure is not (2026-11-06 swallowed-failures
      // audit, row 35): before, it was caught here and billed as an
      // unverified name; now it falls to the endpoint loop and throws.
      let normalized: string | null;
      try {
        normalized = normalize(ensName);
      } catch {
        // degraded-ok: a reverse record whose name does not normalise cannot resolve forward, so it is genuinely unverified; no request was made.
        normalized = null;
      }
      let verified = false;
      if (normalized !== null) {
        const resolvedAddress = await client.getEnsAddress({ name: normalized });
        verified = resolvedAddress?.toLowerCase() === address.toLowerCase();
      }

      return {
        output: {
          address,
          has_ens: true,
          ens_name: ensName,
          verified,
        },
        provenance: { source: `ens.domains (via ${rpcEndpointHost(rpcUrl)})`, fetched_at: now },
      };
    } catch (err) {
      // degraded-ok: the failure is kept in lastError and the next endpoint is tried; the last endpoint's failure throws through rpcFailure, unbilled.
      lastError = err;
      if (isLast) throw rpcFailure(err);
    }
  }

  throw rpcFailure(lastError);
});
