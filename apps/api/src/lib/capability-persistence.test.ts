/**
 * Unit tests for persistCapability (Cluster 2 Phase 3 C1).
 *
 * Contract exercised:
 *   1. mode='create': INSERT capability + test_suites + limitations inside
 *      a single transaction, then call onCapabilityCreated. On success, no
 *      hook_failed marker.
 *   2. mode='create' with hook throwing: transaction commits (capability row
 *      persisted) but lifecycle_state is updated to 'hook_failed'. Caller
 *      sees hookFailed=true. Error is logged.
 *   3. mode='update': UPDATE capability by slug, then hook. Same hook-failure
 *      semantics as create.
 *   4. F-B-008: `processesPersonalData: null` is stripped from the INSERT
 *      values (DB default 'false' applies).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock state ──────────────────────────────────────────────────────────────
type Insert = { table: string; values: Record<string, unknown> };
type Update = { table: string; set: Record<string, unknown>; whereSlug: string };

const state = {
  inserts: [] as Insert[],
  updates: [] as Update[],
  transactionRolledBack: false,
  hookImpl: async (_slug: string) => { /* default: succeeds */ },
};

// Tiny mock that records inserts/updates and runs the callback. The tx
// argument exposes the same shape (insert/update) as the real db object
// so persistCapability can call tx.insert(...) inside the callback.
function makeTxLike(tableOf: (t: unknown) => string) {
  return {
    insert: (table: unknown) => ({
      values: async (v: Record<string, unknown>) => {
        state.inserts.push({ table: tableOf(table), values: v });
      },
    }),
    update: (table: unknown) => ({
      set: (s: Record<string, unknown>) => ({
        where: async (clause: unknown) => {
          // Extract the slug from the `eq(capabilities.slug, X)` clause by
          // recording the most-recently-intended slug. Good enough for tests:
          // all writes in these tests target a single slug.
          const slug = state.__whereSlugHint ?? "?";
          state.updates.push({ table: tableOf(table), set: s, whereSlug: slug });
          void clause;
        },
      }),
    }),
  };
}

// Override Drizzle's `eq(col, val)` at import time so the second arg lands
// in state.__whereSlugHint. persistence calls eq(capabilities.slug, slug).
vi.mock("drizzle-orm", async (orig) => {
  const real = await (orig() as Promise<Record<string, unknown>>);
  return {
    ...real,
    eq: (_col: unknown, val: unknown) => {
      state.__whereSlugHint = typeof val === "string" ? val : undefined;
      return { __eq_placeholder: true, val };
    },
  };
});

// Mock schema tables so we can identify which one is being written to.
vi.mock("../db/schema.js", () => ({
  capabilities: { __tableName: "capabilities", slug: "capabilities.slug" },
  testSuites: { __tableName: "test_suites" },
  capabilityLimitations: { __tableName: "capability_limitations" },
}));

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    transaction: async (cb: (tx: unknown) => Promise<void>) => {
      const tx = makeTxLike((t) => (t as { __tableName?: string }).__tableName ?? "unknown");
      try {
        await cb(tx);
      } catch (err) {
        state.transactionRolledBack = true;
        throw err;
      }
    },
  }),
}));

vi.mock("./capability-onboarding.js", () => ({
  onCapabilityCreated: async (slug: string) => state.hookImpl(slug),
}));

vi.mock("./log.js", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

// Augment the state type for the slug-hint trick above.
declare global {
  var __whereSlugHint: string | undefined;
}

beforeEach(() => {
  state.inserts = [];
  state.updates = [];
  state.transactionRolledBack = false;
  state.hookImpl = async (_slug) => { /* succeeds */ };
  state.__whereSlugHint = undefined;
});

// Lazy import AFTER mocks.
async function importPersist() {
  return await import("./capability-persistence.js");
}

function baseCapability(): Record<string, unknown> {
  return {
    slug: "test-cap",
    name: "Test Capability",
    description: "Test capability for persistCapability unit tests.",
    category: "validation",
    priceCents: 5,
    isFreeTier: false,
    inputSchema: { type: "object", properties: { q: { type: "string" } } },
    outputSchema: { type: "object", properties: { r: { type: "string" } } },
    dataSource: "Test Source",
    dataClassification: "public",
    transparencyTag: "algorithmic",
    capabilityType: "stable_api",
    outputFieldReliability: { r: "guaranteed" },
    maintenanceClass: "pure-computation",
    processesPersonalData: false,
    personalDataCategories: [],
    lifecycleState: "validating",
    visible: false,
    isActive: true,
  };
}

describe("persistCapability (Cluster 2 Phase 3 C1)", () => {
  it("mode=create happy path: inserts capability + suites + limitations, calls hook, no hook_failed marker", async () => {
    const { persistCapability } = await importPersist();
    const result = await persistCapability(
      {
        capability: baseCapability() as never,
        testSuites: [{ capabilitySlug: "test-cap", testName: "t1", testType: "schema_check", input: {}, validationRules: { checks: [] }, scheduleTier: "A", estimatedCostCents: 0 } as never],
        limitations: [{ limitationText: "Short-lived", category: "coverage", severity: "info", sortOrder: 0 } as never],
      },
      { mode: "create" },
    );
    expect(result.slug).toBe("test-cap");
    expect(result.mode).toBe("create");
    expect(result.hookFailed).toBe(false);
    // 1 cap + 1 suite + 1 limitation
    expect(state.inserts).toHaveLength(3);
    expect(state.inserts[0].table).toBe("capabilities");
    expect(state.inserts[1].table).toBe("test_suites");
    expect(state.inserts[2].table).toBe("capability_limitations");
    // capability_limitations row was auto-stamped with capabilitySlug
    expect(state.inserts[2].values.capabilitySlug).toBe("test-cap");
    // No hook_failed UPDATE on the happy path
    expect(state.updates.filter((u) => u.set.lifecycleState === "hook_failed")).toHaveLength(0);
  });

  it("mode=create with hook throwing: transaction commits, lifecycle_state is set to 'hook_failed'", async () => {
    state.hookImpl = async () => {
      throw new Error("Simulated hook failure (gate5 unsatisfied)");
    };
    const { persistCapability } = await importPersist();
    const result = await persistCapability(
      { capability: baseCapability() as never },
      { mode: "create" },
    );
    expect(result.hookFailed).toBe(true);
    expect(state.transactionRolledBack).toBe(false); // NOT rolled back — committed
    // Capability still inserted
    expect(state.inserts.filter((i) => i.table === "capabilities")).toHaveLength(1);
    // Hook-failed marker UPDATE fired
    const markerUpdates = state.updates.filter(
      (u) => u.table === "capabilities" && u.set.lifecycleState === "hook_failed",
    );
    expect(markerUpdates).toHaveLength(1);
  });

  it("mode=update happy path: updates capability row, calls hook, no hook_failed marker", async () => {
    const { persistCapability } = await importPersist();
    const result = await persistCapability(
      { capability: { ...baseCapability(), description: "Updated description for backfill path." } as never },
      { mode: "update" },
    );
    expect(result.mode).toBe("update");
    expect(result.hookFailed).toBe(false);
    expect(state.inserts).toHaveLength(0);
    expect(state.updates.length).toBeGreaterThanOrEqual(1);
    expect(state.updates[0].table).toBe("capabilities");
    expect(state.updates[0].set.description).toContain("Updated description");
  });

  it("mode=update with hook throwing: row stays (via the UPDATE), lifecycle_state='hook_failed'", async () => {
    state.hookImpl = async () => { throw new Error("hook boom"); };
    const { persistCapability } = await importPersist();
    const result = await persistCapability(
      { capability: baseCapability() as never },
      { mode: "update" },
    );
    expect(result.hookFailed).toBe(true);
    const markerUpdates = state.updates.filter(
      (u) => u.table === "capabilities" && u.set.lifecycleState === "hook_failed",
    );
    expect(markerUpdates).toHaveLength(1);
  });

  it("F-B-008: processes_personal_data=null is stripped from INSERT values (DB default applies)", async () => {
    const { persistCapability } = await importPersist();
    const cap = { ...baseCapability(), processesPersonalData: null, personalDataCategories: null };
    await persistCapability({ capability: cap as never }, { mode: "create" });
    const inserted = state.inserts.find((i) => i.table === "capabilities")!.values;
    expect(Object.prototype.hasOwnProperty.call(inserted, "processesPersonalData")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(inserted, "personalDataCategories")).toBe(false);
  });

  it("F-B-008: processes_personal_data=undefined is also stripped", async () => {
    const { persistCapability } = await importPersist();
    const cap = { ...baseCapability(), processesPersonalData: undefined };
    await persistCapability({ capability: cap as never }, { mode: "create" });
    const inserted = state.inserts.find((i) => i.table === "capabilities")!.values;
    expect(Object.prototype.hasOwnProperty.call(inserted, "processesPersonalData")).toBe(false);
  });

  it("F-B-008: processes_personal_data=false is preserved (not treated as null)", async () => {
    const { persistCapability } = await importPersist();
    const cap = { ...baseCapability(), processesPersonalData: false };
    await persistCapability({ capability: cap as never }, { mode: "create" });
    const inserted = state.inserts.find((i) => i.table === "capabilities")!.values;
    expect(inserted.processesPersonalData).toBe(false);
  });

  it("throws if capability.slug is missing", async () => {
    const { persistCapability } = await importPersist();
    const cap = { ...baseCapability(), slug: undefined };
    await expect(
      persistCapability({ capability: cap as never }, { mode: "create" }),
    ).rejects.toThrow(/slug is required/);
  });
});
