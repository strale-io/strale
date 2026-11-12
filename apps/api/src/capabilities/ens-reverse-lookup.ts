import { registerCapability, type CapabilityInput } from "./index.js";
import { createPublicClient, http, type Address } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { ethRpcFailure, getEthRpcEndpoints, NO_LICENSED_ETH_RPC, rpcEndpointHost } from "../lib/eth-rpc-endpoints.js";

const RPC = "Ethereum RPC";

/** Classified and key-redacted; see ethRpcFailure in lib/eth-rpc-endpoints.ts. */
function rpcFailure(err: unknown): Error {
  return ethRpcFailure(RPC, "ENS reverse lookup failed on all RPC endpoints", err);
}

function makeClient(rpcUrl: string) {
  return createPublicClient({
    chain: mainnet,
    // No transport retry: viem would wait out a provider's Retry-After up
    // to three times, hanging a 429 for minutes. The call fails unbilled
    // instead, and the next endpoint, if any, is tried (promise-audit T1
    // wave 6; today Alchemy is the only one).
    transport: http(rpcUrl, { retryCount: 0, timeout: 10_000 }),
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
