// Pure logic behind /topup and /signup, carried over from strale-frontend's TopUp.tsx and
// Signup.tsx so the browser scripts stay thin and the rules are tested (test/functional-pages.test.ts).
// No DOM and no Node imports: this module runs in the browser.

export interface WalletBalance {
  balance_cents: number;
  currency: string;
}

export type WalletTransactionType = "top_up" | "purchase" | "trial_credit" | "refund";

export interface WalletTransaction {
  id: string;
  amount_cents: number;
  type: WalletTransactionType;
  description: string;
  created_at: string;
}

export interface ApiErrorBody {
  error_code?: string;
  message?: string;
  details?: unknown;
}

/** Suggested top-up amounts, in EUR cents (the old page's SUGGESTED_CENTS). €25 is selected first. */
export const SUGGESTED_CENTS = [1000, 2500, 5000, 10000];
export const DEFAULT_SUGGESTED_CENTS = 2500;

/** `€12.50`, sign dropped: callers add + or − themselves, as the old page did. */
export function centsToEur(cents: number): string {
  return `€${(Math.abs(cents) / 100).toFixed(2)}`;
}

/** The API's own message first, then its error code, then the caller's fallback. */
export function friendlyError(body: ApiErrorBody | null, fallback: string): string {
  if (!body) return fallback;
  if (body.message) return body.message;
  if (body.error_code) return `Error: ${body.error_code}`;
  return fallback;
}

export const TRANSACTION_LABEL: Record<WalletTransactionType, string> = {
  top_up: "Top-up",
  purchase: "Purchase",
  trial_credit: "Trial credit",
  refund: "Refund",
};

export function isCredit(type: WalletTransactionType): boolean {
  return type === "top_up" || type === "trial_credit" || type === "refund";
}

// Validate the raw string before rounding: Math.round(euros * 100) always yields an integer,
// so an integer check after rounding could never fire and "10.009" would become €10.01.
const CUSTOM_AMOUNT_RE = /^\d+([.,]\d{1,2})?$/;

/** A custom amount in EUR, typed by the visitor, as integer cents; null when it is not a valid amount. */
export function parseCustomEuros(raw: string): number | null {
  const s = raw.trim();
  if (!CUSTOM_AMOUNT_RE.test(s)) return null;
  const euros = parseFloat(s.replace(",", "."));
  if (!Number.isFinite(euros)) return null;
  return Math.round(euros * 100);
}

/** The error to show for an amount, or "" when it may go to checkout. Bounds are the API's (wallet.ts). */
export function validateAmount(cents: number | null, opts: { custom: boolean; raw: string; min: number; max: number }): string {
  if (cents === null) {
    return opts.raw.trim() && opts.custom ? "Enter an amount like 25 or 25.50 (max 2 decimal places)." : "Enter an amount.";
  }
  if (cents < opts.min) return `Minimum top-up is ${centsToEur(opts.min)}.`;
  if (cents > opts.max) return `Maximum top-up is ${centsToEur(opts.max)}.`;
  return "";
}

/**
 * Latest-request-wins, one counter per kind of request (balance, transactions, key check),
 * exactly as the old page's balanceReqGen / transactionsReqGen / applyReqGen refs.
 * A response may touch the page (its data, its error AND its loading flag) only while it is
 * still the newest request of its kind; a data request must also still be for the active key.
 */
export class RequestGate {
  private gen = 0;
  begin(): number {
    return ++this.gen;
  }
  isLatest(ticket: number): boolean {
    return this.gen === ticket;
  }
}

/** Holds the key whose data the page shows, so a slow answer for key A never lands on key B. */
export class ActiveKey {
  value = "";
}

/** A guard for one data request: newest of its kind, and still for the key now active. */
export function currentGuard(gate: RequestGate, active: ActiveKey, key: string): { ticket: number; isCurrent: () => boolean } {
  const ticket = gate.begin();
  return { ticket, isCurrent: () => gate.isLatest(ticket) && active.value === key };
}

/** POST /v1/auth/register body: email always, name only when given (Signup.tsx). */
export function registerBody(email: string, name: string): { email: string; name?: string } {
  return { email, ...(name ? { name } : {}) };
}

/** What the signup form says for a failed registration, by status (Signup.tsx). */
export function registerErrorMessage(status: number, support: string): string {
  if (status === 409) return "An account with this email already exists.";
  if (status === 400) return "Please enter a valid email address.";
  if (status === 429) return "Too many attempts. Please wait a moment.";
  return `Something went wrong. Please try again or contact support at ${support}.`;
}

export interface RegisterResponse {
  api_key?: string;
  wallet_balance_cents?: number;
  /** Older response shape; the API sends wallet_balance_cents now. */
  balance?: string;
  trial_credits?: { granted: boolean; reason?: string; message?: string };
}

/**
 * The opening balance to show after signup, from the response itself. The old page showed
 * `data.balance || "2.00"`, but the API has sent wallet_balance_cents instead of balance since
 * WP11, so it showed €2.00 even when the trial credit was withheld. Null when the response
 * states no balance: then the page states none.
 */
export function openingBalance(r: RegisterResponse): string | null {
  if (typeof r.wallet_balance_cents === "number") return centsToEur(r.wallet_balance_cents);
  if (typeof r.balance === "string" && r.balance) return `€${r.balance}`;
  return null;
}
