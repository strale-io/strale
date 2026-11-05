import type { APIRoute } from "astro";
import { getSiteData } from "../lib/site-data.ts";
import { renderSitemap, sitemapPaths } from "../lib/sitemap.ts";

export const GET: APIRoute = async ({ site }) => {
  const data = await getSiteData();
  return new Response(renderSitemap(sitemapPaths(data), String(site)), { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
