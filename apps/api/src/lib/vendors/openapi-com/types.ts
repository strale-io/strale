/**
 * Openapi.com Company API — request and response types.
 *
 * Auth flow (verified 2026-05-06 from console.openapi.com OAuth + Company OAS):
 *   1. POST {oauthHost}/token with Authorization: Basic base64(email:apikey)
 *      and JSON body { scopes: [...method-qualified URL patterns], ttl }.
 *      Response: { token, expire (UNIX seconds, absolute), scopes, success }.
 *   2. Use the minted token as Authorization: Bearer {token} against the
 *      mode-matching API host.
 *
 * Hostnames are pinned per mode — sandbox and production are NOT
 * interchangeable, and a token minted for one host will be rejected by
 * the other:
 *   sandbox    → OAuth test.oauth.openapi.it, API test.company.openapi.com
 *   production → OAuth oauth.openapi.it,      API company.openapi.com
 */

export type OpenapiMode = "sandbox" | "production";

export type OpenapiErrorClass =
  | "auth"            // 401
  | "credit"          // 402 — insufficient credit / virtual sandbox credit
  | "not_found"       // 404
  | "rate_limit"      // 429
  | "upstream"        // 5xx
  | "infra"           // network / timeout / non-JSON body / token mint failed
  | "client";         // 4xx other than the above

export interface OpenapiResult {
  ok: boolean;
  status: number;
  /** Parsed JSON body, or null if not JSON / not parseable. */
  body: Record<string, unknown> | null;
  /** Classification of the failure, or null when ok=true. */
  error: OpenapiErrorClass | null;
  /** Wall-clock latency in ms (API call only — token-mint latency is separate). */
  latencyMs: number;
  /** Mode the call ran under — useful for tagging mixed-mode reports. */
  mode: OpenapiMode;
  /** Endpoint label, e.g. "WW-start", "IT-advanced", for report grouping. */
  endpoint: string;
  /** ISO2 country code — populated for country-scoped endpoints. */
  country: string | null;
  /** Identifier passed in the request. */
  identifier: string;
}

/** OAuth token-mint response shape (fields we read). */
export interface OpenapiTokenResponse {
  token: string;
  /** UNIX timestamp in seconds — absolute expiry, NOT seconds-from-now. */
  expire: number;
  scopes?: string[];
  success?: boolean;
  message?: string;
  error?: number | null;
}
