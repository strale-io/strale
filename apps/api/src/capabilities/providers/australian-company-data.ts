/**
 * DataProvider chain for australian-company-data.
 *
 * Primary: ABN Lookup JSON API (abr.business.gov.au)
 *   - Free registration at https://abr.business.gov.au/Tools/AbnLookup
 *   - Returns structured JSON via the AbnDetails endpoint
 *   - Requires ABN_LOOKUP_GUID env var (free, unlimited)
 *
 * Fallback: Existing Browserless scraper
 *
 * Status: READY TO ACTIVATE — set ABN_LOOKUP_GUID env var in Railway
 */

import { registerChain } from "../../lib/data-provider.js";
import { getDirectExecutor } from "../index.js";

// ABN: 11 digits; ACN: 9 digits
const ABN_RE = /^\d{11}$/;
const ACN_RE = /^\d{9}$/;

function findAbn(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  if (ABN_RE.test(cleaned)) return cleaned;
  if (ACN_RE.test(cleaned)) return cleaned;
  const match = input.match(/\d{11}/);
  return match ? match[0] : null;
}

registerChain({
  capabilitySlug: "australian-company-data",
  providers: [
    {
      id: "abn-lookup-api",
      name: "Australian Business Register JSON API",
      type: "api",
      requiredEnvVars: ["ABN_LOOKUP_GUID"],
      requiredServices: [],
      expectedLatencyMs: 800,
      fetch: async (input) => {
        const guid = process.env.ABN_LOOKUP_GUID!;
        const raw = String(input.abn ?? input.company_name ?? input.task ?? "").trim();
        if (!raw) throw new Error("'abn' or 'company_name' is required.");

        const abn = findAbn(raw);
        if (!abn) {
          // Name search not supported by the JSON API — fall through to Browserless
          throw new Error("ABN Lookup API requires an ABN/ACN number, not a name search");
        }

        const url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${abn}&callback=_&guid=${guid}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

        if (!res.ok) throw new Error(`ABN Lookup API HTTP ${res.status}`);

        const text = await res.text();
        // Response is JSONP: _({...})
        const jsonStr = text.replace(/^_\(/, "").replace(/\)$/, "");
        const data = JSON.parse(jsonStr) as Record<string, unknown>;

        if (data.Message) {
          throw new Error(`ABN Lookup: ${data.Message}`);
        }

        const entityName = String(data.EntityName || "");
        const businessNames = (data.BusinessName as Array<{ Value: string }>) || [];

        return {
          output: {
            company_name: entityName || businessNames[0]?.Value || "",
            abn: String(data.Abn || abn),
            acn: String(data.Acn || ""),
            business_type: String(data.EntityTypeName || ""),
            status: String(data.AbnStatus || "").toLowerCase().includes("active") ? "active" : "inactive",
            status_effective_from: data.AbnStatusEffectiveFrom || null,
            address_state: data.AddressState || null,
            address_postcode: data.AddressPostcode || null,
            gst_registered: data.Gst != null,
            business_names: businessNames.map((b) => b.Value),
          },
          provenance: {
            source: "abr.business.gov.au",
            fetched_at: new Date().toISOString(),
          },
        };
      },
    },
    {
      id: "browserless-abr",
      name: "Browserless scrape of ABN Lookup (fallback)",
      type: "scraping",
      requiredServices: ["browserless"],
      fetch: async (input) => {
        const executor = getDirectExecutor("australian-company-data");
        if (!executor) throw new Error("No executor for australian-company-data");
        return executor(input);
      },
    },
  ],
});
