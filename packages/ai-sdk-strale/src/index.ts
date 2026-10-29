import { tool, type Tool } from "ai";
import { z } from "zod";
import { request, resolveOptions, type HttpResult, type ResolvedOptions, type StraleToolsOptions } from "./client.js";

export { CLIENT_ID, type StraleToolsOptions } from "./client.js";

const SEARCH_DESCRIPTION =
  "Search Strale's library of pay-per-call tools for AI agents: company registry lookups, VAT and IBAN checks, " +
  "sanctions and PEP screening, web page reading, finance and developer utilities. Returns matching tools and " +
  "bundled solutions with slug, description, price in EUR cents and the input schema to pass to strale_execute. " +
  "No API key needed to search.";

const EXECUTE_DESCRIPTION =
  "Run one Strale tool or solution by slug and return its output. Call strale_search first to get the slug and " +
  "the input fields. Paid tools are charged per call; some tools are free without a key. Check `ok` in the result.";

type Kind = "capability" | "solution";

export interface StraleSearchInput {
  query: string;
  limit?: number;
}

export interface StraleExecuteInput {
  slug: string;
  type?: Kind;
  inputs: Record<string, unknown>;
}

/** Tool results are plain JSON objects; `ok` says whether the call succeeded. */
export type StraleToolResult = { ok: boolean } & Record<string, unknown>;

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
export function straleSearch(options: StraleToolsOptions = {}): Tool<StraleSearchInput, StraleToolResult> {
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

async function searchCatalogue(opts: ResolvedOptions, query: string, limit: number, signal?: AbortSignal): Promise<StraleToolResult> {
  const { status, body } = await request(
    opts,
    `/v1/suggest/typeahead?q=${encodeURIComponent(query)}&limit=${limit}`,
    { signal },
  );
  if (status >= 400) return failure(status, body, { hasKey: !!opts.apiKey });
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
        // A cancelled run must stop, not come back as a partial result.
        if (signal?.aborted) throw err;
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
  return { ok: true, query, total: typeof body.total === "number" ? body.total : results.length, results };
}

/**
 * Run a tool or solution. Rail, in order: API key (wallet debit, capped by
 * maxPriceCents), x402 (the supplied paying fetch settles the 402 challenge),
 * otherwise an anonymous call, which only the free tools accept.
 */
export function straleExecute(options: StraleToolsOptions = {}): Tool<StraleExecuteInput, StraleToolResult> {
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

async function runTool(opts: ResolvedOptions, slug: string, kind: Kind, inputs: Record<string, unknown>, signal?: AbortSignal): Promise<StraleToolResult> {
  const s = encodeURIComponent(slug);
  if (!opts.apiKey && opts.x402Fetch) {
    const path = kind === "solution" ? `/x402/solutions/${s}` : `/x402/${s}`;
    let res: HttpResult;
    try {
      res = await request(opts, path, { method: "POST", body: inputs, via: opts.x402Fetch, signal });
    } catch (err) {
      if (signal?.aborted) throw err;
      // Paying fetches throw on their own refusals (amount above the wrapper's
      // limit, failed signature). Hand the reason to the model.
      return {
        ok: false,
        rail: "x402",
        slug,
        error_code: "x402_client_error",
        message: (err as Error).message,
        fix: "Raise the paying fetch's spending limit, fund the wallet, or use an API key.",
      };
    }
    // Free tools that are not on the x402 rail answer 404 there but run
    // anonymously on /v1/do, so try that before reporting a miss.
    if (res.status === 404 && kind === "capability") return runViaApi(opts, slug, kind, inputs, signal);
    if (res.status >= 400) return failure(res.status, res.body, { slug, kind, hasKey: false });
    const { _meta, ...output } = res.body;
    return { ok: true, rail: "x402", slug, output, meta: _meta ?? null };
  }
  return runViaApi(opts, slug, kind, inputs, signal);
}

async function runViaApi(opts: ResolvedOptions, slug: string, kind: Kind, inputs: Record<string, unknown>, signal?: AbortSignal): Promise<StraleToolResult> {
  const path = kind === "solution" ? `/v1/solutions/${encodeURIComponent(slug)}/execute` : "/v1/do";
  const payload =
    kind === "solution"
      ? { inputs, max_price_cents: opts.maxPriceCents }
      : { capability_slug: slug, inputs, max_price_cents: opts.maxPriceCents };
  const { status, body } = await request(opts, path, { method: "POST", body: payload, auth: true, signal });
  const rail = opts.apiKey ? "api_key" : "free";
  if (status === 202) {
    const r = (body.result ?? body) as Record<string, unknown>;
    return {
      ok: true,
      rail,
      slug,
      status: "executing",
      transaction_id: r.transaction_id ?? null,
      note: "Runs asynchronously. Fetch the result from GET /v1/transactions/{transaction_id} with the same API key.",
    };
  }
  if (status >= 400) return failure(status, body, { slug, kind, hasKey: !!opts.apiKey });
  const r = (body.result ?? body) as Record<string, unknown>;
  // A solution answers 200 even when every step failed or a precondition
  // stopped it; neither is a success the model should build on.
  const failed = r.status === "failed" || !!r.gated;
  return {
    ok: !failed,
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
    ...(r.details ? { details: r.details } : {}),
    ...(typeof r.wallet_balance_cents === "number" ? { wallet_balance_cents: r.wallet_balance_cents } : {}),
  };
}

function failure(
  status: number,
  body: Record<string, unknown>,
  ctx: { slug?: string; kind?: Kind; hasKey: boolean },
): StraleToolResult {
  const details = (body.details ?? null) as Record<string, unknown> | null;
  const out: StraleToolResult = {
    ok: false,
    status,
    error_code: body.error_code ?? (status === 402 ? "payment_required" : "error"),
    message: body.message ?? body.error ?? `HTTP ${status}`,
  };
  if (details?.fix) out.fix = details.fix;
  // Only an unauthenticated caller needs telling how to pay; a key holder's
  // 402 is a budget or balance answer, already explained by the server.
  if ((status === 401 || status === 402) && !ctx.hasKey) {
    const x402Path = ctx.slug ? (ctx.kind === "solution" ? `/x402/solutions/${ctx.slug}` : `/x402/${ctx.slug}`) : undefined;
    out.how_to_pay =
      "Create the tools with an apiKey (or set STRALE_API_KEY), or pass x402Fetch: a fetch that settles x402 " +
      "challenges in USDC on Base. Free tools need neither." + (x402Path ? ` x402 endpoint: ${x402Path}` : "");
  }
  return out;
}

/** Both tools, keyed by the names the descriptions refer to. */
export function straleTools(options: StraleToolsOptions = {}): {
  strale_search: Tool<StraleSearchInput, StraleToolResult>;
  strale_execute: Tool<StraleExecuteInput, StraleToolResult>;
} {
  return {
    strale_search: straleSearch(options),
    strale_execute: straleExecute(options),
  };
}
