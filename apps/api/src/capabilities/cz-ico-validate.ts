import { registerCapability, type CapabilityInput } from "./index.js";
import { normalizeIco, isValidIcoChecksum } from "../lib/cz-validation.js";

registerCapability("cz-ico-validate", async (input: CapabilityInput) => {
  const raw = (input.ico as string) ?? (input.company_number as string) ?? "";
  if (!raw || !raw.trim()) {
    throw new Error("'ico' is required. Provide a Czech IČO (1-8 digits, will be left-padded).");
  }

  const normalized = normalizeIco(raw);
  if (!normalized) {
    return {
      output: {
        input: raw,
        normalized: null,
        is_valid: false,
        reason: "Format invalid — IČO must be 1-8 digits (optionally with spaces, hyphens, or dots).",
      },
      provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
    };
  }

  const valid = isValidIcoChecksum(normalized);
  return {
    output: {
      input: raw,
      normalized,
      is_valid: valid,
      checksum_algorithm: "mod-11 with weights [8,7,6,5,4,3,2] on first 7 digits",
      reason: valid ? "IČO passes mod-11 checksum." : "IČO fails mod-11 checksum.",
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
