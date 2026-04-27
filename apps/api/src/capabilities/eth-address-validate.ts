import { registerCapability, type CapabilityInput } from "./index.js";
import { isAddress, getAddress } from "viem";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

registerCapability("eth-address-validate", async (input: CapabilityInput) => {
  const raw = ((input.address as string) ?? (input.eth_address as string) ?? "").trim();
  if (!raw) {
    throw new Error(
      "'address' is required. Provide an Ethereum address (e.g. 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045)."
    );
  }

  const format_valid = isAddress(raw, { strict: false });

  const hex = raw.startsWith("0x") || raw.startsWith("0X") ? raw.slice(2) : raw;
  const has_lower = /[a-f]/.test(hex);
  const has_upper = /[A-F]/.test(hex);
  const checksum_present = format_valid && has_lower && has_upper;

  // EIP-55: with strict:true, viem accepts all-lower, all-upper, or mixed-case
  // with valid checksum. Mixed-case with bad checksum returns false.
  const strict_pass = format_valid && isAddress(raw, { strict: true });
  const checksum_valid = checksum_present ? strict_pass : null;

  let normalized: string | null = null;
  if (format_valid) {
    try {
      normalized = getAddress(raw);
    } catch {
      normalized = null;
    }
  }

  const valid = format_valid && (checksum_present ? checksum_valid === true : true);
  const is_zero_address = normalized?.toLowerCase() === ZERO_ADDRESS;

  return {
    output: {
      input: raw,
      valid,
      format_valid,
      checksum_present,
      checksum_valid,
      is_zero_address,
      normalized,
    },
    provenance: { source: "viem (EIP-55)", fetched_at: new Date().toISOString() },
  };
});
