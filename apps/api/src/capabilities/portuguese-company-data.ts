import { registerCapability, type CapabilityInput } from "./index.js";
import { searchNorthdata } from "./lib/northdata.js";

/**
 * Portuguese Company Data — northdata.com JSON-LD extraction
 *
 * northdata.com covers Portuguese companies. Replaces the previous
 * Browserless+LLM scraper that was failing on racius.com.
 */

registerCapability("portuguese-company-data", async (input: CapabilityInput) => {
  const raw = (input.nipc as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'nipc' or 'company_name' is required. Provide a Portuguese NIPC number or company name.");
  }

  const output = await searchNorthdata(raw.trim(), "Portugal") as unknown as Record<string, unknown>;

  return {
    output,
    provenance: {
      source: "northdata.com (Portuguese registry data)",
      fetched_at: new Date().toISOString(),
    },
  };
});
