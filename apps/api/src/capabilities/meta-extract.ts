import { registerCapability, type CapabilityInput } from "./index.js";
import { safeFetch } from "../lib/safe-fetch.js";

// Extract metadata via HTTP GET — no Browserless needed
registerCapability("meta-extract", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' is required.");

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;

  // F-0-006: safeFetch validates + re-validates on redirect hops.
  const response = await safeFetch(fullUrl, {
    headers: {
      "User-Agent": "Strale/1.0 (meta extractor; admin@strale.io)",
      Accept: "text/html,*/*",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status} from ${fullUrl}.`);
  const html = await response.text();

  const output: Record<string, unknown> = { url: fullUrl };

  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  output.title = titleMatch ? decode(titleMatch[1].trim()) : null;

  // Meta description
  output.description = extractMeta(html, "description");

  // Canonical URL
  const canonical = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i);
  output.canonical_url = canonical ? canonical[1] : null;

  // Language
  const lang = html.match(/<html[^>]*lang=["']([^"']+)/i);
  output.language = lang ? lang[1] : null;

  // Favicon
  const favicon = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)/i)
    ?? html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
  output.favicon = favicon ? resolveUrl(favicon[1], fullUrl) : null;

  // Open Graph
  output.og = {
    title: extractMeta(html, "og:title", "property"),
    description: extractMeta(html, "og:description", "property"),
    image: extractMeta(html, "og:image", "property"),
    url: extractMeta(html, "og:url", "property"),
    type: extractMeta(html, "og:type", "property"),
    site_name: extractMeta(html, "og:site_name", "property"),
  };

  // Twitter Card
  output.twitter = {
    card: extractMeta(html, "twitter:card"),
    title: extractMeta(html, "twitter:title"),
    description: extractMeta(html, "twitter:description"),
    image: extractMeta(html, "twitter:image"),
    site: extractMeta(html, "twitter:site"),
    creator: extractMeta(html, "twitter:creator"),
  };

  // Schema.org JSON-LD
  const jsonLdBlocks: unknown[] = [];
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsonLdMatch: RegExpExecArray | null;
  while ((jsonLdMatch = jsonLdRegex.exec(html)) !== null) {
    try {
      jsonLdBlocks.push(JSON.parse(jsonLdMatch[1]));
    } catch { /* skip invalid JSON-LD */ }
  }
  output.json_ld = jsonLdBlocks;

  // RSS/Atom feeds
  const feeds: Array<{ type: string; url: string; title: string | null }> = [];
  const feedRegex = /<link[^>]*type=["'](application\/(?:rss|atom)\+xml)["'][^>]*>/gi;
  let feedMatch: RegExpExecArray | null;
  while ((feedMatch = feedRegex.exec(html)) !== null) {
    const tag = feedMatch[0];
    const href = tag.match(/href=["']([^"']+)/i);
    const feedTitle = tag.match(/title=["']([^"']+)/i);
    if (href) {
      feeds.push({
        type: feedMatch[1].includes("atom") ? "atom" : "rss",
        url: resolveUrl(href[1], fullUrl),
        title: feedTitle ? decode(feedTitle[1]) : null,
      });
    }
  }
  output.feeds = feeds;

  // Robots
  output.robots = extractMeta(html, "robots");

  return {
    output,
    provenance: { source: "http-get", fetched_at: new Date().toISOString() },
  };
});

function extractMeta(html: string, name: string, attr: string = "name"): string | null {
  const re1 = new RegExp(`<meta[^>]*${attr}=["']${name}["'][^>]*content=["']([^"']+)`, "i");
  const re2 = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${name}["']`, "i");
  const m = html.match(re1) ?? html.match(re2);
  return m ? decode(m[1]) : null;
}

function decode(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}
