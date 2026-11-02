export { Strale } from "./client.js";

// Types
export type {
  ApiKey,
  ApiKeyUsage,
  ApiKeyCreated,
  ApiKeyCreateOptions,
  ApiKeyUpdateOptions,
  StraleOptions,
  DoRequest,
  DoResponse,
  DoResult,
  DoMeta,
  DryRunResponse,
  DoBatchRequest,
  DoBatchResponse,
  DoBatchItemResult,
  DoBatchDryRunResponse,
  Provenance,
  Capability,
  BalanceResponse,
  Transaction,
  TransactionDetail,
  ErrorCode,
  ApiErrorResponse,
} from "./types.js";

// Errors
export {
  StraleError,
  InsufficientBalanceError,
  NoMatchingCapabilityError,
  CapabilityUnavailableError,
  ExecutionFailedError,
  TimeoutExceededError,
  InvalidRequestError,
  RateLimitedError,
  UnauthorizedError,
  NotFoundError,
} from "./errors.js";
