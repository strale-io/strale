// Validation for program track registers under docs/programs/*/tracks.yaml.
// Pure functions; the test file and the CLI both call `validateRegister`.
//
// The JSON schema (docs/programs/tracks.schema.json) owns field shapes. The
// checks below own what a schema cannot see: relations between rows, and
// whether a referenced file really is a tracked regular file inside the repo.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import YAML from "yaml";

export const SCHEMA_PATH = "docs/programs/tracks.schema.json";
const SATISFIES_DEPENDENCY = new Set(["done"]);

export function repoRootFrom(metaUrl) {
  return resolve(dirname(fileURLToPath(metaUrl)), "..");
}

export function listRegisters(root) {
  const programsDir = resolve(root, "docs/programs");
  if (!existsSync(programsDir)) return [];
  return readdirSync(programsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `docs/programs/${d.name}/tracks.yaml`)
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
  if (typeof value !== "string" || value.trim() === "") return "EMPTY";
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
 */
export function validateRegister(register, { root, relativePath, schema, tracked } = {}) {
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

  const tracks = register.tracks;
  const seen = new Set();
  for (const t of tracks) {
    if (seen.has(t.id)) finding("DUPLICATE_ID", t.id);
    seen.add(t.id);
  }
  const byId = new Map(tracks.map((t) => [t.id, t]));

  const active = tracks.filter((t) => t.status === "active");
  if (active.length !== 1) {
    finding("ACTIVE_COUNT", `expected exactly 1 active track, found ${active.length}`);
  }

  const pathFinding = (code, trackId, value) => {
    const problem = classifyRepoPath(root, value, tracked);
    if (problem !== "OK") finding(code, `${trackId}: ${value} (${problem})`);
  };

  for (const t of tracks) {
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
    if (t.status === "active" && (typeof t.resume_file !== "string" || t.resume_file.trim() === "")) {
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

export function checkAllRegisters(root) {
  const schema = loadSchema(root);
  const tracked = trackedFiles(root);
  const results = [];
  for (const rel of listRegisters(root)) {
    const register = loadRegister(root, rel);
    results.push({ path: rel, findings: validateRegister(register, { root, relativePath: rel, schema, tracked }) });
  }
  return results;
}
