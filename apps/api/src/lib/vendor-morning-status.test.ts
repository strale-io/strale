import { describe, expect, it } from "vitest";
import {
  deriveVendorInventoryIssues,
  deriveVendorMorningIssues,
  type VendorAccountMorningRow,
} from "./vendor-morning-status.js";

function account(overrides: Partial<VendorAccountMorningRow> = {}): VendorAccountMorningRow {
  return {
    provider_name: "vendor",
    monitor_mode: "api_balance",
    status: "healthy",
    status_reason: null,
    expires_at: null,
    last_checked_at: "2026-08-25T08:00:00.000Z",
    active_suspensions: [],
    active_solution_suspensions: [],
    ...overrides,
  };
}

describe("deriveVendorMorningIssues", () => {
  const now = new Date("2026-08-25T10:00:00.000Z");

  it("raises a critical issue for exhaustion and every active suspension", () => {
    const issues = deriveVendorMorningIssues([
      account({
        provider_name: "openregister",
        status: "exhausted",
        status_reason: "0 credits remain",
        active_suspensions: ["german-company-data"],
        active_solution_suspensions: ["kyb-essentials-de"],
      }),
    ], ["openregister"], now);
    expect(issues).toEqual([
      { severity: "critical", provider: "openregister", message: "0 credits remain" },
      { severity: "critical", provider: "openregister", message: "german-company-data is automatically suspended" },
      { severity: "critical", provider: "openregister", message: "kyb-essentials-de solution is automatically suspended" },
    ]);
  });

  it("flags missing adapters, stale readings and imminent prepaid expiry", () => {
    const issues = deriveVendorMorningIssues([
      account({
        last_checked_at: "2026-08-25T06:00:00.000Z",
        expires_at: "2026-09-01T10:00:00.000Z",
      }),
    ], [], now);
    expect(issues.map((issue) => issue.message)).toEqual([
      "declares an account-balance API but has no registered balance adapter",
      "balance reading is stale (4.0h old)",
      "prepaid allowance expires in 7 day(s)",
    ]);
  });

  it("requires explicit dashboard reconciliation when no zero-cost balance evidence exists", () => {
    const issues = deriveVendorMorningIssues([
      account({
        provider_name: "serper",
        monitor_mode: "internal_counter",
        status: "exhausted",
      }),
    ], [], now, ["esortcode"]);

    expect(issues.map((issue) => issue.message)).toContain(
      "vendor exposes no zero-cost balance/recovery endpoint; reconcile the top-up from its dashboard (synthetic paid probes are prohibited)",
    );
  });

  it("also requires dashboard reconciliation for exhausted eSortcode credits", () => {
    const issues = deriveVendorMorningIssues([
      account({
        provider_name: "esortcode",
        monitor_mode: "availability",
        status: "exhausted",
      }),
    ], [], now, ["esortcode"]);

    expect(issues.map((issue) => issue.message)).toContain(
      "vendor exposes no zero-cost balance/recovery endpoint; reconcile the top-up from its dashboard (synthetic paid probes are prohibited)",
    );
  });

  it("ignores null aggregate placeholders and flags an unconnected spend monitor", () => {
    const issues = deriveVendorMorningIssues([
      account({
        provider_name: "anthropic",
        monitor_mode: "spend",
        last_checked_at: null,
        active_suspensions: [null as unknown as string],
        active_solution_suspensions: [null as unknown as string],
      }),
    ], [], now);
    expect(issues).toEqual([{
      severity: "warning",
      provider: "anthropic",
      message: "spend monitoring is declared but has not reported a reading",
    }]);
  });

  it("finds missing paid accounts and provider-to-capability edges", () => {
    const issues = deriveVendorInventoryIssues([
      {
        ...account({ provider_name: "anthropic" }),
        affected_capabilities: ["summarize", "old-cap"],
        dependency_edges: [
          { capability_slug: "summarize", dependency_kind: "fallback" },
          { capability_slug: "old-cap", dependency_kind: "required" },
        ],
      },
    ], [
      { name: "anthropic", tier: "paid", capabilities: ["summarize", "translate"] },
      { name: "esortcode", tier: "paid", capabilities: ["uk-cop-check"] },
      { name: "vies", tier: "free", capabilities: ["vat-validate"] },
    ]);
    expect(issues).toEqual([
      {
        severity: "warning",
        provider: "anthropic",
        message: "dependency inventory is missing or has the wrong kind: summarize (required), translate (required)",
      },
      {
        severity: "warning",
        provider: "anthropic",
        message: "dependency inventory has stale extra edges: old-cap",
      },
      { severity: "warning", provider: "esortcode", message: "paid/finite provider has no vendor account record" },
    ]);
  });
});
