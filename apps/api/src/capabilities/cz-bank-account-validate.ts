import { registerCapability, type CapabilityInput } from "./index.js";
import { parseCzBankAccount } from "../lib/cz-validation.js";

registerCapability("cz-bank-account-validate", async (input: CapabilityInput) => {
  const raw = (input.account as string) ?? (input.bank_account as string) ?? "";
  if (!raw || !raw.trim()) {
    throw new Error("'account' is required. Provide a Czech bank account in format '[prefix-]account/bank_code'.");
  }

  const parsed = parseCzBankAccount(raw);
  if (!parsed) {
    return {
      output: {
        input: raw,
        is_valid: false,
        reason: "Format invalid — expected '[prefix-]account/bank_code' (e.g. '19-2000145399/0800' or '123456/0100').",
      },
      provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
    };
  }

  return {
    output: {
      input: raw,
      is_valid: parsed.is_valid,
      prefix: parsed.prefix || null,
      account: parsed.account,
      bank_code: parsed.bank_code,
      prefix_checksum_ok: parsed.prefix_checksum_ok,
      account_checksum_ok: parsed.account_checksum_ok,
      checksum_algorithm: "mod-11 weighted (prefix [10,5,8,4,2,1], account [6,3,7,9,10,5,8,4,2,1])",
      reason: parsed.is_valid
        ? "Account passes domestic BBAN mod-11 checksum."
        : parsed.prefix_checksum_ok
          ? "Account body fails mod-11 checksum."
          : "Account prefix fails mod-11 checksum.",
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
