import { registerCapability, type CapabilityInput } from "./index.js";
import { meteredVendorFetch } from "../lib/metered-vendor-fetch.js";
import {
  deriveResultDomain,
  resolveSerperLinks,
  usableResultUrl,
} from "../lib/serper-links.js";
import { resolveCountryOrThrow } from "./lib/iso-3166.js";
import { resolveLanguageOrThrow } from "./lib/language-tag.js";

registerCapability("serp-analyze", async (input: CapabilityInput) => {
  const keyword = (
    (input.keyword as string) ??
    (input.query as string) ??
    (input.search as string) ??
    ""
  ).trim();
  if (!keyword) throw new Error("'keyword' is required. Provide a search query to analyze.");
  if (keyword.length < 2) throw new Error("'keyword' must be at least 2 characters.");

  // Validate before spending a Serper call. Serper silently ignores an
  // unrecognised `gl`, so an unresolvable country used to buy an unscoped
  // search while the response echoed the caller's bogus value back.
  const country = resolveCountryOrThrow(input.country, { fallback: "us" }).toLowerCase();
  const language = resolveLanguageOrThrow(input.language, { fallback: "en" });

  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) throw new Error("SERPER_API_KEY is required.");

  const resp = await meteredVendorFetch("serper", "https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: keyword, gl: country, hl: language, num: 10 }),
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`Serper API returned HTTP ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json();

  // Google wraps every organic link past the top three in an opaque
  // `google.com/goto` redirect (2026-10-30). Resolve before anything reads a
  // link: the old `extractDomain` turned every wrapper into `www.google.com`,
  // so `top_domains` claimed Google held positions 4-10 of its own SERP.
  // The walk also covers `answerBox.link` and People-Also-Ask links, which
  // nobody has observed wrapped — they are handled if and when Google wraps
  // them, rather than assumed safe.
  const resolution = await resolveSerperLinks(data, serperKey);

  // Parse organic results
  const organicResults = ((data.organic as any[]) ?? []).map(
    (item: any, idx: number) => {
      const link = item.link ?? item.url ?? "";
      return {
        // An opaque wrapper is not a URL a caller can open, and emitting it
        // as one is worse than saying so.
        url: usableResultUrl(link),
        title: item.title ?? "",
        snippet: item.snippet ?? "",
        position: item.position ?? idx + 1,
        domain: deriveResultDomain(link, item.displayedLink),
        link_unresolved: usableResultUrl(link) === null,
      };
    },
  );

  // Featured snippet / answer box
  let featuredSnippet: { text: string; source_url: string | null } | null = null;
  if (data.answerBox) {
    featuredSnippet = {
      text: data.answerBox.snippet ?? data.answerBox.answer ?? data.answerBox.title ?? "",
      source_url: usableResultUrl(data.answerBox.link),
    };
  }

  // People Also Ask
  const peopleAlsoAsk: string[] = ((data.peopleAlsoAsk as any[]) ?? []).map(
    (item: any) => item.question ?? item.title ?? "",
  ).filter(Boolean);

  // Related searches
  const relatedSearches: string[] = ((data.relatedSearches as any[]) ?? []).map(
    (item: any) => item.query ?? "",
  ).filter(Boolean);

  // Detect SERP features
  const serpFeatures: string[] = [];
  if (data.answerBox) serpFeatures.push("featured_snippet");
  if (data.knowledgeGraph) serpFeatures.push("knowledge_panel");
  if (data.organic?.some((o: any) => o.sitelinks)) serpFeatures.push("sitelinks");
  if ((data.peopleAlsoAsk as any[])?.length > 0) serpFeatures.push("people_also_ask");
  if ((data.relatedSearches as any[])?.length > 0) serpFeatures.push("related_searches");
  if (data.images) serpFeatures.push("images");
  if (data.videos) serpFeatures.push("videos");
  if (data.shopping) serpFeatures.push("shopping");
  if (data.places) serpFeatures.push("local_pack");

  // Top domains
  const topDomains = organicResults
    .filter((r) => r.domain)
    .map((r) => ({ domain: r.domain, position: r.position }));

  // Total results (from Serper's searchInformation if available)
  const totalResults = data.searchParameters?.totalResults ?? null;

  return {
    output: {
      keyword,
      country,
      language,
      organic_results: organicResults,
      featured_snippet: featuredSnippet,
      people_also_ask: peopleAlsoAsk,
      related_searches: relatedSearches,
      total_results: totalResults,
      serp_features: serpFeatures,
      top_domains: topDomains,
      // Positions whose host could not be established. An empty array means
      // every scanned result's domain is known.
      unresolved_positions: organicResults
        .filter((r) => r.domain === null)
        .map((r) => r.position),
      link_resolution: {
        attempted: resolution.attempted,
        resolved: resolution.resolved,
        unresolved: resolution.unresolved.length,
      },
    },
    provenance: { source: "google-serper", fetched_at: new Date().toISOString() },
  };
});
