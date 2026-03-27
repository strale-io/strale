import { registerCapability, type CapabilityInput } from "./index.js";

const DILISENSE_MEDIA_API = "https://api.dilisense.com/v1/media";
const DILISENSE_FALLBACK_KEY = "eKYn3FpyoYQaQvRWd83Q2P3XzNi0n7ifblts8kHK";

const COMPANY_SUFFIXES = /\b(AB|AS|Ltd|LLC|Inc|GmbH|SA|BV|NV|Oy|Oyj|PLC|Corp|AG|SE|SRL|Srl|KG|ApS|HB|KB|ANS|DA|ehf|hf|Tbk|Bhd|Pte|Pty|Co|SAS|SARL|SpA|EIRL|OÜ|SIA|UAB|d\.o\.o|s\.r\.o|a\.s)\b\.?/i;

function looksLikeCompany(name: string): boolean {
  return COMPANY_SUFFIXES.test(name);
}

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

const RISK_CATEGORIES = ["financial_crime", "organized_crime", "terrorism"] as const;

function computeRiskLevel(data: DilisenseMediaResponse): "none" | "low" | "medium" | "high" {
  if (data.total_hits === 0) return "none";

  const severeHits = RISK_CATEGORIES.reduce((sum, cat) => {
    return sum + (data.news_exposures[cat]?.hits ?? 0);
  }, 0);

  if (severeHits === 0) return "low";
  if (RISK_CATEGORIES.some((cat) => (data.news_exposures[cat]?.hits ?? 0) >= 10)) return "high";
  return "medium";
}

function extractTopArticles(data: DilisenseMediaResponse, limit: number): Array<{
  headline: string;
  source_link: string;
  timestamp: string;
  language: string;
  category: string;
}> {
  const articles: Array<{
    headline: string;
    source_link: string;
    timestamp: string;
    language: string;
    category: string;
  }> = [];

  for (const [catName, exposure] of Object.entries(data.news_exposures)) {
    if (!exposure.articles) continue;
    for (const article of exposure.articles) {
      articles.push({
        headline: article.headline,
        source_link: article.source_link,
        timestamp: article.timestamp,
        language: article.language,
        category: catName,
      });
    }
  }

  // Sort by timestamp descending (most recent first)
  articles.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return articles.slice(0, limit);
}

registerCapability("adverse-media-check", async (input: CapabilityInput) => {
  const name = (
    (input.name as string) ??
    (input.entity_name as string) ??
    (input.entity as string) ??
    (input.subject as string) ??
    ""
  ).trim();
  if (!name) {
    throw new Error("'name' is required. Provide a person or company name to screen.");
  }

  const entityTypeOverride = (input.entity_type as string) ?? undefined;
  const apiKey = process.env.DILISENSE_API_KEY || DILISENSE_FALLBACK_KEY;

  const isCompany = entityTypeOverride === "company" ||
    (entityTypeOverride !== "person" && looksLikeCompany(name));
  const endpoint = isCompany ? "checkEntity" : "checkIndividual";

  // Date 1 year ago in yyyy-mm-dd format
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const startDate = oneYearAgo.toISOString().slice(0, 10);

  try {
    const params = new URLSearchParams({
      names: name,
      fetch_articles: "true",
      start_date: startDate,
    });

    const url = `${DILISENSE_MEDIA_API}/${endpoint}?${params.toString()}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(20000),
    });

    if (res.ok) {
      const data = (await res.json()) as DilisenseMediaResponse;

      const riskLevel = computeRiskLevel(data);
      const topArticles = extractTopArticles(data, 10);

      const categories: Record<string, number> = {};
      const categoriesFound: string[] = [];
      for (const [catName, exposure] of Object.entries(data.news_exposures)) {
        categories[catName] = exposure.hits;
        if (exposure.hits > 0) categoriesFound.push(catName);
      }

      const now = new Date().toISOString();
      return {
        output: {
          query: name,
          risk_level: riskLevel,
          total_hits: data.total_hits,
          categories,
          categories_found: categoriesFound,
          top_articles: topArticles,
          screened_at: now,
          period: "last 12 months",
        },
        provenance: { source: "dilisense.com", fetched_at: now },
      };
    }

    console.error(`[adverse-media-check] dilisense: HTTP ${res.status} ${res.statusText}`);
  } catch (err) {
    console.error("[adverse-media-check] dilisense:", err instanceof Error ? err.message : err);
  }

  // Fallback: return unknown risk (no LLM fallback for media screening)
  const now = new Date().toISOString();
  return {
    output: {
      query: name,
      risk_level: "unknown",
      total_hits: null,
      categories: null,
      categories_found: [],
      top_articles: [],
      screened_at: now,
      period: "last 12 months",
      note: "Adverse media screening could not be completed — API unavailable. Retry later or check manually.",
    },
    provenance: { source: "dilisense.com", fetched_at: now },
  };
});
