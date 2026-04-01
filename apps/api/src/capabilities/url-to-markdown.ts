import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml } from "./lib/browserless-extract.js";
import { validateUrl } from "../lib/url-validator.js";

/**
 * Try a plain HTTP GET before Browserless. Returns the raw HTML if the page
 * has enough text content (>500 chars after stripping tags), or null to fall
 * through to Browserless for JS-rendered SPAs.
 *
 * Throws for definitive failures (non-HTML content types, SSRF).
 */
async function tryPlainFetch(url: string): Promise<string | null> {
  try {
    await validateUrl(url);

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Strale/1.0 (url-to-markdown; https://strale.dev)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) {
      if (resp.status >= 400 && resp.status < 500) {
        throw new Error(
          `URL returned HTTP ${resp.status}. Check the URL is correct and publicly accessible.`,
        );
      }
      // 5xx: fall through to Browserless (server might render differently for headless)
      return null;
    }

    const contentType = resp.headers.get("content-type") ?? "";

    // Non-HTML content types: throw specific helpful errors
    if (!contentType.includes("text/html") && !contentType.includes("xhtml")) {
      if (contentType.includes("application/pdf")) {
        throw new Error("This URL points to a PDF file, not a web page. Use the 'pdf-extract' capability instead.");
      }
      if (contentType.includes("image/")) {
        throw new Error("This URL points to an image, not a web page.");
      }
      if (contentType.includes("application/json")) {
        throw new Error("This URL returns JSON data, not a web page. The content is already structured.");
      }
      // Other non-HTML: fall through to Browserless
      return null;
    }

    const html = await resp.text();

    // Heuristic: strip tags and count text content.
    // If >500 chars of actual text, the page is server-rendered — use it.
    let stripped = html;
    stripped = stripped.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    stripped = stripped.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    stripped = stripped.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
    stripped = stripped.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
    stripped = stripped.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
    stripped = stripped.replace(/<[^>]+>/g, " ");
    const textLength = stripped.replace(/\s+/g, " ").trim().length;

    if (textLength > 500) {
      return html; // Return original HTML for htmlToMarkdown to process
    }

    // Too little text — likely an SPA shell, fall through to Browserless
    return null;
  } catch (err) {
    // Re-throw definitive errors (content-type checks, SSRF, 4xx)
    if (err instanceof Error && !err.message.includes("abort") && !err.message.includes("timeout") && !err.message.includes("ECONNREFUSED")) {
      // Check if this is a user-facing error we threw above
      if (
        err.message.includes("URL returned HTTP") ||
        err.message.includes("PDF file") ||
        err.message.includes("image") ||
        err.message.includes("JSON data") ||
        err.message.includes("SSRF") ||
        err.message.includes("private") ||
        err.message.includes("blocked")
      ) {
        throw err;
      }
    }
    // All other errors (DNS, timeout, network): return null to try Browserless
    return null;
  }
}

registerCapability("url-to-markdown", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.link as string) ?? "").trim();
  if (!url) throw new Error("'url' is required.");

  const includeLinks = input.include_links !== false;
  const includeImages = input.include_images !== false;

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;

  // Try plain fetch first (fast path — skips Browserless for static sites)
  let html: string;
  let source: string;

  const plainHtml = await tryPlainFetch(fullUrl);
  if (plainHtml) {
    html = plainHtml;
    source = "http-get";
  } else {
    // Browserless fallback with user-friendly error mapping
    try {
      html = await fetchRenderedHtml(fullUrl);
      source = "browserless";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      if (msg.includes("408") || msg.includes("timed out") || msg.includes("timeout")) {
        throw new Error(
          "This page took too long to load. It may use heavy JavaScript that prevents rendering. " +
          "Try a simpler page, or try a static/blog page on the same site.",
        );
      }
      if (msg.includes("403") || msg.includes("Forbidden")) {
        throw new Error(
          "This site blocks automated access (HTTP 403). " +
          "Many sites use bot protection that prevents content extraction. Try a different URL.",
        );
      }
      if (msg.includes("Could not reach") || msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
        throw new Error(
          "Could not reach this URL. The domain may not exist or may be temporarily down. " +
          "Check the URL and try again.",
        );
      }
      if (msg.includes("empty or too-short")) {
        throw new Error(
          "This page returned no readable content. It may require authentication or " +
          "use client-side rendering that we cannot process.",
        );
      }
      throw new Error(`Failed to fetch page content: ${msg.slice(0, 200)}`);
    }
  }

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") : "";

  // Convert HTML to markdown
  const markdown = htmlToMarkdown(html, includeLinks, includeImages);
  const wordCount = markdown.split(/\s+/).filter(Boolean).length;

  // Content quality check
  if (wordCount < 10 && markdown.length < 100) {
    throw new Error(
      `This page returned almost no readable text (${wordCount} words). ` +
      "It may require JavaScript to render its content, or the URL may point to a login page.",
    );
  }

  return {
    output: { markdown, title, word_count: wordCount, url: fullUrl },
    provenance: { source, fetched_at: new Date().toISOString() },
  };
});

function htmlToMarkdown(html: string, includeLinks: boolean, includeImages: boolean): string {
  // Remove unwanted elements
  let s = html;
  s = s.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
  s = s.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
  s = s.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");

  // Headings
  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n");
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n");
  s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n");
  s = s.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n#### $1\n");
  s = s.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, "\n##### $1\n");
  s = s.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, "\n###### $1\n");

  // Bold / italic
  s = s.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/(strong|b)>/gi, "**$2**");
  s = s.replace(/<(em|i)[^>]*>([\s\S]*?)<\/(em|i)>/gi, "*$2*");
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");

  // Links
  if (includeLinks) {
    s = s.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");
  } else {
    s = s.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, "$1");
  }

  // Images
  if (includeImages) {
    s = s.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>/gi, "![$1]($2)");
    s = s.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, "![$2]($1)");
    s = s.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, "![]($1)");
  } else {
    s = s.replace(/<img[^>]*\/?>/gi, "");
  }

  // Lists
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
  s = s.replace(/<\/?(ul|ol)[^>]*>/gi, "\n");

  // Block elements
  s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content: string) =>
    content.split("\n").map((l: string) => `> ${l}`).join("\n"));
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/?(p|div|tr|section|article|main)[^>]*>/gi, "\n");
  s = s.replace(/<hr[^>]*\/?>/gi, "\n---\n");

  // Tables
  s = s.replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, "| $1 ");
  s = s.replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, "| **$1** ");
  s = s.replace(/<\/tr>/gi, "|\n");

  // Strip remaining tags
  s = s.replace(/<[^>]+>/g, "");

  // Decode entities
  s = s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\u00a0/g, " ");

  // Clean whitespace
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.split("\n").map((l) => l.trim()).join("\n");

  return s.trim().slice(0, 50000);
}
