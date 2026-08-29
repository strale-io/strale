import { registerCapability, type CapabilityInput } from "./index.js";
import { discardBody, safeFetch } from "../lib/safe-fetch.js";
import { readSitemapXml } from "../lib/resource-limits.js";
import { validateUrl } from "../lib/url-validator.js";

/**
 * Extract the contents of every `<tag>…</tag>` pair, LINEARLY (#434).
 *
 * These replace `/<url>([\s\S]*?)<\/url>/g` and `/<loc>\s*(.*?)\s*<\/loc>/g`,
 * which were quadratic on unclosed tags and remotely triggerable — the fetch
 * cap bounds the bytes but said nothing about the CPU spent on them. Measured
 * on this machine, with input the caller's server chooses freely:
 *
 *     "<url>" x 10,000   (49 KB)     0.26 s
 *     "<url>" x 100,000  (488 KB)   59.9 s
 *     "<loc>" x 10,000   (49 KB)     4.05 s
 *     "<loc>" x 50,000   (244 KB)   66.0 s
 *
 * Ten times the input for two hundred times the work. The mechanism is the
 * lazy `[\s\S]*?` between literal delimiters: with no closing tag the engine
 * retries from every opening position, each time scanning to the end. A
 * half-megabyte response — far under the 50 MB fetch cap — burns a minute of
 * CPU, and because the regex is synchronous it blocks the whole event loop,
 * so one 5-cent call stalls every other request in the process. Larger inputs
 * scale without limit.
 *
 * `indexOf` cannot backtrack. Same semantics — non-overlapping pairs, nearest
 * closing tag, contents trimmed — at 5 ms for a 50,000-URL sitemap.
 *
 * Deliberately NOT a general XML parser: this file's contract is "parse a
 * sitemap minimally without external deps", and swapping in a real parser is
 * a larger change with its own failure modes. Filed separately.
 */
function tagContents(xml: string, tag: string): string[] {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const out: string[] = [];
  let at = 0;
  for (;;) {
    const start = xml.indexOf(open, at);
    if (start === -1) break;
    const from = start + open.length;
    const end = xml.indexOf(close, from);
    if (end === -1) break; // unclosed tail — stop, exactly as the regex did
    out.push(xml.slice(from, end).trim());
    at = end + close.length;
  }
  return out;
}

/** The first `<tag>…</tag>` content, or undefined. Linear, same as above. */
function firstTag(xml: string, tag: string): string | undefined {
  const open = `<${tag}>`;
  const start = xml.indexOf(open);
  if (start === -1) return undefined;
  const from = start + open.length;
  const end = xml.indexOf(`</${tag}>`, from);
  if (end === -1) return undefined;
  return xml.slice(from, end).trim();
}

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

  const response = await safeFetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": "StraleBot/1.0", Accept: "application/xml, text/xml, */*" },
  });

  if (!response.ok) {
    // Nothing below reads the body (#434). Cancel it rather than leaving
    // it to pin the keep-alive connection until GC.
    await discardBody(response, "sitemap-parse: non-2xx");
    throw new Error(`HTTP ${response.status} fetching sitemap from ${url}`);
  }
  const xml = await readSitemapXml(response);

  if (!xml.includes("<") || xml.length < 50) {
    throw new Error("Response does not appear to be valid XML.");
  }

  // Parse XML minimally without external deps
  const isSitemapIndex = xml.includes("<sitemapindex");

  if (isSitemapIndex) {
    // Sitemap index — extract child sitemap URLs
    const sitemapUrls = tagContents(xml, "loc");
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

  for (const block of tagContents(xml, "url")) {
    const loc = firstTag(block, "loc");
    if (!loc) continue;
    entries.push({
      loc,
      lastmod: firstTag(block, "lastmod"),
      changefreq: firstTag(block, "changefreq"),
      priority: firstTag(block, "priority"),
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
