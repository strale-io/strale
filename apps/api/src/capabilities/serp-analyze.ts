import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("serp-analyze", async (input: CapabilityInput) => {
  const keyword = (
    (input.keyword as string) ??
    (input.query as string) ??
    (input.task as string) ??
    ""
  ).trim();
  if (!keyword) throw new Error("'keyword' is required. Provide a search query to analyze.");

  const country = ((input.country as string) ?? "us").trim().toLowerCase();
  const language = ((input.language as string) ?? "en").trim().toLowerCase();

  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) throw new Error("SERPER_API_KEY is required.");

  const resp = await fetch("https://google.serper.dev/search", {
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

  // Parse organic results
  const organicResults = ((data.organic as any[]) ?? []).map(
    (item: any, idx: number) => ({
      url: item.link ?? item.url ?? "",
      title: item.title ?? "",
      snippet: item.snippet ?? "",
      position: item.position ?? idx + 1,
      domain: extractDomain(item.link ?? item.url ?? ""),
    }),
  );

  // Featured snippet / answer box
  let featuredSnippet: { text: string; source_url: string } | null = null;
  if (data.answerBox) {
    featuredSnippet = {
      text: data.answerBox.snippet ?? data.answerBox.answer ?? data.answerBox.title ?? "",
      source_url: data.answerBox.link ?? "",
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
    },
    provenance: { source: "google.com", fetched_at: new Date().toISOString() },
  };
});

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
