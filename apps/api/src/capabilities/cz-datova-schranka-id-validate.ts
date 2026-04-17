import { registerCapability, type CapabilityInput } from "./index.js";
import { isValidDataBoxId } from "../lib/cz-validation.js";

registerCapability("cz-datova-schranka-id-validate", async (input: CapabilityInput) => {
  const raw = (input.data_box_id as string) ?? (input.dsid as string) ?? (input.id as string) ?? "";
  if (!raw || !raw.trim()) {
    throw new Error("'data_box_id' is required. Provide a 7-character Czech data box ID.");
  }

  const normalized = raw.trim().toUpperCase();
  const valid = isValidDataBoxId(normalized);
  return {
    output: {
      input: raw,
      normalized,
      is_valid: valid,
      reason: valid
        ? "Data box ID matches the 7-character format (letters A-Z excluding I/O, digits 2-9)."
        : "Data box ID must be exactly 7 characters: uppercase A-Z (excluding I and O) or digits 2-9.",
      format_spec: "7 chars, [A-HJ-NP-Z2-9]",
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
