import type { Context, Next } from "hono";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { users } from "../db/schema.js";
import { hashApiKey, getKeyPrefix } from "./auth.js";
import { apiError } from "./errors.js";
import type { AppEnv } from "../types.js";

export async function authMiddleware(
  c: Context<AppEnv>,
  next: Next,
): Promise<Response | void> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(
      apiError(
        "unauthorized",
        "Missing or invalid Authorization header. Expected: Bearer sk_live_...",
      ),
      401,
    );
  }

  const apiKey = authHeader.slice(7); // Strip "Bearer "
  if (!apiKey.startsWith("sk_live_")) {
    return c.json(apiError("unauthorized", "Invalid API key format."), 401);
  }

  const prefix = getKeyPrefix(apiKey);
  const hash = hashApiKey(apiKey);

  // Look up candidates by prefix, then verify hash with constant-time compare
  const db = getDb();
  const candidates = await db
    .select()
    .from(users)
    .where(eq(users.keyPrefix, prefix));

  const hashBuffer = Buffer.from(hash, "utf-8");
  const user = candidates.find((u) => {
    const stored = Buffer.from(u.apiKeyHash, "utf-8");
    return (
      stored.length === hashBuffer.length &&
      timingSafeEqual(stored, hashBuffer)
    );
  });

  if (!user) {
    return c.json(apiError("unauthorized", "Invalid API key."), 401);
  }

  c.set("user", user);
  await next();
}
