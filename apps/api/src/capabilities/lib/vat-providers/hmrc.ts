/**
 * HMRC provider — UK VAT validation via the "Check a UK VAT Number" API v2.
 *
 * Free, but registration-gated: requires a Developer Hub account and OAuth2
 * client_credentials with HMRC. Production approval takes up to 10 working days.
 *
 * The verified-mode endpoint returns a *consultation reference number* — that
 * reference is audit-gold and gets surfaced in `source_reference` so it can
 * land on the audit artifact a regulator can inspect.
 *
 * Until credentials land, this provider throws a structured "credentials
 * pending" error. The substrate-level cache + stale-fallback in vat-validate
 * means that doesn't blow up the whole request — once HMRC creds are wired,
 * this file is the only thing that needs to change.
 */

import type { ParsedVat, VatProvider, VatProviderResult } from "./types.js";

const SANDBOX_BASE = "https://test-api.service.hmrc.gov.uk";
const PRODUCTION_BASE = "https://api.service.hmrc.gov.uk";

interface HmrcAddress {
  line1?: string;
  line2?: string;
  line3?: string;
  line4?: string;
  postcode?: string;
  countryCode?: string;
}

interface HmrcLookupResponse {
  target?: {
    vatNumber?: string;
    name?: string;
    address?: HmrcAddress;
  };
  requester?: string;
  consultationNumber?: string;
  processingDate?: string;
}

interface HmrcTokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: HmrcTokenCache | null = null;

function getConfig() {
  const useSandbox = process.env.HMRC_USE_SANDBOX === "true";
  const clientId = useSandbox
    ? process.env.HMRC_SANDBOX_CLIENT_ID
    : process.env.HMRC_CLIENT_ID;
  const clientSecret = useSandbox
    ? process.env.HMRC_SANDBOX_CLIENT_SECRET
    : process.env.HMRC_CLIENT_SECRET;
  const baseUrl = useSandbox ? SANDBOX_BASE : PRODUCTION_BASE;
  // Optional: GB VRN of the requester. When set, HMRC issues a consultation
  // reference number that we surface as source_reference for the audit trail.
  const requesterVrn = process.env.HMRC_REQUESTER_VRN;
  return { clientId, clientSecret, baseUrl, requesterVrn, useSandbox };
}

async function getAccessToken(
  baseUrl: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "read:vat-registered-companies",
  });

  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`HMRC OAuth token request failed (HTTP ${response.status}).`);
  }

  const json = (await response.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

function formatHmrcAddress(addr: HmrcAddress | undefined): string {
  if (!addr) return "";
  return [addr.line1, addr.line2, addr.line3, addr.line4, addr.postcode, addr.countryCode]
    .filter((x) => x)
    .join(", ");
}

async function callHmrc(parsed: ParsedVat): Promise<VatProviderResult> {
  const { clientId, clientSecret, baseUrl, requesterVrn } = getConfig();

  if (!clientId || !clientSecret) {
    throw new Error(
      "UK VAT validation is not yet enabled — HMRC credentials pending. Production access takes up to 10 working days from HMRC Developer Hub. Set HMRC_CLIENT_ID and HMRC_CLIENT_SECRET (or HMRC_SANDBOX_* for sandbox) to enable.",
    );
  }

  const vrn = parsed.number.replace(/\D/g, "");
  if (!/^\d{9}(\d{3})?$/.test(vrn)) {
    throw new Error(
      `UK VAT numbers are 9 digits (or 12 digits for branch traders) — got "${parsed.number}".`,
    );
  }

  const token = await getAccessToken(baseUrl, clientId, clientSecret);

  // Verified mode (with requesterVrn) returns a consultation reference;
  // unverified mode returns just the lookup result.
  const path = requesterVrn
    ? `/organisations/vat/check-vat-number/lookup/${vrn}/${requesterVrn}`
    : `/organisations/vat/check-vat-number/lookup/${vrn}`;

  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: "application/vnd.hmrc.2.0+json",
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(10000),
  });

  if (response.status === 404) {
    return {
      valid: false,
      country_code: "GB",
      vat_number: `GB${vrn}`,
      company_name: "",
      company_address: "",
      request_date: new Date().toISOString(),
    };
  }

  if (response.status === 429) {
    throw new Error("HMRC rate limit exceeded (3 req/sec). Please retry shortly.");
  }

  if (!response.ok) {
    throw new Error(`HMRC returned HTTP ${response.status}.`);
  }

  const body = (await response.json()) as HmrcLookupResponse;
  const target = body.target;

  return {
    valid: Boolean(target?.vatNumber),
    country_code: "GB",
    vat_number: `GB${target?.vatNumber ?? vrn}`,
    company_name: target?.name ?? "",
    company_address: formatHmrcAddress(target?.address),
    request_date: body.processingDate ?? new Date().toISOString(),
    source_reference: body.consultationNumber,
  };
}

export const hmrcProvider: VatProvider = {
  name: "hmrc",
  source: "api.service.hmrc.gov.uk (Check a UK VAT Number v2)",
  // XI (Northern Ireland) is intentionally NOT here — post-Brexit Protocol
  // means XI VAT numbers stay in VIES. HMRC v2 covers GB only.
  prefixes: ["GB"],
  validate: callHmrc,
};
