/**
 * OAuth 2.1 authorization server for the Claude connector (distribution D4).
 *
 * Strale has no password accounts: a user proves who they are with an API
 * key. So sign-in maps onto keys. On the consent page the user pastes a key
 * once; the code this issues is bound to that account. At the code exchange
 * the grant gets its own additional API key ("Claude connector", hourly cap)
 * unless the pasted key was already an additional key, in which case the
 * grant spends through that key and inherits its caps. The client never sees
 * an API key: it holds short-lived access tokens and rotating refresh tokens,
 * which resolve to that additional key. Revoking the key (DELETE
 * /v1/api-keys/:id) ends the grant; an additional key can never reach account
 * management or top-ups (requirePrimaryKey).
 *
 * Rules this module enforces, each covered in oauth.integration.test.ts:
 * - PKCE S256 only, on every code (RFC 7636; OAuth 2.1).
 * - Codes are single use and live five minutes. A replayed code revokes the
 *   grant it produced (RFC 6749 §10.5).
 * - Refresh tokens rotate. Presenting a rotated one revokes the whole grant
 *   (OAuth 2.1 §4.3.1 reuse detection).
 * - Every token, code and stored value is SHA-256 hex; raw values are never
 *   stored or logged.
 * - One scope, `strale:tools`, and one resource, the connector URL (RFC 8707).
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { apiKeys, oauthAuthorizationCodes, oauthGrants, oauthTokens, users } from "../db/schema.js";
import { generateApiKey, getKeyPrefix, hashApiKey } from "./auth.js";
import { lockWalletForUser } from "./wallet-service.js";
import type { User } from "../types.js";

export const OAUTH_ISSUER = "https://api.strale.io";
export const CONNECTOR_PATH = "/mcp/connector";
export const CONNECTOR_RESOURCE = `${OAUTH_ISSUER}${CONNECTOR_PATH}`;
export const PROTECTED_RESOURCE_METADATA_URL = `${OAUTH_ISSUER}/.well-known/oauth-protected-resource${CONNECTOR_PATH}`;
export const OAUTH_SCOPE = "strale:tools";

export const ACCESS_TOKEN_TTL_SECONDS = 3600;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 3600;
export const AUTHORIZATION_CODE_TTL_SECONDS = 300;
/** Hourly spend cap on the key a grant creates; the owner can change it with the primary key. */
export const CONNECTOR_KEY_HOURLY_CAP_CENTS = 500;
export const CONNECTOR_KEY_LABEL = "Claude connector";
const MAX_ACTIVE_ADDITIONAL_KEYS = 25; // same limit as POST /v1/api-keys

const ACCESS_PREFIX = "sto_at_";
const REFRESH_PREFIX = "sto_rt_";
const CODE_PREFIX = "sto_ac_";

export function isOAuthAccessToken(token: string): boolean {
  return token.startsWith(ACCESS_PREFIX);
}

function newSecret(prefix: string): string {
  return `${prefix}${randomBytes(32).toString("hex")}`;
}

export function hashOAuthSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function equalStrings(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

// ─── Discovery documents ────────────────────────────────────────────────────

export function authorizationServerMetadata() {
  return {
    issuer: OAUTH_ISSUER,
    authorization_endpoint: `${OAUTH_ISSUER}/oauth/authorize`,
    token_endpoint: `${OAUTH_ISSUER}/oauth/token`,
    registration_endpoint: `${OAUTH_ISSUER}/oauth/register`,
    revocation_endpoint: `${OAUTH_ISSUER}/oauth/revoke`,
    scopes_supported: [OAUTH_SCOPE, "offline_access"],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: "https://strale.dev/docs",
  };
}

export function protectedResourceMetadata() {
  return {
    resource: CONNECTOR_RESOURCE,
    authorization_servers: [OAUTH_ISSUER],
    bearer_methods_supported: ["header"],
    scopes_supported: [OAUTH_SCOPE],
    resource_name: "Strale",
    resource_documentation: "https://strale.dev/docs",
  };
}

// ─── Request validation helpers ─────────────────────────────────────────────

const PKCE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
const PKCE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export function isValidCodeChallenge(challenge: string): boolean {
  return PKCE_CHALLENGE.test(challenge);
}

/** RFC 7636 §4.6, S256 only. */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!PKCE_VERIFIER.test(verifier) || !PKCE_CHALLENGE.test(challenge)) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return equalStrings(computed, challenge);
}

/**
 * The granted scope for a requested one, or null if it asks for anything
 * else. `offline_access` is accepted (Claude appends it when advertised);
 * a refresh token is issued either way.
 */
export function grantedScope(requested: string | undefined | null): string | null {
  const parts = (requested ?? "").split(" ").filter(Boolean);
  for (const part of parts) {
    if (part !== OAUTH_SCOPE && part !== "offline_access") return null;
  }
  return OAUTH_SCOPE;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLoopbackRedirect(uri: string): boolean {
  try {
    const url = new URL(uri);
    return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Exact string match against a registered redirect URI, except that a
 * loopback URI matches with any port (RFC 8252 §7.3; Claude Code binds an
 * ephemeral port and registers http://localhost/callback and
 * http://127.0.0.1/callback). Fragments are never allowed (RFC 6749 §3.1.2).
 */
export function redirectUriMatches(requested: string, registered: readonly string[]): boolean {
  let req: URL;
  try {
    req = new URL(requested);
  } catch {
    return false;
  }
  if (req.hash || requested.includes("#")) return false;
  if (req.username || req.password) return false;
  for (const candidate of registered) {
    if (candidate === requested) return true;
    if (!isLoopbackRedirect(candidate) || !isLoopbackRedirect(requested)) continue;
    const reg = new URL(candidate);
    if (reg.hostname === req.hostname && reg.pathname === req.pathname && reg.search === req.search) return true;
  }
  return false;
}

// ─── Authorization codes ────────────────────────────────────────────────────

export async function createAuthorizationCode(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  resource: string;
  userId: string;
  sourceApiKeyId: string | null;
}): Promise<string> {
  const code = newSecret(CODE_PREFIX);
  await getDb().insert(oauthAuthorizationCodes).values({
    codeHash: hashOAuthSecret(code),
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    scope: input.scope,
    resource: input.resource,
    userId: input.userId,
    sourceApiKeyId: input.sourceApiKeyId,
    expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_SECONDS * 1000),
  });
  return code;
}

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export type TokenResult = { ok: true; body: TokenResponse } | { ok: false; error: "invalid_grant" | "invalid_request"; description: string };

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

async function issueTokens(tx: Tx, grantId: string, scope: string): Promise<TokenResponse> {
  const access = newSecret(ACCESS_PREFIX);
  const refresh = newSecret(REFRESH_PREFIX);
  const now = Date.now();
  await tx.insert(oauthTokens).values([
    { grantId, kind: "access", tokenHash: hashOAuthSecret(access), expiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000) },
    { grantId, kind: "refresh", tokenHash: hashOAuthSecret(refresh), expiresAt: new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000) },
  ]);
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_SECONDS, refresh_token: refresh, scope };
}

/** Revoke a grant, every token it issued, and the key if the grant created it. */
async function revokeGrant(tx: Tx, grantId: string): Promise<void> {
  const [grant] = await tx.update(oauthGrants).set({ revokedAt: sql`now()` })
    .where(and(eq(oauthGrants.id, grantId), isNull(oauthGrants.revokedAt)))
    .returning({ apiKeyId: oauthGrants.apiKeyId, keyMinted: oauthGrants.keyMinted, userId: oauthGrants.userId });
  await tx.update(oauthTokens).set({ revokedAt: sql`now()` })
    .where(and(eq(oauthTokens.grantId, grantId), isNull(oauthTokens.revokedAt)));
  if (grant?.keyMinted) {
    await tx.update(apiKeys).set({ revokedAt: sql`now()` })
      .where(and(eq(apiKeys.id, grant.apiKeyId), eq(apiKeys.userId, grant.userId), isNull(apiKeys.revokedAt)));
  }
}

const INVALID_CODE = { ok: false as const, error: "invalid_grant" as const, description: "The authorization code is invalid, expired or already used." };

/** grant_type=authorization_code (RFC 6749 §4.1.3, with PKCE and RFC 8707). */
export async function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource?: string;
}): Promise<TokenResult> {
  if (!input.code.startsWith(CODE_PREFIX)) return INVALID_CODE;
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(oauthAuthorizationCodes)
      .where(eq(oauthAuthorizationCodes.codeHash, hashOAuthSecret(input.code)))
      .for("update");
    if (!row) return INVALID_CODE;
    if (row.consumedAt) {
      // Replay: whoever holds this code may have the tokens it produced.
      if (row.grantId) await revokeGrant(tx, row.grantId);
      return INVALID_CODE;
    }
    // Any presentation burns the code, so a wrong verifier cannot be retried.
    await tx.update(oauthAuthorizationCodes).set({ consumedAt: sql`now()` })
      .where(eq(oauthAuthorizationCodes.codeHash, row.codeHash));
    if (row.expiresAt.getTime() <= Date.now()) return INVALID_CODE;
    if (row.clientId !== input.clientId || row.redirectUri !== input.redirectUri) return INVALID_CODE;
    if (input.resource !== undefined && input.resource !== row.resource) return INVALID_CODE;
    if (!verifyPkceS256(input.codeVerifier, row.codeChallenge)) return INVALID_CODE;

    // Same management lock and limit as POST /v1/api-keys.
    if (!await lockWalletForUser(tx, row.userId)) return INVALID_CODE;
    const [account] = await tx.select({ id: users.id }).from(users)
      .where(and(eq(users.id, row.userId), isNull(users.deletedAt)));
    if (!account) return INVALID_CODE;

    let apiKeyId: string;
    let keyMinted = false;
    if (row.sourceApiKeyId) {
      const [key] = await tx.select({ id: apiKeys.id }).from(apiKeys)
        .where(and(eq(apiKeys.id, row.sourceApiKeyId), eq(apiKeys.userId, row.userId), isNull(apiKeys.revokedAt)));
      if (!key) return INVALID_CODE;
      apiKeyId = key.id;
    } else {
      const active = await tx.select({ id: apiKeys.id }).from(apiKeys)
        .where(and(eq(apiKeys.userId, row.userId), isNull(apiKeys.revokedAt))).limit(MAX_ACTIVE_ADDITIONAL_KEYS);
      if (active.length >= MAX_ACTIVE_ADDITIONAL_KEYS) {
        return { ok: false, error: "invalid_grant", description: `The account already has ${MAX_ACTIVE_ADDITIONAL_KEYS} active additional keys. Revoke one with the primary key, then connect again.` };
      }
      // The raw key is discarded: the grant's tokens are its only credential.
      const raw = generateApiKey();
      const [created] = await tx.insert(apiKeys).values({
        userId: row.userId, apiKeyHash: hashApiKey(raw), keyPrefix: getKeyPrefix(raw),
        label: CONNECTOR_KEY_LABEL, maxSpendPerHourCents: CONNECTOR_KEY_HOURLY_CAP_CENTS, maxSpendTotalCents: null,
      }).returning({ id: apiKeys.id });
      apiKeyId = created.id;
      keyMinted = true;
    }

    const [grant] = await tx.insert(oauthGrants).values({
      userId: row.userId, apiKeyId, clientId: row.clientId, scope: row.scope, resource: row.resource, keyMinted,
    }).returning({ id: oauthGrants.id });
    await tx.update(oauthAuthorizationCodes).set({ grantId: grant.id })
      .where(eq(oauthAuthorizationCodes.codeHash, row.codeHash));
    return { ok: true as const, body: await issueTokens(tx, grant.id, row.scope) };
  });
}

const INVALID_REFRESH = { ok: false as const, error: "invalid_grant" as const, description: "The refresh token is invalid, expired or revoked." };

/** grant_type=refresh_token, with rotation and reuse detection. */
export async function refreshAccessToken(input: { refreshToken: string; clientId: string; scope?: string }): Promise<TokenResult> {
  if (!input.refreshToken.startsWith(REFRESH_PREFIX)) return INVALID_REFRESH;
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select({ token: oauthTokens, grant: oauthGrants })
      .from(oauthTokens).innerJoin(oauthGrants, eq(oauthTokens.grantId, oauthGrants.id))
      .where(and(eq(oauthTokens.tokenHash, hashOAuthSecret(input.refreshToken)), eq(oauthTokens.kind, "refresh")))
      .for("update");
    if (!row) return INVALID_REFRESH;
    if (row.grant.clientId !== input.clientId) return INVALID_REFRESH;
    if (row.token.rotatedAt) {
      // A rotated token came back: one of the two holders is not the client.
      await revokeGrant(tx, row.grant.id);
      return INVALID_REFRESH;
    }
    if (row.token.revokedAt || row.grant.revokedAt || row.token.expiresAt.getTime() <= Date.now()) return INVALID_REFRESH;
    if (input.scope !== undefined && grantedScope(input.scope) !== row.grant.scope) {
      return { ok: false, error: "invalid_grant", description: "A refresh cannot change the scope." };
    }
    const [live] = await tx.select({ id: apiKeys.id }).from(apiKeys).innerJoin(users, eq(apiKeys.userId, users.id))
      .where(and(eq(apiKeys.id, row.grant.apiKeyId), isNull(apiKeys.revokedAt), isNull(users.deletedAt)));
    if (!live) return INVALID_REFRESH;
    await tx.update(oauthTokens).set({ rotatedAt: sql`now()` }).where(eq(oauthTokens.id, row.token.id));
    return { ok: true as const, body: await issueTokens(tx, row.grant.id, row.grant.scope) };
  });
}

/** RFC 7009. Either token ends the whole grant. Unknown tokens are not an error. */
export async function revokeOAuthToken(token: string): Promise<void> {
  if (!token.startsWith(ACCESS_PREFIX) && !token.startsWith(REFRESH_PREFIX)) return;
  await getDb().transaction(async (tx) => {
    const [row] = await tx.select({ grantId: oauthTokens.grantId }).from(oauthTokens)
      .where(eq(oauthTokens.tokenHash, hashOAuthSecret(token)));
    if (row) await revokeGrant(tx, row.grantId);
  });
}

/**
 * Resolve an access token to the account and additional key it acts as.
 * Null for anything not live: expired, revoked, rotated-out grant, revoked
 * key or closed account.
 */
export async function authenticateOAuthAccessToken(token: string): Promise<{
  user: User;
  apiKeyId: string;
  resource: string;
} | null> {
  if (!token.startsWith(ACCESS_PREFIX)) return null;
  const [row] = await getDb().select({ user: users, apiKeyId: apiKeys.id, resource: oauthGrants.resource })
    .from(oauthTokens)
    .innerJoin(oauthGrants, eq(oauthTokens.grantId, oauthGrants.id))
    .innerJoin(apiKeys, eq(oauthGrants.apiKeyId, apiKeys.id))
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(and(
      eq(oauthTokens.tokenHash, hashOAuthSecret(token)),
      eq(oauthTokens.kind, "access"),
      isNull(oauthTokens.revokedAt),
      gt(oauthTokens.expiresAt, sql`now()`),
      isNull(oauthGrants.revokedAt),
      isNull(apiKeys.revokedAt),
      isNull(users.deletedAt),
      eq(apiKeys.userId, oauthGrants.userId),
    ));
  if (!row) return null;
  return { user: row.user as User, apiKeyId: row.apiKeyId, resource: row.resource };
}

/**
 * Account closure (lib/account-closure.ts): end every connection and its
 * tokens, and delete pending codes. The closed account's keys are revoked
 * too, which alone stops the tokens; this makes the grants say so as well.
 * No Date reaches the bind encoder (DEC-20260504-A): times are now() in SQL.
 */
export async function revokeOAuthOnClosure(tx: { execute(query: ReturnType<typeof sql>): PromiseLike<unknown> }, userId: string): Promise<void> {
  await tx.execute(sql`
    UPDATE oauth_tokens SET revoked_at = now()
     WHERE revoked_at IS NULL AND grant_id IN (SELECT id FROM oauth_grants WHERE user_id = ${userId}::uuid)
  `);
  await tx.execute(sql`UPDATE oauth_grants SET revoked_at = now() WHERE user_id = ${userId}::uuid AND revoked_at IS NULL`);
  await tx.execute(sql`DELETE FROM oauth_authorization_codes WHERE user_id = ${userId}::uuid`);
}
