import { registerCapability, type CapabilityInput } from "./index.js";
import { discardBody, safeFetch } from "../lib/safe-fetch.js";
import { readPageHtml } from "../lib/resource-limits.js";
import { assertNotBlockStatus } from "../lib/site-access.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import { targetUnavailable, UpstreamUnavailableError } from "../lib/upstream-result.js";
import { UrlValidationError, validateUrl } from "../lib/url-validator.js";

registerCapability("og-image-check", async (input: CapabilityInput) => {
  const rawUrl = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!rawUrl) throw new Error("'url' is required. Provide a URL to check Open Graph / Twitter Card metadata.");

  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

  // F-0-006: safeFetch validates + re-validates redirects.
  const resp = await safeFetch(url, {
    headers: {
      "User-Agent": "Strale-Bot/1.0",
      Accept: "text/html,*/*",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    // Nothing below reads the body (#434). Cancel it rather than leaving
    // it to pin the keep-alive connection until GC.
    await discardBody(resp, "og-image-check: non-2xx");
    throw new Error(`HTTP ${resp.status} fetching ${url}.`);
  }
  const html = await readPageHtml(resp);

  // Extract Open Graph meta tags
  const ogImageUrl = extractMeta(html, "og:image", "property");
  const ogWidth = extractMeta(html, "og:image:width", "property");
  const ogHeight = extractMeta(html, "og:image:height", "property");
  const ogAlt = extractMeta(html, "og:image:alt", "property");
  const ogTitle = extractMeta(html, "og:title", "property");
  const ogDescription = extractMeta(html, "og:description", "property");

  // Extract Twitter Card meta tags
  const twitterCard = extractMeta(html, "twitter:card", "name");
  const twitterImage = extractMeta(html, "twitter:image", "name");
  const twitterAlt = extractMeta(html, "twitter:image:alt", "name");

  // Resolve image URL (may be relative)
  const resolvedOgImage = ogImageUrl ? resolveUrl(ogImageUrl, url) : null;
  const resolvedTwitterImage = twitterImage ? resolveUrl(twitterImage, url) : null;

  // Check the primary OG image
  let imageSizeKb: number | null = null;
  let imageFormat: string | null = null;
  let imageExists = false;
  let imageNotPublic = false;
  let imageWidth: number | null = ogWidth ? parseInt(ogWidth, 10) : null;
  let imageHeight: number | null = ogHeight ? parseInt(ogHeight, 10) : null;

  const imageToCheck = resolvedOgImage ?? resolvedTwitterImage;
  if (imageToCheck) {
    const probe = await probeImage(imageToCheck);
    // A 4xx (404, 410) or a URL no one outside the site's network can fetch
    // is a real finding, reported below.
    imageNotPublic = probe === NOT_PUBLIC;
    const imgHeaders = probe instanceof Headers ? probe : null;
    imageExists = imgHeaders !== null;
    if (imgHeaders) {
      const contentLength = imgHeaders.get("content-length");
      if (contentLength) {
        imageSizeKb = Math.round(parseInt(contentLength, 10) / 1024);
      }

      const contentType = imgHeaders.get("content-type") ?? "";
      if (contentType.includes("jpeg") || contentType.includes("jpg")) imageFormat = "jpeg";
      else if (contentType.includes("png")) imageFormat = "png";
      else if (contentType.includes("webp")) imageFormat = "webp";
      else if (contentType.includes("gif")) imageFormat = "gif";
      else if (contentType.includes("svg")) imageFormat = "svg";
      else if (contentType.includes("image/")) imageFormat = contentType.split("/")[1];
    }
  }

  // Validate and build issues / recommendations
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Check image presence
  if (!resolvedOgImage) {
    issues.push("Missing og:image meta tag");
    recommendations.push("Add an <meta property=\"og:image\" content=\"...\"> tag with a URL to a 1200x630 image.");
  } else if (imageNotPublic) {
    issues.push("og:image URL is not publicly fetchable");
    recommendations.push(
      "Use a valid, public http(s) URL for og:image. Social platforms cannot fetch localhost, private network addresses or data: URLs.",
    );
  } else if (!imageExists) {
    issues.push("og:image URL returns non-200 status");
    recommendations.push("Ensure the og:image URL is accessible and returns HTTP 200.");
  }

  // Check dimensions
  if (imageWidth !== null && imageHeight !== null) {
    if (imageWidth < 800 || imageHeight < 418) {
      issues.push(`Image dimensions ${imageWidth}x${imageHeight} are below minimum (800x418)`);
      recommendations.push("Use at least 1200x630 pixels for optimal display across platforms.");
    } else if (imageWidth < 1200 || imageHeight < 630) {
      recommendations.push(`Image is ${imageWidth}x${imageHeight}. Recommended: 1200x630 for best quality.`);
    }
  } else if (resolvedOgImage) {
    issues.push("Missing og:image:width and og:image:height");
    recommendations.push("Add og:image:width (1200) and og:image:height (630) for faster rendering.");
  }

  // Check file size
  if (imageSizeKb !== null) {
    if (imageSizeKb > 5120) {
      issues.push(`Image is ${imageSizeKb}KB (exceeds 5MB)`);
      recommendations.push("Compress the image to under 1MB for fast loading.");
    } else if (imageSizeKb > 1024) {
      recommendations.push(`Image is ${imageSizeKb}KB. Consider compressing to under 1MB.`);
    }
  }

  // Check format
  if (imageFormat === "gif") {
    recommendations.push("GIF format is supported but JPEG/PNG/WebP are preferred for OG images.");
  } else if (imageFormat === "svg") {
    issues.push("SVG format is not supported by most social platforms for OG images");
    recommendations.push("Convert the OG image to JPEG, PNG, or WebP format.");
  }

  // Check alt text
  if (!ogAlt && resolvedOgImage) {
    issues.push("Missing og:image:alt text");
    recommendations.push("Add og:image:alt for accessibility and SEO.");
  }

  // Check Twitter Card
  if (!twitterCard) {
    issues.push("Missing twitter:card meta tag");
    recommendations.push("Add <meta name=\"twitter:card\" content=\"summary_large_image\"> for rich Twitter previews.");
  }
  if (!resolvedTwitterImage && !resolvedOgImage) {
    issues.push("No twitter:image and no og:image fallback");
  }
  if (!twitterAlt && (resolvedTwitterImage || resolvedOgImage)) {
    recommendations.push("Add twitter:image:alt for accessibility on Twitter.");
  }

  // Check OG title and description
  if (!ogTitle) {
    issues.push("Missing og:title");
    recommendations.push("Add og:title for social sharing previews.");
  }
  if (!ogDescription) {
    issues.push("Missing og:description");
    recommendations.push("Add og:description for social sharing previews.");
  }

  // Score (0-100)
  let score = 100;
  score -= issues.length * 12;
  score -= recommendations.length * 3;
  score = Math.max(0, Math.min(100, score));

  return {
    output: {
      url,
      og: {
        image_url: resolvedOgImage,
        width: imageWidth,
        height: imageHeight,
        alt: ogAlt,
        title: ogTitle,
        description: ogDescription,
      },
      twitter_card: {
        type: twitterCard,
        image_url: resolvedTwitterImage,
        alt: twitterAlt,
      },
      image_size_kb: imageSizeKb,
      image_format: imageFormat,
      issues,
      recommendations,
      score,
    },
    provenance: {
      source: extractDomain(url),
      fetched_at: new Date().toISOString(),
    },
  };
});

const NOT_PUBLIC = "not_public" as const;

/**
 * The image's response headers; null when the image URL answered a client
 * error (404, 410, ...), so "og:image URL returns non-200 status" is the
 * finding the caller pays for; or NOT_PUBLIC when the image URL itself fails
 * Strale's URL guard (localhost, a private address, a data: URL, a malformed
 * URL). That is the page's own misconfiguration, a finding the caller pays
 * for, not the caller's input fault: they sent the page URL, not this one.
 *
 * Every other failure throws, unbilled (2026-11-06 swallowed-failures audit,
 * row 31). Before, a timeout, a network error or a 5xx was swallowed and
 * reported as that same finding, which says the page is broken when only the
 * check failed. A block (401, 403, 407, 429, robots.txt) ends the check as a
 * refusal, as it does for the page itself. A 5xx, a 408, a timeout or a
 * network error is the image host failing: `targetUnavailable`, worded and
 * marked as the caller's target, retryable. So is a redirect the URL guard
 * refuses, whether on the image or on the image host's robots.txt: the image
 * was never checked, so nothing is reported about it (#1021 delta review). A
 * server that does not implement HEAD (405, 501) is asked again with GET,
 * headers only.
 */
async function probeImage(imageUrl: string): Promise<Headers | null | typeof NOT_PUBLIC> {
  const site = `image host ${extractDomain(imageUrl)}`;
  let resp: Response;
  try {
    // F-0-006: the OG image URL came from the fetched page; treat as untrusted.
    resp = await safeFetch(imageUrl, {
      method: "HEAD",
      headers: { "User-Agent": "Strale-Bot/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (resp.status === 405 || resp.status === 501) {
      await discardBody(resp, "og-image-check: HEAD not supported");
      resp = await safeFetch(imageUrl, {
        headers: { "User-Agent": "Strale-Bot/1.0" },
        signal: AbortSignal.timeout(10000),
      });
    }
  } catch (err) {
    // degraded-ok: NOT_PUBLIC only when the image URL itself fails the URL guard, reported as the "not publicly fetchable" finding; a refused redirect and every other failure throw below.
    if (err instanceof UrlValidationError) {
      if (await failsUrlGuard(imageUrl)) return NOT_PUBLIC;
      throw new UpstreamUnavailableError(site, "URL did not answer: it redirected the check to an address Strale does not fetch.", {
        code: "redirect refused",
        retryable: false,
        cause: err,
        targetFault: true,
      });
    }
    if (isCapabilityRefusal(err)) throw err;
    throw targetUnavailable(site, err);
  }
  // Only the headers are read.
  await discardBody(resp, "og-image-check: image header probe");
  if (resp.ok) return resp.headers;
  assertNotBlockStatus(imageUrl, resp.status);
  if (resp.status >= 500 || resp.status === 408) throw targetUnavailable(site, resp.status);
  return null;
}

/** True when the URL guard refuses this URL as written, before any redirect. */
async function failsUrlGuard(url: string): Promise<boolean> {
  try {
    await validateUrl(url);
    return false;
  } catch (err) {
    // degraded-ok: a classifier, not a fetch: false sends the caller's catch to throw the unbilled redirect-refused error, so nothing is swallowed.
    return err instanceof UrlValidationError;
  }
}

function extractMeta(html: string, name: string, attr: string = "name"): string | null {
  // Match both orderings: attr before content, and content before attr
  const re1 = new RegExp(
    `<meta[^>]*${attr}=["']${escapeRegex(name)}["'][^>]*content=["']([^"']+)`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${escapeRegex(name)}["']`,
    "i",
  );
  const m = html.match(re1) ?? html.match(re2);
  return m ? decodeEntities(m[1]) : null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}
