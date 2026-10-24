// A local stand-in for the public API, shaped like the real serializers, for
// testing the live loader and rendering templates offline. Tools come from the
// repository's manifests; the one bundled check is an obvious fixture
// ("fixture-company-check"). Never used by a real build.
import { createServer, type Server } from "node:http";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

const repo = resolve(import.meta.dirname, "../../..");

export function fixtureData(limit = 40) {
  const caps = readdirSync(resolve(repo, "manifests"))
    .filter((f) => f.endsWith(".yaml"))
    .slice(0, limit)
    .map((f) => parse(readFileSync(resolve(repo, "manifests", f), "utf8")) as Record<string, any>)
    .concat(["uk-company-data", "sanctions-check", "risk-narrative-generate"].map((s) => parse(readFileSync(resolve(repo, "manifests", `${s}.yaml`), "utf8")) as Record<string, any>));
  const capabilities = caps.map((m) => ({
    slug: m.slug, name: m.name, description: m.description, category: m.category, price_cents: m.price_cents,
    input_schema: m.input_schema, output_schema: m.output_schema, transparency_tag: m.transparency_tag, geography: m.geography ?? "global",
    data_source: m.data_source, is_free_tier: !!m.is_free_tier, search_tags: [], freshness_level: "fresh", last_tested_at: null, cost_class: m.cost_class ?? null, last_customer_call_at: null,
  }));
  const solution = {
    slug: "fixture-company-check", name: "Fixture company check", description: "Fixture bundle for offline template tests.", category: "kyb", price_cents: 150, step_count: 3,
    geography: "uk", transparency_tag: "mixed", compliance_coverage: [], search_tags: [], capabilities: ["uk-company-data", "sanctions-check", "risk-narrative-generate"], data_sources: [], freshness_level: "fresh", last_tested_at: null,
  };
  return {
    "/v1/platform/facts": {
      capability_counts: { active_visible: capabilities.length, active_total: capabilities.length, catalogued: capabilities.length, free_tier_slugs: capabilities.filter((c) => c.is_free_tier).map((c) => c.slug) },
      solution_count_active: 1,
      countries: { company_data_active: ["uk"], company_data_ever: ["uk"] },
      processing_region: "fixture", processing_jurisdiction: "US",
      static: { vendors: { sanctions: "Fixture vendor" }, retention_days_default: 1095, pii_retention_days: 90, retention_days_max_configurable: 2555, controller: { legal_name: "Strale", contact_email: "fixture@example.invalid", incorporation_jurisdiction: "Sweden" }, tos_version_current: "2026-04-30" },
      as_of: "2026-10-24T08:00:00.000Z",
    },
    "/v1/capabilities": { capabilities },
    "/v1/solutions": { solutions: [solution], total: 1 },
    "/x402/catalog": {
      x402: true, network: "base", facilitator: "fixture", wallet: null,
      capabilities: capabilities.filter((c) => !c.is_free_tier).map((c) => ({ slug: c.slug, name: c.name, description: c.description, price_usd: Math.round(c.price_cents * 1.08 * 1e4) / 1e6, method: "POST", endpoint: `https://api.strale.io/x402/${c.slug}`, input_schema: c.input_schema })),
      solutions: [{ slug: solution.slug, name: solution.name, description: solution.description, price_usd: 1.62, method: "POST", endpoint: `https://api.strale.io/x402/solutions/${solution.slug}`, input_schema: {} }],
      total: capabilities.length + 1,
    },
    solution,
    capabilities,
  };
}

/** Serves fixtureData(); answers the trust and limitation endpoints per slug. */
export function startMockApi(): Promise<{ server: Server; base: string; requests: string[] }> {
  const data = fixtureData();
  const requests: string[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    requests.push(url.pathname);
    const send = (status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname in data) return send(200, (data as Record<string, unknown>)[url.pathname]);
    if (url.pathname === `/v1/solutions/${data.solution.slug}`) {
      return send(200, { ...data.solution, marketing_name: data.solution.name, long_description: null, agent_description: null, component_sum_cents: 160, value_tier: null, target_audience: null,
        input_schema: { type: "object", required: ["company_number"], properties: { company_number: { type: "string", description: "Companies House number" } } },
        example_input: { company_number: "00445790" }, example_output: null, compliance_coverage: [],
        steps: data.solution.capabilities.map((s, i) => ({ step_order: i + 1, capability_slug: s, capability_name: s, capability_price_cents: 5, can_parallel: i > 0, parallel_group: i > 0 ? 1 : null, input_map: {}, data_source: null })),
        extends_with: [], related_solutions: [] });
    }
    if (url.pathname === "/v1/public/ops/trust/capabilities/batch") {
      const slugs = (url.searchParams.get("slugs") ?? "").split(",");
      return send(200, Object.fromEntries(slugs.map((s, i) => [s, i % 2 ? { badge: null, badge_label: null, tested: false, last_tested_at: null, pass_rate: null } : { badge: "strale_tested", badge_label: "Strale tested", tested: true, last_tested_at: "2026-10-20T06:00:00.000Z", pass_rate: 100 }])));
    }
    const cap = url.pathname.match(/^\/v1\/public\/ops\/limitations\/capabilities\/(.+)$/);
    if (cap) return send(200, { capability_slug: cap[1], limitations: [{ title: `Fixture limitation for ${cap[1]}`, text: "Fixture text.", category: "coverage", severity: "info", affected_percentage: null, workaround: null }] });
    const sol = url.pathname.match(/^\/v1\/public\/ops\/limitations\/solutions\/(.+)$/);
    if (sol) return send(200, { solution_slug: sol[1], steps: [{ capability_slug: "sanctions-check", limitations: [{ text: "Fixture step limitation.", category: "coverage", severity: "info", affected_percentage: null, workaround: null }] }] });
    send(404, { error_code: "not_found", message: "fixture" });
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => {
    const addr = server.address();
    r({ server, base: `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`, requests });
  }));
}

if (process.argv[1] === import.meta.filename) {
  const { base } = await startMockApi();
  console.log(base);
}
