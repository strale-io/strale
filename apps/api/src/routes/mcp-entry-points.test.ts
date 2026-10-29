/**
 * Narrow MCP entry points (distribution D7) through the real /mcp route and
 * the real MCP SDK transport. The catalogue fetch and the discovery-hit writer
 * are the only seams mocked; tool registration, execution and the REST
 * forwarding are the shipped code.
 *
 * What D7's success and kill rule needs from this code: each entry point's
 * funnel rows are labelled /mcp/<id>:… (never the broad server's /mcp:…), and
 * every forwarded call and x402 hand-off carries src=mcp-<id>.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const mocks = vi.hoisted(() => ({ record: vi.fn() }));

vi.mock("../lib/attribution.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/attribution.js")>()),
  recordDiscoveryHit: mocks.record,
}));

const CATALOG = [
  { slug: "uk-company-data", name: "UK Company Data", description: "Look up a UK company.", category: "company-data", price_cents: 5, is_free_tier: false,
    input_schema: { type: "object", properties: { company_number: { type: "string" } } }, output_schema: null },
  { slug: "vat-validate", name: "VAT Validate", description: "Check a VAT number.", category: "validation", price_cents: 2, is_free_tier: false,
    input_schema: { type: "object", required: ["vat_number"], properties: { vat_number: { type: "string" } } }, output_schema: null },
  { slug: "iban-validate", name: "IBAN Validate", description: "Check an IBAN.", category: "validation", price_cents: 5, is_free_tier: true,
    input_schema: { type: "object", required: ["iban"], properties: { iban: { type: "string" } } }, output_schema: null },
  { slug: "url-to-markdown", name: "URL to Markdown", description: "Turn a page into Markdown.", category: "web-scraping", price_cents: 5, is_free_tier: true,
    input_schema: { type: "object", required: ["url"], properties: { url: { type: "string" } } }, output_schema: null },
  { slug: "email-validate", name: "Email Validate", description: "Check an email.", category: "validation", price_cents: 3, is_free_tier: true,
    input_schema: { type: "object", required: ["email"], properties: { email: { type: "string" } } }, output_schema: null },
];

vi.mock("strale-mcp/tools", async (importOriginal) => ({
  ...(await importOriginal<typeof import("strale-mcp/tools")>()),
  fetchCapabilities: vi.fn(async () => CATALOG),
  fetchSolutions: vi.fn(async () => []),
  fetchTrustBatch: vi.fn(async () => new Map()),
  fetchSolutionTrust: vi.fn(async () => new Map()),
}));

import { mcpRoute } from "./mcp.js";
import { ENTRY_POINTS } from "strale-mcp/entry-points";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

const post = (path: string, body: unknown) =>
  new Hono().route("/mcp", mcpRoute).request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify(body),
  });

/** The SSE body carries one `data:` JSON-RPC message for these requests. */
async function rpcResult(res: Response): Promise<any> {
  const text = await res.text();
  const line = text.split("\n").find((l) => l.startsWith("data:"));
  return JSON.parse(line ? line.slice(5) : text).result;
}

const call = (path: string, name: string, args: Record<string, unknown>) =>
  post(path, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } });

describe("narrow MCP entry points", () => {
  it("serves only the entry point's own tools that the catalogue has, under its own server name", async () => {
    const init = await rpcResult(await post("/mcp/eu-vat-check", {
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "fixture", version: "1" } },
    }));
    expect(init.serverInfo.name).toBe("strale-eu-vat-check");

    const list = await rpcResult(await post("/mcp/eu-vat-check", { jsonrpc: "2.0", id: 2, method: "tools/list" }));
    const names = list.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(["vat-validate", "iban-validate"]);
    const paid = list.tools.find((t: { name: string }) => t.name === "vat-validate");
    expect(paid.annotations).toEqual({ readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true });
    expect(paid.description).toContain("€0.02 per call");
    const free = list.tools.find((t: { name: string }) => t.name === "iban-validate");
    expect(free.annotations.readOnlyHint).toBe(true);
    expect(free.description).toContain("no wallet debit");
  });

  it("labels funnel rows with the entry point and keeps the venue src on them", async () => {
    await post("/mcp/company-check?src=smithery", {
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "fixture", version: "1" } },
    });
    expect(mocks.record).toHaveBeenCalledWith("/mcp/company-check:initialize", expect.anything(), expect.objectContaining({ src: "smithery" }));
    expect(mocks.record).not.toHaveBeenCalledWith("/mcp:initialize", expect.anything(), expect.anything());
  });

  it("a paid tool without a key records an entry-labelled rejection and hands off to x402 tagged mcp-<id>", async () => {
    const res = await call("/mcp/company-check?src=mcp-registry", "uk-company-data", { company_number: "00000006" });
    const body = JSON.parse((await rpcResult(res)).content[0].text);
    expect(new URL(body.pay_per_call.endpoint).pathname).toBe("/x402/uk-company-data");
    // Remote agents must get a reachable host, not the API's internal localhost.
    expect(new URL(body.pay_per_call.endpoint).origin).toBe("https://api.strale.io");
    expect(new URL(body.pay_per_call.endpoint).searchParams.get("src")).toBe("mcp-company-check");
    expect(mocks.record).toHaveBeenCalledWith("/mcp/company-check:tools/call:uk-company-data", expect.anything(), expect.objectContaining({ src: "mcp-registry" }));
    expect(mocks.record).toHaveBeenCalledWith("/mcp/company-check:reject:auth_rejected:uk-company-data", expect.anything(), expect.objectContaining({ src: "mcp-registry" }));
  });

  it("forwards a call to /v1/do with src=mcp-<id> and the capability slug, without broad-server next steps", async () => {
    const fetchMock = vi.fn(async () => Response.json({ result: { output: { markdown: "# Fixture" }, transaction_id: "tx-1" } }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await call("/mcp/web-reader?src=smithery", "url-to-markdown", { url: "https://example.com" });
    const body = JSON.parse((await rpcResult(res)).content[0].text);
    expect(body.output.markdown).toBe("# Fixture");
    expect(body.next_steps).toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/v1/do");
    expect(new URL(url).searchParams.get("src")).toBe("mcp-web-reader");
    expect(JSON.parse(String(init.body)).capability_slug).toBe("url-to-markdown");
  });

  it("does not expose a capability outside the entry point", async () => {
    const fetchMock = vi.fn(async () => Response.json({ result: { output: {} } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await rpcResult(await call("/mcp/web-reader", "email-validate", { email: "fixture@example.com" }));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/email-validate not found/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown entry point and leaves the broad server on /mcp", async () => {
    const res = await post("/mcp/not-an-entry", { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(res.status).toBe(404);
    const broad = await rpcResult(await post("/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list" }));
    expect(broad.tools.map((t: { name: string }) => t.name)).toContain("strale_execute");
    expect(mocks.record).toHaveBeenCalledWith("/mcp:tools/list", expect.anything(), expect.anything());
  });

  it("gives every entry point a distinct id and an mcp-<id> attribution tag", () => {
    expect(new Set(ENTRY_POINTS.map((e) => e.id)).size).toBe(ENTRY_POINTS.length);
    expect(ENTRY_POINTS.length).toBeLessThanOrEqual(3);
    for (const e of ENTRY_POINTS) expect(e.src).toBe(`mcp-${e.id}`);
  });
});
