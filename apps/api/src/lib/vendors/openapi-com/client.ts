/**
 * Openapi.com Company API client.
 *
 * Mode-aware: a single class targets either sandbox or production. Mode
 * selects all of (a) the OAuth host used to mint the Bearer token,
 * (b) the API host the token is then used against, and (c) which API key
 * env var is read. Sandbox and production are not interchangeable —
 * a sandbox token presented to company.openapi.com (or vice versa) returns
 * 401.
 *
 * Env vars:
 *   OPENAPI_COM_API_TOKEN_SANDBOX  (sandbox mode credential password)
 *   OPENAPI_COM_API_TOKEN_PROD     (production mode credential password)
 *   OPENAPI_COM_EMAIL              (Basic-auth username — same for both modes)
 *
 * Auth flow (per console.openapi.com OAuth docs + company.openapi.json OAS,
 * fetched 2026-05-06):
 *   1. POST {oauthHost}/token  Authorization: Basic base64(email:apikey)
 *                              Content-Type: application/json
 *                              body: { scopes: ["*:{apiHost}/*"], ttl: 3600 }
 *      → 200 { token, expire (UNIX seconds, absolute), scopes, success }
 *   2. GET {apiHost}/{path}    Authorization: Bearer {token}
 *
 * Token cache: per-instance, mode-locked, refreshed if the cached token
 * is missing OR if (expire - now) < 60s. The 60s buffer prevents reusing
 * a token that may expire mid-flight on a slow upstream.
 *
 * Errors during HTTP I/O are caught and returned as structured OpenapiResult
 * values; the only exceptions thrown are at construction (missing env var)
 * and from token-mint failures that bubble up before any API call has been
 * issued. Token-mint failures inside an API call surface as ok:false /
 * error:"infra" so the script can keep iterating instead of aborting.
 *
 * TTL choice: 3600s. Long enough that the full Phase A + Phase B matrix
 * completes on a single token (≤100 calls / few minutes). Short enough that
 * a leaked token has bounded blast radius. Future capability handlers may
 * want to revisit if call rate justifies a longer-lived cache.
 */

import { safeFetch } from "../../safe-fetch.js";
import { log, logWarn } from "../../log.js";
import type {
  OpenapiErrorClass,
  OpenapiMode,
  OpenapiResult,
  OpenapiTokenResponse,
} from "./types.js";

const TOKEN_TTL_SECONDS = 3600;
const TOKEN_REFRESH_BUFFER_SECONDS = 60;
const REQUEST_TIMEOUT_MS = 30_000;

const HOSTS: Record<OpenapiMode, { api: string; oauth: string }> = {
  sandbox: {
    api: "https://test.company.openapi.com",
    oauth: "https://test.oauth.openapi.it",
  },
  production: {
    api: "https://company.openapi.com",
    oauth: "https://oauth.openapi.it",
  },
};

function envVarForKey(mode: OpenapiMode): string {
  return mode === "sandbox"
    ? "OPENAPI_COM_API_TOKEN_SANDBOX"
    : "OPENAPI_COM_API_TOKEN_PROD";
}

function classify(status: number): OpenapiErrorClass {
  if (status === 401) return "auth";
  if (status === 402) return "credit";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "upstream";
  return "client";
}

interface CachedToken {
  value: string;
  expireUnixSec: number;
}

export class OpenapiClient {
  private readonly mode: OpenapiMode;
  private readonly apiKey: string;
  private readonly email: string;
  private readonly apiBase: string;
  private readonly oauthBase: string;
  private cachedToken: CachedToken | null = null;

  constructor(mode: OpenapiMode) {
    const apiKeyEnv = envVarForKey(mode);
    const apiKey = process.env[apiKeyEnv];
    if (!apiKey || apiKey.trim() === "") {
      throw new Error(
        `OpenapiClient: required env var ${apiKeyEnv} is not set. ` +
          `Get the ${mode} API key from console.openapi.com > Authentication and add it to .env.`,
      );
    }
    const email = process.env.OPENAPI_COM_EMAIL;
    if (!email || email.trim() === "") {
      throw new Error(
        `OpenapiClient: required env var OPENAPI_COM_EMAIL is not set. ` +
          `Set it to the email used to register at console.openapi.com.`,
      );
    }
    this.mode = mode;
    this.apiKey = apiKey.trim();
    this.email = email.trim();
    this.apiBase = HOSTS[mode].api;
    this.oauthBase = HOSTS[mode].oauth;
  }

  getMode(): OpenapiMode {
    return this.mode;
  }

  /** Exposed for test seams — production callers should never read these. */
  getApiBase(): string {
    return this.apiBase;
  }
  getOauthBase(): string {
    return this.oauthBase;
  }

  // ─── Endpoint methods ────────────────────────────────────────────────────

  wwStart(country: string, identifier: string): Promise<OpenapiResult> {
    return this.request(
      `/WW-start/${encodeURIComponent(country.toUpperCase())}/${encodeURIComponent(identifier)}`,
      { endpoint: "WW-start", country: country.toUpperCase(), identifier },
    );
  }

  wwAdvanced(country: string, identifier: string): Promise<OpenapiResult> {
    return this.request(
      `/WW-advanced/${encodeURIComponent(country.toUpperCase())}/${encodeURIComponent(identifier)}`,
      { endpoint: "WW-advanced", country: country.toUpperCase(), identifier },
    );
  }

  countryStart(country: string, identifier: string): Promise<OpenapiResult> {
    const cc = country.toUpperCase();
    return this.request(
      `/${cc}-start/${encodeURIComponent(identifier)}`,
      { endpoint: `${cc}-start`, country: cc, identifier },
    );
  }

  countryAdvanced(country: string, identifier: string): Promise<OpenapiResult> {
    const cc = country.toUpperCase();
    return this.request(
      `/${cc}-advanced/${encodeURIComponent(identifier)}`,
      { endpoint: `${cc}-advanced`, country: cc, identifier },
    );
  }

  itStakeholders(identifier: string): Promise<OpenapiResult> {
    return this.request(
      `/IT-stakeholders/${encodeURIComponent(identifier)}`,
      { endpoint: "IT-stakeholders", country: "IT", identifier },
    );
  }

  // ─── Token mint + cache ──────────────────────────────────────────────────

  /** Hostname-isolated wildcard — sandbox tokens cannot be used against prod and vice versa. */
  private scopeString(): string {
    const host = this.apiBase.replace(/^https?:\/\//, "");
    return `*:${host}/*`;
  }

  private async ensureToken(): Promise<string> {
    const nowSec = Math.floor(Date.now() / 1000);
    if (
      this.cachedToken &&
      this.cachedToken.expireUnixSec - nowSec > TOKEN_REFRESH_BUFFER_SECONDS
    ) {
      return this.cachedToken.value;
    }
    return this.mintToken();
  }

  private async mintToken(): Promise<string> {
    const url = `${this.oauthBase}/token`;
    const basic = Buffer.from(`${this.email}:${this.apiKey}`).toString("base64");
    const body = JSON.stringify({
      scopes: [this.scopeString()],
      ttl: TOKEN_TTL_SECONDS,
    });

    const started = Date.now();
    const response = await safeFetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    const latencyMs = Date.now() - started;

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logWarn("openapi-com-token-mint-failed", "openapi.com token mint failed", {
        url,
        status: response.status,
        latencyMs,
        mode: this.mode,
      });
      throw new Error(
        `OpenapiClient.mintToken: ${response.status} from ${url} (mode=${this.mode}). Body: ${text.slice(0, 200)}`,
      );
    }

    const parsed = (await response.json()) as OpenapiTokenResponse;
    if (!parsed.token || typeof parsed.expire !== "number") {
      throw new Error(
        `OpenapiClient.mintToken: malformed response — missing token or expire field. mode=${this.mode}`,
      );
    }

    this.cachedToken = { value: parsed.token, expireUnixSec: parsed.expire };
    log.info(
      {
        label: "openapi-com-token-minted",
        url,
        latencyMs,
        mode: this.mode,
        expireUnixSec: parsed.expire,
        scopes: parsed.scopes,
      },
      "openapi.com token minted",
    );
    return parsed.token;
  }

  // ─── API call ────────────────────────────────────────────────────────────

  private async request(
    path: string,
    meta: { endpoint: string; country: string | null; identifier: string },
  ): Promise<OpenapiResult> {
    const url = `${this.apiBase}${path}`;
    const started = Date.now();

    let token: string;
    try {
      token = await this.ensureToken();
    } catch (err) {
      const latencyMs = Date.now() - started;
      logWarn("openapi-com-token-error", "openapi.com token-mint failed before API call", {
        url,
        latencyMs,
        mode: this.mode,
        endpoint: meta.endpoint,
        message: err instanceof Error ? err.message : String(err),
      });
      return {
        ok: false,
        status: 0,
        body: null,
        error: "infra",
        latencyMs,
        mode: this.mode,
        endpoint: meta.endpoint,
        country: meta.country,
        identifier: meta.identifier,
      };
    }

    try {
      const response = await safeFetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeoutMs: REQUEST_TIMEOUT_MS,
      });

      const latencyMs = Date.now() - started;
      const status = response.status;

      let body: Record<string, unknown> | null = null;
      try {
        const text = await response.text();
        body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      } catch {
        body = null;
      }

      log.info(
        {
          label: "openapi-com-request",
          url,
          status,
          latencyMs,
          mode: this.mode,
          endpoint: meta.endpoint,
        },
        "openapi.com call complete",
      );

      const ok = status >= 200 && status < 300;
      return {
        ok,
        status,
        body,
        error: ok ? null : classify(status),
        latencyMs,
        mode: this.mode,
        endpoint: meta.endpoint,
        country: meta.country,
        identifier: meta.identifier,
      };
    } catch (err) {
      const latencyMs = Date.now() - started;
      logWarn("openapi-com-infra-error", "openapi.com infrastructure error", {
        url,
        latencyMs,
        mode: this.mode,
        endpoint: meta.endpoint,
        message: err instanceof Error ? err.message : String(err),
      });
      return {
        ok: false,
        status: 0,
        body: null,
        error: "infra",
        latencyMs,
        mode: this.mode,
        endpoint: meta.endpoint,
        country: meta.country,
        identifier: meta.identifier,
      };
    }
  }
}
