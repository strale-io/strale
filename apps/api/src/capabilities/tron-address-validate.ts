import { registerCapability, type CapabilityInput } from "./index.js";
import bs58check from "bs58check";

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const TRON_MAINNET_PREFIX = 0x41;

registerCapability("tron-address-validate", async (input: CapabilityInput) => {
  const raw = ((input.address as string) ?? (input.trx_address as string) ?? "").trim();
  if (!raw) {
    throw new Error(
      "'address' is required. Provide a Tron address (e.g. TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t)."
    );
  }

  const format_valid = BASE58_RE.test(raw) && raw.length === 34 && raw.startsWith("T");

  let decoded: Uint8Array | null = null;
  if (format_valid) {
    try {
      decoded = bs58check.decode(raw);
    } catch {
      decoded = null;
    }
  }
  const checksum_valid = decoded !== null && decoded.length === 21;
  const prefix_valid = checksum_valid && decoded![0] === TRON_MAINNET_PREFIX;

  const valid = format_valid && checksum_valid && prefix_valid;

  return {
    output: {
      input: raw,
      valid,
      format_valid,
      checksum_valid,
      prefix_valid,
      network: valid ? "mainnet" : null,
      normalized: valid ? raw : null,
    },
    provenance: {
      source: "Algorithmic (Base58Check + Tron 0x41 prefix)",
      fetched_at: new Date().toISOString(),
    },
  };
});
