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
  // Meta-tool: strale_ping (no auth, zero I/O)
  server.registerTool(
    "strale_ping",
    {
      description:
        "Health check. Returns server status, tool count, and response time. Use this to verify the connection is working before making other calls.",
      inputSchema: z.object({}),
    },
    async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: "ok",
              server: "strale-mcp",
              version: "0.1.0",
              tools_registered: 6,
              capabilities_available: capabilities.length,
              solutions_available: solutions.length,
              timestamp: new Date().toISOString(),
            }, null, 2),
          },
        ],
      };
    },
  );

  // Meta-tool: strale_execute (requires API key)
  server.registerTool(
    "strale_execute",
    {
      description:
        "Execute any Strale capability by slug. First use strale_search to find the right capability and its required inputs, then call this tool. Returns the full result including output data, execution cost, latency, and data provenance.",
      inputSchema: z.object({
        slug: z
          .string()
          .describe(
            "Capability slug from strale_search results, e.g. 'swedish-company-data', 'vat-validate', 'iban-validate'",
          ),
        inputs: z
          .record(z.unknown())
          .describe(
            "Input parameters matching the capability's required fields. Check strale_search results for the expected input_fields.",
          ),
        max_price_cents: z
          .number()
          .optional()
          .describe(
            "Maximum price in EUR cents. Default: 200 (€2.00). Execution fails if capability costs more.",
          ),
      }),
    },
    async ({ slug, inputs, max_price_cents }) => {
      return executeCapability(slug, inputs as Record<string, unknown>, {
        ...opts,
        maxPriceCents: max_price_cents ?? opts.maxPriceCents,
      });
    },
  );

  // Meta-tool: strale_search (works without API key)
  server.registerTool(
    "strale_search",
    {
      description:
        "Search Strale's catalog of 233+ capabilities and 20+ solutions across categories: validation, data-extraction, finance, legal, compliance, logistics, recruiting, e-commerce, marketing, developer-tools, competitive-intelligence, and more. Returns matches with name, description, price, category, SQS quality score, trust grade, and required input fields. Examples: search 'company' for company data lookups, 'vat' for tax validation, 'compliance' for regulatory workflows. Use this to discover capabilities, then call strale_execute to run one.",
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
        const badge = trust && trust.total > 0 ? "strale_tested" : null;

        // Build input fields summary
        let inputFields = "Accepts: task (string) — describe what you need in natural language";
        const schema = c.input_schema;
        if (schema?.properties && Object.keys(schema.properties).length > 0) {
          const required = new Set(schema.required ?? []);
          const reqFields = Object.entries(schema.properties)
            .filter(([key]) => required.has(key))
            .map(([key, prop]) => `${key} (${prop.type ?? "any"})`);
          const optFields = Object.entries(schema.properties)
            .filter(([key]) => !required.has(key))
            .map(([key, prop]) => `${key} (${prop.type ?? "any"})`);
          const parts: string[] = [];
          if (reqFields.length > 0) parts.push(`Required: ${reqFields.join(", ")}`);
          if (optFields.length > 0) parts.push(`Optional: ${optFields.join(", ")}`);
          inputFields = parts.join(". ") || "No parameters";
        }

        return {
          type: "capability" as const,
          slug: c.slug,
          name: c.name,
          description: c.description,
          category: c.category,
          price: `€${(c.price_cents / 100).toFixed(2)}`,
          avg_latency_ms: c.avg_latency_ms,
          input_fields: inputFields,
          sqs_score: sqsScore,
          sqs_label: trust?.sqs_label ?? c.sqs_label ?? null,
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
                tip: "Use strale_execute to run any capability. Use strale_trust_profile for trust grades and detailed quality data.",
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
        "Get Strale's quality and trust methodology. Explains the SQS scoring system (5 factors with weights), trust grades, test infrastructure (1,215 test suites), provenance tracking, audit trails, badge system, and honest disclosure of current limitations. Call this to understand how Strale measures and reports quality.",
      inputSchema: z.object({}),
    },
    async () => {
      const methodologyText = `STRALE QUALITY & TRUST METHODOLOGY
===================================

WHAT STRALE IS
Strale is trust and quality infrastructure for AI agents. Agents call capabilities (atomic data operations) and solutions (multi-step workflows) via a unified API. Every execution is independently tested, scored, and auditable.

SQS SCORING (Strale Quality Score)
Five-factor weighted score (0-100) per capability:
  Correctness (40%) — Does the output contain accurate, expected data?
  Schema Conformance (25%) — Does the output match the declared schema?
  Availability (20%) — Is the capability reliably reachable?
  Error Handling (10%) — Are errors caught and reported cleanly?
  Edge Cases (5%) — Does it handle unusual inputs gracefully?
Computed from automated test suite results across all active test scenarios.

TRUST GRADES
  Freshness: A (<24h since last test), B (<72h), C (<7d), D (older)
  Latency: A (<500ms p95), B (<2s), C (<5s), D (>5s)
  Combined Trust Grade: Weighted combination of SQS score + freshness + latency

PROVENANCE TRACKING (per execution)
Every API response includes:
  source — which external service provided the data (e.g. "vies", "allabolag-scrape", "opensanctions")
  fetched_at — ISO 8601 timestamp of when the data was retrieved
External service failures are attributed to the upstream provider, not Strale.

AUDIT TRAIL (per transaction)
Every execution records:
  Full input parameters and complete output data
  Execution latency in milliseconds
  Price charged in EUR cents
  Provenance metadata (source + timestamp)
  Success or failure status
  Failure categorization: "upstream" (provider timeout, rate limit, HTTP 5xx) vs "internal" (Strale bug)
  Unique transaction ID for retrieval and dispute resolution

TEST INFRASTRUCTURE
  1,215 active test suites across all capabilities
  Tiered scheduling: Tier A (critical capabilities) tested most frequently, Tier B moderate, Tier C weekly
  Test types: schema_check, smoke_test, value_check, edge_case
  Automated failure categorization distinguishes external service issues from Strale bugs
  Weekly health sweep: reclassifies failures, proposes remediations, detects stale test inputs, flags dead URLs

BADGE SYSTEM
  strale_tested — Automated test suite coverage with internal testing data
  strale_monitored — Real customer usage data combined with automated testing
  strale_verified — 500+ customer transactions with sustained >80% success rate

CURRENT LIMITATIONS (honest disclosure)
  Zero external users to date — all transaction and quality data is from internal testing
  No SOC 2, ISO 27001, or HIPAA certification
  No contractual SLAs
  All capabilities are currently at "strale_tested" badge level (no customer volume yet)
  Quality scores reflect controlled test conditions, not production load patterns
  EU AI Act compliance solution is under development for the August 2026 deadline

ACCESSING TRUST DATA
  Per-capability trust profile: call strale_trust_profile with type "capability" and the slug
  Per-solution trust profile: call strale_trust_profile with type "solution" and the slug
  Methodology page: https://strale.dev/trust/methodology
  Trust API: GET https://api.strale.io/v1/internal/trust/capabilities/{slug}
  Trust API: GET https://api.strale.io/v1/internal/trust/solutions/{slug}`;

      return { content: [{ type: "text" as const, text: methodologyText }] };
    },
  );

  // Meta-tool: strale_trust_profile (no API key required)
  server.registerTool(
    "strale_trust_profile",
    {
      description:
        "Get the full trust and quality profile for any capability or solution. Returns SQS scores (5-factor breakdown), test results with pass rates, failure details and categorization, known limitations, badge status, quality narrative, and test schedule. Use this to verify trust data before relying on a capability.",
      inputSchema: z.object({
        slug: z
          .string()
          .describe(
            "Capability or solution slug, e.g. 'swedish-company-data' or 'eu-company-due-diligence'",
          ),
        type: z
          .enum(["capability", "solution"])
          .default("capability")
          .describe("Whether this is a capability or a bundled solution"),
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
          signal: AbortSignal.timeout(15000),
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
                text: `Failed to fetch trust profile: HTTP ${resp.status} — ${text.slice(0, 200)}`,
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
              text: `Failed to fetch trust profile: ${err instanceof Error ? err.message : err}`,
            },
          ],
        };
      }
    },
  );
}
