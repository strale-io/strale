import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * US EIN (Employer Identification Number) match via Liberty Data /
 * EINsearch.
 *
 * Vendor: Liberty Data Solutions (einsearch.com) — Tier-3 licensed-bulk
 * vendor. ~24M EIN database, bureau-derived. Selection per
 * DEC-20260430-A. Pure data tier (not a KYB workflow product), self-
 * serve purchase, no sales call.
 *
 * Pricing (per Vendor Roster row): $375/yr Startup tier (500 searches,
 * $0.75 effective per call) up to $3,800/yr Enterprise (10k searches,
 * $0.38 effective).
 *
 * Activation: requires EINSEARCH_API_KEY in env. Sign up at
 * https://einsearch.com/pricing/?annual and configure the API key.
 *
 * Two input modes:
 *   1. ein (exact): 9-digit EIN, returns the business record.
 *   2. business_name + state (optional): name search, returns up to N
 *      ranked candidates. Use for resolution when you don't have an EIN.
 */

const EINSEARCH_API = "https://einsearch.com/api/v1";
const EIN_RE = /^\d{2}-?\d{7}$/;

function normalizeEin(input: string): string {
  return input.replace(/[\s-]/g, "");
}

registerCapability("us-ein-match", async (input: CapabilityInput) => {
  const apiKey = process.env.EINSEARCH_API_KEY;
  if (!apiKey) {
    throw new Error(
      "EINSEARCH_API_KEY is required for US EIN match. Sign up at https://einsearch.com/pricing/?annual and configure the API key.",
    );
  }

  const einInput = ((input.ein as string) ?? "").trim();
  const businessName = ((input.business_name as string) ?? (input.company_name as string) ?? "").trim();
  const state = ((input.state as string) ?? "").trim().toUpperCase();
  const limit = Math.min(Math.max(Number(input.limit) || 5, 1), 25);

  if (!einInput && !businessName) {
    throw new Error("'ein' or 'business_name' is required.");
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };

  // EIN exact lookup mode
  if (einInput) {
    const ein = normalizeEin(einInput);
    if (!EIN_RE.test(einInput) || ein.length !== 9) {
      throw new Error(`Invalid ein: "${einInput}". US EINs are 9 digits, optionally formatted XX-XXXXXXX.`);
    }
    const res = await fetch(`${EINSEARCH_API}/ein/${ein}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) {
      return {
        output: {
          mode: "ein_lookup",
          ein,
          found: false,
          business_name: null,
          status: null,
          formed_state: null,
          address: null,
          candidates: [],
          data_source: "Liberty Data EINsearch (~24M EIN database)",
        },
        provenance: { source: "einsearch.com", fetched_at: new Date().toISOString() },
      };
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`EINsearch rejected the API key (HTTP ${res.status}). Verify EINSEARCH_API_KEY.`);
    }
    if (!res.ok) throw new Error(`EINsearch returned HTTP ${res.status}`);
    const data = (await res.json()) as any;
    return {
      output: {
        mode: "ein_lookup",
        ein: data.ein ?? ein,
        found: true,
        business_name: data.business_name ?? data.legal_name ?? null,
        status: data.status ?? null,
        formed_state: data.state ?? data.formed_state ?? null,
        address: data.address ?? null,
        candidates: [],
        data_source: "Liberty Data EINsearch (~24M EIN database)",
      },
      provenance: { source: "einsearch.com", fetched_at: new Date().toISOString() },
    };
  }

  // Name search mode
  const params = new URLSearchParams({
    name: businessName,
    limit: String(limit),
  });
  if (state && state.length === 2) params.set("state", state);

  const res = await fetch(`${EINSEARCH_API}/search?${params.toString()}`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`EINsearch rejected the API key (HTTP ${res.status}). Verify EINSEARCH_API_KEY.`);
  }
  if (!res.ok) throw new Error(`EINsearch returned HTTP ${res.status}`);
  const data = (await res.json()) as any;
  const items: any[] = data.results ?? data.items ?? data.data ?? [];

  return {
    output: {
      mode: "name_search",
      ein: null,
      found: items.length > 0,
      business_name: businessName,
      status: null,
      formed_state: state || null,
      address: null,
      candidates: items.slice(0, limit).map((it) => ({
        ein: it.ein ?? null,
        business_name: it.business_name ?? it.legal_name ?? null,
        status: it.status ?? null,
        formed_state: it.state ?? null,
        address: it.address ?? null,
        match_score: it.match_score ?? it.score ?? null,
      })),
      data_source: "Liberty Data EINsearch (~24M EIN database)",
    },
    provenance: { source: "einsearch.com", fetched_at: new Date().toISOString() },
  };
});
