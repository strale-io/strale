// Tests for the Notion anti-regression check (M4 batch 7 part one,
// scripts/no-notion-regression-lib.mjs, scripts/check-no-notion-regression.mjs).
// Plants each signal pattern in ordinary executable code outside every
// allowlist and confirms it fires; confirms each allowlisted item does not
// fire; and proves an allowlisted file is not a blanket exemption by
// planting a genuine new (non-comment) read inside an already-allowlisted
// file and confirming it still fires.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkNoNotionRegression,
  repoRootFrom,
  scanFiles,
} from "./no-notion-regression-lib.mjs";

const realRoot = repoRootFrom(import.meta.url);

/** In-memory file map -> scanFiles-compatible readFile + file list. */
function scan(files) {
  const list = Object.keys(files);
  const readFile = (rel) => {
    if (!(rel in files)) throw new Error(`no fixture file ${rel}`);
    return files[rel];
  };
  return scanFiles("/fixture-root", list, readFile);
}

function codes(findings) {
  return findings.map((f) => f.code);
}

test("clean fixture: ordinary code with no Notion pattern reports nothing", () => {
  const findings = scan({
    "src/example.ts": "export const greeting = \"hello world\";\n",
  });
  assert.deepEqual(findings, []);
});

test("NOTION_API_KEY reintroduced in executable code outside the allowlist fires", () => {
  const findings = scan({
    "apps/api/src/lib/new-thing.ts": "const key = process.env.NOTION_API_KEY;\n",
  });
  assert.deepEqual(codes(findings), ["NOTION_API_KEY"]);
  assert.equal(findings[0].file, "apps/api/src/lib/new-thing.ts");
  assert.equal(findings[0].line, 1);
});

test("NOTION_TOKEN reintroduced in executable code outside the allowlist fires", () => {
  const findings = scan({
    "apps/api/src/lib/new-thing.ts": "const token = process.env.NOTION_TOKEN;\n",
  });
  assert.deepEqual(codes(findings), ["NOTION_TOKEN"]);
});

test("api.notion.com fetch call outside the allowlist fires", () => {
  const findings = scan({
    "apps/api/src/lib/new-thing.ts": 'await fetch("https://api.notion.com/v1/databases/x/query");\n',
  });
  assert.deepEqual(codes(findings), ["NOTION_API_URL"]);
});

test("api.notion.com match is case-insensitive", () => {
  const findings = scan({
    "apps/api/src/lib/new-thing.ts": 'await fetch("HTTPS://API.NOTION.COM/v1/x");\n',
  });
  assert.deepEqual(codes(findings), ["NOTION_API_URL"]);
});

test("@notionhq SDK import outside the allowlist fires", () => {
  const findings = scan({
    "apps/api/src/lib/new-thing.ts": 'import { Client } from "@notionhq/client";\n',
  });
  assert.deepEqual(codes(findings), ["NOTION_SDK_IMPORT"]);
});

test("a Notion MCP tool-name reference outside the allowlist fires", () => {
  const findings = scan({
    "scripts/new-thing.mjs": "// calls mcp__24fbd906-5d0f-4299-a9f4-32c10142f8e3__notion-search\n",
  });
  assert.deepEqual(codes(findings), ["NOTION_MCP_TOOL"]);
});

test("a bare notion.so citation URL is never a signal (a human-read citation, not a live consumer)", () => {
  const findings = scan({
    "apps/api/src/lib/example.ts": "// https://www.notion.so/35967c87082c81dc905fceff85603fe5\n",
  });
  assert.deepEqual(findings, []);
});

test("FULL_FILE_ALLOWLIST directory: archive/ is fully exempt", () => {
  const findings = scan({
    "archive/sessions/old-report.md": "This report cites NOTION_API_KEY and NOTION_TOKEN as historical fact.\n",
  });
  assert.deepEqual(findings, []);
});

test("FULL_FILE_ALLOWLIST directory: handoff/ is fully exempt", () => {
  const findings = scan({
    "handoff/_general/from-code/2026-01-01-example.md": "Removed the last NOTION_TOKEN read.\n",
  });
  assert.deepEqual(findings, []);
});

test("FULL_FILE_ALLOWLIST directory: docs/decisions/records/ is fully exempt", () => {
  const findings = scan({
    "docs/decisions/records/DEC-20260101-A--notion-35967c87082c81dc905fceff85603fe5.md":
      "Cites the record's own --notion- qualifier and api.notion.com as historical background.\n",
  });
  assert.deepEqual(findings, []);
});

test("FULL_FILE_ALLOWLIST_FILES: an exact named historical/documentation file is fully exempt", () => {
  const findings = scan({
    "docs/strategy/2026-08-31-repo-native-operating-model-migration.md":
      "The plan's own prose cites NOTION_API_KEY, NOTION_TOKEN, api.notion.com, and @notionhq as search terms.\n",
  });
  assert.deepEqual(findings, []);
});

test("a directory outside the allowlist named similarly (archive-old/) is NOT exempt", () => {
  const findings = scan({
    "archive-old/report.md": "NOTION_API_KEY\n",
  });
  assert.deepEqual(codes(findings), ["NOTION_API_KEY"]);
});

// ── COMMENT_ONLY_ALLOWLIST: exempt only on a comment line, never a blanket
// exemption for the rest of the file ─────────────────────────────────────

test("COMMENT_ONLY_ALLOWLIST (.ts): a JSDoc comment line naming the retired read is exempt", () => {
  const findings = scan({
    "apps/api/scripts/check-vendor-roster-drift.ts":
      "/**\n * Retargeted off Notion. Both legs read NOTION_TOKEN and called api.notion.com.\n */\n",
  });
  assert.deepEqual(findings, []);
});

test("COMMENT_ONLY_ALLOWLIST (.ts) is not a blanket exemption: a genuine new read in the same file still fires", () => {
  const findings = scan({
    "apps/api/scripts/check-vendor-roster-drift.ts":
      "/**\n * Retargeted off Notion. Both legs read NOTION_TOKEN and called api.notion.com.\n */\n" +
      "const token = process.env.NOTION_TOKEN;\n",
  });
  assert.deepEqual(codes(findings), ["NOTION_TOKEN"]);
  assert.equal(findings[0].line, 4);
});

test("COMMENT_ONLY_ALLOWLIST (.yml): a workflow comment line is exempt", () => {
  const findings = scan({
    ".github/workflows/ci.yml": "      # NOTION_API_KEY-reading script were retired in M4 batch 5\n",
  });
  assert.deepEqual(findings, []);
});

test("COMMENT_ONLY_ALLOWLIST (.yml) is not a blanket exemption: a genuine new secret wiring in the same file still fires", () => {
  const findings = scan({
    ".github/workflows/ci.yml":
      "      # NOTION_API_KEY-reading script were retired in M4 batch 5\n" +
      "      env:\n" +
      "        NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}\n",
  });
  assert.deepEqual(codes(findings), ["NOTION_API_KEY"]);
  assert.equal(findings[0].line, 3);
});

// ── instruction-surface scan (.claude/, .agents/) ────────────────────────

test("NOTION_INSTRUCTION_SURFACE: a bare 'Notion' mention reintroduced in .claude/ fires", () => {
  const findings = scan({
    ".claude/commands/example.md": "Write the entry to the Notion Journal.\n",
  });
  assert.deepEqual(codes(findings), ["NOTION_INSTRUCTION_SURFACE"]);
});

test("NOTION_INSTRUCTION_SURFACE: a bare 'Notion' mention reintroduced in .agents/ fires", () => {
  const findings = scan({
    ".agents/skills/example/SKILL.md": "Query the Notion To-do DB for open items.\n",
  });
  assert.deepEqual(codes(findings), ["NOTION_INSTRUCTION_SURFACE"]);
});

test("NOTION_INSTRUCTION_SURFACE match is whole-word: 'notionally' does not fire", () => {
  const findings = scan({
    ".claude/commands/example.md": "This step is notionally similar to the last one.\n",
  });
  assert.deepEqual(findings, []);
});

test("a bare 'Notion' mention outside .claude/ and .agents/ is not an instruction-surface finding", () => {
  const findings = scan({
    "docs/company/CHARTER.md": "This used to mention Notion.\n",
  });
  assert.deepEqual(findings, []);
});

test("real repository: checkNoNotionRegression reports zero findings on the committed tree", () => {
  const { findings } = checkNoNotionRegression(realRoot);
  assert.deepEqual(findings, [], JSON.stringify(findings, null, 2));
});

test("real repository: .claude/ and .agents/ carry no Notion instruction-surface mention", () => {
  const { findings } = checkNoNotionRegression(realRoot);
  assert.deepEqual(
    findings.filter((f) => f.code === "NOTION_INSTRUCTION_SURFACE"),
    [],
  );
});
