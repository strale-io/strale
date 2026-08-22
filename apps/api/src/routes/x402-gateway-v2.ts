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
import { eq, and, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, solutions, transactions, x402OrphanSettlements } from "../db/schema.js";
import { getExecutor } from "../capabilities/index.js";
import {
  assertGuardedAllow,
  CapabilityInvocationRefusedError,
  CapabilityNotClassifiedError,
  BudgetExhaustedError,
} from "../capabilities/guarded-executor.js";
import {
  isX402Configured,
  verifyX402PaymentOnly,
  hashPaymentHeader,
  settleX402Payment,
  extractPaymentHeader,
  extractPayerAddress,
  eurCentsToUsd,
  eurCentsToUsdcAtomic,
  eurCentsToUsdString,
  encodePaymentResponseHeader,
  getFacilitatorUrl,
  networkToCaip2,
  x402ChallengeVersion,
  type X402VerifiedPayment,
} from "../lib/x402-gateway.js";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { sellerRevenueBySlug, rankBySales } from "../lib/seller-rank.js";
import { encodePaymentRequiredHeader } from "@x402/core/http";
import { extractClientMeta, recordDiscoveryHit, hashX402Payer } from "../lib/attribution.js";
import { rateLimitByIp } from "../lib/rate-limit.js";
import { sanitizeFailureReason } from "../lib/sanitize.js";
import { executeSolution } from "../lib/solution-executor.js";
import * as settlementIntent from "../lib/x402-settlement-intent.js";
import { isX402RailEligible } from "../lib/x402-eligibility.js";
import {
  aggregateSolutionOutcome,
  assertBillableOutput,
  outcomeFromError,
  outcomeFromOutput,
} from "../lib/execution-outcome.js";
import { recordCustomerInvocation } from "../lib/invocation-facts.js";
import { logError } from "../lib/log.js";
import { getProcessingJurisdictions } from "../lib/provenance-builder.js";
import { getProcessingLocation } from "../lib/processing-location.js";
import { getShareableUrl } from "../lib/audit-token.js";
import { TRANSACTION_RETENTION_DAYS } from "../lib/data-retention.js";
import { validateX402Input } from "../lib/x402-input-validation.js";
import { recordX402Miss } from "../lib/x402-demand.js";
import { createHash } from "node:crypto";

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
  transparencyTag: string | null;
  // CCO #3 / F-AUDIT-01: previously stored capabilities.geography here
  // and passed it as dataJurisdiction at record time. Conceptual error:
  // geography is "where the data is about" (a property of the dataset);
  // dataJurisdiction is "where the call was processed" (a property of
  // the runtime). The two are unrelated under GDPR Art. 30/44–49.
  // dataJurisdiction is now computed at record time from Strale's region
  // + transparencyTag — see recordX402Transaction.
  // CRIT-8: extra fields needed to build a full-shape audit body. Pre-fix
  // the audit_trail JSONB on x402 rows had only payment+latency fields;
  // these extras let buildX402AuditTrail produce parity with buildFullAudit.
  capabilityType: string | null;
  dataSource: string | null;
  dataClassification: string | null;
  processesPersonalData: boolean;
  personalDataCategories: string[];
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

/**
 * Drop the catalogue cache so a test that seeds a solution can reach it.
 *
 * The cache holds for 60s, which is correct in production and makes any test
 * seeding more than one slug per minute silently 404 on everything after the
 * first — a failure that reads like a broken route rather than a stale cache.
 * Named with the `__…ForTests` convention already used in guarded-executor.ts.
 */
export function __resetX402CacheForTests(): void {
  _capCache = new Map();
  _solCache = new Map();
  _cacheExpiry = 0;
}

async function ensureCache(): Promise<void> {
  if (Date.now() < _cacheExpiry) return;
  try {
    const db = getDb();

    // Capabilities
    //
    // x402PriceUsd is derived at load time from priceCents × EUR_USD_RATE
    // (see eurCentsToUsd in lib/x402-gateway.ts). The capabilities.x402_price_usd
    // DB column is a stored cache only — runtime never trusts it. Per
    // DEC-20260502-A: x402 uses the same catalog price as the wallet path;
    // there is no separate USD tier. Free-tier capabilities are signalled by
    // priceCents === 0 and bypass payment regardless of the column.
    const capRows = await db
      .select({
        id: capabilities.id,
        slug: capabilities.slug,
        name: capabilities.name,
        description: capabilities.description,
        x402Method: capabilities.x402Method,
        inputSchema: capabilities.inputSchema,
        outputSchema: capabilities.outputSchema,
        priceCents: capabilities.priceCents,
        transparencyTag: capabilities.transparencyTag,
        capabilityType: capabilities.capabilityType,
        dataSource: capabilities.dataSource,
        dataClassification: capabilities.dataClassification,
        processesPersonalData: capabilities.processesPersonalData,
        personalDataCategories: capabilities.personalDataCategories,
      })
      .from(capabilities)
      .where(and(
        eq(capabilities.x402Enabled, true),
        eq(capabilities.isActive, true),
        // strale.dev surfacing per DEC-20260503-A — the x402 manifest
        // mirrors the marketplace, so non-eligible capabilities are
        // hidden from the facilitator/discovery layer too.
        eq(capabilities.marketplaceEligible, true),
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
        x402PriceUsd: eurCentsToUsd(row.priceCents),
        x402Method: row.x402Method ?? "POST",
        inputSchema: row.inputSchema as Record<string, unknown> | null,
        outputSchema: row.outputSchema as Record<string, unknown> | null,
        priceCents: row.priceCents,
        transparencyTag: row.transparencyTag ?? null,
        capabilityType: row.capabilityType ?? null,
        dataSource: row.dataSource ?? null,
        dataClassification: row.dataClassification ?? null,
        processesPersonalData: row.processesPersonalData,
        personalDataCategories: row.personalDataCategories ?? [],
      });
    }

    // Solutions — same derivation rule as capabilities.
    const solRows = await db
      .select({
        id: solutions.id,
        slug: solutions.slug,
        name: solutions.name,
        description: solutions.description,
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
        x402PriceUsd: eurCentsToUsd(row.priceCents),
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
  // `usd` always originates from eurCentsToUsd (an exact multiple of 1e-6);
  // round() inverts the /1e6 exactly. ceil() here re-created the +1
  // atomic-unit artifact through float error (ceil(n/1e6*1e6) = n+1 for ~3%
  // of cent values) — the P1 pricing fix's review caught the round-trip.
  return Math.round(usd * 1_000_000).toString();
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

  // Agents treat the example as a request template and substitute their own
  // values into it, so it must be a VALID minimal request, not a field tour:
  //
  //  - When the schema declares anyOf/oneOf required-groups (either/or
  //    capabilities), emit only the first branch's fields. Emitting every
  //    alternative at once ({url, domain}) contradicts the "Provide one of"
  //    error it ships alongside.
  //  - Booleans without a declared default are OMITTED, not set to true.
  //    Emitting `true` for opt-in flags taught agents to set them — for
  //    us-company-data that meant handing every 400 recipient
  //    `allow_low_confidence: true`, the exact bypass of the wrong-company
  //    guard this capability exists to enforce.
  const branches = ((schema as any).anyOf ?? (schema as any).oneOf) as
    | Array<{ required?: string[] }>
    | undefined;
  const firstBranch = Array.isArray(branches)
    ? branches.find((b) => Array.isArray(b?.required) && b.required.length > 0)
    : undefined;
  const includeKeys = firstBranch?.required
    ? new Set(firstBranch.required)
    : null;

  const example: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(props)) {
    if (includeKeys && !includeKeys.has(key)) continue;
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
      continue; // no default declared — omit rather than teach agents to flip flags
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

export function build402(
  name: string,
  description: string,
  priceUsd: number,
  resourceUrl: string,
  inputSchema?: Record<string, unknown> | null,
  method?: string,
  outputSchema?: Record<string, unknown> | null,
  challengeVersion?: 1 | 2,
) {
  const version = challengeVersion ?? x402ChallengeVersion();
  const maxAmount = usdToUsdcAtomic(priceUsd);

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
  const finalDescription =
    description.length > DESCRIPTION_MAX
      ? `${description.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`
      : description;

  const payTo = WALLET_ADDRESS || "0x0000000000000000000000000000000000000001";

  const paymentRequirement: Record<string, unknown> = {
    scheme: "exact",
    network: NETWORK,
    maxAmountRequired: maxAmount,
    resource: resourceUrl,
    description: finalDescription,
    mimeType: "application/json",
    payTo,
    maxTimeoutSeconds: 300,
    asset: USDC_ADDRESS,
    extra: { name: "USD Coin", version: "2" },
    // v1 discovery path: facilitator's extractDiscoveryInfoV1 reads this at settle.
    outputSchema: v1OutputSchema,
  };

  const error = `Payment required. ${name} costs $${priceUsd.toFixed(4)} USDC per call.`;
  const resourceInfo = {
    url: resourceUrl,
    description: finalDescription,
    mimeType: "application/json",
  };

  // Challenge body. The /x402/v2/* alias paths always get the v2 shape
  // (x402Version 2, CAIP-2 network, `amount`, per PaymentRequiredV2 — what
  // x402scan and v2 clients validate), with the legacy v1 fields merged
  // into the accepts entry as extra keys (the v2 zod schemas are non-strict)
  // and a pure v1 mirror under the legacy `paymentRequirements` key. The
  // legacy paths serve x402ChallengeVersion() (v1 until cutover) because
  // canonical v1 clients zod-parse accepts[].network against a strict
  // bare-name enum and hard-fail on any v2 body — see the schemas note on
  // x402ChallengeVersion().
  const body =
    version === 1
      ? {
          x402Version: 1,
          error,
          resource: resourceInfo,
          accepts: [paymentRequirement],
          paymentRequirements: [paymentRequirement],
          extensions: v2Extensions,
        }
      : {
          x402Version: 2,
          error,
          resource: resourceInfo,
          accepts: [
            {
              scheme: "exact",
              network: networkToCaip2(NETWORK),
              amount: maxAmount,
              asset: USDC_ADDRESS,
              payTo,
              maxTimeoutSeconds: 300,
              extra: { name: "USD Coin", version: "2" },
              // Legacy v1 fields for old clients reading accepts[0] directly:
              maxAmountRequired: maxAmount,
              resource: resourceUrl,
              description: finalDescription,
              mimeType: "application/json",
              outputSchema: v1OutputSchema,
            },
          ],
          // Legacy mirror in pure v1 shape (bare network name).
          paymentRequirements: [paymentRequirement],
          // v2 discovery path: top-level `extensions` per PaymentRequired
          // schema. v2 clients relay this into paymentPayload.extensions; the
          // facilitator's extractDiscoveryInfo reads it at settle.
          extensions: v2Extensions,
        };

  // v1 backward-compat header
  const headerPayload = Buffer.from(
    JSON.stringify({ x402Version: 1, accepts: [paymentRequirement] }),
  ).toString("base64");

  return { body, headerPayload, paymentRequirement };
}

// ─── Shared 400 envelope ────────────────────────────────────────────────────
//
// Every schema-related 400 on the x402 surface carries the same shape:
// the specific error, the capability/solution's input_schema, a generated
// example, and the catalog hint. One builder so the envelope can't drift
// between the three call sites (solutions validation, capability validation,
// executor-failure catch).
//
// `error_code` (DEC-19 stable enum, same values as /v1/do) is the
// discriminator agents branch on: "invalid_request" = fix your input and
// resend; "execution_failed" = the input may be fine and the upstream
// failed — retry with backoff instead of mutating the request. `charged` is
// always false here: these 400s happen after verify but before settle, so
// the signed authorization expires unused (DEC-14).
function schemaBadRequest(
  c: any,
  error: string | undefined,
  inputSchema: Record<string, unknown> | null,
  errorCode: "invalid_request" | "execution_failed" = "invalid_request",
) {
  return c.json(
    {
      error,
      error_code: errorCode,
      charged: false,
      input_schema: inputSchema,
      example: generateExampleFromSchema(inputSchema),
      hint: `${BASE_URL}/x402/catalog`,
    },
    400,
  );
}

// ─── Cert-audit C9: payment-header dedup ────────────────────────────────────
//
// The x402 flow is verify → execute → settle. Between verify and settle,
// the same payment header can be replayed (client retry, proxy redelivery,
// adversarial replay). Without dedup, the second arrival would re-execute
// the capability and attempt a second on-chain settlement. The facilitator
// usually rejects the duplicate, but we'd still consume external API quota
// for the executor and produce a second transactions row.
//
// Dedup strategy: hash(X-Payment header) → unique partial index on
// transactions.x402_payment_hash. Pre-execute lookup. If found and the
// row is `completed`, return its output as the cached response. If found
// and `failed`, return its error.

async function findCachedX402Response(
  paymentHash: string,
): Promise<{ status: string; output: unknown; latencyMs: number | null; settlementId: string | null } | null> {
  const db = getDb();
  const rows = await db
    .select({
      status: transactions.status,
      output: transactions.output,
      latencyMs: transactions.latencyMs,
      settlementId: transactions.x402SettlementId,
    })
    .from(transactions)
    .where(eq(transactions.x402PaymentHash, paymentHash))
    .limit(1);
  return rows[0] ?? null;
}

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
  // dataJurisdiction is computed inside recordX402Transaction; not passed in.
  settlementId?: string;
  payerAddress?: string | null;
  error?: string;
  /** Channel attribution signals captured at the route (design 2026-08-12). */
  clientMeta?: object | null;
  // CRIT-8: when present, the rich buildX402AuditTrail builder uses these
  // cap-side fields to produce a full-shape audit body. Capability path
  // populates this from the X402Capability cache; solution path leaves
  // it null (solutions get the leaner aggregate shape).
  capForAudit?: {
    transparencyTag: string | null;
    capabilityType: string | null;
    dataSource: string | null;
    dataClassification: string | null;
    processesPersonalData: boolean;
    personalDataCategories: string[];
    outputSchema: Record<string, unknown> | null;
  };
  // Cert-audit C9: persisted with the row so a replay returns this row.
  paymentHash?: string | null;
}

// CRIT-8: produce an audit_trail JSONB shape comparable to buildFullAudit
// (do.ts) so x402 customers get a real compliance record, not the prior
// 7-field stub. Mirrors the wallet-path body's compliance block, regulatory
// mapping, transparency marker, and schema validation.
function buildX402AuditTrail(args: {
  transactionId: string | null; // null when called pre-INSERT (we don't have one yet)
  cap: { slug: string; transparencyTag: string | null; capabilityType: string | null; dataSource: string | null; dataClassification: string | null; processesPersonalData: boolean; personalDataCategories: string[]; outputSchema: Record<string, unknown> | null };
  inputs: Record<string, unknown>;
  output: unknown;
  latencyMs: number;
  priceUsd: number;
  settlementId?: string;
  payerAddress?: string | null;
  error?: string;
}): Record<string, unknown> {
  const { cap, inputs, output, latencyMs, priceUsd, settlementId, payerAddress, error, transactionId } = args;
  const marker = cap.transparencyTag === "algorithmic" ? "algorithmic" :
                 cap.transparencyTag === "mixed" ? "hybrid" : "ai_generated";
  const aiInvolvement = marker === "algorithmic"
    ? "None — fully algorithmic (no LLM calls)"
    : marker === "hybrid"
      ? "Mixed — LLM-assisted with algorithmic validation"
      : "Fully AI — LLM generates or transforms output";
  const inputHash = `sha256:${createHash("sha256").update(JSON.stringify(inputs)).digest("hex")}`;
  // schema_validated: same minimal "object + required fields present" check
  // do.ts uses. False when we can't verify (no schema, or output null on
  // failure path).
  const schemaValidated = (() => {
    if (!cap.outputSchema || error) return false;
    if (!output || typeof output !== "object" || Array.isArray(output)) {
      return cap.outputSchema.type !== "object";
    }
    const required = (cap.outputSchema as { required?: string[] }).required ?? [];
    for (const f of required) {
      if (!(f in (output as Record<string, unknown>)) || (output as Record<string, unknown>)[f] == null) {
        return false;
      }
    }
    return true;
  })();
  const shareable = transactionId ? getShareableUrl(transactionId) : null;
  return {
    transaction_id: transactionId,
    timestamp: new Date().toISOString(),
    capability: cap.slug,
    data_source: cap.dataSource ?? cap.slug,
    data_classification: cap.dataClassification ?? "unknown",
    transparency_marker: marker,
    ai_description: aiInvolvement,
    data_jurisdiction: getProcessingJurisdictions("stable_api", cap.transparencyTag).join(",") || "unknown",
    processing_location: getProcessingLocation(),
    execution_mode: "sync",
    latency_ms: latencyMs,
    input_hash: inputHash,
    schema_validated: schemaValidated,
    // x402-specific payment context preserved alongside the compliance shape.
    payment_method: "x402",
    settlement_id: settlementId ?? null,
    payer_address: payerAddress ?? null,
    price_usd: priceUsd,
    ...(error ? { error: error.substring(0, 500) } : {}),
    compliance: {
      ai_involvement: aiInvolvement,
      personal_data_processed: cap.processesPersonalData,
      personal_data_categories: cap.personalDataCategories,
      human_oversight: "autonomous",
      data_retention_days: TRANSACTION_RETENTION_DAYS,
      ...(transactionId && shareable ? {
        shareable_url: shareable.url,
        shareable_url_expires_at: shareable.expiresAt,
        deletion_endpoint: `DELETE /v1/transactions/${transactionId}`,
        access_endpoint: `GET /v1/transactions/${transactionId}`,
      } : {}),
      regulations_addressed: {
        eu_ai_act: {
          article_12: "Full execution logging with timestamp, data source, latency, and payment settlement",
          article_13: "Transparency marker indicates AI vs algorithmic processing",
          article_50: "AI-generated content marked via transparency_marker",
        },
        gdpr: {
          article_30: "Complete processing record with data sources, classifications, and jurisdiction",
        },
      },
    },
  };
}

async function recordX402Transaction(args: RecordX402Args): Promise<string | null> {
  // F-AUDIT-01 / CCO #3: dataJurisdiction is the actual processing region(s),
  // computed from Strale's region + LLM provider region based on transparencyTag.
  const jurisdictions = getProcessingJurisdictions(
    "stable_api",
    args.transparencyTag,
  ).join(",") || "unknown";
  const db = getDb();
  // CRIT-8: build the rich audit_trail shape when cap-side context is
  // available (capability path); fall back to the leaner shape for
  // solutions and any path that doesn't supply capForAudit.
  // transactionId is null at insert time — buildX402AuditTrail's
  // shareable_url + endpoint paths are populated post-INSERT in a
  // follow-up UPDATE so the row's own ID can be referenced.
  const auditTrail = args.capForAudit
    ? buildX402AuditTrail({
        transactionId: null,
        cap: { slug: args.slug, ...args.capForAudit },
        inputs: args.inputs,
        output: args.output,
        latencyMs: args.latencyMs,
        priceUsd: args.priceUsd,
        settlementId: args.settlementId,
        payerAddress: args.payerAddress,
        error: args.error,
      })
    : {
        // Legacy lean shape for solution path (and any caller that doesn't
        // populate capForAudit). Rich solution-path audit is a v1.1 task.
        payment_method: "x402",
        settlement_id: args.settlementId ?? null,
        payer_address: args.payerAddress ?? null,
        price_usd: args.priceUsd,
        capability: args.slug,
        latency_ms: args.latencyMs,
        timestamp: new Date().toISOString(),
        ...(args.error ? { error: args.error.substring(0, 500) } : {}),
      };
  try {
    const [row] = await db.insert(transactions).values({
      userId: null,
      capabilityId: args.capabilityId,
      solutionSlug: args.solutionSlug,
      status: args.error ? "failed" : "completed",
      clientMeta: args.clientMeta ?? null,
      input: args.inputs,
      output: args.output ?? undefined,
      error: args.error ?? null,
      priceCents: args.priceCents,
      latencyMs: args.latencyMs,
      auditTrail,
      transparencyMarker: args.transparencyTag ?? "algorithmic",
      dataJurisdiction: jurisdictions,
      isFreeTier: false,
      paymentMethod: "x402",
      x402SettlementId: args.settlementId ?? null,
      x402PaymentHash: args.paymentHash ?? null,
      // MCP funnel P0: stable pseudonymous payer identity for distinct-payer
      // / repeat-rate analytics — see hashX402Payer's docstring. The raw
      // address stays in auditTrail.payer_address (above) for refund/
      // reconciliation; this column is the surface the weekly rollup reads.
      x402PayerHash: hashX402Payer(args.payerAddress) ?? null,
      priceUsd: args.priceUsd.toFixed(4),
      completedAt: new Date(),
    }).returning({ id: transactions.id });
    const insertedId = row?.id ?? null;
    // CRIT-8 follow-up: now that we have the row's id, rebuild the audit
    // with the shareable_url / endpoint fields populated and overwrite.
    // Same-tx rebuild not used here because the rich shape is only
    // valuable when transactionId is real — and we get the id from the
    // INSERT's returning(). Best-effort UPDATE; failure leaves the row
    // with the pre-id audit body, which is still richer than the
    // pre-CRIT-8 stub.
    if (insertedId && args.capForAudit) {
      const fullAudit = buildX402AuditTrail({
        transactionId: insertedId,
        cap: { slug: args.slug, ...args.capForAudit },
        inputs: args.inputs,
        output: args.output,
        latencyMs: args.latencyMs,
        priceUsd: args.priceUsd,
        settlementId: args.settlementId,
        payerAddress: args.payerAddress,
        error: args.error,
      });
      try {
        await db
          .update(transactions)
          .set({ auditTrail: fullAudit })
          .where(eq(transactions.id, insertedId));
      } catch (updErr) {
        logError("x402-audit-rebuild-failed", updErr, { transactionId: insertedId });
      }
    }
    // WP5: the row landed, so the intent is discharged. Best-effort — the
    // customer-facing record must never fail to land because bookkeeping did,
    // and a missed mark leaves an intent the reconciler resolves as
    // already-recorded.
    if (args.settlementId) {
      try {
        await settlementIntent.markRecordedBySettlement(db, {
          settlementId: args.settlementId,
          transactionId: insertedId,
        });
      } catch (intentErr) {
        logError("x402-intent-mark-recorded-failed", intentErr, {
          settlementId: args.settlementId,
        });
      }
    }
    return insertedId;
  } catch (err) {
    logError("x402-transaction-recording-failed", err);
    // CCO P0 #12: settlement preceded this INSERT and is irreversible.
    // Capture the orphan in a dedicated table so operations can reconcile
    // (recreate the transactions row OR refund the customer at payer_address).
    // Best-effort; if the orphan write also fails, we log and the only
    // remaining recovery is on-chain reconciliation against our wallet.
    if (args.settlementId) {
      try {
        await db.insert(x402OrphanSettlements).values({
          settlementId: args.settlementId,
          capabilitySlug: args.capabilityId ? args.slug : null,
          solutionSlug: args.solutionSlug,
          payerAddress: args.payerAddress ?? null,
          priceUsd: args.priceUsd.toFixed(4),
          priceCents: args.priceCents,
          rawArgs: args as unknown as Record<string, unknown>,
          failureReason: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
        });
        logError("x402-orphan-settlement-recorded", new Error(
          `Settlement ${args.settlementId} captured in x402_orphan_settlements for manual reconciliation`,
        ), { settlementId: args.settlementId });
      } catch (orphanErr) {
        // Both writes failed. This is a rare double-failure that
        // requires on-chain reconciliation. Log loudly with all the
        // context we have so an operator can manually recover.
        logError("x402-orphan-settlement-write-also-failed", orphanErr, {
          settlementId: args.settlementId,
          payerAddress: args.payerAddress,
          priceUsd: args.priceUsd,
          slug: args.slug,
          capabilityId: args.capabilityId,
          solutionSlug: args.solutionSlug,
        });
      }
    }
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

x402GatewayV2.get("/catalog", rateLimitByIp(120, 60_000), async (c) => {
  recordDiscoveryHit("/x402/catalog", c.req, {
    src: c.req.query("src"),
    ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip"),
  });
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
    // Must reflect the facilitator payments actually settle through, not the
    // legacy URL env var — see getFacilitatorUrl in lib/x402-gateway.ts.
    facilitator: getFacilitatorUrl(),
    wallet: WALLET_ADDRESS || null,
    capabilities: caps,
    solutions: sols,
    total: caps.length + sols.length,
  });
});

/**
 * Does this slug name anything we sell, on any rail?
 *
 * Cached for the same reason the catalogue caches: this runs on an
 * unauthenticated route that discovery crawlers hammer, and it must not turn
 * every stray 404 into a database round-trip. A miss on the cache is a single
 * indexed lookup; the cache itself is rebuilt lazily.
 */
const KNOWN_SLUG_TTL_MS = 15 * 60 * 1000;
let _knownSlugs: Set<string> | null = null;
let _knownSlugsAt = 0;

async function isKnownSlug(slug: string): Promise<boolean> {
  const now = Date.now();
  if (!_knownSlugs || now - _knownSlugsAt > KNOWN_SLUG_TTL_MS) {
    try {
      const rows = (await getDb().execute(sql`
        SELECT slug FROM capabilities
        UNION ALL
        SELECT slug FROM solutions`)) as unknown as Array<{ slug: string }>;
      _knownSlugs = new Set(rows.map((r) => r.slug));
      _knownSlugsAt = now;
    } catch {
      // Fail toward the safer classification: an unclassified miss recorded as
      // "unknown" is a false build signal, so treat a lookup failure as
      // "probably known" and keep it out of the build queue.
      return true;
    }
  }
  return _knownSlugs.has(slug);
}

// ─── Solution execution: /x402/solutions/:slug ──────────────────────────────

x402GatewayV2.on(["GET", "POST"], ["/solutions/:slug", "/v2/solutions/:slug"], async (c) => {
  const slug = c.req.param("slug");
  // /x402/v2/* aliases always serve the v2 challenge generation; the legacy
  // path serves x402ChallengeVersion() (v1 until cutover). Discovery
  // surfaces advertise the v2 paths; existing payers keep the legacy ones.
  const isV2Path = c.req.path.startsWith("/x402/v2/");
  const challengeVersion: 1 | 2 = isV2Path ? 2 : x402ChallengeVersion();
  const resourceUrl = `${BASE_URL}${c.req.path}`;
  await ensureCache();

  const sol = _solCache.get(slug);
  if (!sol) {
    const known = await isKnownSlug(slug);
    recordX402Miss({ slug, kind: known ? "x402_not_on_rail" : "x402_unknown_slug",
      detail: known ? "known solution, not enabled for x402" : "no such x402 solution",
      ...{ userAgent: c.req.header("user-agent") ?? null,
        ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
          ?? c.req.header("cf-connecting-ip") ?? null } });
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
  let paymentHash: string | null = null;
  if (sol.x402PriceUsd > 0) {
    const paymentHeader = extractPaymentHeader(c.req.raw.headers);

    if (!paymentHeader) {
      if (!isX402Configured()) {
        return c.json({ error: "x402 payments not configured on this server." }, 503);
      }
      const { body } = build402(
        sol.name, sol.description, sol.x402PriceUsd,
        resourceUrl,
        sol.inputSchema, "POST", sol.outputSchema,
        challengeVersion,
      );
      // Legacy paths: no Payment-Required header — the v1 body is the
      // canonical source, and a v1-encoded header trips v2-only header
      // decoders (e.g. @agentcash/discovery) which never fall back to body
      // parsing once any header is present. v2 paths: the header is
      // REQUIRED — @x402/core's client reads PAYMENT-REQUIRED first and its
      // body fallback is v1-only, so canonical v2 clients cannot pay a
      // header-less v2 challenge (found live-verifying the x402 example
      // template, 2026-08-13). A v2-encoded header doesn't retrigger the
      // @agentcash issue: that decoder chokes on v1 encodings, not v2.
      if (challengeVersion === 2) {
        c.header("PAYMENT-REQUIRED", encodePaymentRequiredHeader(body as never));
      }
      return c.json(body, 402);
    }

    if (!isX402Configured()) {
      return c.json({ error: "x402 payments not configured." }, 503);
    }

    const solRebuild = build402(
      sol.name, sol.description, sol.x402PriceUsd,
      resourceUrl,
      sol.inputSchema, "POST", sol.outputSchema,
      challengeVersion,
    );
    const verification = await verifyX402PaymentOnly(
      paymentHeader,
      sol.priceCents,
      sol.x402PriceUsd,
      {
        resource: resourceUrl,
        description: solRebuild.paymentRequirement.description as string,
        outputSchema: solRebuild.paymentRequirement.outputSchema as Record<string, unknown>,
      },
    );
    if (!verification.valid || !verification.verified) {
      // Spec-shaped failure: a full PaymentRequired body hands the client
      // fresh requirements to re-sign against, with the facilitator's
      // reason in the standard `error` field (v2 clients parse 402 bodies
      // strictly and would otherwise surface a parse error instead).
      const failBody = { ...solRebuild.body } as Record<string, unknown>;
      failBody.error = `Payment verification failed: ${verification.error ?? "unknown reason"}`;
      if (challengeVersion === 2) {
        c.header("PAYMENT-REQUIRED", encodePaymentRequiredHeader(failBody as never));
      }
      return c.json(failBody, 402);
    }
    verified = verification.verified;

    // Cert-audit C9: replay dedup. If this exact payment header was already
    // processed and recorded, return the cached row instead of re-running.
    // Only safe AFTER verify so an unverified replay can't probe for the
    // existence of cached rows.
    paymentHash = hashPaymentHeader(paymentHeader);
    const cached = await findCachedX402Response(paymentHash);
    if (cached) {
      if (cached.status === "completed") {
        return c.json({
          solution: sol.slug,
          steps: (cached.output as { steps?: unknown })?.steps ?? cached.output,
          _meta: {
            solution: sol.slug,
            replayed: true,
            note: "Returned from cache — same X-Payment header was already processed.",
            latency_ms: cached.latencyMs,
            payment: cached.settlementId
              ? { method: "x402", settlement_id: cached.settlementId, price_usd: sol.x402PriceUsd }
              : { method: "x402", price_usd: sol.x402PriceUsd },
          },
        });
      }
      return c.json(
        { error: "Prior request with this payment header failed.", solution: sol.slug, _meta: { replayed: true } },
        502,
      );
    }
  }

  // Extract inputs (after verify, before settle — bad input returns 4xx without charging)
  let inputs: Record<string, unknown>;
  try {
    inputs = await extractInputs(c, sol.inputSchema);
  } catch {
    return c.json({ error: "Invalid request body. Expected JSON." }, 400);
  }

  // Same input-validation guard as the wildcard capability handler. The
  // solutions handler previously had NO input validation at all — a bad
  // or empty body ran straight into executeSolution() and surfaced
  // whichever step's raw error came back first.
  const solValidation = validateX402Input(inputs, sol.inputSchema);
  if (!solValidation.ok) {
    return schemaBadRequest(c, solValidation.error, sol.inputSchema);
  }

  // Execute solution steps via shared orchestration module
  const result = await executeSolution(sol.id, inputs, {
    // x402 callers have no account — payment IS the auth. Null here is the
    // honest value, and it matches how x402 transaction rows already record
    // the payer (2,592 paid rows in a 30-day window carry a NULL user_id).
    userId: null,
  });

  if (!result) {
    return c.json({ error: "Solution has no steps configured." }, 503);
  }

  // WP4: billability comes from the canonical outcome, not from a predicate
  // local to this rail. Before this, the token `gated` appeared zero times in
  // this file, so a solution whose gate tripped refunded the wallet customer in
  // full and settled the x402 customer in full — same execution, opposite
  // billing, decided by the caller's payment method. `result.gated` was
  // available here the whole time; nothing read it.
  const outcome = aggregateSolutionOutcome(
    Object.entries(result.steps).map(([stepSlug, stepOutput]) =>
      outcomeFromOutput(stepSlug, stepOutput),
    ),
    result.gated,
  );

  if (!outcome.billable) {
    // WP4 remediation. Two things the first version got wrong by returning
    // early:
    //
    // 1. Audit divergence. The wallet rail refunds a gated run AND still
    //    writes a terminal transaction row with its full audit trail, so the
    //    run appears in /v1/audit. Returning here left the x402 run invisible
    //    — a cross-rail inconsistency in exactly the dimension this package
    //    claims to unify.
    // 2. Free re-execution. Without a paymentHash row the cert-audit C9 replay
    //    cache has nothing to match, so the same signed authorization could be
    //    replayed until expiry, re-running the pre-gate steps at Strale's
    //    external-API cost with zero revenue. A gate is the deterministic
    //    repeat case — a registry that is down stays down — so this is the
    //    worst place to leave that open.
    //
    // Recorded unsettled (DEC-14): the row proves the call happened and
    // carries no payment.
    try {
      await recordX402Transaction({
        clientMeta: extractClientMeta(c.req, {
          src: c.req.query("src"),
          ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip"),
        }) ?? null,
        capabilityId: null,
        solutionSlug: sol.slug,
        slug: sol.slug,
        inputs,
        output: { steps: result.steps, errors: result.errors },
        // Same sources the success path uses below: the executor's own measured
        // latency, and the "mixed" transparency tag a bundle carries because
        // its steps may differ.
        latencyMs: result.latency_ms,
        priceCents: 0,
        priceUsd: sol.x402PriceUsd,
        transparencyTag: "mixed",
        settlementId: undefined,
        payerAddress: verified ? extractPayerAddress(verified) : null,
        error: outcome.error_message ?? "no step produced usable output",
        paymentHash,
      });
    } catch (recordErr) {
      logError("x402-solution-unbillable-record-failed", recordErr, { slug: sol.slug });
    }

    return c.json(
      {
        error:
          outcome.failure_class === "gate_tripped"
            ? `Solution could not run: ${outcome.error_message}. No payment was taken.`
            : "Solution failed — no steps produced output. No payment was taken.",
        solution: sol.slug,
        failure_class: outcome.failure_class,
        steps: result.steps,
        errors: result.errors,
      },
      502,
    );
  }

  let settlementId: string | undefined;
  if (verified) {
    // WP5: durable intent BEFORE the facilitator is called. That ordering is
    // the whole point — the orphan capture below is a catch block in this
    // process, so it handles "the INSERT threw" and cannot handle "the process
    // died", when it never runs either. A settlement is irreversible, so the
    // window between it succeeding and the row landing is the one place on the
    // platform where a crash costs a customer money with no record at all.
    const intent = paymentHash
      ? await settlementIntent.openIntent(getDb(), {
          paymentHash,
          slug: sol.slug,
          solutionSlug: sol.slug,
          priceCents: sol.priceCents,
          priceUsd: sol.x402PriceUsd,
        })
      : null;

    const settled = await settleX402Payment(verified);
    if (intent) {
      if (settled.valid && settled.settlementId) {
        await settlementIntent.markSettled(getDb(), {
          intentId: intent.id,
          settlementId: settled.settlementId,
        });
      } else {
        await settlementIntent.markFailed(getDb(), {
          intentId: intent.id,
          reason: settled.error ?? "settlement returned invalid",
        });
      }
    }
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

  // CCO P0 #12: AWAIT the record. Settlement happened on-chain and is
  // irreversible; if the INSERT fails, recordX402Transaction writes an
  // orphan-settlement row for manual reconciliation. If we fire-and-forget
  // here, an INSERT failure has nowhere to land.
  // F-AUDIT-01 / CCO #3: dataJurisdiction is no longer passed here; it's
  // computed inside recordX402Transaction from Strale's actual region +
  // LLM reach derived from transparencyTag.
  const solPayerAddress = verified ? extractPayerAddress(verified) : null;
  await recordX402Transaction({
    clientMeta: extractClientMeta(c.req, {
      src: c.req.query("src"),
      ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip"),
    }) ?? null,
    capabilityId: null,
    solutionSlug: sol.slug,
    slug: sol.slug,
    inputs,
    output: { steps: result.steps, errors: result.errors },
    latencyMs: result.latency_ms,
    priceCents: sol.priceCents,
    priceUsd: sol.x402PriceUsd,
    transparencyTag: "mixed",
    settlementId,
    payerAddress: solPayerAddress,
    paymentHash,
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

x402GatewayV2.on(["GET", "POST"], ["/:slug", "/v2/:slug"], async (c) => {
  const slug = c.req.param("slug");
  // Skip reserved paths handled by explicit routes above
  if (slug === "catalog" || slug === "solutions" || slug === "v2") return c.notFound();

  // See the solutions handler: /x402/v2/* always serves the v2 challenge.
  const isV2Path = c.req.path.startsWith("/x402/v2/");
  const challengeVersion: 1 | 2 = isV2Path ? 2 : x402ChallengeVersion();
  const resourceUrl = `${BASE_URL}${c.req.path}`;

  await ensureCache();

  const cap = _capCache.get(slug);

  // WP8: the cache is a ROUTING HINT, not an eligibility authority.
  //
  // It holds for 60 seconds, and the quality floor delists by clearing
  // x402_enabled — so a capability quarantined mid-window kept selling until
  // the cache turned over. Delisting is precisely the event that must take
  // effect immediately: the floor fires because a capability is failing real
  // customers, and up to a minute of further sales is the opposite of the
  // intent.
  //
  // One indexed read on the money path, before anything is executed or
  // settled. Checked against the same predicate every other rail uses, so a
  // capability cannot be servable here and not there.
  if (cap) {
    const [live] = await getDb()
      .select({
        isActive: capabilities.isActive,
        x402Enabled: capabilities.x402Enabled,
        marketplaceEligible: capabilities.marketplaceEligible,
        lifecycleState: capabilities.lifecycleState,
      })
      .from(capabilities)
      .where(eq(capabilities.slug, slug))
      .limit(1);

    if (!live || !isX402RailEligible(live)) {
      // Drop the stale entry so the next caller does not pay for the same
      // lookup, and answer as the catalogue would once it refreshes.
      _capCache.delete(slug);
      return c.json(
        {
          error: "Capability is no longer available via x402. No payment was taken.",
          hint: `${BASE_URL}/x402/catalog`,
        },
        503,
      );
    }
  }

  if (!cap) {
    // Two very different things wear the same 404. Distinguish them before
    // recording, or the demand table fills with "someone wanted X" for every
    // X we already sell — see X402MissKind.
    const known = await isKnownSlug(slug);
    recordX402Miss({ slug, kind: known ? "x402_not_on_rail" : "x402_unknown_slug",
      detail: known ? "known capability, not enabled for x402" : "no such x402 capability",
      ...{ userAgent: c.req.header("user-agent") ?? null,
        ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
          ?? c.req.header("cf-connecting-ip") ?? null } });
    return c.json(
      { error: "Capability not found or not available via x402.", hint: `${BASE_URL}/x402/catalog` },
      404,
    );
  }

  // Free capabilities ($0.00) skip payment
  const isFree = cap.x402PriceUsd === 0;
  let verified: X402VerifiedPayment | undefined;
  let paymentHash: string | null = null;

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
        resourceUrl,
        cap.inputSchema, cap.x402Method, cap.outputSchema,
        challengeVersion,
      );
      // See the solutions handler note: header only on v2 paths.
      if (challengeVersion === 2) {
        c.header("PAYMENT-REQUIRED", encodePaymentRequiredHeader(body as never));
      }
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
      resourceUrl,
      cap.inputSchema, cap.x402Method, cap.outputSchema,
      challengeVersion,
    );
    const verification = await verifyX402PaymentOnly(
      paymentHeader,
      cap.priceCents,
      cap.x402PriceUsd,
      {
        resource: resourceUrl,
        description: capRebuild.paymentRequirement.description as string,
        outputSchema: capRebuild.paymentRequirement.outputSchema as Record<string, unknown>,
      },
    );
    if (!verification.valid || !verification.verified) {
      // Spec-shaped failure — see the solutions handler.
      const failBody = { ...capRebuild.body } as Record<string, unknown>;
      failBody.error = `Payment verification failed: ${verification.error ?? "unknown reason"}`;
      if (challengeVersion === 2) {
        c.header("PAYMENT-REQUIRED", encodePaymentRequiredHeader(failBody as never));
      }
      return c.json(failBody, 402);
    }
    verified = verification.verified;

    // Cert-audit C9: replay dedup. Same logic as the solutions handler —
    // if this exact payment header already produced a recorded transaction,
    // return the cached output and don't re-execute or re-settle.
    paymentHash = hashPaymentHeader(paymentHeader);
    const cached = await findCachedX402Response(paymentHash);
    if (cached) {
      if (cached.status === "completed") {
        return c.json({
          ...((cached.output as Record<string, unknown>) ?? {}),
          _meta: {
            capability: cap.slug,
            replayed: true,
            note: "Returned from cache — same X-Payment header was already processed.",
            latency_ms: cached.latencyMs,
            payment: cached.settlementId
              ? { method: "x402", settlement_id: cached.settlementId, price_usd: cap.x402PriceUsd }
              : { method: "x402", price_usd: cap.x402PriceUsd },
          },
        });
      }
      return c.json(
        { error: "Prior request with this payment header failed.", capability: cap.slug, _meta: { replayed: true } },
        502,
      );
    }
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

  // validateX402Input handles classic `required: [...]`, anyOf/oneOf
  // required-groups (either/or capabilities like tech-stack-detect and
  // image-to-text), and wholly-empty input against a properties-only
  // schema that declares no `required` at all — see
  // lib/x402-input-validation.ts for the full rationale. Runs after verify
  // (per the Bazaar-indexing constraint above) and before settle (bad
  // input never costs the caller).
  const validation = validateX402Input(inputs, cap.inputSchema);
  if (!validation.ok) {
    // Distinct from the unknown-slug case: we sell this and they could not use
    // it. A product signal, not a catalogue one.
    recordX402Miss({ slug, kind: "x402_bad_input", detail: validation.error,
      ...{ userAgent: c.req.header("user-agent") ?? null,
        ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
          ?? c.req.header("cf-connecting-ip") ?? null } });
    return schemaBadRequest(c, validation.error, cap.inputSchema);
  }

  // Execute capability
  const executor = getExecutor(cap.slug);
  if (!executor) {
    return c.json({ error: "Capability executor unavailable. Try again later." }, 503);
  }

  // Phase A0b dispatcher gate. x402 callers are paying via USDC settlement,
  // so the context is customer_paid (allow regardless of cost_class).
  try {
    await assertGuardedAllow(cap.slug, {
      kind: "customer_paid",
      userId: null,
      transactionId: null,
    });
  } catch (err) {
    if (
      err instanceof CapabilityInvocationRefusedError ||
      err instanceof CapabilityNotClassifiedError ||
      err instanceof BudgetExhaustedError
    ) {
      return c.json({ error: err.message }, 503);
    }
    throw err;
  }

  const startMs = Date.now();
  let result: Awaited<ReturnType<typeof executor>>;
  // WP9: the fact is written from the OUTPUT assessment as soon as the executor
  // returns, before `assertBillableOutput` can throw on it. Letting that throw
  // fall through to the catch would record the invocation as an executor error,
  // which is the wrong verdict — the executor answered, its answer was unusable,
  // and those are different failures for a capability's quality record.
  let factRecorded = false;
  try {
    result = await executor(inputs);
    await recordCustomerInvocation({
      capabilitySlug: cap.slug,
      rail: "x402_gateway",
      // x402 callers have no account and never buy on the free tier.
      userId: null,
      capabilityIsFreeTier: false,
      latencyMs: Date.now() - startMs,
      outcome: outcomeFromOutput(cap.slug, result.output),
    });
    factRecorded = true;
    // WP4 remediation: the capability rail was missed in the first pass while
    // the package's exit condition claimed every rail was covered. Without
    // this, `POST /x402/:slug` settles on any resolution while the same
    // capability reached through `POST /v1/do` with an X-PAYMENT header does
    // not — a NEW cross-rail asymmetry introduced by the fix for the old one.
    //
    // Raised inside the try on purpose: the catch below already records a
    // failed x402 transaction and deliberately does not settle (CRIT-9,
    // DEC-14), which is exactly the handling an unusable output needs.
    assertBillableOutput(cap.slug, result.output);
  } catch (err) {
    // CRIT-9: executor failure was previously logged-only — no transactions
    // row, no audit record, no compliance evidence the call ever happened.
    // Now record a 'failed' x402 transaction with no settlement so failed
    // executions are visible in the same /v1/audit and verify surfaces as
    // wallet-path failures. Per DEC-14 we still do NOT settle on failure;
    // the signed authorization expires unused.
    const message = err instanceof Error ? err.message : String(err);
    const latencyMs = Date.now() - startMs;
    const sanitized = sanitizeFailureReason(message);
    if (!factRecorded) {
      await recordCustomerInvocation({
        capabilitySlug: cap.slug,
        rail: "x402_gateway",
        userId: null,
        capabilityIsFreeTier: false,
        latencyMs,
        outcome: outcomeFromError(err),
      });
    }
    try {
      await recordX402Transaction({
    clientMeta: extractClientMeta(c.req, {
      src: c.req.query("src"),
      ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip"),
    }) ?? null,
        capabilityId: cap.id,
        solutionSlug: null,
        slug: cap.slug,
        inputs,
        output: null,
        latencyMs,
        priceCents: cap.priceCents,
        priceUsd: cap.x402PriceUsd,
        transparencyTag: cap.transparencyTag,
        // No settlement on failure (DEC-14). Orphan-settlement table only
        // catches paid-but-unrecorded; this is unpaid-and-unsettled.
        settlementId: undefined,
        payerAddress: verified ? extractPayerAddress(verified) : null,
        error: sanitized ?? message,
        // Cert-audit C9: record the failure under the same payment hash so a
        // replay is short-circuited with the failure response, not re-run.
        paymentHash,
        capForAudit: {
          transparencyTag: cap.transparencyTag,
          capabilityType: cap.capabilityType,
          dataSource: cap.dataSource,
          dataClassification: cap.dataClassification,
          processesPersonalData: cap.processesPersonalData,
          personalDataCategories: cap.personalDataCategories,
          outputSchema: cap.outputSchema,
        },
      });
    } catch (recordErr) {
      logError("x402-failure-record-failed", recordErr, { slug: cap.slug });
    }
    // Attach input_schema/example even on an executor-thrown error — an
    // agent that got a validation-shaped message from inside the executor
    // (e.g. "Provide 'url' or 'domain'") should still learn the schema
    // instead of guessing from prose. error_code "execution_failed" tells
    // the agent this may be an upstream failure, not necessarily bad input
    // — so it can back off instead of mutating a valid request and paying
    // to retry it.
    return schemaBadRequest(c, sanitized, cap.inputSchema, "execution_failed");
  }

  const latencyMs = Date.now() - startMs;

  // Settle now that we have a real result. If settlement fails (rare — verify
  // already passed) surface a clear error; the client can retry the paid call.
  let settlementId: string | undefined;
  if (verified) {
    // WP5: durable intent BEFORE the facilitator is called. That ordering is
    // the whole point — the orphan capture below is a catch block in this
    // process, so it handles "the INSERT threw" and cannot handle "the process
    // died", when it never runs either. A settlement is irreversible, so the
    // window between it succeeding and the row landing is the one place on the
    // platform where a crash costs a customer money with no record at all.
    const intent = paymentHash
      ? await settlementIntent.openIntent(getDb(), {
          paymentHash,
          slug: cap.slug,
          solutionSlug: null,
          priceCents: cap.priceCents,
          priceUsd: cap.x402PriceUsd,
        })
      : null;

    const settled = await settleX402Payment(verified);
    if (intent) {
      if (settled.valid && settled.settlementId) {
        await settlementIntent.markSettled(getDb(), {
          intentId: intent.id,
          settlementId: settled.settlementId,
        });
      } else {
        await settlementIntent.markFailed(getDb(), {
          intentId: intent.id,
          reason: settled.error ?? "settlement returned invalid",
        });
      }
    }
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

  // CCO P0 #12: AWAIT (see recordX402Transaction for orphan-settlement
  // handling). Settlement is irreversible; an INSERT failure must land
  // in x402_orphan_settlements for reconciliation, not vanish.
  // CRIT-8: pass capForAudit so buildX402AuditTrail produces the rich
  // compliance shape (was a 7-field stub previously).
  const payerAddress = verified ? extractPayerAddress(verified) : null;
  await recordX402Transaction({
    clientMeta: extractClientMeta(c.req, {
      src: c.req.query("src"),
      ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip"),
    }) ?? null,
    capabilityId: cap.id,
    solutionSlug: null,
    slug: cap.slug,
    inputs,
    output: result.output,
    latencyMs,
    priceCents: cap.priceCents,
    priceUsd: cap.x402PriceUsd,
    transparencyTag: cap.transparencyTag,
    settlementId,
    payerAddress,
    paymentHash,
    capForAudit: {
      transparencyTag: cap.transparencyTag,
      capabilityType: cap.capabilityType,
      dataSource: cap.dataSource,
      dataClassification: cap.dataClassification,
      processesPersonalData: cap.processesPersonalData,
      personalDataCategories: cap.personalDataCategories,
      outputSchema: cap.outputSchema,
    },
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

  // NOTE on the `price: string` shape (cert-audit follow-up 2026-04-30):
  // Looks like the lossy-formatted-currency anti-pattern that bit the
  // trust endpoint, but it isn't. The x402 protocol spec defines the
  // resource manifest's `price` as a string deliberately — USDC is a
  // 6-decimal-precision token whose atomic units are NOT integer cents,
  // and the manifest pairs `price` with `currency` so any consumer has
  // an unambiguous parse. Don't "fix" this to *_cents: it would break
  // x402 protocol compliance for every facilitator + scanner that reads
  // /.well-known/x402.json. The canonical numeric value is always
  // available server-side as `priceCents` (EUR) and the live USD figure
  // is `eurCentsToUsd(priceCents)` per DEC-20260502-A.
  // Ordered by what agents actually pay for, not by database order. This file
  // is fetched ~40 times a month by distinct agents; before 2026-08-15 they
  // landed on exchange-rate and token-security-check while our proven sellers
  // (email-validate, google-search) sat somewhere in a list of 334.
  const revenue = await sellerRevenueBySlug();
  const caps = rankBySales(
    [..._capCache.values()], revenue, (c) => c.slug, (c) => c.x402PriceUsd === 0);
  const sols = rankBySales([..._solCache.values()], revenue, (s) => s.slug);

  const endpoints = [
    ...caps.map((cap) => ({
      path: `/x402/v2/${cap.slug}`,
      method: cap.x402Method,
      price: cap.x402PriceUsd.toFixed(2),
      currency: "USDC",
      network: NETWORK,
      description: cap.description,
    })),
    ...sols.map((sol) => ({
      path: `/x402/v2/solutions/${sol.slug}`,
      method: "POST",
      price: sol.x402PriceUsd.toFixed(2),
      currency: "USDC",
      network: NETWORK,
      description: sol.description,
    })),
  ];

  return {
    x402: true,
    // Advertise the facilitator that actually processes verify/settle.
    facilitator: getFacilitatorUrl(),
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
    // v2 alias paths: new discovery consumers (x402scan requires the v2
    // challenge shape) get the v2-serving endpoints; existing payers keep
    // the legacy /x402/:slug paths, which are no longer advertised here.
    ...[..._capCache.values()].filter((cap) => cap.x402PriceUsd > 0).map((cap) => `${BASE_URL}/x402/v2/${cap.slug}`),
    ...[..._solCache.values()].filter((sol) => sol.x402PriceUsd > 0).map((sol) => `${BASE_URL}/x402/v2/solutions/${sol.slug}`),
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
    paths[`/x402/v2/${cap.slug}`] = {
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
    paths[`/x402/v2/solutions/${sol.slug}`] = {
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
