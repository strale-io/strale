import { registerCapability, type CapabilityInput } from "./index.js";
import { discardBody, safeFetch } from "../lib/safe-fetch.js";
import { readPageHtml } from "../lib/resource-limits.js";
import { assertNotBlockStatus } from "../lib/site-access.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import { targetUnavailable } from "../lib/upstream-result.js";
import { UrlValidationError } from "../lib/url-validator.js";

// Extract metadata via HTTP GET — no Browserless needed
registerCapability("meta-extract", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' is required.");

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;

  // The caller's own page. Its failures are the caller's target: unbilled and
  // never counted against this capability; a site that refuses automated
  // access (401, 403, 407, 429) is a refusal, as for og-image-check
  // (promise-audit T1 follow-up 44).
  const site = `website ${hostOf(fullUrl)}`;
  let response: Response;
  try {
    // F-0-006: safeFetch validates + re-validates on each redirect hop, and
    // sends Strale's honest user agent for a page read.
    response = await safeFetch(fullUrl, {
      headers: { Accept: "text/html,*/*" },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    // The caller's URL failing Strale's URL guard is their input, as before.
    if (err instanceof UrlValidationError || isCapabilityRefusal(err)) throw err;
    throw targetUnavailable(site, err);
  }

  if (!response.ok) {
    // Nothing below reads the body (#434). Cancel it rather than leaving
    // it to pin the keep-alive connection until GC.
    await discardBody(response, "meta-extract: non-2xx");
    assertNotBlockStatus(fullUrl, response.status);
    throw targetUnavailable(site, response.status);
  }
  let html: string;
  try {
    html = await readPageHtml(response);
  } catch (err) {
    // The connection dropped or timed out mid-body. A size cap is a refusal.
    if (isCapabilityRefusal(err)) throw err;
    throw targetUnavailable(site, err);
  }

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

function hostOf(url: string): string {
  return URL.canParse(url) ? new URL(url).hostname.replace(/^www\./, "") : "unknown";
}
