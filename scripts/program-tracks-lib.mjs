// Validation for program track registers under docs/programs/*/tracks.yaml.
// Pure functions; the test file and the CLI both call `validateRegister`.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import YAML from "yaml";

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

/**
 * Returns a list of findings ({code, path, detail}). Empty means valid.
 * Structural checks come from the JSON schema; the cross-row invariants
 * (one active track, unique ids, resolvable dependencies, acyclic graph,
 * evidence and resume files present on disk) are checked here because a
 * schema cannot see across rows or onto the filesystem.
 */
export function validateRegister(register, { root, relativePath, schema } = {}) {
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
  const ids = tracks.map((t) => t.id);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) finding("DUPLICATE_ID", id);
    seen.add(id);
  }

  const active = tracks.filter((t) => t.status === "active");
  if (active.length !== 1) {
    finding("ACTIVE_COUNT", `expected exactly 1 active track, found ${active.length}`);
  }

  for (const t of tracks) {
    for (const dep of t.depends_on) {
      if (!seen.has(dep)) finding("UNKNOWN_DEPENDENCY", `${t.id} depends on ${dep}`);
      if (dep === t.id) finding("SELF_DEPENDENCY", t.id);
    }
    if (t.status === "active") {
      for (const dep of t.depends_on) {
        const d = tracks.find((x) => x.id === dep);
        if (d && !["done", "rehomed"].includes(d.status)) {
          finding("ACTIVE_WITH_OPEN_DEPENDENCY", `${t.id} is active but ${dep} is ${d.status}`);
        }
      }
    }
    if (root) {
      if (t.resume_file && !existsSync(resolve(root, t.resume_file))) {
        finding("RESUME_FILE_MISSING", `${t.id}: ${t.resume_file}`);
      }
      for (const ev of t.evidence) {
        if (!existsSync(resolve(root, ev))) finding("EVIDENCE_MISSING", `${t.id}: ${ev}`);
      }
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
    const t = tracks.find((x) => x.id === id);
    for (const dep of t?.depends_on ?? []) if (seen.has(dep)) visit(dep, [...stack, id]);
    state.set(id, "done");
  };
  for (const id of ids) visit(id, []);

  return findings;
}

export function loadSchema(root, relativeDir) {
  return JSON.parse(readFileSync(resolve(root, relativeDir, "tracks.schema.json"), "utf8"));
}

export function checkAllRegisters(root) {
  const results = [];
  for (const rel of listRegisters(root)) {
    const dir = dirname(rel);
    const schema = loadSchema(root, dir);
    const register = loadRegister(root, rel);
    results.push({ path: rel, findings: validateRegister(register, { root, relativePath: rel, schema }) });
  }
  return results;
}
