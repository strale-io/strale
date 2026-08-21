#!/usr/bin/env node
/**
 * Run a mutation test safely.
 *
 * WHY THIS EXISTS
 *
 * During the 2026-08-21 remediation program, `git checkout -- <file>` destroyed
 * uncommitted work FOUR times. Each time the sequence was identical: write a
 * fix, mutate it to prove a test discriminates, then "restore" with
 * `git checkout --` — which does not restore anything, it discards. Work that
 * had never been committed was simply gone. Twice it was caught only because a
 * later step failed for an unrelated reason; once an entire migration block
 * vanished and only the mutation check itself noticed.
 *
 * A rule was not enough, because the rule was known and broken anyway. This is
 * the tooling.
 *
 * WHAT IT GUARANTEES
 *
 *   1. It REFUSES to run if the working tree is dirty. Nothing uncommitted can
 *      be lost, because nothing uncommitted is allowed to exist.
 *   2. It records the candidate commit SHA before touching anything.
 *   3. It restores from that SHA — a named commit, never the "discard local
 *      changes" form — and verifies the tree matches afterwards.
 *
 * USAGE
 *
 *   node scripts/mutation-test.mjs \
 *     --file src/lib/x.ts \
 *     --find "the exact source text to replace" \
 *     --replace "the mutated text" \
 *     --test "npx vitest run --no-file-parallelism src/lib/x.test.ts"
 *
 * A mutation test PASSES when the suite goes RED. A green suite under mutation
 * means the test does not discriminate and is not evidence of anything.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { argv, exit } from "node:process";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function arg(name) {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
}

const file = arg("file");
const find = arg("find");
const replace = arg("replace") ?? "";
const test = arg("test");

if (!file || !find || !test) {
  console.error(
    "usage: mutation-test.mjs --file <path> --find <text> [--replace <text>] --test <command>",
  );
  exit(2);
}

// ── Guard 1: the tree must be clean ─────────────────────────────────────────
//
// This is the whole safety property. Everything below can overwrite files, and
// overwriting is only safe when the pre-state is recoverable from a commit.
const dirty = git("status", "--porcelain", "--untracked-files=no");
if (dirty) {
  console.error(
    "REFUSING TO RUN: the working tree has uncommitted changes.\n\n" +
      dirty +
      "\n\nCommit the candidate first. Mutation testing overwrites files and\n" +
      "restores them from a commit; anything not committed cannot be restored.\n" +
      "This guard exists because `git checkout --` destroyed uncommitted\n" +
      "remediation work four times in one session.",
  );
  exit(1);
}

const candidateSha = git("rev-parse", "HEAD");
console.log(`candidate commit: ${candidateSha}`);

const original = readFileSync(file, "utf8");
if (!original.includes(find)) {
  console.error(
    `REFUSING TO RUN: the --find text is not present in ${file}.\n` +
      "A mutation that changes nothing produces a green run and proves nothing.",
  );
  exit(1);
}

let testFailed = false;
try {
  writeFileSync(file, original.replace(find, replace), "utf8");
  console.log(`mutated ${file}`);

  try {
    execFileSync(process.platform === "win32" ? "cmd" : "sh",
      process.platform === "win32" ? ["/c", test] : ["-c", test],
      { stdio: "inherit" });
  } catch {
    testFailed = true;
  }
} finally {
  // ── Guard 3: restore from the RECORDED COMMIT ─────────────────────────────
  //
  // `git checkout <sha> -- <path>` restores a known-good version. The banned
  // form is `git checkout -- <path>`, which silently discards uncommitted work
  // — and is what caused the incidents this script exists to prevent.
  git("checkout", candidateSha, "--", file);

  const afterwards = git("status", "--porcelain", "--untracked-files=no");
  if (afterwards) {
    console.error(
      `RESTORE INCOMPLETE — the tree is still dirty after restoring from ${candidateSha}:\n${afterwards}`,
    );
    exit(1);
  }
  console.log(`restored ${file} from ${candidateSha}; tree clean`);
}

if (testFailed) {
  console.log("\nMUTATION CAUGHT — the suite went red. The test discriminates.");
  exit(0);
}

console.error(
  "\nMUTATION SURVIVED — the suite stayed green with the fix removed.\n" +
    "The test does not discriminate and is not evidence that the fix works.",
);
exit(1);
