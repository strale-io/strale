import { registerCapability, type CapabilityInput } from "./index.js";
import { searchNorthdata } from "./lib/northdata.js";

/*
 * German Company Data — northdata.com JSON-LD extraction
 *
 * Bug fix causal chain (2026-04-10, Phase 2 — Understand):
 *
 * 1. German HRB/HRA registration numbers are per-court (Amtsgericht)
 *    namespaces, not globally unique. "HRB 44998" exists at 8+ different
 *    courts. Without specifying the court, a lookup is ambiguous and
 *    northdata returns an arbitrary match.
 *
 * 2. The original implementation missed this because test fixtures used
 *    HRB numbers that happened to return the expected company (either
 *    because the company dominated search results, or by chance of
 *    northdata's ranking). The fixture for HRB 6684 works because there
 *    is likely only one prominent match.
 *
 * 3. This is a silent failure: the capability returned a valid-looking
 *    result with company_name, address, status — all correct data, just
 *    for the wrong company. No error, no warning. The caller has no way
 *    to detect the mismatch unless they independently verify.
 *
 * Fix: require `court` (Registergericht) when `hrb_number` contains a
 * registration number pattern. Include court in the northdata search
 * query for disambiguation.
 */

const HRB_RE = /^(HRB|HRA|GnR|PR|VR)\s*\d+$/i;

registerCapability("german-company-data", async (input: CapabilityInput) => {
  const hrbNumber = (input.hrb_number as string)?.trim() ?? "";
  const companyName = (input.company_name as string)?.trim() ?? "";
  const court = (input.court as string)?.trim() ?? "";
  const task = (input.task as string)?.trim() ?? "";

  // Determine which input path we're on
  const raw = hrbNumber || companyName || task;
  if (!raw) {
    throw new Error("'hrb_number' or 'company_name' is required. Provide a Handelsregister number (e.g. HRB 86891) with court, or a company name.");
  }

  // Phase 1 containment: require court when a registration number is provided
  const isRegNumber = HRB_RE.test(hrbNumber || raw);
  if (isRegNumber && !court) {
    throw new Error(
      "German HRB/HRA numbers are not unique across courts. " +
      "'court' (Registergericht) is required when providing a registration number. " +
      "Example: { \"hrb_number\": \"HRB 2001\", \"court\": \"Amtsgericht Landsberg a. Lech\" }",
    );
  }

  // Build search query: include court for disambiguation
  const searchQuery = isRegNumber && court
    ? `${raw} ${court}`
    : raw;

  const output = await searchNorthdata(searchQuery, "Germany", {
    company_name: companyName || null,
    registration_number: isRegNumber ? (hrbNumber || raw) : null,
  }) as unknown as Record<string, unknown>;

  // Add court_used to output for transparency
  if (court) {
    output.court_used = court;
  }

  return {
    output,
    provenance: {
      source: "northdata.com",
      fetched_at: new Date().toISOString(),
    },
  };
});
