import { registerCapability, type CapabilityInput } from "./index.js";
import bs58check from "bs58check";

type AddressType = "p2pkh" | "p2sh";
type Network = "mainnet" | "testnet";

const DOGE_VERSIONS: Record<number, { type: AddressType; network: Network }> = {
  0x1e: { type: "p2pkh", network: "mainnet" }, // D
  0x16: { type: "p2sh", network: "mainnet" }, // 9 / A
  0x71: { type: "p2pkh", network: "testnet" }, // n / m
  0xc4: { type: "p2sh", network: "testnet" }, // 2
};

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;

registerCapability("dogecoin-address-validate", async (input: CapabilityInput) => {
  const raw = ((input.address as string) ?? (input.doge_address as string) ?? "").trim();
  if (!raw) {
    throw new Error(
      "'address' is required. Provide a Dogecoin address (e.g. DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L)."
    );
  }

  const format_valid = BASE58_RE.test(raw) && raw.length >= 26 && raw.length <= 35;

  let decoded: Uint8Array | null = null;
  if (format_valid) {
    try {
      decoded = bs58check.decode(raw);
    } catch {
      decoded = null;
    }
  }
  const checksum_valid = decoded !== null && decoded.length === 21;

  let address_type: AddressType | null = null;
  let network: Network | null = null;
  if (checksum_valid) {
    const meta = DOGE_VERSIONS[decoded![0]];
    if (meta) {
      address_type = meta.type;
      network = meta.network;
    }
  }

  const valid = format_valid && checksum_valid && address_type !== null;

  return {
    output: {
      input: raw,
      valid,
      format_valid,
      checksum_valid,
      address_type,
      network,
      normalized: valid ? raw : null,
    },
    provenance: {
      source: "Algorithmic (Base58Check + Dogecoin version bytes 0x1E/0x16/0x71/0xC4)",
      fetched_at: new Date().toISOString(),
    },
  };
});
