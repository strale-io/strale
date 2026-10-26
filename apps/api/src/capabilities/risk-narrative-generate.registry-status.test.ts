import { afterEach, describe, expect, it, vi } from "vitest";
import { getDirectExecutor } from "./index.js";
import "./risk-narrative-generate.js";

const { messageCreate } = vi.hoisted(() => ({ messageCreate: vi.fn(async () => { throw new Error("No network in registry consumer tests"); }) }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: messageCreate }; } }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("registry lifecycle consumers in KYB and invoice narratives", () => {
  it.each([
    ["norwegian-company-data", "deleted"], ["norwegian-company-data", "compulsory_dissolution"],
    ["norwegian-company-data", "dissolving"], ["polish-company-data", "deregistered"],
    ["cz-company-data", "liquidation"], ["cz-company-data", "insolvency"],
    ["greek-company-data", "inactive"], ["greek-company-data", "unrecognised registry description"],
    ["finnish-company-data", "bankrupt"], ["finnish-company-data", "restructuring"],
    ["finnish-company-data", "pending"], ["finnish-company-data", "unknown"],
  ])("%s %s is not a passed company check", async (slug, status) => {
    // Even a configured AI key must not send this lifecycle finding to a model.
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
  });
  it("Norway deleted-unit distress is not a passed bankruptcy check", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { output } = await getDirectExecutor("risk-narrative-generate")!({
      check_results: { "no-bankruptcy-check": { is_deleted: true, has_any_distress_signal: true, has_bankruptcy_filing: false } }, context: "kyb",
    });
    expect(output.passed_checks).toEqual([]);
    expect(output.flags).toEqual([expect.objectContaining({ source_check: "no-bankruptcy-check" })]);
  });
  it("preserves critical sanctions and cites every mixed-result finding", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "synthetic-no-network-key");
    const { output, provenance } = await getDirectExecutor("risk-narrative-generate")!({
      check_results: {
        "norwegian-company-data": { status: "deleted" },
        "sanctions-check": { is_sanctioned: true },
        "pep-check": { is_pep: true },
      }, context: "kyb",
    });
    expect(messageCreate).not.toHaveBeenCalled();
    expect(output.risk_level).toBe("critical");
    expect(output.flags).toEqual([
      expect.objectContaining({ source_check: "norwegian-company-data" }),
      expect.objectContaining({ source_check: "sanctions-check", severity: "critical" }),
      expect.objectContaining({ source_check: "pep-check" }),
    ]);
    expect(output.note).toBe("Registry lifecycle findings preserved by deterministic assessment");
    expect(output.data_sources_consulted).toEqual(["norwegian-company-data", "sanctions-check", "pep-check"]);
    expect(provenance.fallback_reason).toBe("registry_status_preservation");
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
