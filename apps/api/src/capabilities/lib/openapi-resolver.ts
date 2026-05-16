// Openapi.com resolver — shared helper for Tier-3 vendor-aggregator
// capabilities backed by the Openapi.com product line.
//
// Auth model: OAuth scope-exchange.
//   1. POST https://oauth.openapi.it/token with HTTP Basic (email:api-token)
//      and JSON body {"scopes":[scope],"ttl":600} → opaque Bearer, ~10 min TTL.
//   2. GET https://company.openapi.com/{PRODUCT}/{path...} with
//      Authorization: Bearer <token>.
//
// Supported products (Phase 2b):
//   ww-top      — global, country-keyed (BG/CY/HU/LU/MT/NL/RO/AT). T3=1/6 (NACE).
//   es-advanced — Spain, NIF-keyed. T3=2/6 (NACE + last_filing_date).
//   pt-advanced — Portugal, NIPC-keyed. T3=2/6 (NACE + last_filing_date).
//
// Phase 2c will add IT-advanced (shareHolders[]) + IT-full (managers,
// subsidiaries, affiliateCompanies). The product-switch design (see
// PRODUCT_REGISTRY below) is the extension point.
//
// Gating: process.env.OPENAPI_ENABLED must equal "true" or the resolver
// returns a capability-unavailable error before any HTTP call. This is
// load-bearing — Strale's resale of Openapi data requires the addendum
// countersignature (case 151296). The flag stays off in production until
// that lands.
//
// Reference: c:/tmp/openapi-research/v4-2026-05-15/output.json (WW-Top
// per-call responses) + c:/tmp/openapi-coverage-probe-v3-2026-05-15.json
// (ES/PT-Advanced response shapes verified).

import { log } from "../../lib/log.js";

export type OpenapiProduct = "ww-top" | "es-advanced" | "pt-advanced";

export interface OpenapiResolverConfig {
  countryCode: string;          // ISO 3166-1 alpha-2
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

// ─── Shared response sub-types ─────────────────────────────────────────────
interface OpenapiAddress {
  registeredOffice?: {
    town?: string | null;
    country?: string | null;
    zipCode?: string | null;
    streetName?: string | null;
    streetNumber?: string | null;
    nativeTown?: string | null;
  };
}
interface WwTopNaceItem {
  code?: string;
  description?: string;
}
interface FlatNace {
  code?: string;
  description?: string;
}
interface BalanceSheetEntry {
  year?: number;
  balanceSheetDate?: string;
  employees?: number;
  netWorth?: number;
  operatingRevenue?: number;
  equity?: number;
  totalAssets?: number;
}

// ─── WW-Top response shape (verified against v4 AT/OMV response) ───────────
interface WwTopData {
  id?: string;
  lastUpdateTimestamp?: number;
  companyName?: string;
  nativeCompanyName?: string;
  companyNumber?: string;
  vatCode?: string;
  taxCode?: string;
  leiCode?: string;
  companySize?: string;
  address?: OpenapiAddress;
  activityStatus?: string;
  incorporationDate?: string;
  internationalClassification?: {
    nace?: {
      primary?: WwTopNaceItem[];
      secondary?: WwTopNaceItem[];
    };
  };
}

// ─── ES/PT-Advanced response shape (verified against v3 probe ─────────────
// Phase B Telefonica + Galp responses). Shares identity fields with
// WW-Top but NACE is flat (single object, not array) and adds
// balanceSheets (last + 4-year history with employees, equity,
// operatingRevenue, totalAssets, netWorth, balanceSheetDate).
interface IberianAdvancedData {
  id?: string;
  lastUpdateTimestamp?: number;
  companyName?: string;
  nativeCompanyName?: string;
  taxCode?: string;
  vatCode?: string;
  leiCode?: string;
  address?: OpenapiAddress;
  activityStatus?: string;
  incorporationDate?: string;
  contacts?: { fax?: string; phone?: string; website?: string };
  internationalClassification?: {
    nace?: FlatNace;
    naics?: FlatNace;
    sic?: FlatNace;
  };
  balanceSheets?: {
    last?: BalanceSheetEntry;
    all?: BalanceSheetEntry[];
  };
}

interface OpenapiResponse<T> {
  data?: T[];
  success?: boolean;
  message?: string;
  error?: unknown;
}

// ─── Shared mappers ────────────────────────────────────────────────────────
function composeAddress(addr: OpenapiAddress | undefined): string | null {
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

function wwTopNacePrimary(
  data: WwTopData,
): { code: string; description: string } | null {
  const p = data.internationalClassification?.nace?.primary?.[0];
  if (!p?.code) return null;
  return { code: p.code, description: p.description ?? "" };
}

function iberianNace(
  data: IberianAdvancedData,
): { code: string; description: string } | null {
  const p = data.internationalClassification?.nace;
  if (!p?.code) return null;
  return { code: p.code, description: p.description ?? "" };
}

// ─── Per-product registry (URL builder + scope + mapper dispatch) ──────────
interface ProductDispatch {
  /** Build the fetch URL for a given country + identifier. */
  buildUrl: (country: string, id: string) => string;
  /** OAuth scope string required for this product. */
  scope: string;
  /** Human-readable provenance.source label. */
  sourceLabel: string;
}

const PRODUCT_REGISTRY: Record<OpenapiProduct, ProductDispatch> = {
  "ww-top": {
    buildUrl: (country, id) =>
      `https://company.openapi.com/WW-top/${encodeURIComponent(country)}/${encodeURIComponent(id)}`,
    scope: "GET:company.openapi.com/WW-top",
    sourceLabel: "Openapi.com WW-Top",
  },
  "es-advanced": {
    // Country-specific products take a single path segment (the identifier).
    // No country path segment because the product name encodes the country.
    buildUrl: (_country, id) =>
      `https://company.openapi.com/ES-advanced/${encodeURIComponent(id)}`,
    scope: "GET:company.openapi.com/ES-advanced",
    sourceLabel: "Openapi.com ES-Advanced",
  },
  "pt-advanced": {
    buildUrl: (_country, id) =>
      `https://company.openapi.com/PT-advanced/${encodeURIComponent(id)}`,
    scope: "GET:company.openapi.com/PT-advanced",
    sourceLabel: "Openapi.com PT-Advanced",
  },
};

// ─── Mappers (produce Strale output{} per product) ─────────────────────────
function mapWwTopOutput(
  data: WwTopData,
  config: OpenapiResolverConfig,
  trimmed: string,
): Record<string, unknown> {
  const status = normaliseStatus(data.activityStatus);
  const nace = wwTopNacePrimary(data);
  const sourceAsOf = epochSecondsToIso(data.lastUpdateTimestamp);
  return {
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
  };
}

function mapIberianAdvancedOutput(
  data: IberianAdvancedData,
  config: OpenapiResolverConfig,
  trimmed: string,
): Record<string, unknown> {
  const status = normaliseStatus(data.activityStatus);
  const nace = iberianNace(data);
  const sourceAsOf = epochSecondsToIso(data.lastUpdateTimestamp);
  // last_filing_date comes from balanceSheets.last.balanceSheetDate (already
  // ISO YYYY-MM-DD per probe data). NOTE: share_capital is NOT present in
  // ES/PT-Advanced response — only IT-Advanced has shareCapital. Matrix's
  // "T3 3/6 (NACE + share capital + last filing year)" claim is incorrect
  // for ES/PT; reality is 2/6 (NACE + last_filing_date). See PR description.
  const lastFilingDate = data.balanceSheets?.last?.balanceSheetDate ?? null;
  return {
    company_name: data.companyName ?? data.nativeCompanyName ?? null,
    native_company_name: data.nativeCompanyName ?? null,
    registration_number: data.taxCode ?? trimmed,
    vat_number: data.vatCode ?? trimmed,
    country_code: config.countryCode,
    legal_form: null,
    status,
    is_active: status === "active",
    registered_date: data.incorporationDate ?? null,
    registered_address: composeAddress(data.address),
    lei_code: data.leiCode ?? null,
    nace_codes: nace ? [nace] : [],
    company_size: null, // not returned at *-Advanced tier
    source_as_of: sourceAsOf,
    last_filing_date: lastFilingDate,
  };
}

// ─── Fetch helpers ─────────────────────────────────────────────────────────
interface CallResult<T> {
  status: number;
  body: OpenapiResponse<T> | null;
  text: string;
}

async function callProduct<T>(
  url: string,
  bearer: string,
): Promise<CallResult<T>> {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await r.text();
  let body: OpenapiResponse<T> | null = null;
  try {
    body = text ? (JSON.parse(text) as OpenapiResponse<T>) : null;
  } catch {
    body = null;
  }
  return { status: r.status, body, text };
}

/**
 * Execute an Openapi-routed capability.
 *
 * Flow:
 *   1. Feature-flag check (OPENAPI_ENABLED).
 *   2. Product validation (config.openapiProduct must be in PRODUCT_REGISTRY).
 *   3. Identifier shape validation against config.identifierRegex.
 *   4. Credentials check (OPENAPI_COM_EMAIL + OPENAPI_COM_API_TOKEN_PROD).
 *   5. Token acquire (cached per scope, 10-min TTL).
 *   6. Product fetch with 15s timeout; single retry on 401 / 5xx.
 *   7. Map response to Strale Tier 1/2/3 shape; throw structured errors on
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

  const product = PRODUCT_REGISTRY[config.openapiProduct];
  if (!product) {
    throw new Error(
      `Openapi resolver does not support product '${config.openapiProduct}'. Supported: ${Object.keys(PRODUCT_REGISTRY).join(", ")}.`,
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

  const requestUrl = product.buildUrl(config.countryCode, trimmed);
  const maxAttempts = 2;
  let attempt = 0;
  let lastErr: unknown = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const bearer = await issueToken(product.scope);
      const r = await callProduct<unknown>(requestUrl, bearer);
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

        let output: Record<string, unknown>;
        let recordId: string | null = null;
        if (config.openapiProduct === "ww-top") {
          const wwTopData = data as WwTopData;
          output = mapWwTopOutput(wwTopData, config, trimmed);
          recordId = wwTopData.id ?? null;
        } else {
          // es-advanced or pt-advanced share the same Iberian shape
          const iberianData = data as IberianAdvancedData;
          output = mapIberianAdvancedOutput(iberianData, config, trimmed);
          recordId = iberianData.id ?? null;
        }

        return {
          output,
          provenance: {
            source: product.sourceLabel,
            source_url: requestUrl,
            fetched_at: new Date().toISOString(),
            upstream_vendor: "openapi.com",
            acquisition_method: "vendor_aggregation",
            authoritative: false,
            openapi_record_id: recordId,
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
        tokenCache.delete(product.scope);
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
