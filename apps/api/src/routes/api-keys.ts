import { Hono, type Context } from "hono";
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { apiKeys, users } from "../db/schema.js";
import { generateApiKey, getKeyPrefix, hashApiKey } from "../lib/auth.js";
import { keySpending } from "../lib/api-keys.js";
import { authMiddleware, requirePrimaryKey } from "../lib/middleware.js";
import { rateLimitByKey } from "../lib/rate-limit.js";
import { lockWalletForUser, type WalletTx } from "../lib/wallet-service.js";
import { apiError, type ApiError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

const cap = z.number().int().min(0).max(2_147_483_647).nullable();
const fields = z.object({
  label: z.string().regex(/^[^\p{Cc}]*$/u).trim().min(1).max(64),
  max_spend_per_hour_cents: cap.optional(),
  max_spend_total_cents: cap.optional(),
}).strict();
const updateFields = fields.partial().refine((v) => Object.keys(v).length > 0);
const idSchema = z.string().uuid();

// Explicit projection: hashes and plaintext can never enter list/update output.
export function publicKey(key: typeof apiKeys.$inferSelect) {
  return {
    id: key.id, key_prefix: key.keyPrefix, label: key.label,
    max_spend_per_hour_cents: key.maxSpendPerHourCents,
    max_spend_total_cents: key.maxSpendTotalCents,
    created_at: key.createdAt.toISOString(),
    revoked_at: key.revokedAt?.toISOString() ?? null,
    last_used_at: key.lastUsedAt?.toISOString() ?? null,
  };
}

export const apiKeysRoute = new Hono<AppEnv>();
apiKeysRoute.use("*", authMiddleware, requirePrimaryKey, rateLimitByKey(5, 1000, "account"));

// Auth and primary-key authorization precede the lock. Recheck closure after waiting.
async function withManagementLock<T>(c: Context<AppEnv>, write: (tx: WalletTx) => Promise<T>): Promise<
  { row: T } | { error: ApiError; status: 401 | 404 }
> {
  return getDb().transaction(async (tx) => {
    const userId = c.get("user").id;
    if (!await lockWalletForUser(tx, userId)) return { error: apiError("not_found", "Wallet not found."), status: 404 as const };
    const [account] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, userId), isNull(users.deletedAt)));
    if (!account) return { error: apiError("unauthorized", "Invalid API key."), status: 401 as const };
    return { row: await write(tx) };
  });
}

apiKeysRoute.post("/", async (c) => {
  const parsed = fields.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiError("invalid_request", "Supply a label (1–64 characters, no control characters) and optional non-negative integer caps in cents; null removes a cap."), 400);
  const userId = c.get("user").id;
  const key = generateApiKey();
  const result = await withManagementLock(c, async (tx) => {
    const active = await tx.select({ id: apiKeys.id }).from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt))).limit(25);
    if (active.length >= 25) return null;
    const [created] = await tx.insert(apiKeys).values({
      userId, apiKeyHash: hashApiKey(key), keyPrefix: getKeyPrefix(key),
      label: parsed.data.label,
      maxSpendPerHourCents: parsed.data.max_spend_per_hour_cents ?? null,
      maxSpendTotalCents: parsed.data.max_spend_total_cents ?? null,
    }).returning();
    return created;
  });
  if ("error" in result) return c.json(result.error, result.status);
  const row = result.row;
  if (!row) return c.json(apiError("active_key_limit_exceeded", "At most 25 active additional keys are allowed. Revoke an unused key first"), 409);
  c.header("Cache-Control", "no-store");
  return c.json({ ...publicKey(row), api_key: key }, 201);
});

apiKeysRoute.get("/", async (c) => {
  const db = getDb();
  const userId = c.get("user").id;
  const keys = await db.select().from(apiKeys).where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt))).orderBy(apiKeys.createdAt, apiKeys.id).limit(25);
  const usage = new Map((await keySpending(db, userId, null, true)).map((u) => [u.id, u]));
  c.header("Cache-Control", "no-store");
  return c.json({ keys: keys.map((key) => ({
    ...publicKey(key),
    spent_hour_cents: usage.get(key.id)?.spent_hour_cents ?? 0,
    spent_total_cents: usage.get(key.id)?.spent_total_cents ?? 0,
  })) });
});

apiKeysRoute.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const parsed = updateFields.safeParse(await c.req.json().catch(() => null));
  if (!idSchema.safeParse(id).success || !parsed.success) return c.json(apiError("invalid_request", "Supply a key UUID and at least one valid label or cap field. Caps are non-negative integer cents or null."), 400);
  const userId = c.get("user").id;
  const result = await withManagementLock(c, async (tx) => {
    const [updated] = await tx.update(apiKeys).set({
      label: parsed.data.label,
      maxSpendPerHourCents: parsed.data.max_spend_per_hour_cents,
      maxSpendTotalCents: parsed.data.max_spend_total_cents,
    }).where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId))).returning();
    return updated;
  });
  if ("error" in result) return c.json(result.error, result.status);
  const row = result.row;
  if (!row) return c.json(apiError("not_found", "Key not found. List your keys to find its id."), 404);
  return c.json(publicKey(row));
});

apiKeysRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");
  if (!idSchema.safeParse(id).success) return c.json(apiError("invalid_request", "Supply a valid key UUID."), 400);
  const userId = c.get("user").id;
  // Only the primary key may revoke additional keys; it is outside this table.
  const result = await withManagementLock(c, async (tx) => {
    const [revoked] = await tx.update(apiKeys).set({ revokedAt: sql`COALESCE(${apiKeys.revokedAt}, now())` })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId))).returning();
    return revoked;
  });
  if ("error" in result) return c.json(result.error, result.status);
  const row = result.row;
  if (!row) return c.json(apiError("not_found", "Key not found. List your keys to find its id."), 404);
  return c.json(publicKey(row));
});
