// Tests for the T5 archive/handoff index generator
// (scripts/generate-archive-index.mjs). Every failure mode is planted in its
// own throwaway directory fixture and must fail there; the fixed
// counterpart must pass. See
// archive/sessions/2026-09-02-t5-cto-readable-structure-plan.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  ARCHIVE_MARKER_BEGIN,
  collectAllSubtreeStats,
  collectHandoffEntries,
  generateAll,
  generateArchiveReadme,
  generateHandoffReadme,
  listArchiveSubtrees,
  listHandoffFiles,
  renderHandoffReadme,
} from "./generate-archive-index.mjs";

function writeFiles(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const absolute = join(root, rel);
    mkdirSync(resolve(absolute, ".."), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }
}

function withFixture(files, fn) {
  const root = mkdtempSync(join(tmpdir(), "strale-archive-index-fixture-"));
  writeFiles(root, files);
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// archive/README.md
// ---------------------------------------------------------------------------

test("listArchiveSubtrees: lists top-level directories only, sorted", () => {
  withFixture(
    {
      "archive/sessions/a.md": "a",
      "archive/growth-ops/b.md": "b",
      "archive/README.md": "# archive\n",
    },
    (root) => {
      assert.deepEqual(listArchiveSubtrees(root), ["growth-ops", "sessions"]);
    },
  );
});

test("collectAllSubtreeStats: counts files and finds the newest dated filename", () => {
  withFixture(
    {
      "archive/sessions/2026-01-01-old.md": "x",
      "archive/sessions/2026-06-15-new.md": "x",
      "archive/sessions/undated.md": "x",
      "archive/growth-ops/notes.md": "x",
    },
    (root) => {
      const stats = collectAllSubtreeStats(root);
      const sessions = stats.find((s) => s.subtree === "sessions");
      assert.equal(sessions.fileCount, 3);
      assert.equal(sessions.newestFile, "2026-06-15-new.md");
      assert.equal(sessions.newestDate, "2026-06-15");

      const growthOps = stats.find((s) => s.subtree === "growth-ops");
      assert.equal(growthOps.fileCount, 1);
      assert.equal(growthOps.newestFile, null, "no dated filename in this subtree");
    },
  );
});

test("clean pass: fresh generate then --check reports not stale", () => {
  withFixture(
    {
      "archive/README.md": "# archive/\n\nHand-written prose stays here.\n",
      "archive/sessions/2026-01-01-a.md": "x",
    },
    (root) => {
      const written = generateArchiveReadme(root, { check: false });
      assert.equal(written.written, true);
      const checked = generateArchiveReadme(root, { check: true });
      assert.equal(checked.stale, false);
    },
  );
});

test("PLANTED FAILURE: prose is preserved verbatim above the marker on regenerate", () => {
  withFixture(
    {
      "archive/README.md": "# archive/\n\nOriginal hand-written prose. Do not touch this line.\n",
      "archive/sessions/2026-01-01-a.md": "x",
    },
    (root) => {
      generateArchiveReadme(root, { check: false });
      const afterFirstGen = readFileSync(resolve(root, "archive/README.md"), "utf8");
      assert.ok(afterFirstGen.includes("Original hand-written prose. Do not touch this line."));
      assert.ok(afterFirstGen.includes(ARCHIVE_MARKER_BEGIN));

      // Plant: a new file lands in the subtree after the first generate.
      // The stale generated block must be caught by --check...
      const staleCheck = generateArchiveReadme(root, { check: true });
      assert.equal(staleCheck.stale, false, "sanity: nothing changed yet");

      writeFiles(root, { "archive/sessions/2026-08-01-b.md": "y" });
      const staleAfterAdd = generateArchiveReadme(root, { check: true });
      assert.equal(staleAfterAdd.stale, true, "PLANTED: new file must make the generated block stale");

      // ...and regenerating must update the count while leaving the prose intact.
      generateArchiveReadme(root, { check: false });
      const afterSecondGen = readFileSync(resolve(root, "archive/README.md"), "utf8");
      assert.ok(afterSecondGen.includes("Original hand-written prose. Do not touch this line."));
      assert.match(afterSecondGen, /\| `archive\/sessions\/` \| 2 \|/);
    },
  );
});

test("PLANTED FAILURE: a removed subtree drops out of the regenerated index (index must not lag)", () => {
  withFixture(
    {
      "archive/README.md": "# archive/\n",
      "archive/sessions/2026-01-01-a.md": "x",
      "archive/growth-ops/notes.md": "x",
    },
    (root) => {
      generateArchiveReadme(root, { check: false });
      const before = readFileSync(resolve(root, "archive/README.md"), "utf8");
      assert.match(before, /archive\/growth-ops\//);

      // Plant: growth-ops disappears (e.g. swept elsewhere) without regenerating.
      rmSync(resolve(root, "archive/growth-ops"), { recursive: true, force: true });
      const stale = generateArchiveReadme(root, { check: true });
      assert.equal(stale.stale, true, "PLANTED: a vanished subtree must make the index stale");

      generateArchiveReadme(root, { check: false });
      const after = readFileSync(resolve(root, "archive/README.md"), "utf8");
      assert.ok(!after.includes("archive/growth-ops/"));
    },
  );
});

// ---------------------------------------------------------------------------
// handoff/README.md
// ---------------------------------------------------------------------------

test("listHandoffFiles: excludes README.md, includes both categories", () => {
  withFixture(
    {
      "handoff/_general/README.md": "note",
      "handoff/_general/from-code/2026-01-01-a.md": "Intent: do a thing\n",
      "handoff/_general/from-chat/2026-01-02-b.md": "Intent: do another thing\n",
    },
    (root) => {
      const files = listHandoffFiles(root).map((f) => f.relativePath);
      assert.deepEqual(files.sort(), [
        "handoff/_general/from-chat/2026-01-02-b.md",
        "handoff/_general/from-code/2026-01-01-a.md",
      ]);
    },
  );
});

test("collectHandoffEntries: extracts Intent: in plain, bold, and heading-prefixed forms", () => {
  withFixture(
    {
      "handoff/_general/from-code/2026-01-01-plain.md": "Intent: plain form\n",
      "handoff/_general/from-code/2026-01-02-bold.md": "**Intent:** bold form\n",
      "handoff/_general/from-code/2026-01-03-heading.md": "# 2026-01-03 — Session\n\nIntent: after a heading\n",
      "handoff/_general/from-code/no-date-no-intent.md": "# Just a title\n\nNo intent line here.\n",
    },
    (root) => {
      const entries = collectHandoffEntries(root);
      const byName = Object.fromEntries(entries.map((e) => [e.name, e]));
      assert.equal(byName["2026-01-01-plain.md"].intent, "plain form");
      assert.equal(byName["2026-01-02-bold.md"].intent, "bold form");
      assert.equal(byName["2026-01-03-heading.md"].intent, "after a heading");
      assert.equal(byName["no-date-no-intent.md"].intent, null);
      assert.equal(byName["no-date-no-intent.md"].date, null);
      assert.equal(byName["2026-01-01-plain.md"].date, "2026-01-01");
    },
  );
});

test("PLANTED FAILURE: a file lacking an Intent: line must not be silently dropped from the table or the count", () => {
  withFixture(
    {
      "handoff/_general/from-code/2026-01-01-has-intent.md": "Intent: has one\n",
      "handoff/_general/from-code/legacy-no-intent.md": "# Old report\n\nNo convention followed.\n",
    },
    (root) => {
      const entries = collectHandoffEntries(root);
      const rendered = renderHandoffReadme(entries);
      // PLANTED: a naive filter on entries with an intent would drop the
      // legacy file from both the table and the total count.
      assert.match(rendered, /2 files? \(1 with a recorded intent, 1 without\)/);
      assert.match(rendered, /legacy-no-intent\.md/);
      assert.match(rendered, /no Intent: line found/);
    },
  );
});

test("reverse-chronological: dated entries sort newest first; undated entries follow, sorted by path", () => {
  withFixture(
    {
      "handoff/_general/from-code/2026-01-01-old.md": "Intent: old\n",
      "handoff/_general/from-code/2026-06-01-new.md": "Intent: new\n",
      "handoff/_general/from-code/undated-b.md": "Intent: b\n",
      "handoff/_general/from-code/undated-a.md": "Intent: a\n",
    },
    (root) => {
      const entries = collectHandoffEntries(root);
      const rendered = renderHandoffReadme(entries);
      const rows = rendered
        .split("\n")
        .filter((l) => l.startsWith("| ") && !l.startsWith("| date") && !l.startsWith("| ---"));
      assert.equal(rows.length, 4);
      assert.match(rows[0], /2026-06-01/);
      assert.match(rows[1], /2026-01-01/);
      assert.match(rows[2], /undated-a\.md/);
      assert.match(rows[3], /undated-b\.md/);
    },
  );
});

test("clean pass: generateAll writes both files and a subsequent --check reports not stale", () => {
  withFixture(
    {
      "archive/README.md": "# archive/\n",
      "archive/sessions/2026-01-01-a.md": "x",
      "handoff/_general/from-code/2026-01-01-a.md": "Intent: a thing\n",
    },
    (root) => {
      generateAll(root, { check: false });
      const result = generateAll(root, { check: true });
      assert.equal(result.archive.stale, false);
      assert.equal(result.handoff.stale, false);
    },
  );
});

test("PLANTED FAILURE: a new handoff file added after generation must be caught by --check", () => {
  withFixture(
    {
      "archive/README.md": "# archive/\n",
      "handoff/_general/from-code/2026-01-01-a.md": "Intent: a thing\n",
    },
    (root) => {
      generateAll(root, { check: false });
      writeFiles(root, { "handoff/_general/from-code/2026-06-01-b.md": "Intent: b thing\n" });
      const result = generateAll(root, { check: true });
      assert.equal(result.handoff.stale, true, "PLANTED: an unindexed new handoff file must fail --check");
    },
  );
});

test("missing handoff/README.md is reported as stale (missing), not silently created", () => {
  withFixture(
    {
      "archive/README.md": "# archive/\n",
      "handoff/_general/from-code/2026-01-01-a.md": "Intent: a thing\n",
    },
    (root) => {
      const result = generateHandoffReadme(root, { check: true });
      assert.equal(result.stale, true);
      assert.equal(result.missing, true);
    },
  );
});
