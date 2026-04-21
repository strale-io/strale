/**
 * Unit tests for diffAndUpdateLimitations + limitationHash (F-B-012 /
 * Cluster 2 Phase 4 closure).
 *
 * These tests drive the helper with a mock queryable that records
 * insert/update/delete calls and serves pre-staged SELECT results. The
 * helper uses `.select().from().where()`, `.insert().values()`,
 * `.update().set().where()`, `.delete().where()` — all async-thenable
 * chains that the mock implements.
 *
 * The hash-stability test is pure (no mock needed).
 */
import { describe, it, expect, beforeEach } from "vitest";

type DbRow = {
  id: string;
  title: string | null;
  limitationText: string;
  category: string;
  severity: string;
  workaround: string | null;
  sortOrder: number;
};

type Op =
  | { type: "select" }
  | { type: "insert"; values: Record<string, unknown> }
  | { type: "update"; set: Record<string, unknown>; whereId: string }
  | { type: "delete"; whereIds: string[] };

type WhereClause = { kind: "eq"; col: string; val: unknown } | { kind: "and"; parts: unknown[] } | { kind: "inArray"; col: string; values: unknown[] };

const state = {
  ops: [] as Op[],
  existingRows: [] as DbRow[],
  whereId: undefined as string | undefined,
  whereIds: undefined as string[] | undefined,
};

// ── drizzle-orm mock: eq/and/inArray capture ids so delete/update knows
//    which row is being targeted. We don't reconstruct the full AST;
//    just grab the primary-key value the helper passes.
import { vi } from "vitest";

vi.mock("drizzle-orm", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    eq: (col: unknown, val: unknown): WhereClause => {
      const name = (col as { name?: string } | undefined)?.name;
      if (name === "id") state.whereId = String(val);
      return { kind: "eq", col: String(name ?? "?"), val };
    },
    and: (...parts: unknown[]): WhereClause => ({ kind: "and", parts }),
    inArray: (col: unknown, values: unknown[]): WhereClause => {
      const name = (col as { name?: string } | undefined)?.name;
      if (name === "id") state.whereIds = values.map(String);
      return { kind: "inArray", col: String(name ?? "?"), values };
    },
  };
});

vi.mock("../db/schema.js", () => ({
  capabilities: { __tableName: "capabilities", slug: { name: "slug" } },
  testSuites: { __tableName: "test_suites" },
  capabilityLimitations: {
    __tableName: "capability_limitations",
    id: { name: "id" },
    capabilitySlug: { name: "capability_slug" },
    title: { name: "title" },
    limitationText: { name: "limitation_text" },
    category: { name: "category" },
    severity: { name: "severity" },
    workaround: { name: "workaround" },
    active: { name: "active" },
    sortOrder: { name: "sort_order" },
  },
}));

vi.mock("../db/index.js", () => {
  // Build a queryable stub that covers select/insert/update/delete chains.
  const queryable = {
    select: (_cols?: unknown) => ({
      from: (_tbl: unknown) => ({
        where: async (_w: WhereClause) => {
          state.ops.push({ type: "select" });
          // Return a copy of the staged existing rows (helper sees whatever
          // the test staged via state.existingRows).
          return state.existingRows.map((r) => ({ ...r }));
        },
      }),
    }),
    insert: (_tbl: unknown) => ({
      values: (v: Record<string, unknown>) => {
        const thenable = {
          then: (resolve: () => void) => {
            state.ops.push({ type: "insert", values: v });
            resolve();
          },
        };
        return thenable;
      },
    }),
    update: (_tbl: unknown) => ({
      set: (s: Record<string, unknown>) => ({
        where: async (_w: WhereClause) => {
          state.ops.push({ type: "update", set: s, whereId: state.whereId ?? "?" });
          state.whereId = undefined;
        },
      }),
    }),
    delete: (_tbl: unknown) => ({
      where: async (_w: WhereClause) => {
        state.ops.push({ type: "delete", whereIds: state.whereIds ?? [] });
        state.whereIds = undefined;
      },
    }),
  };
  return {
    getDb: () => queryable,
  };
});

vi.mock("./capability-onboarding.js", () => ({
  onCapabilityCreated: async () => { /* no-op for helper tests */ },
}));

vi.mock("./log.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

beforeEach(() => {
  state.ops = [];
  state.existingRows = [];
  state.whereId = undefined;
  state.whereIds = undefined;
});

async function importHelper() {
  const mod = await import("./capability-persistence.js");
  const { getDb } = await import("../db/index.js");
  return { ...mod, queryable: getDb() };
}

const SLUG = "test-cap";

// Factory for manifest / DB rows sharing the same content-field shape.
function lim(
  title: string | null,
  text: string,
  category = "coverage",
  severity = "info",
  workaround: string | null = null,
) {
  return { title, limitationText: text, category, severity, workaround };
}

describe("limitationHash (F-B-012)", () => {
  it("is stable across spread / reordered keys", async () => {
    const { limitationHash } = await importHelper();
    const a = { title: "t", limitationText: "x", category: "c", severity: "info", workaround: null };
    const b = { workaround: null, severity: "info", category: "c", limitationText: "x", title: "t" };
    expect(limitationHash(a)).toBe(limitationHash(b));
  });

  it("differs when any of the 5 hashed fields changes", async () => {
    const { limitationHash } = await importHelper();
    const base = lim("t", "x", "coverage", "info", null);
    const h0 = limitationHash(base);
    expect(limitationHash({ ...base, title: "t2" })).not.toBe(h0);
    expect(limitationHash({ ...base, limitationText: "x2" })).not.toBe(h0);
    expect(limitationHash({ ...base, category: "accuracy" })).not.toBe(h0);
    expect(limitationHash({ ...base, severity: "warning" })).not.toBe(h0);
    expect(limitationHash({ ...base, workaround: "wa" })).not.toBe(h0);
  });

  it("normalizes null/undefined → empty string, trims whitespace", async () => {
    const { limitationHash } = await importHelper();
    const h1 = limitationHash(lim(null, "x"));
    const h2 = limitationHash(lim("", "x"));
    const h3 = limitationHash(lim("  ", "x"));
    expect(h2).toBe(h1);
    expect(h3).toBe(h1);
    // leading/trailing whitespace equivalence
    expect(limitationHash(lim("t", "x"))).toBe(limitationHash(lim(" t ", " x ")));
  });
});

describe("diffAndUpdateLimitations (F-B-012)", () => {
  function opsByType() {
    return {
      selects: state.ops.filter((o) => o.type === "select").length,
      inserts: state.ops.filter((o) => o.type === "insert").length,
      updates: state.ops.filter((o) => o.type === "update").length,
      deletes: state.ops.filter((o) => o.type === "delete").length,
    };
  }

  it("identical manifest no-op: 3 matching rows = no DELETE/INSERT/UPDATE", async () => {
    const { diffAndUpdateLimitations, queryable } = await importHelper();
    const manifest = [lim("a", "X"), lim("b", "Y"), lim("c", "Z")];
    state.existingRows = manifest.map((m, i) => ({ id: `id-${i}`, ...m, sortOrder: i }));

    const r = await diffAndUpdateLimitations(queryable as never, SLUG, manifest);
    expect(r).toEqual({ deleted: 0, inserted: 0, reordered: 0 });
    expect(opsByType().inserts).toBe(0);
    expect(opsByType().deletes).toBe(0);
    expect(opsByType().updates).toBe(0);
  });

  it("add one: manifest has 4, DB has 3 first matching", async () => {
    const { diffAndUpdateLimitations, queryable } = await importHelper();
    const dbLims = [lim("a", "X"), lim("b", "Y"), lim("c", "Z")];
    state.existingRows = dbLims.map((m, i) => ({ id: `id-${i}`, ...m, sortOrder: i }));
    const manifest = [...dbLims, lim("d", "W")];

    const r = await diffAndUpdateLimitations(queryable as never, SLUG, manifest);
    expect(r).toEqual({ deleted: 0, inserted: 1, reordered: 0 });
    const insertOps = state.ops.filter((o) => o.type === "insert");
    expect(insertOps).toHaveLength(1);
    expect((insertOps[0] as Extract<Op, { type: "insert" }>).values.sortOrder).toBe(3);
  });

  it("remove middle: manifest has 2, DB has 3 — 1 DELETE + 1 reorder of last", async () => {
    const { diffAndUpdateLimitations, queryable } = await importHelper();
    const dbLims = [lim("a", "X"), lim("b", "Y"), lim("c", "Z")];
    state.existingRows = dbLims.map((m, i) => ({ id: `id-${i}`, ...m, sortOrder: i }));
    const manifest = [lim("a", "X"), lim("c", "Z")]; // dropped middle

    const r = await diffAndUpdateLimitations(queryable as never, SLUG, manifest);
    expect(r).toEqual({ deleted: 1, inserted: 0, reordered: 1 });
    // id-1 ("b","Y") is the orphan
    const deleteOps = state.ops.filter((o) => o.type === "delete");
    expect((deleteOps[0] as Extract<Op, { type: "delete" }>).whereIds).toEqual(["id-1"]);
    // id-2 ("c","Z") moves from position 2 → 1
    const updateOps = state.ops.filter((o) => o.type === "update");
    expect(updateOps).toHaveLength(1);
    expect((updateOps[0] as Extract<Op, { type: "update" }>).whereId).toBe("id-2");
    expect((updateOps[0] as Extract<Op, { type: "update" }>).set.sortOrder).toBe(1);
  });

  it("edit one: manifest has 3 with middle text changed — 1 DELETE + 1 INSERT", async () => {
    const { diffAndUpdateLimitations, queryable } = await importHelper();
    const dbLims = [lim("a", "X"), lim("b", "Y"), lim("c", "Z")];
    state.existingRows = dbLims.map((m, i) => ({ id: `id-${i}`, ...m, sortOrder: i }));
    const manifest = [lim("a", "X"), lim("b", "Y-EDITED"), lim("c", "Z")];

    const r = await diffAndUpdateLimitations(queryable as never, SLUG, manifest);
    expect(r).toEqual({ deleted: 1, inserted: 1, reordered: 0 });
    const deleteOps = state.ops.filter((o) => o.type === "delete");
    expect((deleteOps[0] as Extract<Op, { type: "delete" }>).whereIds).toEqual(["id-1"]);
    const insertOps = state.ops.filter((o) => o.type === "insert");
    expect(insertOps).toHaveLength(1);
    expect((insertOps[0] as Extract<Op, { type: "insert" }>).values.limitationText).toBe("Y-EDITED");
    expect((insertOps[0] as Extract<Op, { type: "insert" }>).values.sortOrder).toBe(1);
  });

  it("reorder: manifest [B, A, C] with DB [A, B, C] — 2 reorders, no delete/insert", async () => {
    const { diffAndUpdateLimitations, queryable } = await importHelper();
    const dbLims = [lim("a", "X"), lim("b", "Y"), lim("c", "Z")];
    state.existingRows = dbLims.map((m, i) => ({ id: `id-${i}`, ...m, sortOrder: i }));
    const manifest = [lim("b", "Y"), lim("a", "X"), lim("c", "Z")];

    const r = await diffAndUpdateLimitations(queryable as never, SLUG, manifest);
    expect(r).toEqual({ deleted: 0, inserted: 0, reordered: 2 });
    expect(opsByType().inserts).toBe(0);
    expect(opsByType().deletes).toBe(0);
    const updateOps = state.ops.filter((o) => o.type === "update") as Array<Extract<Op, { type: "update" }>>;
    // id-0 (a) moves 0→1; id-1 (b) moves 1→0. id-2 (c) stays at 2.
    const updMap = new Map(updateOps.map((u) => [u.whereId, u.set.sortOrder]));
    expect(updMap.get("id-0")).toBe(1);
    expect(updMap.get("id-1")).toBe(0);
    expect(updMap.has("id-2")).toBe(false);
  });

  it("empty manifest: DB has 3 — DELETE all 3", async () => {
    const { diffAndUpdateLimitations, queryable } = await importHelper();
    const dbLims = [lim("a", "X"), lim("b", "Y"), lim("c", "Z")];
    state.existingRows = dbLims.map((m, i) => ({ id: `id-${i}`, ...m, sortOrder: i }));

    const r = await diffAndUpdateLimitations(queryable as never, SLUG, []);
    expect(r).toEqual({ deleted: 3, inserted: 0, reordered: 0 });
    const deleteOps = state.ops.filter((o) => o.type === "delete");
    expect(deleteOps).toHaveLength(1);
    expect((deleteOps[0] as Extract<Op, { type: "delete" }>).whereIds.sort()).toEqual(["id-0", "id-1", "id-2"]);
  });

  it("empty DB + 2 manifest: 2 INSERTs with correct sort_order", async () => {
    const { diffAndUpdateLimitations, queryable } = await importHelper();
    state.existingRows = [];
    const manifest = [lim("a", "X"), lim("b", "Y")];

    const r = await diffAndUpdateLimitations(queryable as never, SLUG, manifest);
    expect(r).toEqual({ deleted: 0, inserted: 2, reordered: 0 });
    const insertOps = state.ops.filter((o) => o.type === "insert") as Array<Extract<Op, { type: "insert" }>>;
    expect(insertOps).toHaveLength(2);
    expect(insertOps.map((o) => o.values.sortOrder).sort()).toEqual([0, 1]);
    expect(insertOps.every((o) => o.values.capabilitySlug === SLUG)).toBe(true);
  });
});
