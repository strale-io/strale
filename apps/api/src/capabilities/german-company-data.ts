import { registerCapability, type CapabilityInput } from "./index.js";
import { searchNorthdata } from "./lib/northdata.js";

/**
 * German Company Data — northdata.com JSON-LD extraction
 *
 * Uses shared northdata module. Accepts HRB/HRA registration numbers
 * or company names. northdata.com has comprehensive German Handelsregister
 * coverage with structured JSON-LD data.
 */

registerCapability("german-company-data", async (input: CapabilityInput) => {
  const raw = (input.hrb_number as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'hrb_number' or 'company_name' is required. Provide a Handelsregister number (e.g. HRB 86891) or company name.");
  }

  const companyName = (input.company_name as string) ?? null;
  const regNumber = (input.hrb_number as string) ?? null;
  const output = await searchNorthdata(raw.trim(), "Germany", { company_name: companyName, registration_number: regNumber }) as unknown as Record<string, unknown>;

  return {
    output,
    provenance: {
      source: "northdata.com",
      fetched_at: new Date().toISOString(),
    },
  };
});
