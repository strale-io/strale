import { registerCapability, type CapabilityInput } from "./index.js";
import { createPublicClient, http, namehash, type Hex } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { ethRpcFailure, getEthRpcEndpoints, isContractAnswer, NO_LICENSED_ETH_RPC, rpcEndpointHost } from "../lib/eth-rpc-endpoints.js";

// F-0-006 Bucket D: ENS resolution uses viem's RPC against the hardcoded
// Ethereum mainnet endpoint pool in lib/eth-rpc-endpoints.ts. User input
// is the ENS name, not the network target. No SSRF surface.

// ENS Registry and Public Resolver addresses on mainnet
const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as const;

// ABI fragments for direct contract calls
const registryAbi = [
  { name: "resolver", type: "function", stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }] },
] as const;

const resolverAbi = [
  { name: "addr", type: "function", stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }] },
  { name: "text", type: "function", stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }, { name: "key", type: "string" }],
    outputs: [{ name: "", type: "string" }] },
] as const;

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

registerCapability("ens-resolve", async (input: CapabilityInput) => {
  let name = (
    (input.name as string) ??
    (input.ens_name as string) ??
    (input.domain as string) ??
    (input.ens as string) ??
    ""
  ).trim().toLowerCase();
  if (!name) throw new Error("'name' is required. Provide an ENS name (e.g., 'vitalik.eth').");
  if (name.length < 2) throw new Error("'name' must be at least 2 characters.");

  if (!name.includes(".")) name = `${name}.eth`;

  const normalizedName = normalize(name);
  const node = namehash(normalizedName);
  const now = new Date().toISOString();

  const endpoints = getEthRpcEndpoints();
  if (endpoints.length === 0) throw new Error(NO_LICENSED_ETH_RPC);
  let lastError: unknown;
  for (let i = 0; i < endpoints.length; i++) {
    const rpcUrl = endpoints[i];
    const isLast = i === endpoints.length - 1;
    try {
      const client = makeClient(rpcUrl);

      // Step 1: Get the resolver for this name from ENS Registry
      const resolverAddr = await client.readContract({
        address: ENS_REGISTRY,
        abi: registryAbi,
        functionName: "resolver",
        args: [node],
      });

      if (!resolverAddr || resolverAddr === "0x0000000000000000000000000000000000000000") {
        return {
          output: {
            name: normalizedName,
            resolved: false,
            address: null,
            avatar_url: null,
            resolver: null,
          },
          provenance: { source: `ens.domains (via ${rpcEndpointHost(rpcUrl)})`, fetched_at: now },
        };
      }

      // Step 2: Get the address from the resolver
      const address = await client.readContract({
        address: resolverAddr,
        abi: resolverAbi,
        functionName: "addr",
        args: [node],
      });

      if (!address || address === "0x0000000000000000000000000000000000000000") {
        return {
          output: {
            name: normalizedName,
            resolved: false,
            address: null,
            avatar_url: null,
            resolver: resolverAddr,
          },
          provenance: { source: `ens.domains (via ${rpcEndpointHost(rpcUrl)})`, fetched_at: now },
        };
      }

      // Step 3: Try to get avatar text record (non-critical)
      let avatarUrl: string | null = null;
      try {
        const avatar = await client.readContract({
          address: resolverAddr,
          abi: resolverAbi,
          functionName: "text",
          args: [node, "avatar"],
        });
        if (avatar) avatarUrl = avatar;
      } catch (err) {
        // degraded-ok: a resolver without an avatar record, or without text() at all, reverts or returns nothing, which is "no avatar" (avatar_url null); any provider failure is rethrown and leaves through ethRpcFailure, unbilled, so the avatar is never silently lost on a billed call.
        if (!isContractAnswer(err)) throw err;
      }

      return {
        output: {
          name: normalizedName,
          resolved: true,
          address,
          avatar_url: avatarUrl,
          resolver: resolverAddr,
        },
        provenance: { source: "ens.domains (via eth RPC)", fetched_at: now },
      };
    } catch (err) {
      // degraded-ok: the failure is kept in lastError and the next endpoint is tried; the last endpoint's failure throws through ethRpcFailure, unbilled and with the key redacted.
      lastError = err;
      if (isLast) {
        throw ethRpcFailure("Ethereum RPC", "ENS resolution failed on all RPC endpoints", err);
      }
    }
  }

  throw ethRpcFailure("Ethereum RPC", "ENS resolution failed on all RPC endpoints", lastError);
});
