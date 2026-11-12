import { registerCapability, type CapabilityInput } from "./index.js";
import { discardBody, safeFetch } from "../lib/safe-fetch.js";
import { readPageHtml } from "../lib/resource-limits.js";
import { assertNotBlockStatus } from "../lib/site-access.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import { targetUnavailable } from "../lib/upstream-result.js";
import { UrlValidationError } from "../lib/url-validator.js";

// Extract links via HTTP GET (no Browserless — fast and cheap)
registerCapability("link-extract", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' is required.");

  const filter = ((input.filter as string) ?? "both").toLowerCase(); // internal, external, both

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  const baseUrl = new URL(fullUrl);

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
    await discardBody(response, "link-extract: non-2xx");
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

  // Parse all <a> tags
  const linkRegex = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const links: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1].trim();
    const anchorHtml = match[2];
    const tagStr = match[0];

    // Skip javascript:, mailto:, tel:
    if (/^(javascript|mailto|tel):/i.test(href)) continue;

    let absoluteUrl: string;
    try {
      absoluteUrl = new URL(href, fullUrl).href;
    } catch {
      continue;
    }

    if (seen.has(absoluteUrl)) continue;
    seen.add(absoluteUrl);

    const isExternal = new URL(absoluteUrl).hostname !== baseUrl.hostname;

    if (filter === "internal" && isExternal) continue;
    if (filter === "external" && !isExternal) continue;

    // Extract anchor text
    const anchorText = anchorHtml.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

    // Extract rel attribute
    const relMatch = tagStr.match(/rel=["']([^"']+)["']/i);
    const relAttributes = relMatch ? relMatch[1].split(/\s+/) : [];

    links.push({
      url: absoluteUrl,
      anchor_text: anchorText || null,
      is_external: isExternal,
      rel_attributes: relAttributes,
    });
  }

  return {
    output: {
      source_url: fullUrl,
      filter,
      total_links: links.length,
      links,
    },
    provenance: { source: "http-get", fetched_at: new Date().toISOString() },
  };
});

function hostOf(url: string): string {
  return URL.canParse(url) ? new URL(url).hostname.replace(/^www\./, "") : "unknown";
}
