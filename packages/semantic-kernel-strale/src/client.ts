/**
 * Lightweight HTTP client for the Strale API.
 */

const DEFAULT_BASE_URL = "https://api.strale.io";

export interface Capability {
  slug: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  input_schema: Record<string, unknown> | null;
  output_schema: Record<string, unknown> | null;
  avg_latency_ms: number | null;
  success_rate: string | null;
}

export interface ExecuteResult {
  transaction_id?: string;
  status?: string;
  capability_used?: string;
  price_cents?: number;
  latency_ms?: number;
  wallet_balance_cents?: number;
  output?: unknown;
  provenance?: unknown;
  error_code?: string;
  message?: string;
}

export interface BalanceResult {
  balance_cents: number;
  currency: string;
}

export interface StraleClientOptions {
  apiKey: string;
  baseUrl?: string;
}

export class StraleClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts: StraleClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  async listCapabilities(): Promise<Capability[]> {
    const resp = await fetch(`${this.baseUrl}/v1/capabilities`);
    if (!resp.ok) throw new Error(`Failed to list capabilities: ${resp.status}`);
    const data = (await resp.json()) as { capabilities: Capability[] };
    return data.capabilities;
  }

  async execute(params: {
    capabilitySlug: string;
    task?: string;
    inputs?: Record<string, unknown>;
    maxPriceCents?: number;
  }): Promise<ExecuteResult> {
    const payload: Record<string, unknown> = {
      capability_slug: params.capabilitySlug,
    };
    if (params.task) payload.task = params.task;
    if (params.inputs) payload.inputs = params.inputs;
    if (params.maxPriceCents != null)
      payload.max_price_cents = params.maxPriceCents;

    const resp = await fetch(`${this.baseUrl}/v1/do`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    return (await resp.json()) as ExecuteResult;
  }

  async getBalance(): Promise<BalanceResult> {
    const resp = await fetch(`${this.baseUrl}/v1/wallet/balance`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!resp.ok) throw new Error(`Failed to get balance: ${resp.status}`);
    return (await resp.json()) as BalanceResult;
  }
}
