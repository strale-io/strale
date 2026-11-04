// Facts and first-call data the Docs pages state. Limits are read from the API source at build
// time (the way lib/code-facts.ts does), so a constant that moves fails the build instead of
// leaving a number in the docs that the API no longer enforces.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT, API_BASE, tools, type Tool } from "../lib/site-data.ts";
import { usdcAtomic } from "../lib/format.ts";
import type { SiteData } from "../lib/types.ts";
import { toolSnippets } from "../lib/snippets.ts";

function grabText(file: string, re: RegExp, what: string): string {
  const m = readFileSync(resolve(REPO_ROOT, file), "utf8").match(re);
  if (!m) throw new Error(`apps/web docs expected ${what} in ${file}; update src/content/docs-facts.ts if it moved`);
  return m[1];
}
function grab(file: string, re: RegExp, what: string): number {
  return Number(grabText(file, re, what).replace(/_/g, ""));
}

/** The USDC contract on Base mainnet that x402 payments are made in (routes/x402-gateway-v2.ts). */
export const BASE_USDC_ADDRESS = grabText("apps/api/src/routes/x402-gateway-v2.ts", /"base":\s*"(0x[0-9a-fA-F]{40})"/, "the Base USDC contract");
/** How long a signed x402 payment authorisation stays valid, in seconds (routes/x402-gateway-v2.ts, build402). */
export const X402_PAYMENT_TIMEOUT_SECONDS = grab("apps/api/src/routes/x402-gateway-v2.ts", /maxTimeoutSeconds:\s*(\d+)/, "maxTimeoutSeconds");

/** Requests per second one API key may send to POST /v1/do (apps/api/src/routes/do.ts, rateLimitByKey). */
export const KEY_REQUESTS_PER_SECOND = grab("apps/api/src/routes/do.ts", /rateLimitByKey\((\d+), 1000\)/, "the per-key rate limit");
/** Longest Idempotency-Key the API accepts, in characters (do.ts). */
export const IDEMPOTENCY_KEY_MAX = grab("apps/api/src/routes/do.ts", /idempotencyKey\.length > (\d+)/, "the Idempotency-Key length check");
/** Default and largest timeout_seconds for POST /v1/do (do.ts). */
export const DEFAULT_TIMEOUT_SECONDS = grab("apps/api/src/routes/do.ts", /const DEFAULT_TIMEOUT_SECONDS\s*=\s*(\d+)/, "DEFAULT_TIMEOUT_SECONDS");
export const MAX_TIMEOUT_SECONDS = grab("apps/api/src/routes/do.ts", /const MAX_TIMEOUT_SECONDS\s*=\s*(\d+)/, "MAX_TIMEOUT_SECONDS");
/** Tools whose measured latency is above this run asynchronously, in seconds (lib/execution-routing.ts). */
export const ASYNC_THRESHOLD_SECONDS = grab("apps/api/src/lib/execution-routing.ts", /ASYNC_THRESHOLD_MS\s*=\s*([\d_]+)/, "ASYNC_THRESHOLD_MS") / 1000;
/** Each account's hourly spend limit, in EUR cents, until it is changed (db/schema.ts, users.max_spend_per_hour_cents). */
export const HOURLY_SPEND_CAP_CENTS = grab("apps/api/src/db/schema.ts", /max_spend_per_hour_cents"\)\s*\.notNull\(\)\s*\.default\((\d+)\)/, "the default hourly spend limit");

/** The price ceiling the MCP server sends when a strale_execute call sets none, in EUR cents (packages/mcp-server/src/server.ts). */
export const MCP_DEFAULT_MAX_PRICE_CENTS = grab("packages/mcp-server/src/server.ts", /STRALE_MAX_PRICE_CENTS \?\? "(\d+)"/, "the STRALE_MAX_PRICE_CENTS default");

/** The free tool the first-call walkthroughs use: iban-validate, then email-validate, then any free tool. */
export function firstCallTool(data: SiteData): { tool: Tool; inputs: Record<string, unknown>; output: Record<string, unknown> | null } {
  const free = tools(data).filter((t) => t.free);
  const tool = free.find((t) => t.slug === "iban-validate") ?? free.find((t) => t.slug === "email-validate") ?? free[0];
  if (!tool) throw new Error("The Docs pages need at least one free tool to walk through, and the catalogue has none");
  const inputs = data.manifests.get(tool.slug)?.example_input;
  if (!inputs) throw new Error(`The Docs pages need an example input for ${tool.slug} (manifests/${tool.slug}.yaml test_fixtures)`);
  return { tool, inputs, output: (tool.output_schema?.example as Record<string, unknown> | undefined) ?? null };
}

export function firstCallSnippets(data: SiteData) {
  const { tool, inputs } = firstCallTool(data);
  return toolSnippets({ slug: tool.slug, inputs, priceCents: tool.price_cents, free: true, x402: null });
}

/** CAIP-2 name for the catalogue's network label (the catalogue says "base"). */
export function caip2(network: string): string {
  return network === "base" ? "eip155:8453" : network === "base-sepolia" ? "eip155:84532" : network;
}

/** The lowest-priced paid tool that accepts x402 and has an example input, for the x402 walkthrough. */
export function cheapestX402Tool(data: SiteData): { tool: Tool; inputs: Record<string, unknown>; method: string; priceUsd: number; atomic: string; url: string; v2Url: string } {
  const pick = tools(data)
    .filter((t) => t.x402 && t.x402.price_usd > 0 && data.manifests.get(t.slug)?.example_input)
    .sort((a, b) => a.x402!.price_usd - b.x402!.price_usd || a.slug.localeCompare(b.slug))[0];
  if (!pick || !pick.x402) throw new Error("The x402 page needs at least one paid tool that accepts x402 and has an example input");
  const inputs = data.manifests.get(pick.slug)!.example_input as Record<string, unknown>;
  const method = pick.x402.method.toUpperCase();
  const scalar = Object.values(inputs).every((v) => v === null || typeof v !== "object");
  const useGet = method === "GET" && scalar;
  const query = useGet ? `?${new URLSearchParams(Object.entries(inputs).map(([k, v]) => [k, String(v)])).toString()}` : "";
  return {
    tool: pick,
    inputs,
    method: useGet ? "GET" : "POST",
    priceUsd: pick.x402.price_usd,
    atomic: usdcAtomic(pick.x402.price_usd),
    url: `${API_BASE}/x402/${pick.slug}${query}`,
    v2Url: `${API_BASE}/x402/v2/${pick.slug}${query}`,
  };
}
