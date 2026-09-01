// Validation for the authored M2 closure disposition register at
// docs/project/m2-closure-register.yaml.
//
// The JSON schema (docs/project/schemas/m2-closure-register.schema.json) owns
// field shapes. This module owns what a schema cannot see: agreement with the
// M1 bare inventory, the formal decision records, the collision registry, the
// private-archive status file, the recomputed counts, and the version of the
// register already on the base branch (so rows cannot silently disappear).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import YAML from "yaml";

export const REGISTER_PATH = "docs/project/m2-closure-register.yaml";
export const REGISTER_SCHEMA_PATH = "docs/project/schemas/m2-closure-register.schema.json";
const INVENTORY_PATH = "docs/project/legacy-authority-inventory.json";
const COLLISIONS_PATH = "docs/decisions/id-collisions.yaml";
const RECORDS_DIR = "docs/decisions/records";
const ARCHIVE_STATUS_PATH = "docs/project/private-archive-status.json";

export const INVENTORY_DISPOSITIONS = ["migrated", "evidence-only", "archive", "obsolete", "unclear"];
export const DECISION_DISPOSITIONS = [
  "formally_migrated",
  "unresolved_collision",
  "resolved_collision",
  "intentionally_historical",
  "obsolete_or_superseded",
  "not_yet_reconciled",
  "unclear",
];
export const PLAN_DISPOSITIONS = ["merged", "partially_merged", "superseded", "open"];
const URL_EVIDENCE = /^https:\/\/(github\.com\/strale-io\/[A-Za-z0-9._-]+\/(pull|commit|issues)\/[A-Za-z0-9]+|app\.notion\.com\/(p\/)?[0-9a-f]{32}(\?.*)?)$/;

export function repoRootFrom(metaUrl) {
  return resolve(dirname(fileURLToPath(metaUrl)), "..");
}

export function loadRegister(root, relativePath = REGISTER_PATH) {
  return YAML.parse(readFileSync(resolve(root, relativePath), "utf8"));
}

export function loadRegisterSchema(root) {
  return JSON.parse(readFileSync(resolve(root, REGISTER_SCHEMA_PATH), "utf8"));
}

/** Front matter of every formal record: { record_key, id, evidence[] }. */
export function readFormalRecordSummaries(root) {
  const dir = resolve(root, RECORDS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const content = readFileSync(resolve(dir, f), "utf8");
      const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      const meta = match ? YAML.parse(match[1]) : {};
      return { file: `${RECORDS_DIR}/${f}`, record_key: meta.record_key, id: meta.id, evidence: meta.evidence ?? [] };
    });
}

export function readBaseRegister(root, baseRef = "origin/main") {
  try {
    const content = execFileSync("git", ["-C", root, "show", `${baseRef}:${REGISTER_PATH}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return YAML.parse(content);
  } catch {
    return null; // no register on the base yet: first introduction
  }
}

/**
 * Gather every external fact the register must agree with. Tests pass a
 * hand-built context to exercise each check without touching disk.
 */
export function buildContext(root, { baseRef = "origin/main" } = {}) {
  const inventory = JSON.parse(readFileSync(resolve(root, INVENTORY_PATH), "utf8"));
  const collisions = YAML.parse(readFileSync(resolve(root, COLLISIONS_PATH), "utf8"));
  const archiveStatus = JSON.parse(readFileSync(resolve(root, ARCHIVE_STATUS_PATH), "utf8"));
  return {
    root,
    inventoryEntries: inventory.entries.map((e) => ({ path: e.path, owner_area: e.owner_area })),
    records: readFormalRecordSummaries(root),
    collisions,
    archiveRowCount: archiveStatus.pagination?.decisions?.rows_preserved ?? null,
    baseRegister: readBaseRegister(root, baseRef),
  };
}

function evidenceProblem(root, value) {
  if (typeof value !== "string" || value.trim() === "") return "EMPTY";
  if (URL_EVIDENCE.test(value)) return null;
  if (/^[a-z]+:\/\//i.test(value)) return "UNSUPPORTED_URL";
  const normalized = value.replace(/\\/g, "/");
  if (isAbsolute(value) || /^[A-Za-z]:/.test(value)) return "ABSOLUTE";
  if (normalized.split("/").some((s) => s === "..")) return "ESCAPES_ROOT";
  if (!root) return null;
  const absolute = resolve(root, normalized);
  if (!existsSync(absolute)) return "MISSING";
  if (!statSync(absolute).isFile() && !statSync(absolute).isDirectory()) return "NOT_A_FILE";
  return null;
}

function countBy(items, key) {
  const out = {};
  for (const item of items) out[item[key]] = (out[item[key]] ?? 0) + 1;
  return out;
}

function countsMatch(expected, actual, allowedKeys) {
  const diffs = [];
  for (const k of allowedKeys) {
    if ((expected[k] ?? 0) !== (actual[k] ?? 0)) diffs.push(`${k}: register says ${actual[k] ?? 0}, rows say ${expected[k] ?? 0}`);
  }
  return diffs;
}

/**
 * Returns findings ({code, path, detail}); empty means valid.
 */
export function validateClosureRegister(register, context, { schema, relativePath = REGISTER_PATH } = {}) {
  const findings = [];
  const finding = (code, detail) => findings.push({ code, path: relativePath, detail });
  const root = context?.root;

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (!validate(register)) {
    for (const err of validate.errors ?? []) finding("SCHEMA", `${err.instancePath || "/"} ${err.message}`);
    return findings;
  }

  // ---- Legacy inventory: exact set equality with the M1 bare inventory.
  const invByPath = new Map();
  for (const e of register.legacy_inventory) {
    if (invByPath.has(e.path)) finding("INVENTORY_DUPLICATE", e.path);
    invByPath.set(e.path, e);
  }
  const expectedInv = new Map(context.inventoryEntries.map((e) => [e.path, e]));
  for (const [path, e] of expectedInv) {
    if (!invByPath.has(path)) finding("INVENTORY_ENTRY_MISSING", path);
    else if (invByPath.get(path).owner_area !== e.owner_area) finding("INVENTORY_OWNER_AREA_MISMATCH", path);
  }
  for (const path of invByPath.keys()) if (!expectedInv.has(path)) finding("INVENTORY_ENTRY_UNKNOWN", path);
  if (register.sources.legacy_inventory.entry_count !== context.inventoryEntries.length) {
    finding("SOURCE_COUNT_DRIFT", `legacy_inventory.entry_count ${register.sources.legacy_inventory.entry_count} vs ${context.inventoryEntries.length}`);
  }

  // ---- Formal records: every record file is listed exactly once, and vice versa.
  const recordByKey = new Map(context.records.map((r) => [r.record_key, r]));
  const listedKeys = new Set();
  for (const fr of register.formal_records) {
    if (listedKeys.has(fr.record_key)) finding("FORMAL_RECORD_DUPLICATE", fr.record_key);
    listedKeys.add(fr.record_key);
    const actual = recordByKey.get(fr.record_key);
    if (!actual) {
      finding("FORMAL_RECORD_UNKNOWN", fr.record_key);
      continue;
    }
    if (actual.id !== fr.id) finding("FORMAL_RECORD_ID_MISMATCH", `${fr.record_key}: ${fr.id} vs ${actual.id}`);
  }
  for (const key of recordByKey.keys()) if (!listedKeys.has(key)) finding("FORMAL_RECORD_MISSING", key);
  if (register.sources.formal_records.record_count !== context.records.length) {
    finding("SOURCE_COUNT_DRIFT", `formal_records.record_count ${register.sources.formal_records.record_count} vs ${context.records.length}`);
  }

  // ---- Collision registry facts.
  const collisionRows = new Map();
  for (const c of context.collisions.collisions ?? []) {
    for (const r of c.records) collisionRows.set(r.source_page_id, { id: c.id, resolution_status: c.resolution_status, disposition: r.disposition, record_key: r.record_key });
  }
  if (register.sources.collision_registry.collision_count !== (context.collisions.collision_count ?? 0)) {
    finding("SOURCE_COUNT_DRIFT", `collision_registry.collision_count ${register.sources.collision_registry.collision_count} vs ${context.collisions.collision_count}`);
  }
  if (register.sources.collision_registry.row_count !== collisionRows.size) {
    finding("SOURCE_COUNT_DRIFT", `collision_registry.row_count ${register.sources.collision_registry.row_count} vs ${collisionRows.size}`);
  }

  // ---- Decision rows.
  const rowsByPage = new Map();
  const idCounts = {};
  for (const row of register.decision_rows) {
    if (rowsByPage.has(row.page_id)) finding("DECISION_ROW_DUPLICATE", row.page_id);
    rowsByPage.set(row.page_id, row);
    if (row.id) idCounts[row.id] = (idCounts[row.id] ?? 0) + 1;
    if (!row.source_url.endsWith(row.page_id)) finding("DECISION_ROW_SOURCE_URL_MISMATCH", row.page_id);
  }
  if (register.decision_rows.length !== register.sources.decision_archive.row_count) {
    finding("SOURCE_COUNT_DRIFT", `decision_archive.row_count ${register.sources.decision_archive.row_count} vs ${register.decision_rows.length} rows`);
  }
  if (context.archiveRowCount != null && register.decision_rows.length !== context.archiveRowCount) {
    finding("DECISION_ROW_COUNT_DRIFT", `${register.decision_rows.length} rows vs ${context.archiveRowCount} preserved in ${ARCHIVE_STATUS_PATH}`);
  }

  const migratedByRecord = new Map();
  for (const row of register.decision_rows) {
    const d = row.disposition;
    const col = collisionRows.get(row.page_id);
    if (d === "formally_migrated") {
      const rec = recordByKey.get(row.record_key);
      if (!rec) finding("DECISION_ROW_RECORD_UNKNOWN", `${row.page_id} -> ${row.record_key}`);
      else {
        if (rec.id !== row.id) finding("DECISION_ROW_RECORD_ID_MISMATCH", `${row.page_id}: ${row.id} vs ${rec.id}`);
        const cited = rec.evidence.join("\n").replace(/-/g, "").includes(row.page_id);
        if (!cited) finding("DECISION_ROW_NOT_CITED_BY_RECORD", `${row.page_id} not in evidence of ${row.record_key}`);
        migratedByRecord.set(row.record_key, [...(migratedByRecord.get(row.record_key) ?? []), row.page_id]);
      }
      if (col && col.resolution_status === "unresolved") finding("DECISION_ROW_MIGRATED_BUT_UNRESOLVED", row.page_id);
    } else if (row.record_key) {
      finding("DECISION_ROW_RECORD_KEY_WITHOUT_MIGRATION", row.page_id);
    }

    if (d === "unresolved_collision" || d === "resolved_collision") {
      const kind = row.collision?.kind ?? "notion-duplicate";
      if (kind === "notion-duplicate") {
        if (!col) finding("DECISION_ROW_COLLISION_NOT_IN_REGISTRY", row.page_id);
        else {
          if (col.id !== row.collision.id) finding("DECISION_ROW_COLLISION_ID_MISMATCH", row.page_id);
          if (col.resolution_status !== row.collision.resolution_status) finding("DECISION_ROW_COLLISION_STATUS_MISMATCH", row.page_id);
          if (col.disposition !== row.collision.row_disposition) finding("DECISION_ROW_COLLISION_DISPOSITION_MISMATCH", row.page_id);
          const expected = col.resolution_status === "unresolved" ? "unresolved_collision" : "resolved_collision";
          if (d !== expected) finding("DECISION_ROW_COLLISION_DISPOSITION_MISMATCH", `${row.page_id}: ${d} vs registry ${col.resolution_status}`);
        }
      } else if (col) {
        finding("DECISION_ROW_CROSS_SURFACE_IN_REGISTRY", row.page_id);
      }
    } else if (col && d !== "formally_migrated") {
      finding("DECISION_ROW_COLLISION_UNDECLARED", `${row.page_id} is in the collision registry but classified ${d}`);
    }

    if (d === "unclear" && row.id) finding("DECISION_ROW_UNCLEAR_WITH_ID", row.page_id);
    if (d !== "unclear" && !row.id) finding("DECISION_ROW_BLANK_ID_NOT_UNCLEAR", row.page_id);

    for (const ev of row.evidence) {
      const problem = evidenceProblem(root, ev);
      if (problem) finding("EVIDENCE_INVALID", `${row.page_id}: ${ev} (${problem})`);
    }
  }
  // Every collision-registry row must appear in the register.
  for (const pageId of collisionRows.keys()) if (!rowsByPage.has(pageId)) finding("DECISION_ROW_MISSING_FROM_REGISTER", pageId);
  // Formal records with Notion sources must be reachable from migrated rows.
  for (const fr of register.formal_records) {
    const rows = migratedByRecord.get(fr.record_key) ?? [];
    if (fr.source_kind === "notion-row") {
      for (const pid of fr.source_rows) if (!rows.includes(pid)) finding("FORMAL_RECORD_SOURCE_ROW_NOT_MIGRATED", `${fr.record_key}: ${pid}`);
      for (const pid of rows) if (!fr.source_rows.includes(pid)) finding("FORMAL_RECORD_SOURCE_ROW_UNLISTED", `${fr.record_key}: ${pid}`);
    } else if (rows.length > 0) {
      finding("FORMAL_RECORD_GIT_NATIVE_WITH_ROWS", fr.record_key);
    }
  }

  // ---- Other evidence references.
  for (const e of register.legacy_inventory) for (const ev of e.evidence) {
    const problem = evidenceProblem(root, ev);
    if (problem) finding("EVIDENCE_INVALID", `inventory ${e.path}: ${ev} (${problem})`);
  }
  for (const p of register.plan_statements) for (const ev of p.evidence) {
    const problem = evidenceProblem(root, ev);
    if (problem) finding("EVIDENCE_INVALID", `plan statement: ${ev} (${problem})`);
  }
  const gapIds = new Set();
  for (const g of register.exit_gaps) {
    if (gapIds.has(g.id)) finding("EXIT_GAP_DUPLICATE", g.id);
    gapIds.add(g.id);
    for (const ev of g.evidence) {
      const problem = evidenceProblem(root, ev);
      if (problem) finding("EVIDENCE_INVALID", `${g.id}: ${ev} (${problem})`);
    }
  }

  // ---- Next batch must be collision-free by construction.
  const candidateIds = new Set();
  for (const c of register.next_decision_batch.candidates) {
    const row = rowsByPage.get(c.page_id);
    if (!row) { finding("NEXT_BATCH_ROW_UNKNOWN", c.page_id); continue; }
    if (row.id !== c.id) finding("NEXT_BATCH_ID_MISMATCH", c.page_id);
    if (row.disposition !== "not_yet_reconciled") finding("NEXT_BATCH_ROW_NOT_PENDING", `${c.page_id} is ${row.disposition}`);
    if ((idCounts[c.id] ?? 0) !== 1) finding("NEXT_BATCH_ID_NOT_UNIQUE", c.id);
    if (collisionRows.has(c.page_id) || (context.collisions.collisions ?? []).some((x) => x.id === c.id)) finding("NEXT_BATCH_COLLIDES", c.id);
    if (row.historical_status !== "active") finding("NEXT_BATCH_NOT_ACTIVE", c.id);
    if (candidateIds.has(c.page_id)) finding("NEXT_BATCH_DUPLICATE", c.page_id);
    candidateIds.add(c.page_id);
  }

  // ---- Counts must equal what the rows say.
  const invCounts = { ...countBy(register.legacy_inventory, "disposition"), total: register.legacy_inventory.length };
  const decCounts = { ...countBy(register.decision_rows, "disposition"), total: register.decision_rows.length };
  const planCounts = { ...countBy(register.plan_statements, "disposition"), total: register.plan_statements.length };
  const gapCounts = { blocking: register.exit_gaps.filter((g) => g.blocking).length, non_blocking: register.exit_gaps.filter((g) => !g.blocking).length };
  for (const d of countsMatch(invCounts, register.counts.legacy_inventory, [...INVENTORY_DISPOSITIONS, "total"])) finding("COUNT_DRIFT", `legacy_inventory ${d}`);
  for (const d of countsMatch(decCounts, register.counts.decision_rows, [...DECISION_DISPOSITIONS, "total"])) finding("COUNT_DRIFT", `decision_rows ${d}`);
  for (const d of countsMatch(planCounts, register.counts.plan_statements, [...PLAN_DISPOSITIONS, "total"])) finding("COUNT_DRIFT", `plan_statements ${d}`);
  for (const d of countsMatch(gapCounts, register.counts.exit_gaps, ["blocking", "non_blocking"])) finding("COUNT_DRIFT", `exit_gaps ${d}`);

  // ---- Silent removal: nothing present on the base may vanish.
  const base = context.baseRegister;
  if (base && Array.isArray(base.decision_rows)) {
    for (const row of base.decision_rows) if (!rowsByPage.has(row.page_id)) finding("DECISION_ROW_REMOVED", row.page_id);
    for (const e of base.legacy_inventory ?? []) if (!invByPath.has(e.path)) finding("INVENTORY_ENTRY_REMOVED", e.path);
    for (const p of base.plan_statements ?? []) {
      if (!register.plan_statements.some((q) => q.location === p.location)) finding("PLAN_STATEMENT_REMOVED", p.location);
    }
    for (const g of base.exit_gaps ?? []) if (!gapIds.has(g.id)) finding("EXIT_GAP_REMOVED", g.id);
  }

  return findings;
}

export function checkClosureRegister(root, options = {}) {
  const path = resolve(root, REGISTER_PATH);
  if (!existsSync(path)) return [{ code: "CLOSURE_REGISTER_MISSING", path: REGISTER_PATH }];
  const schema = loadRegisterSchema(root);
  const register = loadRegister(root);
  const context = buildContext(root, options);
  return validateClosureRegister(register, context, { schema });
}
