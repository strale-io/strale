/**
 * Narrow MCP entry points (distribution track D7).
 *
 * Each entry point is a focused subset of the Strale catalogue served from the
 * same backend as the broad server: one named MCP server per job, with one
 * tool per capability, so a directory listing and the agent's tools/list both
 * say what the server is for. Nothing here changes how a capability executes;
 * every tool call goes through executeCapability and POST /v1/do exactly as
 * strale_execute does.
 *
 * Measurement is the point of the experiment (docs/research/
 * 2026-10-27-distribution-strategy.md §8 D7: one narrow server must beat the
 * broad one's weekly uses within 45 days, or all of them are retired). So each
 * entry point carries its own attribution tag, `mcp-<id>`, which every
 * forwarded call and x402 hand-off carries as `src`, and the HTTP route
 * labels its funnel rows `/mcp/<id>:…` instead of `/mcp:…`.
 *
 * The registry entries for these servers live in
 * packages/mcp-server/entry-points/<id>/server.json; a test keeps them in step
 * with this file. Registry entries cannot be deleted, so an entry point is
 * added here only with its own reviewed server.json.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  buildInputSchema,
  executeCapability,
  type Capability,
  type StraleClientOptions,
} from "./tools.js";

export interface EntryPoint {
  /** URL path segment under /mcp and the registry name suffix. */
  id: string;
  /** Attribution tag forwarded as `src` on every call: `mcp-<id>`. */
  src: string;
  /** MCP server name reported in initialize. */
  serverName: string;
  title: string;
  /** Capability slugs exposed as tools, in tools/list order. */
  slugs: readonly string[];
}

const COMPANY_REGISTRY_SLUGS = [
  "uk-company-data",
  "us-company-data",
  "german-company-data",
  "french-company-data",
  "spanish-company-data",
  "irish-company-data",
  "belgian-company-data",
  "austrian-company-data",
  "swiss-company-data",
  "polish-company-data",
  "cz-company-data",
  "slovak-company-data",
  "slovenian-company-data",
  "croatian-company-data",
  "greek-company-data",
  "swedish-company-data",
  "norwegian-company-data",
  "finnish-company-data",
  "estonian-company-data",
  "latvian-company-data",
  "canadian-company-data",
  "brazilian-company-data",
  "au-company-data",
  "singapore-company-data",
  "japanese-company-data",
] as const;

export const ENTRY_POINTS: readonly EntryPoint[] = [
  {
    id: "company-check",
    src: "mcp-company-check",
    serverName: "strale-company-check",
    title: "Strale Company Check",
    // Name screening is one tool among several, not the server's headline:
    // compliance-specific targeting stays behind DEC-20260812-A's gate.
    slugs: [...COMPANY_REGISTRY_SLUGS, "lei-lookup", "vat-validate", "sanctions-check"],
  },
  {
    id: "eu-vat-check",
    src: "mcp-eu-vat-check",
    serverName: "strale-eu-vat-check",
    title: "Strale EU VAT Check",
    slugs: [
      "vat-validate",
      "vat-format-validate",
      "vat-rate-lookup",
      "cz-unreliable-vat-payer",
      "eori-validate",
      "iban-validate",
      "iban-to-bank",
    ],
  },
  {
    id: "web-reader",
    src: "mcp-web-reader",
    serverName: "strale-web-reader",
    title: "Strale Web Page Reader",
    slugs: ["url-to-markdown", "url-to-text", "meta-extract", "link-extract", "web-extract"],
  },
];

export function findEntryPoint(id: string): EntryPoint | undefined {
  return ENTRY_POINTS.find((e) => e.id === id);
}

function formatPrice(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

/**
 * Register one tool per capability of the entry point that the live catalogue
 * currently serves. A slug missing from the catalogue (deactivated, hidden)
 * gets no tool rather than a tool that can only fail. Returns the names
 * registered.
 */
export function registerEntryPointTools(
  server: McpServer,
  entry: EntryPoint,
  capabilities: Capability[],
  opts: StraleClientOptions,
): string[] {
  const entryOpts: StraleClientOptions = { ...opts, src: entry.src };
  const registered: string[] = [];

  for (const slug of entry.slugs) {
    const cap = capabilities.find((c) => c.slug === slug);
    if (!cap) continue;

    const description = cap.is_free_tier
      ? `${cap.description} Free: no wallet debit with an API key, and no key or payment needed within the monthly per-IP allowance (see GET /v1/platform/facts).`
      : `${cap.description} Paid: ${formatPrice(cap.price_cents)} per call, debited from the wallet of the API key sent in the Authorization header. Without a key it returns the x402 pay-per-call endpoint for this capability instead of a result.`;

    server.registerTool(
      slug,
      {
        title: cap.name,
        // Same hints as strale_execute for paid tools: a call spends wallet
        // money and is not repeatable for free. A free-tier tool spends
        // nothing and only reads.
        annotations: cap.is_free_tier
          ? { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
          : { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
        description,
        inputSchema: buildInputSchema(cap),
      },
      async (inputs) => {
        return executeCapability(slug, inputs as Record<string, unknown>, entryOpts, capabilities, {
          tool: slug,
          nextSteps: [],
        });
      },
    );
    registered.push(slug);
  }

  return registered;
}
