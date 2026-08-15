/**
 * Shared tool registration for the Strale MCP server.
 *
 * This module is the single source of truth for MCP tool definitions.
 * It is used by both the stdio transport (server.ts) and the
 * Streamable HTTP transport (apps/api/src/routes/mcp.ts).
 *
 * Tool descriptions are a machine surface: agents choose tools from them
 * and treat them as a contract. They must describe only what the API
 * actually returns — no retired concepts (the SQS scoring engine was
 * deleted in DEC-20260503-B) and no hardcoded catalog counts, which drift
 * within days.
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
  search_tags?: string[];
}

export interface Capability {
  slug: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  geography?: string;
  input_schema: JsonSchema | null;
  output_schema: unknown;
  is_free_tier?: boolean;
  search_tags?: string[];
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
  badge: string | null;
}

export interface SolutionTrustEntry {
  badge: string | null;
  badge_label: string | null;
}

/**
 * MCP funnel telemetry — fired on auth-or-payment rejections a tool
 * surfaces to the caller. Optional and side-effect-free from this
 * package's point of view: the stdio server (server.ts, used by every
 * external `npx strale-mcp` install) never sets it, so this stays a no-op
 * there. Only the HTTP transport (apps/api/src/routes/mcp.ts) — which runs
 * inside Strale's own API process and has a database to write to — passes
 * a callback, wiring it to the discovery_hits table via
 * lib/attribution.ts's recordDiscoveryHit. Keeping the hook here rather
 * than duplicating each tool's rejection logic in the HTTP transport is
 * why "each tools/call" and "auth-or-payment rejection" can both be
 * observed without adding any latency: onFunnelEvent is called
 * synchronously but the HTTP transport's implementation is itself
 * fire-and-forget (mirrors recordDiscoveryHit's own contract).
 */
export type McpFunnelEventType = "auth_rejected" | "payment_rejected" | "rate_limited";

export interface McpFunnelEvent {
  type: McpFunnelEventType;
  /** Tool name, e.g. "strale_execute". */
  tool: string;
  /** Capability slug, when the rejection happened mid-execution. */
  slug?: string;
  /** error_code from the API response, when available. */
  detail?: string;
}

export interface StraleClientOptions {
  baseUrl: string;
  apiKey: string;
  maxPriceCents: number;
  clientIp?: string;
  version?: string;
  onFunnelEvent?: (event: McpFunnelEvent) => void;
}

/** Call onFunnelEvent without letting a throwing hook break tool execution. */
function emitFunnelEvent(opts: StraleClientOptions, event: McpFunnelEvent): void {
  try {
    opts.onFunnelEvent?.(event);
  } catch {
    // A telemetry hook must never break the tool call it's observing.
  }
}

// Attribution client identifier — package name/version, sent as
// X-Strale-Client on every API call this package makes.
const STRALE_CLIENT_ID = "strale-mcp/0.2.6";

// ─── HTTP helpers ───────────────────────────────────────────────────────────

export async function straleGet<T>(
  path: string,
  opts: { baseUrl: string; apiKey: string },
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    // Channel attribution: identifies the MCP rail on the API side.
    "X-Strale-Client": STRALE_CLIENT_ID,
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
    // Channel attribution: identifies the MCP rail on the API side.
    "X-Strale-Client": STRALE_CLIENT_ID,
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

// Degraded-path fallback only: used when the caller didn't pass the fetched
// catalog, so `is_free_tier` (the canonical per-capability flag) isn't
// available. The authoritative list is `free_tier_slugs` from
// GET /v1/platform/facts — re-sync this array from there when the free tier
// changes. Stale entries here mean a genuinely-free capability gets refused
// for callers with no API key, which is why it can't just be left at the
// original five.
const FREE_TIER_SLUGS = [
  "bitcoin-address-validate",
  "dns-lookup",
  "dogecoin-address-validate",
  "email-validate",
  "eth-address-validate",
  "iban-validate",
  "json-repair",
  "solana-address-validate",
  "tron-address-validate",
  "url-to-markdown",
  "xrp-address-validate",
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
      emitFunnelEvent(opts, { type: "auth_rejected", tool: "strale_execute", slug });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "Authentication required for paid capabilities.",
              // Ordering is deliberate. This message is read by an autonomous
              // agent, and the only path it used to offer was a web signup
              // form — something an agent cannot complete. In the seven days
              // to 2026-08-15, 176 distinct agents opened an MCP session and
              // zero signups resulted, while 653 x402 calls arrived from
              // agents that had found the pay-per-call route some other way.
              // The machine-actionable option goes first.
              pay_per_call: {
                how: "No signup. POST to the x402 endpoint below, settle the 402 challenge it returns in USDC on Base, and replay the request — the payment is the authentication.",
                endpoint: `${opts.baseUrl}/x402/${slug}`,
                catalog: `${opts.baseUrl}/x402/catalog`,
                discovery: `${opts.baseUrl}/.well-known/x402.json`,
              },
              api_key: {
                how: "If a human can complete a web form, https://strale.dev/signup issues a key with €2 of credit and no card.",
                then: "Reconnect with Authorization: Bearer sk_live_YOUR_KEY",
              },
              free_without_either: `${FREE_TIER_SLUGS.length} capabilities need no key and no payment (10/day per IP): ${FREE_TIER_SLUGS.join(", ")}.`,
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
    const txId = (data as any).result?.transaction_id ?? (data as any).transaction_id;
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
    emitFunnelEvent(opts, { type: "rate_limited", tool: "strale_execute", slug });
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
    const isInsufficientBalance = errorCode === "insufficient_balance";

    // Auth-or-payment rejection funnel signal — only these two error_codes,
    // not every 4xx (a bad slug or malformed input is a usage error, not a
    // rejection the funnel report cares about).
    if (isInsufficientBalance) {
      emitFunnelEvent(opts, { type: "payment_rejected", tool: "strale_execute", slug, detail: errorCode });
    } else if (status === 401 || errorCode === "unauthorized" || errorCode === "invalid_api_key") {
      emitFunnelEvent(opts, { type: "auth_rejected", tool: "strale_execute", slug, detail: errorCode });
    }

    let errorText = `Error (${errorCode}): ${message}`;
    if (isInsufficientBalance) {
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
  // Support both new nested (result/meta) and legacy flat response shapes
  const r = (data as any).result ?? data;
  const m = (data as any).meta ?? data;
  const output = r.output ?? (data as any).output ?? data;
  const meta: Record<string, unknown> = {};
  if (r.price_cents != null) meta.price_cents = r.price_cents;
  if (r.latency_ms != null) meta.latency_ms = r.latency_ms;
  if (r.wallet_balance_cents != null) meta.wallet_balance_cents = r.wallet_balance_cents;
  if (r.provenance) meta.provenance = r.provenance;

  // Quality signals, when the API returns them (lives in meta block now)
  if (m.quality) meta.quality = m.quality;
  if (m.execution_guidance) meta.execution_guidance = m.execution_guidance;

  // Transaction ID
  if (r.transaction_id) meta.transaction_id = r.transaction_id;

  // Next-steps guidance on every successful execution
  meta.next_steps = [
    `Transaction ID recorded. Call strale_transaction with id "${r.transaction_id ?? ""}" to retrieve the full audit record.`,
    `Call strale_trust_profile with slug "${slug}" to see how this source is tested and evidenced.`,
    "Call strale_search to find related capabilities.",
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
    price_cents: (s.price_cents ?? s.priceCents) as number,
    geography: s.geography as string,
    step_count: (s.step_count ?? s.stepCount) as number,
    capabilities: (s.capabilities as string[]) ?? [],
    transparency_tag: ((s.transparency_tag ?? s.transparencyTag) as string) ?? null,
    search_tags: (s.search_tags ?? s.searchTags) as string[] | undefined,
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
        "Checks that the Strale API is reachable and the MCP server is running. Call this before a series of capability executions to verify connectivity, or when troubleshooting connection issues. Returns server status, version, tool count, capability count, solution count, and a timestamp. No API key required.",
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
              version: opts.version ?? "unknown",
              tools_registered: 9, // UPDATE if tools are added/removed
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
        "Explains how to start using Strale and what is available without credentials. Call this on first connection. Returns the current free-tier capability list with example inputs, the pay-per-call (x402) route that needs no signup, and how to reach the full registry. No API key required.",
      inputSchema: z.object({}),
    },
    async () => {
      // Counts and the free-tier list are read live rather than hardcoded.
      // The previous version of this response claimed "256 capabilities, 81
      // solutions", listed 5 free capabilities when there were 11, and
      // advertised "dual-profile quality scores" — the SQS engine, deleted in
      // May under DEC-20260503-B. All of it was the first thing an agent saw.
      // Per CLAUDE.md's drift-prevention rule, /v1/platform/facts is the
      // canonical source; this reads from it and degrades to the shipped
      // constants if the call fails rather than printing a stale number.
      let capabilityCount: number | null = null;
      let solutionCount: number | null = null;
      let freeSlugs: string[] = FREE_TIER_SLUGS;
      try {
        const data = await straleGet<{
          capability_counts?: { active_visible?: number; free_tier_slugs?: string[] };
          solution_count_active?: number;
        }>("/v1/platform/facts", opts);
        capabilityCount = data?.capability_counts?.active_visible ?? null;
        solutionCount = data?.solution_count_active ?? null;
        if (data?.capability_counts?.free_tier_slugs?.length) {
          freeSlugs = data.capability_counts.free_tier_slugs;
        }
      } catch {
        // Fall through to the shipped constants — a first-contact response
        // that works with slightly stale counts beats one that errors.
      }

      const EXAMPLES: Record<string, Record<string, unknown>> = {
        "email-validate": { email: "test@example.com" },
        "dns-lookup": { domain: "example.com" },
        "json-repair": { json: '{"name": "test"' },
        "url-to-markdown": { url: "https://example.com" },
        "iban-validate": { iban: "DE89370400440532013000" },
        "bitcoin-address-validate": { address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa" },
        "eth-address-validate": { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              welcome:
                "Strale is the data layer for AI agents — independently tested, audit-logged data sources" +
                (capabilityCount ? `. ${capabilityCount} capabilities` : "") +
                (solutionCount ? ` and ${solutionCount} bundled solutions` : "") +
                " available.",
              free_capabilities: freeSlugs.map((slug) => ({
                slug,
                ...(EXAMPLES[slug] ? { example_input: EXAMPLES[slug] } : {}),
              })),
              try_now:
                "Call strale_execute with any free capability above — no API key, no payment (10/day per IP).",
              // The route an agent can actually take on its own.
              pay_per_call_no_signup: {
                how: "POST to /x402/{slug}, settle the 402 challenge it returns in USDC on Base, replay the request. The payment is the authentication — no account, no key.",
                catalog: `${opts.baseUrl}/x402/catalog`,
                discovery: `${opts.baseUrl}/.well-known/x402.json`,
              },
              api_key_alternative:
                "If a human can complete a web form: https://strale.dev/signup issues a key with €2 of credit, no card.",
              learn_more:
                "Call strale_search to browse capabilities, or strale_methodology for how sources are tested and evidenced.",
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
        "Executes a Strale capability by slug and returns the result. Use this when you need to perform any verification, validation, lookup, or data extraction from the capability registry. Call strale_search first to find the right slug and required input fields. Returns a result object with the capability output, latency, price charged, and data provenance. Several capabilities are free without an API key (10/day limit) — strale_search reports which. Paid capabilities debit from the wallet — check strale_balance first for high-value calls.",
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
        "Searches the Strale capability registry by keyword, category, or natural language query. Use this when you need to find the right capability for a task but don't know the exact slug. Returns matching capabilities and solutions ranked by relevance, each with slug, name, description, category, and price in EUR cents. The registry spans company data, compliance, finance, web intelligence, and developer tools. No API key required to search.",
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
            "Filter by category: compliance, validation, data-extraction, developer-tools, web3, security, domain-intel, recruiting, sales, legal, text",
          ),
        offset: z
          .number()
          .optional()
          .describe("Number of results to skip (for pagination). Default: 0"),
      }),
    },
    async ({ query, category, offset }) => {
      const skip = offset ?? 0;

      // ─── Try the /v1/suggest/typeahead endpoint first ────────────────
      // It has smarter ranking, solution deduplication, and geography awareness.
      // Fall back to local keyword matching if the API is unreachable.
      if (!category) {
        try {
          const url = `${opts.baseUrl}/v1/suggest/typeahead?q=${encodeURIComponent(query)}&limit=10`;
          const resp = await fetch(url, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(5000),
          });

          if (resp.ok) {
            const data = (await resp.json()) as {
              results: Array<{
                type: "solution" | "capability";
                slug: string;
                name: string;
                description: string;
                category: string;
                price_cents: number | null;
                geography: string | null;
                is_free_tier?: boolean;
                step_count?: number;
                also_available_for?: string[];
              }>;
              total: number;
            };

            // Map typeahead results to the strale_search response format
            const results = data.results.map((r) => {
              const base: Record<string, unknown> = {
                type: r.type,
                slug: r.slug,
                name: r.name,
                description: r.description,
                category: r.category,
                geography: r.geography ?? "global",
                price: r.price_cents != null ? `€${(r.price_cents / 100).toFixed(2)}` : null,
              };
              if (r.type === "solution") {
                if (r.step_count) base.step_count = r.step_count;
                if (r.also_available_for) base.also_available_for = r.also_available_for;
              }
              if (r.type === "capability") {
                // Enrich with input_fields from local capability data
                const cap = capabilities.find((c) => c.slug === r.slug);
                if (cap?.input_schema?.properties && Object.keys(cap.input_schema.properties).length > 0) {
                  const required = new Set(cap.input_schema.required ?? []);
                  const reqFields = Object.entries(cap.input_schema.properties)
                    .filter(([key]) => required.has(key))
                    .map(([key, prop]) => `${key} (${prop.type ?? "any"})`);
                  const optFields = Object.entries(cap.input_schema.properties)
                    .filter(([key]) => !required.has(key))
                    .map(([key, prop]) => `${key} (${prop.type ?? "any"})`);
                  const parts: string[] = [];
                  if (reqFields.length > 0) parts.push(`Required: ${reqFields.join(", ")}`);
                  if (optFields.length > 0) parts.push(`Optional: ${optFields.join(", ")}`);
                  base.input_fields = parts.join(". ") || "No parameters";
                } else {
                  base.input_fields = "Accepts: task (string) — describe what you need in natural language";
                }
                if (r.is_free_tier) base.is_free_tier = true;
              }
              return base;
            });

            const page = results.slice(skip);

            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      query,
                      category: null,
                      total_matches: data.total,
                      offset: skip,
                      showing: page.length,
                      has_more: data.total > skip + page.length,
                      results: page,
                      tip: "Use strale_execute to run any capability. Use strale_trust_profile for full quality breakdown and execution guidance.",
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }
        } catch (err) {
          console.error("[strale_search] Typeahead API unavailable, falling back to local search:", err instanceof Error ? err.message : err);
        }
      }

      // ─── Fallback: local keyword matching ──────────────────────────
      // Used when: category filter is set (typeahead doesn't support it),
      // or when the typeahead endpoint is unreachable.
      const q = (query ?? "").toLowerCase();
      const catFilter = category ? category.toLowerCase() : null;

      function localMatchScore(text: string): number {
        const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
        if (tokens.length === 0) return text.toLowerCase().includes(q) ? 1 : 0;
        let score = 0;
        const lower = text.toLowerCase();
        for (const token of tokens) {
          if (lower.includes(token)) score++;
        }
        return score;
      }

      // Match solutions
      // search_tags are hand-authored vocabulary bridges (the words agents
      // actually type, which don't always appear in the name/description);
      // fold them into the matched text so this fallback path — used when
      // the typeahead API is unreachable or a category filter is set — sees
      // the same signal the primary /v1/suggest/typeahead path now does.
      const matchedSolutions = solutions
        .filter((s) => {
          if (catFilter && !s.category.toLowerCase().includes(catFilter)) return false;
          return localMatchScore(`${s.name} ${s.description} ${s.slug} ${s.category} ${(s.search_tags ?? []).join(" ")}`) > 0;
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
      const matchedCaps = capabilities
        .filter((c) => {
          if (catFilter && !c.category.toLowerCase().includes(catFilter)) return false;
          return localMatchScore(`${c.name} ${c.description} ${c.slug} ${c.category} ${(c.search_tags ?? []).join(" ")}`) > 0;
        })
        .map((c) => {
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
            geography: c.geography ?? "global",
            price: `€${(c.price_cents / 100).toFixed(2)}`,
            input_fields: inputFields,
          };
        });

      const combined = [...matchedSolutions, ...matchedCaps];
      const page = combined.slice(skip, skip + 20);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                query,
                category: category ?? null,
                total_matches: combined.length,
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
        "Returns the current Strale wallet balance. Call this before executing paid capabilities to verify sufficient funds, or after a series of calls to reconcile spend. Returns balance in EUR cents (integer) and formatted EUR string. Requires an API key — returns an auth instruction if none is configured.",
      inputSchema: z.object({}),
    },
    async () => {
      if (!opts.apiKey) {
        emitFunnelEvent(opts, { type: "auth_rejected", tool: "strale_balance" });
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
        "Returns Strale's trust methodology as a short reference document — covers test cadence, audit-trail integrity, and provenance. No API key required.",
      inputSchema: z.object({}),
    },
    async () => {
      const methodologyText = `STRALE TRUST METHODOLOGY
=========================

WHAT STRALE IS
Strale is data infrastructure for AI agents. Agents call capabilities (atomic data operations) and solutions (multi-step workflows) via a unified API. Every call returns a chain-hashed audit record.

TEST CADENCE
Free capabilities are tested hourly with canary inputs that don't consume vendor quota. The scheduler hash-spreads runs across the hour to keep upstream pressure even.
Paid capabilities are not proactively scheduled. Quality signals come from production traffic, piggyback test suites attached to real customer calls, and any zero-cost auth-less probes the vendor permits.

AUDIT TRAIL
Every execution writes a transaction row with input, output, provenance (source + fetched_at), latency, price, and an integrity_hash chained to the previous transaction. Retrieve via /v1/audit/{transactionId} or programmatically via strale_transaction.
The chain is independently verifiable at /v1/verify/{transactionId} — Counterparty Assurance and standalone capability calls both produce the same chain shape.

PROVENANCE
Every successful call includes:
  source — the external service that provided the data
  fetched_at — ISO 8601 timestamp
  upstream_vendor / acquisition_method / primary_source_reference — where applicable, per the third-party scraping doctrine (DEC-20260428-A)

LIFECYCLE
Capabilities transition through states (draft → validating → probation → active → degraded → suspended) via human-driven admin flips. Automatic state transitions retired with the SQS engine in DEC-20260503-B.

CURRENT LIMITATIONS (honest disclosure)
  Capabilities expose lifecycle_state and last_tested_at but do NOT expose a numeric quality score. The dual-profile SQS engine retired 2026-05-05.
  Source-health substrate (per-vendor status, fallback availability, last-canary-tested timestamps) is being rebuilt as a separate routing-engine concern.
  No SOC 2 / ISO 27001 / HIPAA certification.
  No contractual SLAs.

REFERENCES
  Decisions DB: DEC-20260503-B (SQS deletion).
  Public methodology: https://strale.dev/trust/methodology`;

      return { content: [{ type: "text" as const, text: methodologyText }] };
    },
  );

  // Meta-tool: strale_trust_profile (no API key required)
  server.registerTool(
    "strale_trust_profile",
    {
      description:
        "Returns the trust profile for a capability or solution. Call this before relying on a capability for high-stakes decisions, or when a user asks how reliable a specific check is. Returns lifecycle state, last-tested timestamp, recent test history, known limitations, data source and provenance, and cost envelope. Strale deliberately exposes no single numeric quality score — judge from the test history and limitations. No API key required.",
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
        "Retrieve a past execution record by transaction ID. Returns inputs, outputs, latency, price, data provenance, success/failure status, and failure categorization. Use this to inspect what a previous strale_execute call returned, debug failures, or provide an audit trail. Free-tier transactions are accessible by ID without an API key.",
      inputSchema: z.object({
        transaction_id: z
          .string()
          .describe(
            "Transaction ID returned from a strale_execute call",
          ),
      }),
    },
    async ({ transaction_id }) => {
      // Build headers — include API key if available, but don't require it
      // Free-tier transactions are publicly accessible by ID (UUID is unguessable)
      const headers: Record<string, string> = { Accept: "application/json" };
      if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;

      try {
        const resp = await fetch(
          `${opts.baseUrl}/v1/transactions/${encodeURIComponent(transaction_id)}`,
          {
            headers,
            signal: AbortSignal.timeout(15000),
          },
        );

        if (resp.status === 404) {
          return {
            content: [
              {
                type: "text" as const,
                text: opts.apiKey
                  ? "Transaction not found."
                  : "Transaction not found. If this was a paid transaction, provide an API key to look it up.",
              },
            ],
          };
        }

        if (resp.status === 401) {
          emitFunnelEvent(opts, { type: "auth_rejected", tool: "strale_transaction" });
          return {
            content: [
              {
                type: "text" as const,
                text: "API key required to look up paid transactions. Get a free key at https://strale.dev/signup",
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

  // Web3 Assurance — on-chain counterparty assurance (sister product to Payee Assurance)
  server.registerTool(
    "strale_web3_assurance",
    {
      description:
        "Returns a decision-ready answer about an on-chain counterparty (wallet, smart contract, token, DeFi protocol, or bridge) in a single call. Surfaces verdict (proceed/review/block/insufficient_evidence), reason_codes (machine-parsable UPPERCASE_SNAKE_CASE), critical_flags, suggested_action, evidence map (sanctions, mixer-graded, scam-cluster, wallet-history, token-safety, contract-verification, protocol-risk, EAS attestations, ERC-8004 reputation, more), and a sidecar audit_url. Two modes: 'outbound' (agent vetting recipient pre-payment, full evaluator set, 8s budget) or 'reverse-call' (service publisher gating an inbound x402 buyer in real-time, critical evaluators only, sub-second SLA). Use before any agent transacts on-chain — sending value, swapping, staking, minting, bridging, or interacting with a contract.",
      inputSchema: z.object({
        target: z
          .string()
          .describe(
            "On-chain target. EVM wallet/contract/token (0x...), Solana address, or DeFi protocol slug (e.g. 'aave', 'uniswap-v3').",
          ),
        target_type: z
          .enum(["wallet", "contract", "token", "protocol", "bridge", "domain"])
          .optional()
          .describe(
            "Target kind. Inferred when omitted: 0x... → wallet (default), .eth/.sol → wallet, slug → protocol.",
          ),
        chain: z
          .string()
          .optional()
          .describe(
            "Chain. EVM: 'ethereum' (default), 'base', 'polygon', 'arbitrum', 'optimism', 'bsc'. Or 'solana'.",
          ),
        action: z
          .enum(["send_payment", "swap", "stake", "mint", "interact", "bridge"])
          .optional()
          .describe(
            "Optional intended action. When provided, enables pre-trade simulation (outbound mode) and tunes verdict severity.",
          ),
        amount_usd: z
          .number()
          .optional()
          .describe("Optional amount in USD. Sharpens verdict for high-value flows."),
        mode: z
          .enum(["outbound", "reverse-call"])
          .optional()
          .describe(
            "Default 'outbound' (agent → recipient, 8s budget, all evidence). Use 'reverse-call' when you are an x402 service publisher gating an inbound buyer (critical evidence only, sub-second SLA).",
          ),
        agent_id: z
          .string()
          .optional()
          .describe("Optional ERC-8004 agent identifier for the calling agent."),
        caller_jurisdiction: z
          .string()
          .optional()
          .describe("Optional ISO country code for jurisdiction-aware verdict (US, EU, UK, etc.)."),
      }),
    },
    async (input) => {
      try {
        const { data, status } = await stralePost<Record<string, unknown>>(
          "/v1/web3-assurance",
          input as Record<string, unknown>,
          { baseUrl: opts.baseUrl, apiKey: opts.apiKey },
        );
        if (status >= 400) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Web3 Assurance ${status}: ${JSON.stringify(data).slice(0, 500)}`,
              },
            ],
          };
        }
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
              text: `Failed to call Web3 Assurance: ${err instanceof Error ? err.message : err}`,
            },
          ],
        };
      }
    },
  );
}
