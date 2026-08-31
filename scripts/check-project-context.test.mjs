import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  INVENTORY_TARGETS,
  SKELETON_DOCUMENTS,
  buildInventory,
  validateInventory,
  validateSkeletonDocument,
} from "./project-context-lib.mjs";
import { checkPrivateArchiveStatus } from "./check-project-context.mjs";

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
