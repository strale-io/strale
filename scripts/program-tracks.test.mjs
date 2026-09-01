import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAllRegisters, loadRegister, loadSchema, repoRootFrom, validateRegister } from "./program-tracks-lib.mjs";

const root = repoRootFrom(import.meta.url);
const REL = "docs/programs/cto-readiness/tracks.yaml";
const schema = loadSchema(root, "docs/programs/cto-readiness");
const base = () => loadRegister(root, REL);
const codes = (register, withRoot = true) =>
  validateRegister(register, { root: withRoot ? root : undefined, relativePath: REL, schema }).map((f) => f.code);

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

test("a dependency cycle is rejected", () => {
  const r = base();
  r.tracks[0].depends_on = ["T2"];
  r.tracks[1].depends_on = ["T1"];
  assert.ok(codes(r).includes("DEPENDENCY_CYCLE"));
});

test("an active track whose dependency is not done is rejected", () => {
  const r = base();
  r.tracks[0].status = "queued";
  r.tracks[1].status = "active"; // T2 depends on T1, which is now queued
  assert.ok(codes(r).includes("ACTIVE_WITH_OPEN_DEPENDENCY"));
});

test("blocked and founder_gated require a blocker", () => {
  const r = base();
  r.tracks[0].status = "blocked";
  r.tracks[1].status = "active";
  delete r.tracks[0].blocker;
  assert.ok(codes(r).includes("SCHEMA"));
});

test("done requires evidence, and evidence must exist on disk", () => {
  const r = base();
  r.tracks[0].status = "done";
  r.tracks[1].status = "active";
  assert.ok(codes(r).includes("SCHEMA"), "empty evidence on a done track");
  r.tracks[0].evidence = ["docs/programs/cto-readiness/does-not-exist.md"];
  assert.ok(codes(r).includes("EVIDENCE_MISSING"));
});

test("a missing resume file is rejected", () => {
  const r = base();
  r.tracks[0].resume_file = "handoff/_general/from-code/nope.md";
  assert.ok(codes(r).includes("RESUME_FILE_MISSING"));
});

test("an unknown top-level or track field is rejected", () => {
  const r = base();
  r.tracks[0].notes = "free text";
  assert.ok(codes(r).includes("SCHEMA"));
});
