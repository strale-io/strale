import { registerCapability, type CapabilityInput } from "./index.js";
import { validateUrl } from "../lib/url-validator.js";

registerCapability("sitemap-parse", async (input: CapabilityInput) => {
  let url = ((input.url as string) ?? (input.domain as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' (sitemap URL or domain) is required.");

  if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
  // If it's just a domain, try /sitemap.xml
  if (!url.includes("sitemap")) {
    const base = new URL(url);
    url = `${base.protocol}//${base.hostname}/sitemap.xml`;
  }
  await validateUrl(url);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": "StraleBot/1.0", Accept: "application/xml, text/xml, */*" },
  });

  if (!response.ok) throw new Error(`HTTP ${response.status} fetching sitemap from ${url}`);
  const xml = await response.text();

  if (!xml.includes("<") || xml.length < 50) {
    throw new Error("Response does not appear to be valid XML.");
  }

  // Parse XML minimally without external deps
  const isSitemapIndex = xml.includes("<sitemapindex");

  if (isSitemapIndex) {
    // Sitemap index — extract child sitemap URLs
    const sitemapUrls: string[] = [];
    const locRegex = /<loc>\s*(.*?)\s*<\/loc>/g;
    let match;
    while ((match = locRegex.exec(xml)) !== null) {
      sitemapUrls.push(match[1]);
    }
    return {
      output: {
        url,
        type: "sitemap_index",
        child_sitemaps: sitemapUrls,
        child_count: sitemapUrls.length,
      },
      provenance: { source: "http-fetch", fetched_at: new Date().toISOString() },
    };
  }

  // Regular sitemap — extract URLs
  interface SitemapEntry { loc: string; lastmod?: string; changefreq?: string; priority?: string }
  const entries: SitemapEntry[] = [];
  const urlRegex = /<url>([\s\S]*?)<\/url>/g;
  let urlMatch;

  while ((urlMatch = urlRegex.exec(xml)) !== null) {
    const block = urlMatch[1];
    const loc = block.match(/<loc>\s*(.*?)\s*<\/loc>/)?.[1];
    if (!loc) continue;
    entries.push({
      loc,
      lastmod: block.match(/<lastmod>\s*(.*?)\s*<\/lastmod>/)?.[1],
      changefreq: block.match(/<changefreq>\s*(.*?)\s*<\/changefreq>/)?.[1],
      priority: block.match(/<priority>\s*(.*?)\s*<\/priority>/)?.[1],
    });
  }

  // Analyze URL patterns
  const pathSegments: Record<string, number> = {};
  for (const e of entries) {
    try {
      const path = new URL(e.loc).pathname.split("/").filter(Boolean)[0] ?? "/";
      pathSegments[path] = (pathSegments[path] ?? 0) + 1;
    } catch { /* skip */ }
  }

  // Sort by count
  const topSegments = Object.entries(pathSegments)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([segment, count]) => ({ segment, count }));

  return {
    output: {
      url,
      type: "urlset",
      total_urls: entries.length,
      sample_urls: entries.slice(0, 20),
      top_path_segments: topSegments,
      has_lastmod: entries.some(e => e.lastmod),
      has_changefreq: entries.some(e => e.changefreq),
      has_priority: entries.some(e => e.priority),
      newest_lastmod: entries.filter(e => e.lastmod).sort((a, b) => (b.lastmod ?? "").localeCompare(a.lastmod ?? ""))[0]?.lastmod ?? null,
      oldest_lastmod: entries.filter(e => e.lastmod).sort((a, b) => (a.lastmod ?? "").localeCompare(b.lastmod ?? ""))[0]?.lastmod ?? null,
    },
    provenance: { source: "http-fetch", fetched_at: new Date().toISOString() },
  };
});
