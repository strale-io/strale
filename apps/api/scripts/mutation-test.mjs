#!/usr/bin/env node
/**
 * Run a mutation test safely, and prove the result means something.
 *
 * WHY THIS EXISTS
 *
 * During the 2026-08-21 remediation program, `git checkout -- <file>` destroyed
 * uncommitted work FOUR times. Each time: write a fix, mutate it to prove a test
 * discriminates, then "restore" with `git checkout --` — which does not restore,
 * it discards. Work never committed was simply gone.
 *
 * A rule was not enough, because the rule was known and broken anyway.
 *
 * THE PROTOCOL, AND WHY EACH STEP IS THERE
 *
 *   clean tree → baseline PASS → mutate → FAIL → restore → PASS → clean tree
 *
 * The first version of this script mutated first and treated ANY non-zero exit
 * as "mutation caught". That is wrong, and it produced a false result inside
 * this very package: four tests were committed with a missing import, so the
 * suite was already red, and the tool cheerfully reported MUTATION CAUGHT. An
 * already-failing suite catches every mutation and proves nothing. So does a
 * missing database, a bad env var, a timeout, or a typo in the test command —
 * all of them exit non-zero, and none of them are evidence.
 *
 * Requiring green BEFORE and green AFTER is what separates "this test
 * discriminates" from "something is broken". The trailing green also proves the
 * restore actually worked, rather than leaving a half-mutated tree behind.
 *
 * USAGE
 *
 *   node scripts/mutation-test.mjs \
 *     --file src/lib/x.ts \
 *     --find "exact source text to replace" \
 *     --replace "mutated text" \
 *     --test "npx vitest run src/lib/x.test.ts"
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { argv, exit, platform } from "node:process";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/** Runs the caller's test command. Returns true when it exits 0. */
function runTest(command) {
  try {
    execFileSync(
      platform === "win32" ? "cmd" : "sh",
      platform === "win32" ? ["/c", command] : ["-c", command],
      { stdio: "inherit" },
    );
    return true;
  } catch {
    return false;
  }
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

function refuse(reason) {
  console.error(`REFUSING TO RUN: ${reason}`);
  exit(1);
}

// ── Guard 1: the tree must be clean, INCLUDING UNTRACKED FILES ──────────────
//
// The first version passed `--untracked-files=no`, which let an UNTRACKED
// target through: the file looked clean, got mutated, and could not be restored
// because it does not exist in any commit. The restore would then either fail or
// delete it outright. Untracked files are precisely the ones with no recoverable
// copy, so they are the last thing that should be exempt.
const dirty = git("status", "--porcelain");
if (dirty) {
  refuse(
    "the working tree is not clean.\n\n" +
      dirty +
      "\n\nCommit the candidate first. This script overwrites files and restores\n" +
      "them from a commit; anything not committed cannot be restored. Untracked\n" +
      "files count — they are the ones with no recoverable copy at all.",
  );
}

const candidateSha = git("rev-parse", "HEAD");

// ── Guard 2: the target must exist IN THE CANDIDATE COMMIT ──────────────────
//
// A clean tree is not sufficient on its own: a path can be clean and still be
// absent from HEAD (for example, ignored). Restoring it would fail.
try {
  git("cat-file", "-e", `${candidateSha}:${file}`);
} catch {
  refuse(
    `${file} does not exist in the candidate commit ${candidateSha.slice(0, 12)}.\n` +
      "It could be mutated but not restored.",
  );
}

if (!existsSync(file)) refuse(`${file} does not exist on disk.`);

const original = readFileSync(file, "utf8");
if (!original.includes(find)) {
  refuse(
    `the --find text is not present in ${file}.\n` +
      "A mutation that changes nothing produces a green run and proves nothing.",
  );
}

console.log(`candidate commit: ${candidateSha}`);

// ── Step 1: BASELINE MUST BE GREEN ──────────────────────────────────────────
//
// Without this the whole exercise is meaningless — see the header. A red
// baseline "catches" every mutation, and so does a broken environment.
console.log("\n── baseline (must PASS) ─────────────────────────────────────");
if (!runTest(test)) {
  refuse(
    "the baseline test run FAILED before any mutation was applied.\n\n" +
      "An already-failing suite reports every mutation as caught, which is how a\n" +
      "false result entered this package. Fix the baseline, then mutate.\n" +
      "The same applies to a missing database, a bad env var, or a typo in the\n" +
      "test command: all exit non-zero and none are evidence.",
  );
}

// ── Step 2: mutate, and the test MUST go red ────────────────────────────────
let mutationCaught = false;
let restoredGreen = false;
try {
  writeFileSync(file, original.replace(find, replace), "utf8");
  console.log(`\n── mutated ${file} (must FAIL) ──────────────────────────────`);
  mutationCaught = !runTest(test);
} finally {
  // ── Step 3: restore from the RECORDED COMMIT ──────────────────────────────
  //
  // `git checkout <sha> -- <path>` restores a known version. The banned form is
  // `git checkout -- <path>`, which discards uncommitted work — the cause of the
  // four incidents this script exists to prevent.
  git("checkout", candidateSha, "--", file);

  const afterwards = git("status", "--porcelain");
  if (afterwards) {
    console.error(
      `\nRESTORE INCOMPLETE — tree still dirty after restoring from ${candidateSha}:\n${afterwards}`,
    );
    exit(1);
  }
  console.log(`\n── restored ${file} from ${candidateSha.slice(0, 12)} ───────`);
}

// ── Step 4: GREEN AGAIN ─────────────────────────────────────────────────────
//
// Proves the restore genuinely put the candidate back, and that the red run was
// the mutation rather than something that broke midway and stayed broken.
console.log("\n── after restore (must PASS again) ─────────────────────────");
restoredGreen = runTest(test);

if (!restoredGreen) {
  console.error(
    "\nINCONCLUSIVE — the suite is still red after restoring the candidate.\n" +
      "The red run cannot be attributed to the mutation. Investigate before\n" +
      "trusting any mutation result from this file.",
  );
  exit(1);
}

if (mutationCaught) {
  console.log(
    "\nMUTATION CAUGHT — green → red → green. The test discriminates.",
  );
  exit(0);
}

console.error(
  "\nMUTATION SURVIVED — the suite stayed green with the fix removed.\n" +
    "The test does not discriminate and is not evidence that the fix works.",
);
exit(1);
