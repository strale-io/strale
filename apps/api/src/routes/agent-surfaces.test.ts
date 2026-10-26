import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { compute, record } = vi.hoisted(() => ({ compute: vi.fn(), record: vi.fn() }));
vi.mock("../lib/platform-facts.js", () => ({ computePlatformFacts: compute }));
vi.mock("../lib/attribution.js", () => ({ recordDiscoveryHit: record }));
vi.mock("../lib/trial-eligibility.js", () => ({ TRIAL_CREDITS_CENTS: 731 }));
vi.mock("../lib/pricing-constants.js", () => ({ MIN_TOPUP_CENTS: 2345 }));

const facts = {
  capability_counts: { active_visible: 417, free_tier_slugs: ["test-free-a", "test-free-b"] },
  solution_count_active: 63,
  countries: { company_data_active_iso: ["SE", "US", "JP"] },
  price_floor_cents: 7,
};
const retired = /trust layer|can trust|quality[- ]scored|\bSQS\b|independently tested|verified data/i;

beforeEach(() => {
  vi.resetModules();
  compute.mockReset().mockResolvedValue(facts);
  vi.useRealTimers();
});

describe("public agent skill", () => {
  it("serves both URLs as cached Markdown with front matter and live facts", async () => {
    const { skillRoute } = await import("./skill.js");
    for (const path of ["/SKILL.md", "/.well-known/skill.md"]) {
      const response = await skillRoute.request(path);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
      expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
      const text = await response.text();
      expect(text).toMatch(/^---\nname: strale\ndescription: >\n/);
      expect(text).toContain('Triggers on: "validate"');
      expect(text).not.toMatch(retired);
      for (const value of ["417 tools", "63 bundled checks", "3 countries", "2 free-tier tools", "test-free-a", "test-free-b", "€0.07", "€7.31", "€23.45", "/v1/do", "/v1/capabilities", "/v1/suggest", "/x402/catalog"]) {
        expect(text).toContain(value);
      }
    }
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("changes all catalogue figures when facts change and handles an empty paid catalogue", async () => {
    compute.mockResolvedValue({ ...facts, capability_counts: { active_visible: 823, free_tier_slugs: [] }, solution_count_active: 91, countries: { company_data_active_iso: ["SE"] }, price_floor_cents: null });
    const { skillRoute } = await import("./skill.js");
    const text = await (await skillRoute.request("/SKILL.md")).text();
    expect(text).toContain("823 tools and 91 bundled checks");
    expect(text).toContain("1 countries");
    expect(text).toContain("0 free-tier tools: none currently listed");
    expect(text).toContain("No paid-tool price floor is currently available");
    expect(text).not.toContain("€0.07");
  });

  it("contains no digit-count or price literals in the template", () => {
    const source = readFileSync(new URL("./skill.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/\b\d+\s*\+/);
    expect(source).not.toMatch(/\b\d+\s+(?:tools|capabilities|countries|bundled checks)\b/);
    expect(source).not.toMatch(/€\s*\d/);
  });

  it("returns 503 without a good cache, then serves stale instructions during an outage", async () => {
    vi.useFakeTimers();
    compute.mockRejectedValueOnce(new Error("offline"));
    const { skillRoute } = await import("./skill.js");
    expect((await skillRoute.request("/SKILL.md")).status).toBe(503);
    const good = await (await skillRoute.request("/SKILL.md")).text();
    vi.advanceTimersByTime(6 * 60 * 1000);
    compute.mockRejectedValueOnce(new Error("offline"));
    expect(await (await skillRoute.request("/.well-known/skill.md")).text()).toBe(good);
    vi.useRealTimers();
  });
});

describe("API discovery messaging", () => {
  it("uses live coverage and adopted framing in llms.txt, welcome, catalog and MCP card", async () => {
    const { llmsTxtRoute } = await import("./llms-txt.js");
    const { welcomeRoute } = await import("./welcome.js");
    const { aiCatalogRoute } = await import("./ai-catalog.js");
    const { mcpServerCardRoute } = await import("./mcp-server-card.js");
    for (const [route, path] of [[llmsTxtRoute, "/llms.txt"], [welcomeRoute, "/"], [aiCatalogRoute, "/"], [mcpServerCardRoute, "/"]] as const) {
      const response = await route.request(path);
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).not.toMatch(retired);
      expect(text).toContain("417");
      expect(text).toMatch(/3 countries|"countries_covered":3/);
    }
    const md = await (await welcomeRoute.request("/", { headers: { Accept: "text/markdown" } })).text();
    expect(md).not.toMatch(retired);
    expect(md).toContain("417 tools");
    const llms = await (await llmsTxtRoute.request("/llms.txt")).text();
    expect(llms).toContain("test-free-a, test-free-b");
    expect(llms).toContain("https://api.strale.io/SKILL.md");
    const welcome = await (await welcomeRoute.request("/")).json();
    expect(welcome.discovery.skill).toBe("https://api.strale.io/SKILL.md");
  });

  it("removes retired framing and fixed coverage from the OpenAPI description and solution catalogue", async () => {
    const { openApiSpec } = await import("../openapi.js");
    expect(openApiSpec.info.description).not.toMatch(retired);
    expect(openApiSpec.info.description).not.toMatch(/\d+\+|\d+ countries/);
    const catalogue = readFileSync(new URL("../db/solution-catalogue.ts", import.meta.url), "utf8");
    expect(catalogue).not.toMatch(retired);
  });
});
