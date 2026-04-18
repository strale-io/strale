import { registerCapability, type CapabilityInput } from "./index.js";
import { createPublicClient, http, type Address } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { getEthRpcEndpoints, rpcEndpointHost } from "../lib/eth-rpc-endpoints.js";

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

      // Forward verification: confirm the name resolves back to this address
      let verified = false;
      try {
        const resolvedAddress = await client.getEnsAddress({ name: normalize(ensName) });
        verified = resolvedAddress?.toLowerCase() === address.toLowerCase();
      } catch {
        // Verification failed — report as unverified
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
      lastError = err;
      if (isLast) {
        throw new Error(`ENS reverse lookup failed on all RPC endpoints: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  throw new Error(`ENS reverse lookup failed on all RPC endpoints: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
});
