import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml } from "./lib/browserless-extract.js";
import { htmlToCleanMarkdown } from "./lib/readability-convert.js";
import { fetchViaJina } from "./lib/jina-reader.js";
import { safeFetch } from "../lib/safe-fetch.js";

/** Thrown when the target responded definitively — no point trying Jina/Browserless. */
class DefinitiveFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DefinitiveFetchError";
  }
}

/** Sites known to block server-side fetches with specific guidance. */
const BLOCKED_SITE_HINTS: Record<string, string> = {
  "npmjs.com": "npmjs.com blocks automated access. Use the 'npm-package-info' capability instead to get package metadata.",
  "pypi.org": "pypi.org blocks automated scraping. Use the 'pypi-package-info' capability instead.",
  "linkedin.com": "LinkedIn blocks all automated access. Try 'linkedin-url-validate' to verify a LinkedIn profile URL exists.",
  "twitter.com": "Twitter/X blocks automated access. No workaround available.",
  "x.com": "Twitter/X blocks automated access. No workaround available.",
  "instagram.com": "Instagram blocks automated access. No workaround available.",
  "facebook.com": "Facebook blocks automated access. No workaround available.",
  "coindesk.com": "CoinDesk blocks automated scraping. Try searching for the article title via 'google-search' instead.",
  "bloomberg.com": "Bloomberg blocks automated access. Financial data may be available via other capabilities.",
  "wsj.com": "Wall Street Journal blocks automated access (paywall + bot protection).",
  "ft.com": "Financial Times blocks automated access (paywall + bot protection).",
  "nytimes.com": "New York Times blocks automated access (paywall + bot protection).",
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
    // F-0-006: safeFetch re-validates on every redirect and refuses
    // DNS-rebinding at connection time. The old `redirect: "follow"` +
    // `validateUrl` pattern was the classic SSRF bypass.
    const resp = await safeFetch(url, {
      headers: {
        "User-Agent": "Strale/1.0 (url-to-markdown; https://strale.dev)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) {
      if (resp.status >= 400 && resp.status < 500) {
        const hint = getBlockedSiteHint(url);
        if (hint) {
          throw new DefinitiveFetchError(hint);
        }
        if (resp.status === 403) {
          throw new DefinitiveFetchError(
            "This site blocks automated access (HTTP 403 Forbidden). " +
            "This is bot protection on the target site, not a Strale issue. " +
            "Alternatives: try 'dns-lookup' or 'domain-reputation' for structured data about this domain, " +
            "or try a different page on the same site (e.g. /about, /blog).",
          );
        }
        if (resp.status === 404) {
          let hostname = "";
          try { hostname = new URL(resp.url || url).hostname; } catch { /* ignore */ }
          const originalHost = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
          const redirectNote = hostname && originalHost && hostname !== originalHost
            ? ` The original URL redirected to ${resp.url}, which returned 404.`
            : "";
          throw new DefinitiveFetchError(
            `This page does not exist (HTTP 404). The server at ${hostname || "this domain"} is reachable, ` +
            "but this specific URL returned 'not found'." + redirectNote + " " +
            "Check for typos in the path, or try the site's homepage instead.",
          );
        }
        if (resp.status === 401 || resp.status === 407) {
          throw new DefinitiveFetchError(
            `This page requires authentication (HTTP ${resp.status}). ` +
            "url-to-markdown can only access publicly available pages.",
          );
        }
        if (resp.status === 429) {
          throw new DefinitiveFetchError(
            "This site is rate-limiting requests (HTTP 429). " +
            "The target site has throttled access. Try again in a few minutes.",
          );
        }
        throw new DefinitiveFetchError(
          `URL returned HTTP ${resp.status}. The server is reachable but returned an error. ` +
          "Check the URL is correct and publicly accessible.",
        );
      }
      return null;
    }

    const contentType = resp.headers.get("content-type") ?? "";

    if (!contentType.includes("text/html") && !contentType.includes("xhtml")) {
      if (contentType.includes("application/pdf")) {
        throw new DefinitiveFetchError("This URL points to a PDF file, not a web page. Use the 'pdf-extract' capability instead.");
      }
      if (contentType.includes("image/")) {
        throw new DefinitiveFetchError("This URL points to an image, not a web page.");
      }
      if (contentType.includes("application/json")) {
        throw new DefinitiveFetchError("This URL returns JSON data, not a web page. The content is already structured.");
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
    if (err instanceof DefinitiveFetchError) throw err;
    if (err instanceof Error && (err.message.includes("SSRF") || err.message.includes("private"))) {
      throw err;
    }
    return null;
  }
}

function mapBrowserlessError(msg: string, url?: string): Error {
  let hostname = "";
  try { if (url) hostname = new URL(url).hostname; } catch { /* ignore */ }
  const domainNote = hostname ? ` (${hostname})` : "";

  if (msg.includes("HTTP 404") || msg.includes("(404)")) {
    return new Error(
      `This page does not exist (HTTP 404)${domainNote}. The server is reachable, but this specific URL returned 'not found'. ` +
      "This often happens when a site migrates and old URLs redirect to pages that have been removed. " +
      "Check the path, or try the site's homepage.",
    );
  }
  if (msg.includes("HTTP 401") || msg.includes("HTTP 407")) {
    return new Error(
      `This page requires authentication${domainNote}. url-to-markdown can only access publicly available pages.`,
    );
  }
  if (msg.includes("HTTP 410")) {
    return new Error(
      `This page has been permanently removed (HTTP 410)${domainNote}. The URL is gone and will not return.`,
    );
  }
  if (msg.includes("408") || msg.includes("timed out") || msg.includes("timeout")) {
    return new Error(
      `This page${domainNote} took too long to render (>30s). ` +
      "Common causes: heavy JavaScript framework, server-side rendering delay, or the site is slow. " +
      "Try a simpler page on the same site (e.g. /about or /blog), or try 'dns-lookup' to verify the domain is responsive.",
    );
  }
  if (msg.includes("403") || msg.includes("Forbidden")) {
    const hint = url ? getBlockedSiteHint(url) : null;
    return new Error(
      hint ?? (
        `This site${domainNote} blocks automated access (HTTP 403 Forbidden). ` +
        "This is bot protection on the target site, not a Strale issue. " +
        "Alternatives: 'dns-lookup' or 'domain-reputation' for structured data about this domain."
      ),
    );
  }
  if (msg.includes("ERR_NAME_NOT_RESOLVED") || msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
    return new Error(
      `The domain${domainNote} does not exist or has no DNS records. ` +
      "Check the spelling. Use 'dns-lookup' to verify whether the domain resolves.",
    );
  }
  if (msg.includes("Could not reach") || msg.includes("ECONNREFUSED") || msg.includes("ECONNRESET")) {
    return new Error(
      `Could not connect to${domainNote}. The domain exists but the server is not responding. ` +
      "It may be temporarily down or blocking connections. Try again later.",
    );
  }
  if (msg.includes("empty or too-short")) {
    return new Error(
      `This page${domainNote} returned no readable content. ` +
      "Possible causes: the page requires login, uses a JavaScript framework that blocks extraction, " +
      "or the content is behind a cookie consent wall.",
    );
  }
  if (msg.includes("Failed to launch") || msg.includes("EAGAIN") || msg.includes("spawn")) {
    // Browserless infrastructure issue — don't expose internals
    return new Error(
      `Could not render this page${domainNote}. Our rendering service is temporarily at capacity. ` +
      "This is a Strale infrastructure issue, not a problem with the target site. Try again in a few seconds.",
    );
  }
  if (msg.includes("net::ERR_")) {
    // Chrome network errors
    const errCode = msg.match(/net::(ERR_[A-Z_]+)/)?.[1] ?? "ERR_UNKNOWN";
    return new Error(
      `Network error loading${domainNote}: ${errCode}. ` +
      "The page could not be loaded by our rendering engine. " +
      "Check that the URL is correct and the site is publicly accessible.",
    );
  }
  return new Error(
    `Could not extract content from this page${domainNote}. ${msg.slice(0, 150)}`,
  );
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
    throw mapBrowserlessError(err instanceof Error ? err.message : String(err), fullUrl);
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
