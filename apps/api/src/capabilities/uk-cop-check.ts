import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * UK Confirmation of Payee (CoP) check via eSortcode.
 *
 * Pay.UK CoP scheme verifies that a sort code + account number pair
 * matches an account-holder name registered at the responding PSP.
 * Returns one of: match / close_match / no_match / no_account / cannot_be_checked.
 *
 * Vendor: eSortcode (esortcode.com) — Tier-2 vendor-mediated public
 * scheme participant. £0.15/check PAYG, no minimums, no setup fee.
 * Selection per DEC-20260430-A. UK-only; for EU SEPA see the SEPA VoP
 * vendor (see Active Vendor Stack page).
 *
 * Activation: requires ESORTCODE_API_KEY in env. Sign up at
 * esortcode.com/confirmation-of-payee and add the API key to Railway env
 * config. Without the key the executor throws a structured error.
 */

const ESORTCODE_API = "https://api.esortcode.com/v1";
const SORT_CODE_RE = /^\d{6}$/;
const ACCOUNT_NUMBER_RE = /^\d{8}$/;

type AccountType = "personal" | "business";

function normalizeSortCode(input: string): string {
  return input.replace(/[\s-]/g, "");
}

registerCapability("uk-cop-check", async (input: CapabilityInput) => {
  const apiKey = process.env.ESORTCODE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ESORTCODE_API_KEY is required for UK CoP checks. Sign up at https://esortcode.com/confirmation-of-payee and configure the API key.",
    );
  }

  const sortCodeRaw = ((input.sort_code as string) ?? "").trim();
  const accountNumberRaw = ((input.account_number as string) ?? "").trim();
  const accountHolderName = ((input.account_holder_name as string) ?? "").trim();
  const accountType = (((input.account_type as string) ?? "business").trim().toLowerCase()) as AccountType;

  if (!sortCodeRaw || !accountNumberRaw || !accountHolderName) {
    throw new Error(
      "'sort_code', 'account_number', and 'account_holder_name' are all required.",
    );
  }
  const sortCode = normalizeSortCode(sortCodeRaw);
  if (!SORT_CODE_RE.test(sortCode)) {
    throw new Error(`Invalid sort_code: "${sortCodeRaw}". UK sort codes are exactly 6 digits.`);
  }
  if (!ACCOUNT_NUMBER_RE.test(accountNumberRaw)) {
    throw new Error(`Invalid account_number: "${accountNumberRaw}". UK account numbers are exactly 8 digits.`);
  }
  if (accountType !== "personal" && accountType !== "business") {
    throw new Error(`Invalid account_type: "${accountType}". Must be "personal" or "business".`);
  }

  const res = await fetch(`${ESORTCODE_API}/cop/check`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sort_code: sortCode,
      account_number: accountNumberRaw,
      account_holder_name: accountHolderName,
      account_type: accountType,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(`eSortcode rejected the API key (HTTP ${res.status}). Verify ESORTCODE_API_KEY.`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`eSortcode returned HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    match_status?: string;
    close_match_name?: string;
    bank_name?: string;
    bic?: string;
    reason_code?: string;
    reason?: string;
    reference_id?: string;
    timestamp?: string;
  };

  // Normalize the match status to a canonical enum
  const rawStatus = (data.match_status ?? "").toLowerCase();
  const matchStatus = rawStatus === "match" ? "match"
    : rawStatus === "close_match" || rawStatus === "close-match" || rawStatus === "partial" ? "close_match"
    : rawStatus === "no_match" || rawStatus === "no-match" || rawStatus === "mismatch" ? "no_match"
    : rawStatus === "no_account" || rawStatus === "no-account" || rawStatus === "not_found" ? "no_account"
    : "cannot_be_checked";

  return {
    output: {
      match_status: matchStatus,
      account_holder_name_provided: accountHolderName,
      close_match_name: data.close_match_name ?? null,
      bank_name: data.bank_name ?? null,
      bic: data.bic ?? null,
      reason_code: data.reason_code ?? null,
      reason: data.reason ?? null,
      sort_code: sortCode,
      account_number_last4: accountNumberRaw.slice(-4),
      account_type: accountType,
      reference_id: data.reference_id ?? null,
      checked_at: data.timestamp ?? new Date().toISOString(),
      data_source: "Pay.UK Confirmation of Payee scheme via eSortcode",
    },
    provenance: {
      source: "esortcode.com",
      fetched_at: new Date().toISOString(),
      acquisition_method: "vendor_mediated_scheme" as const,
      license: "Per eSortcode reseller terms",
    },
  };
});
