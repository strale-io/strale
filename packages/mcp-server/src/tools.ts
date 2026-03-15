/**
 * Shared tool registration for the Strale MCP server.
 *
 * This module is the single source of truth for MCP tool definitions.
 * It is used by both the stdio transport (server.ts) and the
 * Streamable HTTP transport (apps/api/src/routes/mcp.ts).
 *
 * Phase 3: Dual-profile model — QP + RP + matrix SQS + execution guidance.
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
  // Dual-profile fields
  sqs?: number;
  sqs_label?: string;
  quality?: string;
  reliability?: string;
  trend?: string;
  usable?: boolean;
  strategy?: string;
}

export interface Capability {
  slug: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  input_schema: JsonSchema | null;
  output_schema: unknown;
  is_free_tier?: boolean;
  // Dual-profile fields
  sqs?: number;
  sqs_label?: string;
  quality?: string;
  reliability?: string;
  trend?: string;
  usable?: boolean;
  strategy?: string;
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
  sqs: number;
  sqs_label: string;
  quality: string;
  reliability: string;
  trend: string;
  usable: boolean;
  strategy: string;
  badge: string | null;
}

export interface SolutionTrustEntry {
  sqs: number;
  sqs_label: string;
  quality: string;
  reliability: string;
  trend: string;
  usable: boolean;
  strategy: string;
  badge: string | null;
  badge_label: string | null;
}

export interface StraleClientOptions {
  baseUrl: string;
  apiKey: string;
  maxPriceCents: number;
  clientIp?: string;
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
  opts: { baseUrl: string; apiKey: string; clientIp?: string },
): Promise<{ data: T; status: number }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (opts.apiKey) {
    headers.Authorization = `Bearer ${opts.apiKey}`;
  }
  if (opts.clientIp) {
    headers["X-Forwarded-For"] = opts.clientIp;
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

// ─── Free-tier constants ────────────────────────────────────────────────────

const FREE_TIER_SLUGS = [
  "email-validate",
  "dns-lookup",
  "json-repair",
  "url-to-markdown",
  "iban-validate",
];

// ─── Capability execution ───────────────────────────────────────────────────

export async function executeCapability(
  slug: string,
  inputs: Record<string, unknown>,
  opts: StraleClientOptions,
  capabilities?: Capability[],
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  // Determine if this is a free-tier capability
  const cap = capabilities?.find((c) => c.slug === slug);
  const isFreeTier = cap?.is_free_tier ?? FREE_TIER_SLUGS.includes(slug);

  if (!opts.apiKey) {
    if (!isFreeTier) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "Authentication required for paid capabilities.",
              fix: "Get a free API key at https://strale.dev/signup — includes €2 free credits, no card needed. Then reconnect with Authorization: Bearer sk_live_YOUR_KEY",
              tip: "Try a free capability first: email-validate, dns-lookup, json-repair, url-to-markdown, or iban-validate — no API key needed.",
            }),
          },
        ],
      };
    }
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

  if (status === 429) {
    const retryAfter = (data as any).retry_after_seconds;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Free tier rate limit reached (10 executions/day).",
            fix: "Sign up at https://strale.dev/signup for unlimited access with €2 free credits.",
            ...(retryAfter != null ? { retry_after_seconds: retryAfter } : {}),
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

  // ── Success ──
  const output = (data as any).output ?? data;
  const meta: Record<string, unknown> = {};
  if ((data as any).price_cents != null)
    meta.price_cents = (data as any).price_cents;
  if ((data as any).latency_ms != null)
    meta.latency_ms = (data as any).latency_ms;
  if ((data as any).wallet_balance_cents != null)
    meta.wallet_balance_cents = (data as any).wallet_balance_cents;
  if ((data as any).provenance) meta.provenance = (data as any).provenance;

  // Dual-profile quality data
  if ((data as any).quality) meta.quality = (data as any).quality;
  if ((data as any).execution_guidance) meta.execution_guidance = (data as any).execution_guidance;

  // Free-tier metadata nudge
  if ((data as any).free_tier) {
    meta.free_tier = true;
    meta.upgrade_hint = (data as any).upgrade_hint ??
      "Sign up at https://strale.dev/signup for 233+ capabilities with €2 free credits.";
  }

  // Next-steps guidance on every successful execution
  meta.next_steps = [
    `Call strale_trust_profile with slug "${slug}" to see its dual-profile quality assessment.`,
    "Call strale_search to find related capabilities.",
    "Call strale_methodology for how quality is measured.",
  ];

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
    sqs: s.sqs as number | undefined,
    sqs_label: s.sqs_label as string | undefined,
    quality: s.quality as string | undefined,
    reliability: s.reliability as string | undefined,
    trend: s.trend as string | undefined,
    usable: s.usable as boolean | undefined,
    strategy: s.strategy as string | undefined,
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

export async function fetchSolutionTrust(
  baseUrl: string,
  solutionSlugs: string[],
): Promise<Map<string, SolutionTrustEntry>> {
  const map = new Map<string, SolutionTrustEntry>();
  const results = await Promise.allSettled(
    solutionSlugs.map(async (slug) => {
      const resp = await fetch(
        `${baseUrl}/v1/internal/trust/solutions/${encodeURIComponent(slug)}`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!resp.ok) return null;
      const data = await resp.json() as any;
      return {
        slug,
        entry: {
          sqs: data.sqs?.score ?? 0,
          sqs_label: data.sqs?.label ?? "Pending",
          quality: data.quality_profile?.grade ?? "pending",
          reliability: data.reliability_profile?.grade ?? "pending",
          trend: data.sqs?.trend ?? "stable",
          usable: data.execution_guidance?.usable ?? true,
          strategy: data.execution_guidance?.strategy ?? "direct",
          badge: data.badge ?? null,
          badge_label: data.badge_label ?? null,
        } as SolutionTrustEntry,
      };
    }),
  );
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      map.set(r.value.slug, r.value.entry);
    }
  }
  if (map.size < solutionSlugs.length) {
    console.error(
      `[strale-mcp] Solution trust: fetched ${map.size}/${solutionSlugs.length}`,
    );
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
  solutionTrustData?: Map<string, SolutionTrustEntry>,
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
              tools_registered: 8,
              capabilities_available: capabilities.length,
              solutions_available: solutions.length,
              timestamp: new Date().toISOString(),
            }, null, 2),
          },
        ],
      };
    },
  );

  // Meta-tool: strale_getting_started (no auth)
  server.registerTool(
    "strale_getting_started",
    {
      description:
        "Get started with Strale. Returns onboarding steps, free capabilities you can try immediately without an API key, and how to get full access.",
      inputSchema: z.object({}),
    },
    async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              welcome: "Strale is the trust layer for AI agents. 233+ verified data capabilities with dual-profile quality scores.",
              free_capabilities: [
                { slug: "email-validate", description: "Validate any email address", example_input: { email: "test@example.com" } },
                { slug: "dns-lookup", description: "DNS records for any domain", example_input: { domain: "example.com" } },
                { slug: "json-repair", description: "Fix malformed JSON", example_input: { json: '{"name": "test"' } },
                { slug: "url-to-markdown", description: "Convert any URL to markdown", example_input: { url: "https://example.com" } },
                { slug: "iban-validate", description: "Validate IBAN numbers", example_input: { iban: "DE89370400440532013000" } },
              ],
              try_now: "Call strale_execute with any free capability above — no API key needed (10/day limit).",
              full_access: "Sign up at https://strale.dev/signup for 233+ capabilities. Free €2 credits, no card needed.",
              learn_more: "Call strale_methodology for quality scoring details, or strale_search to browse all capabilities.",
            }, null, 2),
          },
        ],
      };
    },
  );

  // Meta-tool: strale_execute (free-tier works without API key)
  server.registerTool(
    "strale_execute",
    {
      description:
        "Execute any Strale capability by slug. Returns the full result including output data, execution cost, latency, data provenance, and dual-profile quality assessment (SQS score, Quality grade, Reliability grade, execution guidance with retry strategy). Free capabilities (email-validate, dns-lookup, json-repair, url-to-markdown, iban-validate) work without an API key. For paid capabilities, provide an API key via Authorization header. Use strale_search to find capabilities and their required inputs.",
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
      return executeCapability(
        slug,
        inputs as Record<string, unknown>,
        { ...opts, maxPriceCents: max_price_cents ?? opts.maxPriceCents },
        capabilities,
      );
    },
  );

  // Meta-tool: strale_search (works without API key)
  server.registerTool(
    "strale_search",
    {
      description:
        "Search Strale's catalog of 233+ capabilities and 20+ solutions across categories: validation, data-extraction, finance, legal, compliance, logistics, recruiting, e-commerce, marketing, developer-tools, competitive-intelligence, and more. Returns matches with SQS confidence score (0-100), Quality grade (code quality, A-F), Reliability grade (operational dependability, A-F), usable flag, execution strategy, trend, price, and required input fields. Use strale_trust_profile for full quality breakdown and execution guidance.",
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
        .map((s) => {
          const solTrust = solutionTrustData?.get(s.slug);
          return {
            type: "solution" as const,
            slug: s.slug,
            name: s.name,
            description: s.description,
            category: s.category,
            price: `€${(s.price_cents / 100).toFixed(2)}`,
            geography: s.geography,
            step_count: s.step_count,
            capabilities: s.capabilities,
            sqs: solTrust?.sqs ?? s.sqs ?? 0,
            sqs_label: solTrust?.sqs_label ?? s.sqs_label ?? "Pending",
            quality: solTrust?.quality ?? s.quality ?? "pending",
            reliability: solTrust?.reliability ?? s.reliability ?? "pending",
            trend: solTrust?.trend ?? s.trend ?? "stable",
            usable: solTrust?.usable ?? s.usable ?? true,
            strategy: solTrust?.strategy ?? s.strategy ?? "direct",
            badge: solTrust?.badge ?? null,
          };
        });

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
        const badge = trust ? "strale_tested" : null;

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
          input_fields: inputFields,
          sqs: trust?.sqs ?? c.sqs ?? 0,
          sqs_label: trust?.sqs_label ?? c.sqs_label ?? "Pending",
          quality: trust?.quality ?? c.quality ?? "pending",
          reliability: trust?.reliability ?? c.reliability ?? "pending",
          trend: trust?.trend ?? c.trend ?? "stable",
          usable: trust?.usable ?? c.usable ?? true,
          strategy: trust?.strategy ?? c.strategy ?? "direct",
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
                tip: "Use strale_execute to run any capability. Use strale_trust_profile for full quality breakdown and execution guidance.",
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
        "Get Strale's quality and trust methodology. Explains the dual-profile scoring model: Quality Profile (code quality, 4 factors: correctness, schema compliance, error handling, edge cases) and Reliability Profile (operational dependability, 4 factors weighted by capability type), combined via a published 5×5 matrix into the SQS confidence score. Covers execution guidance (retry strategies, fallbacks, recovery), test infrastructure (1,215 test suites with tiered scheduling), provenance tracking, audit trails, badge system, and honest disclosure of current limitations.",
      inputSchema: z.object({}),
    },
    async () => {
      const methodologyText = `STRALE QUALITY & TRUST METHODOLOGY
===================================

WHAT STRALE IS
Strale is trust and quality infrastructure for AI agents. Agents call capabilities (atomic data operations) and solutions (multi-step workflows) via a unified API. Every execution is independently tested, scored, and auditable.

SQS — STRALE QUALITY SCORE
The SQS is a combined confidence score (0-100) derived from two independent profiles:
- Quality Profile (QP): How well-built is Strale's code? (code correctness, schema compliance, error handling, edge cases)
- Reliability Profile (RP): How dependable is the service right now? (availability, success rate, upstream health, latency)
The two profiles combine via a published matrix into the headline SQS score.

QUALITY PROFILE (QP)
Measures code and methodology quality. Stable over time — only changes when code changes.
Four factors:
  Correctness (50%) — Does it return accurate data for known inputs?
  Schema Compliance (31%) — Does the response match the declared format?
  Error Handling (13%) — Are errors caught and reported cleanly?
  Edge Cases (6%) — Does it handle unusual inputs gracefully?
Upstream service failures are EXCLUDED from the Quality Profile.
Grade scale: A (>=90), B (>=75), C (>=50), D (>=25), F (<25)
Label format: "Code quality: [Grade]" (DEC-20260315-J)

RELIABILITY PROFILE (RP)
Measures operational dependability. Volatile — changes with upstream conditions.
Upstream service failures ARE INCLUDED in the Reliability Profile (unlike QP where they are excluded).
Four factors (as returned by the trust profile API):
  current_availability — Latest test run pass rate; all failures counted including upstream outages
  rolling_success    — Success rate across recent test runs (recency-weighted rolling window)
  upstream_health    — Output structure validity; degrades when upstream data changes format
  latency            — Response time within acceptable bounds for the capability type

Factor weights vary by capability type:
  Deterministic (no external deps): rolling_success 50%, upstream_health 25%, current_availability 5%, latency 5%
  Stable API:                       rolling_success 35%, upstream_health 20%, current_availability 25%, latency 10%
  Scraping:                         rolling_success 25%, upstream_health 15%, current_availability 40%, latency 10%
  AI-assisted:                      rolling_success 40%, upstream_health 20%, current_availability 15%, latency 10%
(An additional resilience factor — error handling under adverse conditions — contributes 10-15% to the score internally.)
Grade scale: A (>=90), B (>=75), C (>=50), D (>=25), F (<25)
Labels: A="Highly reliable", B="Reliable", C="Degraded reliability", D="Unreliable right now", F="Down"

SQS MATRIX
Quality Profile grade × Reliability Profile grade → SQS score via published matrix:
       RP:A   RP:B   RP:C   RP:D   RP:F
QP A    95     82     65     45     30
QP B    85     75     58     40     25
QP C    70     62     50     35     20
QP D    55     48     38     28     15
QP F    35     30     22     15     10
Labels: Excellent (90-100), Good (75-89), Fair (50-74), Poor (25-49), Degraded (0-24)
SQS values include ±3 point interpolation within each cell based on exact profile scores, so observed values may differ slightly from the grid anchors above. For example, QP:A + RP:B with strong sub-scores may produce SQS 84 rather than the anchor value of 82.

EXECUTION GUIDANCE
Every capability includes machine-readable execution guidance:
  usable — Can this be used right now? (true/false). Derived: SQS >= 25 AND strategy != 'unavailable' AND QP grade >= 'C'
  strategy — How to call it: direct, retry_with_backoff, queue_for_later, or unavailable
  confidence_after_strategy — Expected success rate if you follow the strategy (0-100)
  error_handling — Which errors are retryable (upstream timeout, rate limit) vs permanent (invalid input, not found)
  if_strategy_fails — Fallback capability (if available) with coverage description and verification level
  recovery — Estimated hours to recovery, next test timestamp, historical outage pattern
  cost_envelope — Cost of primary call, cost with retries, fallback cost
Failed calls due to upstream service issues are NOT billed. Only successful executions are charged (DEC-20260315-I).

SOLUTION SQS
Each step's QP and RP are computed independently.
Solution-level SQS = weighted average of step SQS scores, capped at weakest step + 20 points.
This ensures no solution appears stronger than its weakest link.
Solution usable = all steps usable. Solution strategy = worst step strategy.

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
  Retrieve any past transaction: call strale_transaction with the transaction ID returned from strale_execute.

TEST INFRASTRUCTURE
  1,215 active test suites across all 233 capabilities
  Tiered scheduling: Tier A (critical) every 6 hours, Tier B every 24 hours, Tier C every 72 hours
  Test types: known_answer, schema_check, dependency_health, negative, edge_case
  Automated failure categorization distinguishes external service issues from Strale bugs

BADGE SYSTEM
  strale_tested — Automated test suite coverage with internal testing data
  strale_monitored — Real customer usage data combined with automated testing
  strale_verified — 500+ customer transactions with sustained >80% success rate

CURRENT LIMITATIONS (honest disclosure)
  Zero external users to date — all transaction and quality data is from internal testing
  No SOC 2, ISO 27001, or HIPAA certification
  No contractual SLAs
  All capabilities are currently at "strale_tested" badge level (no customer volume yet)
  Quality scoring uses the dual-profile model. Methodology published at https://strale.dev/trust/methodology

ACCESSING TRUST DATA
  Per-capability trust profile: call strale_trust_profile with type "capability" and the slug
  Per-solution trust profile: call strale_trust_profile with type "solution" and the slug
  Search capabilities: call strale_search — results include SQS, Quality grade, Reliability grade, usable flag, and strategy
  Methodology page: https://strale.dev/trust/methodology`;

      return { content: [{ type: "text" as const, text: methodologyText }] };
    },
  );

  // Meta-tool: strale_trust_profile (no API key required)
  server.registerTool(
    "strale_trust_profile",
    {
      description:
        "Get the full trust and quality profile for any capability or solution. Returns dual-profile quality assessment: Quality Profile (code quality, 4 factors: correctness, schema compliance, error handling, edge cases) and Reliability Profile (operational dependability, 4 factors: current_availability, rolling_success, upstream_health, latency). Includes SQS confidence score derived from published QP×RP matrix, execution guidance (usable flag, retry strategy, confidence score, fallback capability, recovery timeline, cost envelope), test history (run counts, pass/fail, external service failures), known limitations, badge status, and test schedule.",
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

  // Meta-tool: strale_transaction (requires API key)
  server.registerTool(
    "strale_transaction",
    {
      description:
        "Retrieve a past execution record by transaction ID. Returns the full audit trail: inputs, outputs, latency, price, provenance, success/failure status, and failure categorization. Use this to verify Strale's audit trail claims with concrete evidence.",
      inputSchema: z.object({
        transaction_id: z
          .string()
          .describe(
            "Transaction ID returned from a strale_execute call",
          ),
      }),
    },
    async ({ transaction_id }) => {
      if (!opts.apiKey) {
        return {
          content: [
            {
              type: "text" as const,
              text: "API key required to retrieve transactions.",
            },
          ],
        };
      }

      try {
        const resp = await fetch(
          `${opts.baseUrl}/v1/transactions/${encodeURIComponent(transaction_id)}`,
          {
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${opts.apiKey}`,
            },
            signal: AbortSignal.timeout(15000),
          },
        );

        if (resp.status === 404) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Transaction not found. Transaction IDs are returned when you call strale_execute.",
              },
            ],
          };
        }

        if (resp.status === 401) {
          return {
            content: [
              {
                type: "text" as const,
                text: "API key required to retrieve transactions.",
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
                text: `Error fetching transaction: HTTP ${resp.status} — ${text.slice(0, 200)}`,
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
              text: `Failed to fetch transaction: ${err instanceof Error ? err.message : err}`,
            },
          ],
        };
      }
    },
  );
}
