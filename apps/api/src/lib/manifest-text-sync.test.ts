import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { applyManifestText, textPayload, isReportOnly, MANIFEST_TEXT_BOOT_LIMIT, type TextManifest, type ManifestSource } from "./manifest-text-sync.js";
import { capabilities, capabilityLimitations } from "../db/schema.js";
import { manifestDrift, driftExitCode } from "./manifest-drift.js";
import { snakeToCamel } from "./capability-field-authority.js";
import { z } from "zod";
import { log } from "./log.js";
vi.mock("./capability-readiness.js", () => ({ clearReadinessCache: vi.fn() }));
const manifest = (slug = "test-tool"): TextManifest => ({ slug, name: "Reviewed", description: "Description", category: "data", data_source: "Source", input_schema: { type: "object" }, output_schema: { type: "object" }, output_field_reliability: { value: "guaranteed" }, limitations: [{ title: "New title", text: "Limited", category: "coverage" }], price_cents: 1, transparency_tag: "mixed", is_active: true });
const source = (m: TextManifest): ManifestSource => ({ slug: m.slug, load: async () => m });
function harness(ms: TextManifest[]) {
  const state = { rows: ms.map(m => ({ slug: m.slug, name: "Old", category: m.category, manifestTextHash: null, priceCents: 77, isActive: false, visible: false, isFreeTier: false, x402Enabled: false, lifecycleState: "suspended", transparencyTag: "algorithmic" })), limitations: [] as any[] };
  const writes: Array<{ table: unknown; patch: any }> = [];
  let failSlug = "";
  let failure: unknown = new Error("test failure");
  const rowLock = vi.fn();
  const dialect = new PgDialect();
  const params = (condition: any) => dialect.sqlToQuery(condition).params;
  const select = (staged: typeof state) => ({ from: (table: unknown) => {
    const all = table === capabilities ? staged.rows : staged.limitations;
    const result = Promise.resolve(all);
    return Object.assign(result, { where: (condition: any) => {
      const filtered = all.filter(row => params(condition).includes(row.slug ?? row.capabilitySlug));
      return Object.assign(Promise.resolve(filtered), { orderBy: async () => filtered, limit: () => ({ for: async (mode: string) => { rowLock(mode); return filtered; } }) });
    } });
  } });
  const db = { select: () => select(state), transaction: vi.fn(async (callback: any) => {
    const staged = structuredClone(state);
    const tx = {
      select: () => select(staged), execute: vi.fn(async () => []),
      update: (table: unknown) => ({ set: (patch: any) => ({ where: async (condition: any) => {
        const row = staged.rows.find(r => params(condition).includes(r.slug));
        if (row?.slug === failSlug) throw failure;
        writes.push({ table, patch }); Object.assign(row!, patch);
      } }) }),
      insert: (table: unknown) => ({ values: async (patch: any) => { writes.push({ table, patch }); staged.limitations.push({ id: "id", active: true, ...patch }); } }),
      delete: () => ({ where: async () => { staged.limitations = []; } }),
    };
    const outcome = await callback(tx); Object.assign(state, staged); return outcome;
  }) };
  const connection = { unsafe: vi.fn(async () => [{ acquired: true }]), release: vi.fn() };
  const reserve = vi.fn(async () => connection);
  Object.assign(db, { $client: { reserve } });
  return { db: db as any, state, writes, rowLock, connection, reserve,
    fail: (slug: string, err?: unknown) => { failSlug = slug; if (err) failure = err; } };

}
beforeEach(() => vi.restoreAllMocks());
it("updates only reviewed text and limitations, preserves ALL serving and DB-owned columns, and skips the second run", async () => {
  const m = manifest(); const h = harness([m]); const before = { ...h.state.rows[0] };
  expect(await applyManifestText(h.db, [source(m)])).toMatchObject({ updated: 1, failed: 0 });
  for (const key of ["priceCents", "isActive", "visible", "isFreeTier", "x402Enabled", "lifecycleState", "transparencyTag"] as const) expect(h.state.rows[0][key]).toEqual(before[key]);
  expect(h.state.limitations[0].title).toBe("New title");
  const patch = h.writes.find(w => w.table === capabilities)!.patch;
  expect(Object.keys(patch).sort()).toEqual(["name", "description", "category", "dataSource", "inputSchema", "outputSchema", "outputFieldReliability", "manifestTextHash"].sort());
  const written = h.writes.length;
  expect(await applyManifestText(h.db, [source(m)])).toMatchObject({ updated: 0, unchanged: 1 });
  expect(h.writes).toHaveLength(written);
});
it("compliance/methodology and DB classification guards report without writing", async () => {
  for (const category of ["compliance", "methodology"]) {
    const m = { ...manifest(), category }; const h = harness([m]);
    expect(await applyManifestText(h.db, [source(m)])).toMatchObject({ report_only: 1, updated: 0 });
    expect(h.writes).toEqual([]);
  }
  expect(isReportOnly(manifest(), { gdprArt22Classification: "screening_signal" })).toBe(true);
});
it("rolls back a failed row, continues to the next, and warns on zero progress", async () => {
  const ms = [manifest("a"), manifest("b")]; const h = harness(ms); h.fail("a");
  expect(await applyManifestText(h.db, ms.map(source))).toMatchObject({ updated: 1, failed: 1 });
  expect(h.state.rows[0].name).toBe("Old");
  expect(h.state.limitations.map(r => r.capabilitySlug)).toEqual(["b"]);
  const warn = vi.spyOn(log, "warn");
  expect(await applyManifestText(h.db, [source(ms[0])])).toMatchObject({ updated: 0, failed: 1 });
  expect(warn).toHaveBeenCalledWith(expect.objectContaining({ label: "manifest-text-sync-summary", updated: 0, failed: 1 }), expect.any(String));
});
it("bounds writes per boot and prioritises remaining work on the next boot", async () => {
  const ms = Array.from({ length: MANIFEST_TEXT_BOOT_LIMIT + 1 }, (_, i) => manifest(`tool-${i}`)); const h = harness(ms);
  expect(await applyManifestText(h.db, ms.map(source))).toMatchObject({ updated: MANIFEST_TEXT_BOOT_LIMIT, deferred: 1 });
  expect(await applyManifestText(h.db, ms.map(source))).toMatchObject({ updated: 1, unchanged: MANIFEST_TEXT_BOOT_LIMIT });
});
it("hash ignores YAML object key order and includes limitations", () => {
  const m = { ...manifest(), input_schema: { type: "object", properties: { a: { type: "string" }, b: { type: "number" } } } };
  expect(textPayload(m).hash).toBe(textPayload({ ...m, input_schema: { properties: { b: { type: "number" }, a: { type: "string" } }, type: "object" } }).hash);
  expect(textPayload(m).hash).not.toBe(textPayload({ ...m, limitations: [{ ...m.limitations[0], title: "Changed" }] }).hash);
});
it("bounds compliance reporting as well as writes", async () => {
  const ms = Array.from({ length: MANIFEST_TEXT_BOOT_LIMIT + 1 }, (_, i) => ({ ...manifest(`compliance-${i}`), category: "compliance" }));
  const h = harness(ms);
  expect(await applyManifestText(h.db, ms.map(source))).toMatchObject({ report_only: MANIFEST_TEXT_BOOT_LIMIT, updated: 0, deferred: 1 });
  expect(h.db.transaction).toHaveBeenCalledTimes(MANIFEST_TEXT_BOOT_LIMIT);
  expect(h.writes).toEqual([]);
});
it("is wired after listen with no awaited sync before serve", async () => {
  const { readFileSync } = await import("node:fs");
  const boot = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  const serve = boot.indexOf("const server = serve(");
  const sync = boot.indexOf('import("./lib/manifest-text-sync.js")');
  expect(serve).toBeGreaterThan(0);
  expect(sync).toBeGreaterThan(serve);
  expect(boot.slice(serve, sync)).toContain("void ");
});
it("loads the shipped source/dist manifest layout and validates actual reviewed text", async () => {
  const { readTextManifests } = await import("./manifest-text-sync.js");
  const inputs = await readTextManifests();
  expect(inputs.length).toBeGreaterThan(0);
  for (const input of inputs) expect((await input.load()).slug).toBe(input.slug);
});

it("uses NO KEY UPDATE and holds the session advisory lock across the run", async () => {
  const m = manifest(); const h = harness([m]);
  await applyManifestText(h.db, [source(m)]);
  expect(h.rowLock).toHaveBeenCalledWith("no key update");
  expect(h.connection.unsafe.mock.calls).toEqual([
    ["SELECT pg_try_advisory_lock(728103, 1) AS acquired"], ["SELECT pg_advisory_unlock(728103, 1)"],
  ]);
  expect(h.connection.release).toHaveBeenCalledOnce();
});
it("skips at info without reading manifests or writing when another boot owns the lock", async () => {
  const h = harness([manifest()]);
  h.connection.unsafe.mockResolvedValueOnce([{ acquired: false }]);
  const load = vi.fn(); const info = vi.spyOn(log, "info");
  expect(await applyManifestText(h.db, [{ slug: "test-tool", load }])).toMatchObject({ skipped: 1, updated: 0, failed: 0 });
  expect(load).not.toHaveBeenCalled(); expect(h.db.transaction).not.toHaveBeenCalled();
  expect(h.connection.unsafe).toHaveBeenCalledOnce();
  expect(h.connection.release).toHaveBeenCalledOnce();
  expect(info).toHaveBeenCalledWith(expect.objectContaining({ label: "manifest-text-sync-locked" }), expect.any(String));
});
it.each([[], undefined])("refuses empty/missing limitations from injected sources, preserving stored limitations: %s", async limitations => {
  const m = manifest(); const h = harness([m]);
  await applyManifestText(h.db, [source(m)]);
  const stored = structuredClone(h.state.limitations);
  const warn = vi.spyOn(log, "warn");
  expect(await applyManifestText(h.db, [source({ ...m, limitations } as TextManifest)])).toMatchObject({ failed: 1, updated: 0 });
  expect(h.state.limitations).toEqual(stored);
  expect(warn).toHaveBeenCalledWith(expect.objectContaining({ err_name: "ZodError", issues: expect.arrayContaining([expect.objectContaining({ path: "limitations" })]) }), expect.any(String));
});
it("logs failure names, PG codes and zod paths without error values, and releases on failure", async () => {
  for (const err of [Object.assign(new Error("SECRET"), { code: "55P03" }), new Error("SECRET query", { cause: Object.assign(new Error("SECRET bind"), { code: "55P03" }) }), new z.ZodError([{ code: "custom", path: ["output_schema", "value"], message: "SECRET" }])]) {
    const m = manifest(); const h = harness([m]); h.fail(m.slug, err);
    const warn = vi.spyOn(log, "warn");
    expect(await applyManifestText(h.db, [source(m)])).toMatchObject({ failed: 1 });
    expect(warn).toHaveBeenCalledWith(expect.objectContaining(err instanceof z.ZodError
      ? { err_name: "ZodError", issues: [{ path: "output_schema.value", code: "custom" }] }
      : { err_name: "Error", pg_code: "55P03" }), expect.any(String));
    expect(JSON.stringify(warn.mock.calls)).not.toContain("SECRET");
    expect(h.connection.release).toHaveBeenCalledOnce();
  }
});
it("strict sweep goes green after complete sync despite report-only and non-synced drift; writable drift fails", async () => {
  const m = { ...manifest(), maintenance_class: "new", price_cents: 2 };
  const gated = { ...manifest("gated"), category: "compliance" };
  const h = harness([m, gated]);
  expect(await applyManifestText(h.db, [source(m), source(gated)])).toMatchObject({ updated: 1, report_only: 1 });
  const sweep = () => [m, gated].map((input, i) => {
    const row = h.state.rows[i] as Record<string, unknown>;
    const snakeRow = Object.fromEntries(Object.keys(input).map(k => [k, row[snakeToCamel(k)]]));
    const limitations = h.state.limitations.filter(l => l.capabilitySlug === input.slug)
      .map(({ title, limitationText, category, severity, workaround }) => ({ title, limitationText, category, severity, workaround }));
    return manifestDrift(input, snakeRow, limitations);
  });
  const clean = sweep();
  expect(clean[0].nonSynced).toContain("maintenance_class"); expect(clean[0].dbOwned).toContain("price_cents");
  expect(clean[1].reportOnly).toContain("name");
  expect(driftExitCode(true, clean.reduce((n, d) => n + d.writable.length, 0), 0)).toBe(0);
  h.state.rows[0].name = "Out of band";
  expect(driftExitCode(true, sweep().reduce((n, d) => n + d.writable.length, 0), 0)).toBe(1);
});
