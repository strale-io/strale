// Tests for scripts/handoff/regenerate-indexes.mjs (pre-commit regeneration
// of archive/README.md, handoff/README.md and the legacy-authority
// inventory). Every case runs in a throwaway git repository.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { generateAll } from "../generate-archive-index.mjs";
import { INVENTORY_PATH, regenerateIndexes } from "./regenerate-indexes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const realRoot = resolve(here, "../..");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function write(root, path, content) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content, "utf8");
}

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "regen-indexes-"));
  git(root, "init", "-q", "-b", "feature");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  git(root, "config", "commit.gpgsign", "false");
  write(root, "archive/README.md", "# archive\n\nHand-written prose.\n");
  write(root, "archive/sessions/2026-09-01-a.md", "a\n");
  write(root, "handoff/_general/from-code/2026-09-01-a.md", "Intent: first\n");
  generateAll(root);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  return root;
}

// A fake project-context lib: the inventory is the list of staged paths under
// its one target, so a test can see that it was built from the index.
const fakeContextLib = (root) => ({
  INVENTORY_TARGETS: [{ path: "handoff" }],
  buildInventory: () => ({ files: git(root, "ls-files", "--", "handoff").split("\n").filter(Boolean) }),
});

const staged = (root) => git(root, "diff", "--cached", "--name-only").split("\n").filter(Boolean).sort();

test("nothing staged under archive/ or handoff/ (and no inventory target): nothing is written", async () => {
  const root = makeRepo();
  try {
    write(root, "apps/x.ts", "export {};\n");
    git(root, "add", "apps/x.ts");
    const result = await regenerateIndexes({ root, contextLib: fakeContextLib(root) });
    assert.deepEqual(result, { staged: [], refused: [] });
    assert.deepEqual(staged(root), ["apps/x.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a staged handoff file regenerates and stages handoff/README.md and the inventory", async () => {
  const root = makeRepo();
  try {
    write(root, "handoff/_general/from-code/2026-10-24-b.md", "Intent: second\n");
    git(root, "add", "handoff/_general/from-code/2026-10-24-b.md");
    const result = await regenerateIndexes({ root, contextLib: fakeContextLib(root) });
    assert.deepEqual(result.refused, []);
    assert.deepEqual(result.staged.sort(), [INVENTORY_PATH, "handoff/README.md"].sort());
    assert.match(git(root, "show", ":handoff/README.md"), /2026-10-24-b\.md\).*\| second \|/);
    // The inventory was built after handoff/README.md was staged.
    assert.ok(JSON.parse(git(root, "show", `:${INVENTORY_PATH}`)).files.includes("handoff/README.md"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the index is built from the staged tree: untracked and unstaged files are not indexed", async () => {
  const root = makeRepo();
  try {
    write(root, "archive/sessions/2026-10-24-staged.md", "s\n");
    git(root, "add", "archive/sessions/2026-10-24-staged.md");
    write(root, "archive/sessions/2026-10-25-untracked.md", "u\n");
    write(root, "handoff/_general/from-code/2026-10-25-untracked.md", "Intent: not staged\n");
    const result = await regenerateIndexes({ root, contextLib: fakeContextLib(root) });
    assert.deepEqual(result.refused, []);
    const archive = git(root, "show", ":archive/README.md");
    assert.match(archive, /2026-10-24-staged\.md/);
    assert.doesNotMatch(archive, /untracked/);
    assert.match(archive, /Hand-written prose\./);
    assert.doesNotMatch(git(root, "show", ":handoff/README.md"), /not staged/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a deleted archive file is dropped from the regenerated index", async () => {
  const root = makeRepo();
  try {
    write(root, "archive/other/2026-09-02-z.md", "z\n");
    generateAll(root);
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "add other");
    git(root, "rm", "-q", "archive/other/2026-09-02-z.md");
    const result = await regenerateIndexes({ root, contextLib: fakeContextLib(root) });
    assert.deepEqual(result.refused, []);
    assert.ok(result.staged.includes("archive/README.md"));
    assert.doesNotMatch(git(root, "show", ":archive/README.md"), /archive\/other\//);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an up-to-date index is left alone", async () => {
  const root = makeRepo();
  try {
    write(root, "handoff/_general/from-code/2026-10-24-b.md", "Intent: second\n");
    generateAll(root);
    git(root, "add", "-A");
    const before = staged(root);
    const result = await regenerateIndexes({ root, contextLib: { INVENTORY_TARGETS: [] } });
    assert.deepEqual(result, { staged: [], refused: [] });
    assert.deepEqual(staged(root), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unstaged hand edits to a generated file are never overwritten: it refuses with a fix", async () => {
  const root = makeRepo();
  try {
    write(root, "handoff/_general/from-code/2026-10-24-b.md", "Intent: second\n");
    git(root, "add", "handoff/_general/from-code/2026-10-24-b.md");
    write(root, "handoff/README.md", "hand edit\n");
    const result = await regenerateIndexes({ root, contextLib: { INVENTORY_TARGETS: [] } });
    assert.deepEqual(result.staged, []);
    assert.equal(result.refused.length, 1);
    assert.match(result.refused[0].fix, /handoff\/README\.md has unstaged edits/);
    assert.equal(readFileSync(join(root, "handoff/README.md"), "utf8"), "hand edit\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("wired as hooks: a commit and a clean merge both land a fresh index (planted failure: the forgotten archive:index)", () => {
  const root = makeRepo();
  try {
    // Install the real hook scripts with the regeneration script and the
    // generator it imports, but a stub handoff gate, so only regeneration runs.
    for (const file of ["scripts/generate-archive-index.mjs", "scripts/handoff/regenerate-indexes.mjs"]) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      copyFileSync(join(realRoot, file), join(root, file));
    }
    write(root, "scripts/project-context-lib.mjs", "export const INVENTORY_TARGETS = [];\nexport function buildInventory() { return {}; }\n");
    write(root, "scripts/handoff/handoff-check.mjs", "process.exit(0);\n");
    mkdirSync(join(root, ".githooks"), { recursive: true });
    for (const hook of ["pre-commit", "pre-merge-commit"]) {
      copyFileSync(join(realRoot, ".githooks", hook), join(root, ".githooks", hook));
      chmodSync(join(root, ".githooks", hook), 0o755);
    }
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "hooks");
    git(root, "config", "core.hooksPath", ".githooks");

    // Commit a handoff file WITHOUT running archive:index: the old CI failure.
    write(root, "handoff/_general/from-code/2026-10-24-b.md", "Intent: forgot the index\n");
    git(root, "add", "handoff/_general/from-code/2026-10-24-b.md");
    git(root, "commit", "-q", "-m", "handoff without index");
    let check = spawnSync(process.execPath, ["scripts/generate-archive-index.mjs", "--check"], { cwd: root, encoding: "utf8" });
    assert.equal(check.status, 0, check.stderr);
    assert.match(git(root, "show", "HEAD:handoff/README.md"), /forgot the index/);

    // `other` stands for main after a GitHub-side merge (no hooks there): its
    // handoff file landed with a stale index. A clean merge of it into this
    // branch completes without pre-commit; pre-merge-commit must regenerate.
    git(root, "checkout", "-q", "-b", "other", "HEAD~0");
    write(root, "handoff/_general/from-code/2026-10-25-other.md", "Intent: from other\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "--no-verify", "-m", "other, hookless");
    assert.doesNotMatch(git(root, "show", "HEAD:handoff/README.md"), /from other/);
    git(root, "checkout", "-q", "feature");
    write(root, "archive/sessions/2026-10-26-mine.md", "m\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "mine");
    const merge = spawnSync("git", ["merge", "-q", "--no-edit", "other"], { cwd: root, encoding: "utf8" });
    assert.equal(merge.status, 1, "pre-merge-commit stops the merge once it has staged a fresh index");
    assert.match(merge.stderr, /finish the merge with git commit --no-edit/);
    git(root, "commit", "-q", "--no-edit");
    assert.equal(git(root, "rev-list", "--parents", "-n", "1", "HEAD").split(" ").length, 3, "HEAD is the merge commit");
    check = spawnSync(process.execPath, ["scripts/generate-archive-index.mjs", "--check"], { cwd: root, encoding: "utf8" });
    assert.equal(check.status, 0, check.stderr);
    assert.match(git(root, "show", "HEAD:handoff/README.md"), /from other/);
    assert.equal(git(root, "status", "--porcelain"), "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
