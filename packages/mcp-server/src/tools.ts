/**
 * Shared tool registration for the Strale MCP server.
 *
 * This module is the single source of truth for MCP tool definitions.
 * It is used by both the stdio transport (server.ts) and the
 * Streamable HTTP transport (apps/api/src/routes/mcp.ts).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Solution {
  slug: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  geography: string;
  step_count: number;
  capabilities: string[];
  transparency_tag: string | null;
}

export interface Capability {
  slug: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  input_schema: JsonSchema | null;
  output_schema: unknown;
  avg_latency_ms: number | null;
  success_rate: string | null;
  sqs_score?: number;
  sqs_label?: string;
}

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface JsonSchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
}

export interface TrustBatchEntry {
  passed: number;
  failed: number;
  total: number;
  pass_rate: number | null;
  sqs_score: number;
  sqs_label: string;
}

export interface StraleClientOptions {
  baseUrl: string;
  apiKey: string;
  maxPriceCents: number;
}

// ─── HTTP helpers ───────────────────────────────────────────────────────────

export async function straleGet<T>(
  path: string,
  opts: { baseUrl: string; apiKey: string },
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (opts.apiKey) {
    headers.Authorization = `Bearer ${opts.apiKey}`;
  }

  const resp = await fetch(`${opts.baseUrl}${path}`, { headers });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Strale API ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json() as Promise<T>;
}

export async function stralePost<T>(
  path: string,
  body: Record<string, unknown>,
  opts: { baseUrl: string; apiKey: string },
): Promise<{ data: T; status: number }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (opts.apiKey) {
    headers.Authorization = `Bearer ${opts.apiKey}`;
  }

  const resp = await fetch(`${opts.baseUrl}${path}`, {
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

export function buildInputSchema(
  cap: Capability,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const schema = cap.input_schema;

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

export async function executeCapability(
  slug: string,
  inputs: Record<string, unknown>,
  opts: StraleClientOptions,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  if (!opts.apiKey) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error:
              "API key required. For stdio: set STRALE_API_KEY env var. For HTTP: pass Authorization: Bearer sk_live_... header.",
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
      max_price_cents: opts.maxPriceCents,
    },
    opts,
  );

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
            poll_url: `${opts.baseUrl}/v1/transactions/${txId}`,
            note: "Poll the transaction endpoint until status is 'completed' or 'failed'.",
          }),
        },
      ],
    };
  }

  if (status >= 400) {
    const errorCode = (data as any).error_code ?? "unknown_error";
    const message = (data as any).message ?? "Unknown error";
    const details = (data as any).details;

    let errorText = `Error (${errorCode}): ${message}`;
    if (errorCode === "insufficient_balance") {
      errorText += `\n\nTop up your wallet at: ${opts.baseUrl}/v1/wallet/topup`;
    }
    if (errorCode === "capability_unavailable" && details?.next_retry_at) {
      errorText += `\nCapability will be available again at: ${details.next_retry_at}`;
    }
    if (details) {
      errorText += `\nDetails: ${JSON.stringify(details)}`;
    }

    return { content: [{ type: "text", text: errorText }] };
  }

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

// ─── Fetch capabilities ─────────────────────────────────────────────────────

export async function fetchCapabilities(
  baseUrl: string,
): Promise<Capability[]> {
  const resp = await straleGet<{ capabilities: Capability[] }>(
    "/v1/capabilities",
    { baseUrl, apiKey: "" },
  );
  return resp.capabilities;
}

export async function fetchSolutions(baseUrl: string): Promise<Solution[]> {
  const resp = await straleGet<{ solutions: Record<string, unknown>[] }>(
    "/v1/solutions",
    { baseUrl, apiKey: "" },
  );
  return resp.solutions.map((s) => ({
    slug: s.slug as string,
    name: s.name as string,
    description: s.description as string,
    category: s.category as string,
    price_cents: s.priceCents as number,
    geography: s.geography as string,
    step_count: s.stepCount as number,
    capabilities: (s.capabilities as string[]) ?? [],
    transparency_tag: (s.transparencyTag as string) ?? null,
  }));
}

export async function fetchTrustBatch(
  baseUrl: string,
  slugs: string[],
): Promise<Map<string, TrustBatchEntry>> {
  const map = new Map<string, TrustBatchEntry>();
  // Chunk into batches of 50
  for (let i = 0; i < slugs.length; i += 50) {
    const chunk = slugs.slice(i, i + 50);
    const param = chunk.join(",");
    try {
      const resp = await straleGet<Record<string, TrustBatchEntry>>(
        `/v1/internal/trust/capabilities/batch?slugs=${encodeURIComponent(param)}`,
        { baseUrl, apiKey: "" },
      );
      for (const [slug, entry] of Object.entries(resp)) {
        map.set(slug, entry);
      }
    } catch (err) {
      console.error(
        `[strale-mcp] Failed to fetch trust batch: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  return map;
}

// ─── Register all tools on an McpServer ─────────────────────────────────────

export function registerStraleTools(
  server: McpServer,
  capabilities: Capability[],
  solutions: Solution[],
  opts: StraleClientOptions,
  trustData?: Map<string, TrustBatchEntry>,
): void {
  // Register each capability as an MCP tool
  for (const cap of capabilities) {
    const price = `€${(cap.price_cents / 100).toFixed(2)}`;
    const description = `${cap.description} (Cost: ${price})`;

    try {
      const inputSchema = buildInputSchema(cap);

      server.registerTool(
        cap.slug,
        { description, inputSchema },
        async (args) => {
          return executeCapability(
            cap.slug,
            args as Record<string, unknown>,
            opts,
          );
        },
      );
    } catch (err) {
      console.error(
        `[strale-mcp] Warning: Failed to register tool '${cap.slug}': ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // Meta-tool: strale_search (works without API key)
  server.registerTool(
    "strale_search",
    {
      description:
        "Search and filter Strale capabilities and solutions by keyword or category. Use this to find the right tool before calling it. Returns matching items with slug, description, price, and category. Supports pagination via the offset parameter (20 results per page).",
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
        offset: z
          .number()
          .optional()
          .describe("Number of results to skip (for pagination). Default: 0"),
      }),
    },
    async ({ query, category, offset }) => {
      const q = (query ?? "").toLowerCase();
      const skip = offset ?? 0;

      const catFilter = category ? category.toLowerCase() : null;

      // Match solutions
      const matchedSolutions = solutions
        .filter((s) => {
          if (catFilter && !s.category.toLowerCase().includes(catFilter)) return false;
          const text = `${s.name} ${s.description} ${s.slug} ${s.category}`.toLowerCase();
          return text.includes(q);
        })
        .map((s) => ({
          type: "solution" as const,
          slug: s.slug,
          name: s.name,
          description: s.description,
          category: s.category,
          price: `€${(s.price_cents / 100).toFixed(2)}`,
          geography: s.geography,
          step_count: s.step_count,
          capabilities: s.capabilities,
        }));

      // Match capabilities
      let matchedCaps = capabilities.filter((c) => {
        if (catFilter && !c.category.toLowerCase().includes(catFilter)) return false;
        const text = `${c.name} ${c.description} ${c.slug} ${c.category}`.toLowerCase();
        return text.includes(q);
      });

      matchedCaps.sort((a, b) => {
        const aSlug = a.slug.toLowerCase().includes(q) ? 0 : 1;
        const bSlug = b.slug.toLowerCase().includes(q) ? 0 : 1;
        if (aSlug !== bSlug) return aSlug - bSlug;
        const aName = a.name.toLowerCase().includes(q) ? 0 : 1;
        const bName = b.name.toLowerCase().includes(q) ? 0 : 1;
        return aName - bName;
      });

      const capResults = matchedCaps.map((c) => {
        const trust = trustData?.get(c.slug);
        const sqsScore = trust?.sqs_score ?? c.sqs_score ?? null;
        let trustGrade: string | null = null;
        if (sqsScore !== null && sqsScore > 0) {
          trustGrade = sqsScore >= 90 ? "A" : sqsScore >= 75 ? "B" : sqsScore >= 60 ? "C" : "D";
        }
        const badge = trust && trust.total > 0 ? "strale_tested" : null;

        return {
          type: "capability" as const,
          slug: c.slug,
          name: c.name,
          description: c.description,
          category: c.category,
          price: `€${(c.price_cents / 100).toFixed(2)}`,
          avg_latency_ms: c.avg_latency_ms,
          sqs_score: sqsScore,
          sqs_label: trust?.sqs_label ?? c.sqs_label ?? null,
          trust_grade: trustGrade,
          badge,
        };
      });

      // Solutions first, then capabilities
      const combined = [...matchedSolutions, ...capResults];
      const page = combined.slice(skip, skip + 20);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                query,
                category: category ?? null,
                total_solution_matches: matchedSolutions.length,
                total_capability_matches: matchedCaps.length,
                offset: skip,
                showing: page.length,
                has_more: skip + page.length < combined.length,
                results: page,
                tip: "Call strale_trust_profile for full trust details on any result.",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // Meta-tool: strale_balance (requires API key)
  server.registerTool(
    "strale_balance",
    {
      description:
        "Check your Strale wallet balance. Shows current balance in EUR cents and EUR. Requires API key.",
      inputSchema: z.object({}),
    },
    async () => {
      if (!opts.apiKey) {
        return {
          content: [
            {
              type: "text" as const,
              text: "API key required. For stdio: set STRALE_API_KEY env var. For HTTP: pass Authorization: Bearer sk_live_... header.",
            },
          ],
        };
      }

      try {
        const balance = await straleGet<{
          balance_cents: number;
          currency: string;
        }>("/v1/wallet/balance", opts);

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

  // Meta-tool: strale_methodology (no API key required)
  server.registerTool(
    "strale_methodology",
    {
      description:
        "Get Strale's complete quality and trust methodology. Explains SQS scoring, trust grades, test infrastructure, provenance tracking, audit trails, badge system, and current limitations. Call this first to understand how Strale measures quality.",
      inputSchema: z.object({}),
    },
    async () => {
      const methodologyText = `STRALE QUALITY & TRUST METHODOLOGY

1. WHAT STRALE IS
Strale is trust and quality infrastructure for AI agents. Agents call capabilities (atomic data operations) and solutions (multi-step workflows) via a unified API. Every execution is independently tested, scored, and auditable.

2. SQS (STRALE QUALITY SCORE)
Five-factor weighted score per capability:
- Correctness (40%): Does the output contain accurate, expected data?
- Schema Conformance (25%): Does the output match the declared schema?
- Availability (20%): Is the capability reliably reachable?
- Error Handling (10%): Are errors caught and reported cleanly?
- Edge Cases (5%): Does it handle unusual inputs gracefully?

Score range: 0–100. Computed from automated test suite results.

3. TRUST GRADES
- Freshness Grade: How recently the capability was tested (A = <24h, B = <72h, C = <7d, D = older)
- Latency Grade: Response time percentile (A = <500ms p95, B = <2s, C = <5s, D = >5s)
- Combined Trust Grade: Weighted combination of SQS + freshness + latency

4. PROVENANCE TRACKING
Every execution returns:
- source: which external service provided the data
- fetched_at: ISO timestamp of when data was retrieved
- External service failures are attributed to the upstream provider, not Strale

5. AUDIT TRAIL (per transaction)
Recorded for every execution:
- Full input parameters
- Full output data
- Execution latency (ms)
- Price charged (cents)
- Provenance metadata
- Success/failure status
- Failure categorization: "upstream" (provider timeout, rate limit, 5xx) vs "internal" (Strale bug)

6. TEST INFRASTRUCTURE
- 1,215 active test suites across all capabilities
- Tiered scheduling: Tier A (critical) tested most frequently, Tier B moderate, Tier C weekly
- Automated failure categorization distinguishes upstream issues from internal bugs
- Health sweep runs weekly: classifies failures, proposes remediations, detects stale tests
- Test types: schema_check, smoke_test, value_check, edge_case

7. BADGE SYSTEM
- strale_tested: Automated test suite coverage, internal testing data only
- strale_monitored: Real customer usage data + automated testing
- strale_verified: 500+ customer transactions with sustained >80% success rate

8. CURRENT LIMITATIONS (honest disclosure)
- Zero external users — all transaction data is from internal testing
- No SOC 2, ISO 27001, or HIPAA certification
- No contractual SLAs
- Badge status is "strale_tested" for all capabilities (no customer transaction volume yet)
- Quality scores reflect test conditions, not production load

9. TRUST PROFILE ACCESS
- Per capability: call strale_trust_profile with type "capability" and the slug
- Per solution: call strale_trust_profile with type "solution" and the slug
- Methodology page: https://strale.dev/trust/methodology`;

      return { content: [{ type: "text" as const, text: methodologyText }] };
    },
  );

  // Meta-tool: strale_trust_profile (no API key required)
  server.registerTool(
    "strale_trust_profile",
    {
      description:
        "Get the full trust profile for any capability or solution. Returns SQS scores, test results, pass rates, failure details, limitations, badge status, and quality narrative. Use this to verify trust data for a specific capability or solution.",
      inputSchema: z.object({
        slug: z
          .string()
          .describe(
            "Capability or solution slug (e.g. 'swedish-company-data' or 'eu-company-due-diligence')",
          ),
        type: z
          .enum(["capability", "solution"])
          .default("capability")
          .describe("Whether to look up a capability or a solution"),
      }),
    },
    async ({ slug, type }) => {
      const endpoint =
        type === "solution"
          ? `/v1/internal/trust/solutions/${encodeURIComponent(slug)}`
          : `/v1/internal/trust/capabilities/${encodeURIComponent(slug)}`;

      try {
        const resp = await fetch(`${opts.baseUrl}${endpoint}`, {
          headers: { Accept: "application/json" },
        });

        if (resp.status === 404) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No trust profile found for ${type} '${slug}'. Use strale_search to find valid slugs.`,
              },
            ],
          };
        }

        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          return {
            content: [
              {
                type: "text" as const,
                text: `Error fetching trust profile: HTTP ${resp.status} — ${text.slice(0, 200)}`,
              },
            ],
          };
        }

        const data = await resp.json();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching trust profile: ${err instanceof Error ? err.message : err}`,
            },
          ],
        };
      }
    },
  );
}
