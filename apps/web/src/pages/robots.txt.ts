import type { APIRoute } from "astro";
import { getSiteData } from "../lib/site-data.ts";
import { renderRobots } from "../lib/sitemap.ts";

export const GET: APIRoute = async ({ site }) => {
  const data = await getSiteData();
  return new Response(renderRobots(data.mode, String(site)), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
