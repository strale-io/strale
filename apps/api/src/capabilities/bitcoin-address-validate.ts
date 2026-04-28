import { registerCapability, type CapabilityInput } from "./index.js";
import bs58check from "bs58check";
import { bech32, bech32m } from "bech32";

type AddressType = "p2pkh" | "p2sh" | "p2wpkh" | "p2wsh" | "p2tr" | "p2w-unknown";
type Network = "mainnet" | "testnet" | "regtest";

const BASE58_VERSIONS: Record<number, { type: AddressType; network: Network }> = {
  0x00: { type: "p2pkh", network: "mainnet" },
  0x05: { type: "p2sh", network: "mainnet" },
  0x6f: { type: "p2pkh", network: "testnet" },
  0xc4: { type: "p2sh", network: "testnet" },
};

const BECH32_HRPS: Record<string, Network> = {
  bc: "mainnet",
  tb: "testnet",
  bcrt: "regtest",
};

function tryBase58(raw: string): {
  format_valid: boolean;
  checksum_valid: boolean;
  address_type: AddressType | null;
  network: Network | null;
} {
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(raw)) {
    return { format_valid: false, checksum_valid: false, address_type: null, network: null };
  }
  let decoded: Uint8Array;
  try {
    decoded = bs58check.decode(raw);
  } catch {
    return { format_valid: true, checksum_valid: false, address_type: null, network: null };
  }
  if (decoded.length !== 21) {
    return { format_valid: true, checksum_valid: true, address_type: null, network: null };
  }
  const version = decoded[0];
  const meta = BASE58_VERSIONS[version];
  return {
    format_valid: true,
    checksum_valid: true,
    address_type: meta?.type ?? null,
    network: meta?.network ?? null,
  };
}

function tryBech32(raw: string): {
  format_valid: boolean;
  checksum_valid: boolean;
  address_type: AddressType | null;
  network: Network | null;
} {
  const lower = raw.toLowerCase();
  const sep = lower.lastIndexOf("1");
  if (sep <= 0) {
    return { format_valid: false, checksum_valid: false, address_type: null, network: null };
  }
  const hrp = lower.slice(0, sep);
  const network = BECH32_HRPS[hrp];
  if (!network) {
    return { format_valid: false, checksum_valid: false, address_type: null, network: null };
  }

  // v0 uses bech32, v1+ uses bech32m. Try the right one based on the witness version byte.
  // First peek at the version using bech32.decodeUnsafe to get the witness version.
  const peek = bech32.decodeUnsafe(lower, 90) ?? bech32m.decodeUnsafe(lower, 90);
  if (!peek || peek.words.length === 0) {
    return { format_valid: true, checksum_valid: false, address_type: null, network: null };
  }
  const witnessVersion = peek.words[0];

  // Validate with the correct checksum variant for this version.
  let decoded: { prefix: string; words: number[] } | undefined;
  try {
    decoded = witnessVersion === 0 ? bech32.decode(lower, 90) : bech32m.decode(lower, 90);
  } catch {
    return { format_valid: true, checksum_valid: false, address_type: null, network: null };
  }

  // Decode program (skip the version byte).
  let program: number[];
  try {
    program =
      witnessVersion === 0
        ? bech32.fromWords(decoded.words.slice(1))
        : bech32m.fromWords(decoded.words.slice(1));
  } catch {
    return { format_valid: true, checksum_valid: false, address_type: null, network: null };
  }

  // BIP141: program length must be 2..40 bytes; v0 must be exactly 20 (P2WPKH) or 32 (P2WSH).
  if (program.length < 2 || program.length > 40) {
    return { format_valid: true, checksum_valid: false, address_type: null, network };
  }
  let address_type: AddressType = "p2w-unknown";
  if (witnessVersion === 0) {
    if (program.length === 20) address_type = "p2wpkh";
    else if (program.length === 32) address_type = "p2wsh";
    else return { format_valid: true, checksum_valid: false, address_type: null, network };
  } else if (witnessVersion === 1) {
    if (program.length === 32) address_type = "p2tr";
  }

  return { format_valid: true, checksum_valid: true, address_type, network };
}

registerCapability("bitcoin-address-validate", async (input: CapabilityInput) => {
  const raw = ((input.address as string) ?? (input.btc_address as string) ?? "").trim();
  if (!raw) {
    throw new Error(
      "'address' is required. Provide a Bitcoin address (e.g. 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa, bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq, or bc1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5sspknck9)."
    );
  }

  // Bech32 addresses are case-uniform (all-lower or all-upper). Mixed-case is invalid per BIP173.
  const looksBech32 = /^(bc|tb|bcrt|BC|TB|BCRT)1/.test(raw);
  const mixedCaseBech32 = looksBech32 && raw !== raw.toLowerCase() && raw !== raw.toUpperCase();

  const result = looksBech32
    ? mixedCaseBech32
      ? { format_valid: true, checksum_valid: false, address_type: null, network: null }
      : tryBech32(raw)
    : tryBase58(raw);

  const valid = result.format_valid && result.checksum_valid && result.address_type !== null;

  // Bech32 canonical form is lowercase (BIP173). Base58Check is case-sensitive — return as-is.
  const normalized = valid ? (looksBech32 ? raw.toLowerCase() : raw) : null;

  return {
    output: {
      input: raw,
      valid,
      format_valid: result.format_valid,
      checksum_valid: result.checksum_valid,
      address_type: result.address_type,
      network: result.network,
      normalized,
    },
    provenance: {
      source: "Algorithmic (Base58Check + BIP173/BIP350 bech32/bech32m)",
      fetched_at: new Date().toISOString(),
    },
  };
});
