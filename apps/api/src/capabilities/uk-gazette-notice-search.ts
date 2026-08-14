import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * UK Gazette insolvency notice search — official, free, no-key API.
 *
 * The Gazette (thegazette.co.uk) is the UK's official public record, Crown
 * Copyright, published under the Open Government Licence. The "insolvency"
 * service scope covers both corporate insolvency notices (winding-up,
 * liquidator appointments, creditors' meetings) and personal insolvency
 * notices (individual bankruptcy, debt relief orders) — a broader and more
 * primary-source view than a single company's insolvency case list.
 *
 * Complements insolvency-check.ts (which answers "does company X have open
 * insolvency proceedings?" via the Companies House case API, scoped to a
 * known company number). This capability searches the underlying statutory
 * notice text directly — useful when the subject is an individual (personal
 * bankruptcy, a director rather than a company), when no company number is
 * known yet, or when the richer notice text (practitioner names, meeting
 * dates, judgment references) is needed rather than a structured case list.
 *
 * API docs: https://github.com/TheGazette/DevDocs
 */

const GAZETTE_BASE = "https://www.thegazette.co.uk/insolvency/notice/data.json";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface GazetteEntry {
  id?: string;
  title?: string;
  published?: string;
  category?: { "@term"?: string };
  "f:notice-code"?: string;
  content?: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function extractNoticeId(id: string | undefined): string | null {
  if (!id) return null;
  const parts = id.split("/");
  return parts[parts.length - 1] || null;
}

function extractCompanyNumber(text: string): string | null {
  const m = text.match(/Company Number:?\s*([A-Z0-9]{6,8})/i);
  return m ? m[1].toUpperCase() : null;
}

registerCapability("uk-gazette-notice-search", async (input: CapabilityInput) => {
  const query = ((input.query as string) ?? (input.text as string) ?? (input.task as string) ?? "").trim();
  if (query.length < 2) {
    throw new Error("'query' is required (minimum 2 characters). Provide a company or individual name to search UK Gazette insolvency notices.");
  }

  const dateFrom = (input.date_from as string)?.trim();
  const dateTo = (input.date_to as string)?.trim();
  if (dateFrom && !DATE_RE.test(dateFrom)) {
    throw new Error("'date_from' must be an ISO date (YYYY-MM-DD).");
  }
  if (dateTo && !DATE_RE.test(dateTo)) {
    throw new Error("'date_to' must be an ISO date (YYYY-MM-DD).");
  }

  const rawLimit = Number(input.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 50) : 10;

  const params = new URLSearchParams({
    text: query,
    "results-page-size": String(limit),
  });
  if (dateFrom) params.set("start-publish-date", dateFrom);
  if (dateTo) params.set("end-publish-date", dateTo);

  const url = `${GAZETTE_BASE}?${params.toString()}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`The Gazette API returned HTTP ${response.status}.`);
  }

  const data = (await response.json()) as any;
  const total = Number(data?.["f:total"]) || 0;
  const entries: GazetteEntry[] = Array.isArray(data?.entry) ? data.entry : data?.entry ? [data.entry] : [];

  const notices = entries.map((entry) => {
    const noticeId = extractNoticeId(entry.id);
    const contentText = entry.content ? stripHtml(entry.content) : "";
    return {
      notice_id: noticeId,
      title: entry.title ?? null,
      category: entry.category?.["@term"] ?? null,
      notice_code: entry["f:notice-code"] ?? null,
      published_date: entry.published ?? null,
      summary: contentText ? contentText.slice(0, 500) : null,
      company_number: contentText ? extractCompanyNumber(contentText) : null,
      url: noticeId ? `https://www.thegazette.co.uk/notice/${noticeId}` : null,
    };
  });

  return {
    output: {
      query: {
        text: query,
        date_from: dateFrom || null,
        date_to: dateTo || null,
      },
      total_matches: total,
      returned_count: notices.length,
      notices,
    },
    provenance: {
      source: "thegazette.co.uk",
      fetched_at: new Date().toISOString(),
      upstream_vendor: "The Gazette (His Majesty's Stationery Office / TSO)",
      acquisition_method: "official_api",
      primary_source_reference: "https://www.thegazette.co.uk/insolvency",
    },
  };
});
