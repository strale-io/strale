// Tests for the activated repo-native end-session and vendor-switch flows
// (M4 batch 4, T7). The design draft this batch activated
// (archive/sessions/2026-09-13-m4-b4-end-session-candidate-draft.md) has
// served its purpose; this file now asserts against the real, live
// instruction files, never a throwaway fixture, because this is a
// structural invariant about what the two tools actually follow:
//
//   1. Both live end-session files carry the repo-native steps (the
//      session-log front matter added to the handoff file, the active
//      track's next_action read from tracks.yaml, and the
//      DECISION-QUEUE.md / docs/decisions/records check), each with its
//      own tool's actor and owner values, asserted separately per file, not
//      as a shared value; neither carries a Notion Journal write or a
//      Notion To-do read.
//   2. Both live vendor-switch files carry the drafted Step 5
//      (docs/decisions/records/, config/vendors.yaml append-only history)
//      and neither carries a Notion Decisions DB step.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function repoRootFrom(importMetaUrl) {
  return resolve(dirname(fileURLToPath(importMetaUrl)), "..");
}

export const LIVE_CLAUDE_PATH = ".claude/commands/end-session.md";
export const LIVE_CODEX_PATH = ".agents/skills/source-command-end-session/SKILL.md";
export const VENDOR_CLAUDE_PATH = ".claude/skills/vendor-switch/SKILL.md";
export const VENDOR_CODEX_PATH = ".agents/skills/vendor-switch/SKILL.md";
export const ARCHIVED_DRAFT_PATH =
  "archive/sessions/2026-09-13-m4-b4-end-session-candidate-draft.md";

// The Notion identifiers the repo-native replacement retired. Their
// presence in a live file would mean the corresponding read or write is
// still wired to Notion rather than the repo-native register.
const NOTION_JOURNAL_COLLECTION = "collection://8f54383b-3227-42c2-bee4-77a091027f8f";
const NOTION_TODO_COLLECTION = "collection://33a67c87-082c-8033-8ac5-000ba9922392";
const NOTION_DECISIONS_DB_ID = "ea57671f-7167-44e4-a254-c0a1de79e7f9";

function readIfExists(root, rel) {
  try {
    return readFileSync(resolve(root, rel), "utf8");
  } catch {
    return null;
  }
}

const root = repoRootFrom(import.meta.url);

test("the design draft is archived, not left in docs/project/candidates/", () => {
  assert.equal(
    readIfExists(root, "docs/project/candidates/end-session.md"),
    null,
    "the draft must no longer live at docs/project/candidates/end-session.md",
  );
  assert.ok(
    readIfExists(root, ARCHIVED_DRAFT_PATH),
    `the draft must be archived at ${ARCHIVED_DRAFT_PATH}`,
  );
});

test("both live end-session files carry the repo-native session-log front matter step", () => {
  for (const rel of [LIVE_CLAUDE_PATH, LIVE_CODEX_PATH]) {
    const content = readIfExists(root, rel);
    assert.ok(content, `${rel} must exist`);
    assert.match(
      content,
      /title: "Session log/,
      `${rel} must add the session-log front-matter block to the handoff file`,
    );
    assert.match(
      content,
      /action_required: false/,
      `${rel} must carry the action_required front-matter field`,
    );
  }
});

test("both live end-session files read the active track's next_action instead of a Notion To-do query", () => {
  for (const rel of [LIVE_CLAUDE_PATH, LIVE_CODEX_PATH]) {
    const content = readIfExists(root, rel);
    assert.ok(content, `${rel} must exist`);
    assert.match(
      content,
      /docs\/programs\/\*\/tracks\.yaml/,
      `${rel} must read the active track's next_action in tracks.yaml`,
    );
  }
});

test("both live end-session files check DECISION-QUEUE.md and docs/decisions/records instead of the Notion Decisions DB", () => {
  for (const rel of [LIVE_CLAUDE_PATH, LIVE_CODEX_PATH]) {
    const content = readIfExists(root, rel);
    assert.ok(content, `${rel} must exist`);
    assert.match(
      content,
      /docs\/company\/DECISION-QUEUE\.md/,
      `${rel} must check docs/company/DECISION-QUEUE.md for unlogged decisions`,
    );
    assert.match(
      content,
      /docs\/decisions\/records\//,
      `${rel} must check docs/decisions/records/ for a matching formal record`,
    );
  }
});

test("the Claude Code end-session file carries its own actor and owner values, not the Codex mirror's", () => {
  const content = readIfExists(root, LIVE_CLAUDE_PATH);
  assert.ok(content);
  assert.match(content, /actor: claude-code/, "must carry the claude-code actor value");
  assert.doesNotMatch(
    content,
    /actor: Codex/,
    "must not carry the Codex mirror's actor value",
  );
  assert.match(
    content,
    /owned by `Claude code`/,
    "must carry the Claude Code owner value",
  );
  assert.doesNotMatch(
    content,
    /owned by `Codex`/,
    "must not carry the Codex mirror's owner value",
  );
});

test("the Codex end-session file carries its own actor and owner values, not the Claude Code mirror's", () => {
  const content = readIfExists(root, LIVE_CODEX_PATH);
  assert.ok(content);
  assert.match(content, /actor: Codex/, "must carry the Codex actor value");
  assert.doesNotMatch(
    content,
    /actor: claude-code/,
    "must not carry the Claude Code mirror's actor value",
  );
  assert.match(content, /owned by `Codex`/, "must carry the Codex owner value");
  assert.doesNotMatch(
    content,
    /owned by `Claude code`/,
    "must not carry the Claude Code mirror's owner value",
  );
});

test("neither live end-session file writes to the Notion Journal or reads the Notion To-do DB", () => {
  for (const rel of [LIVE_CLAUDE_PATH, LIVE_CODEX_PATH]) {
    const content = readIfExists(root, rel);
    assert.ok(content, `${rel} must exist`);
    assert.doesNotMatch(
      content,
      new RegExp(NOTION_JOURNAL_COLLECTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `${rel} must not write to the Notion Journal collection`,
    );
    assert.doesNotMatch(
      content,
      new RegExp(NOTION_TODO_COLLECTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `${rel} must not read the Notion To-do DB collection`,
    );
    assert.doesNotMatch(
      content,
      /Create a session-log entry in the Journal data source/,
      `${rel} must not still create a Notion Journal entry`,
    );
    assert.doesNotMatch(
      content,
      /Query the To-do DB/,
      `${rel} must not still query the Notion To-do DB`,
    );
  }
});

test("both live vendor-switch files carry the drafted Step 5 (docs/decisions/records, append-only vendors.yaml history)", () => {
  for (const rel of [VENDOR_CLAUDE_PATH, VENDOR_CODEX_PATH]) {
    const content = readIfExists(root, rel);
    assert.ok(content, `${rel} must exist`);
    assert.match(
      content,
      /docs\/decisions\/records\//,
      `${rel} Step 5 must point at docs/decisions/records/`,
    );
    assert.match(
      content,
      /DEC-YYYYMMDD-<suffix>\.md/,
      `${rel} Step 5 must name the decision-record filename shape`,
    );
    assert.match(
      content,
      /append-only/,
      `${rel} Step 5 must state the config\\/vendors.yaml history is append-only`,
    );
  }
});

test("neither live vendor-switch file's Step 5 still logs to the Notion Decisions DB", () => {
  for (const rel of [VENDOR_CLAUDE_PATH, VENDOR_CODEX_PATH]) {
    const content = readIfExists(root, rel);
    assert.ok(content, `${rel} must exist`);
    assert.doesNotMatch(
      content,
      new RegExp(NOTION_DECISIONS_DB_ID),
      `${rel} Step 5 must not reference the Notion Decisions DB id`,
    );
    assert.doesNotMatch(
      content,
      /Vendor switches always need a DEC entry in Notion/,
      `${rel} Step 5 must not still ask for a Notion DEC entry`,
    );
  }
});

test("both live vendor-switch files' Step 5 are verbatim-identical (this replacement carries no per-tool split)", () => {
  const claudeContent = readIfExists(root, VENDOR_CLAUDE_PATH);
  const codexContent = readIfExists(root, VENDOR_CODEX_PATH);
  assert.ok(claudeContent);
  assert.ok(codexContent);

  const extractStep5 = (content) => {
    const match = /## Step 5 - Log the decision[\s\S]*?(?=\n## Step 6)/.exec(content);
    assert.ok(match, "Step 5 section must be present");
    return match[0];
  };

  assert.equal(
    extractStep5(claudeContent),
    extractStep5(codexContent),
    "the drafted Step 5 text has no per-tool identity field, so both mirrors must carry it verbatim",
  );
});
