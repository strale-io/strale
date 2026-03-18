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

export interface DoResponse {
  transaction_id: string;
  status: "completed" | "executing" | "failed";
  capability_used: string;
  price_cents: number;
  latency_ms: number;
  wallet_balance_cents: number;
  output: Record<string, unknown>;
  provenance: Provenance;
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

export interface TransactionDetail {
  id: string;
  status: string;
  capability_slug: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  price_cents: number;
  latency_ms: number;
  provenance: Provenance | null;
  created_at: string;
  completed_at: string | null;
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
