// What the build tells crawlers: sitemap.xml and robots.txt, from the same catalogue the pages
// are generated from (src/lib/site-data.ts). Pure functions; the endpoints in src/pages/ call them.
//
// A preview build (STRALE_SITE_DATA=manifests) is never indexable: robots.txt disallows everything
// and the sitemap lists nothing. Every page also carries a noindex meta in that mode (Base.astro).
import { tools } from "./site-data.ts";
import { countryRows } from "./company-data.ts";
import { USE_CASES } from "../content/use-cases.ts";
import { loadGuides } from "./guides.ts";
import type { SiteData } from "./types.ts";

/** Hand-written pages that are built and indexable. Each is src/pages/<path>.astro (or <path>/index.astro). */
export const STATIC_PATHS = ["/", "/tools", "/company-data", "/use-cases", "/pricing", "/docs", "/docs/mcp", "/docs/api", "/docs/x402", "/docs/sdks", "/guides", "/security", "/about", "/privacy", "/terms", "/signup"];

/** Built pages that stay out of the sitemap: private-link pages and the wallet flow. /audit is also noindex. */
export const EXCLUDED_PATHS = ["/audit", "/topup"];

/** The path a built file answers at: "/tools.html" and "/tools/x.html" (build.format "file") are "/tools" and "/tools/x"; "/index.html" and "/index" are "/". Pages 308s the .html forms to these. */
export function canonicalPath(pathname: string): string {
  const p = pathname.replace(/\.html$/, "").replace(/\/index$/, "");
  return p === "" ? "/" : p;
}

/** Every page the build emits for indexing (hand-written and generated), whatever the build mode. */
export function pagePaths(d: SiteData): string[] {
  const generated = [
    ...tools(d).map((t) => `/tools/${t.slug}`),
    ...d.solutions.map((s) => `/solutions/${s.slug}`),
    ...countryRows(d).map((c) => `/company-data/${c.path}`),
    ...USE_CASES.map((u) => `/use-cases/${u.slug}`),
    ...loadGuides().map((g) => `/guides/${g.slug}`),
  ].sort();
  return [...STATIC_PATHS, ...generated];
}

/** Every indexable path, in a stable order. Empty for a preview build. */
export function sitemapPaths(d: SiteData): string[] {
  return d.mode === "live" ? pagePaths(d) : [];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderSitemap(paths: string[], site: string): string {
  const base = site.replace(/\/$/, "");
  const urls = paths.map((p) => `  <url><loc>${esc(base + p)}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls ? "\n" + urls + "\n" : ""}</urlset>\n`;
}

export function renderRobots(mode: SiteData["mode"], site: string): string {
  if (mode !== "live") return "User-agent: *\nDisallow: /\n";
  return `User-agent: *\nAllow: /\n\nSitemap: ${site.replace(/\/$/, "")}/sitemap.xml\n`;
}
