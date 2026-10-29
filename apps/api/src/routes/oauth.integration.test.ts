/**
 * The Claude connector's OAuth server (distribution D4) against real Postgres.
 * Security-relevant behaviour is asserted end to end through the app: PKCE,
 * single-use codes with replay revocation, refresh rotation with reuse
 * detection, redirect and client validation that never redirects on a bad
 * client, scope and resource limits, and what a token can and cannot reach.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { useTestDatabase } from "../test-support/integration-db.js";
import { apiKeys, oauthAuthorizationCodes, oauthClients, oauthGrants, oauthTokens, users, wallets } from "../db/schema.js";
import { generateApiKey, getKeyPrefix, hashApiKey } from "../lib/auth.js";
import { CONNECTOR_KEY_HOURLY_CAP_CENTS, CONNECTOR_RESOURCE, PROTECTED_RESOURCE_METADATA_URL, revokeOAuthOnClosure } from "../lib/oauth.js";
import { setCimdFetcherForTests } from "../lib/oauth-clients.js";

const DATABASE_URL_TEST = useTestDatabase();
const describeDb = DATABASE_URL_TEST ? describe : describe.skip;

const CLIENT_ID = "https://claude.ai/oauth/test-client-metadata";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

describeDb("Claude connector OAuth against real Postgres", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let app: typeof import("../app.js")["app"];
  let userId: string;
  let primary: string;
  const dcrClients: string[] = [];
  let fetchedCimd = 0;

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 8 });
    db = drizzle(client);
    ({ app } = await import("../app.js"));
  }, 120_000);

  beforeEach(async () => {
    fetchedCimd = 0;
    setCimdFetcherForTests(async (url) => {
      fetchedCimd++;
      if (url !== CLIENT_ID) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify({
        client_id: CLIENT_ID, client_name: "Totally Claude", token_endpoint_auth_method: "none",
        redirect_uris: [REDIRECT, "https://evil.example/cb", "http://localhost/callback"],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    userId = randomUUID();
    primary = generateApiKey();
    await db.insert(users).values({ id: userId, email: `${userId}@example.test`, apiKeyHash: hashApiKey(primary), keyPrefix: getKeyPrefix(primary) });
    await db.insert(wallets).values({ userId, balanceCents: 1000 });
  });

  afterEach(async () => {
    setCimdFetcherForTests(null);
    const grants = await db.select({ id: oauthGrants.id }).from(oauthGrants).where(eq(oauthGrants.userId, userId));
    await db.delete(oauthAuthorizationCodes).where(eq(oauthAuthorizationCodes.userId, userId));
    if (grants.length) await db.delete(oauthTokens).where(inArray(oauthTokens.grantId, grants.map((g) => g.id)));
    await db.delete(oauthGrants).where(eq(oauthGrants.userId, userId));
    await db.delete(apiKeys).where(eq(apiKeys.userId, userId));
    await db.delete(wallets).where(eq(wallets.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
    if (dcrClients.length) await db.delete(oauthClients).where(inArray(oauthClients.clientId, dcrClients.splice(0)));
  });

  afterAll(async () => { await client.end(); });

  function authorizeQuery(over: Record<string, string> = {}, challenge = pkce().challenge) {
    return new URLSearchParams({
      response_type: "code", client_id: CLIENT_ID, redirect_uri: REDIRECT, code_challenge: challenge,
      code_challenge_method: "S256", scope: "strale:tools offline_access", state: "st-123", resource: CONNECTOR_RESOURCE, ...over,
    });
  }

  /** GET the consent page, then POST the decision with the CSRF cookie and field. */
  async function consent(query: URLSearchParams, form: Record<string, string>) {
    const page = await app.request(`http://localhost/oauth/authorize?${query}`);
    expect(page.status).toBe(200);
    const cookie = page.headers.get("Set-Cookie")!.split(";")[0];
    const csrf = /name="csrf" value="([0-9a-f]+)"/.exec(await page.text())![1];
    const body = new URLSearchParams({ ...Object.fromEntries(query), csrf, ...form });
    return app.request("http://localhost/oauth/authorize", {
      method: "POST", body, headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded", "X-Forwarded-For": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
    });
  }

  function token(form: Record<string, string>) {
    return app.request("http://localhost/oauth/token", {
      method: "POST", body: new URLSearchParams(form), headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  }

  async function signIn(key = primary) {
    const { verifier, challenge } = pkce();
    const res = await consent(authorizeQuery({}, challenge), { api_key: key, decision: "allow" });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("Location")!);
    expect(location.origin + location.pathname).toBe(REDIRECT);
    expect(location.searchParams.get("state")).toBe("st-123");
    expect(location.searchParams.get("iss")).toBe("https://api.strale.io");
    const code = location.searchParams.get("code")!;
    const exchanged = await token({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: CLIENT_ID, code_verifier: verifier, resource: CONNECTOR_RESOURCE });
    return { code, verifier, exchanged };
  }

  it("serves discovery documents that point at each other", async () => {
    const prm = await (await app.request("http://localhost/.well-known/oauth-protected-resource/mcp/connector")).json();
    expect(prm).toMatchObject({ resource: CONNECTOR_RESOURCE, authorization_servers: ["https://api.strale.io"] });
    const as = await (await app.request("http://localhost/.well-known/oauth-authorization-server")).json();
    expect(as).toMatchObject({
      issuer: "https://api.strale.io", code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"], client_id_metadata_document_supported: true,
    });
  });

  it("issues a code, exchanges it once, and the token works as a capped additional key", async () => {
    const { exchanged } = await signIn();
    expect(exchanged.status).toBe(200);
    expect(exchanged.headers.get("Cache-Control")).toBe("no-store");
    const body = await exchanged.json();
    expect(body).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "strale:tools" });
    expect(body.access_token).toMatch(/^sto_at_[0-9a-f]{64}$/);
    expect(body.refresh_token).toMatch(/^sto_rt_[0-9a-f]{64}$/);

    // Nothing raw is stored.
    const stored = await db.select().from(oauthTokens);
    expect(stored.some((t) => t.tokenHash === body.access_token || t.tokenHash === body.refresh_token)).toBe(false);

    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.userId, userId));
    expect(key).toMatchObject({ label: "Claude connector", maxSpendPerHourCents: CONNECTOR_KEY_HOURLY_CAP_CENTS, revokedAt: null });

    const auth = { Authorization: `Bearer ${body.access_token}` };
    expect((await app.request("http://localhost/v1/wallet/balance", { headers: auth })).status).toBe(200);
    // An additional key can never manage keys or top up.
    expect((await app.request("http://localhost/v1/api-keys", { headers: auth })).status).toBe(403);
    expect((await app.request("http://localhost/v1/wallet/topup", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ amount_cents: 1000 }) })).status).toBe(403);

    // Revoking the key ends the token.
    await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, key.id));
    expect((await app.request("http://localhost/v1/wallet/balance", { headers: auth })).status).toBe(401);
  });

  it("a pasted additional key is reused with its own caps, not widened", async () => {
    const extra = generateApiKey();
    const [row] = await db.insert(apiKeys).values({ userId, apiKeyHash: hashApiKey(extra), keyPrefix: getKeyPrefix(extra), label: "Agent", maxSpendPerHourCents: 10 }).returning();
    const { exchanged } = await signIn(extra);
    expect(exchanged.status).toBe(200);
    const keys = await db.select().from(apiKeys).where(eq(apiKeys.userId, userId));
    expect(keys).toHaveLength(1);
    const [grant] = await db.select().from(oauthGrants).where(eq(oauthGrants.userId, userId));
    expect(grant).toMatchObject({ apiKeyId: row.id, keyMinted: false });
  });

  it("rejects a wrong PKCE verifier and burns the code", async () => {
    const { verifier, challenge } = pkce();
    const res = await consent(authorizeQuery({}, challenge), { api_key: primary, decision: "allow" });
    const code = new URL(res.headers.get("Location")!).searchParams.get("code")!;
    const wrong = await token({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: CLIENT_ID, code_verifier: pkce().verifier });
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toMatchObject({ error: "invalid_grant" });
    const right = await token({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: CLIENT_ID, code_verifier: verifier });
    expect(right.status).toBe(400);
  });

  it("refuses a code for another client, redirect URI or resource", async () => {
    for (const over of [{ client_id: "https://claude.ai/oauth/other" }, { redirect_uri: "http://localhost:4000/callback" }, { resource: "https://api.strale.io/mcp" }]) {
      const { verifier, challenge } = pkce();
      const res = await consent(authorizeQuery({}, challenge), { api_key: primary, decision: "allow" });
      const code = new URL(res.headers.get("Location")!).searchParams.get("code")!;
      const r = await token({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: CLIENT_ID, code_verifier: verifier, ...over });
      expect(r.status).toBe(400);
    }
  });

  it("a replayed code revokes the tokens it produced", async () => {
    const { code, verifier, exchanged } = await signIn();
    const { access_token } = await exchanged.json();
    const replay = await token({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: CLIENT_ID, code_verifier: verifier });
    expect(replay.status).toBe(400);
    expect((await app.request("http://localhost/v1/wallet/balance", { headers: { Authorization: `Bearer ${access_token}` } })).status).toBe(401);
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.userId, userId));
    expect(key.revokedAt).not.toBeNull();
  });

  it("rotates refresh tokens and a reused one revokes the grant", async () => {
    const { exchanged } = await signIn();
    const first = await exchanged.json();
    const refreshed = await token({ grant_type: "refresh_token", refresh_token: first.refresh_token, client_id: CLIENT_ID });
    expect(refreshed.status).toBe(200);
    const second = await refreshed.json();
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect((await app.request("http://localhost/v1/wallet/balance", { headers: { Authorization: `Bearer ${second.access_token}` } })).status).toBe(200);

    const otherClient = await token({ grant_type: "refresh_token", refresh_token: second.refresh_token, client_id: "https://claude.ai/oauth/other" });
    expect(otherClient.status).toBe(400);

    // Straight after rotation a second presentation is a concurrent refresh:
    // refused, but the connection survives.
    const racing = await token({ grant_type: "refresh_token", refresh_token: first.refresh_token, client_id: CLIENT_ID });
    expect(racing.status).toBe(400);
    expect((await app.request("http://localhost/v1/wallet/balance", { headers: { Authorization: `Bearer ${second.access_token}` } })).status).toBe(200);

    // Past the grace window the same reuse revokes the grant.
    await db.update(oauthTokens).set({ rotatedAt: new Date(Date.now() - 60_000) }).where(eq(oauthTokens.tokenHash, createHash("sha256").update(first.refresh_token).digest("hex")));
    const reuse = await token({ grant_type: "refresh_token", refresh_token: first.refresh_token, client_id: CLIENT_ID });
    expect(reuse.status).toBe(400);
    expect(await reuse.json()).toMatchObject({ error: "invalid_grant" });
    expect((await app.request("http://localhost/v1/wallet/balance", { headers: { Authorization: `Bearer ${second.access_token}` } })).status).toBe(401);
    expect((await token({ grant_type: "refresh_token", refresh_token: second.refresh_token, client_id: CLIENT_ID })).status).toBe(400);
  });

  it("revocation ends the grant", async () => {
    const { exchanged } = await signIn();
    const { access_token, refresh_token } = await exchanged.json();
    const r = await app.request("http://localhost/oauth/revoke", { method: "POST", body: new URLSearchParams({ token: refresh_token }), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    expect(r.status).toBe(200);
    expect((await app.request("http://localhost/v1/wallet/balance", { headers: { Authorization: `Bearer ${access_token}` } })).status).toBe(401);
  });

  it("reconnecting the same app replaces the earlier connection and its key", async () => {
    const first = await (await signIn()).exchanged.json();
    const second = await (await signIn()).exchanged.json();
    expect((await app.request("http://localhost/v1/wallet/balance", { headers: { Authorization: `Bearer ${first.access_token}` } })).status).toBe(401);
    expect((await token({ grant_type: "refresh_token", refresh_token: first.refresh_token, client_id: CLIENT_ID })).status).toBe(400);
    expect((await app.request("http://localhost/v1/wallet/balance", { headers: { Authorization: `Bearer ${second.access_token}` } })).status).toBe(200);
    const live = (await db.select().from(apiKeys).where(eq(apiKeys.userId, userId))).filter((k) => !k.revokedAt);
    expect(live).toHaveLength(1);
  });

  it("a dead API key on the connector gets a reconnect challenge", async () => {
    const res = await app.request("http://localhost/mcp/connector", {
      method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${generateApiKey()}` },
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain('error="invalid_token"');
  });

  it("account closure revokes every connection and deletes pending codes", async () => {
    const { exchanged } = await signIn();
    const { access_token, refresh_token } = await exchanged.json();
    await consent(authorizeQuery(), { api_key: primary, decision: "allow" }); // a code left pending
    await revokeOAuthOnClosure(db, userId);
    expect((await app.request("http://localhost/v1/wallet/balance", { headers: { Authorization: `Bearer ${access_token}` } })).status).toBe(401);
    expect((await token({ grant_type: "refresh_token", refresh_token, client_id: CLIENT_ID })).status).toBe(400);
    expect(await db.select().from(oauthAuthorizationCodes).where(eq(oauthAuthorizationCodes.userId, userId))).toHaveLength(0);
    const grants = await db.select().from(oauthGrants).where(eq(oauthGrants.userId, userId));
    expect(grants.every((g) => g.revokedAt !== null)).toBe(true);
  });

  it("never redirects for an unknown client or an unregistered redirect URI", async () => {
    for (const over of [
      { client_id: "https://evil.example/client" },
      { client_id: "https://claude.ai/oauth/unknown" },
      { client_id: "stc_00000000000000000000000000000000" },
      { redirect_uri: "https://evil.example/cb" },
      { redirect_uri: "https://claude.ai/api/mcp/auth_callback#frag" },
    ]) {
      const res = await app.request(`http://localhost/oauth/authorize?${authorizeQuery(over)}`);
      expect(res.status).toBe(400);
      expect(res.headers.get("Location")).toBeNull();
    }
  });

  it("redirects back with the right error for a bad request from a valid client", async () => {
    const cases: [Record<string, string>, string][] = [
      [{ code_challenge_method: "plain" }, "invalid_request"],
      [{ code_challenge: "" }, "invalid_request"],
      [{ scope: "strale:tools admin" }, "invalid_scope"],
      [{ resource: "https://api.strale.io/mcp" }, "invalid_target"],
      [{ response_type: "token" }, "unsupported_response_type"],
    ];
    for (const [over, error] of cases) {
      const res = await app.request(`http://localhost/oauth/authorize?${authorizeQuery(over)}`);
      expect(res.status).toBe(302);
      const loc = new URL(res.headers.get("Location")!);
      expect(loc.searchParams.get("error")).toBe(error);
      expect(loc.searchParams.get("state")).toBe("st-123");
    }
  });

  it("accepts Claude Code's loopback redirect on any port", async () => {
    const res = await app.request(`http://localhost/oauth/authorize?${authorizeQuery({ redirect_uri: "http://localhost:51234/callback" })}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("program on your own computer");
  });

  it("the consent POST needs the CSRF pair, refuses a bad key, and honours a refusal", async () => {
    const query = authorizeQuery();
    const noCsrf = await app.request("http://localhost/oauth/authorize", {
      method: "POST", body: new URLSearchParams({ ...Object.fromEntries(query), api_key: primary, decision: "allow" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Forwarded-For": "10.8.0.1" },
    });
    expect(noCsrf.status).toBe(400);
    expect(noCsrf.headers.get("Location")).toBeNull();

    const badKey = await consent(query, { api_key: generateApiKey(), decision: "allow" });
    expect(badKey.status).toBe(401);
    expect(badKey.headers.get("Location")).toBeNull();

    const denied = await consent(query, { api_key: primary, decision: "deny" });
    expect(new URL(denied.headers.get("Location")!).searchParams.get("error")).toBe("access_denied");
    expect(await db.select().from(oauthAuthorizationCodes).where(eq(oauthAuthorizationCodes.userId, userId))).toHaveLength(0);
  });

  it("the consent page cannot be framed and shows the client host, not its self-chosen name", async () => {
    const res = await app.request(`http://localhost/oauth/authorize?${authorizeQuery()}`);
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    const html = await res.text();
    expect(html).toContain("Connect claude.ai to Strale");
    expect(html).not.toContain("Totally Claude");
    expect(fetchedCimd).toBe(1);
  });

  it("the token endpoint takes form bodies only and refuses client secrets", async () => {
    const json = await app.request("http://localhost/oauth/token", { method: "POST", body: JSON.stringify({ grant_type: "refresh_token" }), headers: { "Content-Type": "application/json" } });
    expect(json.status).toBe(400);
    const secret = await token({ grant_type: "refresh_token", refresh_token: "sto_rt_x", client_id: CLIENT_ID, client_secret: "s" });
    expect(secret.status).toBe(401);
    expect(await secret.json()).toMatchObject({ error: "invalid_client" });
    expect(await (await token({ grant_type: "password", client_id: CLIENT_ID })).json()).toMatchObject({ error: "unsupported_grant_type" });
  });

  it("dynamic registration accepts only Claude's callback and loopback", async () => {
    const reg = (redirect_uris: string[]) => app.request("http://localhost/oauth/register", { method: "POST", body: JSON.stringify({ client_name: "Test", redirect_uris }), headers: { "Content-Type": "application/json" } });
    expect((await reg(["https://evil.example/cb"])).status).toBe(400);
    expect((await reg(["http://evil.example/callback"])).status).toBe(400);
    const ok = await reg([REDIRECT]);
    expect(ok.status).toBe(201);
    const body = await ok.json();
    dcrClients.push(body.client_id);
    expect(body.client_id).toMatch(/^stc_[0-9a-f]{32}$/);
    const page = await app.request(`http://localhost/oauth/authorize?${authorizeQuery({ client_id: body.client_id })}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("name given by the app");
  });

  it("the connector challenges a protected call with 401 and runs a public one", async () => {
    const mcp = (body: unknown, auth?: string) => app.request("http://localhost/mcp/connector", {
      method: "POST", body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    });
    const balance = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "strale_balance", arguments: {} } };
    const challenged = await mcp(balance);
    expect(challenged.status).toBe(401);
    expect(challenged.headers.get("WWW-Authenticate")).toBe(`Bearer resource_metadata="${PROTECTED_RESOURCE_METADATA_URL}", scope="strale:tools"`);

    const ping = await mcp({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "strale_ping", arguments: {} } });
    expect(ping.status).toBe(200);

    const bad = await mcp(balance, "sto_at_" + "0".repeat(64));
    expect(bad.status).toBe(401);
    expect(bad.headers.get("WWW-Authenticate")).toContain('error="invalid_token"');

    const { exchanged } = await signIn();
    const { access_token } = await exchanged.json();
    const authed = await mcp({ jsonrpc: "2.0", id: 3, method: "tools/list" }, access_token);
    expect(authed.status).toBe(200);
    const listed = await authed.text();
    expect(listed).toContain("strale_balance");
    expect(listed).not.toContain("strale_web3_assurance");
  });
});
