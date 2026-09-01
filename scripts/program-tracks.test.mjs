import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkAllRegisters,
  classifyRepoPath,
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
const codes = (register) =>
  validateRegister(register, { root, relativePath: REL, schema, tracked }).map((f) => f.code);
const activate = (r, index) => {
  for (const t of r.tracks) if (t.status === "active") t.status = "queued";
  r.tracks[index].status = "active";
};

test("the committed registers are valid", () => {
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
  r.tracks[1].status = "active";
  r.tracks[1].resume_file = "README.md";
  assert.ok(codes(r).includes("ACTIVE_COUNT"));
});

test("zero active tracks are rejected", () => {
  const r = base();
  r.tracks[0].status = "queued";
  assert.ok(codes(r).includes("ACTIVE_COUNT"));
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
  r.tracks[1].depends_on = ["T2"];
  assert.ok(codes(r).includes("SELF_DEPENDENCY"));
});

test("a dependency cycle is rejected", () => {
  const r = base();
  r.tracks[0].depends_on = ["T2"];
  r.tracks[1].depends_on = ["T1"];
  assert.ok(codes(r).includes("DEPENDENCY_CYCLE"));
});

test("an active track whose dependency is not done is rejected", () => {
  const r = base();
  activate(r, 5); // T6 depends on T1 and T5, both open
  r.tracks[5].resume_file = "README.md";
  assert.ok(codes(r).includes("ACTIVE_WITH_OPEN_DEPENDENCY"));
});

test("a done track whose dependency is not done is rejected", () => {
  const r = base();
  r.tracks[5].status = "done";
  r.tracks[5].evidence = ["README.md"];
  assert.ok(codes(r).includes("DONE_WITH_OPEN_DEPENDENCY"));
});

test("a rehomed dependency does not satisfy an active track", () => {
  const r = base();
  r.tracks[0].status = "rehomed";
  r.tracks[0].rehomed_to = "docs/programs/README.md";
  activate(r, 5);
  r.tracks[5].resume_file = "README.md";
  r.tracks[4].status = "done";
  r.tracks[4].evidence = ["README.md"];
  r.tracks[1].status = "done";
  r.tracks[1].evidence = ["README.md"];
  r.tracks[3].status = "done";
  r.tracks[3].evidence = ["README.md"];
  assert.ok(codes(r).includes("ACTIVE_WITH_OPEN_DEPENDENCY"));
});

for (const status of ["blocked", "founder_gated"]) {
  test(`${status} requires a blocker`, () => {
    const r = base();
    r.tracks[0].status = status;
    activate(r, 1);
    r.tracks[1].resume_file = "README.md";
    delete r.tracks[0].blocker;
    assert.ok(codes(r).includes("SCHEMA"));
    r.tracks[0].blocker = "   ";
    assert.ok(codes(r).includes("SCHEMA"), "whitespace-only blocker");
    r.tracks[0].blocker = "waiting on independent review";
    assert.ok(!codes(r).includes("SCHEMA"));
  });
}

test("a blocker on a non-blocked track is rejected", () => {
  const r = base();
  r.tracks[1].blocker = "should not be here";
  assert.ok(codes(r).includes("SCHEMA"));
});

test("rehomed requires rehomed_to, and rehomed_to is rejected elsewhere", () => {
  const r = base();
  r.tracks[1].status = "rehomed";
  assert.ok(codes(r).includes("SCHEMA"));
  r.tracks[1].rehomed_to = "docs/programs/README.md";
  assert.ok(!codes(r).includes("SCHEMA"));
  const r2 = base();
  r2.tracks[1].rehomed_to = "docs/programs/README.md";
  assert.ok(codes(r2).includes("SCHEMA"));
});

test("done requires evidence, and evidence must be a tracked regular file", () => {
  const r = base();
  r.tracks[1].status = "done";
  assert.ok(codes(r).includes("SCHEMA"), "empty evidence on a done track");
  for (const bad of ["docs/programs/does-not-exist.md", "docs", "../strale/README.md", "C:/Windows", "/etc/passwd", ".git"]) {
    r.tracks[1].evidence = [bad];
    assert.ok(codes(r).includes("EVIDENCE_INVALID"), `evidence ${bad} should be rejected`);
  }
  r.tracks[1].evidence = ["README.md"];
  assert.ok(!codes(r).includes("EVIDENCE_INVALID"));
});

test("untracked evidence is rejected when a tracked set is supplied", () => {
  const dir = mkdtempSync(join(tmpdir(), "tracks-"));
  try {
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(join(dir, "docs/untracked.md"), "x");
    assert.equal(classifyRepoPath(dir, "docs/untracked.md", new Set()), "UNTRACKED");
    assert.equal(classifyRepoPath(dir, "docs/untracked.md", new Set(["docs/untracked.md"])), "OK");
    assert.equal(classifyRepoPath(dir, "docs/untracked.md"), "OK", "no tracked set means disk checks only");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an active track must have a resume file that is a tracked regular file", () => {
  const r = base();
  r.tracks[0].resume_file = null;
  assert.ok(codes(r).includes("ACTIVE_WITHOUT_RESUME_FILE"));
  for (const bad of ["handoff/_general/from-code/nope.md", "docs", ".git", "../x.md"]) {
    r.tracks[0].resume_file = bad;
    assert.ok(codes(r).includes("RESUME_FILE_INVALID"), `resume file ${bad} should be rejected`);
  }
  r.tracks[0].resume_file = "   ";
  assert.ok(codes(r).includes("SCHEMA"), "whitespace resume file");
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
