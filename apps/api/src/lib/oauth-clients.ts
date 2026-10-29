/**
 * OAuth client identification for the connector's authorization server.
 *
 * Two ways a client is known, as Claude's connector documentation describes:
 *
 * 1. Client ID Metadata Document (CIMD): the client_id is an HTTPS URL whose
 *    JSON names the client's redirect URIs. Claude prefers this when the
 *    server metadata advertises it. Fetching a client-supplied URL is a
 *    server-side request, so only hosts in CIMD_ALLOWED_HOSTS are fetched,
 *    over HTTPS, without following redirects, with a timeout and a size cap.
 * 2. Dynamic Client Registration (RFC 7591), the fallback. Registration
 *    accepts only Claude's hosted callback and loopback redirect URIs, so a
 *    registered client can only ever send a code to Claude or to the user's
 *    own machine.
 */

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { oauthClients } from "../db/schema.js";
import { isLoopbackRedirect } from "./oauth.js";
import { readTextWithLimit } from "./resource-limits.js";

export const CIMD_ALLOWED_HOSTS = new Set(["claude.ai", "claude.com"]);
/** Hosted Claude apps (web, Desktop, mobile, Cowork) use this callback. */
export const CLAUDE_HOSTED_CALLBACKS = new Set([
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
]);

const CIMD_TIMEOUT_MS = 5000;
const CIMD_MAX_BYTES = 16 * 1024;
const CIMD_CACHE_TTL_MS = 10 * 60 * 1000;
const CIMD_CACHE_MAX = 100;
const MAX_REDIRECT_URIS = 10;
const MAX_URI_LENGTH = 512;

export interface ResolvedClient {
  clientId: string;
  kind: "cimd" | "dcr";
  /** Shown on the consent page. For CIMD the host of the client_id, never the self-asserted name. */
  displayName: string;
  redirectUris: string[];
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
let fetcher: Fetcher = (url, init) => fetch(url, init);
/** Test seam for the CIMD fetch. */
export function setCimdFetcherForTests(next: Fetcher | null): void {
  fetcher = next ?? ((url, init) => fetch(url, init));
  cimdCache.clear();
}

const cimdCache = new Map<string, { client: ResolvedClient; expiresAt: number }>();

export function cimdUrlAllowed(clientId: string): boolean {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return false;
  }
  return url.protocol === "https:" && !url.port && !url.username && !url.password && !url.hash
    && CIMD_ALLOWED_HOSTS.has(url.hostname) && url.pathname.length > 1;
}

async function resolveCimd(clientId: string): Promise<ResolvedClient | null> {
  if (!cimdUrlAllowed(clientId)) return null;
  const cached = cimdCache.get(clientId);
  if (cached && cached.expiresAt > Date.now()) return cached.client;
  let doc: unknown;
  try {
    const resp = await fetcher(clientId, {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(CIMD_TIMEOUT_MS),
    });
    if (!resp.ok) return null;
    // Throws past the cap; the catch below turns that into "no client".
    doc = JSON.parse(await readTextWithLimit(resp, CIMD_MAX_BYTES, "client_id"));
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object") return null;
  const d = doc as Record<string, unknown>;
  if (d.client_id !== clientId) return null;
  if (d.token_endpoint_auth_method !== undefined && d.token_endpoint_auth_method !== "none") return null;
  if (!Array.isArray(d.redirect_uris)) return null;
  const origin = new URL(clientId).origin;
  // Non-loopback redirects must share the client_id's origin, so a document
  // on claude.ai can only send codes back to claude.ai or to loopback.
  const redirectUris = d.redirect_uris
    .filter((u): u is string => typeof u === "string" && u.length <= MAX_URI_LENGTH)
    .filter((u) => {
      if (isLoopbackRedirect(u)) return true;
      try {
        const parsed = new URL(u);
        return parsed.protocol === "https:" && parsed.origin === origin;
      } catch {
        return false;
      }
    })
    .slice(0, MAX_REDIRECT_URIS);
  if (redirectUris.length === 0) return null;
  const client: ResolvedClient = { clientId, kind: "cimd", displayName: new URL(clientId).hostname, redirectUris };
  if (cimdCache.size >= CIMD_CACHE_MAX) cimdCache.delete(cimdCache.keys().next().value!);
  cimdCache.set(clientId, { client, expiresAt: Date.now() + CIMD_CACHE_TTL_MS });
  return client;
}

const DCR_CLIENT_ID = /^stc_[0-9a-f]{32}$/;

export async function resolveClient(clientId: string | undefined | null): Promise<ResolvedClient | null> {
  if (!clientId || clientId.length > MAX_URI_LENGTH) return null;
  if (clientId.startsWith("https://")) return resolveCimd(clientId);
  if (!DCR_CLIENT_ID.test(clientId)) return null;
  const [row] = await getDb().select().from(oauthClients).where(eq(oauthClients.clientId, clientId));
  if (!row) return null;
  return {
    clientId: row.clientId,
    kind: "dcr",
    displayName: row.clientName ? `${row.clientName} (name given by the app)` : "An app that registered itself",
    redirectUris: row.redirectUris,
  };
}

/** A redirect URI a self-registered client may use. */
export function registrableRedirectUri(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length > MAX_URI_LENGTH || uri.includes("#")) return false;
  if (CLAUDE_HOSTED_CALLBACKS.has(uri)) return true;
  if (!isLoopbackRedirect(uri)) return false;
  const url = new URL(uri);
  return !url.username && !url.password;
}

export type RegistrationResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: "invalid_redirect_uri" | "invalid_client_metadata"; description: string };

/** RFC 7591 §3. Public clients only. */
export async function registerClient(body: unknown): Promise<RegistrationResult> {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_client_metadata", description: "Send the client metadata as a JSON object." };
  const b = body as Record<string, unknown>;
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS) {
    return { ok: false, error: "invalid_redirect_uri", description: `Send redirect_uris as 1 to ${MAX_REDIRECT_URIS} URIs.` };
  }
  if (!uris.every(registrableRedirectUri)) {
    return { ok: false, error: "invalid_redirect_uri", description: "Only https://claude.ai/api/mcp/auth_callback, https://claude.com/api/mcp/auth_callback and http loopback redirect URIs (localhost, 127.0.0.1, [::1]) can be registered." };
  }
  if (b.token_endpoint_auth_method !== undefined && b.token_endpoint_auth_method !== "none") {
    return { ok: false, error: "invalid_client_metadata", description: "Only public clients (token_endpoint_auth_method \"none\") can register." };
  }
  const grantTypes = b.grant_types ?? ["authorization_code", "refresh_token"];
  if (!Array.isArray(grantTypes) || !grantTypes.every((g) => g === "authorization_code" || g === "refresh_token")) {
    return { ok: false, error: "invalid_client_metadata", description: "grant_types may contain only authorization_code and refresh_token." };
  }
  const responseTypes = b.response_types ?? ["code"];
  if (!Array.isArray(responseTypes) || !responseTypes.every((r) => r === "code")) {
    return { ok: false, error: "invalid_client_metadata", description: "response_types may contain only code." };
  }
  const name = typeof b.client_name === "string"
    ? b.client_name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100) || null
    : null;
  const clientId = `stc_${randomBytes(16).toString("hex")}`;
  const redirectUris = uris as string[];
  const [row] = await getDb().insert(oauthClients).values({ clientId, clientName: name, redirectUris }).returning();
  return {
    ok: true,
    body: {
      client_id: row.clientId,
      client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000),
      ...(name ? { client_name: name } : {}),
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: grantTypes,
      response_types: ["code"],
    },
  };
}
