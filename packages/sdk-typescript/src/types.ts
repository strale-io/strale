// ─── Client options ────────────────────────────────────────────────────────────

export interface StraleOptions {
  /** API key (starts with sk_) */
  apiKey: string;
  /** Base URL of the Strale API. Defaults to https://api.strale.io */
  baseUrl?: string;
  /** Default max_price_cents for do() calls */
  defaultMaxPriceCents?: number;
  /** Timeout for HTTP requests in milliseconds. Defaults to 60000 */
  timeout?: number;
  /** Poll interval in ms when auto-polling async responses. Defaults to 2000 */
  pollInterval?: number;
  /** Max wait in ms for auto-polling async responses. Defaults to 120000 */
  maxPollWait?: number;
}

// ─── POST /v1/do ───────────────────────────────────────────────────────────────

export interface DoRequest {
  /** Natural language description of what you need done */
  task?: string;
  /** Direct capability slug override (bypasses matching) */
  capability_slug?: string;
  /** Structured input for the capability */
  inputs?: Record<string, unknown>;
  /** Maximum price in EUR cents you're willing to pay */
  max_price_cents: number;
  /** Execution timeout in seconds (max 60) */
  timeout_seconds?: number;
  /** If true, returns what would execute without charging */
  dry_run?: boolean;
  /** Idempotency key for safe retries */
  idempotency_key?: string;
}

export interface DoResult {
  transaction_id: string;
  status: "completed" | "executing" | "failed";
  capability_used: string;
  price_cents: number;
  latency_ms: number;
  wallet_balance_cents?: number;
  output: Record<string, unknown>;
  provenance: Provenance;
}

export interface DoMeta {
  quality?: Record<string, unknown>;
  execution_guidance?: Record<string, unknown>;
  audit?: Record<string, unknown>;
  quality_warning?: string;
}

/** Response from POST /v1/do. Access result fields directly (e.g., response.output). */
export interface DoResponse extends DoResult {
  /** Full result block as returned by the API. */
  _result: DoResult;
  /** Trust layer metadata (quality scores, execution guidance, audit trail). */
  meta: DoMeta;
  free_tier?: boolean;
  usage?: { calls_today: number; daily_limit: number; resets_at: string };
  upgrade?: Record<string, unknown>;
}

export interface DryRunResponse {
  dry_run: true;
  would_execute: string;
  price_cents: number;
  wallet_balance_cents: number;
  wallet_sufficient: boolean;
}

export interface Provenance {
  source: string;
  fetched_at: string;
}

// ─── GET /v1/capabilities ──────────────────────────────────────────────────────

export interface Capability {
  slug: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  input_schema: unknown;
  output_schema: unknown;
  sqs: number;
  sqs_label: string;
  quality: string;
  reliability: string;
  trend: string;
  usable: boolean;
  strategy: string;
}

// ─── GET /v1/wallet/balance ────────────────────────────────────────────────────

export interface BalanceResponse {
  balance_cents: number;
  currency: string;
}

// ─── GET /v1/transactions ──────────────────────────────────────────────────────

export interface Transaction {
  id: string;
  status: string;
  capability_slug: string;
  price_cents: number;
  latency_ms: number;
  created_at: string;
  completed_at: string | null;
}

/**
 * Response from POST /v1/transactions/:id/audit-token.
 *
 * F-A-006: audit tokens expire (default 90 days). Re-issue via this
 * endpoint when the old URL is expiring. Re-issuing does NOT invalidate
 * the previous token — each is independently valid until its own
 * `expires_at`. If you want the previous URL to stop working sooner,
 * shorter initial TTLs or secret rotation are the mechanisms.
 */
export interface AuditTokenReissueResponse {
  transaction_id: string;
  token: string;
  /** Unix seconds. */
  expires_at: number;
  /** ISO-8601 of expires_at for display convenience. */
  expires_at_iso: string;
  /** Fully-constructed shareable URL with token + expires_at embedded. */
  audit_url: string;
}

export interface TransactionDetail {
  id: string;
  status: string;
  capability_slug: string;
  // F-A-005: `input` is null on unauthenticated free-tier lookups (redacted
  // envelope). Authenticated callers always receive a populated object.
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  price_cents: number;
  latency_ms: number;
  provenance: Provenance | null;
  created_at: string;
  completed_at: string | null;
  // F-A-005: present and true only on unauthenticated free-tier lookups.
  // When true, body fields (input/output/error/provenance/audit_trail) are
  // absent or null. Authenticate with an API key for the full body.
  body_redacted?: boolean;
  body_redacted_reason?: string;
}

// ─── Error response shape ──────────────────────────────────────────────────────

export type ErrorCode =
  | "insufficient_balance"
  | "no_matching_capability"
  | "capability_unavailable"
  | "execution_failed"
  | "timeout_exceeded"
  | "invalid_request"
  | "rate_limited"
  | "unauthorized"
  | "not_found";

export interface ApiErrorResponse {
  error_code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
