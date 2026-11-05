import type { APIRoute } from "astro";
import { json, renderAgentCard } from "../../lib/machine-readable.ts";

export const GET: APIRoute = ({ site }) => new Response(json(renderAgentCard(String(site))), { headers: { "Content-Type": "application/json; charset=utf-8" } });
