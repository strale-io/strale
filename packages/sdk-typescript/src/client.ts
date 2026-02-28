import type {
  StraleOptions,
  DoRequest,
  DoResponse,
  DryRunResponse,
  Capability,
  BalanceResponse,
  Transaction,
  TransactionDetail,
  ApiErrorResponse,
} from "./types.js";
import { createError, StraleError } from "./errors.js";

const DEFAULT_BASE_URL = "https://api.strale.io";
const DEFAULT_TIMEOUT = 60_000;
const DEFAULT_POLL_INTERVAL = 2_000;
const DEFAULT_MAX_POLL_WAIT = 120_000;

export class Strale {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly pollInterval: number;
  private readonly maxPollWait: number;
  private readonly defaultMaxPriceCents?: number;

  constructor(options: StraleOptions) {
    if (!options.apiKey) {
      throw new Error("apiKey is required");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;
    this.maxPollWait = options.maxPollWait ?? DEFAULT_MAX_POLL_WAIT;
    this.defaultMaxPriceCents = options.defaultMaxPriceCents;
  }

  // ─── Core: execute a capability ────────────────────────────────────────────

  /**
   * Execute a capability. If the server returns status "executing" (async),
   * auto-polls until completed or failed.
   */
  async do(request: DoRequest): Promise<DoResponse>;
  async do(request: DoRequest & { dry_run: true }): Promise<DryRunResponse>;
  async do(
    request: DoRequest,
  ): Promise<DoResponse | DryRunResponse> {
    const body: Record<string, unknown> = {
      max_price_cents:
        request.max_price_cents ?? this.defaultMaxPriceCents,
    };

    if (request.task !== undefined) body.task = request.task;
    if (request.capability_slug !== undefined)
      body.capability_slug = request.capability_slug;
    if (request.inputs !== undefined) body.inputs = request.inputs;
    if (request.timeout_seconds !== undefined)
      body.timeout_seconds = request.timeout_seconds;
    if (request.dry_run !== undefined) body.dry_run = request.dry_run;

    const headers: Record<string, string> = {};
    if (request.idempotency_key) {
      headers["Idempotency-Key"] = request.idempotency_key;
    }

    const response = await this.request<DoResponse | DryRunResponse>(
      "POST",
      "/v1/do",
      body,
      headers,
    );

    // Dry run returns immediately
    if ("dry_run" in response && response.dry_run) {
      return response;
    }

    // If async (status: "executing"), auto-poll until terminal state
    const doResponse = response as DoResponse;
    if (doResponse.status === "executing") {
      return this.pollTransaction(doResponse);
    }

    return doResponse;
  }

  // ─── Capabilities ──────────────────────────────────────────────────────────

  /** List all available capabilities */
  async capabilities(): Promise<Capability[]> {
    const response = await this.request<{ capabilities: Capability[] }>(
      "GET",
      "/v1/capabilities",
    );
    return response.capabilities;
  }

  /** Get details for a specific capability */
  async capability(slug: string): Promise<Capability> {
    return this.request<Capability>("GET", `/v1/capabilities/${slug}`);
  }

  // ─── Wallet ────────────────────────────────────────────────────────────────

  /** Get current wallet balance */
  async balance(): Promise<BalanceResponse> {
    return this.request<BalanceResponse>("GET", "/v1/wallet/balance");
  }

  // ─── Transactions ──────────────────────────────────────────────────────────

  /** List recent transactions */
  async transactions(): Promise<Transaction[]> {
    const response = await this.request<{ transactions: Transaction[] }>(
      "GET",
      "/v1/transactions",
    );
    return response.transactions;
  }

  /** Get details for a specific transaction */
  async transaction(id: string): Promise<TransactionDetail> {
    return this.request<TransactionDetail>("GET", `/v1/transactions/${id}`);
  }

  // ─── Auto-poll for async responses ─────────────────────────────────────────

  private async pollTransaction(initial: DoResponse): Promise<DoResponse> {
    const deadline = Date.now() + this.maxPollWait;
    let lastStatus: string = initial.status;

    while (Date.now() < deadline) {
      await this.sleep(this.pollInterval);

      const detail = await this.transaction(initial.transaction_id);

      if (detail.status === "completed") {
        return {
          transaction_id: detail.id,
          status: "completed" as const,
          capability_used: detail.capability_slug,
          price_cents: detail.price_cents,
          latency_ms: detail.latency_ms,
          wallet_balance_cents: initial.wallet_balance_cents, // best known
          output: detail.output ?? {},
          provenance: detail.provenance ?? {
            source: "unknown",
            fetched_at: new Date().toISOString(),
          },
        };
      }

      if (detail.status === "failed") {
        throw new StraleError(
          "execution_failed",
          detail.error ?? "Capability execution failed",
          500,
          { transaction_id: detail.id },
        );
      }

      lastStatus = detail.status;
    }

    // Timed out waiting for completion
    throw new StraleError(
      "timeout_exceeded",
      `Timed out waiting for transaction ${initial.transaction_id} (last status: ${lastStatus})`,
      408,
      { transaction_id: initial.transaction_id },
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─── HTTP layer ────────────────────────────────────────────────────────────

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      ...extraHeaders,
    };

    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(this.timeout),
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new StraleError(
          "timeout_exceeded",
          `Request timed out after ${this.timeout}ms`,
          408,
        );
      }
      throw new StraleError(
        "execution_failed",
        `Network error: ${err instanceof Error ? err.message : String(err)}`,
        0,
      );
    }

    // Try to parse JSON (API always returns JSON)
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new StraleError(
        "execution_failed",
        `Invalid JSON response (HTTP ${response.status})`,
        response.status,
      );
    }

    // Check for error responses
    if (!response.ok) {
      const errorBody = data as ApiErrorResponse;
      if (errorBody?.error_code) {
        throw createError(errorBody, response.status);
      }
      throw new StraleError(
        "execution_failed",
        `HTTP ${response.status}: ${JSON.stringify(data)}`,
        response.status,
      );
    }

    return data as T;
  }
}
