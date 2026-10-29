import type { Context, Next } from "hono";
import { createHash } from "node:crypto";
import { authenticateApiKey } from "./api-keys.js";
import { authenticateOAuthAccessToken, isOAuthAccessToken } from "./oauth.js";
import { readBearer } from "./bearer-placeholder.js";
import { apiError } from "./errors.js";
import { consumeIpRate } from "./rate-limit.js";
import type { AppEnv, User } from "../types.js";

/**
 * An API key, or an access token from the Claude connector's OAuth flow
 * (lib/oauth.ts). A token acts as the additional key its grant holds, so
 * requirePrimaryKey and that key's spend caps apply to it unchanged.
 */
async function authenticateBearer(token: string): Promise<{ user: User; apiKeyId: string | null } | null> {
  if (isOAuthAccessToken(token)) return authenticateOAuthAccessToken(token);
  return authenticateApiKey(token);
}

export async function authMiddleware(
  c: Context<AppEnv>,
  next: Next,
): Promise<Response | void> {
  const apiKey = readBearer(c.req.header("Authorization"), c.req.path);
  if (!apiKey) {
    return c.json(
      apiError(
        "unauthorized",
        "Missing or invalid Authorization header. Expected: Bearer sk_live_...",
      ),
      401,
    );
  }

  if (!apiKey.startsWith("sk_live_") && !isOAuthAccessToken(apiKey)) {
    return c.json(apiError("unauthorized", "Invalid API key format."), 401);
  }

  const identity = await authenticateBearer(apiKey);
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
  const apiKey = readBearer(c.req.header("Authorization"), c.req.path);
  if (!apiKey) {
    // No key (or an unexpanded placeholder) — proceed without user
    return next();
  }

  if (!apiKey.startsWith("sk_live_") && !isOAuthAccessToken(apiKey)) {
    return c.json(apiError("unauthorized", "Invalid API key format."), 401);
  }

  const identity = await authenticateBearer(apiKey);
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

/**
 * optionalAuthMiddleware with a per-IP limit that only a valid API key skips.
 *
 * Integration platforms (Clay, Zapier, n8n) send many customers' keyed calls
 * from a few shared IPs, so an IP limit applied before auth throttled them all
 * together long before any one key reached its own DEC-21 limit. A request
 * that authenticates is limited per key downstream (rateLimitByKey, plus the
 * spend cap in the handler) and never touches the IP bucket.
 *
 * Everything else is counted per IP: no key or a placeholder one (free tier,
 * x402; lib/bearer-placeholder.ts), and an invalid
 * key (S-5). An invalid key is counted only after the lookup fails, so it
 * costs the same key lookup as on any authenticated route, and once the IP's
 * bucket is full it is answered 429 rather than 401.
 */
export function optionalAuthIpLimitedUnlessKeyed(maxPerIp: number, windowMs: number) {
  return async (c: Context<AppEnv>, next: Next): Promise<Response | void> => {
    const apiKey = readBearer(c.req.header("Authorization"), c.req.path);
    if (apiKey !== null) {
      const wellFormed = apiKey.startsWith("sk_live_") || isOAuthAccessToken(apiKey);
      const identity = wellFormed ? await authenticateBearer(apiKey) : null;
      if (identity?.user) {
        c.set("user", identity.user);
        c.set("apiKeyId", identity.apiKeyId);
        // F-0-014: re-child the request logger with user_id once auth resolves.
        const reqLog = c.get("log");
        if (reqLog) c.set("log", reqLog.child({ user_id: identity.user.id }));
        return next();
      }
      const limited = consumeIpRate(c, maxPerIp, windowMs);
      if (limited) return limited;
      return c.json(apiError("unauthorized", wellFormed ? "Invalid API key." : "Invalid API key format."), 401);
    }

    const limited = consumeIpRate(c, maxPerIp, windowMs);
    if (limited) return limited;
    return next();
  };
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
