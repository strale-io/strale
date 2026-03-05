import { registerCapability, type CapabilityInput } from "./index.js";
import { validateUrl } from "../lib/url-validator.js";

// Lightweight text extraction — HTTP GET only, no Browserless
registerCapability("url-to-text", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' is required.");

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  await validateUrl(fullUrl);

  const response = await fetch(fullUrl, {
    headers: {
      "User-Agent": "Strale/1.0 (text extractor; admin@strale.io)",
      Accept: "text/html,application/xhtml+xml,*/*",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status} from ${fullUrl}.`);
  const html = await response.text();

  // Extract metadata from HTML
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : "";

  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)/i)
    ?? html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
  const metaDescription = descMatch ? decodeEntities(descMatch[1].trim()) : null;

  const langMatch = html.match(/<html[^>]*lang=["']([^"']+)/i);
  const language = langMatch ? langMatch[1].trim() : null;

  // Strip to text
  let text = html;
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
  text = text.replace(/<\/?(p|div|tr|td|th|li|h[1-6]|dt|dd|section|br|hr)[^>]*>/gi, "\n");
  text = text.replace(/<[^>]+>/g, " ");
  text = decodeEntities(text);
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n\s*\n/g, "\n");
  text = text.trim().slice(0, 50000);

  return {
    output: { text, title, meta_description: metaDescription, language, url: fullUrl },
    provenance: { source: "http-get", fetched_at: new Date().toISOString() },
  };
});

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\u00a0/g, " ");
}
