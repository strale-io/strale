import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DECISION_DISPOSITIONS,
  INVENTORY_DISPOSITIONS,
  buildContext,
  checkClosureRegister,
  loadRegister,
  loadRegisterSchema,
  repoRootFrom,
  validateClosureRegister,
} from "./m2-closure-register-lib.mjs";

const root = repoRootFrom(import.meta.url);
const schema = loadRegisterSchema(root);
const context = buildContext(root);
const base = () => loadRegister(root);
const codes = (register, ctx = context) =>
  validateClosureRegister(register, ctx, { schema }).map((f) => f.code);
const has = (register, code, ctx) => assert.ok(codes(register, ctx).includes(code), `expected ${code}`);
const row = (r, disposition) => r.decision_rows.find((x) => x.disposition === disposition);
const recount = (r) => {
  const by = (items, keys) => {
    const out = Object.fromEntries(keys.map((k) => [k, 0]));
    for (const i of items) out[i.disposition] += 1;
    out.total = items.length;
    return out;
  };
  r.counts.decision_rows = by(r.decision_rows, DECISION_DISPOSITIONS);
  r.counts.legacy_inventory = by(r.legacy_inventory, INVENTORY_DISPOSITIONS);
};

test("the committed register is valid against the live repository", () => {
  assert.deepEqual(checkClosureRegister(root), []);
});

test("an unsupported disposition is rejected in every section", () => {
  for (const section of ["legacy_inventory", "decision_rows", "plan_statements"]) {
    const r = base();
    r[section][0].disposition = "done";
    has(r, "SCHEMA");
  }
});

test("a missing inventory entry, an unknown one, and a duplicate are rejected", () => {
  const r = base();
  const removed = r.legacy_inventory.pop();
  has(r, "INVENTORY_ENTRY_MISSING");
  has(r, "INVENTORY_ENTRY_REMOVED", { ...context, baseRegister: base() });
  r.legacy_inventory.push({ ...removed, path: "docs/not-in-inventory" });
  has(r, "INVENTORY_ENTRY_UNKNOWN");
  const r2 = base();
  r2.legacy_inventory.push({ ...r2.legacy_inventory[0] });
  has(r2, "INVENTORY_DUPLICATE");
});

test("inventory owner_area must match the M1 inventory", () => {
  const r = base();
  r.legacy_inventory[0].owner_area = "somewhere-else";
  has(r, "INVENTORY_OWNER_AREA_MISMATCH");
});

test("a partial or not-started inventory entry must list remaining work", () => {
  const r = base();
  const e = r.legacy_inventory.find((x) => x.progress !== "complete");
  delete e.remaining;
  has(r, "SCHEMA");
});

test("a missing decision row is rejected as silent removal and as count drift", () => {
  const r = base();
  r.decision_rows.pop();
  has(r, "DECISION_ROW_REMOVED", { ...context, baseRegister: base() });
  has(r, "SOURCE_COUNT_DRIFT");
  has(r, "DECISION_ROW_COUNT_DRIFT");
  has(r, "COUNT_DRIFT");
});

test("a duplicate decision identity is rejected", () => {
  const r = base();
  r.decision_rows.push({ ...r.decision_rows[0] });
  recount(r);
  has(r, "DECISION_ROW_DUPLICATE");
});

test("count drift is rejected even when the rows are otherwise valid", () => {
  const r = base();
  r.counts.decision_rows.not_yet_reconciled += 1;
  r.counts.decision_rows.formally_migrated -= 1;
  has(r, "COUNT_DRIFT");
  const r2 = base();
  r2.counts.exit_gaps.blocking += 1;
  has(r2, "COUNT_DRIFT");
});

test("a migrated row must name a record that exists, has the same id, and cites the row", () => {
  const r = base();
  const m = row(r, "formally_migrated");
  m.record_key = "DEC-19990101-Z";
  has(r, "DECISION_ROW_RECORD_UNKNOWN");
  const r2 = base();
  const m2 = row(r2, "formally_migrated");
  const other = r2.decision_rows.find((x) => x.disposition === "formally_migrated" && x.record_key !== m2.record_key);
  m2.record_key = other.record_key;
  has(r2, "DECISION_ROW_RECORD_ID_MISMATCH");
});

test("a record key on a non-migrated row is rejected", () => {
  const r = base();
  row(r, "not_yet_reconciled").record_key = "DEC-20260428-A";
  has(r, "DECISION_ROW_RECORD_KEY_WITHOUT_MIGRATION");
});

test("every formal record file must be listed, and unknown ones rejected", () => {
  const r = base();
  const dropped = r.formal_records.pop();
  has(r, "FORMAL_RECORD_MISSING");
  r.formal_records.push({ ...dropped, record_key: "DEC-19990101-Z" });
  has(r, "FORMAL_RECORD_UNKNOWN");
});

test("a formal record's source rows must be migrated rows pointing back at it", () => {
  const r = base();
  const fr = r.formal_records.find((x) => x.source_kind === "notion-row");
  const m = r.decision_rows.find((x) => x.page_id === fr.source_rows[0]);
  m.disposition = "not_yet_reconciled";
  delete m.record_key;
  recount(r);
  has(r, "FORMAL_RECORD_SOURCE_ROW_NOT_MIGRATED");
});

test("collision rows must agree with the collision registry", () => {
  const r = base();
  const c = r.decision_rows.find((x) => x.disposition === "unresolved_collision" && x.collision.kind === "notion-duplicate");
  c.disposition = "not_yet_reconciled";
  recount(r);
  has(r, "DECISION_ROW_COLLISION_UNDECLARED");
  const r2 = base();
  const c2 = r2.decision_rows.find((x) => x.disposition === "unresolved_collision" && x.collision.kind === "notion-duplicate");
  c2.collision.id = "DEC-19990101-Z";
  has(r2, "DECISION_ROW_COLLISION_ID_MISMATCH");
  const r3 = base();
  const c3 = r3.decision_rows.find((x) => x.disposition === "unresolved_collision" && x.collision.kind === "notion-duplicate");
  c3.disposition = "resolved_collision";
  c3.collision.resolution_status = "resolved";
  recount(r3);
  has(r3, "DECISION_ROW_COLLISION_STATUS_MISMATCH");
});

test("a cross-surface collision must not also be a registry row, and a registry row must be present", () => {
  const r = base();
  const registryRow = r.decision_rows.find((x) => x.collision?.kind === "notion-duplicate");
  registryRow.collision.kind = "cross-surface";
  has(r, "DECISION_ROW_CROSS_SURFACE_IN_REGISTRY");
  const r2 = base();
  const gone = r2.decision_rows.find((x) => x.collision?.kind === "notion-duplicate");
  r2.decision_rows.splice(r2.decision_rows.indexOf(gone), 1);
  recount(r2);
  r2.sources.decision_archive.row_count -= 1;
  has(r2, "DECISION_ROW_MISSING_FROM_REGISTER", { ...context, baseRegister: null, archiveRowCount: null });
});

test("unclear rows have no id and blank-id rows are unclear", () => {
  const r = base();
  row(r, "unclear").id = "DEC-20260402-E";
  has(r, "SCHEMA");
  const r2 = base();
  row(r2, "not_yet_reconciled").id = null;
  has(r2, "DECISION_ROW_BLANK_ID_NOT_UNCLEAR");
});

test("invalid evidence sources are rejected in every section", () => {
  for (const bad of ["docs/does-not-exist.md", "../outside.md", "C:/Windows/system.ini", "ftp://example.org/x", "https://example.org/x"]) {
    const r = base();
    r.legacy_inventory[0].evidence = [bad];
    has(r, "EVIDENCE_INVALID");
    const r2 = base();
    row(r2, "formally_migrated").evidence = [bad];
    has(r2, "EVIDENCE_INVALID");
    const r3 = base();
    r3.exit_gaps[0].evidence = [bad];
    has(r3, "EVIDENCE_INVALID");
    const r4 = base();
    r4.plan_statements[0].evidence = [bad];
    has(r4, "EVIDENCE_INVALID");
  }
});

test("a migrated row must carry evidence and a record key", () => {
  const r = base();
  const m = row(r, "formally_migrated");
  m.evidence = [];
  has(r, "SCHEMA");
  const r2 = base();
  delete row(r2, "formally_migrated").record_key;
  has(r2, "SCHEMA");
});

test("the next batch may only contain pending, unique, active, collision-free rows", () => {
  const r = base();
  r.next_decision_batch.candidates[0].page_id = row(r, "formally_migrated").page_id;
  has(r, "NEXT_BATCH_ROW_NOT_PENDING");
  const r2 = base();
  const col = r2.decision_rows.find((x) => x.disposition === "unresolved_collision");
  r2.next_decision_batch.candidates[0] = { page_id: col.page_id, id: col.id, why: "planted collision candidate" };
  has(r2, "NEXT_BATCH_COLLIDES");
  const r3 = base();
  r3.next_decision_batch.candidates[0].page_id = "0".repeat(32);
  has(r3, "NEXT_BATCH_ROW_UNKNOWN");
  const r4 = base();
  const sup = row(r4, "obsolete_or_superseded");
  sup.disposition = "not_yet_reconciled";
  recount(r4);
  r4.next_decision_batch.candidates[0] = { page_id: sup.page_id, id: sup.id, why: "planted superseded candidate" };
  has(r4, "NEXT_BATCH_NOT_ACTIVE");
});

test("exit gaps cannot be silently removed or duplicated", () => {
  const r = base();
  const g = r.exit_gaps.pop();
  r.counts.exit_gaps[g.blocking ? "blocking" : "non_blocking"] -= 1;
  has(r, "EXIT_GAP_REMOVED", { ...context, baseRegister: base() });
  const r2 = base();
  r2.exit_gaps.push({ ...r2.exit_gaps[0] });
  r2.counts.exit_gaps[r2.exit_gaps[0].blocking ? "blocking" : "non_blocking"] += 1;
  has(r2, "EXIT_GAP_DUPLICATE");
});

test("plan statements cannot be silently removed", () => {
  const r = base();
  const p = r.plan_statements.pop();
  r.counts.plan_statements[p.disposition] -= 1;
  r.counts.plan_statements.total -= 1;
  has(r, "PLAN_STATEMENT_REMOVED", { ...context, baseRegister: base() });
});

test("source counts must match the live inventory, records, and registry", () => {
  const r = base();
  r.sources.formal_records.record_count += 1;
  r.sources.collision_registry.row_count += 1;
  r.sources.legacy_inventory.entry_count += 1;
  assert.equal(codes(r).filter((c) => c === "SOURCE_COUNT_DRIFT").length, 3);
});

test("the row total must equal the preserved-row count in the private archive status", () => {
  const r = base();
  has(r, "DECISION_ROW_COUNT_DRIFT", { ...context, archiveRowCount: context.archiveRowCount + 1 });
});

test("the register keeps its inactive-candidate markers", () => {
  for (const [k, v] of Object.entries({ authority_scope: "active", status: "active", complete: true, phase: "M4", authority_active: true })) {
    const r = base();
    r[k] = v;
    has(r, "SCHEMA");
  }
});
