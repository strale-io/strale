#!/usr/bin/env node
/**
 * Fail CI if a tracked file contains a credential in a recognised token format.
 *
 * Why this exists: tooling config files (editor settings, agent permission
 * allowlists, task runners) can carry credentials inside a command string --
 * `--token <value>`, `Authorization: Bearer <value>` -- where they read as
 * configuration rather than as secrets. Untracking such a file later removes it
 * from the tip but not from history, so on a public repo the value stays
 * readable. A pre-merge scan is the only cheap place to stop that.
 *
 * Deliberately narrow: only vendor token formats specific enough that a match
 * is a real credential, never a placeholder. A gate that cries wolf gets
 * disabled, and a disabled gate is worse than no gate.
 *
 * Scans tracked files only -- untracked and gitignored files are the developer's
 * business; what matters is what reaches the public history.
 *
 * SCOPE LIMIT, stated deliberately: this scans the working tree, not each commit
 * in a PR. A credential added in one commit and removed in a later commit on the
 * same branch is invisible here. That is safe *only* because this repo squash-
 * merges, so intermediate commits never reach main and the tree scanned here is
 * exactly what lands. `allow_merge_commit` is still enabled on the repo: if a PR
 * is ever landed as a true merge commit, that assumption breaks. Either keep
 * squash-merging, or extend this to scan `git diff <base>...HEAD` added lines.
 *
 * ALLOWLIST INVARIANT: an entry must quote the exact matched text, so it can
 * only exempt a value someone is willing to write down in plaintext here. For
 * the token patterns the match IS the secret, so a real credential cannot be
 * allowlisted without leaking it. The private-key check is different -- its
 * match is a fixed PEM header carrying no key material -- so it is marked
 * `allowlistable: false` and no entry can exempt it. If you add a pattern whose
 * match is fixed or low-entropy, mark it the same way.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const NUL = String.fromCharCode(0);
const BACKSLASH = String.fromCharCode(92);
const LF = String.fromCharCode(10);
const SEP = NUL; // allowlist key separator; cannot occur in a path
const ALLOWLIST_PATH = "apps/api/scripts/committed-secrets-allowlist.txt";

/**
 * A PEM header alone is not a secret: tests legitimately assert that such a
 * value is refused, and this repo has exactly that fixture. What makes it a
 * secret is key material following it.
 *
 * So match the header -- which catches every transport a key travels in -- and
 * then decide by looking at what follows, undoing the encodings that hide a key
 * body from a naive regex: escaped newlines (.env, JSON service accounts, the
 * env-var form this repo reads the founder key in), indentation (YAML block
 * scalars, k8s Secrets), quoting and commas (JSON arrays of lines), and the
 * Proc-Type/DEK-Info headers of an encrypted traditional PEM or PGP armor.
 *
 * An earlier revision required base64 immediately after a literal newline. That
 * silently missed every one of those layouts -- worse than the false positive
 * it was avoiding, because a miss is invisible.
 */
function pemHasKeyMaterial(text, afterIndex) {
  const window = text.slice(afterIndex, afterIndex + 800).split(BACKSLASH + "n").join(LF);
  const lines = window.split(LF).slice(0, 9);
  for (const raw of lines) {
    const line = raw.trim().replace(/^["',]+/, "").replace(/["',]+$/, "").trim();
    if (line === "") continue;
    if (/^-----END/.test(line)) return false; // header immediately closed: no body
    if (/^[A-Za-z][A-Za-z0-9-]*:/.test(line)) continue; // Proc-Type:, DEK-Info:, Version:
    if (/^[A-Za-z0-9+\/=]{16,}$/.test(line)) return true;
    return false; // prose or code after the header: a bare marker, not a key
  }
  return false;
}

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
  {
    name: "Private key",
    re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g,
    verify: pemHasKeyMaterial,
    allowlistable: false,
  },
];

// Vendors ship deliberately-fake credentials in their own documentation, and
// those get pasted into READMEs. AWS's canonical AKIAIOSFODNN7EXAMPLE matches
// by design. Because this gate scans the whole tree, one such paste would
// red-line every PR in the repo.
const isPlaceholder = (v) => v.endsWith("EXAMPLE");

const MAX_BYTES = 2 * 1024 * 1024;

/** Known-safe matches, keyed on path + the exact matched text. */
function loadAllowlist() {
  let raw;
  try {
    raw = readFileSync(ALLOWLIST_PATH, "utf8");
  } catch {
    return { entries: new Map(), malformed: [] };
  }
  const entries = new Map();
  const malformed = [];
  for (const line of raw.split(LF)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const at = t.indexOf(" :: ");
    if (at === -1) {
      malformed.push(t);
      continue;
    }
    // Literals may use \n so a multi-line match can be written on one line.
    const literal = t.slice(at + 4).split(BACKSLASH + "n").join(LF);
    entries.set(t.slice(0, at).trim() + SEP + literal, false);
  }
  return { entries, malformed };
}

const { entries: allowlist, malformed } = loadAllowlist();
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  .split(NUL)
  .filter(Boolean);
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

  const normalised = file.split(BACKSLASH).join("/");
  const isAllowlistFile = normalised === ALLOWLIST_PATH;

  for (const { name, re, verify, allowlistable } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (isPlaceholder(m[0])) continue;
      if (verify && !verify(text, m.index + m[0].length)) continue;

      if (isAllowlistFile) {
        // Only the literal half of a well-formed, non-comment entry is exempt.
        // A comment is scanned like anything else -- this file's own purpose
        // invites writing credential-shaped text into it, so it must not be a
        // hiding place.
        const lineStart = text.lastIndexOf(LF, m.index) + 1;
        const lineEnd = text.indexOf(LF, lineStart);
        const lineText = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
        const sepAt = text.indexOf(" :: ", lineStart);
        const sepOnThisLine = sepAt !== -1 && (lineEnd === -1 || sepAt < lineEnd);
        if (!lineText.trimStart().startsWith("#") && sepOnThisLine && m.index >= sepAt + 4) continue;
      }

      if (allowlistable !== false) {
        const key = normalised + SEP + m[0];
        if (allowlist.has(key)) {
          allowlist.set(key, true);
          continue;
        }
      }

      const line = text.slice(0, m.index).split(LF).length;
      findings.push({ file, line, name, value: m[0] });
    }
  }
}

const mask = (v) => v.slice(0, 10) + "..." + "[" + v.length + " chars, redacted]";

for (const bad of malformed) {
  console.error("check-no-committed-secrets: malformed allowlist line (needs ' :: '): " + bad.slice(0, 60));
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
