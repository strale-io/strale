import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * US company registry lookup via Cobalt Intelligence (50-state Secretary
 * of State coverage).
 *
 * Vendor: Cobalt Intelligence (cobaltintelligence.com) — Tier-2 vendor-
 * mediated public records. Live SoS lookups, screenshot-grade primary-
 * source provenance. Founder confirmed clean redistribution rights
 * (DEC-20260430-A) and Swedish AB onboarding has no friction.
 *
 * Pricing (per Vendor Roster row): $2/call PAYG, no commitment. Drops to
 * $0.75 at $7,200/yr (400 lookups/mo) and lower at higher tiers. PAYG is
 * the recommended start.
 *
 * Activation: requires COBALT_API_KEY in env. Sign up at
 * https://cobaltintelligence.com and configure the API key.
 *
 * Distinct from the existing `us-company-data` capability which is SEC
 * EDGAR only (~13k US public filers). Cobalt covers all 50 states' SoS
 * registries (~33M+ private LLCs/corporations).
 *
 * Two input modes:
 *   1. company_id + state: SoS-issued business ID (registration number)
 *   2. company_name + state: name search; returns ranked candidates
 */

const COBALT_API = "https://apigateway.cobaltintelligence.com/v1";

registerCapability("us-company-data-cobalt", async (input: CapabilityInput) => {
  const apiKey = process.env.COBALT_API_KEY;
  if (!apiKey) {
    throw new Error(
      "COBALT_API_KEY is required for US company-data lookups. Sign up at https://cobaltintelligence.com and configure the API key.",
    );
  }

  const companyId = ((input.company_id as string) ?? (input.business_id as string) ?? "").trim();
  const companyName = ((input.company_name as string) ?? (input.business_name as string) ?? "").trim();
  const state = ((input.state as string) ?? "").trim().toUpperCase();

  if (!companyId && !companyName) {
    throw new Error("'company_id' or 'company_name' is required.");
  }
  if (!state || state.length !== 2) {
    throw new Error("'state' is required (2-letter US state code, e.g. \"CA\").");
  }

  const headers = {
    "x-api-key": apiKey,
    Accept: "application/json",
  };

  const endpoint = companyId
    ? `${COBALT_API}/search?searchQuery=${encodeURIComponent(companyId)}&state=${state}&liveData=true`
    : `${COBALT_API}/search?searchQuery=${encodeURIComponent(companyName)}&state=${state}&liveData=true`;

  const res = await fetch(endpoint, {
    headers,
    signal: AbortSignal.timeout(20000),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(`Cobalt rejected the API key (HTTP ${res.status}). Verify COBALT_API_KEY.`);
  }
  if (res.status === 404) {
    return {
      output: {
        found: false,
        company_name: companyName || null,
        company_id: companyId || null,
        state,
        status: null,
        entity_type: null,
        formed_date: null,
        address: null,
        registered_agent: null,
        officers: [],
        filings: [],
        data_source: "Cobalt Intelligence (50-state SoS live)",
      },
      provenance: { source: "cobaltintelligence.com", fetched_at: new Date().toISOString() },
    };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Cobalt returned HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as any;
  // Cobalt typically returns a results array; first match is canonical
  const result = Array.isArray(data) ? data[0] : data.results?.[0] ?? data;

  if (!result) {
    return {
      output: {
        found: false,
        company_name: companyName || null,
        company_id: companyId || null,
        state,
        status: null,
        entity_type: null,
        formed_date: null,
        address: null,
        registered_agent: null,
        officers: [],
        filings: [],
        data_source: "Cobalt Intelligence (50-state SoS live)",
      },
      provenance: { source: "cobaltintelligence.com", fetched_at: new Date().toISOString() },
    };
  }

  return {
    output: {
      found: true,
      company_name: result.title ?? result.businessName ?? result.name ?? null,
      company_id: result.sosId ?? result.entityId ?? result.businessId ?? companyId ?? null,
      state,
      status: result.status ?? result.businessStatus ?? null,
      entity_type: result.businessType ?? result.entityType ?? null,
      formed_date: result.formedDate ?? result.registrationDate ?? null,
      address:
        result.address ??
        (result.principalAddress ? Object.values(result.principalAddress).filter(Boolean).join(", ") : null),
      registered_agent: result.registeredAgent ?? result.agent ?? null,
      officers: Array.isArray(result.officers) ? result.officers : [],
      filings: Array.isArray(result.filings) ? result.filings.slice(0, 25) : [],
      sos_url: result.sosUrl ?? null,
      data_source: "Cobalt Intelligence (50-state SoS live)",
    },
    provenance: {
      source: "cobaltintelligence.com",
      fetched_at: new Date().toISOString(),
      acquisition_method: "vendor_aggregation" as const,
      upstream_vendor: "cobaltintelligence.com",
      attribution: "Data sourced live from US Secretary of State portals via Cobalt Intelligence",
    },
  };
});
