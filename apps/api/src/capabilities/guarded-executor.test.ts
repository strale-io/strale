/**
 * Phase A0b regression tests for the dispatcher gate.
 *
 * Per DEC-20260504-A (Audit-Follow-up Test Coverage Protocol): every new
 * code path added in response to a structural failure must include
 * regression tests that fail against the un-applied fix. The 2026-05-11
 * DE/DK breakage was the trigger; the gate (`guardedExecute` + `ALLOW_MATRIX`)
 * is the structural fix. These tests pin:
 *
 *   1. Cost-class × invocation-context ALLOW_MATRIX cells.
 *   2. Null-row decision table (unclassified caps).
 *   3. Atomic budget increment under burst load.
 *   4. The classes' Error subtypes (callers branch on these).
 *
 * The DB layer is mocked — these are pure unit tests with no real Postgres.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB layer before importing guarded-executor.
const mockDbExecute = vi.fn();
vi.mock("../db/index.js", () => ({
  getDb: () => ({ execute: mockDbExecute }),
  closeDbPool: () => Promise.resolve(),
}));

// Mock the registry and alerting so we control the executor return shape
// and don't fire real emails during tests.
const mockExecutor = vi.fn();
vi.mock("./index.js", async () => {
  const actual = await vi.importActual<typeof import("./index.js")>("./index.js");
  return {
    ...actual,
    getExecutor: () => mockExecutor,
  };
});

vi.mock("../lib/alerting.js", () => ({
  sendAlert: vi.fn().mockResolvedValue(undefined),
}));

import {
  guardedExecute,
  assertGuardedAllow,
  computeWindowStart,
  computeBudgetCap,
  __resetCostMetaCacheForTests,
  CapabilityNotClassifiedError,
  CapabilityInvocationRefusedError,
  BudgetExhaustedError,
  type CapabilityCostMeta,
  type InvocationContext,
} from "./guarded-executor.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function stubMeta(meta: Partial<CapabilityCostMeta>): void {
  // First DB call: SELECT cost_class etc. — return a single-row array.
  mockDbExecute.mockImplementationOnce(async () => [
    {
      slug: meta.slug ?? "test-cap",
      cost_class: meta.cost_class ?? null,
      quota_window: meta.quota_window ?? null,
      quota_cap: meta.quota_cap ?? null,
      quota_reset_dom: meta.quota_reset_dom ?? null,
    },
  ]);
}

function customerCtx(): InvocationContext {
  return { kind: "customer_paid", userId: "u1", transactionId: "t1" };
}
function internalCtx(): InvocationContext {
  return { kind: "internal_test", suiteId: "s1", reason: "scheduled" };
}
function probeCtx(): InvocationContext {
  return { kind: "health_probe", probeId: "p1" };
}
function ciCtx(): InvocationContext {
  return { kind: "ci", workflowRunId: "w1" };
}

beforeEach(() => {
  __resetCostMetaCacheForTests();
  mockDbExecute.mockReset();
  mockExecutor.mockReset();
});

// ─── ALLOW_MATRIX cells ─────────────────────────────────────────────────────

describe("ALLOW_MATRIX", () => {
  it("free_unlimited × customer_paid → allow", async () => {
    stubMeta({ slug: "x", cost_class: "free_unlimited" });
    mockExecutor.mockResolvedValueOnce({ output: {}, provenance: { source: "x", fetched_at: "" } });
    await expect(guardedExecute("x", {}, customerCtx())).resolves.toBeDefined();
    expect(mockExecutor).toHaveBeenCalledTimes(1);
  });

  it("free_unlimited × internal_test → allow", async () => {
    stubMeta({ slug: "x", cost_class: "free_unlimited" });
    mockExecutor.mockResolvedValueOnce({ output: {}, provenance: { source: "x", fetched_at: "" } });
    await expect(guardedExecute("x", {}, internalCtx())).resolves.toBeDefined();
    expect(mockExecutor).toHaveBeenCalledTimes(1);
  });

  it("paid_prepaid × customer_paid → allow", async () => {
    stubMeta({ slug: "x", cost_class: "paid_prepaid" });
    mockExecutor.mockResolvedValueOnce({ output: {}, provenance: { source: "x", fetched_at: "" } });
    await expect(guardedExecute("x", {}, customerCtx())).resolves.toBeDefined();
  });

  it("paid_prepaid × internal_test → refuse", async () => {
    stubMeta({ slug: "x", cost_class: "paid_prepaid" });
    await expect(guardedExecute("x", {}, internalCtx())).rejects.toBeInstanceOf(
      CapabilityInvocationRefusedError,
    );
    expect(mockExecutor).not.toHaveBeenCalled();
  });

  it("paid_prepaid × ci → refuse", async () => {
    stubMeta({ slug: "x", cost_class: "paid_prepaid" });
    await expect(guardedExecute("x", {}, ciCtx())).rejects.toBeInstanceOf(
      CapabilityInvocationRefusedError,
    );
  });

  it("paid_prepaid × health_probe → refuse", async () => {
    stubMeta({ slug: "x", cost_class: "paid_prepaid" });
    await expect(guardedExecute("x", {}, probeCtx())).rejects.toBeInstanceOf(
      CapabilityInvocationRefusedError,
    );
  });

  it("paid_subscription × health_probe → allow (subs absorb probes)", async () => {
    stubMeta({ slug: "x", cost_class: "paid_subscription" });
    mockExecutor.mockResolvedValueOnce({ output: {}, provenance: { source: "x", fetched_at: "" } });
    await expect(guardedExecute("x", {}, probeCtx())).resolves.toBeDefined();
  });

  it("paid_subscription × internal_test → refuse (preserves fair-use)", async () => {
    stubMeta({ slug: "x", cost_class: "paid_subscription" });
    await expect(guardedExecute("x", {}, internalCtx())).rejects.toBeInstanceOf(
      CapabilityInvocationRefusedError,
    );
  });

  it("free_quota × customer_paid → allow (no budget check)", async () => {
    stubMeta({ slug: "x", cost_class: "free_quota", quota_window: "monthly", quota_cap: 50 });
    mockExecutor.mockResolvedValueOnce({ output: {}, provenance: { source: "x", fetched_at: "" } });
    await expect(guardedExecute("x", {}, customerCtx())).resolves.toBeDefined();
    // Only 1 DB call (cost-meta SELECT). No budget INSERT for customer_paid.
    expect(mockDbExecute).toHaveBeenCalledTimes(1);
  });

  it("free_quota × internal_test → budget_check (allows when under cap)", async () => {
    stubMeta({ slug: "x", cost_class: "free_quota", quota_window: "monthly", quota_cap: 50 });
    // budget cap = 50 × 0.20 = 10. Under cap.
    mockDbExecute.mockResolvedValueOnce([
      { test_count: 3, budget_cap: 10, alert_30_fired_at: new Date(), alert_50_fired_at: new Date(), alert_80_fired_at: new Date(), hard_stop_fired_at: null },
    ]);
    mockExecutor.mockResolvedValueOnce({ output: {}, provenance: { source: "x", fetched_at: "" } });
    await expect(guardedExecute("x", {}, internalCtx())).resolves.toBeDefined();
    expect(mockExecutor).toHaveBeenCalledTimes(1);
  });
});

// ─── Null-row decisions (unclassified caps) ─────────────────────────────────

describe("NULL_DECISIONS (unclassified cap_class)", () => {
  it("null × customer_paid → allow (preserves traffic during GRACE)", async () => {
    stubMeta({ slug: "x", cost_class: null });
    mockExecutor.mockResolvedValueOnce({ output: {}, provenance: { source: "x", fetched_at: "" } });
    await expect(guardedExecute("x", {}, customerCtx())).resolves.toBeDefined();
  });

  it("null × internal_test → CapabilityNotClassifiedError", async () => {
    stubMeta({ slug: "x", cost_class: null });
    await expect(guardedExecute("x", {}, internalCtx())).rejects.toBeInstanceOf(
      CapabilityNotClassifiedError,
    );
    expect(mockExecutor).not.toHaveBeenCalled();
  });

  it("null × health_probe → refuse", async () => {
    stubMeta({ slug: "x", cost_class: null });
    await expect(guardedExecute("x", {}, probeCtx())).rejects.toBeInstanceOf(
      CapabilityNotClassifiedError,
    );
  });

  it("null × ci → refuse", async () => {
    stubMeta({ slug: "x", cost_class: null });
    await expect(guardedExecute("x", {}, ciCtx())).rejects.toBeInstanceOf(
      CapabilityNotClassifiedError,
    );
  });
});

// ─── Budget cap arithmetic ──────────────────────────────────────────────────

describe("computeBudgetCap", () => {
  it("free_quota monthly: 20% of quota_cap", () => {
    expect(computeBudgetCap({
      slug: "x",
      cost_class: "free_quota",
      quota_window: "monthly",
      quota_cap: 50,
      quota_reset_dom: 1,
    })).toBe(10);
  });

  it("free_quota daily: 10% of quota_cap", () => {
    expect(computeBudgetCap({
      slug: "x",
      cost_class: "free_quota",
      quota_window: "daily",
      quota_cap: 50,
      quota_reset_dom: null,
    })).toBe(5);
  });

  it("paid_with_free_tier monthly: 10% of quota_cap", () => {
    expect(computeBudgetCap({
      slug: "x",
      cost_class: "paid_with_free_tier",
      quota_window: "monthly",
      quota_cap: 1000,
      quota_reset_dom: 1,
    })).toBe(100);
  });

  it("paid_with_free_tier daily: 5% of quota_cap", () => {
    expect(computeBudgetCap({
      slug: "x",
      cost_class: "paid_with_free_tier",
      quota_window: "daily",
      quota_cap: 200,
      quota_reset_dom: null,
    })).toBe(10);
  });

  it("floor at 1 for very small quotas", () => {
    expect(computeBudgetCap({
      slug: "x",
      cost_class: "free_quota",
      quota_window: "daily",
      quota_cap: 5,
      quota_reset_dom: null,
    })).toBe(1);
  });

  it("throws on missing quota_cap/quota_window (cost_class isn't budget-tracked)", () => {
    expect(() =>
      computeBudgetCap({
        slug: "x",
        cost_class: "paid_prepaid",
        quota_window: null,
        quota_cap: null,
        quota_reset_dom: null,
      }),
    ).toThrow(/missing quota_cap\/quota_window/);
  });

  it("throws when cost_class is unsupported even with quota fields set", () => {
    // Defensive — shouldn't happen in prod (CHECK constraint prevents
    // this combination), but the guard exists so the math doesn't silently
    // return wrong percentages if the schema constraints drift.
    expect(() =>
      computeBudgetCap({
        slug: "x",
        cost_class: "paid_prepaid",
        quota_window: "monthly",
        quota_cap: 1000,
        quota_reset_dom: 1,
      }),
    ).toThrow(/doesn't budget-track/);
  });
});

// ─── Window arithmetic ──────────────────────────────────────────────────────

describe("computeWindowStart", () => {
  it("daily: UTC midnight of today", () => {
    const now = new Date("2026-05-12T14:33:00Z");
    const start = computeWindowStart("daily", null, now);
    expect(start.toISOString()).toBe("2026-05-12T00:00:00.000Z");
  });

  it("monthly with reset_dom=1: 1st of current month if today >= 1st", () => {
    const now = new Date("2026-05-12T14:33:00Z");
    const start = computeWindowStart("monthly", 1, now);
    expect(start.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("monthly with reset_dom=15: 15th of current month if today is on/after 15th", () => {
    const now = new Date("2026-05-20T08:00:00Z");
    const start = computeWindowStart("monthly", 15, now);
    expect(start.toISOString()).toBe("2026-05-15T00:00:00.000Z");
  });

  it("monthly with reset_dom=15: 15th of last month if today is before 15th", () => {
    const now = new Date("2026-05-10T08:00:00Z");
    const start = computeWindowStart("monthly", 15, now);
    expect(start.toISOString()).toBe("2026-04-15T00:00:00.000Z");
  });

  it("monthly with null reset_dom defaults to 1", () => {
    const now = new Date("2026-05-12T14:33:00Z");
    const start = computeWindowStart("monthly", null, now);
    expect(start.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });
});

// ─── Budget race (concurrent burst) ─────────────────────────────────────────

describe("budget race", () => {
  it("50 concurrent internal_test calls against budget_cap=10 → exactly 10 allowed", async () => {
    // Simulate the PG-side counter behavior: each ON CONFLICT increments
    // atomically. We model it with a local counter that the stub returns
    // post-increment values from. budget_cap=10 (free_quota, monthly, 50).
    // Discriminate query kinds by call sequence + the queryChunks shape
    // exposed by drizzle-orm's SQL builder.
    let counter = 0;
    mockDbExecute.mockImplementation(async (queryArg: { queryChunks?: unknown[] }) => {
      const chunks = (queryArg?.queryChunks ?? []) as Array<{ value?: string[] }>;
      const rendered = chunks
        .map((c) =>
          typeof c === "object" && c !== null && "value" in c && Array.isArray(c.value)
            ? c.value.join(" ")
            : "",
        )
        .join(" ")
        .toLowerCase();

      if (rendered.includes("from capabilities") || rendered.includes("select\n      slug")) {
        return [
          {
            slug: "x",
            cost_class: "free_quota",
            quota_window: "monthly",
            quota_cap: 50,
            quota_reset_dom: 1,
          },
        ];
      }
      if (rendered.includes("insert into capability_budget_counters")) {
        counter++;
        return [
          {
            test_count: counter,
            budget_cap: 10,
            alert_30_fired_at: new Date(),
            alert_50_fired_at: new Date(),
            alert_80_fired_at: new Date(),
            hard_stop_fired_at: null,
          },
        ];
      }
      if (rendered.includes("update capability_budget_counters")) {
        if (rendered.includes("test_count = test_count - 1")) {
          counter--;
        }
        return { count: 1 };
      }
      return { count: 0 };
    });

    const calls = Array.from({ length: 50 }, () =>
      assertGuardedAllow("x", internalCtx()).then(
        () => "allowed",
        (err: Error) => err.constructor.name,
      ),
    );
    const results = await Promise.all(calls);
    const allowed = results.filter((r) => r === "allowed").length;
    const exhausted = results.filter((r) => r === "BudgetExhaustedError").length;
    expect(allowed).toBe(10);
    expect(exhausted).toBe(40);
  });
});
