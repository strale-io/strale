import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { generateAll } from "../generate-archive-index.mjs";
import { buildInventory, INVENTORY_TARGETS } from "../project-context-lib.mjs";
import { INVENTORY_PATH, regenerateIndexes } from "./regenerate-indexes.mjs";

const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
function write(root, path, content) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}
function repo() {
  // Keep scratch repos inside the checkout; remove even when a planted merge fails.
  const root = mkdtempSync(resolve(".h7a-merge-test-"));
  git(root, "init", "-q", "-b", "base");
  git(root, "config", "user.email", "test@example.invalid");
  git(root, "config", "user.name", "Index Test");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "config", "core.hooksPath", ".no-hooks");
  for (const { path } of INVENTORY_TARGETS) {
    write(root, /\.(md|json|yaml)$/.test(path) ? path : `${path}/marker.md`, "fixture\n");
  }
  write(root, "archive/README.md", "# Archive\n");
  write(root, "archive/receipts/base.json", "{}\n");
  write(root, "handoff/_general/from-code/base.md", "Intent: base\n");
  generateAll(root);
  git(root, "add", ".");
  write(root, INVENTORY_PATH, `${JSON.stringify(buildInventory(root), null, 2)}\n`);
  git(root, "add", INVENTORY_PATH);
  git(root, "commit", "-qm", "base");
  return root;
}

test("independent handoff and receipt additions merge cleanly with fresh committed indexes", async () => {
  const root = repo();
  try {
    for (const branch of ["a", "b"]) {
      git(root, "switch", "-c", branch, "base"); // Only the throwaway repo switches.
      write(root, `handoff/_general/from-code/2026-10-28-${branch}.md`, `Intent: ${branch} cites CLAUDE.md\n`);
      write(root, `archive/receipts/2026-10-28-${branch}.json`, '{"source":"docs/strategy"}\n');
      git(root, "add", ".");
      const regenerated = await regenerateIndexes({ root });
      assert.deepEqual(regenerated.refused, []);
      git(root, "commit", "-qm", branch);
    }
    const merge = spawnSync("git", ["merge", "a", "--no-edit"], { cwd: root, encoding: "utf8" });
    assert.equal(merge.status, 0, `${merge.stdout}\n${merge.stderr}`);
    assert.equal(git(root, "diff", "--name-only", "--diff-filter=U"), "");
    const before = ["archive/README.md", "handoff/README.md", INVENTORY_PATH]
      .map((path) => readFileSync(join(root, path), "utf8"));
    assert.equal(generateAll(root, { check: true }).archive.stale, false);
    assert.equal(generateAll(root, { check: true }).handoff.stale, false);
    assert.equal(`${JSON.stringify(buildInventory(root), null, 2)}\n`, before[2]);
    assert.deepEqual(await regenerateIndexes({ root }), { staged: [], refused: [] });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("navigation drift is repaired from the staged snapshot without indexing unstaged evidence", async () => {
  const root = repo();
  try {
    write(root, "handoff/README.md", "broken navigation\n");
    git(root, "add", "handoff/README.md");
    write(root, "handoff/_general/from-code/untracked.md", "Intent: untracked\n");
    const result = await regenerateIndexes({ root });
    assert.deepEqual(result.refused, []);
    assert.ok(result.staged.includes("handoff/README.md"));
    assert.match(git(root, "show", ":handoff/README.md"), /Browse all handoffs/);
    assert.doesNotMatch(git(root, "show", `:${INVENTORY_PATH}`), /untracked/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("unstaged hand edits are refused and never overwritten", async () => {
  const root = repo();
  try {
    write(root, "handoff/README.md", "broken staged\n");
    git(root, "add", "handoff/README.md");
    write(root, "handoff/README.md", "precious unstaged\n");
    const result = await regenerateIndexes({ root });
    assert.ok(result.refused.some((r) => r.path === "handoff/README.md"));
    assert.equal(readFileSync(join(root, "handoff/README.md"), "utf8"), "precious unstaged\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("pathspec commit cannot silently lose a generated repair", async () => {
  const root = repo();
  try {
    write(root, "handoff/README.md", "broken staged\n");
    git(root, "add", "handoff/README.md");
    const result = await regenerateIndexes({ root, env: { GIT_INDEX_FILE: ".git/next-index-test.lock" } });
    assert.ok(result.refused.some((r) => /pathspec/.test(r.fix)));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

async function installHooks(root) {
  const { copyFileSync, chmodSync } = await import("node:fs");
  const realRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  for (const file of ["scripts/generate-archive-index.mjs", "scripts/require-inputs.mjs", "scripts/handoff/regenerate-indexes.mjs", ".githooks/pre-commit", ".githooks/pre-merge-commit"]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(realRoot, file), join(root, file));
    if (file.startsWith(".githooks/")) chmodSync(join(root, file), 0o755);
  }
  write(root, "scripts/project-context-lib.mjs", "export const INVENTORY_TARGETS = [];\nexport function buildInventory() { return {}; }\n");
  write(root, "scripts/handoff/handoff-check.mjs", "process.exit(0);\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "install fixture hooks");
  git(root, "config", "core.hooksPath", ".githooks");
}

test("real hooks refuse an actual pathspec commit that needs navigation repair", async () => {
  const root = repo();
  try {
    await installHooks(root);
    write(root, "handoff/README.md", "broken navigation\n");
    const commit = spawnSync("git", ["commit", "-m", "pathspec", "handoff/README.md"], { cwd: root, encoding: "utf8" });
    assert.notEqual(commit.status, 0);
    assert.match(commit.stderr, /pathspec/);
    assert.equal(readFileSync(join(root, "handoff/README.md"), "utf8"), "broken navigation\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("real pre-merge hook pauses and finishes a malformed navigation repair", async () => {
  const root = repo();
  try {
    await installHooks(root);
    git(root, "switch", "-c", "other");
    write(root, "handoff/README.md", "broken navigation\n");
    git(root, "add", "handoff/README.md");
    git(root, "commit", "--no-verify", "-qm", "hookless navigation drift");
    git(root, "switch", "base");
    write(root, "archive/receipts/mine.json", "{}\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "independent evidence");
    const merge = spawnSync("git", ["merge", "other", "--no-edit"], { cwd: root, encoding: "utf8" });
    assert.equal(merge.status, 1);
    assert.match(merge.stderr, /PAUSED, not failed/);
    assert.equal(git(root, "diff", "--name-only", "--diff-filter=U"), "");
    git(root, "commit", "--no-edit", "-q");
    assert.equal(git(root, "rev-list", "--parents", "-n", "1", "HEAD").split(" ").length, 3);
    assert.equal(generateAll(root, { check: true }).handoff.stale, false);
    assert.equal(git(root, "status", "--porcelain"), "");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a CRLF checkout is not mistaken for unstaged edits when repairing navigation", async () => {
  const root = repo();
  try {
    write(root, ".gitattributes", "* text=auto\n");
    write(root, "handoff/README.md", "broken navigation\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "fixture drift");
    git(root, "config", "core.autocrlf", "true");
    rmSync(join(root, "handoff/README.md"));
    git(root, "checkout", "--", "handoff/README.md"); // Fixture file restore, never a branch switch.
    assert.match(readFileSync(join(root, "handoff/README.md"), "utf8"), /\r\n/);
    write(root, "handoff/_general/from-code/new.md", "Intent: CRLF fixture\r\n");
    git(root, "add", "handoff/_general/from-code/new.md");
    const result = await regenerateIndexes({ root, contextLib: { INVENTORY_TARGETS: [] } });
    assert.deepEqual(result.refused, []);
    assert.deepEqual(result.staged, ["handoff/README.md"]);
    assert.match(git(root, "show", ":handoff/README.md"), /Browse all handoffs/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
