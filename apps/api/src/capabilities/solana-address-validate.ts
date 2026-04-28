import { registerCapability, type CapabilityInput } from "./index.js";
import bs58 from "bs58";

// Solana base58 alphabet (Bitcoin-compatible).
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;

registerCapability("solana-address-validate", async (input: CapabilityInput) => {
  const raw = ((input.address as string) ?? (input.sol_address as string) ?? "").trim();
  if (!raw) {
    throw new Error(
      "'address' is required. Provide a Solana address (e.g. 11111111111111111111111111111111 or 7xLk17EQQ5KLDLDe44wCmupJKJjTGd8hs3eSVVhCx932)."
    );
  }

  const format_valid = BASE58_RE.test(raw) && raw.length >= 32 && raw.length <= 44;

  let decoded: Uint8Array | null = null;
  if (format_valid) {
    try {
      decoded = bs58.decode(raw);
    } catch {
      decoded = null;
    }
  }

  // Solana addresses are 32-byte ed25519 public keys (or PDAs of the same length).
  // There is no checksum — validity is purely "decodes to exactly 32 bytes".
  const length_valid = decoded !== null && decoded.length === 32;
  const valid = format_valid && length_valid;

  // The system program / "default" address — distinct from the zero address concept on EVM
  // but worth flagging because it's a sentinel that occasionally appears as a placeholder.
  const is_system_program = valid && raw === "11111111111111111111111111111111";

  return {
    output: {
      input: raw,
      valid,
      format_valid,
      length_valid,
      is_system_program,
      normalized: valid ? raw : null,
    },
    provenance: {
      source: "Algorithmic (base58 decode + 32-byte ed25519 length check)",
      fetched_at: new Date().toISOString(),
    },
  };
});
