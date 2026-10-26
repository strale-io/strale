import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { getDirectExecutor } from "./index.js";
import { REGISTRY_STATUS_PHRASES } from "./risk-narrative-generate.js";
import "./polish-company-data.js";
import "./norwegian-company-data.js";
import "./cz-company-data.js";
import "./finnish-company-data.js";
import "./greek-company-data.js";
import "./singapore-company-data.js";
import "./irish-company-data.js";
import "./brazilian-company-data.js";
import "./au-company-data.js";
import "./canadian-company-data.js";
import { parseCompany } from "./providers/swiss-company-data.js";

const { messageCreate } = vi.hoisted(() => ({ messageCreate: vi.fn(async () => { throw new Error("No network in registry consumer tests"); }) }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: messageCreate }; } }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
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
    "irish-company-data": ["Dissolved", "Dissolved-20 years", "Dissolved PostMerger", "Dissolved by Divis", "Struck Off", "Liquidation", "Liquidation(Receivership)", "Liquidation stayed", "Liquidation (UK)", "Strike Off Listed", "Ceased", "Ceased IRL", "Administration", "Administration (UK)", "Examinership", "Deleted CB Merger", "Deleted per SE merge", "Deleted as per SE Tr", "Deleted CB Conversion", "De-Registered ICAV", "De-Registered Investment Company", "InActive",
      "Normal (Form E8 (Notice of Appointment of Receiver) Per S436 CA 2014 has been filed with the CRO in respect of part or all of the property of the company, which property may or may not be beneficially owned by the company. Please refer to the relevant E8 form(s) for further information)"],
    "brazilian-company-data": ["BAIXADA", "INAPTA", "SUSPENSA", "NULA"],
    "au-company-data": ["Cancelled"],
    "singapore-company-data": ["Deregistered"],
    "swiss-company-data": ["CANCELLED", "BEING_CANCELLED"],
    "canadian-company-data": ["Dissolved", "Inactive - Amalgamated", "Inactive - Discontinued"],
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
        const terminal = ["deleted", "deregistered", "dissolved", "ceased", "closed", "terminated", "Išregistruotas", "Likvidēts", "Slēgts", "Cancelled", "BAIXADA", "NULA", "Dissolved", "Dissolved-20 years", "Dissolved PostMerger", "Dissolved by Divis", "Struck Off", "Struck Off - Early Dissolution", "Dissolved - Members Voluntary Winding Up", "Dissolved - Creditors Voluntary Winding Up", "Dissolved - Compulsory Winding Up (Insolvency)", "Ceased", "Deregistered", "CANCELLED", "Terminated", "Deleted CB Merger", "Deleted per SE merge", "Deleted as per SE Tr", "Deleted CB Conversion", "De-Registered ICAV", "De-Registered Investment Company"].includes(status);
        expect(output.risk_level).toBe(terminal ? "critical" : "high");
        expect(output.risk_score).toBeGreaterThanOrEqual(terminal ? 90 : 75);
        expect(output.flags).toEqual([expect.objectContaining({ source_check: slug, severity: terminal ? "critical" : "high" })]);
        const finding = (output.flags as any[])[0].finding;
        expect(finding).toMatch(/^The .+ company registry lists this company as /);
        expect(finding).not.toMatch(/company-data|_|\b(?:SE|CB|ICAV|Tr|Divis)\b/i);
        expect(output.summary).not.toContain("All 1 automated checks passed");
      }
    },
  );

  function record(name: string): any {
    return JSON.parse(readFileSync(new URL(`./__fixtures__/registry-status/${name}.json`, import.meta.url), "utf8")).response;
  }
  async function assertNarrativeFlag(slug: string, result: Record<string, unknown>, expected: string) {
    expect(result.status).toBe(expected);
    vi.stubEnv("ANTHROPIC_API_KEY", "synthetic-no-network-key");
    for (const context of ["kyb", "invoice_fraud"]) {
      const { output } = await getDirectExecutor("risk-narrative-generate")!({ check_results: { [slug]: result }, context });
      expect(output.flags).toEqual([expect.objectContaining({ source_check: slug })]);
      expect(output.passed_checks).toEqual([]);
    }
    expect(messageCreate).not.toHaveBeenCalled();
  }
  it.each([
    ["norwegian-company-data", "no-deleted", { org_number: "930663530" }, "deleted"],
    ["polish-company-data", "pl-deleted", { krs_number: "0000106150" }, "deregistered"],
    ["cz-company-data", "cz-liquidation", { ico: "01485377" }, "liquidation"],
    ["finnish-company-data", "fi-distress", { business_id: "0112038-9" }, "liquidation"],
    ["greek-company-data", "gr-distress", { gemi_number: "000237954001" }, "liquidation"],
    ["singapore-company-data", "sg-dead", { uen: "201201936C" }, "Deregistered"],
    ["irish-company-data", "ie-dead", { cro_number: "279457" }, "Dissolved"],
    ["brazilian-company-data", "br-dead", { cnpj: "11222333000181" }, "BAIXADA"],
    ["au-company-data", "au-dead", { abn: "38111203993" }, "Cancelled"],
    ["canadian-company-data", "ca-dissolved", { corporation_number: "12875063" }, "Dissolved"],
    ["canadian-company-data", "ca-amalgamated", { corporation_number: "346420" }, "Inactive - Amalgamated"],
    ["canadian-company-data", "ca-discontinued", { corporation_number: "1098845" }, "Inactive - Discontinued"],
  ] as const)("%s recorded/synthetic source %s reaches the narrative through its executor", async (slug, file, input, expected) => {
    vi.stubEnv("GEMI_API_KEY", "synthetic-test-key");
    vi.stubEnv("ABN_LOOKUP_GUID", "synthetic-test-guid");
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      if (String(url).endsWith("/roller")) return Response.json({ rollegrupper: [] });
      const body = record(String(url).includes("subjekty-vr/") ? "cz-vr-liquidation" : file);
      return typeof body === "string" ? new Response(body) : Response.json(body);
    }));
    const { output } = await getDirectExecutor(slug)!(input);
    await assertNarrativeFlag(slug, output, expected);
  });
  it.each(record("ch-status-vocabulary").enum.filter((status: string) => status !== "ACTIVE"))(
    "Zefix documented %s reaches narrative through the production provider parser", async status => {
      await assertNarrativeFlag("swiss-company-data", parseCompany({ status }), status);
    },
  );
  it.each(Object.entries(REGISTRY_STATUS_PHRASES))("renders the mapped phrase for %s", async (status, phrase) => {
    const slug = Object.keys(deadStatuses).find(key => deadStatuses[key].includes(status)) ??
      Object.keys(deadStatuses).find(key => deadStatuses[key].some(value => value.toLowerCase() === status.toLowerCase()));
    const emittedStatus = deadStatuses[slug!]?.find(value => value.toLowerCase() === status.toLowerCase());
    expect(slug, `uncovered mapped status ${status}`).toBeDefined();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { output } = await getDirectExecutor("risk-narrative-generate")!({ check_results: { [slug!]: { status: emittedStatus } }, context: "kyb" });
    expect((output.flags as any[])[0].finding).toContain(`lists this company as ${phrase}.`);
    if (["insolvency", "liquidation", "administration", "examinership", "restructuring"].includes(status.toLowerCase())) {
      expect(phrase).not.toBe(status.toLowerCase());
    }
  });

  // Prefer recorded outputs; fall back to checked-in manifest examples for
  // AU's legacy browser path, CA and DK. Project only status, never personal data.
  // PL's old tier-coverage record/example is MARTOM: use live ORLEN's recorded
  // response and the mapping regression in registry-status.test.ts:45-48.
  const recordedGerman = JSON.parse(readFileSync(new URL("../../../../archive/sessions/bosch-kyb-response-final.json", import.meta.url), "utf8"));
  const fixtureStatuses: Record<string, { status: string | undefined; evidence: string }> = {
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
    if (slug === "polish-company-data") {
      const record = JSON.parse(readFileSync(new URL("./__fixtures__/registry-status/pl-orlen.json", import.meta.url), "utf8"));
      vi.stubGlobal("fetch", vi.fn(async () => Response.json(record.response)));
      const result = await getDirectExecutor(slug)!({ krs_number: "0000028860" });
      status = result.output.status as string;
      expect(status).toBe("active");
    }
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
    ["singapore-company-data", "Live Company"], ["singapore-company-data", "Registered"], ["austrian-company-data", "aufrecht"],
    ["estonian-company-data", "R"], ["norwegian-company-data", "unfamiliar"],
    ["unknown-company-data", "deleted"], ["dns-lookup", "deleted"], ["toString", "deleted"],
  ])("%s unfamiliar/non-distress %s does not trigger registry review", async (slug, status) => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { output } = await getDirectExecutor("risk-narrative-generate")!({ check_results: { [slug]: { status } }, context: "kyb" });
    expect(output.flags).toEqual([]);
    expect(output.risk_level).toBe("none");
  });
  it("unrecognised registry statuses still reach AI synthesis when a key is available", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "synthetic-no-network-key");
    messageCreate.mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify({ risk_level: "none", risk_score: 0 }) }], model: "synthetic" } as never);
    const { provenance } = await getDirectExecutor("risk-narrative-generate")!({
      check_results: { "irish-company-data": { status: "unrecognised" } }, context: "kyb",
    });
    expect(messageCreate).toHaveBeenCalledOnce();
    expect(provenance.source).toBe("claude-sonnet");
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
        "norwegian-company-data": { status: "dissolving" },
        "sanctions-check": { is_sanctioned: true },
        "pep-check": { is_pep: true },
      }, context: "kyb",
    });
    expect(messageCreate).not.toHaveBeenCalled();
    expect(output.risk_level).toBe("critical");
    expect(output.risk_score).toBeGreaterThanOrEqual(90);
    expect(output.flags).toEqual([
      expect.objectContaining({ source_check: "norwegian-company-data" }),
      expect.objectContaining({ source_check: "sanctions-check", severity: "critical" }),
      expect.objectContaining({ source_check: "pep-check" }),
    ]);
    expect(output.note).toBe("Registry lifecycle findings preserved by deterministic assessment");
    expect(output.data_sources_consulted).toEqual(["norwegian-company-data", "sanctions-check", "pep-check"]);
    expect(provenance.fallback_reason).toBe("registry_status_preservation");
  });
  it("uses plain language for deletion and explains a pending strike-off notice", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "synthetic-no-network-key");
    const deleted = await getDirectExecutor("risk-narrative-generate")!({
      check_results: { "norwegian-company-data": { status: "deleted" } }, context: "kyb",
    });
    expect(deleted.output.flags).toEqual([expect.objectContaining({
      finding: "The Norwegian company registry lists this company as deleted.", severity: "critical",
    })]);
    const pending = await getDirectExecutor("risk-narrative-generate")!({
      check_results: { "irish-company-data": { status: "Strike Off Listed" } }, context: "kyb",
    });
    expect(pending.output.risk_level).toBe("high");
    expect((pending.output.flags as any[])[0].finding).toContain("pending notice");
  });
  it("preserves critical input flags on the forced deterministic path", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "synthetic-no-network-key");
    const { output } = await getDirectExecutor("risk-narrative-generate")!({
      check_results: { "finnish-company-data": { status: "liquidation" }, "other-check": { risk_level: "critical" } }, context: "kyb",
    });
    expect(output.risk_level).toBe("critical");
    expect(output.risk_score).toBeGreaterThanOrEqual(90);
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
