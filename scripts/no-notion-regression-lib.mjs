/**
 * Notion anti-regression check (M4 batch 7 part one; migration plan M6
 * fixture 4: "Reintroducing NOTION_API_KEY, NOTION_TOKEN, api.notion.com,
 * or an active Notion MCP call outside archives fails CI").
 *
 * The M4 cutover removed every active Notion consumer named in
 * archive/sessions/2026-09-11-m4-cutover-inventory.md section 1: the daily
 * digest's three readers, the vendor-roster drift check, the vendor-switch
 * skill's decision-logging step, and the end-session command's Journal
 * write and to-do read. This check exists so a future session cannot
 * silently reintroduce one of those reads: it scans every tracked file for
 * the five signal patterns that mean a real credential, API call, or tool
 * reference (never a citation URL such as notion.so, which a human reads,
 * not code) -- NOTION_API_KEY, NOTION_TOKEN, api.notion.com, @notionhq, and
 * an MCP tool name containing "notion" -- plus, since a reintroduction most
 * plausibly happens by an agent re-adding an instruction step, a bare
 * case-insensitive "notion" scan restricted to the two live instruction
 * surfaces (.claude/, .agents/) an agent actually reads at runtime.
 *
 * False positives are the hazard (this file's own header comment would
 * otherwise trip the check it defines), so every exemption is named
 * explicitly by path -- never a broad pattern -- in one of two ways:
 *
 * - FULL_FILE_ALLOWLIST: a directory prefix or exact path where the whole
 *   file is permanently historical (archive/, handoff/, decision records)
 *   or a stable, named document explaining the migration itself. Every
 *   match anywhere in these paths is exempt.
 * - COMMENT_ONLY_ALLOWLIST: an exact path where the file is still live code
 *   or a live workflow, and a match is exempt only when the matched line is
 *   a comment for that file's language. A genuine new read added to the
 *   same file on a non-comment line still fires -- an allowlisted file is
 *   never a blanket exemption for the file, only for its existing
 *   commentary. See no-notion-regression.test.mjs's blanket-exemption test.
 *
 * Every other legitimate mention this batch found was reworded instead of
 * allowlisted (CLAUDE.md's "prefer rewording... every allowlist entry is a
 * hole"): the session-end command's and its Codex mirror's historical
 * "Notion Journal entry"/"Notion To-do DB query" prose, the vendor-switch
 * skill's DPA-template pointer, and the scheduled-reachability library's
 * docstring and test fixtures (which used NOTION_API_KEY/NOTION_TOKEN only
 * as example env-var names, not a real dependency) all now read without
 * the word "Notion" or the literal credential names, so they need no
 * allowlist entry at all.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function repoRootFrom(importMetaUrl) {
  return resolve(dirname(fileURLToPath(importMetaUrl)), "..");
}

/** Directory prefixes (repo-relative, forward-slash, no leading "./") where
 * every match is exempt everywhere in the file: permanently historical
 * material this repository's own conventions already treat as write-once. */
export const FULL_FILE_ALLOWLIST_DIRS = [
  "archive/",
  "handoff/",
  "docs/decisions/records/",
];

/** Exact repo-relative paths where every match is exempt everywhere in the
 * file: stable, named documents explaining the migration itself, or whose
 * live-relevant fields (secrets/env wiring) are independently enforced by
 * another checker (scheduled:check's MECHANISM_SECRET_MISMATCH, env:check),
 * so this check's job on them is redundant with that checker. */
export const FULL_FILE_ALLOWLIST_FILES = new Set([
  "docs/programs/cto-readiness/tracks.yaml",
  "docs/strategy/2026-08-31-repo-native-operating-model-migration.md",
  "docs/strategy/2026-08-31-notion-consumer-migration-inventory.md",
  "docs/operations/distribution-registry.md",
  "apps/api/railway-config.md",
  "apps/api/docs/drift-check-refactor-proposal.md",
]);

/** Exact repo-relative paths where a match is exempt only on a comment
 * line for the file's language -- a non-comment match in the same file
 * still fires. Keyed by path; value names the reason for the record. */
export const COMMENT_ONLY_ALLOWLIST = new Map([
  [
    "apps/api/scripts/check-vendor-roster-drift.ts",
    "Header docstring narrates the M4 batch 6 removal of the Notion read this file used to perform ('Both legs read NOTION_TOKEN and called api.notion.com'). A real read reintroduced in executable code in this same file must still fire.",
  ],
  [
    ".github/workflows/ci.yml",
    "Two step comments name which M4 batch retired the NOTION_API_KEY-reading shadow script and the Notion Journal/to-do steps the candidate tests assert are gone. No job in this file declares a NOTION_* secret or env var.",
  ],
]);

/** The five signal patterns that mean a real credential, API call, or tool
 * reference -- never a bare notion.so citation URL, which is how comments
 * throughout this repository cite a Notion page as provenance for a past
 * decision (see e.g. apps/api/src/lib/platform-facts.ts's own header) and
 * is not itself a live consumer. */
export const CREDENTIAL_PATTERNS = [
  { code: "NOTION_API_KEY", re: /NOTION_API_KEY/ },
  { code: "NOTION_TOKEN", re: /NOTION_TOKEN/ },
  { code: "NOTION_API_URL", re: /api\.notion\.com/i },
  { code: "NOTION_SDK_IMPORT", re: /@notionhq/ },
  { code: "NOTION_MCP_TOOL", re: /mcp__[^\s'"`)]*notion[^\s'"`)]*/i },
];

/** Directory prefixes an agent actually reads as live instructions at
 * runtime. A bare "notion" mention here means an instruction step, not a
 * citation -- the reintroduction shape section 1 of the cutover inventory
 * found (a skill or command telling an agent to read or write Notion). */
export const INSTRUCTION_SURFACE_DIRS = [".claude/", ".agents/"];
const BARE_NOTION_RE = /\bnotion\b/i;

function isUnderAnyDir(file, dirs) {
  return dirs.some((dir) => file.startsWith(dir));
}

function isFullyAllowlisted(file) {
  return isUnderAnyDir(file, FULL_FILE_ALLOWLIST_DIRS) || FULL_FILE_ALLOWLIST_FILES.has(file);
}

/** Whether `line` is a comment line for `file`'s extension. Conservative:
 * an extension this function does not recognise is never treated as a
 * comment, so a COMMENT_ONLY_ALLOWLIST entry for an unrecognised file type
 * exempts nothing (fails safe, not silently open). */
function isCommentLine(file, line) {
  const trimmed = line.trim();
  if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file)) {
    return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
  }
  if (/\.(yml|yaml)$/.test(file)) {
    return trimmed.startsWith("#");
  }
  return false;
}

/**
 * Scans the given repo-relative file list (as `git ls-files` would return)
 * for the patterns above and returns { code, file, line, snippet }
 * findings for every match not covered by an allowlist entry. `readFile`
 * defaults to reading from `root` on disk; tests supply an in-memory map
 * instead so this runs without a real git checkout.
 */
export function scanFiles(root, files, readFile = (rel) => readFileSync(resolve(root, rel), "utf8")) {
  const findings = [];
  for (const file of files) {
    const posixFile = file.split("\\").join("/");
    let content;
    try {
      content = readFile(posixFile);
    } catch {
      continue; // deleted-but-tracked or unreadable; nothing to scan
    }
    const lines = content.split(/\r?\n/);
    const fullyAllowlisted = isFullyAllowlisted(posixFile);
    const commentOnlyReason = COMMENT_ONLY_ALLOWLIST.get(posixFile);
    const inInstructionSurface = isUnderAnyDir(posixFile, INSTRUCTION_SURFACE_DIRS);

    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      for (const { code, re } of CREDENTIAL_PATTERNS) {
        if (!re.test(line)) continue;
        if (fullyAllowlisted) continue;
        if (commentOnlyReason && isCommentLine(posixFile, line)) continue;
        findings.push({ code, file: posixFile, line: lineNumber, snippet: line.trim() });
      }
      if (inInstructionSurface && !fullyAllowlisted && BARE_NOTION_RE.test(line)) {
        findings.push({ code: "NOTION_INSTRUCTION_SURFACE", file: posixFile, line: lineNumber, snippet: line.trim() });
      }
    });
  }
  return findings;
}

/** Real tracked files via `git ls-files`, repo-root relative, forward-slash. */
export function listTrackedFiles(root) {
  const output = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
  return output.split("\n").filter(Boolean);
}

export function checkNoNotionRegression(root) {
  const files = listTrackedFiles(root).filter((file) => existsSync(resolve(root, file)));
  return { findings: scanFiles(root, files) };
}
