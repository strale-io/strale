import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * UK Confirmation of Payee (CoP) check via eSortcode.
 *
 * Pay.UK CoP scheme verifies that a sort code + account number pair
 * matches an account-holder name registered at the responding PSP.
 *
 * Vendor: eSortcode (esortcode.com / wsp.esortcode.com) — Tier-2 vendor-
 * mediated public scheme participant. £0.15/check PAYG, no minimums, no
 * setup fee. Selection per DEC-20260430-A. UK-only; for EU SEPA see the
 * SEPA VoP vendor (Active Vendor Stack page).
 *
 * Activation: requires ESORTCODE_API_KEY in env. Sign up at
 * esortcode.com → CoP master key from the dashboard.
 *
 * API shape (per esortcode.com REST docs Jan 2026):
 *   GET https://wsp.esortcode.com/uk/v1/cop
 *     ?key=<API_KEY>
 *     &sortcode=<6 digits, no hyphens>
 *     &accountNumber=<8 digits>
 *     &name=<URL-encoded payee name>
 *     &accountType=PERSONAL|BUSINESS
 *     [&secondaryAccountId=<optional, e.g. building society roll number>]
 *     [&testOutcome=<one of the 14 codes — burns no credits>]
 *
 * Response: { cop: { code, name, description, advice }, modulusCheck, branches[] }
 *
 * The 14 cop.code values are normalized to a 5-state Strale enum:
 *   match | close_match | no_match | no_account | cannot_be_checked
 * See COP_CODE_TO_STATUS below for the mapping rationale.
 */

const ESORTCODE_API = "https://wsp.esortcode.com/uk/v1";
const SORT_CODE_RE = /^\d{6}$/;
const ACCOUNT_NUMBER_RE = /^\d{8}$/;

type AccountType = "PERSONAL" | "BUSINESS";
type StraleStatus = "match" | "close_match" | "no_match" | "no_account" | "cannot_be_checked";

// eSortcode CoP code → Strale canonical match_status. The mapping
// follows the documented "Action" guidance: PROCEED → match,
// CONFIRM/CORRECT → close_match, DO_NOT_PROCEED → no_match,
// ACCOUNT_DOES_NOT_EXIST → no_account, anything where the bank can't
// answer (NO_RESPONSE / NOT_ENROLLED / etc.) → cannot_be_checked.
const COP_CODE_TO_STATUS: Record<string, StraleStatus> = {
  MATCHED: "match",
  NOT_MATCHED: "no_match",
  CLOSE_MATCH: "close_match",
  BUSINESS_ACCOUNT_NAME_MATCHED: "match",
  PERSONAL_ACCOUNT_NAME_MATCHED: "match",
  BUSINESS_ACCOUNT_CLOSE_MATCH: "close_match",
  PERSONAL_ACCOUNT_CLOSE_MATCH: "close_match",
  ACCOUNT_DOES_NOT_EXIST: "no_account",
  ACCOUNT_NOT_SUPPORTED: "cannot_be_checked",
  ACCOUNT_SWITCHED: "cannot_be_checked",
  WRONG_PARTICIPANT: "cannot_be_checked",
  NO_RESPONSE: "cannot_be_checked",
  NOT_ENROLLED: "cannot_be_checked",
  SECONDARY_ACCOUNT_ID_NOT_FOUND: "cannot_be_checked",
};

function normalizeSortCode(input: string): string {
  return input.replace(/[\s-]/g, "");
}

function normalizeAccountType(input: string): AccountType {
  const upper = input.trim().toUpperCase();
  if (upper === "PERSONAL" || upper === "BUSINESS") return upper;
  if (upper === "INDIVIDUAL" || upper === "CONSUMER") return "PERSONAL";
  if (upper === "COMPANY" || upper === "CORPORATE") return "BUSINESS";
  return "BUSINESS";
}

registerCapability("uk-cop-check", async (input: CapabilityInput) => {
  const apiKey = process.env.ESORTCODE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ESORTCODE_API_KEY is required for UK CoP checks. Sign up at https://esortcode.com and copy the CoP master key.",
    );
  }

  const sortCodeRaw = ((input.sort_code as string) ?? (input.sortcode as string) ?? "").trim();
  const accountNumberRaw = ((input.account_number as string) ?? (input.accountNumber as string) ?? "").trim();
  const accountHolderName = ((input.account_holder_name as string) ?? (input.name as string) ?? (input.payee_name as string) ?? "").trim();
  const accountTypeRaw = ((input.account_type as string) ?? (input.accountType as string) ?? "BUSINESS").trim();
  const secondaryAccountId = ((input.secondary_account_id as string) ?? "").trim();
  const testOutcome = ((input.test_outcome as string) ?? "").trim();

  if (!sortCodeRaw || !accountNumberRaw || !accountHolderName) {
    throw new Error("'sort_code', 'account_number', and 'account_holder_name' are all required.");
  }

  const sortCode = normalizeSortCode(sortCodeRaw);
  if (!SORT_CODE_RE.test(sortCode)) {
    throw new Error(`Invalid sort_code: "${sortCodeRaw}". UK sort codes are exactly 6 digits.`);
  }
  if (!ACCOUNT_NUMBER_RE.test(accountNumberRaw)) {
    throw new Error(`Invalid account_number: "${accountNumberRaw}". UK account numbers are exactly 8 digits.`);
  }

  const accountType = normalizeAccountType(accountTypeRaw);

  const params = new URLSearchParams({
    key: apiKey,
    sortcode: sortCode,
    accountNumber: accountNumberRaw,
    name: accountHolderName,
    accountType,
  });
  if (secondaryAccountId) params.set("secondaryAccountId", secondaryAccountId);
  if (testOutcome) params.set("testOutcome", testOutcome);

  const res = await fetch(`${ESORTCODE_API}/cop?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });

  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    const msg = body.message ?? "";
    if (/InvalidApiKey/i.test(msg)) {
      throw new Error("eSortcode rejected the API key. Verify ESORTCODE_API_KEY is the CoP master key (not Credits).");
    }
    if (/ZeroCredits/i.test(msg)) {
      throw new Error("eSortcode account has zero CoP credits. Top up at esortcode.com.");
    }
    if (/UnauthorisedDomain/i.test(msg)) {
      throw new Error("eSortcode rejected the request domain. Whitelist the Strale runtime IPs in the eSortcode portal.");
    }
    if (/license.*not support/i.test(msg)) {
      throw new Error("eSortcode key does not have a CoP licence. Use the CoP master key from the dashboard, not the Credits master key.");
    }
    throw new Error(`eSortcode 403: ${msg}`);
  }
  if (res.status === 400) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      output: {
        match_status: "no_match" as StraleStatus,
        cop_code: null,
        cop_description: body.message ?? "Bad request",
        cop_advice: null,
        account_holder_name_provided: accountHolderName,
        returned_name: null,
        modulus_check_valid: null,
        bank_name: null,
        bic: null,
        sort_code: sortCode,
        account_number_last4: accountNumberRaw.slice(-4),
        account_type: accountType,
        secondary_account_id: secondaryAccountId || null,
        test_outcome_used: testOutcome || null,
        checked_at: new Date().toISOString(),
        data_source: "Pay.UK Confirmation of Payee scheme via eSortcode",
      },
      provenance: {
        source: "wsp.esortcode.com",
        fetched_at: new Date().toISOString(),
        acquisition_method: "vendor_mediated_scheme" as const,
      },
    };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`eSortcode returned HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    cop?: { code?: string; name?: string; description?: string; advice?: string };
    modulusCheck?: { sortcode?: string; accountNumber?: string; valid?: boolean };
    branches?: Array<{ bankName?: string; branchTitle?: string; postcode?: string }>;
  };

  const copCode = (data.cop?.code ?? "").toUpperCase();
  const matchStatus = COP_CODE_TO_STATUS[copCode] ?? "cannot_be_checked";
  const branch = data.branches?.[0];

  return {
    output: {
      match_status: matchStatus,
      cop_code: copCode || null,
      cop_description: data.cop?.description ?? null,
      cop_advice: data.cop?.advice ?? null,
      account_holder_name_provided: accountHolderName,
      returned_name: data.cop?.name && data.cop.name.length > 0 ? data.cop.name : null,
      modulus_check_valid: data.modulusCheck?.valid ?? null,
      bank_name: branch?.bankName ?? null,
      bic: null,
      sort_code: sortCode,
      account_number_last4: accountNumberRaw.slice(-4),
      account_type: accountType,
      secondary_account_id: secondaryAccountId || null,
      test_outcome_used: testOutcome || null,
      checked_at: new Date().toISOString(),
      data_source: "Pay.UK Confirmation of Payee scheme via eSortcode",
    },
    provenance: {
      source: "wsp.esortcode.com",
      source_url: `${ESORTCODE_API}/cop`,
      fetched_at: new Date().toISOString(),
      acquisition_method: "vendor_mediated_scheme" as const,
      attribution: "Confirmation of Payee scheme participant: eSortcode (Pay.UK)",
    },
  };
});
