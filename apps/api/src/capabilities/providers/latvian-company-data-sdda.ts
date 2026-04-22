/**
 * DataProvider stub for latvian-company-data — SDDA UR-API-LegalEntity.
 *
 * Target: Latvian Register of Enterprises (Uzņēmumu reģistrs) via the
 * State Digital Development Agency's (SDDA) API Manager at api.viss.gov.lv.
 * The UR-API-LegalEntity v1.0 product is listed under ur.gov.lv's
 * "free-of-charge services" and runs on WSO2 API Manager — OAuth2
 * client_credentials against the gateway token endpoint, subscription
 * managed per-application via the devportal.
 *
 * Credentials are obtained by self-serve registration at the devportal
 * (see handoff/_general/from-code/2026-04-22-be-lv-migration.md for the
 * step-by-step). Until Petter completes that registration, this stub
 * returns a distinct CONFIG_PENDING error so the capability surfaces a
 * clear configuration gap instead of pretending to work.
 *
 * This file intentionally does NOT call registerChain. Browserless
 * scraping remains the primary (and only) data path for
 * latvian-company-data until the credentials are provisioned and a
 * follow-up session flips SDDA to primary. Auto-register will import
 * this module at startup but the import is a no-op.
 *
 * Scoped by DEC-20260422-E: the Belgian counterpart (CBE) was deferred
 * in the same session because the official CBE Public Search SOAP
 * requires a formal signed application + paid €50/2000 tier, which
 * violates the free-and-self-serve assumption of the DEC-20260420-H
 * direct-connections doctrine.
 */

import type { CapabilityResult } from "../index.js";

const TOKEN_URL = "https://api.viss.gov.lv/oauth2/token";
const API_BASE = "https://api.viss.gov.lv";
const SCOPE = "ur-api-legalentity";

export class SddaConfigPendingError extends Error {
  readonly code = "CONFIG_PENDING";
  constructor(missing: string[]) {
    super(
      `SDDA credentials are not configured (missing: ${missing.join(", ")}). ` +
      `Register an application at https://api.viss.gov.lv/devportal/ and set ` +
      `SDDA_API_CLIENT_ID and SDDA_API_CLIENT_SECRET. ` +
      `See handoff/_general/from-code/2026-04-22-be-lv-migration.md for details.`,
    );
    this.name = "SddaConfigPendingError";
  }
}

interface CachedToken {
  token: string;
  expiresAt: number;
}
let tokenCache: CachedToken | null = null;

async function getAccessToken(): Promise<string> {
  const id = process.env.SDDA_API_CLIENT_ID;
  const secret = process.env.SDDA_API_CLIENT_SECRET;
  const missing: string[] = [];
  if (!id) missing.push("SDDA_API_CLIENT_ID");
  if (!secret) missing.push("SDDA_API_CLIENT_SECRET");
  if (missing.length > 0) throw new SddaConfigPendingError(missing);

  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - 60_000 > now) {
    return tokenCache.token;
  }

  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: SCOPE,
  });
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) {
    throw new Error(`SDDA token endpoint returned HTTP ${r.status}`);
  }
  const d = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!d.access_token) {
    throw new Error("SDDA token endpoint returned no access_token.");
  }
  tokenCache = {
    token: d.access_token,
    expiresAt: now + (d.expires_in ?? 3600) * 1000,
  };
  return d.access_token;
}

/**
 * Fetch Latvian company data via SDDA UR-API-LegalEntity.
 *
 * NOT YET WIRED into the DataProvider chain. Exported for the follow-up
 * session that lights up the SDDA path once credentials are provisioned.
 * Response-mapping is a placeholder — the exact UR-API-LegalEntity
 * response envelope can only be confirmed after the devportal login
 * surfaces its OpenAPI schema. The follow-up session is expected to
 * refine mapCompany once a real response is observed.
 */
export async function fetchViaSdda(
  input: Record<string, unknown>,
): Promise<CapabilityResult> {
  const regRaw = (input.reg_number as string) ?? (input.registration_number as string) ?? "";
  const regNumber = String(regRaw).replace(/[\s.-]/g, "");
  if (!/^\d{11}$/.test(regNumber)) {
    throw new Error(
      "'reg_number' must be an 11-digit Latvian registration number for the SDDA provider.",
    );
  }

  const token = await getAccessToken();
  const url = `${API_BASE}/t/ur_mkanepe/UR-API-LegalEntity/v1.0/legal-entity/${regNumber}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (r.status === 404) {
    throw new Error(`No Latvian legal entity found for ${regNumber}.`);
  }
  if (!r.ok) {
    throw new Error(`SDDA UR-API returned HTTP ${r.status}`);
  }

  const raw = (await r.json()) as Record<string, unknown>;
  return {
    output: raw,
    provenance: {
      source: "Uzņēmumu reģistrs (SDDA UR-API-LegalEntity)",
      source_url: url,
      fetched_at: new Date().toISOString(),
      attribution: "Avots: Latvijas Republikas Uzņēmumu reģistrs",
      license: "Free re-use (SDDA free-of-charge tier)",
      license_url: "https://www.ur.gov.lv/en/get-information/free-of-charge-services/api-web-services/",
      source_note: "EU High-Value Datasets — Reg. (EU) 2023/138",
    },
  };
}
