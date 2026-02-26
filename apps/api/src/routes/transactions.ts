import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { transactions, capabilities } from "../db/schema.js";
import { authMiddleware } from "../lib/middleware.js";
import { apiError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

export const transactionsRoute = new Hono<AppEnv>();

// All transaction routes require auth
transactionsRoute.use("*", authMiddleware);

// GET /v1/transactions — List capability transactions
transactionsRoute.get("/", async (c) => {
  const user = c.get("user");
  const db = getDb();

  const rows = await db
    .select({
      id: transactions.id,
      status: transactions.status,
      capability_slug: capabilities.slug,
      price_cents: transactions.priceCents,
      latency_ms: transactions.latencyMs,
      created_at: transactions.createdAt,
      completed_at: transactions.completedAt,
    })
    .from(transactions)
    .innerJoin(capabilities, eq(transactions.capabilityId, capabilities.id))
    .where(eq(transactions.userId, user.id))
    .orderBy(desc(transactions.createdAt))
    .limit(100);

  return c.json({ transactions: rows });
});

// GET /v1/transactions/:id — Transaction details
transactionsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const db = getDb();

  const [row] = await db
    .select({
      id: transactions.id,
      status: transactions.status,
      capability_slug: capabilities.slug,
      input: transactions.input,
      output: transactions.output,
      error: transactions.error,
      price_cents: transactions.priceCents,
      latency_ms: transactions.latencyMs,
      provenance: transactions.provenance,
      created_at: transactions.createdAt,
      completed_at: transactions.completedAt,
    })
    .from(transactions)
    .innerJoin(capabilities, eq(transactions.capabilityId, capabilities.id))
    .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)))
    .limit(1);

  if (!row) {
    return c.json(apiError("not_found", "Transaction not found."), 404);
  }

  return c.json(row);
});
