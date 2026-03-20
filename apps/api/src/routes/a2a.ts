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
import { eq, and } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb } from "../db/index.js";
import { capabilities, solutions, transactions, users } from "../db/schema.js";
import { authMiddleware } from "../lib/middleware.js";
import { hashApiKey, getKeyPrefix } from "../lib/auth.js";
import { timingSafeEqual } from "node:crypto";
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

async function buildAgentCard(): Promise<{ card: object; etag: string }> {
  const now = Date.now();
  if (cachedCard && cachedETag && now - cachedAt < CACHE_TTL_MS) {
    return { card: cachedCard, etag: cachedETag };
  }

  const db = getDb();

  // Fetch capabilities with SQS scores and free-tier flag
  const capRows = await db
    .select({
      slug: capabilities.slug,
      name: capabilities.name,
      description: capabilities.description,
      category: capabilities.category,
      priceCents: capabilities.priceCents,
      matrixSqs: capabilities.matrixSqs,
      isFreeTier: capabilities.isFreeTier,
    })
    .from(capabilities)
    .where(eq(capabilities.isActive, true));

  // Fetch active solutions
  const solRows = await db
    .select({
      slug: solutions.slug,
      name: solutions.name,
      description: solutions.description,
      category: solutions.category,
      priceCents: solutions.priceCents,
    })
    .from(solutions)
    .where(eq(solutions.isActive, true));

  // Build capability skills
  const capSkills = capRows.map((cap) => {
    const sqs = cap.matrixSqs ? parseFloat(String(cap.matrixSqs)) : 0;
    const sqsStr = sqs > 0 ? ` SQS: ${Math.round(sqs)}/100.` : "";
    const freeStr = cap.isFreeTier ? " FREE — no API key required." : "";
    return {
      id: cap.slug,
      name: cap.name,
      description: `${cap.description}${sqsStr}${freeStr}`,
      tags: categoryToTags(cap.category, cap.slug),
      examples: generateExamples(cap.slug, cap.name, cap.description),
    };
  });

  // Build solution skills
  const solSkills = solRows.map((sol) => ({
    id: `solution-${sol.slug}`,
    name: sol.name,
    description: sol.description,
    tags: ["solution", sol.category],
    examples: [sol.description.split(/\.\s/)[0].replace(/\.$/, "")],
  }));

  const skills = [...capSkills, ...solSkills];

  const card = {
    name: "Strale",
    description:
      "The trust layer for AI agents. Quality-scored capabilities for company verification, compliance screening, data validation, financial data, and web extraction — covering 27 countries. Every capability independently tested. One API call: strale.do(task). Audit trails on every transaction.",
    url: `${BASE_URL}`,
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
      schemes: ["apiKey"],
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
  const skillId = params.skillId;

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

  // Extract capability slug from skillId
  const capabilitySlug = skillId;
  if (!capabilitySlug) {
    return c.json({
      jsonrpc: "2.0",
      error: {
        code: -32602,
        message:
          "Invalid params: skillId is required to specify which capability to execute",
      },
      id,
    });
  }

  // Extract inputs from message parts
  let task: string | undefined;
  let inputs: Record<string, unknown> | undefined;

  for (const part of message.parts) {
    if (part.type === "text" && part.text) {
      task = part.text;
    } else if (part.type === "data" && part.data) {
      inputs = part.data as Record<string, unknown>;
    }
  }

  // Require auth for capability execution
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message:
          "Authentication required. Pass Authorization: Bearer sk_live_... header.",
        data: { state: "auth-required" },
      },
      id,
    });
  }

  const apiKey = authHeader.slice(7);

  // Call Strale API (thin proxy, reuses all middleware)
  const doBody: Record<string, unknown> = {
    capability_slug: capabilitySlug,
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
    const resp = await fetch(`${BASE_URL}/v1/do`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(doBody),
    });

    const data = await resp.json().catch(() => ({})) as Record<string, unknown>;

    if (resp.status === 202) {
      // Async execution
      const transactionId = data.transaction_id as string;
      return c.json({
        jsonrpc: "2.0",
        result: {
          kind: "task",
          id: transactionId,
          contextId: transactionId,
          status: {
            state: "running",
            timestamp: new Date().toISOString(),
          },
          metadata: {
            capability_used: data.capability_used,
            price_cents: data.price_cents,
          },
        },
        id,
      });
    }

    if (resp.status >= 400) {
      const errorCode = data.error_code ?? "unknown_error";
      const errorMsg = data.message ?? "Execution failed";

      // Map Strale errors to A2A task states
      let state = "failed";
      if (errorCode === "unauthorized") state = "auth-required";
      if (errorCode === "insufficient_balance") state = "failed";
      if (errorCode === "no_matching_capability") state = "rejected";

      return c.json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: String(errorMsg),
          data: { state, error_code: errorCode, details: data.details },
        },
        id,
      });
    }

    // Success
    const transactionId = data.transaction_id as string;
    return c.json({
      jsonrpc: "2.0",
      result: {
        kind: "task",
        id: transactionId,
        contextId: transactionId,
        status: {
          state: "completed",
          message: {
            role: "agent",
            parts: [
              {
                type: "data",
                mimeType: "application/json",
                data: data.output,
              },
            ],
          },
          timestamp: new Date().toISOString(),
        },
        artifacts: [
          {
            name: capabilitySlug,
            parts: [
              {
                type: "data",
                mimeType: "application/json",
                data: data.output,
              },
            ],
          },
        ],
        metadata: {
          capability_used: data.capability_used,
          price_cents: data.price_cents,
          latency_ms: data.latency_ms,
          wallet_balance_cents: data.wallet_balance_cents,
          provenance: data.provenance,
        },
      },
      id,
    });
  } catch (err) {
    console.error("[a2a] message/send error:", err instanceof Error ? err.message : err);
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
      .where(and(eq(transactions.id, taskId), eq(transactions.userId, user.id)))
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
        parts: [{ type: "text", text: txn.error }],
      };
    }

    return c.json({ jsonrpc: "2.0", result, id });
  } catch (err) {
    console.error("[a2a] tasks/get error:", err instanceof Error ? err.message : err);
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
