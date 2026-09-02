// Tests for the T5 docs/ index checker (scripts/check-docs-index.mjs).
// Every failure mode is planted in its own throwaway directory fixture and
// must fail there; the fixed counterpart must pass. See
// archive/sessions/2026-09-02-t5-cto-readable-structure-plan.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { checkDocsIndex, listDocsSubtrees, listReferencedSubtrees } from "./check-docs-index.mjs";

function writeFiles(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const absolute = join(root, rel);
    mkdirSync(resolve(absolute, ".."), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }
}

function withFixture(files, fn) {
  const root = mkdtempSync(join(tmpdir(), "strale-docs-index-fixture-"));
  writeFiles(root, files);
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const README_TWO_SUBTREES = [
  "# docs/ — index",
  "",
  "| subtree | authority | what it holds |",
  "| --- | --- | --- |",
  "| [`audits/`](audits/) | historical | Dated audit reports. |",
  "| [`company/`](company/) | authoritative today | Operating docs. |",
  "",
].join("\n");

test("listDocsSubtrees: lists top-level directories only, sorted", () => {
  withFixture(
    {
      "docs/audits/a.md": "a",
      "docs/company/b.md": "b",
      "docs/README.md": README_TWO_SUBTREES,
      "docs/loose-file.md": "not a subtree",
    },
    (root) => {
      assert.deepEqual(listDocsSubtrees(root), ["audits", "company"]);
    },
  );
});

test("listReferencedSubtrees: reads backtick-quoted subtree names from table rows", () => {
  assert.deepEqual(listReferencedSubtrees(README_TWO_SUBTREES), ["audits", "company"]);
});

test("clean pass: every real subtree is listed, every listed subtree is real", () => {
  withFixture(
    {
      "docs/audits/a.md": "a",
      "docs/company/b.md": "b",
      "docs/README.md": README_TWO_SUBTREES,
    },
    (root) => {
      const { findings } = checkDocsIndex(root);
      assert.deepEqual(findings, []);
    },
  );
});

test("PLANTED FAILURE: a new docs/ subtree with no line in docs/README.md must fail", () => {
  withFixture(
    {
      "docs/audits/a.md": "a",
      "docs/company/b.md": "b",
      "docs/decisions/c.md": "c",
      "docs/README.md": README_TWO_SUBTREES,
    },
    (root) => {
      const { findings } = checkDocsIndex(root);
      const codes = findings.map((f) => f.code);
      assert.ok(codes.includes("DOCS_SUBTREE_UNDOCUMENTED"), `expected DOCS_SUBTREE_UNDOCUMENTED, got ${JSON.stringify(findings)}`);
      const hit = findings.find((f) => f.code === "DOCS_SUBTREE_UNDOCUMENTED");
      assert.equal(hit.path, "docs/decisions/");
    },
  );
});

test("PLANTED FAILURE: a subtree listed in docs/README.md that no longer exists must fail", () => {
  withFixture(
    {
      "docs/audits/a.md": "a",
      // company/ deliberately absent — was removed without updating the index.
      "docs/README.md": README_TWO_SUBTREES,
    },
    (root) => {
      const { findings } = checkDocsIndex(root);
      const hit = findings.find((f) => f.code === "DOCS_SUBTREE_VANISHED");
      assert.ok(hit, `expected DOCS_SUBTREE_VANISHED, got ${JSON.stringify(findings)}`);
      assert.equal(hit.path, "docs/company/");
    },
  );
});

test("DOCS_README_MISSING when docs/README.md itself is absent", () => {
  withFixture(
    {
      "docs/audits/a.md": "a",
    },
    (root) => {
      const { findings } = checkDocsIndex(root);
      assert.deepEqual(
        findings.map((f) => f.code),
        ["DOCS_README_MISSING"],
      );
    },
  );
});
