import { beforeEach, describe, expect, it, vi } from "vitest";
import * as yaml from "js-yaml";
import { PgDialect } from "drizzle-orm/pg-core";
import { capabilities, capabilityLimitations } from "../db/schema.js";
import { runOnboarding } from "./onboarding-pipeline.js";
import * as persistence from "./capability-persistence.js";
import { onCapabilityCreated } from "./capability-onboarding.js";
import { getExecutor } from "../capabilities/index.js";
import { guardedExecute } from "../capabilities/guarded-executor.js";
import { checkReadiness, clearReadinessCache } from "./capability-readiness.js";
import { validateCapability } from "./onboarding-gates.js";

vi.mock("./capability-onboarding.js", () => ({ onCapabilityCreated: vi.fn() }));
const executor = vi.hoisted(() => vi.fn());
vi.mock("../capabilities/index.js", () => ({ getExecutor: vi.fn(() => executor) }));
vi.mock("../capabilities/guarded-executor.js", () => ({ guardedExecute: vi.fn(), seedCostMetaForOnboarding: vi.fn(), COST_CLASSES: [] }));
vi.mock("./capability-readiness.js", () => ({ checkReadiness: vi.fn(), clearReadinessCache: vi.fn() }));
vi.mock("./onboarding-gates.js", () => ({ validateCapability: vi.fn() }));

const slug = "sample-tool";
const limitation = (title = "Coverage", text = "Only published records.") => ({
  title, limitationText: text, category: "coverage", severity: "info", workaround: null,
});
const manifest = (limitations = [{ title: "Coverage", text: "Only published records.", category: "coverage" }]) => yaml.dump({
  slug, limitations,
  // Deliberately invalid unrelated metadata must not block text-only sync.
  price_cents: -1, test_fixtures: { known_answer: "stale" },
});

/** In-memory transaction harness. Runs the real diff; only COMMIT publishes
 * staged rows. Assert every write's table, including unexpected new writes. */
function database(active = true, exists = true) {
  const capability = { slug, isActive: active, visible: false, x402Enabled: false, lifecycleState: "suspended", priceCents: 77, name: "Existing name" };
  const state = { capabilities: exists ? [capability] : [], limitations: [] as any[] };
  const writes = vi.fn();
  const dialect = new PgDialect();
  const params = (condition: any) => dialect.sqlToQuery(condition).params;
  let failInsert = false;
  let failCommit = false;
  let afterInsert = () => {};
  const db = {
    transaction: vi.fn(async (callback: any) => {
      const staged = structuredClone(state);
      const tx = {
        select: () => ({ from: (table: unknown) => ({ where: (condition: any) => {
          const values = params(condition);
          if (table === capabilities) return { limit: async () => staged.capabilities.filter(row => values.includes(row.slug)) };
          expect(table).toBe(capabilityLimitations);
          return Promise.resolve(staged.limitations.filter(row => values.includes(row.capabilitySlug) && row.active));
        } }) }),
        delete: (table: unknown) => ({ where: async (condition: any) => {
          expect(table).toBe(capabilityLimitations);
          writes("delete", table);
          staged.limitations = staged.limitations.filter(row => !params(condition).includes(row.id));
        } }),
        insert: (table: unknown) => ({ values: async (row: any) => {
          expect(table).toBe(capabilityLimitations);
          writes("insert", table);
          if (failInsert) throw new Error("driver failure containing private values");
          staged.limitations.push({ id: `new-${staged.limitations.length}`, active: true, ...row });
          afterInsert();
        } }),
        update: (table: unknown) => ({ set: (patch: any) => ({ where: async (condition: any) => {
          expect(table).toBe(capabilityLimitations);
          writes("update", table);
          Object.assign(staged.limitations.find(row => params(condition).includes(row.id)), patch);
        } }) }),
      };
      const result = await callback(tx);
      if (failCommit) throw new Error("commit failed");
      Object.assign(state, staged);
      return result;
    }),
    // Top-level writes or reads would bypass the per-slug transaction.
    insert: vi.fn(() => { throw new Error("outside transaction"); }),
    update: vi.fn(() => { throw new Error("outside transaction"); }),
    delete: vi.fn(() => { throw new Error("outside transaction"); }),
  };
  return { db, state, writes, failInsert: () => { failInsert = true; }, failCommit: () => { failCommit = true; }, afterInsert: (fn: () => void) => { afterInsert = fn; } };
}
const sync = (db: any, opts = {}) => runOnboarding(db, { manifestYaml: manifest(), mode: "limitations", ...opts });
const stored = (id: string, row: ReturnType<typeof limitation>, sortOrder: number) => ({ id, capabilitySlug: slug, active: true, ...row, sortOrder });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(persistence, "persistCapability");
});
describe("text-only limitations mode", () => {
  it("never calls the executor, guarded executor, persistence, hooks, gates or readiness even with discover/fix", async () => {
    const { db } = database();
    expect((await sync(db, { discover: true, fix: true })).status).toBe("success");
    for (const spy of [executor, getExecutor, guardedExecute, persistence.persistCapability, onCapabilityCreated, validateCapability, checkReadiness, clearReadinessCache]) expect(spy).not.toHaveBeenCalled();
  });
  it("writes only capability_limitations, preserves every capability column and reports observer counts", async () => {
    const { db, state, writes } = database();
    state.limitations = [stored("old", limitation("Removed", "Old text"), 0), stored("kept", limitation("Moved", "Existing text"), 0)];
    const before = structuredClone(state.capabilities);
    const result = await sync(db, { manifestYaml: manifest([{ title: "Coverage", text: "Only published records.", category: "coverage" }, { title: "Moved", text: "Existing text", category: "coverage" }]) });
    expect(result.limitations).toMatchObject({ outcome: "updated", created: 1, updated: 1, deleted: 1 });
    expect(writes.mock.calls.map(([action]) => action)).toEqual(["delete", "insert", "update"]);
    expect(state.limitations.map(row => row.title)).toEqual(["Moved", "Coverage"]);
    expect(state.capabilities).toEqual(before);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });
  it("reports unchanged with no writes when text and order match", async () => {
    const { db, state, writes } = database();
    state.limitations = [stored("same", limitation(), 0)];
    const result = await sync(db);
    expect(result.limitations).toMatchObject({ outcome: "unchanged", created: 0, updated: 0, deleted: 0 });
    expect(writes).not.toHaveBeenCalled();
  });
  it("reports not_found with a reason and no writes for an unknown capability row", async () => {
    const { db, writes } = database(true, false);
    expect(await sync(db)).toMatchObject({ status: "failed", limitations: { outcome: "not_found", reason: expect.stringContaining("No existing capability row") } });
    expect(writes).not.toHaveBeenCalled();
  });
  it("syncs a deactivated row while preserving all its flags", async () => {
    const { db, state } = database(false);
    const before = structuredClone(state.capabilities);
    expect((await sync(db)).limitations?.outcome).toBe("updated");
    expect(state.limitations).toHaveLength(1);
    expect(state.capabilities).toEqual(before);
  });
  it.each(["insert", "commit"])("rolls back on %s failure, reports failed with no committed counts, and allows a later slug", async (failure) => {
    const harness = database();
    harness.state.limitations = [stored("old", limitation("Old", "Removed text"), 0)];
    const before = structuredClone(harness.state);
    if (failure === "insert") harness.failInsert(); else harness.failCommit();
    const result = await sync(harness.db);
    expect(result).toMatchObject({ status: "failed", rows: { created: [], updated: [], deleted: [] }, limitations: { outcome: "failed", created: 0, updated: 0, deleted: 0 } });
    expect(result.errors[0].message).not.toContain("private values");
    expect(harness.state).toEqual(before);
    expect((await sync(database().db)).limitations?.outcome).toBe("updated");
  });
  it("rolls back if aborted during the diff", async () => {
    const harness = database();
    const controller = new AbortController();
    harness.afterInsert(() => controller.abort());
    expect(await sync(harness.db, { signal: controller.signal })).toMatchObject({ status: "failed", errors: [{ code: "timeout" }] });
    expect(harness.state.limitations).toEqual([]);
  });
  it("does not begin a transaction after abort", async () => {
    const { db } = database();
    const controller = new AbortController(); controller.abort();
    expect((await sync(db, { signal: controller.signal })).status).toBe("failed");
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it("rejects malformed limitation data without deleting existing text", async () => {
    const { db } = database();
    expect((await sync(db, { manifestYaml: "slug: sample-tool\nlimitations: bad" })).status).toBe("failed");
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it("dry-run performs no diff writes even with discovery requested", async () => {
    const { db, writes } = database();
    expect(await sync(db, { dryRun: true, discover: true })).toMatchObject({ status: "success", limitations: { reason: "Dry run; nothing was written." } });
    expect(writes).not.toHaveBeenCalled();
    expect(guardedExecute).not.toHaveBeenCalled();
  });
});
