import { registerCapability, type CapabilityInput } from "./index.js";
import { safeFetch } from "../lib/safe-fetch.js";
import { STRALE_USER_AGENT } from "../lib/site-access.js";
import { readRobotsTxt } from "../lib/resource-limits.js";
import { fetchRenderedHtml } from "./lib/browserless-extract.js";
import { httpUnavailable, UpstreamUnavailableError } from "../lib/upstream-result.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import { logWarn } from "../lib/log.js";

const ROBOTS = "robots.txt";

/**
 * A JavaScript runtime error of ours, as opposed to fetch's own transport
 * TypeError. Applied to errors thrown after the fetch, where an
 * ERR_INVALID_URL can only be ours too (PR #1017 delta review).
 */
function isOwnDefect(err: unknown): boolean {
  if (!(err instanceof TypeError || err instanceof ReferenceError || err instanceof SyntaxError)) return false;
  return !(err instanceof TypeError && (err.message === "fetch failed" || err.message === "terminated"));
}

registerCapability("seo-audit", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' is required.");

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  const html = await fetchRenderedHtml(fullUrl);

  const checks: Record<string, unknown> = {};

  // Title tag
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;
  checks.title = {
    present: !!title,
    value: title,
    length: title?.length ?? 0,
    optimal: title ? title.length >= 30 && title.length <= 60 : false,
  };

  // Meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)/i)
    ?? html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
  const desc = descMatch ? descMatch[1].trim() : null;
  checks.meta_description = {
    present: !!desc,
    value: desc,
    length: desc?.length ?? 0,
    optimal: desc ? desc.length >= 120 && desc.length <= 160 : false,
  };

  // H1 structure
  const h1Matches = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) ?? [];
  const h1Texts = h1Matches.map((m) => m.replace(/<[^>]+>/g, "").trim());
  checks.h1 = { count: h1Texts.length, values: h1Texts, optimal: h1Texts.length === 1 };

  // Heading hierarchy
  const headings: Array<{ level: number; text: string }> = [];
  const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let hMatch: RegExpExecArray | null;
  while ((hMatch = headingRegex.exec(html)) !== null) {
    headings.push({ level: Number(hMatch[1]), text: hMatch[2].replace(/<[^>]+>/g, "").trim().slice(0, 100) });
  }
  checks.heading_hierarchy = { count: headings.length, structure: headings.slice(0, 20) };

  // Image alt tags
  const imgMatches = html.match(/<img[^>]*>/gi) ?? [];
  const imgWithAlt = imgMatches.filter((m) => /alt=["'][^"']+/i.test(m)).length;
  const imgWithoutAlt = imgMatches.length - imgWithAlt;
  checks.images = { total: imgMatches.length, with_alt: imgWithAlt, without_alt: imgWithoutAlt };

  // Canonical URL
  const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i);
  checks.canonical = { present: !!canonicalMatch, url: canonicalMatch?.[1] ?? null };

  // Open Graph tags
  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)/i);
  const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)/i);
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)/i);
  checks.open_graph = {
    title: !!ogTitle, description: !!ogDesc, image: !!ogImage,
    complete: !!(ogTitle && ogDesc && ogImage),
  };

  // Schema.org / JSON-LD
  const jsonLdCount = (html.match(/application\/ld\+json/gi) ?? []).length;
  checks.schema_org = { json_ld_blocks: jsonLdCount, present: jsonLdCount > 0 };

  // Internal vs external links
  const domain = new URL(fullUrl).hostname;
  const linkRegex = /<a[^>]*href=["']([^"'#]+)/gi;
  let internal = 0, external = 0;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    // An href that does not parse as a URL is skipped.
    if (!URL.canParse(linkMatch[1], fullUrl)) continue;
    const linkUrl = new URL(linkMatch[1], fullUrl);
    if (linkUrl.hostname === domain) internal++;
    else external++;
  }
  checks.links = { internal, external, ratio: internal > 0 ? +(external / internal).toFixed(2) : 0 };

  // Check robots.txt and sitemap. A 4xx means the site serves no robots.txt
  // (RFC 9309 §2.3.1.3), the real negative. A timeout, network error, 429 or
  // 5xx means it could not be read, which says nothing about whether it exists:
  // those two checks then read null, robots.txt is named in
  // unavailable_sources, and the score leaves their 10 points out rather than
  // counting them as missing (2026-11-06 swallowed-upstream-failures audit,
  // row 23).
  const baseUrl = `${new URL(fullUrl).protocol}//${domain}`;
  let robotsTxt: string | null = null;
  let robotsUnavailable = false;
  let robotsError: unknown;
  let robotsRes: Response | null = null;
  try {
    robotsRes = await safeFetch(`${baseUrl}/robots.txt`, {
      headers: { "User-Agent": STRALE_USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    // degraded-ok: an unreadable robots.txt nulls the robots and sitemap checks, is named in unavailable_sources and is left out of the score; it is never reported as "No robots.txt".
    // The fetch's errors are the site's: "Too many redirects", a redirect to
    // a restricted address (PR #1015 review), and the TypeErrors a site can
    // drive: a redirect whose Location does not parse (ERR_INVALID_URL, PR
    // #1017 review), undici's refusal of a credentialed redirect, "fetch
    // failed" and "terminated". None of them says anything about the page
    // being audited, and none counts against this capability's breaker. A
    // ReferenceError or SyntaxError cannot come from the site: it is a
    // defect in our own fetch code and must surface (PR #1017 delta review).
    if (isCapabilityRefusal(err)) throw err;
    if (err instanceof ReferenceError || err instanceof SyntaxError) throw err;
    robotsUnavailable = true;
    robotsError = err;
  }
  if (robotsRes) {
    try {
      if (robotsRes.ok) {
        robotsTxt = await readRobotsTxt(robotsRes);
      } else {
        await robotsRes.body?.cancel();
        if (robotsRes.status === 429 || robotsRes.status >= 500) throw httpUnavailable(ROBOTS, robotsRes.status);
      }
    } catch (err) {
      // degraded-ok: a robots.txt body that could not be read, a 429 or a 5xx is named in unavailable_sources and left out of the score, as above.
      if (isCapabilityRefusal(err)) throw err;
      // Our own defect is not the site's robots.txt being unreadable. Node's
      // fetch reports transport failures as TypeError("fetch failed") or
      // TypeError("terminated"); any other TypeError, ReferenceError or
      // SyntaxError here is a bug and must surface (PR #1015 delta review).
      if (isOwnDefect(err)) throw err;
      robotsUnavailable = true;
      robotsTxt = null;
      robotsError = err;
    }
  }
  if (robotsUnavailable) {
    // Name and class only: the message can carry the caller's URL and its
    // query string, which do not belong in the log.
    logWarn("seo-audit-robots-unavailable", "robots.txt could not be read; scored without it", {
      error_name: robotsError instanceof Error ? robotsError.name : typeof robotsError,
      error_class: robotsError instanceof Error ? robotsError.constructor.name : typeof robotsError,
      ...(robotsError instanceof UpstreamUnavailableError && robotsError.code ? { upstream_code: robotsError.code } : {}),
    });
  }
  const sitemapFound = robotsTxt !== null && robotsTxt.toLowerCase().includes("sitemap:");
  checks.robots_txt = { present: robotsUnavailable ? null : !!robotsTxt };
  checks.sitemap = { referenced_in_robots: robotsUnavailable ? null : sitemapFound };

  // Calculate scores
  let score = 0;
  const maxScore = 100;
  const issues: string[] = [];
  const fixes: Array<{ priority: string; issue: string; fix: string }> = [];

  if (checks.title && (checks.title as Record<string, unknown>).present) score += 15;
  else { issues.push("Missing title tag"); fixes.push({ priority: "high", issue: "Missing title tag", fix: "Add a unique, descriptive <title> between 30-60 characters" }); }

  if (checks.title && (checks.title as Record<string, unknown>).optimal) score += 5;
  else if ((checks.title as Record<string, unknown>).present) fixes.push({ priority: "medium", issue: "Title length not optimal", fix: `Title is ${(checks.title as Record<string, unknown>).length} chars. Aim for 30-60 characters.` });

  if (checks.meta_description && (checks.meta_description as Record<string, unknown>).present) score += 10;
  else { issues.push("Missing meta description"); fixes.push({ priority: "high", issue: "Missing meta description", fix: "Add a meta description between 120-160 characters" }); }

  if ((checks.h1 as Record<string, unknown>).optimal) score += 15;
  else if ((checks.h1 as Record<string, unknown>).count === 0) { issues.push("No H1 tag found"); fixes.push({ priority: "high", issue: "Missing H1", fix: "Add exactly one H1 tag per page" }); }
  else { issues.push(`${(checks.h1 as Record<string, unknown>).count} H1 tags found`); fixes.push({ priority: "medium", issue: "Multiple H1 tags", fix: "Use exactly one H1 per page" }); }

  if ((checks.images as Record<string, unknown>).without_alt === 0 && (checks.images as Record<string, unknown>).total as number > 0) score += 10;
  else if ((checks.images as Record<string, unknown>).without_alt as number > 0) { issues.push(`${(checks.images as Record<string, unknown>).without_alt} images missing alt text`); fixes.push({ priority: "medium", issue: "Images missing alt text", fix: "Add descriptive alt attributes to all images" }); }
  else score += 10;

  if ((checks.canonical as Record<string, unknown>).present) score += 5;
  else fixes.push({ priority: "low", issue: "No canonical URL", fix: "Add a <link rel='canonical'> tag" });

  if ((checks.open_graph as Record<string, unknown>).complete) score += 10;
  else fixes.push({ priority: "medium", issue: "Incomplete Open Graph tags", fix: "Add og:title, og:description, and og:image meta tags" });

  if ((checks.schema_org as Record<string, unknown>).present) score += 10;
  else fixes.push({ priority: "low", issue: "No structured data", fix: "Add JSON-LD schema.org markup" });

  // The robots.txt and sitemap checks are worth 10 points together.
  const robotsPoints = 10;
  if (!robotsUnavailable) {
    if ((checks.robots_txt as Record<string, unknown>).present) score += 5;
    else fixes.push({ priority: "medium", issue: "No robots.txt", fix: "Create a robots.txt file" });

    if (sitemapFound) score += 5;
    else fixes.push({ priority: "medium", issue: "No sitemap referenced", fix: "Create and reference an XML sitemap in robots.txt" });
  }

  score += 10; // base score

  // Unread checks are neither earned nor lost: the score is taken over the
  // points that were actually checked.
  const overallScore = robotsUnavailable ? Math.round((score * maxScore) / (maxScore - robotsPoints)) : score;

  return {
    output: {
      url: fullUrl,
      overall_score: Math.min(overallScore, maxScore),
      checks,
      issues,
      prioritized_fixes: fixes,
      ...(robotsUnavailable ? { unavailable_sources: [ROBOTS] } : {}),
    },
    provenance: { source: "html-analysis", fetched_at: new Date().toISOString() },
  };
});
