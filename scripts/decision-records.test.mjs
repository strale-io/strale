import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  DECISION_CANDIDATE_BANNER,
  DECISION_ID_COLLISION_SCHEMA,
  generateDecisionIndex,
  parseDecisionRecord,
  readDecisionRecords,
  validateActiveBodyChange,
  validateActiveDecisionImmutability,
  validateDecisionIdCollisions,
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

test("a proposed or rejected record cannot perform a supersession", () => {
  for (const status of ["proposed", "rejected"]) {
    const records = [
      record({ id: "DEC-20260502-A", status: "superseded", topic: "old-product" }),
      record({
        id: "DEC-20260812-A",
        status,
        relations: [{ type: "supersedes", target: "DEC-20260502-A" }],
      }),
    ];
    assert.ok(
      validateDecisionRecords(records).some(
        (item) => item.code === "DECISION_SUPERSESSION_SOURCE_INEFFECTIVE",
      ),
    );
  }
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

test("an unresolved historical ID collision blocks records and relation targets", () => {
  const registry = {
    schema_version: 1,
    authority_scope: "none",
    status: "candidate",
    complete: false,
    phase: "M2",
    authority_active: false,
    source_data_source: "collection://decisions",
    observed_at: "2026-09-01",
    collision_count: 1,
    source_row_count: 2,
    collisions: [
      {
        id: "DEC-20260502-A",
        resolution_status: "unresolved",
        resolution_evidence: null,
        records: [
          {
            title: "Product decision",
            historical_status: "superseded",
            source_url: "https://app.notion.com/one",
          },
          {
            title: "Pricing decision",
            historical_status: "active",
            source_url: "https://app.notion.com/two",
          },
        ],
      },
    ],
  };
  assert.ok(DECISION_ID_COLLISION_SCHEMA);
  assert.deepEqual(validateDecisionIdCollisions("collisions.yaml", registry), []);
  assert.ok(
    validateDecisionRecords([
      record({ id: "DEC-20260502-A", status: "superseded", topic: "old-product" }),
    ], registry).some((item) => item.code === "DECISION_ID_COLLISION_IMPORTED"),
  );
  assert.ok(
    validateDecisionRecords([
      record({
        id: "DEC-20260812-A",
        relations: [{ type: "supersedes", target: "DEC-20260502-A" }],
      }),
    ], registry).some((item) => item.code === "DECISION_RELATION_TARGET_COLLIDED"),
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

test("related_to is an explicit non-retiring same-topic relationship", () => {
  assert.deepEqual(validateDecisionRecords([
    record({ id: "DEC-20260812-A" }),
    record({
      id: "DEC-20260815-A",
      relations: [{ type: "related_to", target: "DEC-20260812-A" }],
    }),
  ]), []);
});

test("hidden headings and a commented banner do not satisfy the document contract", () => {
  const visible = record({ id: "DEC-20260812-A" });
  const commented = parseDecisionRecord(
    visible.file,
    visible.content.replace(
      DECISION_CANDIDATE_BANNER,
      `<!--${DECISION_CANDIDATE_BANNER}-->`,
    ),
  );
  assert.ok(
    validateDecisionRecords([commented]).some(
      (item) => item.code === "DECISION_CANDIDATE_PREAMBLE_INVALID",
    ),
  );

  const fenced = parseDecisionRecord(
    visible.file,
    visible.content.replace(
      /## Decision[\s\S]*$/,
      "```md\n## Decision\nHidden.\n## Context\nHidden.\n## Rationale\nHidden.\n## Consequences\nHidden.\n## Reversal conditions\nHidden.\n```\n",
    ),
  );
  assert.ok(
    validateDecisionRecords([fenced]).some(
      (item) => item.code === "DECISION_BODY_SECTIONS_INVALID",
    ),
  );

  const longFence = parseDecisionRecord(
    visible.file,
    visible.content.replace(
      /## Decision[\s\S]*$/,
      "````md\n## Decision\nHidden.\n## Context\nHidden.\n## Rationale\nHidden.\n## Consequences\nHidden.\n## Reversal conditions\nHidden.\n```\n",
    ),
  );
  assert.ok(
    validateDecisionRecords([longFence]).some(
      (item) => item.code === "DECISION_BODY_SECTIONS_INVALID",
    ),
  );

  const extraSection = parseDecisionRecord(
    visible.file,
    `${visible.content}\n## Implementation notes\n\nThis is a sixth section.\n`,
  );
  assert.ok(
    validateDecisionRecords([extraSection]).some(
      (item) => item.code === "DECISION_BODY_SECTIONS_INVALID",
    ),
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

  const relationRewritten = record({ id: "DEC-20260812-A" });
  relationRewritten.metadata.relations = [{
    type: "related_to",
    target: "DEC-20260815-A",
  }];
  assert.ok(
    validateActiveBodyChange(previous, relationRewritten, previous.file).some(
      (item) => item.code === "DECISION_ACTIVE_METADATA_CHANGED" && item.detail === "relations",
    ),
  );

  const evidenceRewritten = record({ id: "DEC-20260812-A" });
  evidenceRewritten.metadata.evidence = ["https://example.com/replacement"];
  assert.ok(
    validateActiveBodyChange(previous, evidenceRewritten, previous.file).some(
      (item) => item.code === "DECISION_ACTIVE_METADATA_CHANGED" && item.detail === "evidence",
    ),
  );

  const regressed = record({ id: "DEC-20260812-A", status: "proposed" });
  assert.ok(
    validateActiveBodyChange(previous, regressed, previous.file).some(
      (item) => item.code === "DECISION_ACTIVE_STATUS_REGRESSION",
    ),
  );
});

test("proposed and rejected status history only moves forward", () => {
  const proposed = record({ id: "DEC-20260812-A", status: "proposed" });
  for (const allowed of ["proposed", "active", "rejected"]) {
    assert.deepEqual(
      validateActiveBodyChange(
        proposed,
        record({ id: "DEC-20260812-A", status: allowed }),
        proposed.file,
      ),
      [],
    );
  }
  assert.ok(
    validateActiveBodyChange(
      proposed,
      record({ id: "DEC-20260812-A", status: "superseded" }),
      proposed.file,
    ).some((item) => item.code === "DECISION_ACTIVE_STATUS_REGRESSION"),
  );

  const rejected = record({ id: "DEC-20260812-A", status: "rejected" });
  assert.ok(
    validateActiveBodyChange(
      rejected,
      record({ id: "DEC-20260812-A", status: "active" }),
      rejected.file,
    ).some((item) => item.code === "DECISION_ACTIVE_STATUS_REGRESSION"),
  );
});

test("directional decision relationships cannot form a cycle", () => {
  for (const type of ["supersedes", "amends", "interprets", "affirms"]) {
    const status = type === "supersedes" ? "superseded" : "active";
    const findings = validateDecisionRecords([
      record({
        id: "DEC-20260812-A",
        status,
        topic: "left",
        relations: [{ type, target: "DEC-20260815-A" }],
      }),
      record({
        id: "DEC-20260815-A",
        status,
        topic: "right",
        relations: [{ type, target: "DEC-20260812-A" }],
      }),
    ]);
    assert.ok(findings.some((item) => item.code === "DECISION_RELATION_CYCLE"), type);
  }
});

test("superseded and retired history stays protected permanently", () => {
  for (const status of ["superseded", "retired"]) {
    const previous = record({ id: "DEC-20260812-A", status });
    const rewritten = record({
      id: "DEC-20260812-A",
      status,
      decision: "Rewrite history after it stopped being active.",
    });
    assert.ok(
      validateActiveBodyChange(previous, rewritten, previous.file).some(
        (item) => item.code === "DECISION_ACTIVE_BODY_CHANGED",
      ),
    );
  }

  const previous = record({ id: "DEC-20260812-A", status: "superseded" });
  const regressed = record({ id: "DEC-20260812-A", status: "retired" });
  assert.ok(
    validateActiveBodyChange(previous, regressed, previous.file).some(
      (item) => item.code === "DECISION_ACTIVE_STATUS_REGRESSION",
    ),
  );
});

test("removing superseded history is detected against a later merge base", () => {
  const root = mkdtempSync(join(tmpdir(), "strale-decision-history-"));
  try {
    const previous = record({ id: "DEC-20260812-A", status: "superseded" });
    const absolute = join(root, previous.file);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, previous.content, "utf8");
    execFileSync("git", ["init"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    execFileSync("git", ["add", previous.file], { cwd: root });
    execFileSync("git", ["commit", "-m", "base"], { cwd: root });
    assert.ok(
      validateActiveDecisionImmutability(root, [], "HEAD").some(
        (item) => item.code === "DECISION_ACTIVE_RECORD_REMOVED",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("removing proposed or rejected history is detected against a later merge base", () => {
  for (const status of ["proposed", "rejected"]) {
    const root = mkdtempSync(join(tmpdir(), `strale-decision-${status}-history-`));
    try {
      const previous = record({ id: "DEC-20260812-A", status });
      const absolute = join(root, previous.file);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, previous.content, "utf8");
      execFileSync("git", ["init", "-q"], { cwd: root });
      execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
      execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
      execFileSync("git", ["add", previous.file], { cwd: root });
      execFileSync("git", ["commit", "-m", "base"], { cwd: root });
      assert.ok(
        validateActiveDecisionImmutability(root, [], "HEAD").some(
          (item) => item.code === "DECISION_RECORD_REMOVED",
        ),
        status,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("rejected history cannot reactivate at a later merge base", () => {
  const root = mkdtempSync(join(tmpdir(), "strale-decision-rejected-reactivation-"));
  try {
    const previous = record({ id: "DEC-20260812-A", status: "rejected" });
    const absolute = join(root, previous.file);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, previous.content, "utf8");
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    execFileSync("git", ["add", previous.file], { cwd: root });
    execFileSync("git", ["commit", "-m", "base"], { cwd: root });

    const next = record({ id: "DEC-20260812-A", status: "active" });
    writeFileSync(absolute, next.content, "utf8");
    assert.ok(
      validateActiveDecisionImmutability(root, [next], "HEAD").some(
        (item) => item.code === "DECISION_ACTIVE_STATUS_REGRESSION" &&
          item.detail === "rejected->active",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
  assert.match(index, /\| Status \|/);
});

test("the repository decision candidates and merge-base immutability checks pass", () => {
  const records = readDecisionRecords(process.cwd());
  assert.deepEqual(validateDecisionRecords(records), []);
  assert.deepEqual(validateActiveDecisionImmutability(process.cwd(), records), []);
});
