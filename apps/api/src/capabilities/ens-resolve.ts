import { registerCapability, type CapabilityInput } from "./index.js";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

// Public Ethereum RPC endpoints (free, no key)
const PRIMARY_RPC = "https://cloudflare-eth.com";
const FALLBACK_RPC = "https://eth.llamarpc.com";

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

  // Auto-append .eth if no dot
  if (!name.includes(".")) name = `${name}.eth`;

  const normalizedName = normalize(name);
  const now = new Date().toISOString();

  // Try primary RPC, fallback on error
  for (const rpcUrl of [PRIMARY_RPC, FALLBACK_RPC]) {
    try {
      const client = makeClient(rpcUrl);

      const address = await client.getEnsAddress({ name: normalizedName });

      if (!address) {
        return {
          output: {
            name: normalizedName,
            resolved: false,
            address: null,
            avatar_url: null,
          },
          provenance: { source: "ens.domains (via cloudflare-eth.com)", fetched_at: now },
        };
      }

      // Try to get avatar (non-critical — don't fail if it errors)
      let avatarUrl: string | null = null;
      try {
        avatarUrl = await client.getEnsAvatar({ name: normalizedName }) ?? null;
      } catch {
        // Avatar lookup can fail for many reasons — not critical
      }

      return {
        output: {
          name: normalizedName,
          resolved: true,
          address,
          avatar_url: avatarUrl,
        },
        provenance: { source: "ens.domains (via cloudflare-eth.com)", fetched_at: now },
      };
    } catch (err) {
      // If this is the fallback RPC, re-throw
      if (rpcUrl === FALLBACK_RPC) {
        throw new Error(`ENS resolution failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      // Otherwise try fallback
    }
  }

  // Should not reach here, but just in case
  throw new Error("ENS resolution failed on all RPC endpoints.");
});
