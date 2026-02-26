import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml } from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

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
    try {
      const linkUrl = new URL(linkMatch[1], fullUrl);
      if (linkUrl.hostname === domain) internal++;
      else external++;
    } catch { /* skip invalid URLs */ }
  }
  checks.links = { internal, external, ratio: internal > 0 ? +(external / internal).toFixed(2) : 0 };

  // Check robots.txt and sitemap
  const baseUrl = `${new URL(fullUrl).protocol}//${domain}`;
  let robotsTxt: string | null = null;
  let sitemapFound = false;
  try {
    const robotsRes = await fetch(`${baseUrl}/robots.txt`, { signal: AbortSignal.timeout(5000) });
    if (robotsRes.ok) {
      robotsTxt = await robotsRes.text();
      sitemapFound = robotsTxt.toLowerCase().includes("sitemap:");
    }
  } catch { /* robots.txt not available */ }
  checks.robots_txt = { present: !!robotsTxt };
  checks.sitemap = { referenced_in_robots: sitemapFound };

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

  if ((checks.robots_txt as Record<string, unknown>).present) score += 5;
  else fixes.push({ priority: "medium", issue: "No robots.txt", fix: "Create a robots.txt file" });

  if (sitemapFound) score += 5;
  else fixes.push({ priority: "medium", issue: "No sitemap referenced", fix: "Create and reference an XML sitemap in robots.txt" });

  score += 10; // base score

  return {
    output: {
      url: fullUrl,
      overall_score: Math.min(score, maxScore),
      checks,
      issues,
      prioritized_fixes: fixes,
    },
    provenance: { source: "html-analysis", fetched_at: new Date().toISOString() },
  };
});
