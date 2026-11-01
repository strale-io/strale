import { registerCapability, type CapabilityInput } from "./index.js";
import { meteredVendorFetch } from "../lib/metered-vendor-fetch.js";
import {
  describeResultDomain,
  resolveSerperLinks,
  startSerperBudget,
  usableResultUrl,
} from "../lib/serper-links.js";
import { resolveCountryOrThrow } from "./lib/iso-3166.js";
import { resolveLanguageOrThrow } from "./lib/language-tag.js";

registerCapability("serp-analyze", async (input: CapabilityInput) => {
  // One budget for the whole Serper leg, taken before any input work.
  // Round-2 review: the search used to ask for the entire 15 s
  // SYNC_TRANSACTION_WALL_MS and resolution then added its own slice on
  // top, so a slow pair could exceed the wall and the caller would get an
  // infrastructure error instead of this capability's designed answer.
  const budget = startSerperBudget();
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
    signal: AbortSignal.timeout(budget.searchTimeoutMs),
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
  const resolution = await resolveSerperLinks(data, serperKey, undefined, budget.resolveDeadline);

  // Parse organic results
  const organicResults = ((data.organic as any[]) ?? []).map(
    (item: any, idx: number) => {
      const link = item.link ?? item.url ?? "";
      const host = describeResultDomain(link, item.displayedLink);
      return {
        // An opaque wrapper is not a URL a caller can open, and emitting it
        // as one is worse than saying so.
        url: usableResultUrl(link),
        title: item.title ?? "",
        snippet: item.snippet ?? "",
        position: item.position ?? idx + 1,
        domain: host.domain,
        // "url" when the destination named the host, "breadcrumb" when only
        // Google's display breadcrumb did, "none" when neither could.
        domain_source: host.source,
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
      // Round-2 review: count what the CALLER sees, not what was found
      // anywhere in Serper's response. `resolution.unresolved` spans
      // surfaces this output never emits, and `resolution.resolved` counts
      // rewritten sites rather than distinct links — two denominators in one
      // object.
      link_resolution: {
        attempted: resolution.attempted,
        unresolved_results: organicResults.filter((r) => r.link_unresolved).length,
      },
    },
    provenance: { source: "google-serper", fetched_at: new Date().toISOString() },
  };
});
