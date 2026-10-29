/** Pure parts of the connector's OAuth server; the DB flow is oauth.integration.test.ts. */
import { afterEach, describe, expect, it } from "vitest";
import { grantedScope, redirectUriMatches, verifyPkceS256, isValidCodeChallenge } from "./oauth.js";
import { cimdUrlAllowed, registrableRedirectUri, resolveClient, setCimdFetcherForTests } from "./oauth-clients.js";

describe("PKCE S256", () => {
  // RFC 7636 Appendix B.
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  it("accepts the RFC test vector and nothing else", () => {
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
    expect(verifyPkceS256(verifier.replace(/.$/, "j"), challenge)).toBe(false);
    expect(verifyPkceS256(challenge, challenge)).toBe(false); // "plain" is not S256
    expect(verifyPkceS256("short", challenge)).toBe(false);
    expect(verifyPkceS256(`${verifier}!`, challenge)).toBe(false);
  });
  it("only a 43-character base64url value is a challenge", () => {
    expect(isValidCodeChallenge(challenge)).toBe(true);
    expect(isValidCodeChallenge(`${challenge}=`)).toBe(false);
    expect(isValidCodeChallenge("")).toBe(false);
  });
});

describe("redirect URI matching", () => {
  const registered = ["https://claude.ai/api/mcp/auth_callback", "http://localhost/callback", "http://127.0.0.1/callback"];
  it("matches exactly, or loopback on any port", () => {
    expect(redirectUriMatches("https://claude.ai/api/mcp/auth_callback", registered)).toBe(true);
    expect(redirectUriMatches("http://localhost:3118/callback", registered)).toBe(true);
    expect(redirectUriMatches("http://127.0.0.1:50000/callback", registered)).toBe(true);
  });
  it("refuses anything else", () => {
    for (const uri of [
      "https://claude.ai/api/mcp/auth_callback/",
      "https://claude.ai/api/mcp/auth_callback?x=1",
      "https://claude.ai/api/mcp/auth_callback#f",
      "https://claude.ai:8443/api/mcp/auth_callback",
      "https://user@claude.ai/api/mcp/auth_callback",
      "http://localhost:3118/other",
      "http://localhost.evil.example/callback",
      "https://localhost:3118/callback",
      "http://[::1]:3118/callback",
      "not a url",
    ]) expect(redirectUriMatches(uri, registered), uri).toBe(false);
  });
});

describe("scope", () => {
  it("grants strale:tools for the scopes Claude sends and refuses others", () => {
    expect(grantedScope(undefined)).toBe("strale:tools");
    expect(grantedScope("strale:tools offline_access")).toBe("strale:tools");
    expect(grantedScope("strale:tools admin")).toBeNull();
    expect(grantedScope("openid")).toBeNull();
  });
});

describe("Client ID Metadata Documents", () => {
  afterEach(() => setCimdFetcherForTests(null));
  const id = "https://claude.ai/oauth/claude-code-client-metadata";
  const doc = (over: Record<string, unknown> = {}) => JSON.stringify({
    client_id: id, token_endpoint_auth_method: "none", redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"], ...over,
  });

  it("fetches only https documents on Claude's hosts", () => {
    expect(cimdUrlAllowed(id)).toBe(true);
    for (const bad of ["http://claude.ai/x", "https://claude.ai.evil.example/x", "https://evil.example/x", "https://claude.ai:444/x", "https://u@claude.ai/x", "https://claude.ai/"]) {
      expect(cimdUrlAllowed(bad), bad).toBe(false);
    }
  });

  it("asks fetch not to follow redirects, and accepts Claude Code's real document", async () => {
    let init: RequestInit | undefined;
    setCimdFetcherForTests(async (_u, i) => { init = i; return new Response(doc()); });
    const client = await resolveClient(id);
    expect(init?.redirect).toBe("error");
    expect(client).toMatchObject({ kind: "cimd", displayName: "claude.ai", redirectUris: ["http://localhost/callback", "http://127.0.0.1/callback"] });
  });

  it("refuses a document that names another client, a secret, or a foreign redirect only", async () => {
    for (const body of [
      doc({ client_id: "https://claude.ai/oauth/other" }),
      doc({ token_endpoint_auth_method: "client_secret_basic" }),
      doc({ redirect_uris: ["https://evil.example/cb"] }),
      "not json",
      "x".repeat(20_000),
    ]) {
      setCimdFetcherForTests(async () => new Response(body));
      expect(await resolveClient(id)).toBeNull();
    }
    setCimdFetcherForTests(async () => new Response(doc(), { status: 500 }));
    expect(await resolveClient(id)).toBeNull();
  });

  it("drops foreign-origin redirects from a valid document", async () => {
    setCimdFetcherForTests(async () => new Response(doc({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback", "https://evil.example/cb"] })));
    expect((await resolveClient(id))?.redirectUris).toEqual(["https://claude.ai/api/mcp/auth_callback"]);
  });

  it("never fetches a host outside the list", async () => {
    let called = false;
    setCimdFetcherForTests(async () => { called = true; return new Response(doc({ client_id: "https://evil.example/c" })); });
    expect(await resolveClient("https://evil.example/c")).toBeNull();
    expect(called).toBe(false);
  });
});

describe("dynamic registration redirect URIs", () => {
  it("allows only Claude's hosted callback and loopback", () => {
    expect(registrableRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(registrableRedirectUri("http://127.0.0.1:9000/cb")).toBe(true);
    for (const bad of ["https://evil.example/cb", "http://evil.example/cb", "https://claude.ai/other", "http://localhost/cb#x", 42]) {
      expect(registrableRedirectUri(bad), String(bad)).toBe(false);
    }
  });
});
