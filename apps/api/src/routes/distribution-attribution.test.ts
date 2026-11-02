import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  extract: vi.fn((_req: unknown, meta: { src?: string }) => meta.src ? { src: meta.src } : null),
  writes: [] as Array<{ table: unknown; values: any }>,
  solution: vi.fn(),
  executor: vi.fn(async (_inputs: unknown) => ({ output: { valid: true } })),
}));
vi.mock("../lib/attribution.js", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/attribution.js")>(),
  recordDiscoveryHit: mocks.record,
  extractClientMeta: mocks.extract,
}));
vi.mock("strale-mcp/tools", async importOriginal => ({
  ...await importOriginal<typeof import("strale-mcp/tools")>(),
  fetchCapabilities: vi.fn(async () => []),
  fetchSolutions: vi.fn(async () => []),
  fetchTrustBatch: vi.fn(async () => new Map()),
  fetchSolutionTrust: vi.fn(async () => new Map()),
}));
vi.mock("../db/index.js", async () => {
  const { capabilities, solutions } = await import("../db/schema.js");
  const cap = {
    id: "fixture-id", slug: "fixture", name: "Fixture", description: "Test fixture",
    x402Method: "GET", priceCents: 0, transparencyTag: "algorithmic",
    inputSchema: { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
    outputSchema: { type: "object", properties: { valid: { type: "boolean" } } },
    isActive: true, x402Enabled: true, marketplaceEligible: true, visible: true, lifecycleState: "active",
  };
  return { getDb: () => ({
    select: () => ({ from: (table: unknown) => ({ where: () => {
      const rows = table === capabilities || table === solutions ? [cap] : [];
      return Object.assign(Promise.resolve(rows), { limit: async () => rows });
    } }) }),
    insert: (table: unknown) => ({ values: (values: any) => {
      mocks.writes.push({table, values});
      return { returning: async () => [] };
    } }),
  }) };
});
vi.mock("../capabilities/index.js", () => ({ getExecutor: () => mocks.executor }));
vi.mock("../capabilities/guarded-executor.js", async importOriginal => ({
  ...await importOriginal<typeof import("../capabilities/guarded-executor.js")>(),
  assertGuardedAllow: vi.fn(async () => undefined),
}));
vi.mock("../lib/invocation-facts.js", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/invocation-facts.js")>(),
  recordPaidInvocation: vi.fn(async () => undefined),
}));
vi.mock("../lib/solution-executor.js", () => ({ executeSolution: mocks.solution, stepsThatRan: () => [] }));
vi.mock("../lib/receipt/settle.js", () => ({ settleExecutionReceipt: vi.fn(async () => undefined) }));

import { mcpRoute } from "./mcp.js";
import { doRoute } from "./do.js";
import { x402GatewayV2, __resetX402CacheForTests, extractInputs } from "./x402-gateway-v2.js";
import { transactions } from "../db/schema.js";
import { executeCapability, registerStraleTools } from "strale-mcp/tools";
import { resolveDiscoverySource } from "../lib/discovery-source.js";

beforeEach(() => { vi.clearAllMocks(); mocks.writes.length = 0; __resetX402CacheForTests(); });
afterEach(() => vi.unstubAllGlobals());

const mcpRequest = (body: unknown) => new Hono().route("/mcp", mcpRoute).request("/mcp?src=mcp-registry", {
  method: "POST", headers: {"Content-Type":"application/json", Accept:"application/json, text/event-stream"},
  body: JSON.stringify(body),
});
describe("real distribution entry routes", () => {
  it("MCP initialize records the query src through the real transport", async () => {
    const res = await mcpRequest({jsonrpc:"2.0", id:1, method:"initialize", params:{protocolVersion:"2025-03-26", capabilities:{}, clientInfo:{name:"fixture", version:"1"}}});
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("protocolVersion");
    expect(mocks.record).toHaveBeenCalledWith("/mcp:initialize", expect.anything(), expect.objectContaining({src:"mcp-registry"}));
  });
  it("MCP rejection records src from the real tool callback", async () => {
    const res = await mcpRequest({jsonrpc:"2.0", id:2, method:"tools/call", params:{name:"strale_execute", arguments:{slug:"paid-fixture", inputs:{}}}});
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("pay_per_call");
    expect(mocks.record).toHaveBeenCalledWith("/mcp:reject:auth_rejected:strale_execute", expect.anything(), expect.objectContaining({src:"mcp-registry"}));
  });
  it("MCP execution forwards query src into the actual REST request", async () => {
    const fetchMock = vi.fn(async () => Response.json({result:{output:{valid:true}}}));
    vi.stubGlobal("fetch", fetchMock);
    const res = await mcpRequest({jsonrpc:"2.0", id:3, method:"tools/call", params:{name:"strale_execute", arguments:{slug:"email-validate", inputs:{email:"fixture@example.com"}}}});
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("valid");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/v1/do?src=mcp-registry"), expect.anything());
  });
  it("/v1/do passes query src to the real handler's metadata consumer", async () => {
    const res = await new Hono().route("/v1", doRoute).request("/v1/do?src=context7", {method:"POST", headers:{"Content-Type":"application/json"}, body:"{}"});
    expect(res.status).toBe(400);
    expect(mocks.extract).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({src:"context7"}));
    expect(mocks.extract.mock.results[0].value).toEqual({src:"context7"});
  });
  it("x402 catalog records query src", async () => {
    const res = await new Hono().route("/x402", x402GatewayV2).request("/x402/catalog?src=context7");
    expect(res.status).toBe(200);
    expect(mocks.record).toHaveBeenCalledWith("/x402/catalog", expect.anything(), expect.objectContaining({src:"context7"}));
  });
  it.each([false, true])("x402 execution records src on the transaction (failure=%s), excluding tracking inputs", async failure => {
    if (failure) mocks.executor.mockRejectedValueOnce(new Error("fixture failure"));
    const res = await new Hono().route("/x402", x402GatewayV2).request("/x402/fixture?value=hello&src=context7&utm_source=listing&utm_campaign=example&utm_custom=private");
    expect(res.status).toBe(failure ? 400 : 200);
    const write = mocks.writes.find(w => w.table === transactions);
    expect(write).toBeDefined();
    expect(write!.values.clientMeta).toEqual({src:"context7"});
    expect(write!.values.input).toEqual({value:"hello"});
    expect(mocks.executor).toHaveBeenCalledWith({value:"hello"});
  });
  it.each([false, true])("x402 solution records src on the transaction (gated=%s)", async gated => {
    mocks.solution.mockResolvedValueOnce({steps: gated ? {} : {fixture:{valid:true}}, errors:[], gated, latency_ms:1, step_count:1});
    const res = await new Hono().route("/x402", x402GatewayV2).request("/x402/solutions/fixture?value=hello&src=context7&utm_source=listing");
    expect(res.status).toBe(gated ? 502 : 200);
    const write = mocks.writes.find(w => w.table === transactions);
    expect(write).toBeDefined();
    expect(write!.values.clientMeta).toEqual({src:"context7"});
    expect(write!.values.input).toEqual({value:"hello"});
  });
  it.each([null, {type:"object",properties:{value:{type:"integer"}}}])("GET input extraction drops tracking fields with schema %j", async schema => {
    const app = new Hono().get("/", async c => c.json(await extractInputs(c, schema)));
    const res = await app.request("/?value=7&src=skill&utm_source=listing&utm_medium=example&utm_custom=private");
    expect(await res.json()).toEqual({value:schema ? 7 : "7"});
  });
});

describe("MCP distribution contracts", () => {
  it("preserves source on an x402 handoff", async () => {
    const refusal = await executeCapability("paid-fixture", {}, {baseUrl:"https://example.test",apiKey:"",maxPriceCents:100,src:"mcp-registry"});
    expect(new URL(JSON.parse(refusal.content[0].text).pay_per_call.endpoint).searchParams.get("src")).toBe("mcp-registry");
  });
  it("all tools have titles and honest wallet-aware annotations", () => {
    const tools: {name:string;config:any}[]=[];
    registerStraleTools({registerTool:(name:string, config:any) => tools.push({name,config})} as any, [], [], {baseUrl:"https://example.test",apiKey:"",maxPriceCents:100});
    expect(tools).toHaveLength(9);
    for (const {name,config} of tools) {
      expect(config.title.length).toBeGreaterThan(0);
      expect(Object.keys(config.annotations).sort()).toEqual(["destructiveHint","idempotentHint","openWorldHint","readOnlyHint"]);
      expect(config.annotations.readOnlyHint).toBe(name!=="strale_execute");
      expect(config.annotations.idempotentHint).toBe(name!=="strale_execute");
    }
  });
  it.each([["https://claude.com/connectors/strale","claude-dir"],["https://context7.com/strale","context7"],["https://registry.modelcontextprotocol.io","mcp-registry"],["https://402index.com","402-index"],["https://pipedream.com","pipedream"]])("recognises %s", (referer,tag) => {
    expect(resolveDiscoverySource({referer})).toEqual({tag,basis:"referer"});
  });
});
