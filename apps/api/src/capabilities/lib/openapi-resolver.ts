// Openapi.com WW-Top resolver — shared helper for Tier-3 vendor-aggregator
// capabilities backed by the Openapi.com product line.
//
// Auth model: OAuth scope-exchange.
//   1. POST https://oauth.openapi.it/token with HTTP Basic (email:api-token)
//      and JSON body {"scopes":[scope],"ttl":600} → opaque Bearer, ~10 min TTL.
//   2. GET https://company.openapi.com/WW-top/{country}/{identifier} with
//      Authorization: Bearer <token>.
//
// Phase 1 only handles the WW-Top product. Phase 2 will extend the product
// switch to handle country-specific Start/Advanced endpoints (ES-Advanced,
// PT-Advanced, IT-Advanced, etc.) — those have richer response shapes.
//
// Gating: process.env.OPENAPI_ENABLED must equal "true" or the resolver
// returns a capability-unavailable error before any HTTP call. This is
// load-bearing — Strale's resale of Openapi data requires the addendum
// countersignature (case 151296). The flag stays off in production until
// that lands.
//
// Reference: c:/tmp/openapi-research/v4-2026-05-15/output.json + per-call
// response files at c:/tmp/openapi-research/v4-2026-05-15/responses/.

import { log } from "../../lib/log.js";

export type OpenapiProduct = "ww-top";

export interface OpenapiResolverConfig {
  countryCode: string;          // ISO 3166-1 alpha-2 (path segment for WW-Top)
  identifierRegex: RegExp;      // pre-flight identifier-shape validation
  openapiProduct: OpenapiProduct;
  capabilitySlug: string;       // for log context + error messages
}

export interface OpenapiResolverResult {
  output: Record<string, unknown>;
  provenance: {
    source: string;
    source_url: string;
    fetched_at: string;
    upstream_vendor: string;
    acquisition_method: string;
    authoritative: boolean;
    [key: string]: unknown;
  };
}

// ─── Token cache (per scope, in-process) ───────────────────────────────────
interface CachedToken {
  token: string;
  expiresAt: number;
}
const tokenCache = new Map<string, CachedToken>();

/** For tests only — clears the in-process OAuth-token cache. */
export function __resetOpenapiTokenCacheForTests(): void {
  tokenCache.clear();
}

async function issueToken(scope: string): Promise<string> {
  const email = process.env.OPENAPI_COM_EMAIL;
  const apiToken = process.env.OPENAPI_COM_API_TOKEN_PROD;
  if (!email || !apiToken) {
    throw new Error(
      "capability-unavailable: OPENAPI_COM_EMAIL and OPENAPI_COM_API_TOKEN_PROD must be configured.",
    );
  }
  const cached = tokenCache.get(scope);
  if (cached && cached.expiresAt - 30_000 > Date.now()) {
    return cached.token;
  }
  const basic = Buffer.from(`${email}:${apiToken}`).toString("base64");
  const r = await fetch("https://oauth.openapi.it/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ scopes: [scope], ttl: 600 }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(
      `Openapi token endpoint returned HTTP ${r.status}: ${body.slice(0, 200)}`,
    );
  }
  const data = (await r.json()) as { token?: string };
  if (!data.token) {
    throw new Error("Openapi token endpoint returned no token field.");
  }
  tokenCache.set(scope, {
    token: data.token,
    expiresAt: Date.now() + 600_000,
  });
  return data.token;
}

// ─── WW-Top response shape (subset; verified against v4 AT/OMV response) ───
interface WWTopAddress {
  registeredOffice?: {
    town?: string | null;
    country?: string | null;
    zipCode?: string | null;
    streetName?: string | null;
    streetNumber?: string | null;
    nativeTown?: string | null;
  };
}
interface WWTopMarker {
  label?: string;
  number?: string;
  types?: string[];
}
interface WWTopNaceItem {
  code?: string;
  description?: string;
}
interface WWTopData {
  id?: string;
  lastUpdateTimestamp?: number;
  companyName?: string;
  nativeCompanyName?: string;
  companyNumber?: string;
  vatCode?: string;
  leiCode?: string;
  companySize?: string;
  markers?: WWTopMarker[];
  address?: WWTopAddress;
  activityStatus?: string;
  incorporationDate?: string;
  internationalClassification?: {
    nace?: {
      primary?: WWTopNaceItem[];
      secondary?: WWTopNaceItem[];
    };
  };
}
interface WWTopResponse {
  data?: WWTopData[];
  success?: boolean;
  message?: string;
  error?: unknown;
}

function composeAddress(addr: WWTopAddress | undefined): string | null {
  if (!addr?.registeredOffice) return null;
  const o = addr.registeredOffice;
  const street =
    o.streetName && o.streetNumber
      ? `${o.streetName.trim()} ${o.streetNumber.trim()}`
      : o.streetName?.trim() ?? null;
  const parts = [street, o.zipCode?.trim(), o.town?.trim(), o.country?.trim()]
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  return parts.length > 0 ? parts.join(", ") : null;
}

function epochSecondsToIso(epoch: number | undefined | null): string | null {
  if (typeof epoch !== "number" || !Number.isFinite(epoch) || epoch <= 0) {
    return null;
  }
  return new Date(epoch * 1000).toISOString();
}

function normaliseStatus(raw: string | undefined): "active" | "inactive" | "unknown" {
  if (!raw) return "unknown";
  const v = raw.trim().toLowerCase();
  if (v === "active" || v === "attiva") return "active";
  if (
    v === "inactive" ||
    v === "dissolved" ||
    v === "ceased" ||
    v === "terminated"
  ) {
    return "inactive";
  }
  return "unknown";
}

function nacePrimary(
  data: WWTopData,
): { code: string; description: string } | null {
  const p = data.internationalClassification?.nace?.primary?.[0];
  if (!p?.code) return null;
  return { code: p.code, description: p.description ?? "" };
}

interface CallResult {
  status: number;
  body: WWTopResponse | null;
  text: string;
}

async function callWWTop(
  country: string,
  id: string,
  bearer: string,
): Promise<CallResult> {
  const url = `https://company.openapi.com/WW-top/${encodeURIComponent(country)}/${encodeURIComponent(id)}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await r.text();
  let body: WWTopResponse | null = null;
  try {
    body = text ? (JSON.parse(text) as WWTopResponse) : null;
  } catch {
    body = null;
  }
  return { status: r.status, body, text };
}

/**
 * Execute an Openapi-routed capability against the WW-Top product.
 *
 * Flow:
 *   1. Feature-flag check (OPENAPI_ENABLED).
 *   2. Credentials check (OPENAPI_COM_EMAIL + OPENAPI_COM_API_TOKEN_PROD).
 *   3. Identifier shape validation against config.identifierRegex.
 *   4. Token acquire (cached per scope, 10-min TTL).
 *   5. WW-Top fetch with 15s timeout; single retry on 401 (token-stale) or 5xx.
 *   6. Map response to Strale Tier 1/2/3 shape; throw structured errors on
 *      204/406/4xx/5xx/network.
 */
export async function executeOpenapiCapability(
  config: OpenapiResolverConfig,
  identifier: string,
): Promise<OpenapiResolverResult> {
  const t0 = Date.now();
  const baseCtx = {
    capability_slug: config.capabilitySlug,
    country_code: config.countryCode,
    openapi_product: config.openapiProduct,
  };

  if (process.env.OPENAPI_ENABLED !== "true") {
    log.info(
      { label: "openapi-capability-disabled", ...baseCtx },
      "openapi-capability-disabled",
    );
    throw new Error(
      "capability-unavailable: OPENAPI_ENABLED is not set to 'true' in this environment. Openapi-routed capabilities require the resale addendum countersignature (case 151296) before serving customer traffic.",
    );
  }

  if (config.openapiProduct !== "ww-top") {
    throw new Error(
      `Openapi resolver phase 1 only supports the 'ww-top' product; received '${config.openapiProduct}'. Phase 2 extension pending.`,
    );
  }

  if (typeof identifier !== "string" || !identifier.trim()) {
    throw new Error(`Identifier is required for ${config.capabilitySlug}.`);
  }
  const trimmed = identifier.trim();
  if (!config.identifierRegex.test(trimmed)) {
    throw new Error(
      `'${trimmed}' does not match the expected identifier shape for ${config.capabilitySlug} (regex: ${config.identifierRegex.source}).`,
    );
  }

  const scope = "GET:company.openapi.com/WW-top";
  const maxAttempts = 2;
  let attempt = 0;
  let lastErr: unknown = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const bearer = await issueToken(scope);
      const r = await callWWTop(config.countryCode, trimmed, bearer);
      const durationMs = Date.now() - t0;

      if (r.status === 200) {
        if (
          !r.body ||
          r.body.success !== true ||
          !Array.isArray(r.body.data) ||
          !r.body.data[0]
        ) {
          throw new Error(
            `Openapi returned HTTP 200 but the response body did not contain expected data[0]: ${r.text.slice(0, 200)}`,
          );
        }
        const data = r.body.data[0];
        const status = normaliseStatus(data.activityStatus);
        const nace = nacePrimary(data);
        const sourceAsOf = epochSecondsToIso(data.lastUpdateTimestamp);
        const requestUrl = `https://company.openapi.com/WW-top/${encodeURIComponent(config.countryCode)}/${encodeURIComponent(trimmed)}`;

        log.info(
          {
            label: "openapi-success",
            ...baseCtx,
            identifier: trimmed,
            duration_ms: durationMs,
            response_size_bytes: r.text.length,
          },
          "openapi-success",
        );

        return {
          output: {
            company_name: data.companyName ?? data.nativeCompanyName ?? null,
            native_company_name: data.nativeCompanyName ?? null,
            registration_number: data.companyNumber ?? trimmed,
            vat_number: data.vatCode ?? trimmed,
            country_code: config.countryCode,
            legal_form: null,
            status,
            is_active: status === "active",
            registered_date: data.incorporationDate ?? null,
            registered_address: composeAddress(data.address),
            lei_code: data.leiCode ?? null,
            nace_codes: nace ? [nace] : [],
            company_size: data.companySize ?? null,
            source_as_of: sourceAsOf,
          },
          provenance: {
            source: "Openapi.com WW-Top",
            source_url: requestUrl,
            fetched_at: new Date().toISOString(),
            upstream_vendor: "openapi.com",
            acquisition_method: "vendor_aggregation",
            authoritative: false,
            openapi_record_id: data.id ?? null,
          },
        };
      }

      if (r.status === 204) {
        log.info(
          {
            label: "openapi-not-found",
            ...baseCtx,
            identifier: trimmed,
            duration_ms: durationMs,
          },
          "openapi-not-found",
        );
        throw new Error(
          `No ${config.capabilitySlug.replace(/-/g, " ")} found for identifier '${trimmed}'.`,
        );
      }

      if (r.status === 406) {
        const msg = r.body?.message ?? "vendor rejected identifier";
        log.info(
          {
            label: "openapi-identifier-rejected",
            ...baseCtx,
            identifier: trimmed,
            vendor_message: msg,
            duration_ms: durationMs,
          },
          "openapi-identifier-rejected",
        );
        throw new Error(
          `Openapi rejected '${trimmed}' as invalid for country ${config.countryCode}: ${msg}`,
        );
      }

      if (r.status === 401 && attempt === 1) {
        tokenCache.delete(scope);
        log.info(
          { label: "openapi-token-stale", ...baseCtx },
          "openapi-token-stale",
        );
        continue;
      }

      if (r.status >= 500 && attempt === 1) {
        log.info(
          {
            label: "openapi-5xx-retry",
            ...baseCtx,
            status: r.status,
          },
          "openapi-5xx-retry",
        );
        await new Promise((resolve) => setTimeout(resolve, 200));
        continue;
      }

      if (r.status >= 500) {
        throw new Error(
          `capability-unavailable: Openapi upstream error (HTTP ${r.status}) for ${config.capabilitySlug}.`,
        );
      }

      throw new Error(
        `Openapi returned HTTP ${r.status} for ${config.capabilitySlug}: ${r.text.slice(0, 200)}`,
      );
    } catch (err) {
      lastErr = err;
      if (
        attempt === 1 &&
        err instanceof Error &&
        (err.name === "AbortError" ||
          err.name === "TimeoutError" ||
          err.message.includes("fetch failed"))
      ) {
        log.info(
          {
            label: "openapi-network-retry",
            ...baseCtx,
            error: String(err).slice(0, 200),
          },
          "openapi-network-retry",
        );
        await new Promise((resolve) => setTimeout(resolve, 200));
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
