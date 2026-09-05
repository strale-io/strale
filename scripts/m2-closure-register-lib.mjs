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
const MIGRATION_PLAN_PATH = "docs/strategy/2026-08-31-repo-native-operating-model-migration.md";
const TRACKS_PATH = "docs/programs/cto-readiness/tracks.yaml";
// The track register declares each track's relation to the M2 exit gate in a
// required `gate` field (see docs/programs/tracks.schema.json). Declarations
// are not trusted on their own: only the tracks below may stand outside the
// gate (they are the hygiene, remediation, structure, and M2 tracks the plan
// sequences independently of M3). Every other track, whatever it declares,
// must reach the m2-exit track and may not start while a blocking M2 gap
// remains. Adding an independent track is therefore a reviewed change to
// this list, never a field on the new track. Fail closed.
export const TRACKS_OUTSIDE_M2_GATE = Object.freeze({
  T1: "m2",    // M2 closure audit
  T2: "none",  // repo hygiene sweep
  T3: "none",  // hygiene enforcement
  T4: "none",  // remediation closure
  T5: "none",  // CTO-readable structure
  T11: "none", // website repo hygiene and design preservation (reviewed 2026-09-02: preservation work, no M2 dependency)
  T12: "none", // research contract (reviewed 2026-09-02: founder plan milestone 1; documentation contract, no M2 dependency)
  T13: "none", // design tokens as data (reviewed 2026-09-02: founder plan milestones 2-3; design contract, no M2 dependency)
  T14: "none", // cheap extras: env manifest, model registry, claims register (reviewed 2026-09-02: founder plan milestone 4, no M2 dependency)
  T15: "none", // test receipts and migration ledger (reviewed 2026-09-02: survey second wave; evidence conventions, no M2 dependency)
  T16: "none", // legal & data policy authority / WP14 (added 2026-09-02 by T4: founder_gated on DEC-20260815-A legal/regulator-facing decisions -- Dilisense DPA, real assent, checkin_b legal-text sign-off; independent of M2 repo-native-authority migration)
  T17: "none", // dependency remediation / WP13 (added 2026-09-03: upgrades the 10 advisories T4's triage found reachable; package.json and lockfile work, no M2 dependency)
  T18: "none", // network and resource safety substrate / WP12 (added 2026-09-04: outbound guard, connect-time re-check, byte/pixel caps, trusted-hop rule; apps/api code, no M2 dependency)
});

/**
 * Expected disposition of every legacy-authority source, transcribed from the
 * migration plan's section 9 migration map (and sections 5, 6, 7, 10 where
 * named). The register's classification must agree; changing this table is a
 * reviewed change to the audit's reading of the plan, not a data edit.
 */
export const EXPECTED_INVENTORY_DISPOSITIONS = Object.freeze({
  "AGENTS.md": "migrated",          // §7, §9: thin peer entrypoint
  "CLAUDE.md": "migrated",          // §6, §7, §9: thin peer entrypoint; protocols and decisions extracted
  ".claude/PROTOCOL.md": "archive", // §9: extract unique live rules; archive obsolete starter-kit system
  ".claude/RUNBOOK.md": "archive",
  ".claude/WORKFLOW.md": "archive",
  ".claude/BUILD.md": "archive",
  ".claude/NOTION.md": "archive",   // §9 groups NOTION with the starter-kit files: archive after extraction (§10 M4 retires the Notion dependency itself)
  ".claude/DISPATCH.yaml": "archive",
  ".claude/commands": "migrated",   // §9: keep useful tool affordances; rewrite against repo-native authorities
  ".agents/skills": "migrated",
  ".codex/hooks.json": "obsolete",  // §9: remove or replace only after a real shared bootstrap exists
  "docs/company": "migrated",       // §5, §9: governance, PENDING, records, operator actions; briefs archive
  "docs/strategy": "archive",       // §9: extract accepted decisions; archive dated papers as rationale
  "docs/remediation": "migrated",   // §5, §9: docs/programs/remediation; CURRENT-STATE replaced
  "handoff": "archive",             // §9: existing handoffs promote remaining truth, then archive
});
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
// The next-batch cutoff is the adoption of the readiness program: the formal
// record with this id. The register may not choose another anchor.
export const READINESS_ANCHOR_ID = "DEC-20260812-A";
// Symmetric to the `--notion-<page id>` qualifier: `--git-<sha>` names the
// commit that introduced the claim directly in Git. Capture group 1 is the
// bare id (key with the qualifier removed), group 2 is the sha as written in
// the key (7 to 40 lowercase hex).
const GIT_QUALIFIED_RECORD_KEY = /^(.+)--git-([0-9a-f]{7,40})$/;
const URL_EVIDENCE =
  /^https:\/\/(github\.com\/strale-io\/(strale|strale-context-archive)\/(pull\/[0-9]+|issues\/[0-9]+|commit\/[0-9a-f]{7,40})|app\.notion\.com\/(p\/)?[0-9a-f]{32})$/;
// Forward-looking sentences in the migration plan that the register must
// reconcile. Scope: the four directive forms below. The plan's top status
// line is not a work statement; it is checked by the resume checkpoint, not
// by this register.
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
    .map((r) => [r.page_id, r.id ?? "", r.historical_status ?? "", r.title_sha256 ?? sha256(r.title), r.disposition].join("|"));
  return sha256(lines.join("\n") + "\n");
}

/**
 * Aggregate commitment to scope and date for a set of rows whose clear values
 * are known (the archive, or the private projection). Public rows never carry
 * the values; the register stores only this digest for them.
 */
export function scopeDateDigest(triples) {
  const lines = [...triples].map(([p, scope, date]) => `${p}|${scope ?? ""}|${date}`).sort();
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

/**
 * Decision IDs that the live entrypoints use as Git-native protocol labels:
 * a heading of the form "<Name> Protocol (DEC-…)", which is how a protocol
 * introduced directly in Git carries its id. A Notion row reusing such an id
 * without a formal record is a cross-surface collision by construction. A
 * heading that merely mentions a Decision (for example a retired feature
 * "(retired … DEC-…)") is a reference to that Decision, not a competing
 * claim, and is deliberately not matched. Read from the index so the set
 * matches what the commit ships.
 */
export function gitNativeClaims(root) {
  const ids = new Set();
  for (const file of ["CLAUDE.md", "AGENTS.md"]) {
    const text = gitQuiet(root, ["show", `:${file}`]) ?? "";
    for (const line of text.split(/\r?\n/)) {
      if (!/^#{1,6}\s/.test(line)) continue;
      for (const m of line.matchAll(/Protocol\s*\((DEC-[0-9]{8}-[A-Za-z0-9-]+)\)/g)) ids.add(m[1]);
    }
  }
  return ids;
}

/**
 * Page ids cited by M2 source-gap reports (tracked files matching
 * archive/sessions/*-gaps.md, read from the index). A public row cited there,
 * and by nothing stronger, is intentionally historical by construction.
 */
export function gapReportCitations(root) {
  const files = (gitQuiet(root, ["ls-files", "--", "archive/sessions/*-gaps.md"]) ?? "").split(/\r?\n/).filter(Boolean);
  const byFile = new Map();
  for (const f of files) {
    const text = (gitQuiet(root, ["show", `:${f}`]) ?? "").replace(/-/g, "");
    byFile.set(f, new Set([...text.matchAll(/(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/g)].map((m) => m[0])));
  }
  return byFile;
}

/** Front matter of every formal record: { record_key, id, evidence[], pageIds[] }. */
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
      const evidence = meta.evidence ?? [];
      const pageIds = [...new Set([...evidence.join("\n").replace(/-/g, "").matchAll(/(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/g)].map((m) => m[0]))];
      return { file: `${RECORDS_DIR}/${f}`, record_key: meta.record_key, id: meta.id, evidence, pageIds, decided_at: meta.decided_at ? String(meta.decided_at).slice(0, 10) : null };
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
    archiveExportPath: archiveStatus.export_path ?? null,
    base: readBaseRegister(root, baseRef),
    isAncestor: (sha) => isAncestorOfHead(root, sha),
    public: publicIdentities(root, baseRef),
    gitNativeClaims: gitNativeClaims(root),
    gapCitations: gapReportCitations(root),
    tracks: existsSync(resolve(root, TRACKS_PATH)) ? YAML.parse(readFileSync(resolve(root, TRACKS_PATH), "utf8")) : null,
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

/**
 * A cross-surface collision row may resolve (resolved/documented_only)
 * exactly when (a) a git-qualified formal record exists whose id equals the
 * collision id, and (b) a tracked gap report cited in the row's own evidence
 * names the row's page id. Neither condition may be inferred from anything
 * else; both are checked directly against the record graph and the gap
 * citation index built from the index (context.gapCitations).
 */
function crossSurfaceResolutionEligible(context, recordByKey, row) {
  const hasGitQualifiedRecord = [...recordByKey.values()].some(
    (rec) => rec.id === row.collision.id && GIT_QUALIFIED_RECORD_KEY.test(rec.record_key ?? ""),
  );
  const citedByGapReport = (row.evidence ?? []).some((ev) => context.gapCitations?.get(ev)?.has(row.page_id));
  return hasGitQualifiedRecord && citedByGapReport;
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
  const canonicalPaths = {
    "legacy_inventory.path": [register.sources.legacy_inventory.path, INVENTORY_PATH],
    "formal_records.path": [register.sources.formal_records.path, RECORDS_DIR],
    "collision_registry.path": [register.sources.collision_registry.path, COLLISIONS_PATH],
    "decision_archive.status_file": [register.sources.decision_archive.status_file, ARCHIVE_STATUS_PATH],
    "migration_plan.path": [register.sources.migration_plan.path, MIGRATION_PLAN_PATH],
  };
  for (const [k, [actual, expected]] of Object.entries(canonicalPaths)) {
    if (actual !== expected) finding("SOURCE_PATH_NOT_CANONICAL", `sources.${k} is ${actual}; the validator reads ${expected}`);
  }
  if (context.archiveCommit && register.sources.decision_archive.commit !== context.archiveCommit) {
    finding("ARCHIVE_COMMIT_MISMATCH", `${register.sources.decision_archive.commit} vs ${ARCHIVE_STATUS_PATH} ${context.archiveCommit}`);
  }
  if (context.archiveRepository && register.sources.decision_archive.repository !== context.archiveRepository) {
    finding("ARCHIVE_REPOSITORY_MISMATCH", register.sources.decision_archive.repository);
  }
  if (context.archiveExportPath && register.sources.decision_archive.export_prefix !== `${context.archiveExportPath}/data-sources/decisions-rows`) {
    finding("EXPORT_PREFIX_MISMATCH", `${register.sources.decision_archive.export_prefix} vs ${context.archiveExportPath}/data-sources/decisions-rows`);
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
  for (const [path, e] of invByPath) {
    const expected = EXPECTED_INVENTORY_DISPOSITIONS[path];
    if (expected === undefined) finding("INVENTORY_DISPOSITION_UNMAPPED", `${path} has no expected disposition in the migration-map table`);
    else if (e.disposition !== expected) finding("INVENTORY_DISPOSITION_MISMATCH", `${path}: ${e.disposition} but the migration map derives ${expected}`);
  }
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
    // Git provenance is the record's own first evidence entry, never a free choice.
    if (fr.git_provenance !== undefined && fr.git_provenance !== actual.evidence[0]) finding("FORMAL_RECORD_PROVENANCE_MISMATCH", `${fr.record_key}: ${fr.git_provenance} vs record evidence ${actual.evidence[0]}`);
  }
  for (const key of recordByKey.keys()) if (!listedKeys.has(key)) finding("FORMAL_RECORD_MISSING", key);
  if (register.sources.formal_records.record_count !== context.records.length) {
    finding("SOURCE_COUNT_DRIFT", `formal_records.record_count ${register.sources.formal_records.record_count} vs ${context.records.length}`);
  }

  // ---- A bare collided id is never a record key. Cross-surface collision ids
  // (from decision_rows[].collision.kind === "cross-surface") join the
  // existing notion-duplicate rule. Computed before the git-qualified-key
  // loop below, which also needs it: a git-qualified key is legitimate only
  // for an id the register actually claims as a cross-surface collision.
  const crossSurfaceCollisionIds = new Set(
    register.decision_rows.filter((r) => r.collision?.kind === "cross-surface").map((r) => r.collision.id),
  );
  for (const fr of register.formal_records) {
    if (crossSurfaceCollisionIds.has(fr.record_key)) finding("RECORD_KEY_BARE_CROSS_SURFACE_ID", `${fr.record_key} is a cross-surface collision id and may not be used bare as a record key`);
  }

  // ---- Git-qualified record keys (`DEC-…--git-<sha>`), symmetric to the
  // `--notion-<page id>` qualifier. A git-qualified record asserts that its id
  // was introduced directly in Git at a specific commit, never a free choice:
  // id equals the key with the qualifier removed, source_kind is git-native
  // with no source rows, and provenance is the record's own first evidence
  // entry, which must be the full-sha GitHub commit URL for a sha the key's
  // (possibly abbreviated) sha prefixes, and which must be an ancestor of
  // HEAD. When git is unavailable the ancestry finding is warning-class
  // (COMMIT_UNVERIFIABLE), not a hard failure.
  //
  // A git-qualified key is legitimate only when the register carries a
  // decision row claiming its id as a cross-surface collision
  // (collision.kind: cross-surface, collision.id === the record's id);
  // otherwise the qualifier is unclaimed and the key must stay bare
  // (RECORD_GIT_KEY_WITHOUT_CROSS_SURFACE). A git-native decision whose id is
  // not a cross-surface collision (e.g. DEC-20260504-A) keeps a bare key;
  // the qualifier exists to disambiguate an id also claimed on another
  // surface, not to mark "this record came from Git".
  for (const fr of register.formal_records) {
    const gitKey = GIT_QUALIFIED_RECORD_KEY.exec(fr.record_key);
    if (!gitKey) continue;
    const [, baseId, keySha] = gitKey;
    if (fr.id !== baseId) finding("RECORD_GIT_KEY_ID_MISMATCH", `${fr.record_key}: id ${fr.id} does not equal the key with its --git- qualifier removed (${baseId})`);
    if (fr.source_kind !== "git-native" || (fr.source_rows ?? []).length > 0) {
      finding("RECORD_GIT_KEY_SOURCE_KIND", `${fr.record_key}: a git-qualified record must be source_kind git-native with source_rows []`);
    }
    if (!crossSurfaceCollisionIds.has(baseId)) {
      finding("RECORD_GIT_KEY_WITHOUT_CROSS_SURFACE", `${fr.record_key}: no decision row claims ${baseId} as a cross-surface collision; the --git- qualifier is unclaimed`);
    }
    const actual = recordByKey.get(fr.record_key);
    if (!actual) continue; // FORMAL_RECORD_UNKNOWN already reported
    const evidence0 = actual.evidence[0];
    const commitMatch = typeof evidence0 === "string" ? /^https:\/\/github\.com\/strale-io\/strale\/commit\/([0-9a-f]{40})$/.exec(evidence0) : null;
    if (!commitMatch || !commitMatch[1].startsWith(keySha)) {
      finding("RECORD_GIT_KEY_PROVENANCE_MISMATCH", `${fr.record_key}: first evidence entry must be https://github.com/strale-io/strale/commit/<40-hex sha with prefix ${keySha}>, got ${evidence0}`);
    } else if (context.isAncestor) {
      if (!context.isAncestor(commitMatch[1])) finding("RECORD_GIT_KEY_NOT_ANCESTOR", `${fr.record_key}: ${commitMatch[1]} is not an ancestor of HEAD`);
    } else {
      finding("COMMIT_UNVERIFIABLE", `${fr.record_key}: git is unavailable; ${commitMatch[1]} could not be checked against HEAD`);
    }
  }

  // ---- Collision registry facts.
  const collisionRows = new Map();
  const collisionIds = new Set();
  for (const c of context.collisions.collisions ?? []) {
    collisionIds.add(c.id);
    for (const r of c.records) collisionRows.set(r.source_page_id, { id: c.id, resolution_status: c.resolution_status, disposition: r.disposition, record_key: r.record_key, title: r.title, historical_status: r.historical_status });
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
    // Scope and date are not published on main for any row; public rows carry neither.
    if (row.historical_scope !== undefined || row.decided_at !== undefined) finding("DECISION_ROW_SCOPE_DATE_NOT_PUBLIC", row.page_id);
    if (col && col.historical_status !== undefined && col.historical_status !== row.historical_status) finding("DECISION_ROW_STATUS_MISMATCH", `${row.page_id}: ${row.historical_status} vs registry ${col.historical_status}`);

    if (d === "formally_migrated") {
      const rec = recordByKey.get(row.record_key);
      if (!rec) finding("DECISION_ROW_RECORD_UNKNOWN", `${row.page_id} -> ${row.record_key}`);
      else {
        if (!row.evidence.includes(rec.file)) finding("DECISION_ROW_EVIDENCE_NOT_SPECIFIC", `${row.page_id}: a migrated row must cite its record ${rec.file}`);
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

    // A collision payload is legal only on registry rows (any disposition) and
    // on the cross-surface row; wherever it appears it must match the registry
    // exactly, and a cross-surface payload is always unresolved/unresolved.
    if (row.collision && !col && row.collision.kind !== "cross-surface") finding("DECISION_ROW_COLLISION_PAYLOAD_UNSUPPORTED", `${row.page_id}: ${d} row carries a collision payload but is not a registry row`);
    if (col && !row.collision) finding("DECISION_ROW_COLLISION_PAYLOAD_EXPECTED", `${row.page_id}: registry row without a collision payload`);
    if (row.collision && col) {
      if (row.collision.kind !== "notion-duplicate") finding("DECISION_ROW_COLLISION_ID_MISMATCH", `${row.page_id}: registry rows are notion-duplicate collisions`);
      if (col.id !== row.collision.id) finding("DECISION_ROW_COLLISION_ID_MISMATCH", row.page_id);
      if (col.resolution_status !== row.collision.resolution_status) finding("DECISION_ROW_COLLISION_STATUS_MISMATCH", row.page_id);
      if (col.disposition !== row.collision.row_disposition) finding("DECISION_ROW_COLLISION_ROW_DISPOSITION_MISMATCH", row.page_id);
    }
    // A cross-surface payload is unresolved/unresolved unless a git-qualified
    // record exists for the collision id AND a tracked gap report cited in
    // this row's evidence names the row's page id, in which case it may be
    // resolved/documented_only instead. formal_record is never supported for
    // a cross-surface row in this stage. Any other combination is invalid.
    if (row.collision?.kind === "cross-surface") {
      const { resolution_status: rs, row_disposition: rd } = row.collision;
      if (rd === "formal_record") {
        finding("CROSS_SURFACE_FORMAL_RECORD_UNSUPPORTED", `${row.page_id}: row_disposition formal_record is not supported on a cross-surface row in this stage`);
      } else if (rs === "unresolved" && rd === "unresolved") {
        // Always valid.
      } else if (rs === "resolved" && rd === "documented_only") {
        if (!crossSurfaceResolutionEligible(context, recordByKey, row)) {
          finding("DECISION_ROW_CROSS_SURFACE_STATE_INVALID", `${row.page_id}: resolved/documented_only requires a git-qualified record for ${row.collision.id} and a gap report (cited in this row's evidence) naming this page id`);
        }
      } else {
        finding("DECISION_ROW_CROSS_SURFACE_STATE_INVALID", `${row.page_id}: ${rs}/${rd} is not a valid cross-surface collision state`);
      }
    }
    if (d === "unresolved_collision" || d === "resolved_collision") {
      if (row.collision.kind === "notion-duplicate") {
        if (!row.evidence.includes(COLLISIONS_PATH)) finding("DECISION_ROW_EVIDENCE_NOT_SPECIFIC", `${row.page_id}: a registry collision row must cite ${COLLISIONS_PATH}`);
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
  // Duplicate ids inside the public projection must be exactly the registry's page sets.
  const publicPagesById = new Map();
  for (const row of register.decision_rows) if (row.id) publicPagesById.set(row.id, [...(publicPagesById.get(row.id) ?? []), row.page_id]);
  const registryPagesById = new Map();
  for (const c of context.collisions.collisions ?? []) registryPagesById.set(c.id, c.records.map((r) => r.source_page_id));
  for (const [id, pages] of publicPagesById) {
    if (pages.length > 1 && !registryPagesById.has(id)) finding("DECISION_ROW_UNREGISTERED_DUPLICATE_ID", `${id} is carried by ${pages.length} public rows but is not in the collision registry`);
  }
  for (const [id, registryPages] of registryPagesById) {
    const actual = [...(publicPagesById.get(id) ?? [])].sort().join(",");
    const expected = [...registryPages].sort().join(",");
    if (actual !== expected) finding("COLLISION_SET_MISMATCH", `${id}: public rows carry [${actual}] but the registry lists [${expected}]`);
  }

  // The record-to-row mapping is DERIVED from record front matter, never
  // trusted from the register: a record's source rows are the page ids its
  // evidence cites whose row carries the record's own historical id. Every
  // such row must be formally_migrated to that record, and formal_records must
  // state exactly that set.
  const derivedSourceRows = new Map();
  for (const rec of context.records) {
    const own = rec.pageIds.filter((p) => rowsByPage.get(p)?.id === rec.id);
    derivedSourceRows.set(rec.record_key, own);
    for (const p of own) {
      const row = rowsByPage.get(p);
      if (row.disposition !== "formally_migrated" || row.record_key !== rec.record_key) {
        finding("DECISION_ROW_SHOULD_BE_MIGRATED", `${p} is cited by ${rec.record_key} with the same id but is ${row.disposition}${row.record_key ? ` -> ${row.record_key}` : ""}`);
      }
    }
  }
  for (const fr of register.formal_records) {
    const derived = derivedSourceRows.get(fr.record_key);
    if (!derived) continue; // FORMAL_RECORD_UNKNOWN already reported
    const listed = [...fr.source_rows].sort();
    const expected = [...derived].sort();
    if (listed.join(",") !== expected.join(",")) finding("FORMAL_RECORD_SOURCE_ROWS_MISMATCH", `${fr.record_key}: listed [${listed.join(",")}] vs derived [${expected.join(",")}]`);
    const expectedKind = expected.length > 0 ? "notion-row" : "git-native";
    if (fr.source_kind !== expectedKind) finding("FORMAL_RECORD_SOURCE_KIND_MISMATCH", `${fr.record_key}: ${fr.source_kind} vs derived ${expectedKind}`);
    const rows = migratedByRecord.get(fr.record_key) ?? [];
    for (const pid of rows) if (!expected.includes(pid)) finding("FORMAL_RECORD_SOURCE_ROW_UNLISTED", `${fr.record_key}: ${pid} claims this record but the record does not cite it`);
  }

  // Cross-surface collisions are DERIVED from the entrypoints: a public row
  // whose id is a Git-native protocol label with no formal record of that id
  // must be an unresolved cross-surface collision, and only such rows may be.
  if (context.gitNativeClaims) {
    const recordIds = new Set(context.records.map((r) => r.id));
    const recordCitedPages = new Set();
    for (const rec of context.records) for (const p of rec.pageIds) if (rowsByPage.get(p)?.id === rec.id) recordCitedPages.add(p);
    for (const row of register.decision_rows) {
      // A row whose id is a Git-native claim (protocol label) or a formal record's
      // id, and which no same-id record cites, competes with that Git-native
      // meaning: a cross-surface collision.
      // Registry rows are governed by the registry (a resolved collision may
      // legitimately share its id with the record that won it).
      const claimed = row.id && (context.gitNativeClaims.has(row.id) || recordIds.has(row.id)) && !recordCitedPages.has(row.page_id) && !collisionRows.has(row.page_id);
      const labelled = row.collision?.kind === "cross-surface" && (row.disposition === "unresolved_collision" || row.disposition === "resolved_collision");
      if (claimed && !labelled) finding("DECISION_ROW_CROSS_SURFACE_EXPECTED", `${row.page_id}: ${row.id} is a Git-native protocol label without a record`);
      if (labelled && !claimed) finding("DECISION_ROW_CROSS_SURFACE_UNSUPPORTED", `${row.page_id}: ${row.id} is not a Git-native protocol label`);
    }
  }
  // Private rows can never hold dispositions that are public by construction;
  // the schema's closed counts_by_disposition key set enforces this.

  // Every public disposition is derived, in priority order: cited by a
  // same-id record -> formally_migrated; collision-registry row -> the
  // registry's status; Git-native protocol label without a record ->
  // cross-surface collision (resolved_collision when a git-qualified record
  // and gap-report citation both exist, else unresolved_collision); cited by
  // a gap report -> intentionally historical; otherwise from identity fields
  // (no id -> unclear; superseded/reversed -> obsolete_or_superseded; else
  // not_yet_reconciled).
  if (context.gapCitations && context.gitNativeClaims) {
    const recordIds = new Set(context.records.map((r) => r.id));
    const recordCited = new Set();
    for (const rec of context.records) for (const p of rec.pageIds) if (rowsByPage.get(p)?.id === rec.id) recordCited.add(p);
    const gapCited = new Set();
    for (const set of context.gapCitations.values()) for (const p of set) gapCited.add(p);
    for (const row of register.decision_rows) {
      let expected;
      if (recordCited.has(row.page_id)) expected = "formally_migrated";
      else if (collisionRows.has(row.page_id)) expected = collisionRows.get(row.page_id).resolution_status === "unresolved" ? "unresolved_collision" : "resolved_collision";
      else if (row.id && (context.gitNativeClaims.has(row.id) || recordIds.has(row.id))) {
        expected = row.collision?.kind === "cross-surface" && crossSurfaceResolutionEligible(context, recordByKey, row) ? "resolved_collision" : "unresolved_collision";
      } else if (gapCited.has(row.page_id)) expected = "intentionally_historical";
      else if (!row.id) expected = "unclear";
      else if (["superseded", "reversed"].includes(row.historical_status)) expected = "obsolete_or_superseded";
      else expected = "not_yet_reconciled";
      if (row.disposition !== expected) finding("DECISION_ROW_DERIVATION_MISMATCH", `${row.page_id}: ${row.disposition} but evidence derives ${expected}`);
      if (row.disposition === "intentionally_historical") {
        const citedByGapEvidence = row.evidence.some((ev) => context.gapCitations.get(ev)?.has(row.page_id));
        if (!citedByGapEvidence) finding("DECISION_ROW_NOT_CITED_BY_EVIDENCE", `${row.page_id}: intentionally_historical rows must cite a gap report that names them`);
      }
    }
  }

  // ---- Plan statements: every forward statement in the plan must be quoted, and every quote must exist.
  const planPath = register.sources.migration_plan.path;
  const planRaw = context.root && evidenceProblem(context, planPath) === null
    ? readFileSync(resolve(context.root, planPath), "utf8")
    : null;
  const planText = planRaw === null ? null : normalizeWs(planRaw);
  const seenLocations = new Set();
  for (const p of register.plan_statements) {
    if (seenLocations.has(p.location)) finding("PLAN_STATEMENT_DUPLICATE", p.location);
    seenLocations.add(p.location);
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
  // The plan's M2 exit requires a closing independent review; until M2 closes,
  // a gap must always cover it.
  if (!covered.has("plan.review_route")) finding("EXIT_GAP_UNCOVERED", "plan.review_route has no gap (the closing review requirement cannot disappear)");
  // Blocking is derived, not chosen: while any row is not yet reconciled or in
  // an unresolved collision, and until the closing review exists, at least one
  // BLOCKING gap must cover that bucket. Flipping every gap to non-blocking
  // cannot open the M2 exit gate.
  const blockingCovered = new Set();
  for (const g of register.exit_gaps) if (g.blocking) for (const c of g.covers) blockingCovered.add(c);
  for (const d of ["not_yet_reconciled", "unresolved_collision"]) {
    if ((totals[d] ?? 0) > 0 && !blockingCovered.has(`decision_rows.${d}`)) finding("EXIT_GAP_NOT_BLOCKING", `decision_rows.${d} (${totals[d]} rows) is open but no blocking gap covers it`);
  }
  if (!blockingCovered.has("plan.review_route")) finding("EXIT_GAP_NOT_BLOCKING", "plan.review_route is open but no blocking gap covers it");

  // ---- Next batch: cutoff anchored to a public row; public eligibility exact.
  const nb = register.next_decision_batch;
  if (nb.cutoff_anchor_id !== READINESS_ANCHOR_ID) finding("NEXT_BATCH_ANCHOR_NOT_READINESS", `${nb.cutoff_anchor_id} is not ${READINESS_ANCHOR_ID}`);
  const anchorRecord = context.records.find((r) => r.id === READINESS_ANCHOR_ID);
  if (!anchorRecord) finding("NEXT_BATCH_ANCHOR_UNKNOWN", `${READINESS_ANCHOR_ID} has no formal record`);
  else if (anchorRecord.decided_at !== nb.decided_on_or_after) finding("NEXT_BATCH_CUTOFF_MISMATCH", `${nb.decided_on_or_after} vs record ${READINESS_ANCHOR_ID} decided ${anchorRecord.decided_at}`);
  // Uniqueness is judged over the public rows plus the collision registry; every
  // registry row is public (DECISION_ROW_MISSING_FROM_REGISTER), so this equals
  // the all-rows rule the operator script applies to the private projection.
  // A public pending row has no clear date, so its eligibility cannot be
  // evaluated here; it is reported and left to the operator script, which sees
  // the archive dates.
  const eligible = (row) =>
    row.disposition === "not_yet_reconciled" &&
    row.historical_status === "active" &&
    row.id &&
    (idCounts[row.id] ?? 0) === 1 &&
    !collisionRows.has(row.page_id) &&
    !collisionIds.has(row.id) &&
    (row.decided_at === undefined || row.decided_at >= nb.decided_on_or_after);
  for (const row of register.decision_rows) {
    if (row.disposition === "not_yet_reconciled" && row.decided_at === undefined) finding("NEXT_BATCH_UNEVALUABLE", `${row.page_id}: public pending row has no clear date; the operator script must judge its eligibility`);
  }
  const candidateIds = new Set();
  for (const c of nb.candidates) {
    const row = rowsByPage.get(c.page_id);
    if (!row) { finding("NEXT_BATCH_ROW_UNKNOWN", c.page_id); continue; }
    if (row.id !== c.id) finding("NEXT_BATCH_ID_MISMATCH", c.page_id);
    if (row.disposition !== "not_yet_reconciled") finding("NEXT_BATCH_ROW_NOT_PENDING", `${c.page_id} is ${row.disposition}`);
    if ((idCounts[c.id] ?? 0) !== 1) finding("NEXT_BATCH_ID_NOT_UNIQUE", c.id);
    if (collisionRows.has(c.page_id) || collisionIds.has(c.id)) finding("NEXT_BATCH_COLLIDES", c.id);
    if (row.historical_status !== "active") finding("NEXT_BATCH_NOT_ACTIVE", c.id);
    if (row.decided_at !== undefined && row.decided_at < nb.decided_on_or_after) finding("NEXT_BATCH_TOO_OLD", `${c.id} decided ${row.decided_at}`);
    if (candidateIds.has(c.page_id)) finding("NEXT_BATCH_DUPLICATE", c.page_id);
    candidateIds.add(c.page_id);
  }
  for (const row of register.decision_rows) {
    if (eligible(row) && !candidateIds.has(row.page_id)) finding("NEXT_BATCH_INCOMPLETE", `${row.id} is eligible but not listed`);
  }
  if (nb.private_candidates.count > privateCount) finding("NEXT_BATCH_PRIVATE_COUNT_EXCEEDS", `${nb.private_candidates.count} > ${privateCount}`);

  // ---- Whole-file boundary: no page id or Decision ID anywhere in the register
  // text (evidence URLs, prose, gaps) may be absent from the public set.
  if (context.public?.available && context.root) {
    const raw = readFileSync(resolve(context.root, relativePath), "utf8");
    for (const m of raw.matchAll(/(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/g)) {
      if (!context.public.pageIds.has(m[0])) finding("REGISTER_IDENTITY_NOT_PUBLIC", `page id ${m[0]} appears in the register text but nowhere public`);
    }
    // Dashed (API-form) page ids are the same identity written differently.
    for (const m of raw.matchAll(/(?<![0-9a-f])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-f])/g)) {
      const undashed = m[0].replace(/-/g, "");
      if (!context.public.pageIds.has(undashed)) finding("REGISTER_IDENTITY_NOT_PUBLIC", `page id ${m[0]} (dashed) appears in the register text but nowhere public`);
    }
    for (const m of raw.matchAll(/DEC-[0-9]{8}-[A-Za-z0-9-]+/g)) {
      if (!context.public.ids.has(m[0])) finding("REGISTER_IDENTITY_NOT_PUBLIC", `id ${m[0]} appears in the register text but nowhere public`);
    }
  }

  // ---- The program's track register must respect the M2 exit gate.
  if (context.tracks) {
    const blocking = register.exit_gaps.filter((g) => g.blocking).length;
    const all = context.tracks.tracks ?? [];
    const byId = new Map(all.map((t) => [t.id, t]));
    for (const t of all) if (!["none", "m2", "m2-exit", "post-m2"].includes(t.gate)) finding("TRACKS_GATE_UNDECLARED", `${t.id} has no valid gate field`);
    const gates = all.filter((t) => t.gate === "m2-exit");
    if (gates.length !== 1) finding("TRACKS_GATE_MISSING", `${TRACKS_PATH} must have exactly one m2-exit track, found ${gates.length}`);
    const gateId = gates[0]?.id;
    // Declarations must agree with the reviewed list, and anything not on it is gated.
    for (const t of all) {
      const allowed = TRACKS_OUTSIDE_M2_GATE[t.id];
      if (allowed !== undefined && t.gate !== allowed) finding("TRACKS_GATE_DECLARATION_MISMATCH", `${t.id} declares ${t.gate} but the reviewed list says ${allowed}`);
      if (allowed === undefined && t.gate !== "m2-exit" && t.gate !== "post-m2") finding("TRACKS_GATE_DECLARATION_MISMATCH", `${t.id} declares ${t.gate} but is not on the reviewed list of tracks outside the M2 gate; it is treated as post-m2`);
    }
    if (gateId && blocking > 0 && gates[0].status === "done") finding("TRACKS_GATE_DONE_WITH_BLOCKING_GAPS", `${gateId} is done but ${blocking} blocking M2 gap(s) remain`);
    // Gating is transitive: a track depends on the gate if any dependency chain reaches it.
    const reaches = (id, seen = new Set()) => {
      if (seen.has(id)) return false;
      seen.add(id);
      const t = byId.get(id);
      return Boolean(t) && t.depends_on.some((d) => d === gateId || reaches(d, seen));
    };
    for (const t of all) {
      const outside = TRACKS_OUTSIDE_M2_GATE[t.id] !== undefined || t.gate === "m2-exit";
      if (outside) continue;
      if (gateId && !reaches(t.id)) finding("TRACKS_POST_M2_NOT_GATED", `${t.id} does not depend, directly or transitively, on ${gateId}`);
      if (blocking > 0 && ["active", "done"].includes(t.status)) finding("TRACKS_POST_M2_STARTED_WITH_BLOCKING_GAPS", `${t.id} is ${t.status} but ${blocking} blocking M2 gap(s) remain`);
    }
  } else {
    finding("TRACKS_UNAVAILABLE", `${TRACKS_PATH} is missing; the M2 exit gate cannot be checked`);
  }

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

/**
 * Pure validation of the private row projection against the public register.
 * Used by the operator script (with rows fetched from the archive) and by
 * tests (with synthetic rows). It does not touch disk or git.
 *
 * Checks: every private row is a schema-valid decision row with a hashed
 * title; no private row is a collision-registry row or carries a public-only
 * disposition; the derivation rules hold; counts_by_disposition, count, the
 * private digest, the all-rows digest, and the private next-batch candidate
 * set (count and digest) all recompute to the register's stored values; no
 * page id appears in both projections; ids are unique across both.
 */
export function validatePrivateProjection(register, privateRows, { schema, collisions, context } = {}) {
  const findings = [];
  const finding = (code, detail) => findings.push({ code, path: register.private_rows?.file ?? "private_rows", detail });
  const rows = Array.isArray(privateRows) ? privateRows : [];

  if (schema) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validateRow = ajv.compile({ ...schema.$defs.decisionRow, $defs: schema.$defs });
    rows.forEach((r, i) => {
      if (!validateRow(r)) finding("PRIVATE_ROW_SCHEMA", `row ${i} (${r?.page_id}): ${(validateRow.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ")}`);
    });
  }

  const registryPageIds = new Set();
  const collisionIds = new Set();
  const registryPagesById = new Map();
  for (const c of collisions?.collisions ?? []) {
    collisionIds.add(c.id);
    registryPagesById.set(c.id, new Set(c.records.map((r) => r.source_page_id)));
    for (const r of c.records) registryPageIds.add(r.source_page_id);
  }
  const publicPages = new Set(register.decision_rows.map((r) => r.page_id));
  // Evidence that makes a row public by construction, when the caller supplies it.
  const recordIds = new Set((context?.records ?? []).map((r) => r.id));
  const recordCitations = new Map(); // page id -> record ids citing it
  for (const rec of context?.records ?? []) for (const p of rec.pageIds ?? []) recordCitations.set(p, [...(recordCitations.get(p) ?? []), rec.id]);
  const gapCited = new Set();
  for (const set of context?.gapCitations?.values?.() ?? []) for (const p of set) gapCited.add(p);
  const gitNative = context?.gitNativeClaims ?? new Set();
  const pagesById = new Map();
  for (const r of [...register.decision_rows, ...rows]) if (r.id) pagesById.set(r.id, new Set([...(pagesById.get(r.id) ?? []), r.page_id]));
  const seen = new Set();
  const idCounts = {};
  for (const r of register.decision_rows) if (r.id) idCounts[r.id] = (idCounts[r.id] ?? 0) + 1;
  for (const r of rows) if (r.id) idCounts[r.id] = (idCounts[r.id] ?? 0) + 1;

  // A private row's disposition is fully determined by its identity fields:
  // no id -> unclear; superseded or reversed -> obsolete_or_superseded;
  // otherwise -> not_yet_reconciled. Hand dispositions (intentionally
  // historical, cross-surface collision) need public evidence citing the page
  // id, so they can only exist as public rows.
  const expectedDisposition = (r) =>
    !r.id ? "unclear" : ["superseded", "reversed"].includes(r.historical_status) ? "obsolete_or_superseded" : "not_yet_reconciled";
  for (const r of rows) {
    if (seen.has(r.page_id)) finding("PRIVATE_ROW_DUPLICATE", r.page_id);
    seen.add(r.page_id);
    if (publicPages.has(r.page_id)) finding("PRIVATE_ROW_ALSO_PUBLIC", r.page_id);
    if (registryPageIds.has(r.page_id)) finding("PRIVATE_ROW_IN_REGISTRY", r.page_id);
    if (r.title !== undefined) finding("PRIVATE_ROW_CLEAR_TITLE", r.page_id);
    if (typeof r.source_url !== "string" || !r.source_url.endsWith(r.page_id)) finding("PRIVATE_ROW_SOURCE_URL_MISMATCH", r.page_id);
    if (r.historical_scope === undefined || r.decided_at === undefined) finding("PRIVATE_ROW_REDACTED_FIELDS", `${r.page_id}: private rows carry clear scope and date`);
    if (r.collision !== undefined) finding("PRIVATE_ROW_COLLISION_PAYLOAD", `${r.page_id}: collision payloads belong to registry rows and the cross-surface row, which are public`);
    if (["formally_migrated", "resolved_collision"].includes(r.disposition)) finding("PRIVATE_ROW_PUBLIC_DISPOSITION", `${r.page_id}: ${r.disposition}`);
    if (["intentionally_historical", "unresolved_collision"].includes(r.disposition)) finding("PRIVATE_ROW_HAND_DISPOSITION", `${r.page_id}: ${r.disposition} needs public evidence and must be a public row`);
    const expected = expectedDisposition(r);
    if (r.disposition !== expected && !["formally_migrated", "resolved_collision", "intentionally_historical", "unresolved_collision"].includes(r.disposition)) {
      finding("PRIVATE_ROW_DERIVATION_MISMATCH", `${r.page_id}: ${r.disposition} but identity fields derive ${expected}`);
    }
    if (r.record_key) finding("PRIVATE_ROW_RECORD_KEY", r.page_id);
    // A row whose page id and id are both already public belongs in the public projection.
    if (context?.public?.available && context.public.pageIds.has(r.page_id) && (!r.id || context.public.ids.has(r.id))) {
      finding("PRIVATE_ROW_ALREADY_PUBLIC", `${r.page_id}: page id and id are both public on main; the row must be listed publicly`);
    }
    // Private dispositions are derived from identity fields, so their only evidence is the archive itself.
    if (!(r.evidence ?? []).includes(ARCHIVE_STATUS_PATH)) finding("PRIVATE_ROW_EVIDENCE_NOT_SPECIFIC", `${r.page_id}: private rows must cite ${ARCHIVE_STATUS_PATH}`);
    // Rows that public evidence already classifies cannot hide in the private projection.
    if (r.id && (recordCitations.get(r.page_id) ?? []).includes(r.id)) finding("PRIVATE_ROW_MUST_BE_PUBLIC", `${r.page_id}: cited by a same-id formal record`);
    if (r.id && gitNative.has(r.id)) finding("PRIVATE_ROW_MUST_BE_PUBLIC", `${r.page_id}: ${r.id} is a Git-native protocol label; the row is either record-cited or a cross-surface collision, both public`);
    if (r.id && recordIds.has(r.id)) finding("PRIVATE_ROW_MUST_BE_PUBLIC", `${r.page_id}: ${r.id} is a formal record id; a source row with that id is either cited by the record or a collision with it`);
    if (gapCited.has(r.page_id)) finding("PRIVATE_ROW_MUST_BE_PUBLIC", `${r.page_id}: cited by an M2 gap report`);
    if (context) {
      for (const ev of r.evidence ?? []) {
        const problem = evidenceProblem(context, ev);
        if (problem) finding("PRIVATE_ROW_EVIDENCE_INVALID", `${r.page_id}: ${ev} (${problem})`);
      }
    }
    if (r.id && (idCounts[r.id] ?? 0) > 1 && !collisionIds.has(r.id)) finding("PRIVATE_ROW_UNREGISTERED_DUPLICATE_ID", `${r.page_id}: ${r.id} is shared by ${idCounts[r.id]} rows but is not in the collision registry`);
  }
  // Collision completeness is two-way: for every id the registry knows, the
  // set of pages carrying that id across BOTH projections must equal the
  // registry's record set; for every id duplicated across the projections,
  // the registry must know it (checked above) and list exactly those pages.
  for (const [id, registryPages] of registryPagesById) {
    const actual = pagesById.get(id) ?? new Set();
    const a = [...actual].sort().join(",");
    const b = [...registryPages].sort().join(",");
    if (a !== b) finding("COLLISION_SET_MISMATCH", `${id}: projections carry [${a}] but the registry lists [${b}]`);
  }

  const counts = {};
  for (const r of rows) counts[r.disposition] = (counts[r.disposition] ?? 0) + 1;
  const stored = register.private_rows.counts_by_disposition ?? {};
  for (const d of new Set([...Object.keys(counts), ...Object.keys(stored)])) {
    if ((counts[d] ?? 0) !== (stored[d] ?? 0)) finding("PRIVATE_COUNT_MISMATCH", `${d}: rows say ${counts[d] ?? 0}, register says ${stored[d] ?? 0}`);
  }
  if (rows.length !== register.private_rows.count) finding("PRIVATE_COUNT_MISMATCH", `count: rows ${rows.length}, register ${register.private_rows.count}`);
  const privateDigest = canonicalDigest(rows);
  if (privateDigest !== register.private_rows.digest) finding("PRIVATE_DIGEST_MISMATCH", `${privateDigest.slice(0, 12)}… vs ${register.private_rows.digest.slice(0, 12)}…`);
  const allDigest = canonicalDigest([...register.decision_rows, ...rows]);
  if (allDigest !== register.digests.all_rows.digest) finding("ALL_ROWS_DIGEST_MISMATCH", `${allDigest.slice(0, 12)}… vs ${register.digests.all_rows.digest.slice(0, 12)}…`);

  const nb = register.next_decision_batch;
  const eligible = rows.filter((r) =>
    r.disposition === "not_yet_reconciled" && r.historical_status === "active" && r.id &&
    (idCounts[r.id] ?? 0) === 1 && !collisionIds.has(r.id) && r.decided_at >= nb.decided_on_or_after);
  // Digest format: sorted page ids joined by LF with a trailing LF, SHA-256.
  const candidateDigest = sha256(eligible.map((r) => r.page_id).sort().join("\n") + "\n");
  if (eligible.length !== nb.private_candidates.count) finding("PRIVATE_NEXT_BATCH_COUNT_MISMATCH", `${eligible.length} eligible vs ${nb.private_candidates.count}`);
  if (candidateDigest !== nb.private_candidates.digest) finding("PRIVATE_NEXT_BATCH_DIGEST_MISMATCH", candidateDigest.slice(0, 12));
  return findings;
}

/**
 * Compare projected rows (public plus private) with the raw export rows as the
 * archive stores them ({ url, "userDefined:ID", Status, Scope,
 * "date:Date:start", createdTime, Decision }). Pure; used by the operator
 * script with rows fetched over gh api and by tests with synthetic rows.
 */
export function compareRowsToExport(rows, exportRows, { publicScopeDateDigest } = {}) {
  const findings = [];
  const finding = (code, detail) => findings.push({ code, path: "archive export", detail });
  const pid = (u) => ((u ?? "").replace(/-/g, "").match(/([0-9a-f]{32})/) ?? [])[1];
  const identities = new Map();
  for (const r of exportRows) {
    const p = pid(r.url);
    if (!p) { finding("EXPORT_ROW_UNIDENTIFIED", `export row without a page id: ${r.url}`); continue; }
    if (identities.has(p)) finding("EXPORT_ROW_DUPLICATE", `export lists ${p} more than once`);
    identities.set(p, r);
  }
  const seen = new Set();
  for (const row of rows) {
    const src = identities.get(row.page_id);
    if (!src) { finding("EXPORT_ROW_MISSING", `${row.page_id} is not in the export`); continue; }
    if (seen.has(row.page_id)) finding("EXPORT_ROW_DUPLICATE", row.page_id);
    seen.add(row.page_id);
    const expected = {
      id: (src["userDefined:ID"] ?? "").trim() || null,
      historical_status: src.Status ?? null,
      historical_scope: src.Scope ?? null,
      decided_at: (src["date:Date:start"] || src.createdTime).slice(0, 10),
      title_hash: sha256(src.Decision ?? ""),
      source_url: `https://app.notion.com/${row.page_id}`,
    };
    const actualHash = row.title_sha256 ?? sha256(row.title ?? "");
    if (row.id !== expected.id) finding("EXPORT_FIELD_MISMATCH", `${row.page_id} id ${row.id} != ${expected.id}`);
    if (row.historical_status !== expected.historical_status) finding("EXPORT_FIELD_MISMATCH", `${row.page_id} status`);
    if (row.historical_scope !== undefined || row.decided_at !== undefined) {
      if (row.historical_scope !== expected.historical_scope) finding("EXPORT_FIELD_MISMATCH", `${row.page_id} scope`);
      if (row.decided_at !== expected.decided_at) finding("EXPORT_FIELD_MISMATCH", `${row.page_id} date ${row.decided_at} != ${expected.decided_at}`);
    }
    if (actualHash !== expected.title_hash) finding("EXPORT_FIELD_MISMATCH", `${row.page_id} title hash`);
    if (row.source_url !== expected.source_url) finding("EXPORT_FIELD_MISMATCH", `${row.page_id} source_url`);
  }
  for (const p of identities.keys()) if (!seen.has(p)) finding("EXPORT_ROW_UNPROJECTED", `${p} is in the export but in neither projection`);
  // Rows without clear scope/date (the public projection) are bound in aggregate.
  if (publicScopeDateDigest !== undefined) {
    const triples = rows
      .filter((r) => r.historical_scope === undefined && r.decided_at === undefined && identities.has(r.page_id))
      .map((r) => {
        const src = identities.get(r.page_id);
        return [r.page_id, src.Scope ?? "", (src["date:Date:start"] || src.createdTime).slice(0, 10)];
      });
    if (scopeDateDigest(triples) !== publicScopeDateDigest) finding("EXPORT_SCOPE_DATE_DIGEST_MISMATCH", "public rows' scope/date digest does not match the export");
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
