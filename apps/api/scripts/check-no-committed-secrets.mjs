#!/usr/bin/env node
/**
 * Fail CI if a tracked file contains a credential in a recognised token format.
 *
 * Why this exists: tooling config files (editor settings, agent permission
 * allowlists, task runners) can carry credentials inside a command string —
 * `--token <value>`, `Authorization: Bearer <value>` — where they read as
 * configuration rather than as secrets. Untracking such a file later removes it
 * from the tip but not from history, so on a public repo the value stays
 * readable. A pre-merge scan is the only cheap place to stop that.
 *
 * Deliberately narrow: only vendor token formats specific enough that a match
 * is a real credential, never a placeholder. A gate that cries wolf gets
 * disabled, and a disabled gate is worse than no gate.
 *
 * Scans tracked files only — untracked and gitignored files are the developer's
 * business; what matters is what reaches the public history.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const NUL = String.fromCharCode(0);

const PATTERNS = [
  { name: "Strale/Stripe live secret key", re: /sk_live_[A-Za-z0-9]{24,}/g },
  { name: "npm access token", re: /npm_[A-Za-z0-9]{36}/g },
  { name: "GitHub personal access token", re: /ghp_[A-Za-z0-9]{36}/g },
  { name: "GitHub fine-grained PAT", re: /github_pat_[A-Za-z0-9_]{70,}/g },
  { name: "Anthropic API key", re: /sk-ant-[A-Za-z0-9_-]{90,}/g },
  { name: "AWS access key id", re: /AKIA[0-9A-Z]{16}/g },
  { name: "Notion integration token", re: /ntn_[A-Za-z0-9]{40,}/g },
];

const MAX_BYTES = 2 * 1024 * 1024;

function trackedFiles() {
  const out = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.split(NUL).filter(Boolean);
}

const mask = (v) => v.slice(0, 10) + "..." + "[" + v.length + " chars, redacted]";

const files = trackedFiles();
const findings = [];

for (const file of files) {
  let text;
  try {
    if (statSync(file).size > MAX_BYTES) continue;
    text = readFileSync(file, "utf8");
  } catch {
    continue; // deleted, unreadable, or not valid UTF-8
  }
  if (text.includes(NUL)) continue; // binary

  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const line = text.slice(0, m.index).split("\n").length;
      findings.push({ file, line, name, value: m[0] });
    }
  }
}

if (findings.length > 0) {
  console.error("check-no-committed-secrets: credential-shaped values found in TRACKED files.");
  console.error("");
  for (const f of findings) {
    console.error("  " + f.file + ":" + f.line + "  " + f.name + "  " + mask(f.value));
  }
  console.error("");
  console.error("Do not just delete the line and commit: once pushed, the value is public");
  console.error("and stays in history. Rotate the credential first, then remove it.");
  process.exit(1);
}

console.log("check-no-committed-secrets: clean (" + files.length + " tracked files scanned)");
