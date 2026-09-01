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
  validateDecisionCollisionImmutability,
  validateDecisionIdCollisions,
  validateDecisionRecords,
} from "./decision-records-lib.mjs";

function record({
  id,
  recordKey = id,
  title = `Test ${id}`,
  status = "active",
  topic = "operating-model",
  relations = [],
  evidence = [`https://example.com/${id}`],
  decision = "Use the recorded operating model.",
}) {
  const relationYaml = relations.length === 0
    ? "[]"
    : `\n${relations.map((relation) => `  - type: ${relation.type}\n    target: ${relation.target}`).join("\n")}`;
  const evidenceYaml = evidence.map((item) => `  - ${item}`).join("\n");
  const content = `---\nrecord_key: ${recordKey}\nid: ${id}\ntitle: ${title}\nstatus: ${status}\ntopic: ${topic}\nscope: global\nowner: petter\ndecided_at: 2026-08-22\nrelations: ${relationYaml}\nevidence:\n${evidenceYaml}\nmigration_status: candidate\nauthority_scope: none\nauthority_active: false\nphase: M2\n---\n\n${DECISION_CANDIDATE_BANNER}\n\n## Decision\n\n${decision}\n\n## Context\n\nContext.\n\n## Rationale\n\nRationale.\n\n## Consequences\n\nConsequences.\n\n## Reversal conditions\n\nReversal conditions.\n`;
  return parseDecisionRecord(`docs/decisions/records/${recordKey}.md`, content);
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
    schema_version: 2,
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
            source_url: "https://app.notion.com/11111111111111111111111111111111",
            source_page_id: "11111111111111111111111111111111",
            disposition: "unresolved",
          },
          {
            title: "Pricing decision",
            historical_status: "active",
            source_url: "https://app.notion.com/22222222222222222222222222222222",
            source_page_id: "22222222222222222222222222222222",
            disposition: "unresolved",
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

function resolvedCollisionRegistry() {
  return {
    schema_version: 2,
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
        resolution_status: "resolved",
        resolution_evidence: "archive/sessions/collision-resolution.md",
        records: [
          {
            title: "Product decision",
            historical_status: "rejected",
            source_url: "https://app.notion.com/11111111111111111111111111111111",
            source_page_id: "11111111111111111111111111111111",
            disposition: "formal_record",
            record_key:
              "DEC-20260502-A--notion-11111111111111111111111111111111",
          },
          {
            title: "Pricing decision",
            historical_status: "active",
            source_url: "https://app.notion.com/22222222222222222222222222222222",
            source_page_id: "22222222222222222222222222222222",
            disposition: "formal_record",
            record_key:
              "DEC-20260502-A--notion-22222222222222222222222222222222",
          },
        ],
      },
    ],
  };
}

function resolvedCollisionRecords() {
  return [
    record({
      id: "DEC-20260502-A",
      recordKey: "DEC-20260502-A--notion-11111111111111111111111111111111",
      title: "Product decision",
      status: "rejected",
      topic: "product-shape",
      evidence: ["https://app.notion.com/11111111111111111111111111111111"],
    }),
    record({
      id: "DEC-20260502-A",
      recordKey: "DEC-20260502-A--notion-22222222222222222222222222222222",
      title: "Pricing decision",
      topic: "x402-pricing",
      evidence: ["https://app.notion.com/22222222222222222222222222222222"],
    }),
  ];
}

test("resolved collisions map duplicate display IDs bidirectionally by record key", () => {
  const registry = resolvedCollisionRegistry();
  const records = resolvedCollisionRecords();
  assert.deepEqual(validateDecisionIdCollisions("collisions.yaml", registry), []);
  assert.deepEqual(validateDecisionRecords(records, registry), []);
  const index = generateDecisionIndex(records, registry);
  assert.match(index, /The Decision column shows the historical display ID/);
  assert.match(index, /\| Decision \| Internal record key \|/);
  assert.match(index, /`DEC-20260502-A--notion-11111111111111111111111111111111`/);
  assert.match(
    index,
    /records\/DEC-20260502-A--notion-22222222222222222222222222222222\.md/,
  );
});

test("qualified-key relationships resolve, invert, and participate in cycles", () => {
  const registry = resolvedCollisionRegistry();
  const records = [
    ...resolvedCollisionRecords(),
    record({
      id: "DEC-20260812-A",
      topic: "readiness",
      relations: [
        {
          type: "related_to",
          target: "DEC-20260502-A--notion-22222222222222222222222222222222",
        },
      ],
    }),
  ];
  assert.deepEqual(validateDecisionRecords(records, registry), []);
  const index = generateDecisionIndex(records, registry);
  assert.match(index, /`related_from`/);
  assert.match(
    index,
    /`DEC-20260502-A--notion-22222222222222222222222222222222`/,
  );
  assert.match(index, /`DEC-20260812-A`/);

  const cyclicRecords = resolvedCollisionRecords();
  cyclicRecords[0].metadata.status = "active";
  registry.collisions[0].records[0].historical_status = "active";
  cyclicRecords[0].metadata.relations = [
    {
      type: "amends",
      target: "DEC-20260502-A--notion-22222222222222222222222222222222",
    },
  ];
  cyclicRecords[1].metadata.relations = [
    {
      type: "amends",
      target: "DEC-20260502-A--notion-11111111111111111111111111111111",
    },
  ];
  assert.ok(
    validateDecisionRecords(cyclicRecords, registry).some(
      (item) => item.code === "DECISION_RELATION_CYCLE",
    ),
  );
});

test("resolved collision validation fails closed for incomplete or false mappings", () => {
  const registry = resolvedCollisionRegistry();
  const records = resolvedCollisionRecords();

  assert.ok(
    validateDecisionRecords(records.slice(0, 1), registry).some(
      (item) => item.code === "DECISION_ID_COLLISION_FORMAL_RECORD_MISSING",
    ),
  );

  const statusMismatch = structuredClone(registry);
  statusMismatch.collisions[0].records[1].historical_status = "retired";
  assert.ok(
    validateDecisionRecords(records, statusMismatch).some(
      (item) => item.code === "DECISION_ID_COLLISION_FORMAL_RECORD_MISMATCH",
    ),
  );

  const duplicateKey = structuredClone(registry);
  duplicateKey.collisions[0].records[1].record_key =
    duplicateKey.collisions[0].records[0].record_key;
  assert.ok(
    validateDecisionIdCollisions("collisions.yaml", duplicateKey).some(
      (item) => item.code === "DECISION_ID_COLLISION_RECORD_KEY_DUPLICATE",
    ),
  );

  const wrongSourceKey = structuredClone(registry);
  wrongSourceKey.collisions[0].records[0].record_key =
    "DEC-20260502-A--notion-33333333333333333333333333333333";
  assert.ok(
    validateDecisionIdCollisions("collisions.yaml", wrongSourceKey).some(
      (item) => item.code === "DECISION_ID_COLLISION_RECORD_KEY_SOURCE_MISMATCH",
    ),
  );

  const missingEvidence = resolvedCollisionRecords();
  missingEvidence[1].metadata.evidence = ["https://example.com/wrong-source"];
  assert.ok(
    validateDecisionRecords(missingEvidence, registry).some(
      (item) => item.code === "DECISION_ID_COLLISION_SOURCE_EVIDENCE_MISSING",
    ),
  );
});

test("a bare collided display ID is never a relation target after resolution", () => {
  const registry = resolvedCollisionRegistry();
  const records = [
    ...resolvedCollisionRecords(),
    record({
      id: "DEC-20260812-A",
      relations: [{ type: "related_to", target: "DEC-20260502-A" }],
    }),
  ];
  assert.ok(
    validateDecisionRecords(records, registry).some(
      (item) => item.code === "DECISION_RELATION_TARGET_COLLIDED",
    ),
  );
});

test("documented-only collision rows require rationale and do not create records", () => {
  const registry = resolvedCollisionRegistry();
  registry.collisions[0].records[0] = {
    ...registry.collisions[0].records[0],
    disposition: "documented_only",
    rationale: "The later decision carries this superseded history.",
  };
  delete registry.collisions[0].records[0].record_key;
  assert.deepEqual(validateDecisionIdCollisions("collisions.yaml", registry), []);
  assert.deepEqual(validateDecisionRecords(resolvedCollisionRecords().slice(1), registry), []);

  delete registry.collisions[0].records[0].rationale;
  assert.ok(
    validateDecisionIdCollisions("collisions.yaml", registry).some(
      (item) => item.code === "DECISION_ID_COLLISION_SCHEMA_INVALID",
    ),
  );
});

test("unambiguous record keys and filenames cannot diverge from display IDs", () => {
  const qualified = record({
    id: "DEC-20260812-A",
    recordKey: "DEC-20260812-A--notion-11111111111111111111111111111111",
  });
  assert.ok(
    validateDecisionRecords([qualified]).some(
      (item) => item.code === "DECISION_RECORD_KEY_UNQUALIFIED_MISMATCH",
    ),
  );

  const wrongFile = record({ id: "DEC-20260812-A" });
  wrongFile.file = "docs/decisions/records/DEC-20260812-A--wrong.md";
  assert.ok(
    validateDecisionRecords([wrongFile]).some(
      (item) => item.code === "DECISION_FILENAME_MISMATCH",
    ),
  );
});

test("record keys are portable across case-insensitive filesystems", () => {
  const caseConflict = [
    record({ id: "DEC-CASE-A", topic: "upper-case" }),
    record({ id: "DEC-case-A", topic: "lower-case" }),
  ];
  assert.ok(
    validateDecisionRecords(caseConflict).some(
      (item) => item.code === "DECISION_RECORD_KEY_CASE_CONFLICT",
    ),
  );

  const tooLong = record({ id: "DEC-LENGTH-A" });
  tooLong.metadata.record_key = `DEC-${"A".repeat(121)}`;
  assert.ok(
    validateDecisionRecords([tooLong]).some(
      (item) => item.code === "DECISION_SCHEMA_INVALID" && /more than 120/.test(item.detail),
    ),
  );
});

test("source pages and URLs cannot be reused by different collision IDs", () => {
  const registry = resolvedCollisionRegistry();
  const duplicate = structuredClone(registry.collisions[0]);
  duplicate.id = "DEC-20260503-A";
  duplicate.records[0].record_key =
    "DEC-20260503-A--notion-11111111111111111111111111111111";
  duplicate.records[1].record_key =
    "DEC-20260503-A--notion-22222222222222222222222222222222";
  registry.collisions.push(duplicate);
  registry.collision_count = 2;
  registry.source_row_count = 4;
  const findings = validateDecisionIdCollisions("collisions.yaml", registry);
  assert.ok(
    findings.some((item) => item.code === "DECISION_ID_COLLISION_SOURCE_DUPLICATE"),
  );
  assert.ok(
    findings.some((item) => item.code === "DECISION_ID_COLLISION_PAGE_ID_DUPLICATE"),
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

  for (const extra of [
    "\n  ## Indented extra\n\nVisible extra section.\n",
    "\nSetext extra\n------------\n\nVisible extra section.\n",
    "\n\\<!-- escaped opener\n## Escaped-comment extra\n-->\n",
    "\n``` bad`info\n## Invalid-fence extra\n```\n",
  ]) {
    const commonMarkExtra = parseDecisionRecord(
      visible.file,
      `${visible.content}${extra}`,
    );
    assert.ok(
      validateDecisionRecords([commonMarkExtra]).some(
        (item) => item.code === "DECISION_BODY_SECTIONS_INVALID",
      ),
      extra,
    );
  }

  const unclosedComment = parseDecisionRecord(
    visible.file,
    visible.content.replace("## Context", "<!--\n## Context"),
  );
  assert.ok(
    validateDecisionRecords([unclosedComment]).some(
      (item) => item.code === "DECISION_BODY_SECTIONS_INVALID",
    ),
  );

  const attachedClosingHashes = parseDecisionRecord(
    visible.file,
    visible.content.replace("## Decision", "## Decision###"),
  );
  assert.ok(
    validateDecisionRecords([attachedClosingHashes]).some(
      (item) => item.code === "DECISION_BODY_SECTIONS_INVALID",
    ),
  );

  for (const multilineHeading of [
    "Con\ntext\n-------",
    "Con  \ntext\n-------",
    "Con\\\ntext\n-------",
  ]) {
    const joinedHeading = parseDecisionRecord(
      visible.file,
      visible.content.replace("## Context", multilineHeading),
    );
    assert.ok(
      validateDecisionRecords([joinedHeading]).some(
        (item) => item.code === "DECISION_BODY_SECTIONS_INVALID",
      ),
      multilineHeading,
    );
  }
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

  const keyRewritten = record({
    id: "DEC-20260812-A",
    recordKey: "DEC-20260812-A--notion-11111111111111111111111111111111",
  });
  assert.ok(
    validateActiveBodyChange(previous, keyRewritten, previous.file).some(
      (item) =>
        item.code === "DECISION_ACTIVE_METADATA_CHANGED" &&
        item.detail === "record_key",
    ),
  );

  const preKeyMigration = record({ id: "DEC-20260812-A" });
  delete preKeyMigration.metadata.record_key;
  assert.deepEqual(
    validateActiveBodyChange(preKeyMigration, previous, previous.file),
    [],
  );

  const invalidBackfill = record({
    id: "DEC-20260812-A",
    recordKey: "DEC-20260812-A--notion-11111111111111111111111111111111",
  });
  assert.ok(
    validateActiveBodyChange(preKeyMigration, invalidBackfill, previous.file).some(
      (item) =>
        item.code === "DECISION_ACTIVE_METADATA_CHANGED" &&
        item.detail === "record_key",
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

function initializeCollisionHistoryRepo(root, registryYaml) {
  const file = "docs/decisions/id-collisions.yaml";
  const absolute = join(root, file);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, registryYaml, "utf8");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  execFileSync("git", ["add", file], { cwd: root });
  execFileSync("git", ["commit", "-m", "base"], { cwd: root });
}

test("collision history permits exact v1 provenance backfill but rejects source changes", () => {
  const root = mkdtempSync(join(tmpdir(), "strale-collision-history-"));
  const base = `schema_version: 1
authority_scope: none
status: candidate
complete: false
phase: M2
authority_active: false
source_data_source: collection://decisions
observed_at: 2026-09-01
collision_count: 1
source_row_count: 2
collisions:
  - id: DEC-20260502-A
    resolution_status: unresolved
    resolution_evidence: null
    records:
      - title: Product decision
        historical_status: rejected
        source_url: https://app.notion.com/11111111111111111111111111111111
      - title: Pricing decision
        historical_status: active
        source_url: https://app.notion.com/22222222222222222222222222222222
`;
  try {
    initializeCollisionHistoryRepo(root, base);
    const current = resolvedCollisionRegistry();
    current.collisions[0].resolution_status = "unresolved";
    current.collisions[0].resolution_evidence = null;
    for (const source of current.collisions[0].records) {
      source.disposition = "unresolved";
      delete source.record_key;
    }
    assert.deepEqual(validateDecisionCollisionImmutability(root, current, "HEAD"), []);

    const changed = structuredClone(current);
    changed.collisions[0].records[0].title = "Rewritten source";
    assert.ok(
      validateDecisionCollisionImmutability(root, changed, "HEAD").some(
        (item) => item.code === "DECISION_COLLISION_SOURCE_CHANGED",
      ),
    );

    const wrongPage = structuredClone(current);
    wrongPage.collisions[0].records[0].source_page_id =
      "33333333333333333333333333333333";
    assert.ok(
      validateDecisionCollisionImmutability(root, wrongPage, "HEAD").some(
        (item) => item.code === "DECISION_COLLISION_PAGE_ID_BACKFILL_INVALID",
      ),
    );

    const removedCollision = structuredClone(current);
    removedCollision.collisions = [];
    assert.ok(
      validateDecisionCollisionImmutability(root, removedCollision, "HEAD").some(
        (item) => item.code === "DECISION_COLLISION_REMOVED",
      ),
    );

    const removedSource = structuredClone(current);
    removedSource.collisions[0].records.shift();
    assert.ok(
      validateDecisionCollisionImmutability(root, removedSource, "HEAD").some(
        (item) => item.code === "DECISION_COLLISION_SOURCE_REMOVED",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolved collision bindings cannot regress or be rewritten", () => {
  const root = mkdtempSync(join(tmpdir(), "strale-resolved-collision-history-"));
  const base = `schema_version: 2
authority_scope: none
status: candidate
complete: false
phase: M2
authority_active: false
source_data_source: collection://decisions
observed_at: 2026-09-01
collision_count: 1
source_row_count: 2
collisions:
  - id: DEC-20260502-A
    resolution_status: resolved
    resolution_evidence: archive/sessions/collision-resolution.md
    records:
      - title: Product decision
        historical_status: rejected
        source_url: https://app.notion.com/11111111111111111111111111111111
        source_page_id: "11111111111111111111111111111111"
        disposition: formal_record
        record_key: DEC-20260502-A--notion-11111111111111111111111111111111
      - title: Pricing decision
        historical_status: active
        source_url: https://app.notion.com/22222222222222222222222222222222
        source_page_id: "22222222222222222222222222222222"
        disposition: formal_record
        record_key: DEC-20260502-A--notion-22222222222222222222222222222222
`;
  try {
    initializeCollisionHistoryRepo(root, base);
    const current = resolvedCollisionRegistry();
    assert.deepEqual(validateDecisionCollisionImmutability(root, current, "HEAD"), []);

    const regressed = structuredClone(current);
    regressed.collisions[0].resolution_status = "unresolved";
    regressed.collisions[0].resolution_evidence = null;
    assert.ok(
      validateDecisionCollisionImmutability(root, regressed, "HEAD").some(
        (item) => item.code === "DECISION_COLLISION_RESOLUTION_REGRESSION",
      ),
    );

    const rebound = structuredClone(current);
    rebound.collisions[0].records[0].record_key =
      "DEC-20260502-A--notion-33333333333333333333333333333333";
    assert.ok(
      validateDecisionCollisionImmutability(root, rebound, "HEAD").some(
        (item) => item.code === "DECISION_COLLISION_RECORD_KEY_CHANGED",
      ),
    );

    const changedDisposition = structuredClone(current);
    changedDisposition.collisions[0].records[0].disposition = "documented_only";
    delete changedDisposition.collisions[0].records[0].record_key;
    changedDisposition.collisions[0].records[0].rationale = "Changed later.";
    assert.ok(
      validateDecisionCollisionImmutability(root, changedDisposition, "HEAD").some(
        (item) => item.code === "DECISION_COLLISION_DISPOSITION_CHANGED",
      ),
    );

    const changedEvidence = structuredClone(current);
    changedEvidence.collisions[0].resolution_evidence =
      "archive/sessions/replacement-resolution.md";
    assert.ok(
      validateDecisionCollisionImmutability(root, changedEvidence, "HEAD").some(
        (item) => item.code === "DECISION_COLLISION_RESOLUTION_EVIDENCE_CHANGED",
      ),
    );

    const changedSource = structuredClone(current);
    changedSource.collisions[0].records[0].historical_status = "retired";
    assert.ok(
      validateDecisionCollisionImmutability(root, changedSource, "HEAD").some(
        (item) => item.code === "DECISION_COLLISION_SOURCE_CHANGED",
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
