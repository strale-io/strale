/**
 * Repo-native readers for the daily-digest priorities (T6 M3 batch 2).
 *
 * Shadow mode only. Nothing here is wired into the digest email
 * (apps/api/src/lib/daily-digest/*) or any runtime path. It is compared,
 * report only, against the live Notion readers by scripts/digest-shadow.mjs
 * and the scheduled GitHub Actions workflow
 * .github/workflows/m3-digest-shadow.yml. Notion remains the authority
 * until the founder-gated M4 cutover.
 *
 * Why this exists: the production digest runs as the Railway
 * strale-digest-cron service, built from the API Docker image, which copies
 * only apps/api, packages/sdk-typescript, packages/mcp-server and
 * manifests. docs/decisions/records, handoff/ and archive/ do not exist at
 * runtime there, so a reader wired straight into gatherDigestData() would
 * read nothing and its shadow log would be silently hollow (see T6's
 * next_action in docs/programs/cto-readiness/tracks.yaml and
 * archive/sessions/2026-09-11-m3-remaining-scope-inventory.md, section 1b).
 * These are instead pure functions over a repository checkout, exercised
 * here and shadow-run by a scheduled workflow that has one.
 *
 * ── Mapping (no new convention; the repo-native source already exists) ──
 *
 * "Unreviewed decisions" in the live digest (Notion: Decisions DB rows with
 * Reviewed unchecked, apps/api/src/lib/daily-digest/fetch-notion.ts
 * fetchUnreviewedDecisions()) maps to docs/company/DECISION-QUEUE.md
 * entries whose status is `decided`. Per DECISION-QUEUE.md's own header,
 * quoting CHARTER.md's authority section: a `decided` entry is one where
 * "I made the call and did it. Listed so it is visible and can be
 * reversed, not so it can be approved." That is exactly what an
 * unreviewed-but-visible Decision is for.
 *
 * "Action required" in the live digest (Notion: Journal rows with Action
 * Required = yes, fetch-notion.ts fetchActionRequired()) maps to
 * DECISION-QUEUE.md entries whose status is `your_call`. Quoting the same
 * header: a `your_call` entry "genuinely needs Petter: money beyond the
 * weekly limit, anything that legally binds the company, one-way public
 * acts, pricing outside the existing band." and "Saying nothing is never a
 * yes." That is the repo-native shape of "needs a human decision now."
 *
 * Other DECISION-QUEUE.md statuses (`answered`, `resolved`) are neither: an
 * `answered` entry already has Petter's answer recorded, and `resolved`
 * likewise records a closed loop, so neither is still-open in the sense
 * the digest's two priority lists track.
 *
 * The Journal-shaped "ship log" content (fetch-shiplog.ts's
 * extractJournalEntries, { title, type, createdAt } per entry) has no
 * per-item structured analogue repo-side; the closest comparable content is
 * handoff/_general/from-code/*.md, whose date-prefixed file name and
 * "Intent: ..." first line are the repo-native equivalent of a Journal
 * entry's date and title. recentHandoffActivity() below reads that.
 *
 * What is not comparable: the digest shows only the last 24 hours of Journal
 * entries (fetch-shiplog.ts, isLast24h), while digest-shadow.mjs lists 14
 * days of handoff files (the window is a parameter of
 * recentHandoffActivity, so an M4 reader can match the digest's 24 hours).
 * Handoff files carry no `type` field. comparePriorities() therefore covers only the two priority
 * lists; the handoff activity is printed for inspection, never compared.
 *
 * ── Design note on parseDecisionQueue's grammar ──
 *
 * The real DECISION-QUEUE.md contains one line that starts with `**DQ-`
 * but does not have the backtick-status shape the rest of the file uses:
 *
 *   **DQ-5** · closed 2026-08-15 -- filed here by mistake. It was a task,
 *   not a decision.
 *
 * (dash written out here to keep this file free of the character itself).
 * The file's own prose says this row is not a decision-queue entry at all.
 * Because the grammar this parser implements is defined by the backtick
 * around <status> (`**DQ-<n>** ·` \`<status>\` `· owner <who> · ...`),
 * a line lacking that backtick immediately after the id is not "of the
 * form" in the first place -- it never reaches the parse-or-throw path
 * below, so it is neither parsed nor thrown on. A line that DOES have the
 * backtick-status shape but fails to parse further (missing "owner", no
 * date, unknown status) still throws, by name, exactly as specified. This
 * is what lets the real-repo test parse the live file without error while
 * a genuinely malformed entry-shaped line still fails loud.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { repoRootFrom } from "./program-tracks-lib.mjs";

export { repoRootFrom };

export const DECISION_QUEUE_PATH = "docs/company/DECISION-QUEUE.md";
export const HANDOFF_DIR = "handoff/_general/from-code";

export const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/** Statuses DECISION-QUEUE.md entries carry today. Anything else is an error. */
export const KNOWN_STATUSES = new Set(["decided", "your_call", "answered", "resolved"]);

/** A candidate entry line: id, middle dot, opening backtick. Anything that
 * starts with `**DQ-<n>**` but does not have this shape (DQ-5, see header)
 * is not an attempted entry and is left alone rather than thrown on. */
const CANDIDATE_ID_RE = /^\*\*(DQ-\d+)\*\* · `/;

/** The full entry-line grammar: id, backtick status, "owner <who> · <rest>". */
const FULL_LINE_RE = /^\*\*(DQ-\d+)\*\* · `([^`]*)` · owner (.+)$/;

/** Splits "owner <who> · <date text>[-- **title**]" at the first middle dot
 * after the owner name (non-greedy, so an owner name itself never absorbs
 * the split point). */
const OWNER_SPLIT_RE = /^(.+?) · (.*)$/;

/** Trailing " <dash> **title**" at the very end of the date-text-and-title
 * remainder. Built from a backslash-u-2014 escape rather than the literal
 * character, so this file contains no em dash glyph of its own; it still
 * matches the real one at runtime. */
const TITLE_RE = new RegExp("^(.*?)\\s\\u2014\\s\\*\\*(.+)\\*\\*$");

const DATE_RE = /\d{4}-\d{2}-\d{2}/;

/**
 * Parses every DECISION-QUEUE.md entry line into
 * { id, status, owner, date, title, line }.
 *
 * Ids are not unique in the file (DQ-20 and DQ-21 each appear twice, once
 * per status change), so never key results by id alone -- callers that need
 * to tell entries apart keep `line`, which is unique per parsed row.
 *
 * Throws (naming the offending line) on:
 *   - a candidate entry line (backtick-status shape) that does not match
 *     the full grammar (no "owner", or the owner clause has no further
 *     " · <date text>" after it)
 *   - a candidate entry line whose status is not in KNOWN_STATUSES
 *   - a candidate entry line whose date text contains no YYYY-MM-DD date
 *
 * Never throws on a line that does not have the backtick-status shape in
 * the first place (see the header's design note) -- it is simply not an
 * entry line under this grammar.
 */
export function parseDecisionQueue(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!CANDIDATE_ID_RE.test(line)) continue;

    const full = line.match(FULL_LINE_RE);
    if (!full) {
      throw new Error(`digest-repo-native-lib: unparseable decision queue entry line: ${line}`);
    }
    const [, id, status, ownerAndRest] = full;

    if (!KNOWN_STATUSES.has(status)) {
      throw new Error(`digest-repo-native-lib: unknown decision queue status "${status}" in line: ${line}`);
    }

    const ownerSplit = ownerAndRest.match(OWNER_SPLIT_RE);
    if (!ownerSplit) {
      throw new Error(`digest-repo-native-lib: unparseable decision queue entry line (no date text after owner): ${line}`);
    }
    const [, owner, dateTextAndTitle] = ownerSplit;

    let dateText = dateTextAndTitle;
    let title = null;
    const titleMatch = dateTextAndTitle.match(TITLE_RE);
    if (titleMatch) {
      dateText = titleMatch[1];
      title = titleMatch[2];
    }

    if (title === null) {
      for (let j = i + 1; j < lines.length; j++) {
        const candidate = lines[j].trim();
        if (candidate.length > 0) {
          title = candidate;
          break;
        }
      }
    }

    const dateMatch = dateText.match(DATE_RE);
    if (!dateMatch) {
      throw new Error(`digest-repo-native-lib: unparseable decision queue entry line (no date found): ${line}`);
    }

    entries.push({ id, status, owner, date: dateMatch[0], title: title ?? "", line });
  }

  return entries;
}

function sortByDateDesc(a, b) {
  if (a.date < b.date) return 1;
  if (a.date > b.date) return -1;
  return 0;
}

/**
 * Repo-native equivalent of fetch-notion.ts's getPriorities(): same
 * Priorities shape ({ unreviewedDecisions, olderUnreviewedCount,
 * actionRequired, olderActionRequiredCount }), same 14-day cutoff rule,
 * built from DECISION-QUEUE.md's `decided` and `your_call` entries instead
 * of Notion's Decisions DB and Journal DB.
 */
export function repoNativePriorities(root, { now = new Date() } = {}) {
  const text = readFileSync(resolve(root, DECISION_QUEUE_PATH), "utf8");
  const entries = parseDecisionQueue(text);
  const cutoff = new Date(now.getTime() - FOURTEEN_DAYS_MS);

  const decided = entries.filter((e) => e.status === "decided");
  const yourCall = entries.filter((e) => e.status === "your_call");

  const recentDecided = decided.filter((e) => new Date(e.date) >= cutoff).sort(sortByDateDesc);
  const olderDecided = decided.filter((e) => new Date(e.date) < cutoff);
  const recentYourCall = yourCall.filter((e) => new Date(e.date) >= cutoff).sort(sortByDateDesc);
  const olderYourCall = yourCall.filter((e) => new Date(e.date) < cutoff);

  return {
    unreviewedDecisions: recentDecided.map((e) => ({ id: e.id, title: e.title, date: e.date })),
    olderUnreviewedCount: olderDecided.length,
    actionRequired: recentYourCall.map((e) => ({ title: e.title, createdAt: e.date })),
    olderActionRequiredCount: olderYourCall.length,
  };
}

/**
 * The Journal-shaped repo-native content: handoff files under
 * handoff/_general/from-code/ whose file name starts with a date inside
 * the [now - days, now] window, each with its date, file name and its
 * "Intent: ..." first-matching line if present. Comparable to
 * fetch-shiplog.ts's extractJournalEntries({ title, type, createdAt }) --
 * a handoff file's date is the entry's createdAt, and its Intent line is
 * the closest repo-native analogue of a Journal entry's title; there is no
 * repo-native analogue of the Journal DB's Type field, so it is omitted
 * rather than guessed.
 *
 * Returns [] (not a throw) when the directory does not exist, matching the
 * shadow-mode discipline of degrading quietly rather than failing the
 * comparison.
 */
export function recentHandoffActivity(root, { now = new Date(), days = 14 } = {}) {
  const dir = resolve(root, HANDOFF_DIR);
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  let filenames;
  try {
    filenames = readdirSync(dir);
  } catch {
    return [];
  }

  const results = [];
  for (const filename of filenames) {
    const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;
    const fileDate = new Date(dateMatch[1]);
    if (Number.isNaN(fileDate.getTime())) continue;
    if (fileDate < cutoff || fileDate > now) continue;

    let intent = null;
    try {
      const content = readFileSync(join(dir, filename), "utf8");
      const intentMatch = content.match(/^Intent:\s*(.+)$/m);
      if (intentMatch) intent = intentMatch[1].trim();
    } catch {
      // File listed but unreadable: still report its name and date.
    }

    results.push({ date: dateMatch[1], file: filename, intent });
  }

  return results.sort(sortByDateDesc);
}

function normalizeTitle(title) {
  return (title ?? "").trim().toLowerCase();
}

function compareList(repoList, notionList) {
  const repoTitles = new Set(repoList.map((e) => normalizeTitle(e.title)));
  const notionTitles = new Set(notionList.map((e) => normalizeTitle(e.title)));
  return {
    repoCount: repoList.length,
    notionCount: notionList.length,
    repoOnly: repoList.filter((e) => !notionTitles.has(normalizeTitle(e.title))).map((e) => e.title),
    notionOnly: notionList.filter((e) => !repoTitles.has(normalizeTitle(e.title))).map((e) => e.title),
  };
}

/**
 * Counts and titles side by side between the repo-native Priorities and the
 * live Notion Priorities (same shape, from fetch-notion.ts's
 * getPriorities()), and which titles appear on only one side, matched
 * case-insensitively after trimming. Report data only -- no verdict, no
 * exit code, nothing that decides which side is right.
 */
export function comparePriorities(repo, notion) {
  return {
    unreviewedDecisions: compareList(repo.unreviewedDecisions, notion.unreviewedDecisions),
    actionRequired: compareList(repo.actionRequired, notion.actionRequired),
  };
}
