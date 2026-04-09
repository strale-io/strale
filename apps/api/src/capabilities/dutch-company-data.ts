import { registerCapability, type CapabilityInput } from "./index.js";
import { searchNorthdata } from "./lib/northdata.js";

/**
 * Dutch Company Data — northdata.com JSON-LD extraction
 *
 * northdata.com has comprehensive coverage of Dutch companies via KVK
 * (Kamer van Koophandel) data. Replaces the previous Browserless+LLM
 * scraper that was failing to extract data from kvk.nl.
 */

registerCapability("dutch-company-data", async (input: CapabilityInput) => {
  const raw = (input.kvk_number as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'kvk_number' or 'company_name' is required. Provide a KVK number (8 digits) or company name.");
  }

  const companyName = (input.company_name as string) ?? null;
  const kvkNumber = (input.kvk_number as string) ?? null;
  const output = await searchNorthdata(raw.trim(), "Netherlands", { company_name: companyName, registration_number: kvkNumber }) as unknown as Record<string, unknown>;

  return {
    output,
    provenance: {
      source: "northdata.com (KVK data)",
      fetched_at: new Date().toISOString(),
    },
  };
});
