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
  | "legacy_token_sunset";

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
