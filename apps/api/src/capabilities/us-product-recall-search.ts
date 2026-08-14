import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * US product recall search — CPSC (Consumer Product Safety Commission)
 * official Recalls API, hosted at saferproducts.gov. Free, no API key,
 * zero-auth REST endpoint returning JSON. Covers all US consumer product
 * recalls, including manufacturer, hazard, and remedy detail.
 *
 * Note: www.cpsc.gov itself sits behind bot protection that blocks
 * automated requests; the *api* host (saferproducts.gov) is the documented
 * public interface and is unaffected — see
 * https://www.cpsc.gov/Recalls/CPSC-Recalls-Application-Program-Interface-API-Information
 */

const CPSC_API = "https://www.saferproducts.gov/RestWebServices/Recall";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface CpscHazard {
  Name?: string;
}
interface CpscManufacturer {
  Name?: string;
}
interface CpscProduct {
  Name?: string;
  Model?: string;
  NumberOfUnits?: string;
}
interface CpscRecall {
  RecallID?: number;
  RecallNumber?: string;
  RecallDate?: string;
  Title?: string;
  Description?: string;
  URL?: string;
  Products?: CpscProduct[];
  Manufacturers?: CpscManufacturer[];
  Hazards?: CpscHazard[];
}

registerCapability("us-product-recall-search", async (input: CapabilityInput) => {
  const query = ((input.query as string) ?? (input.task as string) ?? "").trim();
  const manufacturer = (input.manufacturer as string)?.trim();
  if (!query && !manufacturer) {
    throw new Error("'query' (product/recall keyword) or 'manufacturer' is required.");
  }

  const dateFrom = (input.date_from as string)?.trim();
  const dateTo = (input.date_to as string)?.trim();
  if (dateFrom && !DATE_RE.test(dateFrom)) {
    throw new Error("'date_from' must be an ISO date (YYYY-MM-DD).");
  }
  if (dateTo && !DATE_RE.test(dateTo)) {
    throw new Error("'date_to' must be an ISO date (YYYY-MM-DD).");
  }

  const params = new URLSearchParams({ format: "json" });
  if (query) params.set("RecallTitle", query);
  if (manufacturer) params.set("Manufacturer", manufacturer);
  if (dateFrom) params.set("RecallDateStart", dateFrom);
  if (dateTo) params.set("RecallDateEnd", dateTo);

  const url = `${CPSC_API}?${params.toString()}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`CPSC recalls API returned HTTP ${response.status}.`);
  }

  const data = (await response.json()) as CpscRecall[];
  const recalls = (Array.isArray(data) ? data : []).slice(0, 25).map((r) => ({
    recall_id: r.RecallID ?? null,
    recall_number: r.RecallNumber ?? null,
    recall_date: r.RecallDate ?? null,
    title: r.Title ?? null,
    description: r.Description ? r.Description.slice(0, 500) : null,
    hazard: r.Hazards?.[0]?.Name ? r.Hazards[0].Name.slice(0, 300) : null,
    manufacturers: (r.Manufacturers ?? []).map((m) => m.Name).filter(Boolean),
    products: (r.Products ?? []).map((p) => ({
      name: p.Name ?? null,
      model: p.Model || null,
      units: p.NumberOfUnits ?? null,
    })),
    url: r.URL ?? null,
  }));

  return {
    output: {
      query: {
        text: query || null,
        manufacturer: manufacturer || null,
        date_from: dateFrom || null,
        date_to: dateTo || null,
      },
      result_count: recalls.length,
      recalls,
    },
    provenance: {
      source: "saferproducts.gov",
      fetched_at: new Date().toISOString(),
      upstream_vendor: "U.S. Consumer Product Safety Commission (CPSC)",
      acquisition_method: "official_api",
      primary_source_reference: "https://www.cpsc.gov/Recalls",
    },
  };
});
