import { registerCapability, type CapabilityInput } from "./index.js";
import { searchNorthdata } from "./lib/northdata.js";

/**
 * Swiss Company Data — northdata.com JSON-LD extraction
 *
 * northdata.com covers Swiss companies via Zefix/commercial register data.
 * Replaces the previous Browserless+LLM scraper.
 */

registerCapability("swiss-company-data", async (input: CapabilityInput) => {
  const raw = (input.uid as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'uid' or 'company_name' is required. Provide a Swiss UID (CHE-xxx.xxx.xxx) or company name.");
  }

  const output = await searchNorthdata(raw.trim(), "Switzerland") as unknown as Record<string, unknown>;

  return {
    output,
    provenance: {
      source: "northdata.com (Swiss commercial register data)",
      fetched_at: new Date().toISOString(),
    },
  };
});
