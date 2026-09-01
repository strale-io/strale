import assert from "node:assert/strict";
import test from "node:test";

import {
  DECISION_CANDIDATE_BANNER,
  generateDecisionIndex,
  parseDecisionRecord,
  readDecisionRecords,
  validateActiveBodyChange,
  validateActiveDecisionImmutability,
  validateDecisionRecords,
} from "./decision-records-lib.mjs";

function record({
  id,
  status = "active",
  topic = "operating-model",
  relations = [],
  decision = "Use the recorded operating model.",
}) {
  const relationYaml = relations.length === 0
    ? "[]"
    : `\n${relations.map((relation) => `  - type: ${relation.type}\n    target: ${relation.target}`).join("\n")}`;
  const content = `---\nid: ${id}\ntitle: Test ${id}\nstatus: ${status}\ntopic: ${topic}\nscope: global\nowner: petter\ndecided_at: 2026-08-22\nrelations: ${relationYaml}\nevidence:\n  - https://example.com/${id}\nmigration_status: candidate\nauthority_scope: none\nauthority_active: false\nphase: M2\n---\n\n${DECISION_CANDIDATE_BANNER}\n\n## Decision\n\n${decision}\n\n## Context\n\nContext.\n\n## Rationale\n\nRationale.\n\n## Consequences\n\nConsequences.\n\n## Reversal conditions\n\nReversal conditions.\n`;
  return parseDecisionRecord(`docs/decisions/records/${id}.md`, content);
}

test("the readiness, charter, and daily-run amendment chain stays active", () => {
  const records = [
    record({ id: "DEC-20260812-A" }),
    record({
      id: "DEC-20260815-A",
      relations: [{ type: "amends", target: "DEC-20260812-A" }],
    }),
    record({
      id: "DEC-20260822-A",
      relations: [{ type: "amends", target: "DEC-20260815-A" }],
    }),
  ];
  assert.deepEqual(validateDecisionRecords(records), []);
  assert.ok(records.every((item) => item.metadata.status === "active"));
});

test("supersedes retires its target and generates the inverse once", () => {
  const records = [
    record({ id: "DEC-20260502-A", status: "superseded", topic: "old-product" }),
    record({
      id: "DEC-20260812-A",
      relations: [{ type: "supersedes", target: "DEC-20260502-A" }],
    }),
  ];
  assert.deepEqual(validateDecisionRecords(records), []);
  const index = generateDecisionIndex(records);
  assert.match(index, /`superseded_by`/);
  assert.equal(index.match(/`superseded_by`/g)?.length, 1);
});

test("supersedes cannot leave its target active", () => {
  const records = [
    record({ id: "DEC-20260502-A", topic: "old-product" }),
    record({
      id: "DEC-20260812-A",
      relations: [{ type: "supersedes", target: "DEC-20260502-A" }],
    }),
  ];
  assert.ok(
    validateDecisionRecords(records).some(
      (item) => item.code === "DECISION_SUPERSESSION_TARGET_NOT_RETIRED",
    ),
  );
});

test("missing and invented relation targets fail", () => {
  const missing = record({
    id: "DEC-20260812-A",
    relations: [{ type: "amends", target: "DEC-20260811-A" }],
  });
  assert.ok(
    validateDecisionRecords([missing]).some(
      (item) => item.code === "DECISION_RELATION_TARGET_MISSING",
    ),
  );
  const invented = { ...missing, metadata: { ...missing.metadata, relations: [{ type: "amends", target: "D-17" }] } };
  assert.ok(
    validateDecisionRecords([invented]).some(
      (item) => item.code === "DECISION_SCHEMA_INVALID",
    ),
  );
});

test("unrelated active decisions cannot share a topic", () => {
  const findings = validateDecisionRecords([
    record({ id: "DEC-20260812-A" }),
    record({ id: "DEC-20260815-A" }),
  ]);
  assert.ok(
    findings.some((item) => item.code === "DECISION_MULTIPLE_UNRELATED_ACTIVE_TOPIC"),
  );
});

test("an active decision body is immutable while metadata may transition", () => {
  const previous = record({ id: "DEC-20260812-A" });
  const transitioned = record({ id: "DEC-20260812-A", status: "superseded" });
  assert.deepEqual(validateActiveBodyChange(previous, transitioned, previous.file), []);

  const rewritten = record({
    id: "DEC-20260812-A",
    decision: "Replace the protected substance in place.",
  });
  assert.ok(
    validateActiveBodyChange(previous, rewritten, previous.file).some(
      (item) => item.code === "DECISION_ACTIVE_BODY_CHANGED",
    ),
  );

  const renamed = record({ id: "DEC-20260812-A" });
  renamed.metadata.title = "Rewritten title";
  assert.ok(
    validateActiveBodyChange(previous, renamed, previous.file).some(
      (item) => item.code === "DECISION_ACTIVE_METADATA_CHANGED",
    ),
  );

  const regressed = record({ id: "DEC-20260812-A", status: "proposed" });
  assert.ok(
    validateActiveBodyChange(previous, regressed, previous.file).some(
      (item) => item.code === "DECISION_ACTIVE_STATUS_REGRESSION",
    ),
  );
});

test("a superseded record must have a formal incoming supersession", () => {
  assert.ok(
    validateDecisionRecords([
      record({ id: "DEC-20260502-A", status: "superseded", topic: "old-product" }),
    ]).some((item) => item.code === "DECISION_SUPERSEDED_WITHOUT_SOURCE"),
  );
});

test("generated index stays explicitly inactive", () => {
  const index = generateDecisionIndex([record({ id: "DEC-20260812-A" })]);
  assert.match(index, /authority_scope: none/);
  assert.match(index, /authority_active: false/);
  assert.match(index, /status: candidate/);
  assert.match(index, /NOT ACTIVE PROJECT AUTHORITY/);
});

test("the repository decision candidates and merge-base immutability checks pass", () => {
  const records = readDecisionRecords(process.cwd());
  assert.deepEqual(validateDecisionRecords(records), []);
  assert.deepEqual(validateActiveDecisionImmutability(process.cwd(), records), []);
});
