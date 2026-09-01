import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  INVENTORY_TARGETS,
  M2_CANDIDATE_BANNER,
  M2_CANDIDATE_DOCUMENTS,
  M2_CANDIDATE_WORD_LIMITS,
  OPERATOR_ACTIONS_SCHEMA,
  SKELETON_DOCUMENTS,
  buildInventory,
  generatedFiles,
  validateInventory,
  validateCandidateDocument,
  validateOperatorActions,
  validateOperatorActionEvidence,
  validateOperatorActionHistory,
  validateOperatorActionHistoryAgainstGit,
  validateOperatorActionTransition,
  validatePendingFounderDecisions,
  validateStateEvidence,
  validateSkeletonDocument,
} from "./project-context-lib.mjs";
import {
  checkGeneratedFileState,
  checkPrecutoverEntrypoint,
  checkPrivateArchiveStatus,
  runChecks,
} from "./check-project-context.mjs";

test("generated M1 skeleton satisfies its exact contract", () => {
  const [file, content] = Object.entries(SKELETON_DOCUMENTS)[0];
  assert.deepEqual(validateSkeletonDocument(file, content, content), []);
});

test("missing visible banner is reported", () => {
  const [file, content] = Object.entries(SKELETON_DOCUMENTS)[0];
  const changed = content.replace(/> \[!CAUTION\][\s\S]*?remain in force\.\n/, "");
  const codes = validateSkeletonDocument(file, changed, content).map((item) => item.code);
  assert.ok(codes.includes("SKELETON_BANNER_MISSING"));
  assert.ok(codes.includes("SKELETON_TEMPLATE_DRIFT"));
});

test("real content added to a skeleton is reported as template drift", () => {
  const [file, content] = Object.entries(SKELETON_DOCUMENTS)[0];
  const changed = `${content}\nCurrent product priority: this must not appear in M1.\n`;
  assert.ok(
    validateSkeletonDocument(file, changed, content).some(
      (item) => item.code === "SKELETON_TEMPLATE_DRIFT",
    ),
  );
});

test("all authored M2 candidates are marked inactive and excluded from generation", () => {
  const generated = generatedFiles(process.cwd());
  for (const [file, docType] of Object.entries(M2_CANDIDATE_DOCUMENTS)) {
    const stateVerification = docType === "project-state"
      ? "backend_reviewed_ref: 596e9c7f6dbe474f89d31e035bd47dd81673cb0b\nproduction_observed_ref: 596e9c7f6dbe\nproduction_observed_at: 2026-08-31T23:31:38.346Z\nproduction_status: ok\nfrontend_main_ref: 4be8d251b05e0abf6e23a195913c188ae318056e\nfrontend_redesign_ref: 998964716c8601be67d4e71a508a803160434517\nstate_evidence_ref: archive/sessions/state.json\n"
      : "";
    const content = `---\ndoc_type: ${docType}\nauthority_scope: none\nstatus: candidate\ncomplete: false\nphase: M2\nm1_template: false\nauthority_active: false\nverified_at: 2026-09-01\n${stateVerification}---\n\n# Candidate\n\n${M2_CANDIDATE_BANNER}\n\nReconciled content.\n`;
    assert.deepEqual(validateCandidateDocument(file, content, docType), []);
    assert.equal(Object.hasOwn(SKELETON_DOCUMENTS, file), false);
    assert.equal(Object.hasOwn(generated, file), false);
  }
});

test("candidate missing its inactive banner is reported", () => {
  const [file, docType] = Object.entries(M2_CANDIDATE_DOCUMENTS)[0];
  const content = `---\ndoc_type: ${docType}\nauthority_scope: none\nstatus: candidate\ncomplete: false\nphase: M2\nm1_template: false\nauthority_active: false\nverified_at: 2026-09-01\n---\n\n# Candidate\n`;
  assert.ok(
    validateCandidateDocument(file, content, docType).some(
      (item) => item.code === "CANDIDATE_BANNER_MISSING",
    ),
  );
});

test("candidate document word budgets are enforced", () => {
  const file = "docs/project/PRODUCT.md";
  const docType = M2_CANDIDATE_DOCUMENTS[file];
  const overflow = "word ".repeat(M2_CANDIDATE_WORD_LIMITS[file] + 1);
  const content = `---\ndoc_type: ${docType}\nauthority_scope: none\nstatus: candidate\ncomplete: false\nphase: M2\nm1_template: false\nauthority_active: false\nverified_at: 2026-09-01\n---\n\n# Candidate\n\n${M2_CANDIDATE_BANNER}\n\n${overflow}\n`;
  assert.ok(
    validateCandidateDocument(file, content, docType).some(
      (item) => item.code === "CANDIDATE_WORD_BUDGET_EXCEEDED",
    ),
  );
});

test("state candidate requires exact repository and production verification refs", () => {
  const file = "docs/project/STATE.md";
  const base = `---\ndoc_type: project-state\nauthority_scope: none\nstatus: candidate\ncomplete: false\nphase: M2\nm1_template: false\nauthority_active: false\nverified_at: 2026-09-01\nbackend_reviewed_ref: 596e9c7f6dbe474f89d31e035bd47dd81673cb0b\nproduction_observed_ref: 596e9c7f6dbe\nproduction_observed_at: 2026-08-31T23:31:38.346Z\nproduction_status: ok\nfrontend_main_ref: 4be8d251b05e0abf6e23a195913c188ae318056e\nfrontend_redesign_ref: 998964716c8601be67d4e71a508a803160434517\nstate_evidence_ref: archive/sessions/state.json\n---\n\n# Candidate\n\n${M2_CANDIDATE_BANNER}\n`;
  assert.deepEqual(validateCandidateDocument(file, base, "project-state"), []);
  for (const field of [
    "backend_reviewed_ref",
    "production_observed_ref",
    "production_observed_at",
    "production_status",
    "frontend_main_ref",
    "frontend_redesign_ref",
    "state_evidence_ref",
  ]) {
    const invalid = base.replace(new RegExp(`^${field}:.*\\n`, "m"), "");
    assert.ok(
      validateCandidateDocument(file, invalid, "project-state").some(
        (item) => item.code === "STATE_VERIFICATION_REF_INVALID" && item.detail === field,
      ),
    );
  }
});

test("state candidate refs must match their dated evidence manifest", () => {
  const root = mkdtempSync(join(tmpdir(), "strale-state-evidence-"));
  try {
    const evidencePath = join(root, "archive/sessions/state.json");
    mkdirSync(dirname(evidencePath), { recursive: true });
    const expected = {
      backend_reviewed_ref: "596e9c7f6dbe474f89d31e035bd47dd81673cb0b",
      production_observed_ref: "596e9c7f6dbe",
      production_observed_at: "2026-08-31T23:31:38.346Z",
      production_status: "ok",
      frontend_main_ref: "4be8d251b05e0abf6e23a195913c188ae318056e",
      frontend_redesign_ref: "998964716c8601be67d4e71a508a803160434517",
    };
    writeFileSync(evidencePath, JSON.stringify({ state_frontmatter: expected }), "utf8");
    const frontmatter = Object.entries(expected).map(([key, value]) => `${key}: ${value}`).join("\n");
    const content = `---\n${frontmatter}\nstate_evidence_ref: archive/sessions/state.json\n---\n`;
    assert.deepEqual(validateStateEvidence(root, "docs/project/STATE.md", content), []);
    const fabricated = content.replace(expected.backend_reviewed_ref, "a".repeat(40));
    assert.deepEqual(validateStateEvidence(root, "docs/project/STATE.md", fabricated), [
      {
        code: "STATE_EVIDENCE_MISMATCH",
        path: "docs/project/STATE.md",
        detail: "backend_reviewed_ref",
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre-cutover entrypoint guard covers every authored M2 candidate", () => {
  for (const file of Object.keys(M2_CANDIDATE_DOCUMENTS)) {
    assert.equal(checkPrecutoverEntrypoint("AGENTS.md", `Read ${file}.`).length, 1);
  }
  assert.equal(checkPrecutoverEntrypoint("CLAUDE.md", "Read docs/project/*.md.").length, 1);
  assert.equal(checkPrecutoverEntrypoint("CLAUDE.md", "Read docs/decisions/*.md.").length, 1);
  assert.deepEqual(checkPrecutoverEntrypoint("AGENTS.md", "No inactive context links."), []);
});

const operatorActionsFixture = `schema_version: 1
doc_type: operator-actions
authority_scope: none
status: candidate
complete: false
phase: M2
authority_active: false
verified_at: 2026-09-01
actions:
  - id: OA-20260830-ROUTING-LATENCY-438
    subject: Reconcile routing latency
    status: prepared
    authority: approval_required
    authority_purpose: reconcile_test_latency
    prepared_ref: 0123456789abcdef0123456789abcdef01234567:script.ts
    preflight_evidence_ref: archive/sessions/preflight.json
    prepared_at: 2026-08-30
    executed_at: null
    execution_evidence: null
    reconciled_at: null
    reconciliation_evidence: null
    cancelled_at: null
    cancellation_reason: null
    cancellation_evidence: null
    blocks_acceptance_of: [docs/project/ROADMAP.md#test-acceptance]
    targets:
      - key: capability.latency
        current: 8000
        desired: 20000
    next_step: Correct the guard, execute with authority, and reconcile independently.
`;

test("operator-action candidate satisfies its inactive lifecycle contract", () => {
  assert.deepEqual(
    validateOperatorActions("docs/operations/operator-actions.yaml", operatorActionsFixture),
    [],
  );
  assert.equal(OPERATOR_ACTIONS_SCHEMA.properties.authority_scope.const, "none");
  assert.equal(OPERATOR_ACTIONS_SCHEMA.properties.authority_active.const, false);
});

test("prepared operator action cannot carry execution or reconciliation evidence", () => {
  const invalid = operatorActionsFixture
    .replace("executed_at: null", "executed_at: 2026-09-01T10:00:00Z")
    .replace("execution_evidence: null", "execution_evidence: evidence.json");
  assert.ok(
    validateOperatorActions("docs/operations/operator-actions.yaml", invalid).some(
      (item) => item.code === "OPERATOR_ACTIONS_SCHEMA_INVALID",
    ),
  );
});

test("operator-action lifecycle transitions cannot move backwards", () => {
  assert.equal(validateOperatorActionTransition("prepared", "executed"), true);
  assert.equal(validateOperatorActionTransition("executed", "reconciled"), true);
  assert.equal(validateOperatorActionTransition("executed", "prepared"), false);
  assert.equal(validateOperatorActionTransition("executed", "cancelled"), false);
  assert.equal(validateOperatorActionTransition("reconciled", "executed"), false);
  assert.equal(validateOperatorActionTransition("cancelled", "prepared"), false);
});

test("operator-action history rejects deletion, regression, and changed immutable facts", () => {
  const executed = operatorActionsFixture
    .replace("status: prepared", "status: executed")
    .replace("executed_at: null", "executed_at: 2026-09-01T10:00:00Z")
    .replace("execution_evidence: null", "execution_evidence: archive/sessions/execution.json");
  const regressed = executed
    .replace("status: executed", "status: prepared")
    .replace("current: 8000", "current: 7000");
  const findings = validateOperatorActionHistory(
    "docs/operations/operator-actions.yaml",
    executed,
    regressed,
  );
  assert.ok(findings.some((item) => item.code === "OPERATOR_ACTION_STATUS_REGRESSION"));
  assert.ok(findings.some((item) => item.code === "OPERATOR_ACTION_IMMUTABLE_FIELD_CHANGED"));
  const changedBlocker = operatorActionsFixture.replace(
    "docs/project/ROADMAP.md#test-acceptance",
    "docs/project/ROADMAP.md#different-acceptance",
  );
  assert.ok(
    validateOperatorActionHistory(
      "docs/operations/operator-actions.yaml",
      operatorActionsFixture,
      changedBlocker,
    ).some((item) => item.detail?.endsWith(":blocks_acceptance_of")),
  );
  const empty = operatorActionsFixture.replace(/actions:[\s\S]*/, "actions: []\n");
  assert.ok(
    validateOperatorActionHistory("docs/operations/operator-actions.yaml", executed, empty).some(
      (item) => item.code === "OPERATOR_ACTION_DELETED",
    ),
  );
});

test("operator-action history reports an unavailable base instead of failing open", () => {
  assert.ok(
    validateOperatorActionHistoryAgainstGit(
      process.cwd(),
      "docs/operations/operator-actions.yaml",
      operatorActionsFixture,
      "refs/heads/definitely-missing-operator-base",
    ).some((item) => item.code === "OPERATOR_ACTION_HISTORY_BASE_UNAVAILABLE"),
  );
});

test("operator-action schema rejects unknown fields, invalid dates, and bogus refs", () => {
  const unknown = `${operatorActionsFixture}unknown_root: true\n`;
  const invalidDate = operatorActionsFixture.replace("prepared_at: 2026-08-30", "prepared_at: tomorrow");
  const bogusRef = operatorActionsFixture.replace(
    "0123456789abcdef0123456789abcdef01234567:script.ts",
    "not-a-real-ref",
  );
  for (const value of [unknown, invalidDate, bogusRef]) {
    assert.ok(
      validateOperatorActions("docs/operations/operator-actions.yaml", value).some(
        (item) => item.code === "OPERATOR_ACTIONS_SCHEMA_INVALID",
      ),
    );
  }
});

test("operator-action current values must match read-only preflight evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "strale-operator-evidence-"));
  try {
    const evidencePath = join(root, "archive/sessions/preflight.json");
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(
      evidencePath,
      JSON.stringify({
        schema_version: 1,
        source: "production read-only database",
        queried_at: "2026-09-01T10:00:00Z",
        query: "select slug, avg_latency_ms from capabilities where slug = 'latency'",
        rows: [{ slug: "latency", avg_latency_ms: 8000 }],
      }),
      "utf8",
    );
    const matching = operatorActionsFixture.replace(
      "capability.latency",
      "capabilities.latency.avg_latency_ms",
    );
    const matchingFindings = validateOperatorActionEvidence(
      root,
      "docs/operations/operator-actions.yaml",
      matching,
    );
    assert.equal(
      matchingFindings.some((item) => item.code === "OPERATOR_ACTION_PREFLIGHT_MISMATCH"),
      false,
    );
    assert.equal(
      matchingFindings.some((item) => item.code === "OPERATOR_ACTION_PREPARED_REF_INVALID"),
      true,
    );
    const stale = matching.replace("current: 8000", "current: 7000");
    assert.ok(
      validateOperatorActionEvidence(root, "docs/operations/operator-actions.yaml", stale).some(
        (item) => item.code === "OPERATOR_ACTION_PREFLIGHT_MISMATCH",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("operator-action registry is bound to contained evidence and its immutable prepared artifact", () => {
  const root = process.cwd();
  const file = "docs/operations/operator-actions.yaml";
  const actual = readFileSync(join(root, file), "utf8");
  assert.deepEqual(validateOperatorActionEvidence(root, file, actual), []);

  const mutations = [
    [actual.replace("desired: 20000", "desired: 19999"), "OPERATOR_ACTION_TARGET_BINDING_MISMATCH"],
    [actual.replace("authority_purpose: reconcile_438_routing_latency", "authority_purpose: wrong_purpose"), "OPERATOR_ACTION_AUTHORITY_BINDING_MISMATCH"],
    [actual.replace("capabilities.page-speed-test.avg_latency_ms", "unsupported.page-speed-test.value"), "OPERATOR_ACTION_TARGET_UNSUPPORTED"],
    [actual.replace("    next_step:", "      - key: capabilities.page-speed-test.avg_latency_ms\n        current: 8000\n        desired: 20000\n    next_step:"), "OPERATOR_ACTION_TARGET_DUPLICATE"],
    [actual.replace("archive/sessions/2026-09-01-routing-latency-production-evidence.json", "archive/sessions/../../package-lock.json"), "OPERATOR_ACTION_EVIDENCE_REF_INVALID"],
    [actual.replace("docs/project/ROADMAP.md#438-routing-metadata", "docs/project/ROADMAP.md#missing-anchor"), "OPERATOR_ACTION_ACCEPTANCE_REF_INVALID"],
  ];
  for (const [mutated, expectedCode] of mutations) {
    assert.ok(
      validateOperatorActionEvidence(root, file, mutated).some(
        (item) => item.code === expectedCode,
      ),
      expectedCode,
    );
  }
});

test("lifecycle evidence requires a contained JSON file with the matching contract", () => {
  const root = mkdtempSync(join(tmpdir(), "strale-operator-lifecycle-"));
  try {
    const evidenceDir = join(root, "archive/sessions");
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(
      join(evidenceDir, "preflight.json"),
      JSON.stringify({
        schema_version: 1,
        source: "production read-only database",
        queried_at: "2026-09-01T09:00:00Z",
        query: "select slug, avg_latency_ms from capabilities where slug = 'latency'",
        rows: [{ slug: "latency", avg_latency_ms: 8000 }],
      }),
      "utf8",
    );
    const executed = operatorActionsFixture
      .replace("status: prepared", "status: executed")
      .replace("executed_at: null", "executed_at: 2026-09-01T10:00:00Z")
      .replace(
        "execution_evidence: null",
        "execution_evidence: archive/sessions/2026-09-01-execution.json",
      );
    assert.equal(
      validateOperatorActions("docs/operations/operator-actions.yaml", executed).some(
        (item) => item.code === "OPERATOR_ACTIONS_SCHEMA_INVALID",
      ),
      false,
    );
    writeFileSync(
      join(evidenceDir, "2026-09-01-execution.json"),
      JSON.stringify({
        schema_version: 1,
        evidence_kind: "execution",
        action_id: "OA-20260830-ROUTING-LATENCY-438",
        recorded_at: "2026-09-01T10:00:00Z",
      }),
      "utf8",
    );
    assert.equal(
      validateOperatorActionEvidence(root, "docs/operations/operator-actions.yaml", executed).some(
        (item) => item.code.startsWith("OPERATOR_ACTION_LIFECYCLE_EVIDENCE"),
      ),
      false,
    );
    writeFileSync(
      join(evidenceDir, "2026-09-01-execution.json"),
      JSON.stringify({
        schema_version: 1,
        evidence_kind: "execution",
        action_id: "OA-20260830-ROUTING-LATENCY-438",
        recorded_at: "0",
      }),
      "utf8",
    );
    assert.ok(
      validateOperatorActionEvidence(root, "docs/operations/operator-actions.yaml", executed).some(
        (item) => item.code === "OPERATOR_ACTION_LIFECYCLE_EVIDENCE_INVALID",
      ),
    );
    mkdirSync(join(evidenceDir, "audit"));
    const directoryRef = executed.replace(
      "archive/sessions/2026-09-01-execution.json",
      "archive/sessions/audit",
    );
    assert.ok(
      validateOperatorActionEvidence(root, "docs/operations/operator-actions.yaml", directoryRef).some(
        (item) => item.code === "OPERATOR_ACTION_LIFECYCLE_EVIDENCE_MISSING",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pending-founder candidate requires bounded reserved-topic fields", () => {
  const pending = `## Decision-ready now

Nothing is decision-ready.

### FD-20260901-DOMAIN — domain

**State:** awaiting evidence.

**Reserved boundary:** public act.

**Reserved class:** one-way-public-act.

**Established:** domains are owned.

**Recommendation until ready:** keep current routing.

**Founder action now:** none.

## Explicit exclusions
`;
  assert.deepEqual(validatePendingFounderDecisions("docs/decisions/PENDING.md", pending), []);
  const invalid = pending.replace("**Founder action now:** none.\n", "");
  assert.ok(
    validatePendingFounderDecisions("docs/decisions/PENDING.md", invalid).some(
      (item) => item.code === "PENDING_DECISION_FIELD_MISSING",
    ),
  );
});

test("legacy inventory rejects fields beyond path, owner, hash, and references", () => {
  const findings = validateInventory({
    mode: "bare-enumeration",
    complete: false,
    entries: [{ path: "CLAUDE.md", disposition: "archive" }],
  });
  assert.equal(findings[0].code, "INVENTORY_FIELD_OUT_OF_SCOPE");
  assert.equal(findings[0].detail, "disposition");
});

test("inventory hashes canonical Git content, not checkout line endings", () => {
  const root = mkdtempSync(join(tmpdir(), "strale-context-inventory-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Context Test"], { cwd: root });
    execFileSync("git", ["config", "core.autocrlf", "false"], { cwd: root });

    for (const { path } of INVENTORY_TARGETS) {
      const isFile = /\.(?:json|md|yaml)$/.test(path);
      const file = isFile ? path : `${path}/marker.md`;
      const absolute = join(root, file);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, `tracked content for ${path}\n`, "utf8");
    }
    execFileSync("git", ["add", "-A"], { cwd: root });

    const before = buildInventory(root);
    writeFileSync(join(root, "AGENTS.md"), "tracked content for AGENTS.md\r\n", "utf8");
    const after = buildInventory(root);

    assert.equal(after.entries[0].sha256, before.entries[0].sha256);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("private archive status preserves the M0 gate without public raw data", () => {
  const root = mkdtempSync(join(tmpdir(), "strale-private-archive-status-"));
  try {
    const statusPath = join(root, "docs/project/private-archive-status.json");
    mkdirSync(dirname(statusPath), { recursive: true });
    writeFileSync(statusPath, '{"complete":false}\n', "utf8");

    assert.deepEqual(checkPrivateArchiveStatus(root), [
      {
        severity: "warning",
        code: "M0_NOTION_EXPORT_INCOMPLETE",
        path: "docs/project/private-archive-status.json",
        detail: "private preservation export remains incomplete; blocks M2 and cutover",
      },
    ]);

    writeFileSync(statusPath, '{"complete":true}\n', "utf8");
    assert.deepEqual(checkPrivateArchiveStatus(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the checked-in repository context is warning-clean", () => {
  assert.deepEqual(runChecks(process.cwd()), []);
});

test("a missing generated decision schema is reported", () => {
  const root = mkdtempSync(join(tmpdir(), "strale-generated-schema-missing-"));
  try {
    const file = "docs/project/schemas/decision-record.schema.json";
    assert.deepEqual(checkGeneratedFileState(root, { [file]: "{}\n" }, [file]), [
      { severity: "warning", code: "GENERATED_FILE_MISSING", path: file },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
