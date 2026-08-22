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
 *
 * SCOPE LIMIT, stated deliberately: this scans the working tree, not each commit
 * in a PR. A credential added in one commit and removed in a later commit on the
 * same branch is invisible here. That is safe *only* because this repo squash-
 * merges, so the intermediate commits never reach main and the tree scanned here
 * is exactly what lands. `allow_merge_commit` is still enabled on the repo: if a
 * PR is ever landed as a true merge commit, that assumption breaks and the
 * intermediate commits will not have been covered. Either keep squash-merging,
 * or extend this to scan added lines from `git diff <base>...HEAD`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const NUL = String.fromCharCode(0);

const PATTERNS = [
  { name: "Strale/Stripe live secret key", re: /sk_live_[A-Za-z0-9]{24,}/g },
  { name: "Stripe restricted key", re: /rk_live_[A-Za-z0-9]{24,}/g },
  { name: "Stripe webhook secret", re: /whsec_[A-Za-z0-9]{32,}/g },
  { name: "npm access token", re: /npm_[A-Za-z0-9]{36}/g },
  { name: "GitHub token", re: /gh[pousr]_[A-Za-z0-9]{36}/g },
  { name: "GitHub fine-grained PAT", re: /github_pat_[A-Za-z0-9_]{70,}/g },
  { name: "Anthropic API key", re: /sk-ant-[A-Za-z0-9_-]{90,}/g },
  { name: "OpenAI project key", re: /sk-proj-[A-Za-z0-9_-]{40,}/g },
  { name: "AWS access key id", re: /(?:AKIA|ASIA)[0-9A-Z]{16}/g },
  { name: "Google API key", re: /AIza[0-9A-Za-z_-]{35}/g },
  { name: "Slack token", re: /xox[baprs]-[0-9A-Za-z-]{20,}/g },
  { name: "Notion integration token", re: /ntn_[A-Za-z0-9]{40,}/g },
  { name: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/g },
];

// Vendors ship deliberately-fake credentials in their own documentation, and
// those get pasted into READMEs. AWS's canonical AKIAIOSFODNN7EXAMPLE matches
// the pattern above by design. Because this gate scans the whole tree, one such
// paste would red-line every PR in the repo, so exclude the known-fake forms.
const isPlaceholder = (v) => v.endsWith("EXAMPLE");

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
      if (isPlaceholder(m[0])) continue;
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
