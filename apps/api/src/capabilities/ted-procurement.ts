import { registerCapability, type CapabilityInput } from "./index.js";

// TED (Tenders Electronic Daily) — EU public procurement data
// Uses the TED search API at ted.europa.eu

const TED_SEARCH_URL = "https://ted.europa.eu/api/v3.0/notices/search";

interface TedSearchParams {
  keyword: string;
  country?: string;
  cpv_code?: string;
}

async function searchTed(params: TedSearchParams): Promise<Record<string, unknown>[]> {
  // Build TED query
  const queryParts: string[] = [];

  // Full-text search
  if (params.keyword) {
    queryParts.push(`"${params.keyword}"`);
  }

  const searchParams = new URLSearchParams({
    q: queryParts.join(" AND "),
    pageSize: "10",
    pageNum: "1",
    scope: "3", // Active notices
  });

  if (params.country) {
    searchParams.set("country", params.country.toUpperCase());
  }
  if (params.cpv_code) {
    searchParams.set("cpv", params.cpv_code);
  }

  // TED API — try the public search endpoint
  // If the v3 API requires auth, fall back to scraping the search page
  const url = `${TED_SEARCH_URL}?${searchParams}`;

  let data: any;
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Strale/1.0 ted-procurement",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (response.ok) {
      data = await response.json();
    }
  } catch {
    // API might not be available, try alternative approach
  }

  // If API works, parse results
  if (data?.results || data?.notices) {
    const notices = data.results || data.notices || [];
    return notices.slice(0, 10).map((n: any) => ({
      title: n.title?.textValue || n.title || "",
      contracting_authority: n.buyerName || n.contractingAuthority || "",
      value_estimate: n.estimatedValue || n.totalValue || null,
      currency: n.currency || "EUR",
      deadline: n.submissionDeadline || n.deadline || null,
      cpv_codes: n.cpvCodes || [],
      publication_date: n.publicationDate || n.datePublished || null,
      country: n.country || "",
      link: n.documentNumber
        ? `https://ted.europa.eu/en/notice/-/${n.documentNumber}`
        : n.link || null,
    }));
  }

  // Fallback: use TED's older search format
  const fallbackUrl = `https://ted.europa.eu/api/v2.0/notices/search?q=${encodeURIComponent(params.keyword)}&pageSize=10&pageNum=1`;
  const fallbackResponse = await fetch(fallbackUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Strale/1.0 ted-procurement",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!fallbackResponse.ok) {
    // Last resort: query the RSS feed
    const rssUrl = `https://ted.europa.eu/api/v3.0/notices/search?q=${encodeURIComponent(params.keyword)}&pageSize=10`;
    const rssResponse = await fetch(rssUrl, {
      headers: { Accept: "application/xml", "User-Agent": "Strale/1.0" },
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);

    if (!rssResponse || !rssResponse.ok) {
      throw new Error(
        `TED search failed. The TED API may be temporarily unavailable. Keyword: "${params.keyword}"`,
      );
    }

    const xml = await rssResponse.text();
    // Basic XML parsing for items
    const items: Record<string, unknown>[] = [];
    const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    for (const item of itemMatches.slice(0, 10)) {
      const title = item.match(/<title>([^<]*)<\/title>/)?.[1] || "";
      const link = item.match(/<link>([^<]*)<\/link>/)?.[1] || "";
      const pubDate = item.match(/<pubDate>([^<]*)<\/pubDate>/)?.[1] || "";
      items.push({
        title,
        contracting_authority: "",
        value_estimate: null,
        currency: "EUR",
        deadline: null,
        cpv_codes: [],
        publication_date: pubDate,
        country: params.country || "",
        link,
      });
    }
    return items;
  }

  const fallbackData = await fallbackResponse.json() as any;
  const notices = fallbackData?.results || fallbackData?.notices || [];
  return notices.slice(0, 10).map((n: any) => ({
    title: n.title || n.TI?.textValue || "",
    contracting_authority: n.buyerName || n.AA?.textValue || "",
    value_estimate: n.estimatedValue || null,
    currency: n.currency || "EUR",
    deadline: n.submissionDeadline || n.DT?.textValue || null,
    cpv_codes: n.cpvCodes || [],
    publication_date: n.publicationDate || n.PD?.textValue || null,
    country: n.country || n.CY?.textValue || "",
    link: n.documentNumber
      ? `https://ted.europa.eu/en/notice/-/${n.documentNumber}`
      : "",
  }));
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
