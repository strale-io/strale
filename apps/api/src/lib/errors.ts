import { classifyTransactionFailure } from "./transaction-failure-taxonomy.js";
import { refusalDetails } from "./capability-refusal.js";

// Stable error codes per DEC-19
export type ErrorCode =
  | "insufficient_balance"
  | "no_matching_capability"
  | "capability_unavailable"
  | "execution_failed"
  | "timeout_exceeded"
  | "invalid_input"
  | "invalid_request"
  | "rate_limited"
  | "spend_cap_exceeded"
  | "key_hourly_cap_exceeded"
  | "key_total_cap_exceeded"
  | "primary_key_required"
  | "active_key_limit_exceeded"
  | "unauthorized"
  | "not_found"
  | "capability_degraded"
  | "below_quality_threshold"
  | "freshness_check_failed"
  | "latency_threshold_exceeded"
  | "budget_exceeded"
  | "locked"
  | "token_expired"
  | "legacy_token_sunset"
  // F-B-022: solution executed successfully but the phase-2 transaction
  // UPDATE failed. Wallet has been refunded. Distinct from execution_failed
  // so callers can retry the same inputs safely (execution happened; only
  // the record did not).
  | "transaction_finalization_failed"
  // WP6: an Idempotency-Key was reused for DIFFERENT work. Distinct from
  // invalid_request because the request itself is well-formed — the fault is
  // in the key's reuse, and the caller can fix it by issuing a new one.
  | "idempotency_key_reused"
  | "request_in_progress"
  // x402 on /v1/do: the payment was verified but settlement was declined,
  // could not be confirmed, or the payment was already spent on this work.
  | "payment_failed"
  // x402: a verified payment is bound to the capability or solution it was
  // first presented to; presenting it for different work is refused.
  | "payment_already_used"
  // Internal admin surface only — POST /v1/internal/tests/admin/
  // apply-migrations returns this when runStartupMigrations() throws
  // (e.g. block 0062 post-condition violation). Not exposed on the
  // public DEC-19 contract; the admin endpoint is admin-only.
  | "migration_failed";

export interface ApiError {
  error_code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export function apiError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ApiError {
  return { error_code: code, message, details: recoveryDetails(code, message, details) };
}

/** Add recovery advice without changing any existing response field. */
export function recoveryDetails(
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
): Record<string, unknown> {
  let advice: Record<string, unknown>;
  switch (code) {
    case "insufficient_balance":
      advice = { fix: "Top up the wallet at https://strale.dev/dashboard or pay per call over x402 using a URL from /x402/catalog.", docs_url: "https://strale.dev/docs" }; break;
    case "token_expired":
    case "legacy_token_sunset":
      advice = { fix: "Ask the account owner to reissue the audit URL with POST /v1/transactions/:id/audit-token using the primary key, then use its token and expires_at query parameters.", retryable: false }; break;
    case "unauthorized":
      if (typeof details.next_step === "string" && typeof details.retryable === "boolean") { advice = {}; break; }
      if (/audit token|[?]token=/i.test(message)) {
        advice = { fix: "Use the signed audit URL's 'token' and 'expires_at' query parameters, or ask the account owner to reissue it with POST /v1/transactions/:id/audit-token." }; break;
      }
      advice = { fix: "Send a valid API key in the Authorization: Bearer <api_key> header; recover a lost key with POST /v1/auth/recover." }; break;
    case "primary_key_required":
      advice = { fix: "Send the account's primary API key in the Authorization: Bearer <api_key> header." }; break;
    case "active_key_limit_exceeded":
      advice = { fix: "Revoke an unused key with DELETE /v1/api-keys/:id before creating another key (maximum 25 active additional keys).", limit: 25 }; break;
    case "key_hourly_cap_exceeded":
    case "key_total_cap_exceeded":
      advice = { fix: `Ask the account owner to raise '${code === "key_hourly_cap_exceeded" ? "max_spend_per_hour_cents" : "max_spend_total_cents"}' with PATCH /v1/api-keys/:id using the primary key, or use another key.`, retryable: false }; break;
    case "spend_cap_exceeded":
      advice = { fix: "Wait until the rolling hourly spend is below 'limit_cents', or contact support to change the account limit.", retryable: false }; break;
    case "rate_limited": {
      const seconds = details.retry_after_seconds;
      advice = typeof seconds === "number"
        ? { fix: `Retry after ${new Date(Date.now() + seconds * 1000).toISOString()}.`, retryable: true }
        : { fix: "Retry after the time in the Retry-After response header; if none is supplied, retry with exponential backoff.", retryable: true };
      break;
    }
    case "request_in_progress":
      advice = { retryable: true, retry_after_seconds: 2, fix: "The original request is still running; retry with the same Idempotency-Key after 2 seconds." }; break;
    case "payment_failed":
      advice = { retryable: false, fix: "Check the payment status in your wallet before signing a fresh x402 payment authorization; do not resend this payment." }; break;
    case "payment_already_used":
      advice = { retryable: false, fix: "Sign a fresh x402 payment authorization for this capability; a payment is valid only for the capability or solution it was first presented to." }; break;
    case "idempotency_key_reused":
      advice = { fix: "Send a new Idempotency-Key for different inputs or a different capability." }; break;
    case "budget_exceeded":
      advice = { fix: `Raise 'max_price_cents' to at least ${details.actual_price_cents ?? details.price_cents ?? details.required_cents ?? "the price returned by the catalogue"}, or choose a cheaper tool from GET /v1/capabilities.` }; break;
    case "no_matching_capability":
      advice = { fix: "Choose a 'capability_slug' from GET /v1/capabilities and set 'max_price_cents' to at least its 'price_cents', or describe the task more specifically." }; break;
    case "not_found":
      advice = { fix: /[Kk]ey/.test(message) ? "List GET /v1/api-keys and use an 'id' belonging to this account."
        : /[Ss]olution/.test(message) ? "Choose a solution 'slug' from GET /v1/solutions."
        : /[Cc]apability/.test(message) ? "Choose a 'capability_slug' from GET /v1/capabilities."
        : "Check the requested identifier against the account's records and send an existing identifier." }; break;
    case "latency_threshold_exceeded":
      advice = { fix: `Raise 'max_latency_ms' to at least ${details.p95_ms ?? "the reported p95 latency"}, or omit 'max_latency_ms'.` }; break;
    case "freshness_check_failed":
      advice = { fix: "Omit 'require_fresh' or set it to false to accept the available reference data, or choose another tool.", retryable: false }; break;
    case "capability_unavailable":
    case "capability_degraded":
      advice = { retryable: true, next_step: details.next_retry_at ? `Retry after ${details.next_retry_at}.` : "Retry with exponential backoff or choose another tool from GET /v1/capabilities." }; break;
    case "execution_failed":
      advice = refusalDetails(details.error) ?? (classifyTransactionFailure(typeof details.error === "string" ? details.error : message) === "caller_input"
        ? { retryable: false, fix: "Correct the input per the tool's input_schema at GET /v1/capabilities/:slug and resend." }
        : { retryable: true, next_step: "Retry with exponential backoff; contact support with the transaction_id if the failure continues." }); break;
    case "timeout_exceeded":
    case "transaction_finalization_failed":
      advice = { retryable: true, next_step: "Retry with exponential backoff; contact support with the transaction_id if the failure continues." }; break;
    case "invalid_input":
    case "invalid_request": {
      const fields = details.missing_fields ?? details.required_fields;
      advice = { fix: Array.isArray(fields) && fields.length
        ? `Send 'inputs' with the required fields: ${fields.join(", ")}.`
        : "Correct the request fields according to the validation message and resend the request.",
        ...(Array.isArray(fields) ? { required_fields: fields } : {}) };
      break;
    }
    case "locked":
    case "below_quality_threshold":
    case "migration_failed":
      advice = { retryable: false, next_step: "Contact support with the error_code and transaction_id before retrying." }; break;
    default: {
      code satisfies never;
      advice = { retryable: false, next_step: "Contact support with the error_code and transaction_id before retrying." };
    }
  }
  return { ...advice, ...details };
}
