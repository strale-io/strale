import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { getDirectExecutor } from "./index.js";
import "./risk-narrative-generate.js";

const { messageCreate } = vi.hoisted(() => ({ messageCreate: vi.fn(async () => { throw new Error("No network in registry consumer tests"); }) }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: messageCreate }; } }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("registry lifecycle consumers in KYB and invoice narratives", () => {
  // Independent expected cases: use emitted values, not upstream statusMap keys.
  const deadStatuses: Record<string, string[]> = {
    "norwegian-company-data": ["deleted", "bankrupt", "compulsory_dissolution", "dissolving"],
    "polish-company-data": ["deregistered"],
    "cz-company-data": ["dissolved", "insolvency", "liquidation"],
    "finnish-company-data": ["inactive", "bankrupt", "liquidation", "restructuring"],
    "greek-company-data": ["inactive", "bankrupt", "liquidation", "dissolved"],
    "danish-company-data": ["ceased"],
    "french-company-data": ["closed"],
    "german-company-data": ["terminated"],
    "swedish-company-data": ["deregistered"],
    "uk-company-data": ["dissolved", "in_liquidation", "receivership", "closed", "voluntary_arrangement", "insolvency", "administration"],
    "estonian-company-data": ["in_liquidation", "deleted", "in_bankruptcy"],
    "lithuanian-company-data": ["Išregistruotas"],
    "irish-company-data": ["Dissolved"],
    "latvian-company-data": ["Likvidēts", "Slēgts"],
    "croatian-company-data": ["inactive"],
    "slovak-company-data": ["inactive"],
    "austrian-company-data": ["dissolved"],
    "spanish-company-data": ["inactive"],
    "belgian-company-data": ["inactive"],
    "bulgarian-company-data": ["inactive"],
    "cypriot-company-data": ["inactive"],
    "dutch-company-data": ["inactive"],
    "hungarian-company-data": ["inactive"],
    "italian-company-data": ["inactive"],
    "luxembourgish-company-data": ["inactive"],
    "maltese-company-data": ["inactive"],
    "portuguese-company-data": ["inactive"],
    "romanian-company-data": ["inactive"],
    "australian-company-data": ["inactive", "dissolved"],
    "japanese-company-data": ["inactive", "dissolved"],
  };
  it.each(Object.entries(deadStatuses).flatMap(([slug, statuses]) => statuses.map(status => [slug, status])))(
    "%s %s is not a passed company check", async (slug, status) => {
      vi.stubEnv("ANTHROPIC_API_KEY", "synthetic-no-network-key");
      for (const context of ["kyb", "invoice_fraud"]) {
        const { output } = await getDirectExecutor("risk-narrative-generate")!({
          check_results: { [slug]: { company_name: "Synthetic company", status } }, context,
        });
        expect(messageCreate).not.toHaveBeenCalled();
        expect(output.passed_checks).toEqual([]);
        expect(output.risk_level).toBe("high");
        expect(output.flags).toEqual([expect.objectContaining({ source_check: slug, finding: expect.stringContaining(status) })]);
        expect(output.summary).not.toContain("All 1 automated checks passed");
      }
    },
  );

  // Prefer recorded outputs; fall back to checked-in manifest examples for
  // AU's legacy browser path, CA and DK. Project only status, never personal data.
  // PL's old tier-coverage record/example is MARTOM: use live ORLEN's recorded
  // response and the mapping regression in registry-status.test.ts:45-48.
  const recordedGerman = JSON.parse(readFileSync(new URL("../../../../archive/sessions/bosch-kyb-response-final.json", import.meta.url), "utf8"));
  const fixtureStatuses: Record<string, { status: string | undefined; evidence: string }> = {
    "polish-company-data": { status: "active", evidence: "registry-status.test.ts:45-48; recorded pl-orlen (manifest known_answer)" },
    "german-company-data": { status: recordedGerman.result.steps["german-company-data"].status, evidence: "archive/sessions/bosch-kyb-response-final.json result.steps.german-company-data.status" },
  };
  const companyFiles = readdirSync(import.meta.dirname).filter(f => f.endsWith("-company-data.ts")).sort();
  const living = companyFiles.map(file => {
    const slug = file.slice(0, -3);
    const manifest = parse(readFileSync(new URL(`../../../../manifests/${slug}.yaml`, import.meta.url), "utf8"));
    const fixture = manifest.test_fixtures.known_answer?.input ?? manifest.test_fixtures.health_check_input;
    const recordUrl = new URL(`../../test/fixtures/tier-coverage/${slug}.json`, import.meta.url);
    const status = fixtureStatuses[slug] ?? (existsSync(recordUrl) ? {
      status: JSON.parse(readFileSync(recordUrl, "utf8")).status,
      evidence: `apps/api/test/fixtures/tier-coverage/${slug}.json`,
    } : {
      status: manifest.output_schema.example?.status,
      evidence: `manifests/${slug}.yaml output_schema.example for ${JSON.stringify(fixture)}`,
    });
    return { slug, fixture, ...status };
  });
  it("covers every company-data executor with a fixture and a sourced living status (or absent status)", () => {
    expect(living).toHaveLength(companyFiles.length);
    expect(living.length).toBeGreaterThan(30);
    for (const row of living) {
      expect(row.fixture, row.slug).toBeDefined();
      if (row.slug !== "slovenian-company-data") expect(row.status, row.evidence).toBeTypeOf("string");
    }
  });
  it.each(living)("$slug living fixture status $status retains both narrative routes", async ({ slug, status }) => {
    const checkResults = { [slug]: { company_name: "Synthetic company", status } };
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const fallback = await getDirectExecutor("risk-narrative-generate")!({ check_results: checkResults, context: "kyb" });
    expect(fallback.output.risk_level).toBe("none");
    expect(fallback.output.flags).toEqual([]);
    expect(fallback.output.passed_checks).toEqual([slug.replace(/-/g, " ")]);
    vi.stubEnv("ANTHROPIC_API_KEY", "synthetic-no-network-key");
    messageCreate.mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify({ risk_level: "none", risk_score: 0 }) }], model: "synthetic" } as never);
    const ai = await getDirectExecutor("risk-narrative-generate")!({ check_results: checkResults, context: "kyb" });
    expect(messageCreate).toHaveBeenCalledOnce();
    expect(ai.provenance.source).toBe("claude-sonnet");
  });
  it.each([
    ["greek-company-data", "unrecognised registry description"],
    ["finnish-company-data", "pending"], ["finnish-company-data", "unknown"],
    ["singapore-company-data", "Live Company"], ["austrian-company-data", "aufrecht"],
    ["estonian-company-data", "R"], ["norwegian-company-data", "unfamiliar"],
    ["unknown-company-data", "deleted"], ["dns-lookup", "deleted"], ["toString", "deleted"],
  ])("%s unfamiliar/non-distress %s does not trigger registry review", async (slug, status) => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { output } = await getDirectExecutor("risk-narrative-generate")!({ check_results: { [slug]: { status } }, context: "kyb" });
    expect(output.flags).toEqual([]);
    expect(output.risk_level).toBe("none");
  });
  it.each([
    { is_deleted: true, has_any_distress_signal: false, has_bankruptcy_filing: false },
    { is_deleted: false, has_any_distress_signal: true, has_bankruptcy_filing: false },
  ])("Norway distress is not a passed bankruptcy check: %j", async result => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { output } = await getDirectExecutor("risk-narrative-generate")!({
      check_results: { "no-bankruptcy-check": result }, context: "kyb",
    });
    expect(output.passed_checks).toEqual([]);
    expect(output.flags).toEqual([expect.objectContaining({ source_check: "no-bankruptcy-check" })]);
  });
  it("preserves sanctions flag severity and cites every mixed-result finding", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "synthetic-no-network-key");
    const { output, provenance } = await getDirectExecutor("risk-narrative-generate")!({
      check_results: {
        "norwegian-company-data": { status: "deleted" },
        "sanctions-check": { is_sanctioned: true },
        "pep-check": { is_pep: true },
      }, context: "kyb",
    });
    expect(messageCreate).not.toHaveBeenCalled();
    expect(output.risk_level).toBe("high");
    expect(output.risk_score).toBe(75);
    expect(output.flags).toEqual([
      expect.objectContaining({ source_check: "norwegian-company-data" }),
      expect.objectContaining({ source_check: "sanctions-check", severity: "critical" }),
      expect.objectContaining({ source_check: "pep-check" }),
    ]);
    expect(output.note).toBe("Registry lifecycle findings preserved by deterministic assessment");
    expect(output.data_sources_consulted).toEqual(["norwegian-company-data", "sanctions-check", "pep-check"]);
    expect(provenance.fallback_reason).toBe("registry_status_preservation");
  });
  it("keeps the pre-round-1 aggregate risk for a sanctions-only fallback", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { output } = await getDirectExecutor("risk-narrative-generate")!({
      check_results: { "sanctions-check": { is_sanctioned: true } }, context: "kyb",
    });
    expect(output.risk_level).toBe("low");
    expect(output.risk_score).toBe(25);
    expect(output.flags).toEqual([expect.objectContaining({ severity: "critical", source_check: "sanctions-check" })]);
    expect(output.data_sources_consulted).toEqual(["sanctions-check"]);
  });
  it("active companies still pass; unrelated status values are not company lifecycle", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { output } = await getDirectExecutor("risk-narrative-generate")!({
      check_results: { "finnish-company-data": { status: "active" }, "dns-lookup": { status: "NOERROR" } }, context: "kyb",
    });
    expect(output.risk_level).toBe("none");
    expect(output.passed_checks).toHaveLength(2);
  });
});
