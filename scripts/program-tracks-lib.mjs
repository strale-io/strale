// Validation for program track registers under docs/programs/*/tracks.yaml.
// Pure functions; the test file and the CLI both call `validateRegister`.
//
// The JSON schema (docs/programs/tracks.schema.json) owns field shapes. The
// checks below own what a schema cannot see: relations between rows, real
// calendar dates, text that is visibly non-empty, program directory topology,
// and whether a referenced file really is a tracked regular file inside the
// repository.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import YAML from "yaml";

export const SCHEMA_PATH = "docs/programs/tracks.schema.json";
export const PROGRAMS_DIR = "docs/programs";
const SATISFIES_DEPENDENCY = new Set(["done"]);
const TERMINAL = new Set(["done", "rehomed"]);
const WAITING = new Set(["blocked", "founder_gated"]);
// Control (Cc), format (Cf, includes zero-width and bidi marks), separators.
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Z}]/gu;

export function repoRootFrom(metaUrl) {
  return resolve(dirname(fileURLToPath(metaUrl)), "..");
}

/** True when the text still has visible characters after stripping invisibles. */
export function isVisiblyNonEmpty(text) {
  return typeof text === "string" && text.replace(INVISIBLE, "").length > 0;
}

/** True only for a real calendar date in YYYY-MM-DD form. */
export function isCalendarDate(text) {
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = text.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Program directories: every subdirectory of docs/programs. */
export function listProgramDirs(root) {
  const programsDir = resolve(root, PROGRAMS_DIR);
  if (!existsSync(programsDir)) return [];
  return readdirSync(programsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

export function listRegisters(root) {
  return listProgramDirs(root)
    .map((name) => `${PROGRAMS_DIR}/${name}/tracks.yaml`)
    .filter((rel) => existsSync(resolve(root, rel)));
}

export function loadRegister(root, relativePath) {
  return YAML.parse(readFileSync(resolve(root, relativePath), "utf8"));
}

export function loadSchema(root) {
  return JSON.parse(readFileSync(resolve(root, SCHEMA_PATH), "utf8"));
}

/** Tracked files as `git ls-files` reports them, forward-slashed, as a Set. */
export function trackedFiles(root) {
  const out = execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" });
  return new Set(out.split("\0").filter(Boolean));
}

/**
 * A repository evidence path must be relative, must not escape the root, must
 * be a regular file on disk, and must be tracked by git. `tracked` may be
 * omitted (tests construct registers without a git context); then only the
 * disk checks run.
 */
export function classifyRepoPath(root, value, tracked) {
  if (!isVisiblyNonEmpty(value)) return "EMPTY";
  const normalized = value.replace(/\\/g, "/");
  if (isAbsolute(value) || /^[A-Za-z]:/.test(value)) return "ABSOLUTE";
  if (normalized.split("/").some((segment) => segment === "..")) return "ESCAPES_ROOT";
  if (!root) return "OK";
  const absolute = resolve(root, normalized);
  if (!existsSync(absolute)) return "MISSING";
  if (!statSync(absolute).isFile()) return "NOT_A_FILE";
  if (tracked && !tracked.has(normalized)) return "UNTRACKED";
  return "OK";
}

/**
 * Returns a list of findings ({code, path, detail}). Empty means valid.
 * `programDir` (the directory name) enables the slug cross-check.
 */
export function validateRegister(register, { root, relativePath, schema, tracked, programDir } = {}) {
  const findings = [];
  const finding = (code, detail, path = relativePath) => findings.push({ code, path, detail });

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (!validate(register)) {
    for (const err of validate.errors ?? []) {
      finding("SCHEMA", `${err.instancePath || "/"} ${err.message}`);
    }
    return findings; // structure is broken; cross-row checks would be noise
  }

  if (!isCalendarDate(register.updated)) finding("UPDATED_NOT_A_DATE", register.updated);
  if (programDir && register.program !== programDir) {
    finding("PROGRAM_SLUG_MISMATCH", `${register.program} in ${programDir}/`);
  }

  const tracks = register.tracks;
  const seen = new Set();
  for (const t of tracks) {
    if (seen.has(t.id)) finding("DUPLICATE_ID", t.id);
    seen.add(t.id);
  }
  const byId = new Map(tracks.map((t) => [t.id, t]));

  const active = tracks.filter((t) => t.status === "active");
  const status = register.program_status;
  if (status === "active" && active.length !== 1) {
    finding("ACTIVE_COUNT", `program is active: expected exactly 1 active track, found ${active.length}`);
  }
  if (status === "paused") {
    if (active.length !== 0) finding("PAUSED_WITH_ACTIVE_TRACK", active.map((t) => t.id).join(","));
    if (!tracks.some((t) => WAITING.has(t.status))) finding("PAUSED_WITHOUT_GATE", "no blocked or founder_gated track");
    const runnable = tracks.filter(
      (t) => t.status === "queued" && t.depends_on.every((d) => SATISFIES_DEPENDENCY.has(byId.get(d)?.status)),
    );
    if (runnable.length > 0) finding("PAUSED_WITH_RUNNABLE_TRACK", runnable.map((t) => t.id).join(","));
  }
  if (status === "complete") {
    const open = tracks.filter((t) => !TERMINAL.has(t.status));
    if (open.length > 0) finding("COMPLETE_WITH_OPEN_TRACK", open.map((t) => t.id).join(","));
  }

  const pathFinding = (code, trackId, value) => {
    const problem = classifyRepoPath(root, value, tracked);
    if (problem !== "OK") finding(code, `${trackId}: ${value} (${problem})`);
  };
  const textFinding = (trackId, field, value) => {
    if (value !== undefined && value !== null && !isVisiblyNonEmpty(value)) {
      finding("TEXT_NOT_VISIBLE", `${trackId}.${field}`);
    }
  };

  for (const t of tracks) {
    textFinding(t.id, "title", t.title);
    textFinding(t.id, "next_action", t.next_action);
    textFinding(t.id, "blocker", t.blocker);
    textFinding(t.id, "rehomed_to", t.rehomed_to);
    t.exit.forEach((line, i) => textFinding(t.id, `exit[${i}]`, line));

    for (const dep of t.depends_on) {
      if (dep === t.id) finding("SELF_DEPENDENCY", t.id);
      else if (!byId.has(dep)) finding("UNKNOWN_DEPENDENCY", `${t.id} depends on ${dep}`);
    }
    if (t.status === "active" || t.status === "done") {
      for (const dep of t.depends_on) {
        const d = byId.get(dep);
        if (d && d !== t && !SATISFIES_DEPENDENCY.has(d.status)) {
          finding(
            t.status === "active" ? "ACTIVE_WITH_OPEN_DEPENDENCY" : "DONE_WITH_OPEN_DEPENDENCY",
            `${t.id} is ${t.status} but ${dep} is ${d.status}`,
          );
        }
      }
    }
    if (t.status === "active" && !isVisiblyNonEmpty(t.resume_file)) {
      finding("ACTIVE_WITHOUT_RESUME_FILE", t.id);
    }
    if (typeof t.resume_file === "string") pathFinding("RESUME_FILE_INVALID", t.id, t.resume_file);
    for (const ev of t.evidence) pathFinding("EVIDENCE_INVALID", t.id, ev);
    if (t.status === "rehomed" && typeof t.rehomed_to === "string") {
      pathFinding("REHOMED_TARGET_INVALID", t.id, t.rehomed_to);
    }
  }

  // Cycle detection over depends_on.
  const state = new Map();
  const visit = (id, stack) => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") {
      finding("DEPENDENCY_CYCLE", [...stack, id].join(" -> "));
      return;
    }
    state.set(id, "visiting");
    for (const dep of byId.get(id)?.depends_on ?? []) if (byId.has(dep) && dep !== id) visit(dep, [...stack, id]);
    state.set(id, "done");
  };
  for (const id of byId.keys()) visit(id, []);

  return findings;
}

/**
 * Validate every program directory: both files must exist, the register must
 * validate, and its slug must equal the directory name.
 */
export function checkAllRegisters(root) {
  const schema = loadSchema(root);
  const tracked = trackedFiles(root);
  const results = [];
  for (const name of listProgramDirs(root)) {
    const dir = `${PROGRAMS_DIR}/${name}`;
    const rel = `${dir}/tracks.yaml`;
    const findings = [];
    if (!existsSync(resolve(root, `${dir}/PROGRAM.md`))) {
      findings.push({ code: "PROGRAM_FILE_MISSING", path: `${dir}/PROGRAM.md` });
    }
    if (!existsSync(resolve(root, rel))) {
      findings.push({ code: "REGISTER_MISSING", path: rel });
      results.push({ path: rel, findings });
      continue;
    }
    const register = loadRegister(root, rel);
    findings.push(...validateRegister(register, { root, relativePath: rel, schema, tracked, programDir: name }));
    results.push({ path: rel, findings });
  }
  return results;
}
