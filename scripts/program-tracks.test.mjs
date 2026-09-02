import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkAllRegisters,
  classifyRepoPath,
  isCalendarDate,
  isVisiblyNonEmpty,
  loadRegister,
  loadSchema,
  repoRootFrom,
  trackedFiles,
  validateRegister,
} from "./program-tracks-lib.mjs";

const root = repoRootFrom(import.meta.url);
const REL = "docs/programs/cto-readiness/tracks.yaml";
const schema = loadSchema(root);
const tracked = trackedFiles(root);
const base = () => loadRegister(root, REL);
const codes = (register, extra = {}) =>
  validateRegister(register, { root, relativePath: REL, schema, tracked, programDir: "cto-readiness", ...extra }).map((f) => f.code);
const activate = (r, index) => {
  for (const t of r.tracks) if (t.status === "active") t.status = "queued";
  r.tracks[index].status = "active";
};
// The register's row order and which track is active change as work lands;
// tests locate rows by status, never by position.
const activeIdx = (r) => r.tracks.findIndex((t) => t.status === "active");
const byId = (r, id) => r.tracks.find((t) => t.id === id);
const idx = (r, id) => r.tracks.findIndex((t) => t.id === id);
const queuedIdx = (r) => r.tracks.findIndex((t) => t.status === "queued");
const finish = (t) => {
  t.status = "done";
  t.evidence = ["README.md"];
  delete t.blocker;
};

test("positive smoke test (not mutation evidence): the committed registers are valid", () => {
  const results = checkAllRegisters(root);
  assert.ok(results.length >= 1, "at least one register exists");
  for (const r of results) assert.deepEqual(r.findings, [], `${r.path} has findings`);
});

test("an unsupported status is rejected", () => {
  const r = base();
  r.tracks[0].status = "finished";
  assert.ok(codes(r).includes("SCHEMA"));
});

test("two active tracks are rejected", () => {
  const r = base();
  const q = r.tracks[queuedIdx(r)];
  q.status = "active";
  q.resume_file = "README.md";
  assert.ok(codes(r).includes("ACTIVE_COUNT"));
});

test("zero active tracks are rejected while the program is active", () => {
  const r = base();
  r.tracks[activeIdx(r)].status = "queued";
  assert.ok(codes(r).includes("ACTIVE_COUNT"));
});

test("program_status paused: no active track, a gate must exist, nothing runnable", () => {
  const r = base();
  r.program_status = "paused";
  assert.ok(codes(r).includes("PAUSED_WITH_ACTIVE_TRACK"));
  for (const t of r.tracks) finish(t);
  byId(r, "T7").status = "founder_gated";
  byId(r, "T7").blocker = "founder yes on the exact reviewed commit";
  byId(r, "T7").evidence = [];
  byId(r, "T8").status = "queued";
  byId(r, "T8").evidence = [];
  byId(r, "T9").status = "queued";
  byId(r, "T9").evidence = [];
  assert.deepEqual(codes(r), [], "a correctly paused program is valid");
  byId(r, "T7").status = "queued";
  delete byId(r, "T7").blocker;
  const c = codes(r);
  assert.ok(c.includes("PAUSED_WITHOUT_GATE"));
  assert.ok(c.includes("PAUSED_WITH_RUNNABLE_TRACK"), "T7's dependencies are done, so it is runnable");
});

test("program_status complete requires every track terminal", () => {
  const r = base();
  r.program_status = "complete";
  assert.ok(codes(r).includes("COMPLETE_WITH_OPEN_TRACK"));
  for (const t of r.tracks) finish(t);
  assert.deepEqual(codes(r), []);
});

test("an unsupported program_status is rejected", () => {
  const r = base();
  r.program_status = "running";
  assert.ok(codes(r).includes("SCHEMA"));
});

test("the program slug must equal its directory name", () => {
  const r = base();
  assert.ok(codes(r, { programDir: "other-program" }).includes("PROGRAM_SLUG_MISMATCH"));
});

test("updated must be a real calendar date", () => {
  assert.equal(isCalendarDate("2026-99-99"), false);
  assert.equal(isCalendarDate("2026-02-30"), false);
  assert.equal(isCalendarDate("2026-09-02"), true);
  const r = base();
  r.updated = "2026-99-99";
  assert.ok(codes(r).includes("UPDATED_NOT_A_DATE"));
});

test("duplicate dependency edges are rejected", () => {
  const r = base();
  r.tracks[2].depends_on = ["T2", "T2"];
  assert.ok(codes(r).includes("SCHEMA"));
});

test("invisible text is rejected wherever text is required", () => {
  const invisible = ["\u200b\u200b\u200b", "   ", "\u034f\u034f\u034f", "\u200d\u200c\u2060", "\u00ad\u00ad\u00ad", "\ufeff"];
  for (const s of invisible) assert.equal(isVisiblyNonEmpty(s), false, JSON.stringify(s));
  assert.equal(isVisiblyNonEmpty(" a "), true);
  assert.equal(isVisiblyNonEmpty("\u00e9"), true);
  assert.equal(isVisiblyNonEmpty("7"), true);
  // Field-level cases use strings long enough to clear the schema's minLength,
  // so the only check that can reject them is the visibility rule.
  for (const field of ["title", "next_action"]) {
    for (const s of invisible) {
      const r = base();
      r.tracks[0][field] = s.repeat(12);
      assert.ok(codes(r).includes("TEXT_NOT_VISIBLE"), `${field} ${JSON.stringify(s)}`);
    }
  }
  for (const s of invisible) {
    const r = base();
    r.tracks[0].exit = [s.repeat(12)];
    assert.ok(codes(r).includes("TEXT_NOT_VISIBLE"), `exit ${JSON.stringify(s)}`);
    const r2 = base();
    r2.tracks[0].status = "blocked";
    r2.tracks[0].blocker = s.repeat(12);
    activate(r2, 1);
    r2.tracks[1].resume_file = "README.md";
    assert.ok(codes(r2).includes("TEXT_NOT_VISIBLE"), `blocker ${JSON.stringify(s)}`);
    const r3 = base();
    r3.tracks[1].status = "rehomed";
    r3.tracks[1].rehomed_to = s.repeat(12);
    assert.ok(codes(r3).includes("TEXT_NOT_VISIBLE"), `rehomed_to ${JSON.stringify(s)}`);
  }
});

test("duplicate ids are rejected", () => {
  const r = base();
  r.tracks[1].id = r.tracks[0].id;
  assert.ok(codes(r).includes("DUPLICATE_ID"));
});

test("an unknown dependency is rejected", () => {
  const r = base();
  r.tracks[1].depends_on = ["T99"];
  assert.ok(codes(r).includes("UNKNOWN_DEPENDENCY"));
});

test("a self dependency is rejected", () => {
  const r = base();
  byId(r, "T2").depends_on = ["T2"];
  assert.ok(codes(r).includes("SELF_DEPENDENCY"));
});

test("a dependency cycle is rejected", () => {
  const r = base();
  byId(r, "T1").depends_on = ["T2"];
  byId(r, "T2").depends_on = ["T1"];
  assert.ok(codes(r).includes("DEPENDENCY_CYCLE"));
});

test("an active track whose dependency is not done is rejected", () => {
  const r = base();
  activate(r, idx(r, "T6")); // T6 depends on T5 and T10, both open
  byId(r, "T6").resume_file = "README.md";
  assert.ok(codes(r).includes("ACTIVE_WITH_OPEN_DEPENDENCY"));
});

test("a done track whose dependency is not done is rejected", () => {
  const r = base();
  finish(byId(r, "T6"));
  assert.ok(codes(r).includes("DONE_WITH_OPEN_DEPENDENCY"));
});

test("a rehomed dependency does not satisfy an active track", () => {
  const r = base();
  byId(r, "T10").status = "rehomed";
  byId(r, "T10").rehomed_to = "docs/programs/README.md";
  for (const id of ["T1", "T2", "T4", "T5"]) finish(byId(r, id));
  activate(r, idx(r, "T6"));
  byId(r, "T6").resume_file = "README.md";
  assert.ok(codes(r).includes("ACTIVE_WITH_OPEN_DEPENDENCY"));
});

for (const status of ["blocked", "founder_gated"]) {
  test(`${status} requires a blocker`, () => {
    const r = base();
    r.tracks[0].status = status;
    activate(r, 1);
    r.tracks[1].resume_file = "README.md";
    // every later track back to queued: a done track whose dependency is
    // the (now non-done) track 0 or 1 would otherwise add a DEPENDENCY finding
    for (const t of r.tracks.slice(2)) { t.status = "queued"; t.evidence = []; delete t.blocker; }
    delete r.tracks[0].blocker;
    assert.ok(codes(r).includes("SCHEMA"));
    r.tracks[0].blocker = "   ";
    assert.ok(codes(r).includes("TEXT_NOT_VISIBLE"), "whitespace-only blocker");
    r.tracks[0].blocker = "waiting on independent review";
    assert.deepEqual(codes(r), []);
  });
}

test("a blocker on a non-blocked track is rejected", () => {
  const r = base();
  r.tracks[1].blocker = "should not be here";
  assert.ok(codes(r).includes("SCHEMA"));
});

test("rehomed requires rehomed_to, and rehomed_to is rejected elsewhere", () => {
  const r = base();
  const q = r.tracks[queuedIdx(r)];
  q.status = "rehomed";
  assert.ok(codes(r).includes("SCHEMA"));
  q.rehomed_to = "docs/programs/README.md";
  assert.deepEqual(codes(r), []);
  const r2 = base();
  r2.tracks[queuedIdx(r2)].rehomed_to = "docs/programs/README.md";
  assert.ok(codes(r2).includes("SCHEMA"));
});

test("done requires evidence, and evidence must be a tracked regular file", () => {
  const r = base();
  const q = r.tracks[queuedIdx(r)];
  q.depends_on = [];
  q.status = "done";
  q.evidence = [];
  assert.ok(codes(r).includes("SCHEMA"), "empty evidence on a done track");
  for (const bad of ["docs/programs/does-not-exist.md", "docs", "../strale/README.md", "C:/Windows", "/etc/passwd", ".git"]) {
    q.evidence = [bad];
    assert.ok(codes(r).includes("EVIDENCE_INVALID"), `evidence ${bad} should be rejected`);
  }
  q.evidence = ["README.md"];
  assert.deepEqual(codes(r), []);
});

test("each path check rejects on its own, with competing checks unable to fire", () => {
  const dir = mkdtempSync(join(tmpdir(), "tracks-paths-"));
  try {
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(join(dir, "docs/a.md"), "x");
    writeFileSync(join(dir, "outside.md"), "x");
    const inner = join(dir, "docs");
    // A directory that is "tracked" (as a prefix) and exists: only the regular-file check can reject it.
    assert.equal(classifyRepoPath(dir, "docs", new Set(["docs", "docs/a.md"])), "NOT_A_FILE");
    // A traversal path whose target exists and is "tracked": only traversal detection can reject it.
    assert.equal(classifyRepoPath(inner, "../outside.md", new Set(["../outside.md"])), "ESCAPES_ROOT");
    // An existing regular file that is not tracked: only the tracked check can reject it.
    assert.equal(classifyRepoPath(dir, "docs/a.md", new Set()), "UNTRACKED");
    assert.equal(classifyRepoPath(dir, "docs/a.md", new Set(["docs/a.md"])), "OK");
    assert.equal(classifyRepoPath(dir, "docs/a.md"), "OK", "no tracked set means disk checks only");
    assert.equal(classifyRepoPath(dir, "\u200b", new Set()), "EMPTY");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("validateRegister applies the tracked set to resume files, evidence, and rehome targets", () => {
  const dir = mkdtempSync(join(tmpdir(), "tracks-tracked-"));
  try {
    writeFileSync(join(dir, "resume.md"), "x");
    writeFileSync(join(dir, "evidence.md"), "x");
    writeFileSync(join(dir, "home.md"), "x");
    const register = {
      schema_version: 1,
      program: "p",
      program_status: "active",
      updated: "2026-09-02",
      tracks: [
        { id: "T1", title: "one", status: "active", gate: "none", depends_on: [], owner: "session", next_action: "do the thing", resume_file: "resume.md", exit: ["done when"], evidence: [] },
        { id: "T2", title: "two", status: "done", gate: "none", depends_on: [], owner: "session", next_action: "did the thing", resume_file: null, exit: ["done when"], evidence: ["evidence.md"] },
        { id: "T3", title: "three", status: "rehomed", gate: "none", rehomed_to: "home.md", depends_on: [], owner: "session", next_action: "moved the thing", resume_file: null, exit: ["done when"], evidence: [] },
      ],
    };
    const detail = validateRegister(register, { root: dir, relativePath: "tracks.yaml", schema, tracked: new Set(), programDir: "p" });
    const found = detail.map((f) => f.code).sort();
    assert.deepEqual(found, ["EVIDENCE_INVALID", "REHOMED_TARGET_INVALID", "RESUME_FILE_INVALID"]);
    assert.ok(detail.every((f) => f.detail.includes("UNTRACKED")));
    const ok = validateRegister(register, { root: dir, relativePath: "tracks.yaml", schema, tracked: new Set(["resume.md", "evidence.md", "home.md"]), programDir: "p" });
    assert.deepEqual(ok, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an active track must have a resume file that is a tracked regular file", () => {
  const r = base();
  const a = r.tracks[activeIdx(r)];
  a.resume_file = null;
  assert.ok(codes(r).includes("ACTIVE_WITHOUT_RESUME_FILE"));
  for (const bad of ["handoff/_general/from-code/nope.md", "docs", ".git", "../x.md"]) {
    a.resume_file = bad;
    assert.ok(codes(r).includes("RESUME_FILE_INVALID"), `resume file ${bad} should be rejected`);
  }
  a.resume_file = "   ";
  assert.ok(codes(r).includes("ACTIVE_WITHOUT_RESUME_FILE"), "whitespace resume file");
});

test("a rehomed_to target must be a tracked regular file", () => {
  const r = base();
  r.tracks[1].status = "rehomed";
  r.tracks[1].rehomed_to = "docs/programs/nowhere.md";
  assert.ok(codes(r).includes("REHOMED_TARGET_INVALID"));
});

test("an unknown field is rejected at both levels", () => {
  const r = base();
  r.tracks[0].notes = "free text";
  assert.ok(codes(r).includes("SCHEMA"), "track-level");
  const r2 = base();
  r2.extra = true;
  assert.ok(codes(r2).includes("SCHEMA"), "top-level");
});

test("every track declares a gate, and post-m2 tracks require exactly one m2-exit track", () => {
  const r = base();
  delete r.tracks[0].gate;
  assert.ok(codes(r).includes("SCHEMA"));
  const r2 = base();
  r2.tracks[0].gate = "later";
  assert.ok(codes(r2).includes("SCHEMA"));
  const r3 = base();
  byId(r3, "T10").gate = "m2";
  assert.ok(codes(r3).includes("GATE_COUNT"));
  const r4 = base();
  byId(r4, "T2").gate = "m2-exit";
  assert.ok(codes(r4).includes("GATE_COUNT"));
});

test("program directories must hold both files and a matching slug", () => {
  const dir = mkdtempSync(join(tmpdir(), "tracks-topology-"));
  try {
    execFileSync("git", ["-C", dir, "init", "-q"]);
    mkdirSync(join(dir, "docs/programs/alpha"), { recursive: true });
    mkdirSync(join(dir, "docs/programs/beta"), { recursive: true });
    mkdirSync(join(dir, "docs/programs/gamma"), { recursive: true });
    writeFileSync(join(dir, "docs/programs/tracks.schema.json"), JSON.stringify(schema));
    writeFileSync(join(dir, "docs/programs/alpha/PROGRAM.md"), "# alpha\n");
    // alpha: PROGRAM.md only
    // beta: register only, slug mismatch
    const reg = `schema_version: 1\nprogram: not-beta\nprogram_status: active\nupdated: 2026-09-02\ntracks:\n  - id: T1\n    title: one\n    status: active\n    gate: none\n    depends_on: []\n    owner: session\n    next_action: do the thing\n    resume_file: README.md\n    exit: [done when]\n    evidence: []\n`;
    writeFileSync(join(dir, "docs/programs/beta/tracks.yaml"), reg);
    writeFileSync(join(dir, "README.md"), "x");
    // gamma: both files, valid
    writeFileSync(join(dir, "docs/programs/gamma/PROGRAM.md"), "# gamma\n");
    writeFileSync(join(dir, "docs/programs/gamma/tracks.yaml"), reg.replace("not-beta", "gamma"));
    execFileSync("git", ["-C", dir, "add", "-A"]);
    const results = Object.fromEntries(checkAllRegisters(dir).map((r) => [r.path, r.findings.map((f) => f.code)]));
    assert.deepEqual(results["docs/programs/alpha/tracks.yaml"], ["REGISTER_MISSING"]);
    assert.deepEqual(results["docs/programs/beta/tracks.yaml"], ["PROGRAM_FILE_MISSING", "PROGRAM_SLUG_MISMATCH"]);
    assert.deepEqual(results["docs/programs/gamma/tracks.yaml"], []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
