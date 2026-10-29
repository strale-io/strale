/**
 * The Claude connector at /mcp/connector (distribution D4), through the real
 * route and the real MCP SDK transport. Catalogue fetches and the REST calls
 * behind the tools are the only seams mocked.
 *
 * What the directory checks, asserted here: every tool has a title and a
 * readOnlyHint or destructiveHint; no crypto tool and no x402 hand-off is
 * offered; a call that needs the user's account is answered with HTTP 401
 * and a WWW-Authenticate challenge, never a 200 tool error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const mocks = vi.hoisted(() => ({ record: vi.fn() }));

vi.mock("../lib/attribution.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/attribution.js")>()),
  recordDiscoveryHit: mocks.record,
}));

const cap = (slug: string, category: string, is_free_tier: boolean) => ({
  slug, name: slug, description: `${slug} tool`, category, price_cents: 5, is_free_tier,
  input_schema: { type: "object", properties: { q: { type: "string" } } }, output_schema: null,
});
const CATALOG = [
  cap("vat-validate", "validation", false),
  cap("iban-validate", "validation", true),
  cap("eth-address-validate", "validation", true),
  cap("wallet-risk-score", "web3", false),
];
const SOLUTIONS = [
  { slug: "kyb-essentials-se", name: "KYB SE", description: "Bundle", category: "compliance", price_cents: 150, geography: "se", step_count: 3, capabilities: [] },
  { slug: "web3-pre-trade", name: "Pre-trade", description: "Bundle", category: "web3", price_cents: 50, geography: null, step_count: 3, capabilities: [] },
  { slug: "crypto-counterparty-kyb", name: "Crypto KYB", description: "Bundle", category: "compliance-verification", price_cents: 150, geography: null, step_count: 4, capabilities: [] },
];

vi.mock("strale-mcp/tools", async (importOriginal) => ({
  ...(await importOriginal<typeof import("strale-mcp/tools")>()),
  fetchCapabilities: vi.fn(async () => CATALOG),
  fetchSolutions: vi.fn(async () => SOLUTIONS),
  fetchTrustBatch: vi.fn(async () => new Map()),
  fetchSolutionTrust: vi.fn(async () => new Map()),
}));

import { connectorProtectedCall, mcpRoute } from "./mcp.js";

const fetchCalls: string[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  fetchCalls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    fetchCalls.push(String(url));
    if (String(url).includes("/v1/suggest/typeahead")) {
      return new Response(JSON.stringify({
        total: 2,
        results: [
          { type: "capability", slug: "vat-validate", name: "VAT", description: "d", category: "validation", price_cents: 2, geography: null },
          { type: "capability", slug: "wallet-risk-score", name: "Wallet", description: "d", category: "web3", price_cents: 5, geography: null },
        ],
      }));
    }
    if (String(url).includes("/v1/platform/facts")) {
      return new Response(JSON.stringify({ capability_counts: { active_visible: 300, free_tier_slugs: ["iban-validate", "eth-address-validate"] }, solution_count_active: 100 }));
    }
    return new Response(JSON.stringify({ result: { output: { valid: true }, transaction_id: "t1" } }));
  }));
});
afterEach(() => vi.unstubAllGlobals());

const post = (path: string, body: unknown, auth?: string) =>
  new Hono().route("/mcp", mcpRoute).request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: JSON.stringify(body),
  });

async function rpcResult(res: Response): Promise<any> {
  const text = await res.text();
  const line = text.split("\n").find((l) => l.startsWith("data:"));
  return JSON.parse(line ? line.slice(5) : text).result;
}

const call = (name: string, args: Record<string, unknown> = {}) => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });

describe("tool annotations the directory requires", () => {
  it.each(["/mcp", "/mcp/connector"])("every tool on %s has a title and a read-only or destructive hint", async (path) => {
    const { tools } = await rpcResult(await post(path, { jsonrpc: "2.0", id: 1, method: "tools/list" }));
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.name.length, tool.name).toBeLessThanOrEqual(64);
      expect(tool.title, tool.name).toBeTruthy();
      expect(typeof tool.annotations?.readOnlyHint === "boolean" || typeof tool.annotations?.destructiveHint === "boolean", tool.name).toBe(true);
      expect(tool.annotations.readOnlyHint && tool.annotations.destructiveHint, tool.name).toBeFalsy();
    }
  });

  it("the connector leaves out the on-chain tool and mentions no x402 or USDC", async () => {
    const { tools } = await rpcResult(await post("/mcp/connector", { jsonrpc: "2.0", id: 1, method: "tools/list" }));
    const names = tools.map((t: { name: string }) => t.name);
    expect(names).not.toContain("strale_web3_assurance");
    expect(names).toHaveLength(8);
    expect(JSON.stringify(tools)).not.toMatch(/x402|USDC/i);
  });
});

describe("lazy authentication on /mcp/connector", () => {
  it.each([
    ["a paid tool", call("strale_execute", { slug: "vat-validate", inputs: {} })],
    ["a bundle", call("strale_execute", { slug: "kyb-essentials-se", inputs: {} })],
    ["the balance", call("strale_balance")],
  ])("answers %s without a token with 401 and a challenge, before running it", async (_label, body) => {
    const res = await post("/mcp/connector", body);
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe(
      'Bearer resource_metadata="https://api.strale.io/.well-known/oauth-protected-resource/mcp/connector", scope="strale:tools"',
    );
    expect(fetchCalls.some((u) => u.includes("/v1/do"))).toBe(false);
    expect(mocks.record.mock.calls.some(([endpoint]) => String(endpoint).startsWith("/mcp/connector:reject:auth_challenge:"))).toBe(true);
  });

  it("runs a free tool without a token", async () => {
    const res = await post("/mcp/connector", call("strale_execute", { slug: "iban-validate", inputs: { iban: "x" } }));
    expect(res.status).toBe(200);
    const result = await rpcResult(res);
    expect(result.content[0].text).toContain("valid");
    expect(result.content[0].text).not.toContain("next_steps");
    expect(fetchCalls.some((u) => u.includes("/v1/do"))).toBe(true);
  });

  it("refuses a crypto tool by name or category without calling it", async () => {
    for (const slug of ["eth-address-validate", "wallet-risk-score", "web3-pre-trade", "crypto-counterparty-kyb"]) {
      fetchCalls.length = 0;
      const res = await post("/mcp/connector", call("strale_execute", { slug, inputs: {} }));
      expect(res.status).toBe(200);
      expect((await rpcResult(res)).content[0].text).toContain("not available in this connector");
      expect(fetchCalls.some((u) => u.includes("/v1/do"))).toBe(false);
    }
  });

  it("refuses a malformed bearer with invalid_token", async () => {
    const res = await post("/mcp/connector", call("strale_ping"), "nonsense");
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain('error="invalid_token"');
  });

  it("the broad /mcp keeps its x402 hand-off and never answers 401", async () => {
    const res = await post("/mcp", call("strale_execute", { slug: "vat-validate", inputs: {} }));
    expect(res.status).toBe(200);
    expect((await rpcResult(res)).content[0].text).toContain("/x402/v2/vat-validate");
  });
});

describe("connector-mode tool results", () => {
  it("getting started lists no crypto tool and offers sign-in, not x402", async () => {
    const text = (await rpcResult(await post("/mcp/connector", call("strale_getting_started")))).content[0].text;
    expect(text).toContain("iban-validate");
    expect(text).not.toContain("eth-address-validate");
    expect(text).not.toMatch(/x402|USDC/i);
    expect(text).toContain("Connect your Strale account");
  });

  it("search drops crypto results", async () => {
    const text = (await rpcResult(await post("/mcp/connector", call("strale_search", { query: "check" })))).content[0].text;
    expect(text).toContain("vat-validate");
    expect(text).not.toContain("wallet-risk-score");
    expect(JSON.parse(text).total_matches).toBe(1);
  });
});

describe("connectorProtectedCall", () => {
  const caps = CATALOG;
  it("finds a protected call anywhere in a batch and ignores the rest", () => {
    expect(connectorProtectedCall([{ method: "initialize" }, call("strale_balance")], caps, SOLUTIONS)).toBe("strale_balance");
    expect(connectorProtectedCall({ method: "tools/list" }, caps, SOLUTIONS)).toBeNull();
    expect(connectorProtectedCall(call("strale_execute", { slug: "no-such-tool" }), caps, SOLUTIONS)).toBeNull();
    expect(connectorProtectedCall(call("strale_execute", { slug: 5 }), caps, SOLUTIONS)).toBeNull();
    expect(connectorProtectedCall(call("strale_execute", { slug: "wallet-risk-score" }), caps, SOLUTIONS)).toBeNull();
    expect(connectorProtectedCall(null, caps, SOLUTIONS)).toBeNull();
  });
});
