// Tests for the inactive project-document candidates under
// docs/project/candidates/ (T6 M3 batch 4: the /end-session repo-native
// draft). Checks three things against the real repository, never a
// throwaway fixture, because this is a structural invariant about the real
// live files:
//
//   1. docs/project/candidates/end-session.md exists, carries inactive
//      front matter (status: candidate, authority_active: false), and
//      carries an M4-draft caution block.
//   2. It names both tools' identities from its own per-tool table (the
//      Claude Code / Codex Actor values, kept exactly as the live files
//      write them, and the CLAUDE.md versus AGENTS.md entrypoint split), so a
//      future generator has both
//      identities to read from one text.
//   3. Neither live command file
//      (.claude/commands/end-session.md,
//      .agents/skills/source-command-end-session/SKILL.md) references
//      docs/project/candidates/ - a pointer in a live command is an
//      instruction the agent could follow, which is exactly what keeping
//      the draft in a separate candidate file is meant to prevent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

export function repoRootFrom(importMetaUrl) {
  return resolve(dirname(fileURLToPath(importMetaUrl)), "..");
}

export const CANDIDATE_PATH = "docs/project/candidates/end-session.md";
export const LIVE_CLAUDE_PATH = ".claude/commands/end-session.md";
export const LIVE_CODEX_PATH = ".agents/skills/source-command-end-session/SKILL.md";

/** Splits a Markdown file into its leading YAML front matter and body. */
export function splitFrontmatter(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(content);
  if (!match) return { frontmatter: null, body: content };
  return { frontmatter: parseYaml(match[1]), body: match[2] };
}

function readIfExists(root, rel) {
  try {
    return readFileSync(resolve(root, rel), "utf8");
  } catch {
    return null;
  }
}

const root = repoRootFrom(import.meta.url);

test("candidate file exists with inactive front matter and an M4 caution block", () => {
  const content = readIfExists(root, CANDIDATE_PATH);
  assert.ok(content, `${CANDIDATE_PATH} must exist`);

  const { frontmatter, body } = splitFrontmatter(content);
  assert.ok(frontmatter, `${CANDIDATE_PATH} must carry YAML front matter`);
  assert.equal(frontmatter.status, "candidate", "front matter status must be 'candidate'");
  assert.equal(frontmatter.authority_active, false, "front matter authority_active must be false");
  assert.equal(frontmatter.complete, false, "front matter complete must be false");

  assert.match(body, /\[!CAUTION\]/, "body must carry a [!CAUTION] callout");
  assert.match(
    body,
    /M4 DRAFT/i,
    "the caution block must say this is an M4 draft",
  );
  assert.match(
    body,
    /no session follows this today/i,
    "the caution block must say no session follows the draft today",
  );
});

test("candidate file names both tools' identities from its per-tool table", () => {
  const content = readIfExists(root, CANDIDATE_PATH);
  assert.ok(content);

  // Journal/handoff Actor values.
  assert.match(content, /claude-code/, "must name the Claude Code actor value");
  assert.match(content, /Codex/, "must name the Codex actor value");

  // Root entrypoint naming split.
  assert.match(content, /CLAUDE\.md/, "must name CLAUDE.md");
  assert.match(content, /AGENTS\.md/, "must name AGENTS.md");

  // The draft's handoff actor values match the live identities exactly.
  assert.match(
    content,
    /handoff `actor` front-matter value[^\n]*\|\s*`claude-code`\s*\|\s*`Codex`\s*\|/,
    "the handoff actor row must carry claude-code and Codex exactly as the live files write them",
  );

  // Both live file paths, so the draft is traceable to what it replaces.
  assert.match(
    content,
    /\.claude\/commands\/end-session\.md/,
    "must name the live Claude Code command path",
  );
  assert.match(
    content,
    /\.agents\/skills\/source-command-end-session\/SKILL\.md/,
    "must name the live Codex mirror path",
  );
});

test("neither live end-session file references the candidates directory", () => {
  for (const rel of [LIVE_CLAUDE_PATH, LIVE_CODEX_PATH]) {
    const content = readIfExists(root, rel);
    assert.ok(content, `${rel} must exist`);
    assert.doesNotMatch(
      content,
      /docs\/project\/candidates/,
      `${rel} must not reference docs/project/candidates/ - a pointer there is an instruction the agent could follow before M4`,
    );
  }
});
