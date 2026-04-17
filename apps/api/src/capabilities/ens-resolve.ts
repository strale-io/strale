import { registerCapability, type CapabilityInput } from "./index.js";
import { createPublicClient, http, namehash, type Hex } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

// F-0-006 Bucket D: ENS resolution via viem's RPC to a hardcoded
// Ethereum mainnet endpoint. User input is the ENS name, not the
// network target. No SSRF surface.

// Public Ethereum RPC endpoints (free, no key)
const PRIMARY_RPC = "https://ethereum-rpc.publicnode.com";
const FALLBACK_RPC = "https://eth.llamarpc.com";

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
    transport: http(rpcUrl),
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

  for (const rpcUrl of [PRIMARY_RPC, FALLBACK_RPC]) {
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
          provenance: { source: "ens.domains (via eth RPC)", fetched_at: now },
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
          provenance: { source: "ens.domains (via eth RPC)", fetched_at: now },
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
      } catch {
        // Avatar lookup can fail — not critical
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
      if (rpcUrl === FALLBACK_RPC) {
        throw new Error(`ENS resolution failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      // Try fallback
    }
  }

  throw new Error("ENS resolution failed on all RPC endpoints.");
});
