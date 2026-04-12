import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";
import { searchNorthdata } from "./lib/northdata.js";

/*
 * German Company Data — northdata.com JSON-LD extraction
 *
 * Accepts company name (e.g. "BMW", "Siemens"), HRB number + court,
 * or any natural-language input. Abbreviations are expanded to full
 * legal names via LLM before searching northdata.com.
 *
 * Bug fix causal chain (2026-04-10):
 * - HRB/HRA numbers are per-court, not globally unique.
 * - northdata needs legal names, not abbreviations ("BMW" fails,
 *   "Bayerische Motoren Werke" succeeds).
 * - Fix (2026-04-12): LLM expands abbreviations before search.
 */

const HRB_RE = /^(HRB|HRA|GnR|PR|VR)\s*\d+$/i;

async function expandCompanyName(input: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return input; // fallback: use input as-is
  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 150,
    messages: [{
      role: "user",
      content: `You are looking up a German company. The user provided: "${input}"

If this is an abbreviation or short name (like "BMW", "VW", "SAP"), expand it to the full legal company name as registered in the German Handelsregister. Include the legal form suffix (AG, GmbH, SE, etc.).

If it's already a full legal name, return it as-is.

Return ONLY the company name, nothing else. No explanation.`,
    }],
  });
  const name = r.content[0].type === "text" ? r.content[0].text.trim().replace(/^["']|["']$/g, "") : "";
  return name || input;
}

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

  // Detect if someone put a company name in the hrb_number field
  const isRegNumber = HRB_RE.test(hrbNumber || raw);
  const isNameInHrbField = hrbNumber && !isRegNumber && !companyName;

  if (isRegNumber && !court) {
    throw new Error(
      "German HRB/HRA numbers are not unique across courts. " +
      "'court' (Registergericht) is required when providing a registration number. " +
      "Example: { \"hrb_number\": \"HRB 2001\", \"court\": \"Amtsgericht Landsberg a. Lech\" }",
    );
  }

  // For name searches, expand abbreviations to full legal names
  let searchQuery = raw;
  if (!isRegNumber) {
    const nameInput = isNameInHrbField ? hrbNumber : (companyName || task);
    searchQuery = await expandCompanyName(nameInput);
  } else if (court) {
    const courtCity = court.replace(/^Amtsgericht\s+/i, "").trim();
    searchQuery = `${raw} ${courtCity}`;
  }

  const output = await searchNorthdata(searchQuery, "Germany", {
    company_name: companyName || (isNameInHrbField ? hrbNumber : null),
    registration_number: isRegNumber ? (hrbNumber || raw) : null,
  }, court || undefined) as unknown as Record<string, unknown>;

  // Include court in output — either user-provided or auto-extracted from northdata
  if (court) {
    output.court = court;
  } else if (output.court) {
    // Court was auto-extracted from northdata HTML — keep it
  }

  return {
    output,
    provenance: {
      source: "northdata.com",
      fetched_at: new Date().toISOString(),
    },
  };
});
