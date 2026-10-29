/**
 * OAuth endpoints for the Claude connector (distribution D4). Logic lives in
 * lib/oauth.ts and lib/oauth-clients.ts; this file is HTTP shape only.
 *
 *   GET  /.well-known/oauth-authorization-server              RFC 8414
 *   GET  /.well-known/oauth-protected-resource/mcp/connector  RFC 9728
 *   GET  /oauth/authorize    consent page (the user pastes a Strale API key)
 *   POST /oauth/authorize    consent decision → 302 to the client with a code
 *   POST /oauth/token        authorization_code and refresh_token grants
 *   POST /oauth/register     dynamic client registration (RFC 7591)
 *   POST /oauth/revoke       token revocation (RFC 7009)
 *
 * Error handling follows RFC 6749 §4.1.2.1: until the client and its
 * redirect URI are validated, errors render here and never redirect, so a
 * forged request cannot bounce the browser to an arbitrary address.
 *
 * Token, register and revoke are called from Claude's servers, which share a
 * small IP range across every Claude user, so those limits are deliberately
 * wide. The consent POST is the browser's own IP and is limited tightly.
 */

import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { authenticateApiKey } from "../lib/api-keys.js";
import { rateLimitByIp } from "../lib/rate-limit.js";
import { rateLimitByIpDb } from "../lib/db-rate-limit.js";
import { logError } from "../lib/log.js";
import {
  AUTHORIZATION_CODE_TTL_SECONDS,
  CONNECTOR_KEY_HOURLY_CAP_CENTS,
  CONNECTOR_KEY_LABEL,
  CONNECTOR_RESOURCE,
  OAUTH_ISSUER,
  authorizationServerMetadata,
  createAuthorizationCode,
  exchangeAuthorizationCode,
  grantedScope,
  isLoopbackRedirect,
  isValidCodeChallenge,
  protectedResourceMetadata,
  redirectUriMatches,
  refreshAccessToken,
  revokeOAuthToken,
} from "../lib/oauth.js";
import { registerClient, resolveClient, type ResolvedClient } from "../lib/oauth-clients.js";

export const oauthWellKnownRoute = new Hono();

oauthWellKnownRoute.get("/oauth-authorization-server", (c) => {
  c.header("Cache-Control", "public, max-age=300");
  return c.json(authorizationServerMetadata());
});

oauthWellKnownRoute.get("/oauth-protected-resource/mcp/connector", (c) => {
  c.header("Cache-Control", "public, max-age=300");
  return c.json(protectedResourceMetadata());
});

export const oauthRoute = new Hono();

const CSRF_COOKIE = "__Host-strale-oauth-csrf";

// ─── Authorization request validation ───────────────────────────────────────

interface AuthorizeParams {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  state: string;
  resource: string;
}

const PARAM_NAMES: (keyof AuthorizeParams)[] = [
  "response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "scope", "state", "resource",
];

function readParams(source: Record<string, unknown>): AuthorizeParams {
  const out = {} as AuthorizeParams;
  for (const name of PARAM_NAMES) {
    const v = source[name];
    out[name] = typeof v === "string" ? v.slice(0, 1024) : "";
  }
  return out;
}

type Validated =
  | { kind: "page_error"; message: string }
  | { kind: "redirect_error"; client: ResolvedClient; error: string; description: string }
  | { kind: "ok"; client: ResolvedClient; scope: string };

async function validateAuthorizeRequest(p: AuthorizeParams): Promise<Validated> {
  const client = await resolveClient(p.client_id);
  if (!client) return { kind: "page_error", message: "This connection link names an app Strale does not recognise." };
  if (!p.redirect_uri || !redirectUriMatches(p.redirect_uri, client.redirectUris)) {
    return { kind: "page_error", message: "This connection link sends you to an address the app did not register." };
  }
  if (p.response_type !== "code") return { kind: "redirect_error", client, error: "unsupported_response_type", description: "Only response_type=code is supported." };
  if (p.code_challenge_method !== "S256" || !isValidCodeChallenge(p.code_challenge)) {
    return { kind: "redirect_error", client, error: "invalid_request", description: "PKCE with code_challenge_method=S256 is required." };
  }
  const scope = grantedScope(p.scope);
  if (!scope) return { kind: "redirect_error", client, error: "invalid_scope", description: "The only scope is strale:tools." };
  if (p.resource && p.resource !== CONNECTOR_RESOURCE) {
    return { kind: "redirect_error", client, error: "invalid_target", description: `The only resource is ${CONNECTOR_RESOURCE}.` };
  }
  return { kind: "ok", client, scope };
}

function redirectWith(redirectUri: string, params: Record<string, string>): Response {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  url.searchParams.set("iss", OAUTH_ISSUER); // RFC 9207
  return new Response(null, { status: 302, headers: { Location: url.toString(), "Cache-Control": "no-store" } });
}

// ─── Consent page ───────────────────────────────────────────────────────────

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

const PAGE_HEADERS: Record<string, string> = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

const STYLE = `body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#fafaf9;color:#1c1917}
main{max-width:30rem;margin:3rem auto;padding:0 1rem}h1{font-size:1.4rem}
.box{background:#fff;border:1px solid #d6d3d1;border-radius:8px;padding:1.25rem}
.warn{background:#fef3c7;border-color:#f59e0b}label{display:block;font-weight:600;margin-top:1rem}
input[type=password]{width:100%;box-sizing:border-box;padding:.5rem;font:inherit;margin-top:.25rem}
.row{display:flex;gap:.75rem;margin-top:1.25rem}button{font:inherit;padding:.5rem 1rem;border-radius:6px;border:1px solid #57534e;background:#fff;cursor:pointer}
button.primary{background:#1c1917;color:#fff}.err{color:#b91c1c;font-weight:600}code{font-size:.9em}`;

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, { status, headers: PAGE_HEADERS });
}

function errorPage(message: string): Response {
  return page("Connect to Strale", `<h1>This connection can't continue</h1><div class="box"><p>${esc(message)}</p><p>Close this window and try connecting again from the app.</p></div>`, 400);
}

function consentPage(p: AuthorizeParams, client: ResolvedClient, csrf: string, error?: string): Response {
  const redirectHost = new URL(p.redirect_uri).host;
  const loopback = isLoopbackRedirect(p.redirect_uri);
  const hidden = PARAM_NAMES.map((n) => `<input type="hidden" name="${n}" value="${esc(p[n])}">`).join("");
  const cap = `€${(CONNECTOR_KEY_HOURLY_CAP_CENTS / 100).toFixed(2)}`;
  const body = `<h1>Connect ${esc(client.displayName)} to Strale</h1>
<div class="box${loopback ? " warn" : ""}">
<p><strong>${esc(client.displayName)}</strong> asks to run Strale tools for you. After you allow it, you return to <strong>${esc(redirectHost)}</strong>.</p>
${loopback ? `<p>This address is a program on your own computer. Continue only if you started this connection yourself, for example from Claude Code.</p>` : ""}
<p>It will be able to run paid tools, which are charged to your Strale wallet, and read your balance and your transaction records. It cannot top up your wallet, change your keys or manage your account.</p>
<p>Strale creates a separate key named <strong>${esc(CONNECTOR_KEY_LABEL)}</strong> for it, capped at ${cap} an hour. If you paste an additional key instead, that key and its limits are used. Revoke it at any time with <code>DELETE /v1/api-keys/{id}</code>.</p>
</div>
<form method="post" action="/oauth/authorize" autocomplete="off">
${hidden}<input type="hidden" name="csrf" value="${esc(csrf)}">
<label for="api_key">Your Strale API key</label>
<input id="api_key" name="api_key" type="password" placeholder="sk_live_..." spellcheck="false">
${error ? `<p class="err">${esc(error)}</p>` : ""}
<p>Strale checks the key and does not store it or pass it to ${esc(client.displayName)}. No account yet? <a href="https://strale.dev/signup?src=claude-dir">Get a key</a>.</p>
<div class="row"><button class="primary" type="submit" name="decision" value="allow">Allow</button><button type="submit" name="decision" value="deny">Cancel</button></div>
</form>`;
  const res = page(`Connect ${client.displayName} to Strale`, body, error ? 401 : 200);
  return res;
}

function issueCsrf(c: Context): string {
  const token = randomBytes(32).toString("hex");
  setCookie(c, CSRF_COOKIE, token, {
    path: "/", secure: true, httpOnly: true, sameSite: "Strict", maxAge: AUTHORIZATION_CODE_TTL_SECONDS * 6,
  });
  return token;
}

function withCookies(c: Context, res: Response): Response {
  const cookie = c.res.headers.get("Set-Cookie");
  if (cookie) res.headers.append("Set-Cookie", cookie);
  return res;
}

function csrfMatches(cookie: string | undefined, field: string): boolean {
  if (!cookie || !field) return false;
  const a = Buffer.from(cookie);
  const b = Buffer.from(field);
  return a.length === b.length && timingSafeEqual(a, b);
}

oauthRoute.get("/authorize", async (c) => {
  const p = readParams(c.req.query());
  const v = await validateAuthorizeRequest(p);
  if (v.kind === "page_error") return errorPage(v.message);
  if (v.kind === "redirect_error") return redirectWith(p.redirect_uri, { error: v.error, error_description: v.description, state: p.state });
  return withCookies(c, consentPage(p, v.client, issueCsrf(c)));
});

oauthRoute.post(
  "/authorize",
  rateLimitByIpDb({ windowSeconds: 600, max: 20, scope: "oauth-consent" }),
  async (c) => {
    const form = await c.req.parseBody().catch(() => ({} as Record<string, unknown>));
    const p = readParams(form);
    const v = await validateAuthorizeRequest(p);
    if (v.kind === "page_error") return errorPage(v.message);
    if (!csrfMatches(getCookie(c, CSRF_COOKIE), typeof form.csrf === "string" ? form.csrf : "")) {
      return errorPage("This page expired. Start the connection again from the app.");
    }
    if (v.kind === "redirect_error") return redirectWith(p.redirect_uri, { error: v.error, error_description: v.description, state: p.state });
    if (form.decision !== "allow") {
      return redirectWith(p.redirect_uri, { error: "access_denied", error_description: "The user declined.", state: p.state });
    }
    const apiKey = typeof form.api_key === "string" ? form.api_key.trim() : "";
    const identity = apiKey ? await authenticateApiKey(apiKey) : null;
    if (!identity) {
      return withCookies(c, consentPage(p, v.client, issueCsrf(c), "That key was not accepted. Paste an active Strale API key that starts with sk_live_."));
    }
    try {
      const code = await createAuthorizationCode({
        clientId: v.client.clientId,
        redirectUri: p.redirect_uri,
        codeChallenge: p.code_challenge,
        scope: v.scope,
        resource: CONNECTOR_RESOURCE,
        userId: identity.user.id,
        sourceApiKeyId: identity.apiKeyId,
      });
      return redirectWith(p.redirect_uri, { code, state: p.state });
    } catch (err) {
      logError("oauth-code-issue-failed", err);
      return redirectWith(p.redirect_uri, { error: "server_error", error_description: "Strale could not complete the connection. Try again.", state: p.state });
    }
  },
);

// ─── Token, registration, revocation ────────────────────────────────────────

function tokenJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Pragma: "no-cache" },
  });
}

function oauthError(error: string, description: string, status = 400): Response {
  return tokenJson({ error, error_description: description }, status);
}

async function readTokenBody(c: Context): Promise<Record<string, string> | null> {
  const type = c.req.header("Content-Type") ?? "";
  if (!type.toLowerCase().startsWith("application/x-www-form-urlencoded")) return null;
  const raw = await c.req.parseBody().catch(() => null);
  if (!raw) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") out[k] = v;
  return out;
}

oauthRoute.post("/token", rateLimitByIp(600, 60_000), async (c) => {
  const body = await readTokenBody(c);
  if (!body) return oauthError("invalid_request", "Send the request as application/x-www-form-urlencoded.");
  if (c.req.header("Authorization") || body.client_secret) {
    return oauthError("invalid_client", "Clients authenticate with PKCE only; send no client secret.", 401);
  }
  const clientId = body.client_id ?? "";
  if (!clientId) return oauthError("invalid_request", "client_id is required.");
  try {
    if (body.grant_type === "authorization_code") {
      if (!body.code || !body.redirect_uri || !body.code_verifier) {
        return oauthError("invalid_request", "code, redirect_uri and code_verifier are required.");
      }
      const result = await exchangeAuthorizationCode({
        code: body.code, clientId, redirectUri: body.redirect_uri, codeVerifier: body.code_verifier,
        resource: body.resource || undefined,
      });
      return result.ok ? tokenJson(result.body) : oauthError(result.error, result.description);
    }
    if (body.grant_type === "refresh_token") {
      if (!body.refresh_token) return oauthError("invalid_request", "refresh_token is required.");
      if (body.resource && body.resource !== CONNECTOR_RESOURCE) return oauthError("invalid_target", `The only resource is ${CONNECTOR_RESOURCE}.`);
      const result = await refreshAccessToken({ refreshToken: body.refresh_token, clientId, scope: body.scope || undefined });
      return result.ok ? tokenJson(result.body) : oauthError(result.error, result.description);
    }
    return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
  } catch (err) {
    logError("oauth-token-failed", err, { grant_type: body.grant_type });
    return oauthError("server_error", "Strale could not issue a token. Try again.", 500);
  }
});

oauthRoute.post("/register", rateLimitByIp(120, 60_000), async (c) => {
  const body = await c.req.json().catch(() => null);
  try {
    const result = await registerClient(body);
    return result.ok ? tokenJson(result.body, 201) : oauthError(result.error, result.description);
  } catch (err) {
    logError("oauth-register-failed", err);
    return oauthError("server_error", "Strale could not register the client. Try again.", 500);
  }
});

oauthRoute.post("/revoke", rateLimitByIp(120, 60_000), async (c) => {
  const body = await readTokenBody(c);
  if (!body?.token) return oauthError("invalid_request", "token is required, sent as application/x-www-form-urlencoded.");
  try {
    await revokeOAuthToken(body.token);
  } catch (err) {
    logError("oauth-revoke-failed", err);
    return oauthError("server_error", "Strale could not revoke the token. Try again.", 500);
  }
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
});
