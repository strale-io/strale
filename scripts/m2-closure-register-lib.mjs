// Validation for the authored M2 closure disposition register at
// docs/project/m2-closure-register.yaml.
//
// The JSON schema (docs/project/schemas/m2-closure-register.schema.json) owns
// field shapes. This module owns what a schema cannot see: agreement with the
// M1 bare inventory, the formal decision records, the collision registry, the
// private-archive status file, the derivation rules each disposition rests on,
// the public boundary (a row may be listed here only if its identity is
// already public on this repository's main), the canonical digests that bind
// the public rows to the private projection, the recomputed counts, and the
// version of the register already on the base branch (so rows cannot silently
// disappear).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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
// Where identities may already be public. The register itself is excluded so
// it cannot make an identity "public" by listing it.
const PUBLIC_SCOPES = ["docs", "archive", "AGENTS.md", "CLAUDE.md", "README.md"];

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
const URL_EVIDENCE =
  /^https:\/\/(github\.com\/strale-io\/(strale|strale-context-archive)\/(pull\/[0-9]+|issues\/[0-9]+|commit\/[0-9a-f]{7,40})|app\.notion\.com\/(p\/)?[0-9a-f]{32})$/;
// Forward-looking sentences in the migration plan that the register must reconcile.
const PLAN_STATEMENT_PATTERNS = [
  /^- Next:/, /^- Next M2 batches:/, /^- The next milestone is/, /^\*\*Next bounded task:\*\*/,
];

export function repoRootFrom(metaUrl) {
  return resolve(dirname(fileURLToPath(metaUrl)), "..");
}

export function loadRegister(root, relativePath = REGISTER_PATH) {
  return YAML.parse(readFileSync(resolve(root, relativePath), "utf8"));
}

export function loadRegisterSchema(root) {
  return JSON.parse(readFileSync(resolve(root, REGISTER_SCHEMA_PATH), "utf8"));
}

export const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/**
 * Canonical digest over identity rows. Titles never enter the digest in clear:
 * a row contributes its title hash (or the hash of its clear title). Public
 * and private projections use the same function, so the public digest can be
 * recomputed here and the private one by the operator script against the
 * archive.
 */
export function canonicalDigest(rows) {
  const lines = [...rows]
    .sort((a, b) => (a.page_id < b.page_id ? -1 : a.page_id > b.page_id ? 1 : 0))
    .map((r) =>
      [r.page_id, r.id ?? "", r.historical_status ?? "", r.historical_scope ?? "", r.decided_at,
        r.title_sha256 ?? sha256(r.title), r.disposition].join("|"),
    );
  return sha256(lines.join("\n") + "\n");
}

/** Tracked files as `git ls-files` reports them, forward-slashed, as a Set. */
export function trackedFiles(root) {
  const out = execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" });
  return new Set(out.split("\0").filter(Boolean));
}

function gitQuiet(root, args, opts = {}) {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024, ...opts });
  } catch {
    return null;
  }
}

/**
 * Identities (32-hex page ids, DEC-* ids) that are already public: present in
 * tracked text under the public scopes on the BASE ref (so a PR cannot widen
 * the boundary by adding a docs file alongside the register), or present in
 * the reviewed decision surfaces (records, collision registry, decision
 * README) in the index (so a batch that migrates a record can list its row in
 * the same PR). The register itself is always excluded. Returns
 * { available: false } when the base ref cannot be read.
 */
export function publicIdentities(root, baseRef = "origin/main") {
  const pageIds = new Set();
  const ids = new Set();
  if (gitQuiet(root, ["rev-parse", "--verify", "--quiet", `${baseRef}^{commit}`]) === null) {
    return { available: false, ref: baseRef, pageIds, ids };
  }
  const patterns = [["(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])", pageIds], ["DEC-[0-9]{8}-[A-Za-z0-9-]+", ids]];
  for (const [pattern, set] of patterns) {
    const fromBase = gitQuiet(root, ["grep", "-h", "-o", "-P", "-e", pattern, baseRef, "--", ...PUBLIC_SCOPES, `:(exclude)${REGISTER_PATH}`]) ?? "";
    const fromIndex = gitQuiet(root, ["grep", "--cached", "-h", "-o", "-P", "-e", pattern, "--", "docs/decisions", `:(exclude)${REGISTER_PATH}`]) ?? "";
    for (const m of `${fromBase}\n${fromIndex}`.split(/\s+/)) if (m) set.add(m);
  }
  return { available: true, ref: baseRef, pageIds, ids };
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

/**
 * The register as it exists on the base ref. Three outcomes are distinguished:
 * { available: true, register } — base ref readable and file present;
 * { available: true, register: null } — base ref readable, file absent (first introduction);
 * { available: false } — base ref unreadable; removal checks cannot run and must say so.
 */
export function readBaseRegister(root, baseRef = "origin/main") {
  if (gitQuiet(root, ["rev-parse", "--verify", "--quiet", `${baseRef}^{commit}`]) === null) {
    return { available: false, ref: baseRef };
  }
  const content = gitQuiet(root, ["show", `${baseRef}:${REGISTER_PATH}`]);
  return { available: true, ref: baseRef, register: content === null ? null : YAML.parse(content) };
}

export function isAncestorOfHead(root, sha) {
  return gitQuiet(root, ["merge-base", "--is-ancestor", sha, "HEAD"]) !== null;
}

/** Forward-looking statements the plan file contains, as normalized sentences. */
export function requiredPlanStatements(planText) {
  const lines = planText.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!PLAN_STATEMENT_PATTERNS.some((p) => p.test(lines[i]))) continue;
    // A statement runs until the next blank line or the next list item / heading.
    let text = lines[i];
    for (let j = i + 1; j < lines.length; j += 1) {
      const l = lines[j];
      if (l.trim() === "" || /^(- |\d+\. |#|\*\*)/.test(l)) break;
      text += ` ${l.trim()}`;
    }
    out.push({ line: i + 1, text: normalizeWs(text.replace(/^- /, "").replace(/\*\*/g, "")) });
  }
  return out;
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
    tracked: trackedFiles(root),
    inventoryEntries: inventory.entries.map((e) => ({ path: e.path, owner_area: e.owner_area })),
    records: readFormalRecordSummaries(root),
    collisions,
    archiveRowCount: archiveStatus.pagination?.decisions?.rows_preserved ?? null,
    archiveCommit: archiveStatus.archive_commit ?? null,
    archiveRepository: archiveStatus.repository ?? null,
    base: readBaseRegister(root, baseRef),
    isAncestor: (sha) => isAncestorOfHead(root, sha),
    public: publicIdentities(root, baseRef),
  };
}

/** Null when the reference is acceptable, otherwise a short problem code. */
export function evidenceProblem(context, value) {
  const root = context?.root;
  if (typeof value !== "string" || value.trim() === "") return "EMPTY";
  if (URL_EVIDENCE.test(value)) return null;
  if (/^[a-z]+:\/\//i.test(value)) return "UNSUPPORTED_URL";
  const normalized = value.replace(/\\/g, "/");
  if (isAbsolute(value) || /^[A-Za-z]:/.test(value)) return "ABSOLUTE";
  if (normalized.split("/").some((s) => s === "..")) return "ESCAPES_ROOT";
  if (!root) return null;
  const absolute = resolve(root, normalized);
  if (!existsSync(absolute)) return "MISSING";
  if (!statSync(absolute).isFile()) return "IS_DIRECTORY";
  if (context.tracked && !context.tracked.has(normalized)) return "UNTRACKED";
  return null;
}

/** True when the tracked evidence file mentions the page id (dashed or not). */
function fileCites(context, file, pageId) {
  if (!context?.root || evidenceProblem(context, file) !== null) return false;
  const text = readFileSync(resolve(context.root, file), "utf8").replace(/-/g, "");
  return text.includes(pageId);
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

const normalizeWs = (s) => s.replace(/\s+/g, " ").trim();

/**
 * Returns findings ({code, path, detail}); empty means valid.
 */
export function validateClosureRegister(register, context, { schema, relativePath = REGISTER_PATH } = {}) {
  const findings = [];
  const finding = (code, detail) => findings.push({ code, path: relativePath, detail });

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (!validate(register)) {
    for (const err of validate.errors ?? []) finding("SCHEMA", `${err.instancePath || "/"} ${err.message}`);
    return findings;
  }

  const checkEvidence = (label, refs) => {
    for (const ev of refs) {
      const problem = evidenceProblem(context, ev);
      if (problem) finding("EVIDENCE_INVALID", `${label}: ${ev} (${problem})`);
    }
  };

  if (context.public && context.public.available === false) {
    finding("PUBLIC_BASE_UNAVAILABLE", `${context.public.ref} is not readable; the public-boundary check did not run`);
  }
  if (context.isAncestor && !context.isAncestor(register.audited_main)) {
    finding("AUDITED_MAIN_NOT_ANCESTOR", register.audited_main);
  }
  if (context.archiveCommit && register.sources.decision_archive.commit !== context.archiveCommit) {
    finding("ARCHIVE_COMMIT_MISMATCH", `${register.sources.decision_archive.commit} vs ${ARCHIVE_STATUS_PATH} ${context.archiveCommit}`);
  }
  if (context.archiveRepository && register.sources.decision_archive.repository !== context.archiveRepository) {
    finding("ARCHIVE_REPOSITORY_MISMATCH", register.sources.decision_archive.repository);
  }
  if (register.private_rows.repository !== register.sources.decision_archive.repository) {
    finding("PRIVATE_ROWS_REPOSITORY_MISMATCH", register.private_rows.repository);
  }

  // ---- Legacy inventory: exact set equality with the M1 bare inventory.
  const invByPath = new Map();
  for (const e of register.legacy_inventory) {
    if (invByPath.has(e.path)) finding("INVENTORY_DUPLICATE", e.path);
    invByPath.set(e.path, e);
    checkEvidence(`inventory ${e.path}`, e.evidence);
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
    if (fr.git_provenance !== undefined) checkEvidence(`formal record ${fr.record_key} git_provenance`, [fr.git_provenance]);
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
  const collisionIds = new Set();
  for (const c of context.collisions.collisions ?? []) {
    collisionIds.add(c.id);
    for (const r of c.records) collisionRows.set(r.source_page_id, { id: c.id, resolution_status: c.resolution_status, disposition: r.disposition, record_key: r.record_key, title: r.title });
  }
  if (register.sources.collision_registry.collision_count !== (context.collisions.collision_count ?? 0)) {
    finding("SOURCE_COUNT_DRIFT", `collision_registry.collision_count ${register.sources.collision_registry.collision_count} vs ${context.collisions.collision_count}`);
  }
  if (register.sources.collision_registry.row_count !== collisionRows.size) {
    finding("SOURCE_COUNT_DRIFT", `collision_registry.row_count ${register.sources.collision_registry.row_count} vs ${collisionRows.size}`);
  }

  // ---- Public decision rows.
  const rowsByPage = new Map();
  const idCounts = {};
  for (const row of register.decision_rows) {
    if (rowsByPage.has(row.page_id)) finding("DECISION_ROW_DUPLICATE", row.page_id);
    rowsByPage.set(row.page_id, row);
    if (row.id) idCounts[row.id] = (idCounts[row.id] ?? 0) + 1;
    if (!row.source_url.endsWith(row.page_id)) finding("DECISION_ROW_SOURCE_URL_MISMATCH", row.page_id);
  }
  const publicCount = register.decision_rows.length;
  const privateCount = register.private_rows.count;
  if (publicCount + privateCount !== register.sources.decision_archive.row_count) {
    finding("SOURCE_COUNT_DRIFT", `decision_archive.row_count ${register.sources.decision_archive.row_count} vs ${publicCount} public + ${privateCount} private`);
  }
  if (context.archiveRowCount != null && publicCount + privateCount !== context.archiveRowCount) {
    finding("DECISION_ROW_COUNT_DRIFT", `${publicCount + privateCount} rows vs ${context.archiveRowCount} preserved in ${ARCHIVE_STATUS_PATH}`);
  }
  const privateSum = Object.values(register.private_rows.counts_by_disposition).reduce((a, b) => a + b, 0);
  if (privateSum !== privateCount) finding("PRIVATE_ROWS_COUNT_DRIFT", `${privateSum} by disposition vs count ${privateCount}`);
  if (register.digests.public_rows.count !== publicCount) finding("DIGEST_COUNT_DRIFT", `public_rows.count ${register.digests.public_rows.count} vs ${publicCount}`);
  if (register.digests.all_rows.count !== publicCount + privateCount) finding("DIGEST_COUNT_DRIFT", `all_rows.count ${register.digests.all_rows.count} vs ${publicCount + privateCount}`);
  const recomputed = canonicalDigest(register.decision_rows);
  if (recomputed !== register.digests.public_rows.digest) finding("PUBLIC_DIGEST_MISMATCH", `recomputed ${recomputed.slice(0, 12)}… vs stored ${register.digests.public_rows.digest.slice(0, 12)}…`);

  const migratedByRecord = new Map();
  for (const row of register.decision_rows) {
    const d = row.disposition;
    const col = collisionRows.get(row.page_id);

    // Public boundary: identity must already be public elsewhere; a clear title
    // only where the collision registry publishes that exact string.
    if (context.public && context.public.available !== false) {
      if (!context.public.pageIds.has(row.page_id)) finding("DECISION_ROW_NOT_PUBLIC", `${row.page_id}: page id not published outside the register`);
      if (row.id && !context.public.ids.has(row.id)) finding("DECISION_ROW_NOT_PUBLIC", `${row.page_id}: id ${row.id} not published outside the register`);
    }
    if (row.title !== undefined && (!col || col.title !== row.title)) finding("DECISION_ROW_TITLE_NOT_PUBLIC", row.page_id);
    if (row.title === undefined && col && col.title !== undefined) finding("DECISION_ROW_TITLE_EXPECTED", row.page_id);

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
      if (row.collision && row.collision.kind !== "notion-duplicate") finding("DECISION_ROW_CROSS_SURFACE_ID_MISMATCH", `${row.page_id}: migrated rows may only carry registry collisions`);
    } else if (row.record_key) {
      finding("DECISION_ROW_RECORD_KEY_WITHOUT_MIGRATION", row.page_id);
    }

    if (d === "unresolved_collision" || d === "resolved_collision") {
      if (row.collision.kind === "notion-duplicate") {
        if (!col) finding("DECISION_ROW_COLLISION_NOT_IN_REGISTRY", row.page_id);
        else {
          if (col.id !== row.collision.id) finding("DECISION_ROW_COLLISION_ID_MISMATCH", row.page_id);
          if (col.resolution_status !== row.collision.resolution_status) finding("DECISION_ROW_COLLISION_STATUS_MISMATCH", row.page_id);
          if (col.disposition !== row.collision.row_disposition) finding("DECISION_ROW_COLLISION_ROW_DISPOSITION_MISMATCH", row.page_id);
          const expected = col.resolution_status === "unresolved" ? "unresolved_collision" : "resolved_collision";
          if (d !== expected) finding("DECISION_ROW_COLLISION_DISPOSITION_MISMATCH", `${row.page_id}: ${d} vs registry ${col.resolution_status}`);
        }
      } else {
        if (col) finding("DECISION_ROW_CROSS_SURFACE_IN_REGISTRY", row.page_id);
        if (row.collision.id !== row.id) finding("DECISION_ROW_CROSS_SURFACE_ID_MISMATCH", row.page_id);
        if (!row.evidence.some((ev) => fileCites(context, ev, row.page_id))) finding("DECISION_ROW_NOT_CITED_BY_EVIDENCE", row.page_id);
      }
    } else if (col && d !== "formally_migrated") {
      finding("DECISION_ROW_COLLISION_UNDECLARED", `${row.page_id} is in the collision registry but classified ${d}`);
    }

    if (d === "intentionally_historical" && !row.evidence.some((ev) => fileCites(context, ev, row.page_id))) {
      finding("DECISION_ROW_NOT_CITED_BY_EVIDENCE", row.page_id);
    }
    if (d === "not_yet_reconciled" && row.historical_status !== "active") finding("DECISION_ROW_PENDING_NOT_ACTIVE", row.page_id);
    if (d === "obsolete_or_superseded" && !["superseded", "reversed"].includes(row.historical_status)) finding("DECISION_ROW_OBSOLETE_BUT_ACTIVE", row.page_id);
    if (d === "unclear" && row.id) finding("DECISION_ROW_UNCLEAR_WITH_ID", row.page_id);
    if (d !== "unclear" && !row.id) finding("DECISION_ROW_BLANK_ID_NOT_UNCLEAR", row.page_id);

    checkEvidence(row.page_id, row.evidence);
  }
  for (const pageId of collisionRows.keys()) if (!rowsByPage.has(pageId)) finding("DECISION_ROW_MISSING_FROM_REGISTER", pageId);
  for (const fr of register.formal_records) {
    const rows = migratedByRecord.get(fr.record_key) ?? [];
    if (fr.source_kind === "notion-row") {
      for (const pid of fr.source_rows) if (!rows.includes(pid)) finding("FORMAL_RECORD_SOURCE_ROW_NOT_MIGRATED", `${fr.record_key}: ${pid}`);
      for (const pid of rows) if (!fr.source_rows.includes(pid)) finding("FORMAL_RECORD_SOURCE_ROW_UNLISTED", `${fr.record_key}: ${pid}`);
    } else if (rows.length > 0) {
      finding("FORMAL_RECORD_GIT_NATIVE_WITH_ROWS", fr.record_key);
    }
  }
  // Private rows can never hold dispositions that are public by construction;
  // the schema's closed counts_by_disposition key set enforces this.

  // ---- Plan statements: every forward statement in the plan must be quoted, and every quote must exist.
  const planPath = register.sources.migration_plan.path;
  const planRaw = context.root && evidenceProblem(context, planPath) === null
    ? readFileSync(resolve(context.root, planPath), "utf8")
    : null;
  const planText = planRaw === null ? null : normalizeWs(planRaw);
  for (const p of register.plan_statements) {
    checkEvidence(`plan statement ${p.location}`, p.evidence);
    if (planText !== null && !planText.includes(normalizeWs(p.quote))) finding("PLAN_QUOTE_NOT_FOUND", p.location);
  }
  if (planRaw === null) finding("EVIDENCE_INVALID", `migration_plan: ${planPath} (${evidenceProblem(context, planPath) ?? "unreadable"})`);
  else {
    const quotes = register.plan_statements.map((p) => normalizeWs(p.quote));
    for (const s of requiredPlanStatements(planRaw)) {
      const head = s.text.slice(0, 60);
      // A quote reconciles a statement only if it covers the statement's opening
      // (its first 60 characters) or is itself contained in the statement and at
      // least 60 characters long; a ten-character fragment does not count.
      if (!quotes.some((q) => q.includes(head) || (q.length >= 60 && s.text.includes(q)))) finding("PLAN_STATEMENT_UNRECONCILED", `${planPath}:${s.line} ${head}`);
    }
  }

  // ---- Exit gaps: unique, and every open bucket must be covered.
  const gapIds = new Set();
  const covered = new Set();
  for (const g of register.exit_gaps) {
    if (gapIds.has(g.id)) finding("EXIT_GAP_DUPLICATE", g.id);
    gapIds.add(g.id);
    for (const c of g.covers) covered.add(c);
    checkEvidence(g.id, g.evidence);
  }
  const totals = register.counts.decision_rows;
  for (const d of ["not_yet_reconciled", "unresolved_collision", "intentionally_historical", "obsolete_or_superseded", "unclear"]) {
    if ((totals[d] ?? 0) > 0 && !covered.has(`decision_rows.${d}`)) finding("EXIT_GAP_UNCOVERED", `decision_rows.${d} (${totals[d]} rows) has no gap`);
  }
  if (register.legacy_inventory.some((e) => e.progress !== "complete") && !covered.has("legacy_inventory.incomplete")) {
    finding("EXIT_GAP_UNCOVERED", "legacy_inventory.incomplete has no gap");
  }
  if (register.formal_records.some((fr) => fr.source_kind === "git-native") && !covered.has("formal_records.git_native")) {
    finding("EXIT_GAP_UNCOVERED", "formal_records.git_native has no gap");
  }

  // ---- Next batch: cutoff anchored to a public row; public eligibility exact.
  const nb = register.next_decision_batch;
  const anchor = register.decision_rows.find((r) => r.id === nb.cutoff_anchor_id);
  if (!anchor) finding("NEXT_BATCH_ANCHOR_UNKNOWN", nb.cutoff_anchor_id);
  else if (anchor.decided_at !== nb.decided_on_or_after) finding("NEXT_BATCH_CUTOFF_MISMATCH", `${nb.decided_on_or_after} vs ${nb.cutoff_anchor_id} decided ${anchor.decided_at}`);
  // Uniqueness is judged over the public rows plus the collision registry; every
  // registry row is public (DECISION_ROW_MISSING_FROM_REGISTER), so this equals
  // the all-rows rule the operator script applies to the private projection.
  const eligible = (row) =>
    row.disposition === "not_yet_reconciled" &&
    row.historical_status === "active" &&
    row.id &&
    (idCounts[row.id] ?? 0) === 1 &&
    !collisionRows.has(row.page_id) &&
    !collisionIds.has(row.id) &&
    row.decided_at >= nb.decided_on_or_after;
  const candidateIds = new Set();
  for (const c of nb.candidates) {
    const row = rowsByPage.get(c.page_id);
    if (!row) { finding("NEXT_BATCH_ROW_UNKNOWN", c.page_id); continue; }
    if (row.id !== c.id) finding("NEXT_BATCH_ID_MISMATCH", c.page_id);
    if (row.disposition !== "not_yet_reconciled") finding("NEXT_BATCH_ROW_NOT_PENDING", `${c.page_id} is ${row.disposition}`);
    if ((idCounts[c.id] ?? 0) !== 1) finding("NEXT_BATCH_ID_NOT_UNIQUE", c.id);
    if (collisionRows.has(c.page_id) || collisionIds.has(c.id)) finding("NEXT_BATCH_COLLIDES", c.id);
    if (row.historical_status !== "active") finding("NEXT_BATCH_NOT_ACTIVE", c.id);
    if (row.decided_at < nb.decided_on_or_after) finding("NEXT_BATCH_TOO_OLD", `${c.id} decided ${row.decided_at}`);
    if (candidateIds.has(c.page_id)) finding("NEXT_BATCH_DUPLICATE", c.page_id);
    candidateIds.add(c.page_id);
  }
  for (const row of register.decision_rows) {
    if (eligible(row) && !candidateIds.has(row.page_id)) finding("NEXT_BATCH_INCOMPLETE", `${row.id} is eligible but not listed`);
  }
  if (nb.private_candidates.count > privateCount) finding("NEXT_BATCH_PRIVATE_COUNT_EXCEEDS", `${nb.private_candidates.count} > ${privateCount}`);

  // ---- Counts must equal what the rows say (public rows plus the private projection).
  const invCounts = { ...countBy(register.legacy_inventory, "disposition"), total: register.legacy_inventory.length };
  const decCounts = { ...countBy(register.decision_rows, "disposition") };
  for (const [d, n] of Object.entries(register.private_rows.counts_by_disposition)) decCounts[d] = (decCounts[d] ?? 0) + n;
  decCounts.total = publicCount + privateCount;
  const planCounts = { ...countBy(register.plan_statements, "disposition"), total: register.plan_statements.length };
  const gapCounts = { blocking: register.exit_gaps.filter((g) => g.blocking).length, non_blocking: register.exit_gaps.filter((g) => !g.blocking).length };
  for (const d of countsMatch(invCounts, register.counts.legacy_inventory, [...INVENTORY_DISPOSITIONS, "total"])) finding("COUNT_DRIFT", `legacy_inventory ${d}`);
  for (const d of countsMatch(decCounts, register.counts.decision_rows, [...DECISION_DISPOSITIONS, "total"])) finding("COUNT_DRIFT", `decision_rows ${d}`);
  for (const d of countsMatch(planCounts, register.counts.plan_statements, [...PLAN_DISPOSITIONS, "total"])) finding("COUNT_DRIFT", `plan_statements ${d}`);
  for (const d of countsMatch(gapCounts, register.counts.exit_gaps, ["blocking", "non_blocking"])) finding("COUNT_DRIFT", `exit_gaps ${d}`);

  // ---- Silent removal: nothing present on the base may vanish. Fails closed
  // when the base is unreadable rather than skipping.
  const base = context.base;
  if (!base || base.available === false) {
    finding("BASE_REGISTER_UNAVAILABLE", `${base?.ref ?? "origin/main"} is not readable; removal checks did not run`);
  } else if (base.register && Array.isArray(base.register.decision_rows)) {
    for (const row of base.register.decision_rows) if (!rowsByPage.has(row.page_id)) finding("DECISION_ROW_REMOVED", row.page_id);
    for (const e of base.register.legacy_inventory ?? []) if (!invByPath.has(e.path)) finding("INVENTORY_ENTRY_REMOVED", e.path);
    for (const p of base.register.plan_statements ?? []) {
      if (!register.plan_statements.some((q) => q.location === p.location)) finding("PLAN_STATEMENT_REMOVED", p.location);
    }
    for (const g of base.register.exit_gaps ?? []) if (!gapIds.has(g.id)) finding("EXIT_GAP_REMOVED", g.id);
    const basePrivate = base.register.private_rows?.count ?? 0;
    if (privateCount + publicCount < basePrivate + (base.register.decision_rows?.length ?? 0)) {
      finding("DECISION_ROW_REMOVED", `total rows fell from ${basePrivate + base.register.decision_rows.length} to ${privateCount + publicCount}`);
    }
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
