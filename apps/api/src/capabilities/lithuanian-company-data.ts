import { registerCapability, type CapabilityInput } from "./index.js";
import { searchNorthdata } from "./lib/northdata.js";

/**
 * Lithuanian Company Data — northdata.com JSON-LD extraction
 *
 * northdata.com covers Lithuanian companies. Replaces the previous
 * Browserless+LLM scraper that was failing on rekvizitai.vz.lt.
 */

registerCapability("lithuanian-company-data", async (input: CapabilityInput) => {
  const raw = (input.company_code as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'company_code' or 'company_name' is required. Provide a Lithuanian company code or company name.");
  }

  const companyName = (input.company_name as string) ?? null;
  const companyCode = (input.company_code as string) ?? null;
  const output = await searchNorthdata(raw.trim(), "Lithuania", { company_name: companyName, registration_number: companyCode }) as unknown as Record<string, unknown>;

  return {
    output,
    provenance: {
      source: "northdata.com (Lithuanian registry data)",
      fetched_at: new Date().toISOString(),
    },
  };
});
