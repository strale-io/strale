import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenapiClient } from "./client.js";

vi.mock("../../safe-fetch.js", () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from "../../safe-fetch.js";

const safeFetchMock = vi.mocked(safeFetch);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function tokenResponse(token: string, expireUnixSec: number): Response {
  return jsonResponse(200, {
    token,
    expire: expireUnixSec,
    scopes: ["*:test.company.openapi.com/*"],
    success: true,
    message: "",
    error: null,
  });
}

function farFutureExpire(): number {
  return Math.floor(Date.now() / 1000) + 3600;
}

function setSandboxEnv(): void {
  process.env.OPENAPI_COM_API_TOKEN_SANDBOX = "sand-key-abc";
  process.env.OPENAPI_COM_EMAIL = "test@strale.io";
}
function setProdEnv(): void {
  process.env.OPENAPI_COM_API_TOKEN_PROD = "prod-key-xyz";
  process.env.OPENAPI_COM_EMAIL = "test@strale.io";
}

function urlOf(callIdx: number): string {
  return safeFetchMock.mock.calls[callIdx]![0] as string;
}
function initOf(callIdx: number): RequestInit {
  return safeFetchMock.mock.calls[callIdx]![1] as RequestInit;
}
function headerOf(callIdx: number, name: string): string | undefined {
  const h = initOf(callIdx).headers as Record<string, string>;
  return h[name];
}

describe("OpenapiClient", () => {
  beforeEach(() => {
    safeFetchMock.mockReset();
    delete process.env.OPENAPI_COM_API_TOKEN_SANDBOX;
    delete process.env.OPENAPI_COM_API_TOKEN_PROD;
    delete process.env.OPENAPI_COM_EMAIL;
  });

  afterEach(() => {
    delete process.env.OPENAPI_COM_API_TOKEN_SANDBOX;
    delete process.env.OPENAPI_COM_API_TOKEN_PROD;
    delete process.env.OPENAPI_COM_EMAIL;
  });

  describe("constructor / required env vars", () => {
    it("reads OPENAPI_COM_API_TOKEN_SANDBOX when mode = sandbox", () => {
      setSandboxEnv();
      const client = new OpenapiClient("sandbox");
      expect(client.getMode()).toBe("sandbox");
    });

    it("reads OPENAPI_COM_API_TOKEN_PROD when mode = production", () => {
      setProdEnv();
      const client = new OpenapiClient("production");
      expect(client.getMode()).toBe("production");
    });

    it("does NOT cross-read tokens — sandbox mode ignores prod env var", () => {
      process.env.OPENAPI_COM_API_TOKEN_PROD = "prod-key-xyz";
      process.env.OPENAPI_COM_EMAIL = "test@strale.io";
      expect(() => new OpenapiClient("sandbox")).toThrow(
        /OPENAPI_COM_API_TOKEN_SANDBOX/,
      );
    });

    it("does NOT cross-read tokens — production mode ignores sandbox env var", () => {
      process.env.OPENAPI_COM_API_TOKEN_SANDBOX = "sand-key-abc";
      process.env.OPENAPI_COM_EMAIL = "test@strale.io";
      expect(() => new OpenapiClient("production")).toThrow(
        /OPENAPI_COM_API_TOKEN_PROD/,
      );
    });

    it("throws when sandbox env var is whitespace-only", () => {
      process.env.OPENAPI_COM_API_TOKEN_SANDBOX = "   ";
      process.env.OPENAPI_COM_EMAIL = "test@strale.io";
      expect(() => new OpenapiClient("sandbox")).toThrow(
        /OPENAPI_COM_API_TOKEN_SANDBOX/,
      );
    });

    it("throws when OPENAPI_COM_EMAIL is missing", () => {
      process.env.OPENAPI_COM_API_TOKEN_SANDBOX = "sand-key-abc";
      // email unset
      expect(() => new OpenapiClient("sandbox")).toThrow(/OPENAPI_COM_EMAIL/);
    });
  });

  describe("hostname selection by mode", () => {
    it("sandbox mode → API host test.company.openapi.com, OAuth host test.oauth.openapi.it", () => {
      setSandboxEnv();
      const c = new OpenapiClient("sandbox");
      expect(c.getApiBase()).toBe("https://test.company.openapi.com");
      expect(c.getOauthBase()).toBe("https://test.oauth.openapi.it");
    });

    it("production mode → API host company.openapi.com, OAuth host oauth.openapi.it", () => {
      setProdEnv();
      const c = new OpenapiClient("production");
      expect(c.getApiBase()).toBe("https://company.openapi.com");
      expect(c.getOauthBase()).toBe("https://oauth.openapi.it");
    });
  });

  describe("OAuth token mint", () => {
    it("first API call mints a token first, then issues the API request", async () => {
      setSandboxEnv();
      safeFetchMock
        .mockResolvedValueOnce(tokenResponse("minted-token-1", farFutureExpire())) // mint
        .mockResolvedValueOnce(jsonResponse(200, { ok: true }));                    // API

      await new OpenapiClient("sandbox").wwStart("IT", "12485671007");

      // Call 0: token mint
      expect(urlOf(0)).toBe("https://test.oauth.openapi.it/token");
      expect(initOf(0).method).toBe("POST");
      const expectedBasic = Buffer.from("test@strale.io:sand-key-abc").toString(
        "base64",
      );
      expect(headerOf(0, "Authorization")).toBe(`Basic ${expectedBasic}`);
      expect(headerOf(0, "Content-Type")).toBe("application/json");
      expect(JSON.parse(initOf(0).body as string)).toEqual({
        scopes: ["*:test.company.openapi.com/*"],
        ttl: 3600,
      });

      // Call 1: actual API request with minted Bearer
      expect(urlOf(1)).toBe("https://test.company.openapi.com/WW-start/IT/12485671007");
      expect(initOf(1).method).toBe("GET");
      expect(headerOf(1, "Authorization")).toBe("Bearer minted-token-1");
    });

    it("production mode mints with production scope and OAuth host", async () => {
      setProdEnv();
      safeFetchMock
        .mockResolvedValueOnce(tokenResponse("prod-tok", farFutureExpire()))
        .mockResolvedValueOnce(jsonResponse(200, {}));

      await new OpenapiClient("production").wwStart("IT", "12485671007");

      expect(urlOf(0)).toBe("https://oauth.openapi.it/token");
      expect(JSON.parse(initOf(0).body as string)).toEqual({
        scopes: ["*:company.openapi.com/*"],
        ttl: 3600,
      });
      expect(urlOf(1)).toBe("https://company.openapi.com/WW-start/IT/12485671007");
      expect(headerOf(1, "Authorization")).toBe("Bearer prod-tok");
    });

    it("propagates token-mint failure as ok:false / error:'infra'", async () => {
      setSandboxEnv();
      safeFetchMock.mockResolvedValueOnce(jsonResponse(401, { msg: "bad creds" }));

      const r = await new OpenapiClient("sandbox").wwStart("IT", "1");
      expect(r.ok).toBe(false);
      expect(r.error).toBe("infra");
      expect(safeFetchMock).toHaveBeenCalledTimes(1); // mint failed → no API call
    });

    it("propagates token-mint malformed-response as ok:false / error:'infra'", async () => {
      setSandboxEnv();
      safeFetchMock.mockResolvedValueOnce(jsonResponse(200, { not: "a token" }));

      const r = await new OpenapiClient("sandbox").wwStart("IT", "1");
      expect(r.error).toBe("infra");
    });
  });

  describe("token cache", () => {
    it("reuses cached token across multiple API calls", async () => {
      setSandboxEnv();
      safeFetchMock
        .mockResolvedValueOnce(tokenResponse("cached-tok", farFutureExpire()))
        .mockResolvedValueOnce(jsonResponse(200, {}))
        .mockResolvedValueOnce(jsonResponse(200, {}))
        .mockResolvedValueOnce(jsonResponse(200, {}));

      const client = new OpenapiClient("sandbox");
      await client.wwStart("IT", "1");
      await client.wwAdvanced("FR", "2");
      await client.countryStart("DE", "3");

      // 1 mint + 3 API calls = 4 total
      expect(safeFetchMock).toHaveBeenCalledTimes(4);
      expect(urlOf(0)).toBe("https://test.oauth.openapi.it/token");
      expect(headerOf(1, "Authorization")).toBe("Bearer cached-tok");
      expect(headerOf(2, "Authorization")).toBe("Bearer cached-tok");
      expect(headerOf(3, "Authorization")).toBe("Bearer cached-tok");
    });

    it("refreshes when cached token is within 60s of expiry", async () => {
      setSandboxEnv();
      const nowSec = Math.floor(Date.now() / 1000);
      // first mint returns token expiring in 30s — inside the 60s buffer
      safeFetchMock
        .mockResolvedValueOnce(tokenResponse("expiring-soon", nowSec + 30))
        .mockResolvedValueOnce(jsonResponse(200, {}))
        // second API call should re-mint because (expire - now) < 60
        .mockResolvedValueOnce(tokenResponse("fresh-tok", farFutureExpire()))
        .mockResolvedValueOnce(jsonResponse(200, {}));

      const client = new OpenapiClient("sandbox");
      await client.wwStart("IT", "1");
      await client.wwStart("IT", "2");

      expect(safeFetchMock).toHaveBeenCalledTimes(4);
      expect(urlOf(0)).toBe("https://test.oauth.openapi.it/token");
      expect(headerOf(1, "Authorization")).toBe("Bearer expiring-soon");
      expect(urlOf(2)).toBe("https://test.oauth.openapi.it/token");
      expect(headerOf(3, "Authorization")).toBe("Bearer fresh-tok");
    });

    it("does NOT refresh when cached token has > 60s of life", async () => {
      setSandboxEnv();
      const nowSec = Math.floor(Date.now() / 1000);
      safeFetchMock
        .mockResolvedValueOnce(tokenResponse("good-tok", nowSec + 300)) // 5 minutes
        .mockResolvedValueOnce(jsonResponse(200, {}))
        .mockResolvedValueOnce(jsonResponse(200, {}));

      const client = new OpenapiClient("sandbox");
      await client.wwStart("IT", "1");
      await client.wwStart("IT", "2");

      expect(safeFetchMock).toHaveBeenCalledTimes(3); // 1 mint + 2 API
      expect(headerOf(1, "Authorization")).toBe("Bearer good-tok");
      expect(headerOf(2, "Authorization")).toBe("Bearer good-tok");
    });
  });

  describe("URL construction", () => {
    beforeEach(() => {
      setSandboxEnv();
      safeFetchMock.mockResolvedValue(tokenResponse("tok", farFutureExpire()));
    });

    async function callAndGetApiUrl(
      fn: (c: OpenapiClient) => Promise<unknown>,
    ): Promise<string> {
      safeFetchMock.mockReset();
      safeFetchMock
        .mockResolvedValueOnce(tokenResponse("tok", farFutureExpire()))
        .mockResolvedValueOnce(jsonResponse(200, {}));
      await fn(new OpenapiClient("sandbox"));
      return urlOf(1); // index 0 is mint, 1 is API
    }

    it("wwStart: /WW-start/{COUNTRY}/{identifier}", async () => {
      const url = await callAndGetApiUrl((c) => c.wwStart("it", "12485671007"));
      expect(url).toBe("https://test.company.openapi.com/WW-start/IT/12485671007");
    });

    it("wwAdvanced: /WW-advanced/{COUNTRY}/{identifier}", async () => {
      const url = await callAndGetApiUrl((c) => c.wwAdvanced("fr", "883480147"));
      expect(url).toBe("https://test.company.openapi.com/WW-advanced/FR/883480147");
    });

    it("countryStart: /{CC}-start/{identifier}", async () => {
      const url = await callAndGetApiUrl((c) => c.countryStart("DE", "DE811115368"));
      expect(url).toBe("https://test.company.openapi.com/DE-start/DE811115368");
    });

    it("countryAdvanced: /{CC}-advanced/{identifier}", async () => {
      const url = await callAndGetApiUrl((c) => c.countryAdvanced("ES", "ESA81948077"));
      expect(url).toBe("https://test.company.openapi.com/ES-advanced/ESA81948077");
    });

    it("itStakeholders: /IT-stakeholders/{identifier}", async () => {
      const url = await callAndGetApiUrl((c) => c.itStakeholders("12485671007"));
      expect(url).toBe("https://test.company.openapi.com/IT-stakeholders/12485671007");
    });
  });

  describe("error classification", () => {
    beforeEach(() => {
      setSandboxEnv();
    });

    async function callWithApiStatus(status: number, body: unknown = {}) {
      safeFetchMock.mockReset();
      safeFetchMock
        .mockResolvedValueOnce(tokenResponse("tok", farFutureExpire()))
        .mockResolvedValueOnce(jsonResponse(status, body));
      return new OpenapiClient("sandbox").wwStart("IT", "1");
    }

    it("200 → ok, no error", async () => {
      const r = await callWithApiStatus(200, { id: "x" });
      expect(r.ok).toBe(true);
      expect(r.error).toBeNull();
      expect(r.body).toEqual({ id: "x" });
    });

    it("401 → auth", async () => {
      const r = await callWithApiStatus(401);
      expect(r.error).toBe("auth");
    });

    it("402 → credit", async () => {
      const r = await callWithApiStatus(402);
      expect(r.error).toBe("credit");
    });

    it("404 → not_found", async () => {
      const r = await callWithApiStatus(404);
      expect(r.error).toBe("not_found");
    });

    it("429 → rate_limit", async () => {
      const r = await callWithApiStatus(429);
      expect(r.error).toBe("rate_limit");
    });

    it("503 → upstream", async () => {
      const r = await callWithApiStatus(503);
      expect(r.error).toBe("upstream");
    });

    it("network throw on API call → infra", async () => {
      safeFetchMock.mockReset();
      safeFetchMock
        .mockResolvedValueOnce(tokenResponse("tok", farFutureExpire()))
        .mockRejectedValueOnce(new Error("ECONNRESET"));
      const r = await new OpenapiClient("sandbox").wwStart("IT", "1");
      expect(r.error).toBe("infra");
      expect(r.status).toBe(0);
    });

    it("non-JSON body → body=null but status preserved", async () => {
      safeFetchMock.mockReset();
      safeFetchMock
        .mockResolvedValueOnce(tokenResponse("tok", farFutureExpire()))
        .mockResolvedValueOnce(new Response("<html>error</html>", { status: 502 }));
      const r = await new OpenapiClient("sandbox").wwStart("IT", "1");
      expect(r.body).toBeNull();
      expect(r.error).toBe("upstream");
    });
  });

  describe("result metadata", () => {
    beforeEach(() => setSandboxEnv());

    it("tags result with mode/endpoint/country/identifier", async () => {
      safeFetchMock
        .mockResolvedValueOnce(tokenResponse("tok", farFutureExpire()))
        .mockResolvedValueOnce(jsonResponse(200, {}));
      const r = await new OpenapiClient("sandbox").countryAdvanced("PT", "PT500273170");
      expect(r.mode).toBe("sandbox");
      expect(r.endpoint).toBe("PT-advanced");
      expect(r.country).toBe("PT");
      expect(r.identifier).toBe("PT500273170");
    });

    it("itStakeholders pins country to IT", async () => {
      safeFetchMock
        .mockResolvedValueOnce(tokenResponse("tok", farFutureExpire()))
        .mockResolvedValueOnce(jsonResponse(200, {}));
      const r = await new OpenapiClient("sandbox").itStakeholders("12485671007");
      expect(r.country).toBe("IT");
      expect(r.endpoint).toBe("IT-stakeholders");
    });
  });
});
