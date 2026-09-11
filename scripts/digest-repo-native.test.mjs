// Tests for the repo-native digest priority readers (T6 M3 batch 2,
// scripts/digest-repo-native-lib.mjs, scripts/digest-shadow.mjs,
// .github/workflows/m3-digest-shadow.yml). Every failure mode is planted
// in its own throwaway directory fixture and must fail there; the fixed
// counterpart must pass. Shadow mode: none of this changes what the
// production digest reads or renders.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  parseDecisionQueue,
  repoNativePriorities,
  recentHandoffActivity,
  comparePriorities,
  repoRootFrom,
  DECISION_QUEUE_PATH,
  HANDOFF_DIR,
} from "./digest-repo-native-lib.mjs";

const realRoot = repoRootFrom(import.meta.url);

// The real DECISION-QUEUE.md separates date text from a bold title with an
// em dash. Built here from a backslash-u-2014 escape, never typed as a
// literal character, so this test file (which quotes that shape in its
// fixtures) contains no em dash glyph of its own.
const EM = "\u2014";

function writeFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const absolute = join(dir, rel);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

function makeFixture() {
  return mkdtempSync(join(tmpdir(), "digest-repo-native-"));
}

// ── parseDecisionQueue: every entry shape in the real file ─────────────────

test("parseDecisionQueue: title present, raised+answered dates, owner with arrow", () => {
  const text = [
    "**DQ-30** · `answered` · owner Petter · raised 2026-09-02T22:15Z · answered 2026-09-03 " + EM + " **keep all five dormant vendor keys**",
    "*Answered:* body text follows.",
  ].join("\n");
  const entries = parseDecisionQueue(text);
  assert.equal(entries.length, 1);
  assert.deepEqual(
    { id: entries[0].id, status: entries[0].status, owner: entries[0].owner, date: entries[0].date, title: entries[0].title },
    { id: "DQ-30", status: "answered", owner: "Petter", date: "2026-09-02", title: "keep all five dormant vendor keys" },
  );
});

test("parseDecisionQueue: owner with an arrow (owner changed hands)", () => {
  const text = "**DQ-29** · `resolved` · owner Petter → Claude · raised 2026-09-02T07:10Z · resolved 2026-09-02T21:30Z " + EM + " **two credential files were deleted**";
  const entries = parseDecisionQueue(text);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].owner, "Petter → Claude");
  assert.equal(entries[0].date, "2026-09-02");
  assert.equal(entries[0].title, "two credential files were deleted");
});

test("parseDecisionQueue: your_call with 'no deadline' instead of a second date, title present", () => {
  const text = "**DQ-27** · `your_call` · owner Petter · raised 2026-08-30T07:00Z · no deadline " + EM + " **two settled production settings**";
  const entries = parseDecisionQueue(text);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].status, "your_call");
  assert.equal(entries[0].date, "2026-08-30");
  assert.equal(entries[0].title, "two settled production settings");
});

test("parseDecisionQueue: no bold title -- falls back to the next non-empty line", () => {
  const text = [
    "**DQ-14** · `your_call` · owner Petter · raised 2026-08-18T07:00Z · no deadline",
    "",
    "Four small things only you can do. None of them block anything today.",
  ].join("\n");
  const entries = parseDecisionQueue(text);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, "Four small things only you can do. None of them block anything today.");
});

test("parseDecisionQueue: plain date directly after owner (no 'raised'), title present", () => {
  const text = "**DQ-10** · `decided` · owner Claude · 2026-08-16 " + EM + " **a correction, not a reversal**";
  const entries = parseDecisionQueue(text);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].date, "2026-08-16");
  assert.equal(entries[0].title, "a correction, not a reversal");
});

test("parseDecisionQueue: plain date, no title -- falls back to next non-empty line", () => {
  const text = [
    "**DQ-26** · `decided` · owner Claude · 2026-08-25",
    "Our quality system no longer assumes a failed call is our fault.",
  ].join("\n");
  const entries = parseDecisionQueue(text);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, "Our quality system no longer assumes a failed call is our fault.");
});

test("parseDecisionQueue: unusual date-text prose still yields the first YYYY-MM-DD", () => {
  const text = [
    "**DQ-9** · `answered` · owner Petter · asked 2026-08-16, answered same day",
    "Do we describe Strale as an SEO/growth layer for agents? **Petter: no.**",
  ].join("\n");
  const entries = parseDecisionQueue(text);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].date, "2026-08-16");
});

test("parseDecisionQueue: duplicated ids are kept as separate entries, distinguished by line", () => {
  const text = [
    "**DQ-21** · `answered` · owner Petter · raised 2026-08-27 · answered 2026-08-28 " + EM + " **we do not contact the card-paying customer**",
    "**DQ-21** · `decided` · owner Claude · 2026-08-23",
    "Agents that asked for a paid service by describing it were getting an error page instead of a price.",
  ].join("\n");
  const entries = parseDecisionQueue(text);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].id, "DQ-21");
  assert.equal(entries[1].id, "DQ-21");
  assert.notEqual(entries[0].status, entries[1].status);
  assert.notEqual(entries[0].line, entries[1].line);
});

test("parseDecisionQueue: a line starting **DQ- without the backtick-status shape is left unparsed, not thrown on", () => {
  const text = "**DQ-5** · closed 2026-08-15 " + EM + " filed here by mistake. It was a task, not a decision.";
  const entries = parseDecisionQueue(text);
  assert.equal(entries.length, 0);
});

// ── parseDecisionQueue: error paths ─────────────────────────────────────────

test("parseDecisionQueue: throws naming the line when a backtick-status entry has no owner clause", () => {
  const text = "**DQ-99** · `decided` · someone forgot the owner keyword";
  assert.throws(() => parseDecisionQueue(text), /DQ-99/);
});

test("parseDecisionQueue: throws naming the line when the owner clause has no further date text", () => {
  const text = "**DQ-98** · `decided` · owner Claude";
  assert.throws(() => parseDecisionQueue(text), /DQ-98/);
});

test("parseDecisionQueue: throws on an unknown status", () => {
  const text = "**DQ-97** · `sideways` · owner Claude · 2026-08-01 " + EM + " **title**";
  assert.throws(() => parseDecisionQueue(text), /unknown decision queue status "sideways"/);
});

// ── repoNativePriorities: the 14-day split ──────────────────────────────────

test("repoNativePriorities: splits decided/your_call entries at the 14-day cutoff", () => {
  const dir = makeFixture();
  try {
    const text = [
      "**DQ-1** · `decided` · owner Claude · 2026-09-05 " + EM + " **recent decided**",
      "**DQ-2** · `decided` · owner Claude · 2026-08-20 " + EM + " **old decided**",
      "**DQ-3** · `your_call` · owner Petter · raised 2026-09-01 · no deadline " + EM + " **recent your_call**",
      "**DQ-4** · `your_call` · owner Petter · raised 2026-08-20 · no deadline " + EM + " **old your_call**",
      "**DQ-6** · `answered` · owner Petter · 2026-09-05 " + EM + " **not counted either way**",
    ].join("\n");
    writeFiles(dir, { [DECISION_QUEUE_PATH]: text });
    const now = new Date("2026-09-11T00:00:00Z");
    const priorities = repoNativePriorities(dir, { now });
    assert.equal(priorities.unreviewedDecisions.length, 1);
    assert.equal(priorities.unreviewedDecisions[0].title, "recent decided");
    assert.equal(priorities.olderUnreviewedCount, 1);
    assert.equal(priorities.actionRequired.length, 1);
    assert.equal(priorities.actionRequired[0].title, "recent your_call");
    assert.equal(priorities.olderActionRequiredCount, 1);
  } finally {
    cleanup(dir);
  }
});

// ── recentHandoffActivity: the window ───────────────────────────────────────

test("recentHandoffActivity: only files whose name starts with a date inside the window, with Intent when present", () => {
  const dir = makeFixture();
  try {
    writeFiles(dir, {
      [`${HANDOFF_DIR}/2026-09-10-inside-window.md`]: "Intent: do the thing.\n\nMore text.",
      [`${HANDOFF_DIR}/2026-08-01-outside-window.md`]: "Intent: too old to count.",
      [`${HANDOFF_DIR}/no-date-prefix.md`]: "Intent: never matched at all.",
      [`${HANDOFF_DIR}/2026-09-09-no-intent-line.md`]: "# Just a heading\n\nBody text, no Intent line.",
    });
    const now = new Date("2026-09-11T00:00:00Z");
    const activity = recentHandoffActivity(dir, { now, days: 14 });
    const byFile = Object.fromEntries(activity.map((a) => [a.file, a]));
    assert.equal(activity.length, 2);
    assert.equal(byFile["2026-09-10-inside-window.md"].intent, "do the thing.");
    assert.equal(byFile["2026-09-09-no-intent-line.md"].intent, null);
    assert.equal(byFile["2026-08-01-outside-window.md"], undefined);
    assert.equal(byFile["no-date-prefix.md"], undefined);
  } finally {
    cleanup(dir);
  }
});

test("recentHandoffActivity: returns [] rather than throwing when the directory does not exist", () => {
  const dir = makeFixture();
  try {
    const activity = recentHandoffActivity(dir, { now: new Date("2026-09-11") });
    assert.deepEqual(activity, []);
  } finally {
    cleanup(dir);
  }
});

// ── comparePriorities: data only, case-insensitive/trimmed title match ─────

test("comparePriorities: counts, and titles present on only one side, matched case-insensitively after trimming", () => {
  const repo = {
    unreviewedDecisions: [{ id: "DQ-1", title: "  Fix The Thing  ", date: "2026-09-05" }],
    actionRequired: [{ title: "needs a human", createdAt: "2026-09-05" }],
  };
  const notion = {
    unreviewedDecisions: [
      { id: "page1", title: "fix the thing", date: "2026-09-05" },
      { id: "page2", title: "notion-only decision", date: "2026-09-05" },
    ],
    actionRequired: [],
    olderUnreviewedCount: 0,
    olderActionRequiredCount: 0,
  };
  const comparison = comparePriorities(repo, notion);
  assert.equal(comparison.unreviewedDecisions.repoCount, 1);
  assert.equal(comparison.unreviewedDecisions.notionCount, 2);
  assert.deepEqual(comparison.unreviewedDecisions.repoOnly, []);
  assert.deepEqual(comparison.unreviewedDecisions.notionOnly, ["notion-only decision"]);
  assert.equal(comparison.actionRequired.repoCount, 1);
  assert.equal(comparison.actionRequired.notionCount, 0);
  assert.deepEqual(comparison.actionRequired.repoOnly, ["needs a human"]);
  assert.deepEqual(comparison.actionRequired.notionOnly, []);
});

// ── Reachability test (M3 change item 4) ────────────────────────────────────

test("m3-digest-shadow.yml has a schedule trigger, runs scripts/digest-shadow.mjs, and passes NOTION_API_KEY from a secret", () => {
  const path = join(realRoot, ".github/workflows/m3-digest-shadow.yml");
  const text = readFileSync(path, "utf8");
  const workflow = parseYaml(text);
  assert.ok(workflow.on && Object.prototype.hasOwnProperty.call(workflow.on, "schedule"), "expected a schedule trigger");
  assert.ok(Array.isArray(workflow.on.schedule) && workflow.on.schedule.length > 0, "expected at least one cron entry");
  assert.ok(Object.prototype.hasOwnProperty.call(workflow.on, "workflow_dispatch"), "expected workflow_dispatch too");
  assert.match(text, /scripts\/digest-shadow\.mjs/, "expected the workflow to run scripts/digest-shadow.mjs");
  assert.match(text, /NOTION_API_KEY:\s*\$\{\{\s*secrets\.NOTION_TOKEN\s*\}\}/, "expected NOTION_API_KEY sourced from secrets.NOTION_TOKEN");
});

// ── Real-repo test ───────────────────────────────────────────────────────────

test("parseDecisionQueue parses the live DECISION-QUEUE.md without error", () => {
  const text = readFileSync(join(realRoot, DECISION_QUEUE_PATH), "utf8");
  const entries = parseDecisionQueue(text);
  assert.ok(entries.length > 0, "expected at least one parsed entry from the live file");
  for (const e of entries) {
    assert.match(e.id, /^DQ-\d+$/);
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("repoNativePriorities runs against the live repository without error", () => {
  const priorities = repoNativePriorities(realRoot, { now: new Date() });
  assert.ok(Array.isArray(priorities.unreviewedDecisions));
  assert.ok(Array.isArray(priorities.actionRequired));
  assert.equal(typeof priorities.olderUnreviewedCount, "number");
  assert.equal(typeof priorities.olderActionRequiredCount, "number");
});

test("recentHandoffActivity runs against the live repository without error", () => {
  const activity = recentHandoffActivity(realRoot, { now: new Date(), days: 14 });
  assert.ok(Array.isArray(activity));
  for (const a of activity) {
    assert.match(a.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof a.file, "string");
  }
});
