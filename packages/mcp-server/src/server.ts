#!/usr/bin/env node

/**
 * Strale MCP Server
 *
 * Architecture: Thin Proxy (Option A)
 * This MCP server calls the Strale HTTP API (POST /v1/do) for each tool invocation.
 * This keeps it decoupled from the API internals and leverages all existing middleware
 * (auth, rate limiting, circuit breaker, wallet locking, audit trail).
 *
 * At startup, it fetches all 233+ capabilities from GET /v1/capabilities and registers
 * each as an MCP tool. Agents can discover and call any capability directly.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const STRALE_BASE_URL =
  process.env.STRALE_BASE_URL ??
  "https://strale-production.up.railway.app";
const STRALE_API_KEY = process.env.STRALE_API_KEY ?? "";
const DEFAULT_MAX_PRICE_CENTS = parseInt(
  process.env.STRALE_MAX_PRICE_CENTS ?? "200",
  10,
);

// ─── Types ──────────────────────────────────────────────────────────────────

interface Capability {
  slug: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  input_schema: JsonSchema | null;
  output_schema: unknown;
  avg_latency_ms: number | null;
  success_rate: string | null;
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

interface JsonSchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
}

// ─── HTTP helpers ───────────────────────────────────────────────────────────

async function straleGet<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (STRALE_API_KEY) {
    headers.Authorization = `Bearer ${STRALE_API_KEY}`;
  }

  const resp = await fetch(`${STRALE_BASE_URL}${path}`, { headers });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Strale API ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json() as Promise<T>;
}

async function stralePost<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<{ data: T; status: number }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (STRALE_API_KEY) {
    headers.Authorization = `Bearer ${STRALE_API_KEY}`;
  }

  const resp = await fetch(`${STRALE_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = (await resp.json().catch(() => ({}))) as T;
  return { data, status: resp.status };
}

// ─── Build Zod schema from JSON Schema ──────────────────────────────────────

function jsonSchemaPropertyToZod(
  prop: JsonSchemaProperty,
): z.ZodTypeAny {
  switch (prop.type) {
    case "string":
      return prop.enum
        ? z.enum(prop.enum as [string, ...string[]])
        : z.string();
    case "number":
      return z.number();
    case "integer":
      return z.number().int();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(z.unknown());
    case "object":
      return z.record(z.unknown());
    default:
      return z.unknown();
  }
}

function buildInputSchema(
  cap: Capability,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const schema = cap.input_schema;

  // If no schema or no properties, use generic flexible input
  if (!schema?.properties || Object.keys(schema.properties).length === 0) {
    return z.object({
      task: z
        .string()
        .optional()
        .describe("Natural language description of what you need"),
      inputs: z
        .record(z.unknown())
        .optional()
        .describe("Structured input parameters"),
    });
  }

  const required = new Set(schema.required ?? []);
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, prop] of Object.entries(schema.properties)) {
    let field = jsonSchemaPropertyToZod(prop);
    if (prop.description) {
      field = (field as any).describe(prop.description);
    }
    if (!required.has(key)) {
      field = field.optional();
    }
    shape[key] = field;
  }

  return z.object(shape);
}

// ─── Capability execution ───────────────────────────────────────────────────

async function executeCapability(
  slug: string,
  inputs: Record<string, unknown>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  if (!STRALE_API_KEY) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "STRALE_API_KEY environment variable is required to execute capabilities. Set it in your MCP client configuration.",
          }),
        },
      ],
    };
  }

  const { data, status } = await stralePost<Record<string, unknown>>(
    "/v1/do",
    {
      capability_slug: slug,
      inputs,
      max_price_cents: DEFAULT_MAX_PRICE_CENTS,
    },
  );

  // Handle async execution (202)
  if (status === 202) {
    const txId = (data as any).transaction_id;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "executing",
            message: `Capability '${slug}' is running asynchronously.`,
            transaction_id: txId,
            poll_url: `${STRALE_BASE_URL}/v1/transactions/${txId}`,
            note: "Poll the transaction endpoint until status is 'completed' or 'failed'.",
          }),
        },
      ],
    };
  }

  // Handle errors
  if (status >= 400) {
    const errorCode = (data as any).error_code ?? "unknown_error";
    const message = (data as any).message ?? "Unknown error";
    const details = (data as any).details;

    let errorText = `Error (${errorCode}): ${message}`;
    if (errorCode === "insufficient_balance") {
      errorText += `\n\nTop up your wallet at: ${STRALE_BASE_URL}/v1/wallet/topup`;
    }
    if (errorCode === "capability_unavailable" && details?.next_retry_at) {
      errorText += `\nCapability will be available again at: ${details.next_retry_at}`;
    }
    if (details) {
      errorText += `\nDetails: ${JSON.stringify(details)}`;
    }

    return { content: [{ type: "text", text: errorText }] };
  }

  // Success — format the output
  const output = (data as any).output ?? data;
  const meta: Record<string, unknown> = {};
  if ((data as any).price_cents != null)
    meta.price_cents = (data as any).price_cents;
  if ((data as any).latency_ms != null)
    meta.latency_ms = (data as any).latency_ms;
  if ((data as any).wallet_balance_cents != null)
    meta.wallet_balance_cents = (data as any).wallet_balance_cents;
  if ((data as any).provenance) meta.provenance = (data as any).provenance;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ output, ...meta }, null, 2),
      },
    ],
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const server = new McpServer(
    {
      name: "strale",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // ── Fetch capabilities catalog ──────────────────────────────────────────
  let capabilities: Capability[] = [];
  try {
    const resp = await straleGet<{ capabilities: Capability[] }>(
      "/v1/capabilities",
    );
    capabilities = resp.capabilities;
    console.error(
      `[strale-mcp] Loaded ${capabilities.length} capabilities from ${STRALE_BASE_URL}`,
    );
  } catch (err) {
    console.error(
      `[strale-mcp] Warning: Failed to load capabilities: ${err instanceof Error ? err.message : err}`,
    );
    console.error(
      "[strale-mcp] Server will start with meta-tools only. Capability tools unavailable.",
    );
  }

  // ── Register each capability as an MCP tool ─────────────────────────────
  for (const cap of capabilities) {
    const price = `€${(cap.price_cents / 100).toFixed(2)}`;
    const description = `${cap.description} (Cost: ${price})`;

    try {
      const inputSchema = buildInputSchema(cap);

      server.registerTool(cap.slug, { description, inputSchema }, async (args) => {
        return executeCapability(cap.slug, args as Record<string, unknown>);
      });
    } catch (err) {
      console.error(
        `[strale-mcp] Warning: Failed to register tool '${cap.slug}': ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // ── Meta-tool: strale_search ────────────────────────────────────────────
  server.registerTool(
    "strale_search",
    {
      description:
        "Search and filter Strale capabilities by keyword or category. Use this to find the right capability before calling it. Returns matching capabilities with slug, description, price, and category.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "Search keyword (matched against name, description, slug)",
          ),
        category: z
          .string()
          .optional()
          .describe(
            "Filter by category (e.g., data-extraction, validation, finance, legal, logistics, recruiting, e-commerce, marketing)",
          ),
      }),
    },
    async ({ query, category }) => {
      const q = (query ?? "").toLowerCase();
      let matches = capabilities.filter((c) => {
        const text =
          `${c.name} ${c.description} ${c.slug} ${c.category}`.toLowerCase();
        return text.includes(q);
      });

      if (category) {
        const cat = category.toLowerCase();
        matches = matches.filter((c) => c.category.toLowerCase().includes(cat));
      }

      // Sort by relevance: exact slug match first, then name match, then description match
      matches.sort((a, b) => {
        const aSlug = a.slug.toLowerCase().includes(q) ? 0 : 1;
        const bSlug = b.slug.toLowerCase().includes(q) ? 0 : 1;
        if (aSlug !== bSlug) return aSlug - bSlug;
        const aName = a.name.toLowerCase().includes(q) ? 0 : 1;
        const bName = b.name.toLowerCase().includes(q) ? 0 : 1;
        return aName - bName;
      });

      const results = matches.slice(0, 20).map((c) => ({
        slug: c.slug,
        name: c.name,
        description: c.description,
        category: c.category,
        price: `€${(c.price_cents / 100).toFixed(2)}`,
        avg_latency_ms: c.avg_latency_ms,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                query,
                category: category ?? null,
                total_matches: matches.length,
                showing: results.length,
                results,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Meta-tool: strale_balance ───────────────────────────────────────────
  server.registerTool(
    "strale_balance",
    {
      description:
        "Check your Strale wallet balance. Shows current balance in EUR cents and EUR. Requires STRALE_API_KEY.",
      inputSchema: z.object({}),
    },
    async () => {
      if (!STRALE_API_KEY) {
        return {
          content: [
            {
              type: "text" as const,
              text: "STRALE_API_KEY environment variable is required. Set it in your MCP client configuration.",
            },
          ],
        };
      }

      try {
        const balance = await straleGet<{
          balance_cents: number;
          currency: string;
        }>("/v1/wallet/balance");

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  balance_cents: balance.balance_cents,
                  balance_eur: `€${(balance.balance_cents / 100).toFixed(2)}`,
                  currency: balance.currency,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching balance: ${err instanceof Error ? err.message : err}`,
            },
          ],
        };
      }
    },
  );

  // ── Connect via stdio ───────────────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(
    `[strale-mcp] Server running on stdio (${capabilities.length} tools + 2 meta-tools)`,
  );
}

main().catch((err) => {
  console.error("[strale-mcp] Fatal error:", err);
  process.exit(1);
});
