/**
 * Unit tests for persistCapability (Cluster 2 Phase 3).
 *
 * C2 contract exercised:
 *   1. mode='create': INSERT capability + test_suites + limitations inside
 *      one transaction, COMMIT, then call onCapabilityCreated OUTSIDE the
 *      transaction (design doc §4.3). On success: no hook_failed marker.
 *   2. mode='create' with hook throwing: transaction already committed;
 *      hook-failed marker fires as a separate (non-tx) UPDATE. Caller sees
 *      hookFailed=true. Error logged.
 *   3. mode='update': UPDATE capability by slug inside the tx, then post-
 *      commit hook. Same hook-failure semantics as create.
 *   4. mode='upsert': INSERT ... ON CONFLICT DO UPDATE on slug. Hook fires
 *      post-commit.
 *   5. Paranoia: if the hook-failed marker UPDATE itself throws, the outer
 *      return shape stays intact (logged at ERROR, swallowed).
 *   6. F-B-008: `processesPersonalData: null` is stripped from values so
 *      the DB default applies.
 *
 * Hook-ordering invariant: in C2, the hook is called AFTER db.transaction
 * resolves. These tests record event order via `state.events` to assert
 * the hook never fires before the tx callback returns.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock state ──────────────────────────────────────────────────────────────
type Event =
  | { type: "tx-begin" }
  | { type: "tx-end" }
  | { type: "hook-called" }
  | { type: "insert"; inTx: boolean; table: string; values: Record<string, unknown> }
  | { type: "update"; inTx: boolean; table: string; set: Record<string, unknown>; whereSlug: string }
  | { type: "onConflictDoUpdate"; inTx: boolean; table: string; set: Record<string, unknown> };

const state = {
  events: [] as Event[],
  transactionRolledBack: false,
  hookImpl: async (_slug: string) => { /* default: succeeds */ },
  markerUpdateImpl: async () => { /* default: succeeds */ },
  insideTx: false,
  __whereSlugHint: undefined as string | undefined,
};

function recordInsert(inTx: boolean, table: string, values: Record<string, unknown>) {
  state.events.push({ type: "insert", inTx, table, values });
}
function recordUpdate(inTx: boolean, table: string, set: Record<string, unknown>, whereSlug: string) {
  state.events.push({ type: "update", inTx, table, set, whereSlug });
}

function makeTxOrDbInsert(inTx: boolean, tableOf: (t: unknown) => string) {
  return (table: unknown) => {
    const tbl = tableOf(table);
    // Insert builder: supports both .values() (terminal) and .values().onConflictDoUpdate()
    return {
      values: (v: Record<string, unknown>) => {
        const thenable = {
          onConflictDoUpdate: async (cfg: { target: unknown; set: Record<string, unknown> }) => {
            state.events.push({ type: "onConflictDoUpdate", inTx, table: tbl, set: cfg.set });
            recordInsert(inTx, tbl, v); // record the INSERT side too for upsert
          },
          then: (resolve: () => void) => {
            recordInsert(inTx, tbl, v);
            resolve();
          },
        };
        return thenable;
      },
    };
  };
}

function makeTxOrDbUpdate(inTx: boolean, tableOf: (t: unknown) => string, onUpdate?: () => Promise<void>) {
  return (table: unknown) => ({
    set: (s: Record<string, unknown>) => ({
      where: async (clause: unknown) => {
        const slug = state.__whereSlugHint ?? "?";
        recordUpdate(inTx, tableOf(table), s, slug);
        void clause;
        if (onUpdate) await onUpdate();
      },
    }),
  });
}

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

vi.mock("../db/schema.js", () => ({
  capabilities: { __tableName: "capabilities", slug: "capabilities.slug" },
  testSuites: { __tableName: "test_suites" },
  capabilityLimitations: { __tableName: "capability_limitations" },
}));

vi.mock("../db/index.js", () => {
  const tableOf = (t: unknown) => (t as { __tableName?: string }).__tableName ?? "unknown";
  return {
    getDb: () => ({
      transaction: async (cb: (tx: unknown) => Promise<void>) => {
        state.events.push({ type: "tx-begin" });
        state.insideTx = true;
        try {
          const tx = {
            insert: makeTxOrDbInsert(true, tableOf),
            update: makeTxOrDbUpdate(true, tableOf),
            // DEC-20260423-B Stage B.2: persistCapability runs
            // `SELECT set_config('strale.capability_insert_token', ...)`
            // at the top of its tx to satisfy the new INSERT trigger.
            // Mock as no-op for unit tests (no real DB, no trigger).
            execute: async (_stmt: unknown) => { void _stmt; return []; },
          };
          await cb(tx);
        } catch (err) {
          state.transactionRolledBack = true;
          state.insideTx = false;
          throw err;
        } finally {
          state.insideTx = false;
          state.events.push({ type: "tx-end" });
        }
      },
      insert: makeTxOrDbInsert(false, tableOf),
      update: makeTxOrDbUpdate(false, tableOf, () => state.markerUpdateImpl()),
    }),
  };
});

vi.mock("./capability-onboarding.js", () => ({
  onCapabilityCreated: async (slug: string) => {
    state.events.push({ type: "hook-called" });
    return state.hookImpl(slug);
  },
}));

vi.mock("./log.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

beforeEach(() => {
  state.events = [];
  state.transactionRolledBack = false;
  state.hookImpl = async () => { /* succeeds */ };
  state.markerUpdateImpl = async () => { /* succeeds */ };
  state.insideTx = false;
  state.__whereSlugHint = undefined;
});

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

// ── Helpers for event-order assertions ──────────────────────────────────────
function eventTypes(): string[] {
  return state.events.map((e) => e.type);
}
function findInsert(inTx: boolean, table: string) {
  return state.events.find((e) => e.type === "insert" && e.inTx === inTx && e.table === table) as Extract<Event, { type: "insert" }> | undefined;
}
function findUpdates(inTx: boolean, table: string) {
  return state.events.filter((e) => e.type === "update" && e.inTx === inTx && e.table === table) as Extract<Event, { type: "update" }>[];
}

describe("persistCapability (Cluster 2 Phase 3 C2)", () => {
  // ── mode='create' ────────────────────────────────────────────────────────

  it("mode=create: tx commits with inserts, hook fires AFTER tx-end, no hook_failed marker", async () => {
    const { persistCapability } = await importPersist();
    const result = await persistCapability(
      {
        capability: baseCapability() as never,
        testSuites: [{ capabilitySlug: "test-cap", testName: "t1", testType: "schema_check", input: {}, validationRules: { checks: [] }, scheduleTier: "A", estimatedCostCents: 0 } as never],
        limitations: [{ limitationText: "Short-lived", category: "coverage", severity: "info", sortOrder: 0 } as never],
      },
      { mode: "create" },
    );
    expect(result.hookFailed).toBe(false);

    // Ordering invariant: tx-end precedes hook-called.
    const types = eventTypes();
    const txEndIdx = types.indexOf("tx-end");
    const hookIdx = types.indexOf("hook-called");
    expect(txEndIdx).toBeGreaterThan(-1);
    expect(hookIdx).toBeGreaterThan(txEndIdx);

    // Inserts happened inside the tx.
    expect(findInsert(true, "capabilities")).toBeDefined();
    expect(findInsert(true, "test_suites")).toBeDefined();
    expect(findInsert(true, "capability_limitations")).toBeDefined();

    // No hook_failed marker on the happy path.
    const markerUpdates = state.events.filter(
      (e) => e.type === "update" && (e as Extract<Event, { type: "update" }>).set.lifecycleState === "hook_failed",
    );
    expect(markerUpdates).toHaveLength(0);
  });

  it("mode=create with hook throwing: tx commits, marker UPDATE fires OUTSIDE tx, hookFailed=true", async () => {
    state.hookImpl = async () => {
      throw new Error("Simulated hook failure (gate5 unsatisfied)");
    };
    const { persistCapability } = await importPersist();
    const result = await persistCapability(
      { capability: baseCapability() as never },
      { mode: "create" },
    );
    expect(result.hookFailed).toBe(true);
    expect(state.transactionRolledBack).toBe(false);

    // Capability was inserted inside the tx
    expect(findInsert(true, "capabilities")).toBeDefined();

    // hook_failed marker UPDATE is OUTSIDE the tx (inTx: false)
    const markerUpdates = state.events.filter(
      (e) => e.type === "update" && (e as Extract<Event, { type: "update" }>).set.lifecycleState === "hook_failed",
    ) as Extract<Event, { type: "update" }>[];
    expect(markerUpdates).toHaveLength(1);
    expect(markerUpdates[0].inTx).toBe(false);
    expect(markerUpdates[0].whereSlug).toBe("test-cap");
  });

  it("hook-failed marker UPDATE itself throwing is logged+swallowed; return shape consistent", async () => {
    state.hookImpl = async () => { throw new Error("hook boom"); };
    state.markerUpdateImpl = async () => { throw new Error("network blip on marker UPDATE"); };
    const { persistCapability } = await importPersist();
    // Must not reject: the paranoia catch inside persistCapability swallows.
    const result = await persistCapability(
      { capability: baseCapability() as never },
      { mode: "create" },
    );
    expect(result.hookFailed).toBe(true);
    expect(result.slug).toBe("test-cap");
    // Still a successful outer call — transaction already committed.
    expect(state.transactionRolledBack).toBe(false);
  });

  // ── mode='update' ────────────────────────────────────────────────────────

  it("mode=update: UPDATE inside tx, hook after commit, no marker on success", async () => {
    const { persistCapability } = await importPersist();
    const result = await persistCapability(
      { capability: { ...baseCapability(), description: "Updated description for backfill path." } as never },
      { mode: "update" },
    );
    expect(result.hookFailed).toBe(false);
    const txUpdates = findUpdates(true, "capabilities");
    expect(txUpdates.length).toBeGreaterThanOrEqual(1);
    expect(txUpdates[0].set.description).toContain("Updated description");

    // Ordering: tx-end precedes hook
    const types = eventTypes();
    expect(types.indexOf("hook-called")).toBeGreaterThan(types.indexOf("tx-end"));
  });

  it("mode=update with hook throwing: marker UPDATE runs outside tx", async () => {
    state.hookImpl = async () => { throw new Error("hook boom"); };
    const { persistCapability } = await importPersist();
    const result = await persistCapability(
      { capability: baseCapability() as never },
      { mode: "update" },
    );
    expect(result.hookFailed).toBe(true);
    const markerUpdates = state.events.filter(
      (e) => e.type === "update" && (e as Extract<Event, { type: "update" }>).set.lifecycleState === "hook_failed",
    ) as Extract<Event, { type: "update" }>[];
    expect(markerUpdates).toHaveLength(1);
    expect(markerUpdates[0].inTx).toBe(false);
  });

  // ── mode='upsert' (seed.ts path) ─────────────────────────────────────────

  it("mode=upsert: uses onConflictDoUpdate on capabilities.slug, hook fires post-commit", async () => {
    const { persistCapability } = await importPersist();
    const result = await persistCapability(
      { capability: baseCapability() as never },
      { mode: "upsert" },
    );
    expect(result.hookFailed).toBe(false);

    // onConflictDoUpdate event fired inside tx
    const conflicts = state.events.filter((e) => e.type === "onConflictDoUpdate") as Extract<Event, { type: "onConflictDoUpdate" }>[];
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].inTx).toBe(true);
    expect(conflicts[0].table).toBe("capabilities");

    // Hook still fires after tx
    const types = eventTypes();
    expect(types.indexOf("hook-called")).toBeGreaterThan(types.indexOf("tx-end"));
  });

  it("mode=upsert: caller can narrow the on-conflict-update set via upsertRefreshColumns", async () => {
    const { persistCapability } = await importPersist();
    await persistCapability(
      { capability: baseCapability() as never },
      { mode: "upsert", upsertRefreshColumns: { name: "Narrowed Name", updatedAt: new Date() } },
    );
    const conflicts = state.events.filter((e) => e.type === "onConflictDoUpdate") as Extract<Event, { type: "onConflictDoUpdate" }>[];
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].set.name).toBe("Narrowed Name");
    // Narrowing: slug should NOT be in the refresh set (caller didn't include it)
    expect(Object.prototype.hasOwnProperty.call(conflicts[0].set, "slug")).toBe(false);
  });

  // ── F-B-008 PII normalization (unchanged from C1) ────────────────────────

  it("F-B-008: processes_personal_data=null is stripped from INSERT", async () => {
    const { persistCapability } = await importPersist();
    const cap = { ...baseCapability(), processesPersonalData: null, personalDataCategories: null };
    await persistCapability({ capability: cap as never }, { mode: "create" });
    const inserted = findInsert(true, "capabilities")!.values;
    expect(Object.prototype.hasOwnProperty.call(inserted, "processesPersonalData")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(inserted, "personalDataCategories")).toBe(false);
  });

  it("F-B-008: processes_personal_data=false is preserved", async () => {
    const { persistCapability } = await importPersist();
    const cap = { ...baseCapability(), processesPersonalData: false };
    await persistCapability({ capability: cap as never }, { mode: "create" });
    const inserted = findInsert(true, "capabilities")!.values;
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
