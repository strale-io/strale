import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml } from "./lib/browserless-extract.js";
import { htmlToCleanMarkdown } from "./lib/readability-convert.js";
import { fetchViaJina } from "./lib/jina-reader.js";
import { validateUrl } from "../lib/url-validator.js";

/** Sites known to block server-side fetches with specific guidance. */
const BLOCKED_SITE_HINTS: Record<string, string> = {
  "npmjs.com": "npmjs.com blocks automated access. Use the 'npm-package-info' capability instead to get package metadata.",
  "pypi.org": "pypi.org blocks automated scraping. Use the 'pypi-package-info' capability instead.",
  "linkedin.com": "LinkedIn blocks all automated access. No workaround available.",
  "twitter.com": "Twitter/X blocks automated access. No workaround available.",
  "x.com": "Twitter/X blocks automated access. No workaround available.",
  "instagram.com": "Instagram blocks automated access. No workaround available.",
  "facebook.com": "Facebook blocks automated access. No workaround available.",
};

function getBlockedSiteHint(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    for (const [domain, hint] of Object.entries(BLOCKED_SITE_HINTS)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) return hint;
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Try a plain HTTP GET before heavier providers. Returns the raw HTML if the
 * page has enough text content (>500 chars after stripping tags), or null to
 * fall through to Jina/Browserless for JS-rendered SPAs.
 *
 * Throws for definitive failures (non-HTML content types, SSRF, 4xx).
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
        const hint = getBlockedSiteHint(url);
        if (hint) {
          throw new Error(hint);
        }
        if (resp.status === 403) {
          throw new Error(
            "This site exists but blocks automated access (HTTP 403). Many sites use bot protection that prevents content extraction. Try 'whois-lookup' or 'domain-reputation' for structured data about this domain instead.",
          );
        }
        throw new Error(
          `URL returned HTTP ${resp.status}. Check the URL is correct and publicly accessible.`,
        );
      }
      return null;
    }

    const contentType = resp.headers.get("content-type") ?? "";

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
      return null;
    }

    const html = await resp.text();

    let stripped = html;
    stripped = stripped.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    stripped = stripped.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    stripped = stripped.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
    stripped = stripped.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
    stripped = stripped.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
    stripped = stripped.replace(/<[^>]+>/g, " ");
    const textLength = stripped.replace(/\s+/g, " ").trim().length;

    if (textLength > 500) return html;

    return null;
  } catch (err) {
    if (err instanceof Error && !err.message.includes("abort") && !err.message.includes("timeout") && !err.message.includes("ECONNREFUSED")) {
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
    return null;
  }
}

function mapBrowserlessError(msg: string): Error {
  if (msg.includes("408") || msg.includes("timed out") || msg.includes("timeout")) {
    return new Error(
      "This page took too long to load. It may use heavy JavaScript that prevents rendering. " +
      "Try a simpler page, or try a static/blog page on the same site.",
    );
  }
  if (msg.includes("403") || msg.includes("Forbidden")) {
    return new Error(
      "This site blocks automated access (HTTP 403). " +
      "Many sites use bot protection that prevents content extraction. Try a different URL.",
    );
  }
  if (msg.includes("Could not reach") || msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
    return new Error(
      "Could not reach this URL. The domain may not exist or may be temporarily down. " +
      "Check the URL and try again.",
    );
  }
  if (msg.includes("empty or too-short")) {
    return new Error(
      "This page returned no readable content. It may require authentication or " +
      "use client-side rendering that we cannot process.",
    );
  }
  return new Error(`Failed to fetch page content: ${msg.slice(0, 200)}`);
}

/** Post-process markdown to strip links/images if requested. */
function postProcess(md: string, includeLinks: boolean, includeImages: boolean): string {
  let result = md;
  if (!includeLinks) result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  if (!includeImages) result = result.replace(/!\[[^\]]*\]\([^)]+\)/g, "");
  return result;
}

registerCapability("url-to-markdown", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.link as string) ?? "").trim();
  if (!url) throw new Error("'url' is required.");

  const includeLinks = input.include_links !== false;
  const includeImages = input.include_images !== false;
  const fullUrl = url.startsWith("http") ? url : `https://${url}`;

  // ── Layer 1: Plain fetch + Readability/Turndown (~200ms for static sites) ──
  const plainHtml = await tryPlainFetch(fullUrl);

  if (plainHtml) {
    const result = htmlToCleanMarkdown(plainHtml, fullUrl);
    const markdown = postProcess(result.markdown, includeLinks, includeImages);
    const wordCount = markdown.split(/\s+/).filter(Boolean).length;

    if (wordCount < 10) {
      throw new Error(
        `This page returned almost no readable text (${wordCount} words). ` +
        "It may require JavaScript to render its content, or the URL may point to a login page.",
      );
    }

    return {
      output: { markdown, title: result.title, word_count: wordCount, url: fullUrl },
      provenance: {
        source: "http-get",
        extraction: result.usedReadability ? "readability+turndown" : "turndown",
        fetched_at: new Date().toISOString(),
      },
    };
  }

  // ── Layer 2: Jina Reader (handles JS-rendered sites — ~1-3s, free) ──
  const jinaResult = await fetchViaJina(fullUrl);

  if (jinaResult) {
    const jinaMarkdown = postProcess(jinaResult.markdown, includeLinks, includeImages);
    const wordCount = jinaMarkdown.split(/\s+/).filter(Boolean).length;

    return {
      output: { markdown: jinaMarkdown, title: jinaResult.title, word_count: wordCount, url: fullUrl },
      provenance: {
        source: "jina-reader",
        fetch_time_ms: jinaResult.fetchTimeMs,
        fetched_at: new Date().toISOString(),
      },
    };
  }

  // ── Layer 3: Browserless (last resort — ~3-15s) ──
  let browserlessHtml: string;
  try {
    browserlessHtml = await fetchRenderedHtml(fullUrl);
  } catch (err) {
    throw mapBrowserlessError(err instanceof Error ? err.message : String(err));
  }

  const result = htmlToCleanMarkdown(browserlessHtml, fullUrl);
  const browserMarkdown = postProcess(result.markdown, includeLinks, includeImages);
  const wordCount = browserMarkdown.split(/\s+/).filter(Boolean).length;

  if (wordCount < 10 && browserMarkdown.length < 100) {
    throw new Error(
      `This page returned almost no readable text (${wordCount} words). ` +
      "It may require JavaScript to render its content, or the URL may point to a login page.",
    );
  }

  return {
    output: { markdown: browserMarkdown, title: result.title, word_count: wordCount, url: fullUrl },
    provenance: {
      source: "browserless",
      extraction: result.usedReadability ? "readability+turndown" : "turndown",
      fetched_at: new Date().toISOString(),
    },
  };
});
