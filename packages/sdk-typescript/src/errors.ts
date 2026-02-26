import type { ErrorCode, ApiErrorResponse } from "./types.js";

/**
 * Base error class for all Strale API errors.
 * Contains the error_code, message, and optional details from the API response.
 */
export class StraleError extends Error {
  readonly errorCode: ErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    errorCode: ErrorCode,
    message: string,
    statusCode: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "StraleError";
    this.errorCode = errorCode;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class InsufficientBalanceError extends StraleError {
  readonly walletBalanceCents: number;
  readonly requiredCents: number;

  constructor(message: string, details?: Record<string, unknown>) {
    super("insufficient_balance", message, 402, details);
    this.name = "InsufficientBalanceError";
    this.walletBalanceCents = (details?.wallet_balance_cents as number) ?? 0;
    this.requiredCents = (details?.required_cents as number) ?? 0;
  }
}

export class NoMatchingCapabilityError extends StraleError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("no_matching_capability", message, 404, details);
    this.name = "NoMatchingCapabilityError";
  }
}

export class CapabilityUnavailableError extends StraleError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("capability_unavailable", message, 503, details);
    this.name = "CapabilityUnavailableError";
  }
}

export class ExecutionFailedError extends StraleError {
  readonly transactionId: string | undefined;

  constructor(message: string, details?: Record<string, unknown>) {
    super("execution_failed", message, 500, details);
    this.name = "ExecutionFailedError";
    this.transactionId = details?.transaction_id as string | undefined;
  }
}

export class TimeoutExceededError extends StraleError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("timeout_exceeded", message, 408, details);
    this.name = "TimeoutExceededError";
  }
}

export class InvalidRequestError extends StraleError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("invalid_request", message, 400, details);
    this.name = "InvalidRequestError";
  }
}

export class RateLimitedError extends StraleError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("rate_limited", message, 429, details);
    this.name = "RateLimitedError";
  }
}

export class UnauthorizedError extends StraleError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("unauthorized", message, 401, details);
    this.name = "UnauthorizedError";
  }
}

export class NotFoundError extends StraleError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("not_found", message, 404, details);
    this.name = "NotFoundError";
  }
}

/** Map error_code to the appropriate typed error class */
export function createError(
  response: ApiErrorResponse,
  statusCode: number,
): StraleError {
  const { error_code, message, details } = response;

  switch (error_code) {
    case "insufficient_balance":
      return new InsufficientBalanceError(message, details);
    case "no_matching_capability":
      return new NoMatchingCapabilityError(message, details);
    case "capability_unavailable":
      return new CapabilityUnavailableError(message, details);
    case "execution_failed":
      return new ExecutionFailedError(message, details);
    case "timeout_exceeded":
      return new TimeoutExceededError(message, details);
    case "invalid_request":
      return new InvalidRequestError(message, details);
    case "rate_limited":
      return new RateLimitedError(message, details);
    case "unauthorized":
      return new UnauthorizedError(message, details);
    case "not_found":
      return new NotFoundError(message, details);
    default:
      return new StraleError(error_code, message, statusCode, details);
  }
}
