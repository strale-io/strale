import { readFileSync } from "node:fs";

// Attribution: every request this package makes carries X-Strale-Client
// "<package>/<version>" (D0, PR #771). Read from package.json so the value
// cannot fall behind a release the way a hand-maintained literal did in
// strale-mcp.
const metadata = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  name: string;
  version: string;
};
export const CLIENT_ID = `${metadata.name}/${metadata.version}`;

export const DEFAULT_BASE_URL = "https://api.strale.io";
export const DEFAULT_MAX_PRICE_CENTS = 200;
const DEFAULT_TIMEOUT_MS = 60_000;

export interface StraleToolsOptions {
  /** Strale API key (sk_live_...). Defaults to process.env.STRALE_API_KEY. */
  apiKey?: string;
  /**
   * A fetch that settles x402 payment challenges, for example
   * `wrapFetchWithPayment(fetch, account)` from `x402-fetch`. Used for paid
   * calls when no API key is set: the payment is the authentication, and the
   * wrapper's own spending limit applies.
   */
  x402Fetch?: typeof fetch;
  /** Plain fetch used for every other request. Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /** API origin. Defaults to https://api.strale.io. */
  baseUrl?: string;
  /** Highest price in EUR cents an API-key call may be charged. Default 200 (€2.00). */
  maxPriceCents?: number;
  /** Per-request timeout in milliseconds. Default 60000. */
  timeoutMs?: number;
}

export interface ResolvedOptions {
  apiKey?: string;
  x402Fetch?: typeof fetch;
  fetch: typeof fetch;
  baseUrl: string;
  maxPriceCents: number;
  timeoutMs: number;
}

export function resolveOptions(opts: StraleToolsOptions = {}): ResolvedOptions {
  const envKey = typeof process !== "undefined" ? process.env?.STRALE_API_KEY : undefined;
  return {
    apiKey: opts.apiKey ?? (envKey || undefined),
    x402Fetch: opts.x402Fetch,
    fetch: opts.fetch ?? globalThis.fetch,
    baseUrl: (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
    maxPriceCents: opts.maxPriceCents ?? DEFAULT_MAX_PRICE_CENTS,
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

export async function request(
  opts: ResolvedOptions,
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; auth?: boolean; via?: typeof fetch; signal?: AbortSignal } = {},
): Promise<HttpResult> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Strale-Client": CLIENT_ID,
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.auth && opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;
  const timeout = AbortSignal.timeout(opts.timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  const resp = await (init.via ?? opts.fetch)(`${opts.baseUrl}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal,
  });
  const text = await resp.text();
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = text ? JSON.parse(text) : {};
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { value: parsed };
  } catch {
    body = { error_code: "non_json_response", message: text.slice(0, 300) };
  }
  return { status: resp.status, body };
}
