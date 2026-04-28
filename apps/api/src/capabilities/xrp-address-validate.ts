import { registerCapability, type CapabilityInput } from "./index.js";
import {
  isValidClassicAddress,
  isValidXAddress,
  classicAddressToXAddress,
  xAddressToClassicAddress,
} from "ripple-address-codec";

registerCapability("xrp-address-validate", async (input: CapabilityInput) => {
  const raw = ((input.address as string) ?? (input.xrp_address as string) ?? "").trim();
  if (!raw) {
    throw new Error(
      "'address' is required. Provide an XRP Ledger address (e.g. rPdvC6ccq8hCdPKSPJkPmyZ4Mi1oG2FFkT or X7AcgcsBL6XDcUb289X4mJ8djcdyKaB5hJDWMArnXr61cqZ)."
    );
  }

  const looksXAddress = /^[XT][1-9A-HJ-NP-Za-km-z]+$/.test(raw);
  const classic_valid = isValidClassicAddress(raw);
  const x_valid = looksXAddress && isValidXAddress(raw);
  const valid = classic_valid || x_valid;

  let address_format: "classic" | "x-address" | null = null;
  if (classic_valid) address_format = "classic";
  else if (x_valid) address_format = "x-address";

  // X-addresses encode network (mainnet/testnet) explicitly; classic addresses do not.
  let network: "mainnet" | "testnet" | null = null;
  let tag: number | null = null;
  let classic_form: string | null = null;
  if (x_valid) {
    const parsed = xAddressToClassicAddress(raw);
    network = parsed.test ? "testnet" : "mainnet";
    tag = typeof parsed.tag === "number" ? parsed.tag : null;
    classic_form = parsed.classicAddress;
  } else if (classic_valid) {
    classic_form = raw;
  }

  // Convenience: provide the mainnet x-address form for classic addresses (no tag).
  let x_address_form: string | null = null;
  if (classic_valid) {
    try {
      x_address_form = classicAddressToXAddress(raw, false, false);
    } catch {
      x_address_form = null;
    }
  } else if (x_valid && classic_form) {
    x_address_form = raw;
  }

  return {
    output: {
      input: raw,
      valid,
      address_format,
      network,
      tag,
      classic_form,
      x_address_form,
      normalized: classic_form,
    },
    provenance: {
      source: "ripple-address-codec (XRPL base58 + classic/X-address spec)",
      fetched_at: new Date().toISOString(),
    },
  };
});
