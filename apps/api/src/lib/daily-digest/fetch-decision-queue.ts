/**
 * Repo-native replacement for the digest's Priorities reader (M4 batch 5).
 *
 * Ports scripts/digest-repo-native-lib.mjs's parseDecisionQueue() and
 * repoNativePriorities() into apps/api/src, because the production digest
 * job runs from the built Docker image, which does not carry `scripts/`.
 * The mapping and the grammar are unchanged from the shadow-mode version
 * that was already tested against the live file (scripts/digest-repo-native.test.mjs);
 * only the runtime location moved.
 *
 * "Unreviewed decisions" in the old Notion-backed digest (Decisions DB rows
 * with Reviewed unchecked) maps to docs/company/DECISION-QUEUE.md entries
 * whose status is `decided`. "Action required" (Journal rows with Action
 * Required = yes) maps to entries whose status is `your_call`. See
 * docs/company/DECISION-QUEUE.md's own header for what each status means.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Priorities } from "./types.js";

export const REPO_ROOT = resolve(import.meta.dirname, "../../../../..");
export const DECISION_QUEUE_PATH = "docs/company/DECISION-QUEUE.md";

export const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/** Statuses DECISION-QUEUE.md entries carry today. Anything else is an error. */
export const KNOWN_STATUSES = new Set(["decided", "your_call", "answered", "resolved"]);

/** A candidate entry line: id, middle dot, opening backtick. A line that
 * starts with `**DQ-<n>**` but does not have this shape is not an attempted
 * entry and is left alone rather than thrown on. */
const CANDIDATE_ID_RE = /^\*\*(DQ-\d+)\*\* · `/;

/** The full entry-line grammar: id, backtick status, "owner <who> · <rest>". */
const FULL_LINE_RE = /^\*\*(DQ-\d+)\*\* · `([^`]*)` · owner (.+)$/;

/** Splits "owner <who> · <date text>[-- **title**]" at the first middle dot
 * after the owner name. */
const OWNER_SPLIT_RE = /^(.+?) · (.*)$/;

/** Trailing " <dash> **title**" at the very end of the date-text-and-title
 * remainder. Built from a backslash-u-2014 escape, not the literal
 * character, so this file contains no em dash glyph of its own. */
const TITLE_RE = new RegExp("^(.*?)\\s\\u2014\\s\\*\\*(.+)\\*\\*$");

const DATE_RE = /\d{4}-\d{2}-\d{2}/;

export interface DecisionQueueEntry {
  id: string;
  status: string;
  owner: string;
  date: string;
  title: string;
  line: string;
}

/**
 * Parses every DECISION-QUEUE.md entry line into a DecisionQueueEntry.
 *
 * Ids are not unique in the file (a status change re-adds the same id), so
 * never key results by id alone.
 *
 * Throws (naming the offending line) on a candidate entry line (backtick-status
 * shape) that does not match the full grammar, has an unknown status, or has
 * date text with no YYYY-MM-DD date. Never throws on a line lacking the
 * backtick-status shape in the first place.
 */
export function parseDecisionQueue(text: string): DecisionQueueEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: DecisionQueueEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!CANDIDATE_ID_RE.test(line)) continue;

    const full = line.match(FULL_LINE_RE);
    if (!full) {
      throw new Error(`fetch-decision-queue: unparseable decision queue entry line: ${line}`);
    }
    const [, id, status, ownerAndRest] = full;

    if (!KNOWN_STATUSES.has(status)) {
      throw new Error(`fetch-decision-queue: unknown decision queue status "${status}" in line: ${line}`);
    }

    const ownerSplit = ownerAndRest.match(OWNER_SPLIT_RE);
    if (!ownerSplit) {
      throw new Error(`fetch-decision-queue: unparseable decision queue entry line (no date text after owner): ${line}`);
    }
    const [, owner, dateTextAndTitle] = ownerSplit;

    let dateText = dateTextAndTitle;
    let title: string | null = null;
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
      throw new Error(`fetch-decision-queue: unparseable decision queue entry line (no date found): ${line}`);
    }

    entries.push({ id, status, owner, date: dateMatch[0], title: title ?? "", line });
  }

  return entries;
}

function sortByDateDesc(a: { date: string }, b: { date: string }): number {
  if (a.date < b.date) return 1;
  if (a.date > b.date) return -1;
  return 0;
}

/**
 * Repo-native replacement for fetch-notion.ts's getPriorities(): same
 * Priorities shape, same 14-day cutoff rule, built from DECISION-QUEUE.md's
 * `decided` and `your_call` entries instead of Notion's Decisions DB and
 * Journal DB.
 */
export function getPriorities(root: string = REPO_ROOT, { now = new Date() }: { now?: Date } = {}): Priorities {
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
