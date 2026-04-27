/**
 * x402 Scalable Gateway — DB-driven capability exposure via USDC payments.
 *
 * Replaces the hardcoded 5-endpoint gateway with a single wildcard handler.
 * Adding a new capability to x402 requires only a DB UPDATE — no code change,
 * no deployment.
 *
 * Route: /x402/:slug    — execute any x402-enabled capability
 * Route: /x402/catalog  — discover all available x402 capabilities
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, solutions, transactions } from "../db/schema.js";
import { getExecutor } from "../capabilities/index.js";
import {
  isX402Configured,
  verifyX402PaymentOnly,
  settleX402Payment,
  extractPaymentHeader,
  extractPayerAddress,
  eurCentsToUsdcAtomic,
  eurCentsToUsdString,
  encodePaymentResponseHeader,
  type X402VerifiedPayment,
} from "../lib/x402-gateway.js";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { sanitizeFailureReason } from "../lib/sanitize.js";
import { executeSolution } from "../lib/solution-executor.js";
import { logError } from "../lib/log.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface X402Capability {
  id: string; // UUID — needed for transaction FK
  slug: string;
  name: string;
  description: string;
  x402PriceUsd: number;
  x402Method: string;
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
  priceCents: number;
  matrixSqs: string | null;
  transparencyTag: string | null;
  dataJurisdiction: string | null;
}

interface X402Solution {
  id: string;
  slug: string;
  name: string;
  description: string;
  x402PriceUsd: number;
  priceCents: number;
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
}

// ─── Cache ──────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000;
let _capCache: Map<string, X402Capability> = new Map();
let _solCache: Map<string, X402Solution> = new Map();
let _cacheExpiry = 0;

async function ensureCache(): Promise<void> {
  if (Date.now() < _cacheExpiry) return;
  try {
    const db = getDb();

    // Capabilities
    const capRows = await db
      .select({
        id: capabilities.id,
        slug: capabilities.slug,
        name: capabilities.name,
        description: capabilities.description,
        x402PriceUsd: capabilities.x402PriceUsd,
        x402Method: capabilities.x402Method,
        inputSchema: capabilities.inputSchema,
        outputSchema: capabilities.outputSchema,
        priceCents: capabilities.priceCents,
        matrixSqs: capabilities.matrixSqs,
        transparencyTag: capabilities.transparencyTag,
        dataJurisdiction: capabilities.geography,
      })
      .from(capabilities)
      .where(and(
        eq(capabilities.x402Enabled, true),
        eq(capabilities.isActive, true),
        // Only serve active or probation capabilities via x402
        // Block degraded/suspended to prevent serving known-broken capabilities
        inArray(capabilities.lifecycleState, ["active", "probation"]),
      ));

    const newCapCache = new Map<string, X402Capability>();
    for (const row of capRows) {
      newCapCache.set(row.slug, {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description ?? "",
        x402PriceUsd: parseFloat(row.x402PriceUsd ?? "0"),
        x402Method: row.x402Method ?? "POST",
        inputSchema: row.inputSchema as Record<string, unknown> | null,
        outputSchema: row.outputSchema as Record<string, unknown> | null,
        priceCents: row.priceCents,
        matrixSqs: row.matrixSqs ?? null,
        transparencyTag: row.transparencyTag ?? null,
        dataJurisdiction: row.dataJurisdiction ?? null,
      });
    }

    // Solutions
    const solRows = await db
      .select({
        id: solutions.id,
        slug: solutions.slug,
        name: solutions.name,
        description: solutions.description,
        x402PriceUsd: solutions.x402PriceUsd,
        priceCents: solutions.priceCents,
        inputSchema: solutions.inputSchema,
      })
      .from(solutions)
      .where(and(eq(solutions.x402Enabled, true), eq(solutions.isActive, true)));

    const newSolCache = new Map<string, X402Solution>();
    for (const row of solRows) {
      newSolCache.set(row.slug, {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description ?? "",
        x402PriceUsd: parseFloat(row.x402PriceUsd ?? "0"),
        priceCents: row.priceCents,
        inputSchema: row.inputSchema as Record<string, unknown> | null,
        outputSchema: null, // solutions table has no output_schema column
      });
    }

    _capCache = newCapCache;
    _solCache = newSolCache;
    _cacheExpiry = Date.now() + CACHE_TTL_MS;
  } catch (err) {
    logError("x402-cache-refresh-failed", err);
  }
}

// ─── Configuration ──────────────────────────────────────────────────────────

// Network uses x402 v1 simple names ("base", "base-sepolia") for compatibility
// with the canonical x402-fetch client. CAIP-2 format ("eip155:8453") is v2 and
// not yet supported by the reference client as of 2026-04.
const NETWORK = process.env.X402_NETWORK ?? "base-sepolia";
const WALLET_ADDRESS = process.env.X402_WALLET_ADDRESS ?? "";
const BASE_URL = process.env.API_BASE_URL ?? "https://api.strale.io";

const USDC_CONTRACTS: Record<string, string> = {
  "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};
const USDC_ADDRESS = USDC_CONTRACTS[NETWORK] ?? USDC_CONTRACTS["base-sepolia"];

function usdToUsdcAtomic(usd: number): string {
  return Math.ceil(usd * 1_000_000).toString();
}

// ─── Input extraction ───────────────────────────────────────────────────────

function isSimpleSchema(schema: Record<string, unknown> | null): boolean {
  if (!schema) return true;
  const props = (schema as any).properties;
  if (!props) return true;
  return Object.values(props).every(
    (p: any) =>
      p.type === "string" ||
      p.type === "number" ||
      p.type === "integer" ||
      p.type === "boolean",
  );
}

async function extractInputs(
  c: any,
  schema: Record<string, unknown> | null,
): Promise<Record<string, unknown>> {
  // POST or JSON content-type → try JSON body first
  if (c.req.method === "POST" || c.req.header("content-type")?.includes("json")) {
    try {
      return await c.req.json();
    } catch {
      // Fall through to query params
    }
  }

  // GET or fallback: extract from query params with type coercion
  const query = c.req.query() as Record<string, string>;
  if (!schema) return query;

  const props = (schema as any).properties ?? {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    const propType = (props[key] as any)?.type;
    if (propType === "number" || propType === "integer") {
      result[key] = Number(value);
    } else if (propType === "boolean") {
      result[key] = value === "true" || value === "1";
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ─── Bazaar discovery extension builder ─────────────────────────────────────

/**
 * Generate an example input object from a JSON Schema's properties.
 * Used by the bazaar extension to show agents what a typical request looks like.
 */
function generateExampleFromSchema(
  schema: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!schema) return {};
  const props = (schema as any).properties;
  if (!props) return {};

  const example: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(props)) {
    const p = prop as any;
    if (p.enum && p.enum.length > 0) {
      example[key] = p.enum[0];
    } else if (p.default !== undefined) {
      example[key] = p.default;
    } else if (p.type === "string") {
      example[key] = `example_${key}`;
    } else if (p.type === "number" || p.type === "integer") {
      example[key] = 0;
    } else if (p.type === "boolean") {
      example[key] = true;
    } else if (p.type === "object") {
      example[key] = {};
    } else if (p.type === "array") {
      example[key] = [];
    }
  }
  return example;
}

/**
 * Convert a JSON Schema "properties" map into Bazaar's bodyFields/queryParams shape.
 *
 * JSON Schema format:
 *   { properties: { vat_number: { type: "string", description: "..." } }, required: ["vat_number"] }
 *
 * Bazaar format (each field carries its own required flag):
 *   { vat_number: { type: "string", description: "...", required: true } }
 */
function toBazaarFields(
  schema: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!schema) return {};
  const props = (schema as any).properties ?? {};
  const required = new Set<string>((schema as any).required ?? []);
  const out: Record<string, unknown> = {};
  for (const [name, prop] of Object.entries(props)) {
    const p = prop as any;
    const field: Record<string, unknown> = { type: p.type ?? "string" };
    if (p.description) field.description = p.description;
    if (p.default !== undefined) field.default = p.default;
    if (p.enum) field.enum = p.enum;
    if (required.has(name)) field.required = true;
    out[name] = field;
  }
  return out;
}

/**
 * Build the Bazaar discovery extension for a capability route.
 *
 * Uses `declareDiscoveryExtension` from `@x402/extensions/bazaar` to produce
 * the canonical extension (schema + info). We then emit two shapes so the
 * facilitator indexes regardless of the client's protocol version:
 *
 *  - `v2Extensions`: Goes on `PaymentRequired.extensions` at the 402 top
 *    level. x402-fetch v2 clients relay this into `paymentPayload.extensions`
 *    and the facilitator reads it at settle time.
 *  - `v1OutputSchema`: Goes on each `paymentRequirement.outputSchema`.
 *    The facilitator's `extractDiscoveryInfoV1` reads this when the payment
 *    is x402Version=1.
 *
 * Note: `declareDiscoveryExtension` deliberately omits `method` from the
 * input — it's normally enriched by `bazaarResourceServerExtension` at
 * request time when running inside an `x402ResourceServer`. Because we run
 * the facilitator client directly from a DB-driven wildcard route, we fill
 * method in ourselves.
 */
function buildBazaarDiscovery(
  method: string,
  inputSchema: Record<string, unknown> | null,
  outputSchema: Record<string, unknown> | null,
): { v2Extensions: Record<string, unknown>; v1OutputSchema: Record<string, unknown> } {
  const httpMethod = method.toUpperCase();
  const isBodyMethod = ["POST", "PUT", "PATCH"].includes(httpMethod);
  const example = generateExampleFromSchema(inputSchema);

  const config: Record<string, unknown> = {
    input: example,
    ...(inputSchema ? { inputSchema } : {}),
    ...(outputSchema ? { output: { schema: outputSchema } } : {}),
  };
  if (isBodyMethod) config.bodyType = "json";

  const extensionRecord = declareDiscoveryExtension(config as any) as Record<string, any>;
  const extension = extensionRecord.bazaar;

  // Patch in method (enrichDeclaration would do this inside an x402 server).
  const enrichedInfo = {
    ...extension.info,
    input: { ...extension.info.input, method: httpMethod },
  };
  const enrichedExtension = { ...extension, info: enrichedInfo };

  // v1 outputSchema: match the shape of working indexed entries in the live
  // CDP catalog (e.g. Heurist, Questflow) — field-descriptor maps keyed by
  // `bodyFields`/`queryParams`, not the SDK's `body: { field: "example" }`
  // form. The v1 extractor accepts both, but observed entries that actually
  // survive CDP's indexing pipeline on Base mainnet all use the descriptor
  // shape. Cheap hedge while #1982 (CDP drops v2 extensions on mainnet) is
  // unresolved upstream.
  const fieldDescriptors = toBazaarFields(inputSchema);
  const v1Input: Record<string, unknown> = {
    type: "http",
    method: httpMethod,
    discoverable: true,
  };
  if (isBodyMethod) {
    v1Input.bodyType = "json";
    v1Input.bodyFields = fieldDescriptors;
  } else {
    v1Input.queryParams = fieldDescriptors;
  }
  const v1Output = outputSchema ? toBazaarFields(outputSchema) : undefined;
  const v1OutputSchema: Record<string, unknown> = {
    input: v1Input,
    ...(v1Output ? { output: v1Output } : {}),
  };

  return {
    v2Extensions: { bazaar: enrichedExtension },
    v1OutputSchema,
  };
}

// ─── 402 Response builder ───────────────────────────────────────────────────

function build402(
  name: string,
  description: string,
  priceUsd: number,
  resourceUrl: string,
  matrixSqs?: string | null,
  inputSchema?: Record<string, unknown> | null,
  method?: string,
  outputSchema?: Record<string, unknown> | null,
) {
  const maxAmount = usdToUsdcAtomic(priceUsd);
  const sqs = matrixSqs ? parseFloat(String(matrixSqs)) : null;
  const sqsStr = sqs != null && sqs > 0 ? ` SQS: ${Math.round(sqs)}/100.` : "";

  const httpMethod = (method ?? "POST").toUpperCase();
  const { v2Extensions, v1OutputSchema } = buildBazaarDiscovery(
    httpMethod,
    inputSchema ?? null,
    outputSchema ?? null,
  );

  // CDP facilitator rejects PaymentRequirements whose description is too long
  // ("'paymentRequirements' is invalid: must match one of [x402Version 1/2
  // schemas]"). Observed limit is somewhere below 512 chars; capping at 256 is
  // safely under it and preserves the usable prefix. Keeps long descriptions
  // in the capability's input/output metadata without blocking settlement.
  const DESCRIPTION_MAX = 256;
  const combined = `${description}${sqsStr}`;
  const finalDescription =
    combined.length > DESCRIPTION_MAX
      ? `${combined.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`
      : combined;

  const paymentRequirement: Record<string, unknown> = {
    scheme: "exact",
    network: NETWORK,
    maxAmountRequired: maxAmount,
    resource: resourceUrl,
    description: finalDescription,
    mimeType: "application/json",
    payTo: WALLET_ADDRESS || "0x0000000000000000000000000000000000000001",
    maxTimeoutSeconds: 300,
    asset: USDC_ADDRESS,
    extra: { name: "USD Coin", version: "2" },
    // v1 discovery path: facilitator's extractDiscoveryInfoV1 reads this at settle.
    outputSchema: v1OutputSchema,
  };

  const body = {
    x402Version: 1,
    error: `Payment required. ${name} costs $${priceUsd.toFixed(4)} USDC per call.`,
    resource: {
      url: resourceUrl,
      description: finalDescription,
      mimeType: "application/json",
    },
    accepts: [paymentRequirement],
    // Legacy field name some older clients looked for — safe to keep
    paymentRequirements: [paymentRequirement],
    // v2 discovery path: top-level `extensions` per PaymentRequired schema.
    // v2 clients relay this into paymentPayload.extensions; the facilitator's
    // extractDiscoveryInfo reads paymentPayload.extensions.bazaar at settle.
    extensions: v2Extensions,
  };

  // v1 backward-compat header
  const headerPayload = Buffer.from(
    JSON.stringify({ x402Version: 1, accepts: [paymentRequirement] }),
  ).toString("base64");

  return { body, headerPayload, paymentRequirement };
}

// ─── Transaction recording ──────────────────────────────────────────────────

interface RecordX402Args {
  // Exactly one of capabilityId / solutionSlug is set.
  capabilityId: string | null;
  solutionSlug: string | null;
  slug: string; // surfaced in audit_trail for both kinds
  inputs: Record<string, unknown>;
  output: Record<string, unknown> | null;
  latencyMs: number;
  priceCents: number;
  priceUsd: number;
  transparencyTag: string | null;
  dataJurisdiction: string | null;
  settlementId?: string;
  payerAddress?: string | null;
  error?: string;
}

async function recordX402Transaction(args: RecordX402Args): Promise<string | null> {
  try {
    const db = getDb();
    const [row] = await db.insert(transactions).values({
      userId: null,
      capabilityId: args.capabilityId,
      solutionSlug: args.solutionSlug,
      status: args.error ? "failed" : "completed",
      input: args.inputs,
      output: args.output ?? undefined,
      error: args.error ?? null,
      priceCents: args.priceCents,
      latencyMs: args.latencyMs,
      auditTrail: {
        payment_method: "x402",
        settlement_id: args.settlementId ?? null,
        payer_address: args.payerAddress ?? null,
        price_usd: args.priceUsd,
        capability: args.slug,
        latency_ms: args.latencyMs,
        timestamp: new Date().toISOString(),
      },
      transparencyMarker: args.transparencyTag ?? "algorithmic",
      dataJurisdiction: args.dataJurisdiction ?? "EU",
      isFreeTier: false,
      paymentMethod: "x402",
      x402SettlementId: args.settlementId ?? null,
      priceUsd: args.priceUsd.toFixed(4),
      completedAt: new Date(),
    }).returning({ id: transactions.id });
    return row?.id ?? null;
  } catch (err) {
    logError("x402-transaction-recording-failed", err);
    return null;
  }
}

// ─── Route ──────────────────────────────────────────────────────────────────

export const x402GatewayV2 = new Hono();

// Permissive CORS — payment IS the auth
x402GatewayV2.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-Payment", "X-Payment-Response"],
    exposeHeaders: ["Payment-Required", "X-Payment-Response"],
  }),
);

// ─── Discovery: /x402/catalog ───────────────────────────────────────────────

x402GatewayV2.get("/catalog", async (c) => {
  await ensureCache();

  const caps = [..._capCache.values()].map((cap) => ({
    slug: cap.slug,
    name: cap.name,
    description: cap.description,
    price_usd: cap.x402PriceUsd,
    method: cap.x402Method,
    endpoint: `${BASE_URL}/x402/${cap.slug}`,
    input_schema: cap.inputSchema,
  }));

  const sols = [..._solCache.values()].map((sol) => ({
    slug: sol.slug,
    name: sol.name,
    description: sol.description,
    price_usd: sol.x402PriceUsd,
    method: "POST",
    endpoint: `${BASE_URL}/x402/solutions/${sol.slug}`,
    input_schema: sol.inputSchema,
  }));

  c.header("Cache-Control", "public, max-age=60");
  return c.json({
    x402: true,
    network: NETWORK,
    facilitator: process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator",
    wallet: WALLET_ADDRESS || null,
    capabilities: caps,
    solutions: sols,
    total: caps.length + sols.length,
  });
});

// ─── Solution execution: /x402/solutions/:slug ──────────────────────────────

x402GatewayV2.on(["GET", "POST"], "/solutions/:slug", async (c) => {
  const slug = c.req.param("slug");
  await ensureCache();

  const sol = _solCache.get(slug);
  if (!sol) {
    return c.json(
      { error: "Solution not found or not available via x402.", hint: `${BASE_URL}/x402/catalog` },
      404,
    );
  }

  // Payment check FIRST — so Bazaar's empty-body discovery crawl gets a 402
  // (not a 400 from failed JSON parse). See capability handler for detail.
  //
  // Verify only; defer settlement until the solution has produced at least one
  // successful step (DEC-14). If the solution produces no output the caller is
  // not charged.
  let verified: X402VerifiedPayment | undefined;
  if (sol.x402PriceUsd > 0) {
    const paymentHeader = extractPaymentHeader(c.req.raw.headers);

    if (!paymentHeader) {
      if (!isX402Configured()) {
        return c.json({ error: "x402 payments not configured on this server." }, 503);
      }
      const { body } = build402(
        sol.name, sol.description, sol.x402PriceUsd,
        `${BASE_URL}/x402/solutions/${slug}`,
        null, sol.inputSchema, "POST", sol.outputSchema,
      );
      // No Payment-Required header: v1 body is the canonical source. Emitting a
      // v1-encoded header trips v2-only header decoders (e.g. @agentcash/discovery)
      // which never fall back to body parsing once any header is present.
      return c.json(body, 402);
    }

    if (!isX402Configured()) {
      return c.json({ error: "x402 payments not configured." }, 503);
    }

    const solRebuild = build402(
      sol.name, sol.description, sol.x402PriceUsd,
      `${BASE_URL}/x402/solutions/${slug}`,
      null, sol.inputSchema, "POST", sol.outputSchema,
    );
    const verification = await verifyX402PaymentOnly(
      paymentHeader,
      sol.priceCents,
      sol.x402PriceUsd,
      {
        resource: solRebuild.paymentRequirement.resource as string,
        description: solRebuild.paymentRequirement.description as string,
        outputSchema: solRebuild.paymentRequirement.outputSchema as Record<string, unknown>,
      },
    );
    if (!verification.valid || !verification.verified) {
      return c.json({ error: "Payment verification failed", detail: verification.error }, 402);
    }
    verified = verification.verified;
  }

  // Extract inputs (after verify, before settle — bad input returns 4xx without charging)
  let inputs: Record<string, unknown>;
  try {
    inputs = await extractInputs(c, sol.inputSchema);
  } catch {
    return c.json({ error: "Invalid request body. Expected JSON." }, 400);
  }

  // Execute solution steps via shared orchestration module
  const result = await executeSolution(sol.id, inputs);

  if (!result) {
    return c.json({ error: "Solution has no steps configured." }, 503);
  }

  // Settle only if at least one step produced output. All-steps-failed returns
  // a 4xx-shaped response and the caller keeps their USDC authorization.
  // `result.steps` is a Record<slug, output | {error} | {skipped}>. A step
  // counts as successful when its value is an object with neither `error` nor
  // `skipped` set.
  const anyStepSucceeded = Object.values(result.steps).some((v) => {
    if (!v || typeof v !== "object") return false;
    const obj = v as Record<string, unknown>;
    return !("error" in obj) && !("skipped" in obj);
  });
  if (!anyStepSucceeded) {
    return c.json(
      {
        error: "Solution failed — no steps produced output. No payment was taken.",
        solution: sol.slug,
        steps: result.steps,
        errors: result.errors,
      },
      502,
    );
  }

  let settlementId: string | undefined;
  if (verified) {
    const settled = await settleX402Payment(verified);
    if (!settled.valid) {
      return c.json(
        { error: "Payment settlement failed", detail: settled.error },
        402,
      );
    }
    settlementId = settled.settlementId;
    if (settlementId) {
      c.header("X-Payment-Response", encodePaymentResponseHeader(settlementId));
    }
  }

  // Record transaction (fire-and-forget) — mirrors capability path so x402
  // solution calls show up in activity scripts and audit logs.
  const solPayerAddress = verified ? extractPayerAddress(verified) : null;
  recordX402Transaction({
    capabilityId: null,
    solutionSlug: sol.slug,
    slug: sol.slug,
    inputs,
    output: { steps: result.steps, errors: result.errors },
    latencyMs: result.latency_ms,
    priceCents: sol.priceCents,
    priceUsd: sol.x402PriceUsd,
    transparencyTag: "mixed",
    dataJurisdiction: "EU",
    settlementId,
    payerAddress: solPayerAddress,
  });

  return c.json({
    solution: sol.slug,
    steps: result.steps,
    errors: result.errors.length > 0 ? result.errors : undefined,
    _meta: {
      solution: sol.slug,
      step_count: result.step_count,
      latency_ms: result.latency_ms,
      payment: settlementId
        ? { method: "x402", settlement_id: settlementId, price_usd: sol.x402PriceUsd }
        : { method: "x402", price_usd: sol.x402PriceUsd },
    },
  });
});

// ─── Wildcard capability handler: /x402/:slug ───────────────────────────────

x402GatewayV2.on(["GET", "POST"], "/:slug", async (c) => {
  const slug = c.req.param("slug");
  // Skip reserved paths handled by explicit routes above
  if (slug === "catalog" || slug === "solutions") return c.notFound();

  await ensureCache();

  const cap = _capCache.get(slug);
  if (!cap) {
    return c.json(
      { error: "Capability not found or not available via x402.", hint: `${BASE_URL}/x402/catalog` },
      404,
    );
  }

  // Free capabilities ($0.00) skip payment
  const isFree = cap.x402PriceUsd === 0;
  let verified: X402VerifiedPayment | undefined;

  // Payment check FIRST — before any input validation. CDP's Bazaar crawler
  // sends an empty request to discover endpoints and requires HTTP 402 back.
  // Returning 400 (missing required fields) on empty bodies prevents indexing:
  // https://docs.cdp.coinbase.com/x402/quickstart-for-sellers — "If your
  // server returns any other status code (e.g. 400 Bad Request), the resource
  // will not be indexed."
  //
  // We VERIFY the signed authorization here but defer SETTLE until after the
  // capability has successfully produced output (DEC-14). Input validation and
  // capability failures no longer charge the caller; the signed authorization
  // simply expires via maxTimeoutSeconds.
  if (!isFree) {
    const paymentHeader = extractPaymentHeader(c.req.raw.headers);

    if (!paymentHeader) {
      if (!isX402Configured()) {
        return c.json({ error: "x402 payments not configured on this server." }, 503);
      }
      const { body } = build402(
        cap.name, cap.description, cap.x402PriceUsd,
        `${BASE_URL}/x402/${slug}`, cap.matrixSqs,
        cap.inputSchema, cap.x402Method, cap.outputSchema,
      );
      // See note on the solutions handler above — no Payment-Required header.
      return c.json(body, 402);
    }

    if (!isX402Configured()) {
      return c.json({ error: "x402 payments not configured." }, 503);
    }

    // Rebuild the same requirement so verify carries the discovery
    // outputSchema (v1 Bazaar indexing path) and the canonical resource URL.
    // The same handle is reused at settle time below.
    const capRebuild = build402(
      cap.name, cap.description, cap.x402PriceUsd,
      `${BASE_URL}/x402/${slug}`, cap.matrixSqs,
      cap.inputSchema, cap.x402Method, cap.outputSchema,
    );
    const verification = await verifyX402PaymentOnly(
      paymentHeader,
      cap.priceCents,
      cap.x402PriceUsd,
      {
        resource: capRebuild.paymentRequirement.resource as string,
        description: capRebuild.paymentRequirement.description as string,
        outputSchema: capRebuild.paymentRequirement.outputSchema as Record<string, unknown>,
      },
    );
    if (!verification.valid || !verification.verified) {
      return c.json(
        { error: "Payment verification failed", detail: verification.error },
        402,
      );
    }
    verified = verification.verified;
  }

  // Method check (after verify — crawler hits with any method)
  if (c.req.method === "GET" && !isSimpleSchema(cap.inputSchema)) {
    return c.json(
      { error: "This capability requires POST with JSON body.", input_schema: cap.inputSchema },
      405,
    );
  }

  // Extract inputs (after verify, before settle — bad input returns 4xx without charging)
  let inputs: Record<string, unknown>;
  try {
    inputs = await extractInputs(c, cap.inputSchema);
  } catch {
    return c.json({ error: "Invalid request body. Expected JSON." }, 400);
  }

  const schema = cap.inputSchema as any;
  if (schema?.required) {
    const missing = (schema.required as string[]).filter(
      (f: string) => inputs[f] === undefined || inputs[f] === null || inputs[f] === "",
    );
    if (missing.length > 0) {
      return c.json(
        { error: `Missing required fields: ${missing.join(", ")}`, input_schema: cap.inputSchema },
        400,
      );
    }
  }

  // Execute capability
  const executor = getExecutor(cap.slug);
  if (!executor) {
    return c.json({ error: "Capability executor unavailable. Try again later." }, 503);
  }

  const startMs = Date.now();
  let result: Awaited<ReturnType<typeof executor>>;
  try {
    result = await executor(inputs);
  } catch (err) {
    // Execution failed — do NOT settle. The signed authorization expires unused.
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: sanitizeFailureReason(message) }, 400);
  }

  const latencyMs = Date.now() - startMs;

  // Settle now that we have a real result. If settlement fails (rare — verify
  // already passed) surface a clear error; the client can retry the paid call.
  let settlementId: string | undefined;
  if (verified) {
    const settled = await settleX402Payment(verified);
    if (!settled.valid) {
      return c.json(
        { error: "Payment settlement failed", detail: settled.error },
        402,
      );
    }
    settlementId = settled.settlementId;
    if (settlementId) {
      c.header("X-Payment-Response", encodePaymentResponseHeader(settlementId));
    }
  }

  // Record transaction (fire-and-forget)
  const payerAddress = verified ? extractPayerAddress(verified) : null;
  recordX402Transaction({
    capabilityId: cap.id,
    solutionSlug: null,
    slug: cap.slug,
    inputs,
    output: result.output,
    latencyMs,
    priceCents: cap.priceCents,
    priceUsd: cap.x402PriceUsd,
    transparencyTag: cap.transparencyTag,
    dataJurisdiction: cap.dataJurisdiction,
    settlementId,
    payerAddress,
  });

  return c.json({
    ...result.output,
    _meta: {
      capability: cap.slug,
      latency_ms: latencyMs,
      provenance: result.provenance,
      payment: settlementId
        ? { method: "x402", settlement_id: settlementId, price_usd: cap.x402PriceUsd }
        : { method: "free" },
    },
  });
});

// ─── Exported for .well-known/x402.json ─────────────────────────────────────

export async function getX402Manifest(): Promise<{
  x402: boolean;
  facilitator: string;
  network: string;
  wallet: string | null;
  endpoints: Array<{ path: string; method: string; price: string; currency: string; network: string; description: string }>;
}> {
  await ensureCache();

  const endpoints = [
    ...[..._capCache.values()].map((cap) => ({
      path: `/x402/${cap.slug}`,
      method: cap.x402Method,
      price: cap.x402PriceUsd.toFixed(2),
      currency: "USDC",
      network: NETWORK,
      description: cap.description,
    })),
    ...[..._solCache.values()].map((sol) => ({
      path: `/x402/solutions/${sol.slug}`,
      method: "POST",
      price: sol.x402PriceUsd.toFixed(2),
      currency: "USDC",
      network: NETWORK,
      description: sol.description,
    })),
  ];

  return {
    x402: true,
    facilitator: process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator",
    network: NETWORK,
    wallet: WALLET_ADDRESS || null,
    endpoints,
  };
}

// Spec-compliant fan-out per x402scan's DISCOVERY.md: minimal { version, resources }
// shape consumed by x402scan, awesome-x402 indexers, and similar discovery tools.
// Free-tier ($0) capabilities are excluded — they never return 402, so any probe
// against them fails. They remain reachable via /v1/capabilities and /x402/catalog.
export async function getX402WellKnownResources(): Promise<{ version: number; resources: string[] }> {
  await ensureCache();
  const resources = [
    ...[..._capCache.values()].filter((cap) => cap.x402PriceUsd > 0).map((cap) => `${BASE_URL}/x402/${cap.slug}`),
    ...[..._solCache.values()].filter((sol) => sol.x402PriceUsd > 0).map((sol) => `${BASE_URL}/x402/solutions/${sol.slug}`),
  ];
  return { version: 1, resources };
}

// OpenAPI 3.1 path items for every paid x402-enabled capability and solution,
// with `x-payment-info` annotations per the x402scan/agentcash discovery spec.
// Driven by the same _capCache/_solCache used by /.well-known/x402, so a new
// paid capability becomes visible in /openapi.json automatically once
// x402_enabled = true in DB. Free-tier ($0) entries are excluded for the same
// reason as the well-known fan-out — they don't return 402.
export async function getX402OpenApiPaths(): Promise<Record<string, unknown>> {
  await ensureCache();
  const paths: Record<string, unknown> = {};

  for (const cap of _capCache.values()) {
    if (cap.x402PriceUsd <= 0) continue;
    const method = (cap.x402Method || "GET").toLowerCase();
    paths[`/x402/${cap.slug}`] = {
      [method]: buildX402Operation({
        summary: `${cap.name} (x402)`,
        description: cap.description,
        method,
        priceUsd: cap.x402PriceUsd,
        inputSchema: cap.inputSchema,
        outputSchema: cap.outputSchema,
      }),
    };
  }

  for (const sol of _solCache.values()) {
    if (sol.x402PriceUsd <= 0) continue;
    paths[`/x402/solutions/${sol.slug}`] = {
      post: buildX402Operation({
        summary: `${sol.name} (x402 solution)`,
        description: sol.description,
        method: "post",
        priceUsd: sol.x402PriceUsd,
        inputSchema: sol.inputSchema,
        outputSchema: sol.outputSchema,
      }),
    };
  }

  return paths;
}

function buildX402Operation(opts: {
  summary: string;
  description: string;
  method: string;
  priceUsd: number;
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
}): Record<string, unknown> {
  const op: Record<string, unknown> = {
    tags: ["x402"],
    summary: opts.summary,
    description: opts.description,
    "x-payment-info": {
      protocols: ["x402"],
      price: { mode: "fixed", currency: "USD", amount: opts.priceUsd.toFixed(3) },
    },
    security: [], // payment is the auth — no traditional auth scheme applies
    responses: {
      "402": { description: "Payment required (x402 — pay with USDC on Base)" },
      "200": {
        description: "Success",
        ...(opts.outputSchema
          ? { content: { "application/json": { schema: opts.outputSchema } } }
          : {}),
      },
    },
  };

  const schema = opts.inputSchema;
  const props = schema && typeof schema === "object"
    ? (schema as { properties?: Record<string, Record<string, unknown>> }).properties
    : undefined;
  const required = schema && typeof schema === "object"
    ? ((schema as { required?: string[] }).required ?? [])
    : [];

  if (props && Object.keys(props).length > 0) {
    if (opts.method === "get") {
      op.parameters = Object.entries(props).map(([name, prop]) => ({
        name,
        in: "query",
        required: required.includes(name),
        ...(prop.description ? { description: prop.description } : {}),
        schema: prop,
      }));
    } else {
      op.requestBody = {
        required: required.length > 0,
        content: { "application/json": { schema } },
      };
    }
  }

  return op;
}
