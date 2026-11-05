import type { APIRoute } from "astro";
import { json, renderMcpCard } from "../../lib/machine-readable.ts";

export const GET: APIRoute = ({ site }) => new Response(json(renderMcpCard(String(site))), { headers: { "Content-Type": "application/json; charset=utf-8" } });
