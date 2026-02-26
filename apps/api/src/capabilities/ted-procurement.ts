import { registerCapability, type CapabilityInput } from "./index.js";

// TED (Tenders Electronic Daily) — EU public procurement data
// Uses the TED v3 search API with expert query syntax
const TED_API = "https://api.ted.europa.eu/v3/notices/search";

const TED_FIELDS = [
  "notice-identifier",
  "publication-number",
  "publication-date",
  "notice-type",
  "title-proc",
  "description-proc",
  "classification-cpv",
  "organisation-country-buyer",
  "deadline-receipt-tender-date-lot",
];

interface TedSearchParams {
  keyword: string;
  country?: string;
  cpv_code?: string;
}

function buildExpertQuery(params: TedSearchParams): string {
  const parts: string[] = [];

  // Full-text search on title and description
  const kw = params.keyword.replace(/"/g, '\\"');
  parts.push(`title-proc ~ "${kw}" OR description-proc ~ "${kw}"`);

  if (params.country) {
    parts.push(`organisation-country-buyer = "${params.country.toUpperCase()}"`);
  }

  if (params.cpv_code) {
    parts.push(`classification-cpv = "${params.cpv_code}"`);
  }

  if (parts.length === 1) return parts[0];
  // Wrap the text search in parens and AND the filters
  return `(${parts[0]})${parts.slice(1).map((p) => ` AND ${p}`).join("")}`;
}

async function searchTed(params: TedSearchParams): Promise<Record<string, unknown>[]> {
  const query = buildExpertQuery(params);

  const response = await fetch(TED_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      query,
      limit: 10,
      page: 1,
      fields: TED_FIELDS,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`TED API returned HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as any;
  const notices = data?.notices || [];

  return notices.map((n: any) => {
    // title-proc is a map of language codes to strings — pick English or first
    const titleMap = n["title-proc"] || {};
    const title = titleMap["eng"] || titleMap["ENG"] || Object.values(titleMap)[0] || "";

    const descMap = n["description-proc"] || {};
    const description = descMap["eng"] || descMap["ENG"] || Object.values(descMap)[0] || "";

    const pubNumber = n["publication-number"] || "";

    return {
      title,
      description: typeof description === "string" ? description.slice(0, 500) : "",
      notice_type: n["notice-type"] || "",
      cpv_codes: n["classification-cpv"] || [],
      publication_date: n["publication-date"] || null,
      publication_number: pubNumber,
      country: (n["organisation-country-buyer"] || [])[0] || "",
      deadline: (n["deadline-receipt-tender-date-lot"] || [])[0] || null,
      link: pubNumber
        ? `https://ted.europa.eu/en/notice/-/detail/${pubNumber}`
        : null,
    };
  });
}

registerCapability("ted-procurement", async (input: CapabilityInput) => {
  const keyword = (input.keyword as string) ?? (input.task as string) ?? "";
  if (typeof keyword !== "string" || !keyword.trim()) {
    throw new Error("'keyword' is required. Provide a search term for EU procurement tenders.");
  }

  const country = input.country as string | undefined;
  const cpvCode = input.cpv_code as string | undefined;

  const results = await searchTed({
    keyword: keyword.trim(),
    country: country?.trim(),
    cpv_code: cpvCode?.trim(),
  });

  return {
    output: {
      query: {
        keyword: keyword.trim(),
        country: country || null,
        cpv_code: cpvCode || null,
      },
      result_count: results.length,
      tenders: results,
    },
    provenance: {
      source: "ted.europa.eu",
      fetched_at: new Date().toISOString(),
    },
  };
});
