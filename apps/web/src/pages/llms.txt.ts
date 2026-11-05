import type { APIRoute } from "astro";
import { renderLlmsTxt } from "../lib/machine-readable.ts";

export const GET: APIRoute = ({ site }) => new Response(renderLlmsTxt(String(site)), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
