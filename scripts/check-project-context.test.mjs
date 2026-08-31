import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  INVENTORY_TARGETS,
  M2_CANDIDATE_BANNER,
  M2_CANDIDATE_DOCUMENTS,
  M2_CANDIDATE_WORD_LIMITS,
  SKELETON_DOCUMENTS,
  buildInventory,
  generatedFiles,
  validateInventory,
  validateCandidateDocument,
  validateSkeletonDocument,
} from "./project-context-lib.mjs";
import {
  checkPrecutoverEntrypoint,
  checkPrivateArchiveStatus,
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
      ? "backend_reviewed_ref: 596e9c7f6dbe474f89d31e035bd47dd81673cb0b\nproduction_observed_ref: 596e9c7f6dbe\nproduction_observed_at: 2026-08-31T23:31:38.346Z\nproduction_status: ok\nfrontend_main_ref: 4be8d251b05e0abf6e23a195913c188ae318056e\nfrontend_redesign_ref: 998964716c8601be67d4e71a508a803160434517\n"
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
  const base = `---\ndoc_type: project-state\nauthority_scope: none\nstatus: candidate\ncomplete: false\nphase: M2\nm1_template: false\nauthority_active: false\nverified_at: 2026-09-01\nbackend_reviewed_ref: 596e9c7f6dbe474f89d31e035bd47dd81673cb0b\nproduction_observed_ref: 596e9c7f6dbe\nproduction_observed_at: 2026-08-31T23:31:38.346Z\nproduction_status: ok\nfrontend_main_ref: 4be8d251b05e0abf6e23a195913c188ae318056e\nfrontend_redesign_ref: 998964716c8601be67d4e71a508a803160434517\n---\n\n# Candidate\n\n${M2_CANDIDATE_BANNER}\n`;
  assert.deepEqual(validateCandidateDocument(file, base, "project-state"), []);
  for (const field of [
    "backend_reviewed_ref",
    "production_observed_ref",
    "production_observed_at",
    "production_status",
    "frontend_main_ref",
    "frontend_redesign_ref",
  ]) {
    const invalid = base.replace(new RegExp(`^${field}:.*\\n`, "m"), "");
    assert.ok(
      validateCandidateDocument(file, invalid, "project-state").some(
        (item) => item.code === "STATE_VERIFICATION_REF_INVALID" && item.detail === field,
      ),
    );
  }
});

test("pre-cutover entrypoint guard covers every authored M2 candidate", () => {
  for (const file of Object.keys(M2_CANDIDATE_DOCUMENTS)) {
    assert.equal(checkPrecutoverEntrypoint("AGENTS.md", `Read ${file}.`).length, 1);
  }
  assert.deepEqual(checkPrecutoverEntrypoint("AGENTS.md", "No inactive context links."), []);
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
