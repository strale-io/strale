// The static machine-readable files the site serves: /llms.txt, /.well-known/agent.json and
// /.well-known/mcp.json (SWITCH-OVER-READINESS item 6; SITE-STRUCTURE "Machine-readable surfaces").
//
// They are deliberately short pointers. Everything that changes (the tool list, prices, which tools
// take x402, counts) lives in the API, which stays the authority: api.strale.io/llms.txt,
// /x402/catalog, /.well-known/x402.json, /v1/platform/facts, /openapi.json and the agent and MCP
// cards. So these files type no count and no price, and say "eligible tools" wherever x402 appears.
// The positioning copy is src/content/positioning.ts; the host is the build's site URL, never a literal.
//
// The JSON cards keep the keys of the files they replace (strale-frontend public/.well-known), so a
// consumer that read the old card reads this one.
import { L1, SENTENCE } from "../content/positioning.ts";

/** The API host the files point to. The API's own address, unlike the site's, is not configurable. */
export const API = "https://api.strale.io";

/** Every API path these files link to. test/machine-readable.test.ts checks each is a real route in apps/api. */
export const API_PATHS = {
  llms: "/llms.txt",
  x402Catalog: "/x402/catalog",
  x402Discovery: "/.well-known/x402.json",
  facts: "/v1/platform/facts",
  openapi: "/openapi.json",
  mcp: "/mcp",
  agentCard: "/.well-known/agent-card.json",
  a2a: "/a2a",
  do: "/v1/do",
} as const;

const base = (site: string) => site.replace(/\/$/, "");
const api = (k: keyof typeof API_PATHS) => API + API_PATHS[k];

export function renderLlmsTxt(site: string): string {
  const s = base(site);
  return `# Strale

> ${L1.headline}

${SENTENCE}

${L1.perCall} ${L1.x402}

This file is a short pointer. The authoritative, current list of tools, prices and counts is served by the API, so read it there.

## Read

- [Dynamic llms.txt](${api("llms")}): the API's own, generated from the live catalogue
- [Tool catalogue](${s}/tools): each tool's inputs, price and limits
- [Platform facts](${api("facts")}): live counts and settings
- [OpenAPI document](${api("openapi")}): the REST API reference
- [x402 catalog](${api("x402Catalog")}): which tools can be paid per request over x402, with USD prices
- [x402 discovery](${api("x402Discovery")}): machine-readable x402 listing

## Connect

- [MCP endpoint](${api("mcp")}): Streamable HTTP; Authorization: Bearer <API key>
- [REST API](${api("openapi")}): call POST ${api("do")} with a capability_slug, an inputs object and max_price_cents
- [Agent card](${s}/.well-known/agent.json): a pointer card; the canonical A2A card is ${api("agentCard")}
- [MCP server card](${s}/.well-known/mcp.json): how to connect over MCP

## Pay

- API key: create one at ${s}/signup, top up a prepaid wallet, pay per call.
- x402: on eligible tools only, pay per request in USDC on Base with no signup. Not every tool is eligible, so check the x402 catalog (${api("x402Catalog")}) before relying on it.

## Docs

- [Docs](${s}/docs): connect and make a first call
- [MCP](${s}/docs/mcp): set up the MCP connection
- [x402](${s}/docs/x402): pay per request without signup, on eligible tools
- [Pricing](${s}/pricing): how per-call pricing works
`;
}

// A pointer card, not a full A2A AgentCard: it has no skills and no $schema (the old file's schema
// URL returns 404). The canonical A2A card, with the skills, is links.canonical_agent_card.
export function renderAgentCard(site: string): Record<string, unknown> {
  const s = base(site);
  return {
    name: "Strale",
    description: `${L1.headline} ${SENTENCE} Live counts at ${api("facts")}.`,
    url: api("a2a"),
    version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false },
    authentication: {
      schemes: ["bearer"],
      description: `API key (sk_live_...), created at ${s}/signup. On eligible tools an x402 wallet can pay per request instead, with no signup: see ${api("x402Catalog")}.`,
    },
    links: {
      canonical_agent_card: api("agentCard"),
      mcp_server: api("mcp"),
      documentation: `${s}/docs`,
      pricing: `${s}/pricing`,
      signup: `${s}/signup`,
    },
  };
}

export function renderMcpCard(site: string): Record<string, unknown> {
  const s = base(site);
  return {
    name: "strale",
    description: `${L1.headline} ${SENTENCE} Live counts at ${api("facts")}.`,
    url: api("mcp"),
    transport: "streamable-http",
    authentication: {
      type: "bearer",
      description: `API key starting with sk_live_. Create one at ${s}/signup. The strale_search tool works without a key.`,
    },
    documentation: `${s}/docs`,
    pricing: `${s}/pricing`,
  };
}

/** The serialised JSON the endpoints send, so the pages and the tests read one function. */
export const json = (card: Record<string, unknown>) => JSON.stringify(card, null, 2) + "\n";

/** Every file's text, for the claims checks (test/machine-readable.test.ts, test-built). */
export function allMachineReadableText(site: string): { file: string; text: string }[] {
  return [
    { file: "llms.txt", text: renderLlmsTxt(site) },
    { file: ".well-known/agent.json", text: json(renderAgentCard(site)) },
    { file: ".well-known/mcp.json", text: json(renderMcpCard(site)) },
  ];
}
