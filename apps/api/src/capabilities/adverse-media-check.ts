import { inputRefusal } from "../lib/capability-refusal.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import { meteredVendorFetch } from "../lib/metered-vendor-fetch.js";
import { resolveSerperLinks, usableResultUrl } from "../lib/serper-links.js";
import { logError } from "../lib/log.js";

/**
 * Adverse media screening via Dilisense (primary) + Serper Google search (fallback).
 *
 * Dilisense provides structured media intelligence with pre-categorized results.
 * Serper fallback: Google search with adverse media keywords, keyword-based
 * category classification. Explicit source attribution — never silent.
 *
 * No LLM fallback. If both fail, throws hard error.
 */

const DILISENSE_MEDIA_API = "https://api.dilisense.com/v1/media";
const SERPER_API = "https://google.serper.dev/search";

const COMPANY_SUFFIXES = /\b(AB|AS|Ltd|LLC|Inc|GmbH|SA|BV|NV|Oy|Oyj|PLC|Corp|AG|SE|SRL|Srl|KG|ApS|HB|KB|ANS|DA|ehf|hf|Tbk|Bhd|Pte|Pty|Co|SAS|SARL|SpA|EIRL|OÜ|SIA|UAB|d\.o\.o|s\.r\.o|a\.s)\b\.?/i;

function looksLikeCompany(name: string): boolean {
  return COMPANY_SUFFIXES.test(name);
}

// Documented thresholds — kept in sync with computeRiskLevel(). Surfaced in output
// so a compliance reviewer can see the rule used to assign a risk_level to a payee.
const RISK_LEVEL_THRESHOLDS = {
  none: "total_hits == 0",
  low: "total_hits > 0 AND no hits in severe categories (financial_crime, organized_crime, terrorism, violent_crime)",
  medium: "1+ hits in any severe category",
  high: "10+ hits in any single severe category",
} as const;

const DILISENSE_LISTS_QUERIED = {
  collection: "dilisense/adverse-media",
  source_count: 235000,
  version: null as string | null,
  last_updated_at: null as string | null,
} as const;

const SERPER_LISTS_QUERIED = {
  collection: "google-serper",
  source_count: null as number | null,
  version: null as string | null,
  last_updated_at: null as string | null,
} as const;

// ─── Dilisense types ────────────────────────────────────────────────────────

interface MediaArticle {
  timestamp: string;
  language: string;
  headline: string;
  source_link: string;
  body: string;
}

interface NewsExposure {
  category: string;
  hits: number;
  articles?: MediaArticle[];
}

interface DilisenseMediaResponse {
  timestamp: string;
  total_hits: number;
  news_exposures: Record<string, NewsExposure>;
}

// ─── Shared risk computation ────────────────────────────────────────────────

const SEVERE_CATEGORIES = ["financial_crime", "organized_crime", "terrorism", "violent_crime"] as const;

function computeRiskLevel(categories: Record<string, number>, totalHits: number): "none" | "low" | "medium" | "high" {
  if (totalHits === 0) return "none";
  const severeHits = SEVERE_CATEGORIES.reduce((sum, cat) => sum + (categories[cat] ?? 0), 0);
  if (severeHits === 0) return "low";
  if (SEVERE_CATEGORIES.some((cat) => (categories[cat] ?? 0) >= 10)) return "high";
  return "medium";
}

// ─── Serper keyword classification ──────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  violent_crime: ["murder", "assault", "violence", "killed", "shooting", "attack"],
  terrorism: ["terror", "extremis", "radical", "bomb", "isis", "al-qaeda"],
  financial_crime: ["fraud", "embezzle", "launder", "bribe", "corrupt", "ponzi", "scam", "insider trading", "tax evasion"],
  regulatory: ["fine", "penalty", "regulator", "compliance", "violation", "sanction", "investigation", "enforcement", "lawsuit", "sued", "settlement"],
  organized_crime: ["cartel", "trafficking", "smuggl", "mafia", "organized crime", "racket"],
  political: ["political", "lobby", "campaign finance", "donation scandal"],
};

function classifyArticle(title: string, snippet: string): string {
  const text = `${title} ${snippet}`.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) return category;
  }
  return "other";
}

// ─── Dilisense path ─────────────────────────────────────────────────────────

async function queryDilisense(
  name: string,
  isCompany: boolean,
  apiKey: string,
): Promise<{
  output: Record<string, unknown>;
  provenance: { source: string; fetched_at: string; acquisition_method: "vendor_api"; upstream_vendor: string };
} | null> {
  const endpoint = isCompany ? "checkEntity" : "checkIndividual";
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const startDate = oneYearAgo.toISOString().slice(0, 10);

  const params = new URLSearchParams({ names: name, fetch_articles: "true", start_date: startDate });
  const url = `${DILISENSE_MEDIA_API}/${endpoint}?${params}`;

  const res = await meteredVendorFetch("dilisense", url, {
    method: "GET",
    headers: { "x-api-key": apiKey },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const status = res.status;
    // 4xx validation errors should propagate, not trigger fallback
    if (status >= 400 && status < 500 && status !== 429) {
      throw new Error(`Dilisense validation error: HTTP ${status}`);
    }
    // 429 (quota) or 5xx → return null to trigger fallback
    return null;
  }

  const data = (await res.json()) as DilisenseMediaResponse;
  const categories: Record<string, number> = {};
  const categoriesFound: string[] = [];

  for (const [catName, exposure] of Object.entries(data.news_exposures)) {
    categories[catName] = exposure.hits;
    if (exposure.hits > 0) categoriesFound.push(catName);
  }

  // Extract top articles
  const allArticles: Array<{ headline: string; source_link: string; timestamp: string; language: string; category: string }> = [];
  for (const [catName, exposure] of Object.entries(data.news_exposures)) {
    for (const article of exposure.articles ?? []) {
      allArticles.push({ headline: article.headline, source_link: article.source_link, timestamp: article.timestamp, language: article.language, category: catName });
    }
  }
  allArticles.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const now = new Date().toISOString();
  return {
    output: {
      query: name,
      risk_level: computeRiskLevel(categories, data.total_hits),
      risk_level_thresholds: RISK_LEVEL_THRESHOLDS,
      total_hits: data.total_hits,
      categories,
      categories_found: categoriesFound,
      severe_categories: SEVERE_CATEGORIES,
      top_articles: allArticles.slice(0, 10),
      lists_queried: DILISENSE_LISTS_QUERIED,
      screened_at: now,
      period: "last 12 months",
      source: "dilisense",
    },
    provenance: { source: "dilisense.com", fetched_at: now, acquisition_method: "vendor_api", upstream_vendor: "dilisense" },
  };
}

// ─── Serper fallback path ───────────────────────────────────────────────────

async function querySerper(
  name: string,
  serperKey: string,
  fallbackReason: string,
): Promise<{
  output: Record<string, unknown>;
  provenance: { source: string; fetched_at: string; acquisition_method: "vendor_api"; upstream_vendor: string };
}> {
  // Search for adverse media: company name + risk keywords
  const query = `"${name}" (fraud OR sanctions OR investigation OR lawsuit OR regulatory OR penalty)`;

  const res = await meteredVendorFetch("serper", SERPER_API, {
    method: "POST",
    headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 20, tbs: "qdr:y" }), // last year
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Serper API error: HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    organic?: Array<{ title: string; link: string; snippet: string; date?: string }>;
  };

  // Google wraps every organic link past the top three in an opaque
  // `google.com/goto` redirect (2026-10-30), and Serper passes it through.
  // On a screening output that matters more than elsewhere: `source_link` is
  // what a compliance reviewer follows to check the hit, and a redirect is
  // not auditable evidence.
  const resolution = await resolveSerperLinks(data, serperKey);
  const results = data.organic ?? [];

  // Classify each result by category
  const categories: Record<string, number> = {};
  const topArticles: Array<{
    headline: string;
    source_link: string | null;
    source_link_unresolved: boolean;
    timestamp: string | null;
    language: string | null;
    category: string;
  }> = [];

  for (const r of results) {
    const category = classifyArticle(r.title, r.snippet);
    categories[category] = (categories[category] ?? 0) + 1;
    // Serper does not return article publication date or language; emit null rather than fabricate (DEC-20260428-B).
    // The finding is kept either way. Dropping a hit because its link is
    // opaque would understate the risk on a screening output, which is the
    // worse failure here; an unopenable URL presented as a source is the
    // other. So the article stays, counted in `total_hits` and in its
    // category, and the link is reported absent rather than wrong
    // (DEC-20260428-B: never assert what the input does not support).
    topArticles.push({
      headline: r.title,
      source_link: usableResultUrl(r.link),
      source_link_unresolved: usableResultUrl(r.link) === null,
      timestamp: r.date ?? null,
      language: null,
      category,
    });
  }

  const totalHits = results.length;
  const categoriesFound = Object.entries(categories).filter(([, v]) => v > 0).map(([k]) => k);

  const now = new Date().toISOString();
  return {
    output: {
      query: name,
      risk_level: computeRiskLevel(categories, totalHits),
      risk_level_thresholds: RISK_LEVEL_THRESHOLDS,
      total_hits: totalHits,
      categories,
      categories_found: categoriesFound,
      severe_categories: SEVERE_CATEGORIES,
      top_articles: topArticles.slice(0, 10),
      lists_queried: SERPER_LISTS_QUERIED,
      screened_at: now,
      period: "last 12 months",
      source: "serper",
      fallback_reason: fallbackReason,
      // Screening results whose source link Google would not let us open.
      // Nonzero means some `top_articles[].source_link` are null; the hits
      // themselves are still counted.
      unresolved_source_links: resolution.unresolved.length,
    },
    provenance: { source: "google-serper", fetched_at: now, acquisition_method: "vendor_api", upstream_vendor: "serper" },
  };
}

// ─── Capability registration ────────────────────────────────────────────────

registerCapability("adverse-media-check", async (input: CapabilityInput) => {
  const name = (
    (input.name as string) ??
    (input.entity_name as string) ??
    (input.entity as string) ??
    (input.subject as string) ??
    ""
  ).trim();
  if (!name) {
    throw inputRefusal("'name' is required. Provide a person or company name to screen.", "name", "Send 'name' as a person or company name with at least 2 characters.");
  }
  if (name.length < 2) {
    throw inputRefusal("Name must be at least 2 characters for adverse media screening.", "name", "Send 'name' as a person or company name with at least 2 characters.");
  }

  const entityTypeOverride = (input.entity_type as string) ?? undefined;
  const isCompany = entityTypeOverride === "company" ||
    (entityTypeOverride !== "person" && looksLikeCompany(name));

  // Primary: Dilisense
  const dilisenseKey = process.env.DILISENSE_API_KEY;
  if (dilisenseKey) {
    try {
      const result = await queryDilisense(name, isCompany, dilisenseKey);
      if (result) return result;
      // null = quota/5xx, fall through to Serper
    } catch (err) {
      // Validation errors propagate; other errors fall through
      if (err instanceof Error && err.message.includes("validation error")) throw err;
      logError("adverse-media-check-dilisense-failed", err);
    }
  }

  // Fallback: Serper Google search
  const serperKey = process.env.SERPER_API_KEY;
  if (serperKey) {
    try {
      const reason = !dilisenseKey ? "dilisense_key_missing" : "dilisense_unavailable";
      return await querySerper(name, serperKey, reason);
    } catch (err) {
      logError("adverse-media-check-serper-failed", err);
    }
  }

  // Both failed — hard error, no LLM fallback
  throw new Error("Adverse media screening unavailable: both Dilisense and Serper APIs failed. Configure DILISENSE_API_KEY or SERPER_API_KEY.");
});
