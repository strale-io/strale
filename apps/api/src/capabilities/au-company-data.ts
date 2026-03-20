import { registerCapability, type CapabilityInput } from "./index.js";

// Australian Business Register (ABR) — free government API
// Requires ABR_AUTH_GUID env var (register at https://abr.business.gov.au/Tools/WebServices)
const ABR_API =
  "https://abr.business.gov.au/abrxmlsearch/AbrXmlSearch.asmx/ABRSearchByABN";

// ABN: 11 digits
const ABN_RE = /^\d{11}$/;

function cleanAbn(input: string): string | null {
  const cleaned = input.replace(/[\s-]/g, "");
  return ABN_RE.test(cleaned) ? cleaned : null;
}

function getGuid(): string {
  const guid = process.env.ABR_AUTH_GUID;
  if (!guid) {
    throw new Error(
      "ABR_AUTH_GUID is required. Register at https://abr.business.gov.au/Tools/WebServices",
    );
  }
  return guid;
}

/** Extract text content between XML tags. Returns null if not found. */
function xmlTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() || null : null;
}

/** Extract a block between opening and closing tags (including nested content). */
function xmlBlock(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[0] : null;
}

/** Extract all blocks matching a tag. */
function xmlBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "gi");
  return xml.match(re) || [];
}

function parseAbrResponse(xml: string): Record<string, unknown> {
  // Check for exception
  const exception = xmlBlock(xml, "exception");
  if (exception) {
    const desc = xmlTag(exception, "exceptionDescription");
    if (desc) throw new Error(`ABR API error: ${desc}`);
  }

  const response = xmlBlock(xml, "response");
  if (!response) throw new Error("Invalid ABR response: no <response> element");

  const businessEntity =
    xmlBlock(response, "businessEntity201408") ??
    xmlBlock(response, "businessEntity200709") ??
    xmlBlock(response, "businessEntity200506") ??
    xmlBlock(response, "businessEntity");
  if (!businessEntity) {
    throw new Error("ABN not found or invalid.");
  }

  // ABN
  const abnBlock = xmlBlock(businessEntity, "ABN");
  const abn = abnBlock ? xmlTag(abnBlock, "identifierValue") : null;

  // ASICNumber (ACN)
  const acn = xmlTag(businessEntity, "ASICNumber") || null;

  // Entity status
  const statusBlock = xmlBlock(businessEntity, "entityStatus");
  const statusCode = statusBlock
    ? xmlTag(statusBlock, "entityStatusCode")
    : null;
  const effectiveFrom = statusBlock
    ? xmlTag(statusBlock, "effectiveFrom")
    : null;

  // Entity type
  const typeBlock = xmlBlock(businessEntity, "entityType");
  const entityType = typeBlock
    ? xmlTag(typeBlock, "entityDescription")
    : null;

  // Company name — try mainName, then mainTradingName, then legalName
  let companyName: string | null = null;
  const mainNameBlock = xmlBlock(businessEntity, "mainName");
  if (mainNameBlock) {
    companyName = xmlTag(mainNameBlock, "organisationName");
  }
  if (!companyName) {
    const tradingBlock = xmlBlock(businessEntity, "mainTradingName");
    if (tradingBlock) {
      companyName = xmlTag(tradingBlock, "organisationName");
    }
  }
  if (!companyName) {
    const legalBlock = xmlBlock(businessEntity, "legalName");
    if (legalBlock) {
      const given = xmlTag(legalBlock, "givenName") ?? "";
      const family = xmlTag(legalBlock, "familyName") ?? "";
      companyName = [given, family].filter(Boolean).join(" ") || null;
    }
  }

  // Physical address
  const addrBlock = xmlBlock(businessEntity, "mainBusinessPhysicalAddress");
  const state = addrBlock ? xmlTag(addrBlock, "stateCode") : null;
  const postcode = addrBlock ? xmlTag(addrBlock, "postcode") : null;

  // GST registration
  const gstBlocks = xmlBlocks(businessEntity, "goodsAndServicesTax");
  let gstRegistered = false;
  for (const gst of gstBlocks) {
    const effectiveTo = xmlTag(gst, "effectiveTo");
    // Active GST = no effectiveTo or effectiveTo is "0001-01-01" (meaning still active)
    if (!effectiveTo || effectiveTo === "0001-01-01") {
      gstRegistered = true;
      break;
    }
  }

  // Business/trading names
  const businessNames: string[] = [];
  const bnBlocks = xmlBlocks(businessEntity, "businessName");
  for (const bn of bnBlocks) {
    const name = xmlTag(bn, "organisationName");
    if (name) businessNames.push(name);
  }

  return {
    company_name: companyName ?? "Unknown",
    abn: abn ?? "",
    acn: acn && acn !== "0" ? acn : null,
    status: statusCode ?? "Unknown",
    entity_type: entityType ?? null,
    state: state ?? null,
    postcode: postcode ?? null,
    gst_registered: gstRegistered,
    business_names: businessNames.length > 0 ? businessNames : null,
    last_updated: effectiveFrom ?? null,
    data_source: "Australian Business Register (ABR)",
    data_source_url: "https://abr.business.gov.au/",
    retrieved_at: new Date().toISOString(),
  };
}

registerCapability("au-company-data", async (input: CapabilityInput) => {
  const rawInput =
    (input.abn as string) ?? (input.task as string) ?? "";
  if (typeof rawInput !== "string" || !rawInput.trim()) {
    throw new Error(
      "'abn' is required. Provide an Australian Business Number (11 digits).",
    );
  }

  const abn = cleanAbn(rawInput.trim());
  if (!abn) {
    throw new Error(
      `Invalid ABN format: "${rawInput.trim()}". ABN must be exactly 11 digits.`,
    );
  }

  const guid = getGuid();
  const url = `${ABR_API}?searchString=${abn}&includeHistoricalDetails=N&authenticationGuid=${encodeURIComponent(guid)}`;

  const response = await fetch(url, {
    headers: { Accept: "application/xml" },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`ABR API returned HTTP ${response.status}`);
  }

  const xml = await response.text();
  const output = parseAbrResponse(xml);

  return {
    output,
    provenance: {
      source: "abr.business.gov.au",
      fetched_at: new Date().toISOString(),
    },
  };
});
