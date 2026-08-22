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
  { name: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----[\r\n]+[A-Za-z0-9+\/=]{40}/g },
];

// Vendors ship deliberately-fake credentials in their own documentation, and
// those get pasted into READMEs. AWS's canonical AKIAIOSFODNN7EXAMPLE matches
// the pattern above by design. Because this gate scans the whole tree, one such
// paste would red-line every PR in the repo, so exclude the known-fake forms.
const isPlaceholder = (v) => v.endsWith("EXAMPLE");

const MAX_BYTES = 2 * 1024 * 1024;

const BACKSLASH = String.fromCharCode(92);
const LF = String.fromCharCode(10);
const SEP = String.fromCharCode(0); // key separator, cannot occur in a path
const ALLOWLIST_PATH = "apps/api/scripts/committed-secrets-allowlist.txt";

/**
 * Known-safe matches, keyed on path + the exact matched text.
 *
 * Requiring the literal is the safety property: an entry can only exempt a
 * value you are willing to write down in plaintext here. A real credential
 * therefore cannot be allowlisted -- writing it would leak it -- so the only
 * way past this gate for a real secret is to rotate it and take it out.
 *
 * That property holds ONLY while every pattern's match contains the secret
 * itself. A pattern matching a fixed, zero-entropy marker (a bare PEM header,
 * say) would let one entry exempt every real secret sharing that marker. If you
 * add a pattern, make sure the match includes the high-entropy material -- see
 * the private-key pattern, which requires key bytes rather than the header.
 */
function loadAllowlist() {
  let raw;
  try {
    raw = readFileSync(ALLOWLIST_PATH, "utf8");
  } catch {
    return new Map();
  }
  const entries = new Map();
  for (const line of raw.split(LF)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const at = t.indexOf(" :: ");
    if (at === -1) continue;
    entries.set(t.slice(0, at).trim() + SEP + t.slice(at + 4), false);
  }
  return entries;
}

const allowlist = loadAllowlist();

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
      const normalised = file.split(BACKSLASH).join("/");

      // Inside the allowlist itself, only the literal half of a well-formed
      // entry is exempt. Anything else there -- a comment, a stray paste -- is
      // scanned like any other file, so the allowlist is not a hiding place.
      if (normalised === ALLOWLIST_PATH) {
        const lineStart = text.lastIndexOf(LF, m.index) + 1;
        const sepAt = text.indexOf(" :: ", lineStart);
        const lineEnd = text.indexOf(LF, lineStart);
        const sepOnThisLine = sepAt !== -1 && (lineEnd === -1 || sepAt < lineEnd);
        if (sepOnThisLine && m.index >= sepAt + 4) continue;
      }

      const allowKey = normalised + SEP + m[0];
      if (allowlist.has(allowKey)) { allowlist.set(allowKey, true); continue; }
      findings.push({ file, line, name, value: m[0] });
    }
  }
}

const stale = [...allowlist.entries()].filter(([, used]) => !used).map(([k]) => k.split(SEP)[0]);
if (stale.length > 0) {
  console.error("check-no-committed-secrets: NOTICE - allowlist entries matching nothing:");
  for (const f of stale) console.error("  " + f);
  console.error("  Either the file changed, or the entry is malformed. Entries are exactly: <path> :: <matched text>");
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
