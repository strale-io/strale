/**
 * Notion anti-regression check (M4 batch 7 part one; migration plan M6
 * fixture 4: "Reintroducing NOTION_API_KEY, NOTION_TOKEN, api.notion.com,
 * or an active Notion MCP call outside archives fails CI").
 *
 * Threat model, stated plainly (M4 batch 7 review round fix): this check
 * catches an accidental or forgetful reintroduction of Notion access --
 * a session re-adding a credential read, an API call, or an instruction
 * step out of habit or an old copy-paste, which is the realistic failure
 * mode after a cutover. It does NOT resist deliberate concealment. A
 * determined author can defeat every pattern below by assembling the
 * credential name at runtime instead of writing it as a literal: string
 * concatenation (`"NOTION_" + "TOKEN"`), a joined character array
 * (`["N","O","T","I","O","N","_","T","O","K","E","N"].join("")`), or a
 * decoded encoding (base64, hex, rot13) of the same string. A static
 * source scan cannot see through any of these, and pretending otherwise
 * would be worse than saying so plainly: the control for a deliberately
 * concealed reintroduction is the reviewed pull request, not this scan.
 *
 * The M4 cutover removed every active Notion consumer named in
 * archive/sessions/2026-09-11-m4-cutover-inventory.md section 1: the daily
 * digest's three readers, the vendor-roster drift check, the vendor-switch
 * skill's decision-logging step, and the end-session command's Journal
 * write and to-do read. This check exists so a future session cannot
 * silently reintroduce one of those reads: it scans every tracked file for
 * the five signal patterns that mean a real credential, API call, or tool
 * reference (never a citation URL such as notion.so, which a human reads,
 * not code) -- NOTION_API_KEY, NOTION_TOKEN, api.notion.com or
 * www.notion.so/api/ (Notion's public and private API hosts), @notionhq,
 * and an MCP tool name containing "notion" -- plus, since a reintroduction
 * most plausibly happens by an agent re-adding an instruction step, a bare
 * case-insensitive "notion" scan restricted to the two live instruction
 * surfaces (.claude/, .agents/) an agent actually reads at runtime.
 *
 * False positives are the hazard (this file's own header comment would
 * otherwise trip the check it defines), so every exemption is named
 * explicitly by path -- never a broad pattern -- in three ways:
 *
 * - FULL_FILE_ALLOWLIST: a directory prefix or exact path where the whole
 *   file is permanently historical (archive/, the write-once
 *   handoff/_general/from-code/ subtree, decision records) or a stable,
 *   named document explaining the migration itself. Every match anywhere
 *   in these paths is exempt. A directory entry here must cover ONLY
 *   historical content -- handoff/ itself is not this shape: its
 *   handoff/_general/from-chat/ subtree is a live instruction surface
 *   (CLAUDE.md's Quick and Full session checklists both tell every
 *   session to read handoff/from-chat/ for pending items, specs or
 *   feedback), so only the from-code/ subtree is listed, never the
 *   handoff/ prefix itself. apps/api/railway-config.md was
 *   removed from this list in the same fix (see the comment at its former
 *   entry, below): it is operational prose a person reads and follows, not
 *   a document explaining the migration, and no other checker reads that
 *   prose, so a blanket exemption there was a hole, not a convenience.
 * - COMMENT_ONLY_ALLOWLIST: an exact path where the file is still live code
 *   or a live workflow, and a match is exempt only when the matched line is
 *   a comment for that file's language. A genuine new read added to the
 *   same file on a non-comment line still fires -- an allowlisted file is
 *   never a blanket exemption for the file, only for its existing
 *   commentary. See no-notion-regression.test.mjs's blanket-exemption test.
 * - PROSE_HISTORICAL_MARKER: a narrow, explicit, visible inline annotation
 *   (`notion-regression-allow: historical`) that lets an honest prose edit
 *   explain that Notion is no longer used, in ANY file, without a
 *   file-wide allowlist entry. It suppresses ONLY the instruction-surface
 *   bare-word finding (NOTION_INSTRUCTION_SURFACE) -- never a
 *   CREDENTIAL_PATTERNS match. That scope is deliberate: the five
 *   credential/API/tool patterns are the actual reintroduction signal, and
 *   no honest explanation of Notion's absence ever needs to write a real
 *   credential name, host, import, or MCP tool reference to make its
 *   point, so the marker structurally cannot be used to wave through a
 *   real reintroduction. See the "prose marker" tests below for both
 *   directions.
 *
 * Every other legitimate mention this batch found was reworded instead of
 * allowlisted (CLAUDE.md's "prefer rewording... every allowlist entry is a
 * hole"): the session-end command's and its Codex mirror's historical
 * "Notion Journal entry"/"Notion To-do DB query" prose, and the
 * scheduled-reachability library's docstring and test fixtures (which used
 * NOTION_API_KEY/NOTION_TOKEN only as example env-var names, not a real
 * dependency) all now read without the word "Notion" or the literal
 * credential names, so they need no allowlist entry at all. The
 * vendor-switch skill's DPA/sub-processor pointer (both the .claude/ and
 * .agents/ copies) was restored to an accurate instruction the same way:
 * it names the gap and cites the inventory section that records it without
 * needing the literal word "Notion", so it also needs no allowlist entry.
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
 * material this repository's own conventions already treat as write-once.
 * Every entry here must be genuinely historical top to bottom -- a
 * directory that mixes historical content with a live instruction surface
 * does not belong here (that was handoff/'s mistake before this fix: see
 * handoff/_general/from-code/ below and the COMMENT_ONLY_ALLOWLIST-style
 * reasoning in the module docstring). */
export const FULL_FILE_ALLOWLIST_DIRS = [
  "archive/",
  // NOT "handoff/": handoff/_general/from-chat/ is a live instruction
  // surface (CLAUDE.md's session contract reads it for pending items,
  // specs and feedback every session), so only the write-once
  // from-code/ subtree -- past sessions' own record of what they did --
  // is listed. A read planted in handoff/_general/from-chat/ must fire.
  "handoff/_general/from-code/",
  "docs/decisions/records/",
];

/** Exact repo-relative paths where every match is exempt everywhere in the
 * file: stable, named documents explaining the migration itself, or a
 * static/generated index whose content is itself drawn only from an
 * already-exempt historical subtree. */
export const FULL_FILE_ALLOWLIST_FILES = new Set([
  "docs/programs/cto-readiness/tracks.yaml",
  "docs/strategy/2026-08-31-repo-native-operating-model-migration.md",
  "docs/strategy/2026-08-31-notion-consumer-migration-inventory.md",
  "docs/operations/distribution-registry.md",
  "apps/api/docs/drift-check-refactor-proposal.md",
  // Both files are regenerated by `npm run archive:index` (checked by
  // `-- --check`) from the handoff/_general/from-code/ and
  // handoff/_general/from-chat/ file list's own recorded intents, plus a
  // static relocation note. A from-chat file's content is scanned
  // directly (it is not in FULL_FILE_ALLOWLIST_DIRS), so if one ever
  // carried a real signal it would already fail before this index is
  // regenerated from it. Historical from-code intents are allowed to
  // narrate a real historical NOTION_* name, same as the from-code files
  // themselves.
  "handoff/README.md",
  "handoff/_general/README.md",
  // This check's own test suite deliberately plants every signal pattern
  // as fixture data (string literals, not comments) to prove the check
  // fires on each one -- excluding a scanner's own test fixtures from its
  // own results is the standard shape for this kind of self-referential
  // check.
  "scripts/no-notion-regression.test.mjs",
  // This check's own library necessarily writes out the literal pattern
  // strings it detects (its docstring, the CREDENTIAL_PATTERNS regexes,
  // and the COMMENT_ONLY_ALLOWLIST reason strings quoting the file they
  // describe) -- a scanner always names what it scans for.
  "scripts/no-notion-regression-lib.mjs",
]);
// apps/api/railway-config.md was REMOVED from this set in the M4 batch 7
// review round fix. It was previously justified by a comment claiming its
// "live-relevant fields (secrets/env wiring) are independently enforced by
// another checker" -- that was false: env:check and scheduled:check both
// scan environment reads in application code, and neither reads this
// file's operational prose telling a person which Railway variable to
// set. The file is not purely historical (it is a living runbook for
// configuring production services) and it carried a stale instruction
// naming a retired token (`NOTION_TOKEN` for "ship-log / Notion
// activity") that the digest code had already stopped reading before this
// batch. The line was corrected (see the file itself) rather than
// re-allowlisted, so the file now carries no signal pattern and needs no
// exemption; a future re-added Notion instruction there will fail like
// any other live document.

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
 * reference -- never a bare notion.so citation URL (a page URL a human
 * reads, e.g. https://www.notion.so/<page-id> or the app.notion.com
 * equivalent), which is how comments throughout this repository cite a
 * Notion page as provenance for a past decision (see e.g.
 * apps/api/src/lib/platform-facts.ts's own header) and is not itself a
 * live consumer. All five are case-insensitive: a credential, host,
 * import, or tool name reads the same whether or not someone typed it in
 * a different case, so a lowercase or mixed-case spelling must fire the
 * same as the canonical spelling. (Before the M4 batch 7 review round
 * fix, the two environment-variable patterns lacked the flag the other
 * three already carried -- a planted lowercase `notion_token` passed.) */
export const CREDENTIAL_PATTERNS = [
  { code: "NOTION_API_KEY", re: /NOTION_API_KEY/i },
  { code: "NOTION_TOKEN", re: /NOTION_TOKEN/i },
  // api.notion.com is Notion's public API; www.notion.so/api/ (with or
  // without the www.) is Notion's own private API surface used by the
  // Notion web client itself -- both are a live API host, never a page
  // citation URL, which never carries an /api/ path segment.
  { code: "NOTION_API_URL", re: /(?:api\.notion\.com|notion\.so\/api\/)/i },
  { code: "NOTION_SDK_IMPORT", re: /@notionhq/i },
  { code: "NOTION_MCP_TOOL", re: /mcp__[^\s'"`)]*notion[^\s'"`)]*/i },
];

/** A narrow, explicit, visible inline annotation that lets an honest prose
 * edit say Notion is no longer used, without a file-wide allowlist entry.
 * Scope is deliberately narrow: it suppresses ONLY the
 * NOTION_INSTRUCTION_SURFACE bare-word finding below, never a
 * CREDENTIAL_PATTERNS match. A real credential name, API host, SDK
 * import, or MCP tool reference is the actual reintroduction signal, and
 * no honest explanation of Notion's absence needs to write one of those
 * to make its point -- so the marker structurally cannot be used to wave
 * a real reintroduction through. */
export const PROSE_HISTORICAL_MARKER_RE = /notion-regression-allow:\s*historical\b/;

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
      if (
        inInstructionSurface &&
        !fullyAllowlisted &&
        BARE_NOTION_RE.test(line) &&
        !PROSE_HISTORICAL_MARKER_RE.test(line)
      ) {
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
