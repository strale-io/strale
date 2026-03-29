import { registerCapability, type CapabilityInput } from "./index.js";
import { createPublicClient, http, type Address } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

const PRIMARY_RPC = "https://cloudflare-eth.com";
const FALLBACK_RPC = "https://eth.llamarpc.com";

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

  for (const rpcUrl of [PRIMARY_RPC, FALLBACK_RPC]) {
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
          provenance: { source: "ens.domains (via cloudflare-eth.com)", fetched_at: now },
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
        provenance: { source: "ens.domains (via cloudflare-eth.com)", fetched_at: now },
      };
    } catch (err) {
      if (rpcUrl === FALLBACK_RPC) {
        throw new Error(`ENS reverse lookup failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  throw new Error("ENS reverse lookup failed on all RPC endpoints.");
});
