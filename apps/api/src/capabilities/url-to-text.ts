import { registerCapability, type CapabilityInput } from "./index.js";
import { discardBody, safeFetch } from "../lib/safe-fetch.js";
import { readPageHtml } from "../lib/resource-limits.js";
import { validateUrl } from "../lib/url-validator.js";
import { inputRefusal } from "../lib/capability-refusal.js";

const PDF_REFUSAL =
  "'url' must be a web page or text document, not a PDF file. Use 'pdf-extract' to read a PDF.";
const PDF_FIX = "Send this URL to 'pdf-extract' instead, or pass the URL of an HTML page.";

/**
 * Media types this tool cannot turn into text. A missing or unlisted type is
 * read as before: callers also use this tool on JSON and plain-text endpoints.
 */
const BINARY_TYPE_RE = /^(?:image|audio|video|font)\/|^application\/(?:zip|gzip|x-tar|x-7z-compressed|x-rar-compressed|msword|vnd\.)/i;

/**
 * More NUL characters than this in a decoded body means it was not text.
 * `application/octet-stream` is not refused on its header, because servers use
 * it for plain-text downloads too; the body decides.
 */
const MAX_STRAY_NULS = 16;
const BINARY_FIX = "Pass the URL of an HTML page or a plain-text document.";

// Lightweight text extraction — HTTP GET only, no Browserless
registerCapability("url-to-text", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' is required.");

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  await validateUrl(fullUrl);

  const response = await safeFetch(fullUrl, {
    headers: {
      "User-Agent": "Strale/1.0 (text extractor; admin@strale.io)",
      Accept: "text/html,application/xhtml+xml,*/*",
    },
    // redirect handling: safeFetch follows up to 3 hops with per-hop re-validation
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    // Nothing below reads the body (#434). Cancel it rather than leaving
    // it to pin the keep-alive connection until GC.
    await discardBody(response, "url-to-text: non-2xx");
    throw new Error(`HTTP ${response.status} from ${fullUrl}.`);
  }
  // A PDF or other binary body decoded as text is not a page's text, and its
  // NUL bytes cannot be stored: on 2026-11-19 three paid calls for PDFs failed
  // on the database write instead of being refused. Refuse before reading.
  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  if (/^application\/(?:x-)?pdf$/i.test(contentType)) {
    await discardBody(response, "url-to-text: PDF content type");
    throw inputRefusal(PDF_REFUSAL, "url", PDF_FIX);
  }
  if (BINARY_TYPE_RE.test(contentType)) {
    await discardBody(response, "url-to-text: binary content type");
    throw inputRefusal(
      `'url' must be a web page or text document; this URL returns ${contentType.slice(0, 60)}.`,
      "url",
      BINARY_FIX,
    );
  }
  const raw = await readPageHtml(response);
  // Servers also send PDFs as text/plain, octet-stream or with no type at all.
  if (raw.startsWith("%PDF-")) throw inputRefusal(PDF_REFUSAL, "url", PDF_FIX);
  // U+0000 is valid in a JS string and not storable in a Postgres text or
  // jsonb value: one NUL in the output fails the write for the whole call.
  const withoutNuls = raw.replaceAll("\u0000", "");
  if (raw.length - withoutNuls.length > MAX_STRAY_NULS) {
    throw inputRefusal(
      "'url' must be a web page or text document; this URL returns binary data.",
      "url",
      BINARY_FIX,
    );
  }
  const html = withoutNuls;

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
