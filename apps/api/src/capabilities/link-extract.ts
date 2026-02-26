import { registerCapability, type CapabilityInput } from "./index.js";

// Extract links via HTTP GET (no Browserless — fast and cheap)
registerCapability("link-extract", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' is required.");

  const filter = ((input.filter as string) ?? "both").toLowerCase(); // internal, external, both

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  const baseUrl = new URL(fullUrl);

  const response = await fetch(fullUrl, {
    headers: {
      "User-Agent": "Strale/1.0 (link extractor; admin@strale.io)",
      Accept: "text/html,*/*",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status} from ${fullUrl}.`);
  const html = await response.text();

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
