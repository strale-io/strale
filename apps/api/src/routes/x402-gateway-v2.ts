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
import { capabilities, solutions, solutionSteps, transactions } from "../db/schema.js";
import { getExecutor } from "../capabilities/index.js";
import {
  isX402Configured,
  verifyX402Payment,
  extractPaymentHeader,
  eurCentsToUsdcAtomic,
  eurCentsToUsdString,
} from "../lib/x402-gateway.js";
import { sanitizeFailureReason } from "../lib/sanitize.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface X402Capability {
  id: string; // UUID — needed for transaction FK
  slug: string;
  name: string;
  description: string;
  x402PriceUsd: number;
  x402Method: string;
  inputSchema: Record<string, unknown> | null;
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
      });
    }

    _capCache = newCapCache;
    _solCache = newSolCache;
    _cacheExpiry = Date.now() + CACHE_TTL_MS;
  } catch (err) {
    console.error("[x402] Cache refresh failed:", err instanceof Error ? err.message : err);
  }
}

// ─── Configuration ──────────────────────────────────────────────────────────

const NETWORK = process.env.X402_NETWORK ?? "eip155:84532";
const WALLET_ADDRESS = process.env.X402_WALLET_ADDRESS ?? "";
const BASE_URL = process.env.API_BASE_URL ?? "https://api.strale.io";

const USDC_CONTRACTS: Record<string, string> = {
  "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};
const USDC_ADDRESS = USDC_CONTRACTS[NETWORK] ?? USDC_CONTRACTS["eip155:84532"];

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

// ─── 402 Response builder ───────────────────────────────────────────────────

function build402(
  name: string,
  description: string,
  priceUsd: number,
  resourceUrl: string,
  matrixSqs?: string | null,
) {
  const maxAmount = usdToUsdcAtomic(priceUsd);
  const sqs = matrixSqs ? parseFloat(String(matrixSqs)) : null;
  const sqsStr = sqs != null && sqs > 0 ? ` SQS: ${Math.round(sqs)}/100.` : "";

  const paymentRequirement = {
    scheme: "exact",
    network: NETWORK,
    maxAmountRequired: maxAmount,
    resource: resourceUrl,
    description: `${description}${sqsStr}`,
    mimeType: "application/json",
    payTo: WALLET_ADDRESS || "0x0000000000000000000000000000000000000001",
    maxTimeoutSeconds: 300,
    asset: USDC_ADDRESS,
    extra: { name: "USDC", version: "2" },
  };

  const body = {
    x402Version: 1,
    paymentRequirements: [paymentRequirement],
    error: `Payment required. ${name} costs $${priceUsd.toFixed(4)} USDC per call.`,
    accepts: [{ network: NETWORK, asset: "USDC", amount: `$${priceUsd.toFixed(2)}` }],
  };

  // v1 backward-compat header
  const headerPayload = Buffer.from(
    JSON.stringify({ x402Version: 1, accepts: [paymentRequirement] }),
  ).toString("base64");

  return { body, headerPayload };
}

// ─── Transaction recording ──────────────────────────────────────────────────

async function recordX402Transaction(
  capabilityId: string,
  slug: string,
  inputs: Record<string, unknown>,
  output: Record<string, unknown> | null,
  latencyMs: number,
  priceCents: number,
  priceUsd: number,
  transparencyTag: string | null,
  dataJurisdiction: string | null,
  settlementId?: string,
  error?: string,
): Promise<string | null> {
  try {
    const db = getDb();
    const [row] = await db.insert(transactions).values({
      userId: null,
      capabilityId,
      status: error ? "failed" : "completed",
      input: inputs,
      output: output ?? undefined,
      error: error ?? null,
      priceCents,
      latencyMs,
      provenance: output ? undefined : undefined,
      auditTrail: {
        payment_method: "x402",
        settlement_id: settlementId ?? null,
        price_usd: priceUsd,
        capability: slug,
        latency_ms: latencyMs,
        timestamp: new Date().toISOString(),
      },
      transparencyMarker: transparencyTag ?? "algorithmic",
      dataJurisdiction: dataJurisdiction ?? "EU",
      isFreeTier: false,
      paymentMethod: "x402",
      x402SettlementId: settlementId ?? null,
      priceUsd: priceUsd.toFixed(4),
      completedAt: new Date(),
    }).returning({ id: transactions.id });
    return row?.id ?? null;
  } catch (err) {
    console.error("[x402] Transaction recording failed:", err instanceof Error ? err.message : err);
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

  // Extract inputs
  let inputs: Record<string, unknown>;
  try {
    inputs = await extractInputs(c, sol.inputSchema);
  } catch {
    return c.json({ error: "Invalid request body. Expected JSON." }, 400);
  }

  // Free solutions skip payment
  if (sol.x402PriceUsd > 0) {
    const paymentHeader = extractPaymentHeader(c.req.raw.headers);

    if (!paymentHeader) {
      if (!isX402Configured()) {
        return c.json({ error: "x402 payments not configured on this server." }, 503);
      }
      const { body, headerPayload } = build402(
        sol.name, sol.description, sol.x402PriceUsd,
        `${BASE_URL}/x402/solutions/${slug}`,
      );
      c.header("Payment-Required", headerPayload);
      return c.json(body, 402);
    }

    if (!isX402Configured()) {
      return c.json({ error: "x402 payments not configured." }, 503);
    }

    const verification = await verifyX402Payment(paymentHeader, sol.priceCents);
    if (!verification.valid) {
      return c.json({ error: "Payment verification failed", detail: verification.error }, 402);
    }
  }

  // Execute solution steps sequentially (respecting parallel groups)
  const db = getDb();
  const steps = await db
    .select({
      capabilitySlug: solutionSteps.capabilitySlug,
      stepOrder: solutionSteps.stepOrder,
      inputMap: solutionSteps.inputMap,
      canParallel: solutionSteps.canParallel,
      parallelGroup: solutionSteps.parallelGroup,
    })
    .from(solutionSteps)
    .where(eq(solutionSteps.solutionId, sol.id))
    .orderBy(solutionSteps.stepOrder);

  if (steps.length === 0) {
    return c.json({ error: "Solution has no steps configured." }, 503);
  }

  const startMs = Date.now();
  const stepResults: Record<string, unknown> = {};
  const stepErrors: string[] = [];

  // Group steps by parallelGroup for concurrent execution
  const groups = new Map<number, typeof steps>();
  for (const step of steps) {
    const group = step.parallelGroup ?? step.stepOrder;
    const list = groups.get(group) ?? [];
    list.push(step);
    groups.set(group, list);
  }

  for (const [, groupSteps] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const executions = groupSteps.map(async (step) => {
      const executor = getExecutor(step.capabilitySlug);
      if (!executor) {
        stepErrors.push(`${step.capabilitySlug}: executor unavailable`);
        return;
      }

      // Map solution inputs to step inputs
      const stepInput: Record<string, unknown> = {};
      const inputMap = step.inputMap as Record<string, string>;
      for (const [stepField, sourceExpr] of Object.entries(inputMap)) {
        // sourceExpr is either a direct field name from solution input
        // or a "steps.<slug>.<field>" reference to a previous step's output
        if (sourceExpr.startsWith("steps.")) {
          const parts = sourceExpr.split(".");
          const refSlug = parts[1];
          const refField = parts.slice(2).join(".");
          const refResult = stepResults[refSlug] as Record<string, unknown> | undefined;
          stepInput[stepField] = refResult?.[refField] ?? null;
        } else {
          stepInput[stepField] = (inputs as any)[sourceExpr] ?? null;
        }
      }

      try {
        const result = await executor(stepInput);
        stepResults[step.capabilitySlug] = result.output;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stepErrors.push(`${step.capabilitySlug}: ${msg.slice(0, 200)}`);
        stepResults[step.capabilitySlug] = { error: sanitizeFailureReason(msg) };
      }
    });

    await Promise.all(executions);
  }

  const latencyMs = Date.now() - startMs;

  return c.json({
    solution: sol.slug,
    steps: stepResults,
    errors: stepErrors.length > 0 ? stepErrors : undefined,
    _meta: {
      solution: sol.slug,
      step_count: steps.length,
      latency_ms: latencyMs,
      payment: { method: "x402", price_usd: sol.x402PriceUsd },
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

  // Method check for complex schemas
  if (c.req.method === "GET" && !isSimpleSchema(cap.inputSchema)) {
    return c.json(
      { error: "This capability requires POST with JSON body.", input_schema: cap.inputSchema },
      405,
    );
  }

  // Extract and validate inputs BEFORE payment
  let inputs: Record<string, unknown>;
  try {
    inputs = await extractInputs(c, cap.inputSchema);
  } catch {
    return c.json({ error: "Invalid request body. Expected JSON." }, 400);
  }

  // Basic input validation — check required fields from schema
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

  // Free capabilities ($0.00) skip payment
  const isFree = cap.x402PriceUsd === 0;
  let settlementId: string | undefined;

  if (!isFree) {
    const paymentHeader = extractPaymentHeader(c.req.raw.headers);

    if (!paymentHeader) {
      if (!isX402Configured()) {
        return c.json({ error: "x402 payments not configured on this server." }, 503);
      }
      const { body, headerPayload } = build402(
        cap.name, cap.description, cap.x402PriceUsd,
        `${BASE_URL}/x402/${slug}`, cap.matrixSqs,
      );
      c.header("Payment-Required", headerPayload);
      return c.json(body, 402);
    }

    if (!isX402Configured()) {
      return c.json({ error: "x402 payments not configured." }, 503);
    }

    // Verify payment using the shared library (same as /v1/do)
    const verification = await verifyX402Payment(paymentHeader, cap.priceCents);
    if (!verification.valid) {
      return c.json(
        { error: "Payment verification failed", detail: verification.error },
        402,
      );
    }
    settlementId = verification.settlementId;
  }

  // Execute capability
  const executor = getExecutor(cap.slug);
  if (!executor) {
    return c.json({ error: "Capability executor unavailable. Try again later." }, 503);
  }

  const startMs = Date.now();
  try {
    const result = await executor(inputs);
    const latencyMs = Date.now() - startMs;

    // Record transaction (fire-and-forget)
    const txnId = recordX402Transaction(
      cap.id, cap.slug, inputs, result.output, latencyMs,
      cap.priceCents, cap.x402PriceUsd,
      cap.transparencyTag, cap.dataJurisdiction,
      settlementId,
    );

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
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    const message = err instanceof Error ? err.message : String(err);

    // Record failed transaction for audit trail
    recordX402Transaction(
      cap.id, cap.slug, inputs, null, latencyMs,
      cap.priceCents, cap.x402PriceUsd,
      cap.transparencyTag, cap.dataJurisdiction,
      settlementId, message,
    );

    return c.json({ error: sanitizeFailureReason(message) }, 400);
  }
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
