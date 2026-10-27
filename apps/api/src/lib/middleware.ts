import type { Context, Next } from "hono";
import { createHash } from "node:crypto";
import { authenticateApiKey } from "./api-keys.js";
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

  const identity = await authenticateApiKey(apiKey);
  const user = identity?.user;

  if (!user) {
    return c.json(apiError("unauthorized", "Invalid API key."), 401);
  }

  c.set("user", user);
  c.set("apiKeyId", identity!.apiKeyId);
  // F-0-014: re-child the request logger with user_id once auth resolves.
  const reqLog = c.get("log");
  if (reqLog) c.set("log", reqLog.child({ user_id: user.id }));
  await next();
}

/** Account management is reserved for the primary key; run after auth. */
export async function requirePrimaryKey(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  if (c.get("apiKeyId") != null) {
    return c.json(apiError("primary_key_required", "Use the account's primary key for this action"), 403);
  }
  await next();
}

/**
 * Optional auth: validates API key if present, but does NOT 401 if missing.
 * Used for routes that accept both authenticated and unauthenticated requests
 * (e.g., free-tier capabilities).
 */
export async function optionalAuthMiddleware(
  c: Context<AppEnv>,
  next: Next,
): Promise<Response | void> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // No auth header — proceed without user
    return next();
  }

  const apiKey = authHeader.slice(7);
  if (!apiKey.startsWith("sk_live_")) {
    return c.json(apiError("unauthorized", "Invalid API key format."), 401);
  }

  const identity = await authenticateApiKey(apiKey);
  const user = identity?.user;

  if (!user) {
    return c.json(apiError("unauthorized", "Invalid API key."), 401);
  }

  c.set("user", user);
  c.set("apiKeyId", identity!.apiKeyId);
  // F-0-014: re-child the request logger with user_id once auth resolves.
  const reqLog = c.get("log");
  if (reqLog) c.set("log", reqLog.child({ user_id: user.id }));
  await next();
}

// ─── Shared IP helpers ────────────────────────────────────────────────────────

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6_RE = /^[0-9a-fA-F:]{2,45}$/;

/** Extract client IP from proxy headers. Returns "unknown" if not available. */
export function getClientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded && (IPV4_RE.test(forwarded) || IPV6_RE.test(forwarded))) return forwarded;
  const realIp = c.req.header("x-real-ip")?.trim();
  if (realIp && (IPV4_RE.test(realIp) || IPV6_RE.test(realIp))) return realIp;
  return "unknown";
}

/** Hash an IP for storage (first 16 chars of SHA-256). Never store raw IPs. */
export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}
