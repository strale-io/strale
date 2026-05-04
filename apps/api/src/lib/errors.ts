// Stable error codes per DEC-19
export type ErrorCode =
  | "insufficient_balance"
  | "no_matching_capability"
  | "capability_unavailable"
  | "execution_failed"
  | "timeout_exceeded"
  | "invalid_request"
  | "rate_limited"
  | "spend_cap_exceeded"
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
  return { error_code: code, message, ...(details ? { details } : {}) };
}
