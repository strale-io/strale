/**
 * A2A (Agent-to-Agent) protocol endpoints.
 *
 * - GET  /.well-known/agent-card.json — Dynamic Agent Card (public)
 * - POST /a2a                          — JSON-RPC endpoint for A2A tasks
 *
 * The Agent Card is dynamically generated from the capabilities table.
 * The task endpoint proxies to POST /v1/do using the same thin-proxy
 * pattern as the MCP server.
 */

import { Hono } from "hono";
import { sanitizeFailureReason } from "../lib/sanitize.js";
import { X402_PAYABLE_LIFECYCLE_STATES } from "../lib/x402-eligibility.js";
import { recordDiscoveryHit } from "../lib/attribution.js";
import { eq, and, isNull } from "drizzle-orm";
import { createHash, timingSafeEqual } from "node:crypto";
import { getDb } from "../db/index.js";
import { capabilities, solutions, transactions, users } from "../db/schema.js";
import { hashApiKey, getKeyPrefix } from "../lib/auth.js";
import { suggest, MAX_SUGGEST_QUERY_CHARS } from "../lib/suggest.js";
import { rateLimitByIp } from "../lib/rate-limit.js";
import { computePlatformFacts } from "../lib/platform-facts.js";
import { sellerRevenueBySlug, rankBySales } from "../lib/seller-rank.js";
import type { AppEnv } from "../types.js";

// ─── Config ─────────────────────────────────────────────────────────────────

const BASE_URL =
  process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : process.env.STRALE_BASE_URL ?? "http://localhost:3000";

// ─── Agent Card cache ───────────────────────────────────────────────────────

let cachedCard: object | null = null;
let cachedETag: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour (matches Cache-Control max-age)

// ─── Category to tags mapping ───────────────────────────────────────────────

function categoryToTags(category: string, slug: string): string[] {
  const tags: string[] = [category];

  // Add region tags
  if (slug.includes("swedish") || slug.includes("-se"))
    tags.push("sweden", "nordic");
  if (slug.includes("norwegian")) tags.push("norway", "nordic");
  if (slug.includes("danish")) tags.push("denmark", "nordic");
  if (slug.includes("finnish")) tags.push("finland", "nordic");
  if (slug.includes("uk-") || slug.includes("-uk"))
    tags.push("united-kingdom");
  if (slug.includes("eu-") || slug.includes("eu")) tags.push("eu");

  // Add domain tags
  if (category === "data-extraction") tags.push("data", "extraction");
  if (category === "validation") tags.push("verify", "check");
  if (slug.includes("company")) tags.push("company-data", "business-registry");
  if (slug.includes("vat")) tags.push("tax", "eu");
  if (slug.includes("invoice") || slug.includes("receipt"))
    tags.push("finance", "accounting");
  if (category === "web3") tags.push("defi", "blockchain", "crypto", "ethereum");
  if (slug.includes("wallet")) tags.push("wallet");
  if (slug.includes("token")) tags.push("token", "erc20");
  if (slug.includes("ens")) tags.push("ens", "ethereum");
  if (slug.includes("vasp") || slug.includes("mica")) tags.push("mica", "vasp", "compliance");

  return [...new Set(tags)];
}

// ─── Generate examples from capability description ──────────────────────────

function generateExamples(
  slug: string,
  _name: string,
  description: string,
): string[] {
  // Use the first sentence of the description as the example
  const firstSentence = description.split(/\.\s/)[0].replace(/\.$/, "");

  if (slug.includes("company-data")) {
    const country = slug.replace("-company-data", "").replace(/-/g, " ");
    return [`Look up ${country} company by name or registration number`];
  }

  return [firstSentence];
}

// ─── Build Agent Card ───────────────────────────────────────────────────────

/**
 * Base URL used in per-skill payment pointers. The card is fetched by agents
 * that may never visit any other Strale surface, so every skill must carry an
 * absolute URL it can act on.
 */
const PUBLIC_API_BASE = "https://api.strale.io";

/**
 * Internal artifacts must never reach the public card. A solution named
 * `test-solution-delete-me` was live on it until 2026-08-15 — a storefront
 * showing the shop's own scaffolding. Belt (this filter) and braces (the DB
 * cleanup) rather than either alone.
 */
export function isInternalArtifact(slug: string): boolean {
  // Deliberately narrow. A first draft matched any `test-` prefix, which the
  // unit test caught silently dropping `test-case-generate` — a real, sellable
  // service — from the storefront. Matching the scaffolding *conventions*
  // (delete-me suffixes, zzz- probes, test-solution names) rather than the
  // word "test" keeps real services safe.
  return /-delete-me$|^zzz-|test-solution/.test(slug);
}

/**
 * Whether the x402 gateway would actually serve this slug.
 *
 * The card and the gateway had different ideas about what is buyable. The card
 * listed anything `is_active AND marketplace_eligible`; the gateway requires
 * `x402_enabled` AND a lifecycle state of active/probation, because it refuses
 * to take money for a capability it knows is degraded. Measured against
 * production on 2026-08-16, that gap was **66 endpoints** — 47 capabilities and
 * 19 solutions — each advertised with a price and a POST target that returns
 * 404 "Capability not found or not available via x402."
 *
 * Two harms, and the second is the nastier one. An agent that trusts the card
 * gets a dead endpoint. And that 404 is recorded as `x402_unknown_slug` in
 * `failed_requests` — the unmet-demand signal added the same day — so our own
 * card manufactures "an agent wanted something we do not sell" entries for
 * capabilities we *do* sell. A build queue fed by that is fed by our own bug.
 *
 * Entries that fail this stay on the card: they are real capabilities, still
 * reachable with an API key. They simply stop claiming a payment route that
 * does not exist.
 */
function payableViaX402(row: {
  isFreeTier?: boolean;
  x402Enabled?: boolean | null;
  lifecycleState?: string | null;
}): boolean {
  if (row.isFreeTier) return false; // free tier needs no payment endpoint
  if (!row.x402Enabled) return false;
  // Solutions carry no lifecycle column; absence means "not gated on it".
  // WP8: the states come from the authority rather than a fifth inline copy —
  // this one was invisible to the guard precisely because it was written as a
  // bare array literal, the most likely shape of a copy-paste.
  if (
    row.lifecycleState &&
    !(X402_PAYABLE_LIFECYCLE_STATES as readonly string[]).includes(row.lifecycleState)
  ) {
    return false;
  }
  return true;
}

/**
 * Solutions are NOT served at `/x402/{slug}` — that is the capability
 * wildcard. The gateway mounts them at `/x402/solutions/{slug}` and
 * `/x402/v2/solutions/{slug}` (x402-gateway-v2.ts), and the v2 form is what
 * the discovery file and the OpenAPI paths publish. The card advertised the
 * capability path for every solution: each one fell through to the wildcard,
 * 404'd, and logged a false `x402_unknown_slug` demand row.
 */
function solutionEndpoint(slug: string): string {
  return `${PUBLIC_API_BASE}/x402/v2/solutions/${slug}`;
}

export async function buildAgentCard(): Promise<{ card: object; etag: string }> {
  const now = Date.now();
  if (cachedCard && cachedETag && now - cachedAt < CACHE_TTL_MS) {
    return { card: cachedCard, etag: cachedETag };
  }

  const db = getDb();

  // Fetch capabilities (free-tier flag drives the per-capability description suffix)
  const capRows = await db
    .select({
      slug: capabilities.slug,
      name: capabilities.name,
      description: capabilities.description,
      category: capabilities.category,
      priceCents: capabilities.priceCents,
      isFreeTier: capabilities.isFreeTier,
      // Needed to decide whether a pay-per-call endpoint may be advertised —
      // see payableViaX402 below.
      x402Enabled: capabilities.x402Enabled,
      lifecycleState: capabilities.lifecycleState,
    })
    .from(capabilities)
    .where(
      and(
        eq(capabilities.isActive, true),
        // strale.dev surfacing per DEC-20260503-A.
        eq(capabilities.marketplaceEligible, true),
      ),
    );

  // Fetch active solutions
  const solRows = await db
    .select({
      slug: solutions.slug,
      name: solutions.name,
      description: solutions.description,
      category: solutions.category,
      priceCents: solutions.priceCents,
      x402Enabled: solutions.x402Enabled,
    })
    .from(solutions)
    .where(eq(solutions.isActive, true));

  // Shared ranker: 15-minute cache (this surface is fetched ~520×/week) and
  // fail-open on a query error, neither of which the private copy had.
  const revenue = await sellerRevenueBySlug();

  // Build capability skills. Every paid skill carries its price and an
  // absolute pay-per-call URL — before 2026-08-15, 396 of 406 skills had no
  // price and 404 never mentioned x402, so a payment-capable agent reading
  // this card had no way to act on it without visiting other surfaces first.
  // Price goes in BOTH a structured field (for parsers) and the description
  // (for agents that only read text); A2A consumers ignore unknown fields.
  const capSkills = capRows
    .filter((cap) => !isInternalArtifact(cap.slug))
    .map((cap) => {
      const payable = payableViaX402(cap);
      const priceStr = cap.isFreeTier
        ? " FREE — no API key, no payment, no signup."
        : payable
          ? ` €${((cap.priceCents ?? 0) / 100).toFixed(2)} per call — pay per use` +
            ` with USDC (x402) at POST ${PUBLIC_API_BASE}/x402/${cap.slug}, no signup needed.`
          : ` €${((cap.priceCents ?? 0) / 100).toFixed(2)} per call via API key.` +
            ` Pay-per-call is not available for this one.`;
      return {
        id: cap.slug,
        name: cap.name,
        description: `${cap.description}${priceStr}`,
        tags: categoryToTags(cap.category, cap.slug),
        examples: generateExamples(cap.slug, cap.name, cap.description),
        // Extension fields (ignored by strict A2A parsers, actionable by the rest)
        price_cents: cap.isFreeTier ? 0 : cap.priceCents ?? 0,
        currency: "EUR",
        x402_endpoint: payable ? `${PUBLIC_API_BASE}/x402/${cap.slug}` : undefined,
      };
    });

  // Build solution skills — same treatment.
  const solSkills = solRows
    .filter((sol) => !isInternalArtifact(sol.slug))
    .map((sol) => ({
      id: `solution-${sol.slug}`,
      name: sol.name,
      description: `${sol.description} €${((sol.priceCents ?? 0) / 100).toFixed(2)} per call` +
        (payableViaX402(sol)
          ? ` — pay per use with USDC (x402) at POST ${solutionEndpoint(sol.slug)},` +
            ` no signup needed.`
          : ` via API key. Pay-per-call is not available for this one.`),
      tags: ["solution", sol.category],
      examples: [sol.description.split(/\.\s/)[0].replace(/\.$/, "")],
      price_cents: sol.priceCents ?? 0,
      currency: "EUR",
      x402_endpoint: payableViaX402(sol) ? solutionEndpoint(sol.slug) : undefined,
    }));

  // Order: proven sellers first (28-day external revenue), then the free tier
  // (an agent's cheapest first step), then the rest alphabetically. A shallow
  // reader now lands on what other agents actually buy.
  const slugOfSkill = (skill: { id: string }) => skill.id.replace(/^solution-/, "");
  const bySales = <T extends { id: string; price_cents?: number }>(skills: T[]): T[] =>
    rankBySales(skills, revenue, slugOfSkill, (s) => s.price_cents === 0);

  const productSkills = [
    {
      id: "product-web3-assurance",
      name: "Web3 Assurance",
      description:
        "Decision-ready answer about an on-chain counterparty (wallet, contract, token, DeFi protocol, or bridge) in a single call. Returns verdict (proceed/review/block/insufficient_evidence), reason_codes (UPPERCASE_SNAKE_CASE), critical_flags, suggested_action, evidence map (sanctions, mixer-graded, scam-cluster, wallet-history, token-safety, contract-verification, protocol-risk, audit firms, EAS, ERC-8004, more), and a sidecar audit_url. Two modes: outbound (agent vetting recipient pre-payment, 8s budget) or reverse-call (x402 service publisher gating an inbound buyer, sub-second SLA).",
      tags: [
        "web3",
        "defi",
        "blockchain",
        "crypto",
        "x402",
        "agent-economy",
        "counterparty",
        "decision-ready",
        "verdict",
        "reason-codes",
        "audit-trail",
        "sanctions",
        "mixer-graded",
        "tornado-cash",
        "ofac",
        "mica",
        "compliance",
      ],
      examples: [
        "Vet a wallet before sending USDC",
        "Check a token contract for honeypot or rug pattern before swapping",
        "Pre-trade simulation of a DeFi interaction",
        "Gate an inbound x402 buyer before delivering service",
        "Verify a DeFi protocol's audit history and recent exploits",
      ],
      // Every other entry on this card carries a price and a callable target.
      // This one carried neither, so an agent parsing the card learned the
      // product exists and had no way to act on it — a brochure on a machine
      // surface. There is genuinely no price to quote: the route is
      // auth-gated and takes no payment (app.ts mounts it at
      // /v1/web3-assurance behind authMiddleware, with no wallet debit), so
      // the card says that rather than implying a pay-per-call rail it does
      // not have.
      endpoint: `${PUBLIC_API_BASE}/v1/web3-assurance`,
      mcp_tool: "strale_web3_assurance",
      price_cents: 0,
      currency: "EUR",
      access: "api_key",
    },
  ];

  const skills = [...productSkills, ...bySales(capSkills), ...bySales(solSkills)];

  // Cert-audit Y-2: capability count and country count are computed from
  // PLATFORM_FACTS rather than hardcoded. Hardcoding "250+" / "27 countries"
  // drifted from the live catalogue (production showed 6 active countries).
  const facts = await computePlatformFacts();
  const capCount = facts.capability_counts.active_visible;
  const countryCount = facts.countries.company_data_active.length;

  const card = {
    name: "Strale",
    description:
      `Commercial capability marketplace for AI agents. ${capCount}+ capabilities with transparent per-call pricing. Available via API key (EUR wallet) or x402 pay-per-use (USDC on Base). Compliance, KYC/KYB, payment validation, company data across ${countryCount} countries, regulatory intelligence, and developer tools. Every call returns an audit record with cryptographic chain hashing.`,
    url: `${BASE_URL}/a2a`,
    version: "1.0.0",
    documentationUrl: "https://strale.dev/docs",
    provider: {
      organization: "Strale",
      url: "https://strale.io",
    },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    authentication: {
      schemes: ["apiKey", "x402"],
    },
    // Extension block (non-standard, ignored by strict A2A parsers): how to
    // pay without an account. The one thing an autonomous agent needs and the
    // one thing this card never said. Skills below also carry per-skill
    // price_cents and x402_endpoint.
    payments: {
      x402: {
        network: "base",
        currency: "USDC",
        catalog: `${PUBLIC_API_BASE}/x402/catalog`,
        discovery: `${PUBLIC_API_BASE}/.well-known/x402.json`,
        how: "POST the skill's x402_endpoint, settle the 402 challenge in USDC on Base, replay. Payment is the authentication — no signup.",
      },
      api_key: { signup: "https://strale.dev/signup", trial_credits_eur: 2 },
    },
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json"],
    skills,
  };

  const etag = createHash("sha256")
    .update(JSON.stringify(card))
    .digest("hex")
    .substring(0, 16);

  cachedCard = card;
  cachedETag = etag;
  cachedAt = now;

  return { card, etag };
}

// ─── Agent Card route ───────────────────────────────────────────────────────

export const agentCardRoute = new Hono();

agentCardRoute.get("/", async (c) => {
  recordDiscoveryHit("/.well-known/agent-card.json", c.req, { src: c.req.query("src"), ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip") });
  const { card, etag } = await buildAgentCard();

  // Conditional request support (304 Not Modified)
  const ifNoneMatch = c.req.header("If-None-Match");
  if (ifNoneMatch && ifNoneMatch === `"${etag}"`) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: `"${etag}"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  return c.json(card, 200, {
    "Cache-Control": "public, max-age=3600",
    ETag: `"${etag}"`,
    "Access-Control-Allow-Origin": "*",
  });
});

// ─── A2A JSON-RPC endpoint ──────────────────────────────────────────────────

export const a2aRoute = new Hono<AppEnv>();

// IP rate limiting — 60 requests/minute per IP, matching the MCP endpoint.
// Both are unauthenticated protocol surfaces reaching the same catalog engine,
// and this one had no limiter at all: a single caller could drive unbounded
// catalog scans, and billed embedding + re-rank calls whenever embeddings are
// active. The 256 KB body limit in app.ts bounds one request, not the rate.
a2aRoute.use("*", rateLimitByIp(60, 60_000));

a2aRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !body.jsonrpc || body.jsonrpc !== "2.0") {
    return c.json(
      {
        jsonrpc: "2.0",
        error: { code: -32600, message: "Invalid JSON-RPC request" },
        id: body?.id ?? null,
      },
      400,
    );
  }

  const method = body.method;
  const params = body.params ?? {};
  const id = body.id;

  switch (method) {
    case "message/send":
      return handleMessageSend(c, params, id);
    case "tasks/get":
      return handleTasksGet(c, params, id);
    case "tasks/cancel":
      return c.json({
        jsonrpc: "2.0",
        error: {
          code: -32601,
          message:
            "tasks/cancel is not supported. Strale capabilities are atomic operations.",
        },
        id,
      });
    default:
      return c.json(
        {
          jsonrpc: "2.0",
          error: {
            code: -32601,
            message: `Method '${method}' not found. Supported: message/send, tasks/get`,
          },
          id,
        },
        404,
      );
  }
});

// ─── message/send handler ───────────────────────────────────────────────────

async function handleMessageSend(
  c: any,
  params: any,
  id: string | number | null,
) {
  const message = params.message;
  let skillId: string | undefined = params.skillId;
  // Captured before suggest() can overwrite it: an idempotency guarantee is
  // only meaningful when the caller determined what runs.
  const explicitSkillId: string | undefined = params.skillId;

  if (!message || !message.parts || !Array.isArray(message.parts)) {
    return c.json({
      jsonrpc: "2.0",
      error: {
        code: -32602,
        message: "Invalid params: message with parts array is required",
      },
      id,
    });
  }

  // Extract text and structured data from message parts
  // Support both A2A v0.3 `kind` field and older `type` field
  let task: string | undefined;
  let inputs: Record<string, unknown> | undefined;

  for (const part of message.parts) {
    const partKind = part.kind ?? part.type;
    if (partKind === "text" && part.text) {
      task = part.text;
    } else if (partKind === "data" && part.data) {
      inputs = part.data as Record<string, unknown>;
    }
  }

  // Refuse an oversized natural-language task explicitly. The suggest engine
  // enforces the same ceiling itself, but its throw would be swallowed by the
  // catch below and surface as "could not determine a skill", which tells the
  // caller nothing about what to change.
  if (!skillId && task && task.length > MAX_SUGGEST_QUERY_CHARS) {
    return c.json({
      jsonrpc: "2.0",
      error: {
        code: -32602,
        message:
          `Invalid params: text part must be under ${MAX_SUGGEST_QUERY_CHARS} characters ` +
          `when no skillId is given (received ${task.length}). Send a shorter description, ` +
          `or name the skill directly with skillId.`,
      },
      id,
    });
  }

  // If no skillId provided, use the suggest engine to match natural language
  if (!skillId && task) {
    try {
      const suggestion = await suggest({ query: task, limit: 1 });
      if (suggestion.recommendation) {
        skillId = suggestion.recommendation.slug;
      }
    } catch {
      // Suggest engine failure is non-fatal — fall through to error
    }
  }

  if (!skillId) {
    return c.json({
      jsonrpc: "2.0",
      result: {
        id: `task-${Date.now()}`,
        status: {
          state: "failed",
          message: {
            role: "agent",
            parts: [{
              kind: "text",
              text: "Could not match your request to a Strale capability. Provide a skillId parameter, or try a more specific task description. Free capabilities: email-validate, dns-lookup, json-repair, url-to-markdown, iban-validate.",
            }],
            kind: "message",
          },
        },
      },
      id,
    });
  }

  // Auth: pass through if present, or omit for free-tier
  const authHeader = c.req.header("Authorization");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authHeader?.startsWith("Bearer ")) {
    headers.Authorization = authHeader;
  }
  // WP6: forward the caller's idempotency key. This rail proxies to /v1/do,
  // which supports idempotency — but only Content-Type and Authorization were
  // passed through, so an A2A client had no way to make a retry safe no matter
  // what it sent. A proxy that drops the header silently converts an idempotent
  // request into a repeatable charge.
  //
  // ONLY when the caller named the skill. Review finding: when skillId is
  // absent this handler resolves one from free text via suggest() — embeddings
  // plus an LLM re-rank — and the fingerprint is computed downstream from the
  // RESOLVED slug. A byte-identical retry that re-ranks differently would then
  // be told it "reused a key for a different request", which is both false and
  // unactionable, since the client never chose the slug. Forwarding only the
  // deterministic case keeps the guarantee honest instead of approximate.
  const idempotencyHeader = c.req.header("Idempotency-Key");
  if (idempotencyHeader && explicitSkillId) {
    headers["Idempotency-Key"] = idempotencyHeader.slice(0, 255);
  }

  // Build the /v1/do request body
  const doBody: Record<string, unknown> = {
    capability_slug: skillId,
    max_price_cents: 200,
  };
  if (inputs) {
    doBody.inputs = inputs;
  }
  if (task) {
    doBody.task = task;
    if (!inputs) {
      doBody.inputs = { task };
    }
  }

  try {
    // Cert-audit C6: bound the inner /v1/do call. A2A is meant for slow
    // capabilities, so 90s gives async-friendly room without leaving
    // a request stuck if the inner handler hangs.
    const resp = await fetch(`${BASE_URL}/v1/do`, {
      method: "POST",
      headers,
      body: JSON.stringify(doBody),
      signal: AbortSignal.timeout(90_000),
    });

    const data = await resp.json().catch(() => ({})) as Record<string, unknown>;
    // Support nested (result/meta) response shape
    const r = (data.result ?? data) as Record<string, unknown>;
    const m = (data.meta ?? data) as Record<string, unknown>;

    if (resp.status === 202) {
      return c.json({
        jsonrpc: "2.0",
        result: {
          id: r.transaction_id as string,
          contextId: r.transaction_id as string,
          status: { state: "working", timestamp: new Date().toISOString() },
          metadata: { capability_used: r.capability_used, price_cents: r.price_cents },
        },
        id,
      });
    }

    if (resp.status >= 400) {
      const errorCode = data.error_code ?? "unknown_error";
      const errorMsg = data.message ?? "Execution failed";

      // Map Strale errors to A2A task states
      let state = "failed";
      if (errorCode === "unauthorized") state = "failed";
      if (errorCode === "no_matching_capability") state = "rejected";

      // Helpful message for unauthenticated users hitting paid capabilities
      let helpText = String(errorMsg);
      if (errorCode === "unauthorized" && !authHeader) {
        helpText += " Free capabilities (no auth): email-validate, dns-lookup, json-repair, url-to-markdown, iban-validate. For paid capabilities, get an API key with €2 free credits at https://strale.dev";
      }

      return c.json({
        jsonrpc: "2.0",
        result: {
          id: `task-${Date.now()}`,
          status: {
            state,
            message: {
              role: "agent",
              parts: [{ kind: "text", text: helpText }],
              kind: "message",
            },
          },
        },
        id,
      });
    }

    const transactionId = r.transaction_id as string;

    return c.json({
      jsonrpc: "2.0",
      result: {
        id: transactionId,
        contextId: transactionId,
        status: {
          state: "completed",
          message: {
            role: "agent",
            parts: [{
              kind: "data",
              data: r.output,
              metadata: {
                mimeType: "application/json",
                capability_used: r.capability_used,
                latency_ms: r.latency_ms,
                audit_trail_id: transactionId,
              },
            }],
            kind: "message",
          },
          timestamp: new Date().toISOString(),
        },
        artifacts: [{
          name: skillId,
          parts: [{
            kind: "data",
            data: r.output,
            metadata: {
              mimeType: "application/json",
            },
          }],
        }],
        metadata: {
          capability_used: r.capability_used,
          price_cents: r.price_cents,
          latency_ms: r.latency_ms,
          wallet_balance_cents: r.wallet_balance_cents,
          provenance: r.provenance,
        },
      },
      id,
    });
  } catch (err) {
    c.get("log").error(
      { label: "a2a-message-send-error", err: err instanceof Error ? { message: err.message, stack: err.stack } : err },
      "a2a-message-send-error",
    );
    return c.json({
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal error processing request." },
      id,
    });
  }
}

// ─── Resolve API key to user ─────────────────────────────────────────────────

async function resolveApiKeyToUser(apiKey: string) {
  const db = getDb();
  const prefix = getKeyPrefix(apiKey);
  const hash = hashApiKey(apiKey);
  const hashBuffer = Buffer.from(hash, "utf-8");

  const candidates = await db
    .select()
    .from(users)
    .where(eq(users.keyPrefix, prefix));

  return candidates.find((u) => {
    const stored = Buffer.from(u.apiKeyHash, "utf-8");
    return (
      stored.length === hashBuffer.length &&
      timingSafeEqual(stored, hashBuffer)
    );
  }) ?? null;
}

// ─── tasks/get handler ──────────────────────────────────────────────────────

async function handleTasksGet(
  c: any,
  params: any,
  id: string | number | null,
) {
  const taskId = params.id;
  if (!taskId) {
    return c.json({
      jsonrpc: "2.0",
      error: { code: -32602, message: "Invalid params: id is required" },
      id,
    });
  }

  // Auth required
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message:
          "Authentication required. Pass Authorization: Bearer sk_live_... header.",
      },
      id,
    });
  }

  // Resolve API key to user for ownership check
  const apiKey = authHeader.slice(7);
  const user = await resolveApiKeyToUser(apiKey);
  if (!user) {
    return c.json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Invalid API key." },
      id,
    });
  }

  // Look up transaction in DB — scoped to authenticated user
  try {
    const db = getDb();
    const [txn] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, taskId), eq(transactions.userId, user.id), isNull(transactions.deletedAt)))
      .limit(1);

    if (!txn) {
      return c.json({
        jsonrpc: "2.0",
        error: { code: -32602, message: `Task '${taskId}' not found` },
        id,
      });
    }

    // Map Strale transaction status to A2A task state
    const stateMap: Record<string, string> = {
      pending: "pending",
      executing: "running",
      completed: "completed",
      failed: "failed",
    };

    const state = stateMap[txn.status] ?? "failed";

    const result: any = {
      kind: "task",
      id: txn.id,
      contextId: txn.id,
      status: {
        state,
        timestamp: (txn.completedAt ?? txn.createdAt).toISOString(),
      },
      metadata: {
        price_cents: txn.priceCents,
        latency_ms: txn.latencyMs,
      },
    };

    if (state === "completed" && txn.output) {
      result.status.message = {
        role: "agent",
        parts: [
          {
            type: "data",
            mimeType: "application/json",
            data: txn.output,
          },
        ],
      };
      result.artifacts = [
        {
          name: "result",
          parts: [
            {
              type: "data",
              mimeType: "application/json",
              data: txn.output,
            },
          ],
        },
      ];
    }

    if (state === "failed" && txn.error) {
      result.status.message = {
        role: "agent",
        // SANITISED, like every other customer-facing error surface.
        //
        // This served the RAW `transactions.error`, and this file did not
        // import the sanitiser at all. `GET /v1/transactions/:id` has always
        // sanitised the same column; PR #383 closed the same boundary inside
        // the sanitiser's canned branches and #384 closed it for the audit
        // copy. The A2A rail was simply never wired to it.
        //
        // Measured read-only against production: of the failed transactions
        // reachable here (scoped to the authenticated user's own rows),
        // 69 distinct messages across 41,027 rows differ from their sanitised
        // form -- 14.3% -- window 2026-05-25 to 2026-08-24. The rail shows no
        // usage yet, so this is a live path that has not been exercised rather
        // than an active leak.
        parts: [{ type: "text", text: sanitizeFailureReason(txn.error) }],
      };
    }

    return c.json({ jsonrpc: "2.0", result, id });
  } catch (err) {
    c.get("log").error(
      { label: "a2a-tasks-get-error", err: err instanceof Error ? { message: err.message, stack: err.stack } : err },
      "a2a-tasks-get-error",
    );
    return c.json({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: "Internal error processing request.",
      },
      id,
    });
  }
}
