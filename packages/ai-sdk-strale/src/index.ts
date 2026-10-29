import { tool } from "ai";
import { z } from "zod";
import { request, resolveOptions, type ResolvedOptions, type StraleToolsOptions } from "./client.js";

export { CLIENT_ID, type StraleToolsOptions } from "./client.js";

const SEARCH_DESCRIPTION =
  "Search Strale's library of pay-per-call tools for AI agents: company registry lookups, VAT and IBAN checks, " +
  "sanctions and PEP screening, web page reading, finance and developer utilities. Returns matching tools and " +
  "bundled solutions with slug, description, price in EUR cents and the input schema to pass to strale_execute. " +
  "No API key needed to search.";

const EXECUTE_DESCRIPTION =
  "Run one Strale tool or solution by slug and return its output with source provenance. Call strale_search " +
  "first to get the slug and the input fields. Paid tools are charged per call; some tools are free without a key.";

type Kind = "capability" | "solution";

interface TypeaheadResult {
  type: Kind;
  slug: string;
  name: string;
  description: string;
  category: string;
  price_cents: number | null;
  geography: string | null;
  is_free_tier?: boolean;
  step_count?: number;
}

/** Search the catalogue: typeahead ranking, then the input schema of each hit. */
export function straleSearch(options: StraleToolsOptions = {}) {
  const opts = resolveOptions(options);
  return tool({
    description: SEARCH_DESCRIPTION,
    inputSchema: z.object({
      query: z.string().min(2).describe("What the agent needs, in a few words, e.g. 'UK company lookup' or 'validate EU VAT number'"),
      limit: z.number().int().min(1).max(10).optional().describe("Maximum results. Default 5."),
    }),
    execute: async ({ query, limit }, { abortSignal }) => searchCatalogue(opts, query, limit ?? 5, abortSignal),
  });
}

async function searchCatalogue(opts: ResolvedOptions, query: string, limit: number, signal?: AbortSignal) {
  const { status, body } = await request(
    opts,
    `/v1/suggest/typeahead?q=${encodeURIComponent(query)}&limit=${limit}`,
    { signal },
  );
  if (status >= 400) return failure(status, body);
  const hits = (Array.isArray(body.results) ? body.results : []) as TypeaheadResult[];
  // The typeahead carries no input schema; the detail endpoints do. A failed
  // detail fetch is reported on the hit, never dropped silently.
  const results = await Promise.all(
    hits.slice(0, limit).map(async (hit) => {
      const path = hit.type === "solution" ? `/v1/solutions/${encodeURIComponent(hit.slug)}` : `/v1/capabilities/${encodeURIComponent(hit.slug)}`;
      let inputSchema: unknown = null;
      let price = hit.price_cents;
      let freeTier = hit.is_free_tier === true;
      let detailError: string | undefined;
      try {
        const detail = await request(opts, path, { signal });
        if (detail.status < 400) {
          inputSchema = detail.body.input_schema ?? null;
          if (typeof detail.body.price_cents === "number") price = detail.body.price_cents;
          if (detail.body.is_free_tier === true) freeTier = true;
        } else {
          detailError = `detail lookup returned HTTP ${detail.status}`;
        }
      } catch (err) {
        detailError = `detail lookup failed: ${(err as Error).message}`;
      }
      return {
        type: hit.type,
        slug: hit.slug,
        name: hit.name,
        description: hit.description,
        category: hit.category,
        geography: hit.geography ?? "global",
        price_cents: price,
        ...(freeTier ? { is_free_tier: true } : {}),
        ...(hit.step_count ? { step_count: hit.step_count } : {}),
        input_schema: inputSchema,
        ...(detailError ? { input_schema_error: detailError } : {}),
      };
    }),
  );
  return { ok: true as const, query, total: typeof body.total === "number" ? body.total : results.length, results };
}

/**
 * Run a tool or solution. Rail, in order: API key (wallet debit, capped by
 * maxPriceCents), x402 (the supplied paying fetch settles the 402 challenge),
 * otherwise an anonymous call, which only the free tools accept.
 */
export function straleExecute(options: StraleToolsOptions = {}) {
  const opts = resolveOptions(options);
  return tool({
    description: EXECUTE_DESCRIPTION,
    inputSchema: z.object({
      slug: z.string().min(2).describe("Slug from strale_search, e.g. 'uk-company-data'"),
      type: z.enum(["capability", "solution"]).optional().describe("'solution' for a bundled solution. Default 'capability'."),
      inputs: z.record(z.string(), z.unknown()).describe("Input fields matching the input_schema returned by strale_search"),
    }),
    execute: async ({ slug, type, inputs }, { abortSignal }) => runTool(opts, slug, type ?? "capability", inputs, abortSignal),
  });
}

async function runTool(opts: ResolvedOptions, slug: string, kind: Kind, inputs: Record<string, unknown>, signal?: AbortSignal) {
  const s = encodeURIComponent(slug);
  if (!opts.apiKey && opts.x402Fetch) {
    const path = kind === "solution" ? `/x402/solutions/${s}` : `/x402/${s}`;
    const { status, body } = await request(opts, path, { method: "POST", body: inputs, via: opts.x402Fetch, signal });
    if (status >= 400) return failure(status, body, slug);
    const { _meta, ...output } = body;
    return { ok: true as const, rail: "x402" as const, slug, output, meta: _meta ?? null };
  }

  const path = kind === "solution" ? `/v1/solutions/${s}/execute` : "/v1/do";
  const payload =
    kind === "solution"
      ? { inputs, max_price_cents: opts.maxPriceCents }
      : { capability_slug: slug, inputs, max_price_cents: opts.maxPriceCents };
  const { status, body } = await request(opts, path, { method: "POST", body: payload, auth: true, signal });
  const rail = opts.apiKey ? ("api_key" as const) : ("free" as const);
  if (status === 202) {
    const r = (body.result ?? body) as Record<string, unknown>;
    return {
      ok: true as const,
      rail,
      slug,
      status: "executing",
      transaction_id: r.transaction_id ?? null,
      note: "Runs asynchronously. Fetch the result from GET /v1/transactions/{transaction_id} with the same API key.",
    };
  }
  if (status >= 400) return failure(status, body, slug);
  const r = (body.result ?? body) as Record<string, unknown>;
  return {
    ok: true as const,
    rail,
    slug,
    output: r.output ?? r.steps ?? null,
    price_cents: r.price_cents ?? null,
    latency_ms: r.latency_ms ?? null,
    provenance: r.provenance ?? null,
    transaction_id: r.transaction_id ?? null,
    ...(r.status ? { status: r.status } : {}),
    ...(r.errors ? { errors: r.errors } : {}),
    ...(r.gated ? { gated: r.gated } : {}),
    ...(typeof r.wallet_balance_cents === "number" ? { wallet_balance_cents: r.wallet_balance_cents } : {}),
  };
}

function failure(status: number, body: Record<string, unknown>, slug?: string) {
  const details = (body.details ?? null) as Record<string, unknown> | null;
  const out: Record<string, unknown> = {
    ok: false,
    status,
    error_code: body.error_code ?? (status === 402 ? "payment_required" : "error"),
    message: body.message ?? body.error ?? `HTTP ${status}`,
  };
  if (details?.fix) out.fix = details.fix;
  if (status === 401 || status === 402) {
    out.how_to_pay =
      "Create the tools with an apiKey (or set STRALE_API_KEY), or pass x402Fetch: a fetch that settles x402 " +
      "challenges in USDC on Base. Free tools need neither." + (slug ? ` x402 endpoint: /x402/${slug}` : "");
  }
  return out;
}

/** Both tools, keyed by the names the descriptions refer to. */
export function straleTools(options: StraleToolsOptions = {}) {
  return {
    strale_search: straleSearch(options),
    strale_execute: straleExecute(options),
  };
}
