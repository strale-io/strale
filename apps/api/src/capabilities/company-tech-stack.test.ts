/**
 * company-tech-stack: the deterministic signature layer next to the model's
 * summary. The model is stubbed; what is asserted is the merge — signature
 * matches (with versions and evidence) come first, the model's extra names
 * follow, no name is listed twice, empty summary fields are filled from the
 * matches, and the existing output fields keep their shape.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { safeFetchMock, fetchRenderedHtml, extractJsonWithLlm, lookupTechDns } = vi.hoisted(() => ({
  safeFetchMock: vi.fn(),
  fetchRenderedHtml: vi.fn(),
  extractJsonWithLlm: vi.fn(),
  lookupTechDns: vi.fn(),
}));

vi.mock("../lib/safe-fetch.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/safe-fetch.js")>()),
  safeFetch: safeFetchMock,
}));
vi.mock("./lib/browserless-extract.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchRenderedHtml,
}));
vi.mock("./lib/llm-extract.js", () => ({ extractJsonWithLlm }));
vi.mock("../lib/anthropic-client.js", () => ({ createAnthropicClient: () => ({}) }));
vi.mock("./lib/tech-dns.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/tech-dns.js")>()),
  lookupTechDns,
}));

import { getDirectExecutor } from "./index.js";
import "./company-tech-stack.js";

const PAGE = `<html><head>
  <meta name="generator" content="WordPress 6.4.2">
  <script src="https://js.hs-scripts.com/1.js"></script>
  <script src="https://cdn.segment.com/analytics.js/v1/x/analytics.min.js"></script>
</head><body></body></html>`;

function okDns(overrides: Record<string, unknown> = {}) {
  return {
    a: ["192.0.2.1"],
    mx: [{ exchange: "aspmx.l.google.com", priority: 1 }],
    txt: ["v=spf1 include:_spf.google.com ~all"],
    ns: ["ada.ns.cloudflare.com"],
    cname: [],
    status: { a: "ok", mx: "ok", txt: "ok", ns: "ok", cname: "empty" },
    overall: "ok",
    failures: [],
    ...overrides,
  };
}

async function run() {
  const exec = getDirectExecutor("company-tech-stack");
  expect(exec).toBeDefined();
  return (await exec!({ domain: "site.test" })).output as Record<string, any>;
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  safeFetchMock.mockReset();
  fetchRenderedHtml.mockReset();
  extractJsonWithLlm.mockReset();
  lookupTechDns.mockReset();
  fetchRenderedHtml.mockResolvedValue(PAGE);
  safeFetchMock.mockImplementation(async () => new Response(null, { status: 200, headers: { server: "nginx/1.25.3", "cf-ray": "abc" } }));
  lookupTechDns.mockResolvedValue(okDns());
  extractJsonWithLlm.mockResolvedValue({
    domain: "site.test",
    frontend_framework: null,
    cdn: null,
    analytics: ["Heap"],
    email_provider: null,
    chat_widget: null,
    payment_processor: null,
    detected_technologies: [
      { name: "WordPress", category: "CMS", confidence: "high" },
      { name: "Segment", category: "analytics", confidence: "high" },
      { name: "Some Niche Widget", category: "widget", confidence: "medium" },
    ],
  });
});

describe("company-tech-stack signature layer", () => {
  it("lists signature matches first, with versions, then only the model's extra names", async () => {
    const output = await run();
    const list = output.detected_technologies as Array<{ name: string; version: string | null; evidence: string }>;
    const names = list.map((t) => t.name);

    expect(names.indexOf("Nginx")).toBeGreaterThanOrEqual(0);
    expect(list.find((t) => t.name === "Nginx")?.version).toBe("1.25.3");
    expect(list.find((t) => t.name === "WordPress")?.version).toBe("6.4.2");
    expect(list.find((t) => t.name === "HubSpot")).toBeDefined();
    expect(list.find((t) => t.name === "Google Workspace")?.evidence).toBe("DNS MX record aspmx.l.google.com");

    // The model's WordPress and Segment are already covered; its niche widget is kept, last.
    expect(names.filter((n) => n === "WordPress")).toHaveLength(1);
    expect(names.filter((n) => n === "Segment")).toHaveLength(1);
    expect(names[names.length - 1]).toBe("Some Niche Widget");
    expect(list[list.length - 1]).toMatchObject({ version: null, evidence: expect.stringMatching(/AI analysis/) });
  });

  it("fills summary fields the model left empty and merges analytics", async () => {
    const output = await run();
    expect(output.cdn).toBe("Cloudflare");
    expect(output.email_provider).toBe("Google Workspace");
    expect(output.analytics).toEqual(expect.arrayContaining(["Heap", "Segment"]));
    expect(new Set(output.analytics).size).toBe(output.analytics.length);
  });

  it("does not overwrite a summary field the model filled", async () => {
    extractJsonWithLlm.mockResolvedValue({ domain: "site.test", cdn: "Fastly", analytics: [], detected_technologies: [] });
    const output = await run();
    expect(output.cdn).toBe("Fastly");
  });

  it("keeps the dns_records shape and adds ns, a DNS status and the coverage note", async () => {
    const output = await run();
    expect(output.dns_records).toEqual({
      a: ["192.0.2.1"],
      mx: [{ exchange: "aspmx.l.google.com", priority: 1 }],
      txt: ["v=spf1 include:_spf.google.com ~all"],
      cname: [],
      ns: ["ada.ns.cloudflare.com"],
    });
    expect(output.dns_status).toEqual({ status: "ok", failed_lookups: [] });
    expect(output.warnings).toEqual([]);
    expect(output.coverage_note).toMatch(/not every technology/);
    expect(output.http_headers_analyzed).toEqual(expect.arrayContaining(["server: nginx/1.25.3"]));
  });

  it("states a DNS fault in the result", async () => {
    lookupTechDns.mockResolvedValue(okDns({
      mx: [], txt: [], ns: [],
      status: { a: "ok", mx: "failed", txt: "failed", ns: "failed", cname: "failed" },
      overall: "partial",
      failures: [{ type: "MX", code: "ETIMEOUT" }],
    }));
    const output = await run();
    expect(output.dns_status.status).toBe("partial");
    expect(output.warnings[0]).toMatch(/DNS lookups failed \(MX: ETIMEOUT\)/);
  });

  it("states a failed HEAD request in warnings instead of silently dropping header signals", async () => {
    safeFetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const output = await run();
    expect(output.warnings.join(" ")).toMatch(/HEAD request for response headers failed \(fetch failed\)/);
    expect(output.detected_technologies.map((t: { name: string }) => t.name)).not.toContain("Nginx");
    expect(output.detected_technologies.map((t: { name: string }) => t.name)).toContain("WordPress");
  });

  it("states a refused HEAD request in warnings", async () => {
    safeFetchMock.mockImplementation(async () => new Response(null, { status: 405, headers: { server: "nginx" } }));
    const output = await run();
    expect(output.warnings.join(" ")).toMatch(/HEAD request for response headers answered HTTP 405/);
  });

  it("has no warnings when HEAD and DNS both work", async () => {
    expect((await run()).warnings).toEqual([]);
  });

  it("passes the signature matches to the model so its summary agrees with them", async () => {
    await run();
    const prompt = extractJsonWithLlm.mock.calls[0][0].prompt as string;
    expect(prompt).toMatch(/Already identified by signature matching[^\n]*WordPress 6\.4\.2/);
    expect(prompt).toMatch(/Already identified by signature matching[^\n]*Google Workspace/);
  });

  it("an upstream page failure is an error, not an empty analysis", async () => {
    fetchRenderedHtml.mockRejectedValue(new Error("render failed"));
    const exec = getDirectExecutor("company-tech-stack")!;
    await expect(exec({ domain: "site.test" })).rejects.toThrow(/render failed/);
    expect(extractJsonWithLlm).not.toHaveBeenCalled();
  });
});
