// Tests for the T12 research contract (scripts/research-lib.mjs,
// scripts/check-research.mjs, scripts/generate-research-index.mjs).
// Every failure mode is planted in its own throwaway git repo fixture and
// must fail there; the fixed counterpart must pass. See
// archive/sessions/2026-09-02-t12-research-contract-plan.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { checkAllResearch, repoRootFrom } from "./research-lib.mjs";
import { generateIndex } from "./generate-research-index.mjs";

const realRoot = repoRootFrom(import.meta.url);

/** Builds a throwaway git repo with the given { relativePath: content } files, plus the real schema. */
function makeFixture(files) {
  const root = mkdtempSync(join(tmpdir(), "strale-research-fixture-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Research Test"], { cwd: root });

  const schemaAbs = join(root, "docs/research/research.schema.json");
  mkdirSync(dirname(schemaAbs), { recursive: true });
  copyFileSync(resolve(realRoot, "docs/research/research.schema.json"), schemaAbs);

  for (const [rel, content] of Object.entries(files)) {
    const absolute = join(root, rel);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }
  execFileSync("git", ["add", "-A"], { cwd: root });
  return root;
}

function withFixture(files, fn) {
  const root = makeFixture(files);
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function codes(root) {
  return checkAllResearch(root).failures.map((f) => f.code);
}

function frontMatter(fields) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const v of value) lines.push(`  - ${v}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

function doc(fields, body = "# Doc\n\nBody text.\n") {
  return frontMatter(fields) + "\n" + body;
}

const BASE = {
  doc_type: "research",
  type: "market",
  topic: "widget-market",
  question: "Is there a viable market for widgets among target customers?",
  date: "2026-01-01",
  status: "current",
  sources: ["https://example.com/widget-report"],
};

// ---------------------------------------------------------------------------
// Clean pass
// ---------------------------------------------------------------------------

test("clean pass: a well-formed research file has zero findings", () => {
  withFixture(
    {
      "docs/research/2026-01-01-widget-market.md": doc(BASE),
    },
    (root) => {
      const { failures } = checkAllResearch(root);
      assert.deepEqual(failures, []);
    },
  );
});

test("clean pass: a reciprocal supersession pair has zero findings", () => {
  withFixture(
    {
      "docs/research/2026-01-01-widget-market.md": doc({
        ...BASE,
        status: "superseded",
        superseded_by: "2026-02-01-widget-market-v2.md",
      }),
      "docs/research/2026-02-01-widget-market-v2.md": doc({
        ...BASE,
        date: "2026-02-01",
        supersedes: ["2026-01-01-widget-market.md"],
      }),
    },
    (root) => {
      const { failures } = checkAllResearch(root);
      assert.deepEqual(failures, []);
    },
  );
});

// ---------------------------------------------------------------------------
// Missing / invalid front matter
// ---------------------------------------------------------------------------

test("missing front matter fails, adding it passes", () => {
  const broken = { "docs/research/2026-01-01-widget-market.md": "# No front matter\n\nJust a body.\n" };
  const fixed = { "docs/research/2026-01-01-widget-market.md": doc(BASE) };
  withFixture(broken, (root) => assert.ok(codes(root).includes("FRONT_MATTER_MISSING")));
  withFixture(fixed, (root) => assert.deepEqual(codes(root), []));
});

test("invalid enum value in front matter fails schema validation, correcting it passes", () => {
  const broken = { "docs/research/2026-01-01-widget-market.md": doc({ ...BASE, type: "not-a-real-type" }) };
  const fixed = { "docs/research/2026-01-01-widget-market.md": doc(BASE) };
  withFixture(broken, (root) => assert.ok(codes(root).includes("FRONT_MATTER_INVALID")));
  withFixture(fixed, (root) => assert.deepEqual(codes(root), []));
});

test("additionalProperties: false rejects an unknown front matter field", () => {
  withFixture(
    { "docs/research/2026-01-01-widget-market.md": doc({ ...BASE, extra_field: "nope" }) },
    (root) => assert.ok(codes(root).includes("FRONT_MATTER_INVALID")),
  );
});

// ---------------------------------------------------------------------------
// File name pattern
// ---------------------------------------------------------------------------

test("a file name not matching YYYY-MM-DD-<slug>.md fails, renaming it passes", () => {
  const broken = { "docs/research/widget-market-research.md": doc(BASE) };
  const fixed = { "docs/research/2026-01-01-widget-market.md": doc(BASE) };
  withFixture(broken, (root) => assert.ok(codes(root).includes("FILENAME_INVALID")));
  withFixture(fixed, (root) => assert.deepEqual(codes(root), []));
});

test("a file name with a non-calendar date (2026-02-30) fails", () => {
  withFixture(
    { "docs/research/2026-02-30-widget-market.md": doc({ ...BASE, date: "2026-02-30" }) },
    (root) => assert.ok(codes(root).includes("FILENAME_INVALID")),
  );
});

// ---------------------------------------------------------------------------
// One current file per topic
// ---------------------------------------------------------------------------

test("two status:current files on the same topic fail, marking one superseded passes", () => {
  const broken = {
    "docs/research/2026-01-01-widget-market.md": doc(BASE),
    "docs/research/2026-02-01-widget-market-again.md": doc({ ...BASE, date: "2026-02-01" }),
  };
  withFixture(broken, (root) => assert.ok(codes(root).includes("MULTIPLE_CURRENT_PER_TOPIC")));

  const fixed = {
    "docs/research/2026-01-01-widget-market.md": doc({
      ...BASE,
      status: "superseded",
      superseded_by: "2026-02-01-widget-market-again.md",
    }),
    "docs/research/2026-02-01-widget-market-again.md": doc({
      ...BASE,
      date: "2026-02-01",
      supersedes: ["2026-01-01-widget-market.md"],
    }),
  };
  withFixture(fixed, (root) => assert.deepEqual(codes(root), []));
});

// ---------------------------------------------------------------------------
// superseded without superseded_by
// ---------------------------------------------------------------------------

test("status:superseded without superseded_by fails schema validation, adding it passes", () => {
  const broken = { "docs/research/2026-01-01-widget-market.md": doc({ ...BASE, status: "superseded" }) };
  withFixture(broken, (root) => assert.ok(codes(root).includes("FRONT_MATTER_INVALID")));

  const fixed = {
    "docs/research/2026-01-01-widget-market.md": doc({
      ...BASE,
      status: "superseded",
      superseded_by: "2026-02-01-widget-market-again.md",
    }),
    "docs/research/2026-02-01-widget-market-again.md": doc({
      ...BASE,
      date: "2026-02-01",
      supersedes: ["2026-01-01-widget-market.md"],
    }),
  };
  withFixture(fixed, (root) => assert.deepEqual(codes(root), []));
});

// ---------------------------------------------------------------------------
// Non-reciprocal supersession
// ---------------------------------------------------------------------------

test("superseded_by target that does not list this file back in supersedes fails, adding it passes", () => {
  const broken = {
    "docs/research/2026-01-01-widget-market.md": doc({
      ...BASE,
      status: "superseded",
      superseded_by: "2026-02-01-widget-market-again.md",
    }),
    // successor exists but doesn't reciprocate
    "docs/research/2026-02-01-widget-market-again.md": doc({ ...BASE, date: "2026-02-01" }),
  };
  withFixture(broken, (root) => assert.ok(codes(root).includes("NON_RECIPROCAL_SUPERSESSION")));

  const fixed = {
    "docs/research/2026-01-01-widget-market.md": doc({
      ...BASE,
      status: "superseded",
      superseded_by: "2026-02-01-widget-market-again.md",
    }),
    "docs/research/2026-02-01-widget-market-again.md": doc({
      ...BASE,
      date: "2026-02-01",
      supersedes: ["2026-01-01-widget-market.md"],
    }),
  };
  withFixture(fixed, (root) => assert.deepEqual(codes(root), []));
});

test("supersedes naming a file that is not status:superseded back fails", () => {
  withFixture(
    {
      "docs/research/2026-01-01-widget-market.md": doc(BASE), // status: current, not superseded
      "docs/research/2026-02-01-widget-market-again.md": doc({
        ...BASE,
        date: "2026-02-01",
        supersedes: ["2026-01-01-widget-market.md"],
      }),
    },
    (root) => assert.ok(codes(root).includes("NON_RECIPROCAL_SUPERSESSION")),
  );
});

// ---------------------------------------------------------------------------
// Cyclic supersession
// ---------------------------------------------------------------------------

test("a supersession cycle (A superseded_by B, B superseded_by A) fails, breaking it passes", () => {
  const broken = {
    "docs/research/2026-01-01-widget-market.md": doc({
      ...BASE,
      status: "superseded",
      superseded_by: "2026-02-01-widget-market-again.md",
      supersedes: ["2026-02-01-widget-market-again.md"],
    }),
    "docs/research/2026-02-01-widget-market-again.md": doc({
      ...BASE,
      date: "2026-02-01",
      status: "superseded",
      superseded_by: "2026-01-01-widget-market.md",
      supersedes: ["2026-01-01-widget-market.md"],
    }),
  };
  withFixture(broken, (root) => assert.ok(codes(root).includes("SUPERSESSION_CYCLE")));

  const fixed = {
    "docs/research/2026-01-01-widget-market.md": doc({
      ...BASE,
      status: "superseded",
      superseded_by: "2026-02-01-widget-market-again.md",
    }),
    "docs/research/2026-02-01-widget-market-again.md": doc({
      ...BASE,
      date: "2026-02-01",
      supersedes: ["2026-01-01-widget-market.md"],
    }),
  };
  withFixture(fixed, (root) => assert.deepEqual(codes(root), []));
});

// ---------------------------------------------------------------------------
// Dangling supersession targets
// ---------------------------------------------------------------------------

test("a superseded_by target that does not exist fails, pointing it at a real file passes", () => {
  const broken = {
    "docs/research/2026-01-01-widget-market.md": doc({
      ...BASE,
      status: "superseded",
      superseded_by: "2026-99-99-nonexistent.md",
    }),
  };
  withFixture(broken, (root) => assert.ok(codes(root).includes("DANGLING_SUPERSEDED_BY")));

  const fixed = {
    "docs/research/2026-01-01-widget-market.md": doc({
      ...BASE,
      status: "superseded",
      superseded_by: "2026-02-01-widget-market-again.md",
    }),
    "docs/research/2026-02-01-widget-market-again.md": doc({
      ...BASE,
      date: "2026-02-01",
      supersedes: ["2026-01-01-widget-market.md"],
    }),
  };
  withFixture(fixed, (root) => assert.deepEqual(codes(root), []));
});

test("a supersedes entry naming a file that does not exist fails", () => {
  withFixture(
    {
      "docs/research/2026-01-01-widget-market.md": doc({ ...BASE, supersedes: ["2026-99-99-nonexistent.md"] }),
    },
    (root) => assert.ok(codes(root).includes("DANGLING_SUPERSEDES")),
  );
});

// ---------------------------------------------------------------------------
// Historical file wrongly claimed as superseded
// ---------------------------------------------------------------------------

test("supersedes naming a historical file fails (historical files stand alone)", () => {
  const broken = {
    "docs/research/2026-01-01-widget-market.md": doc({ ...BASE, status: "historical" }),
    "docs/research/2026-02-01-widget-market-again.md": doc({
      ...BASE,
      date: "2026-02-01",
      supersedes: ["2026-01-01-widget-market.md"],
    }),
  };
  withFixture(broken, (root) => assert.ok(codes(root).includes("SUPERSEDES_HISTORICAL")));

  const fixed = {
    "docs/research/2026-01-01-widget-market.md": doc({ ...BASE, status: "historical" }),
    "docs/research/2026-02-01-widget-market-again.md": doc({ ...BASE, date: "2026-02-01" }),
  };
  withFixture(fixed, (root) => assert.deepEqual(codes(root), []));
});

// ---------------------------------------------------------------------------
// Unresolvable markdown link / repo-path source
// ---------------------------------------------------------------------------

test("an unresolvable markdown link fails, fixing the path passes", () => {
  const broken = {
    "docs/research/2026-01-01-widget-market.md": doc(BASE, "# Doc\n\nSee [notes](2026-01-01-does-not-exist.md).\n"),
  };
  withFixture(broken, (root) => assert.ok(codes(root).includes("DANGLING_LINK")));

  const fixed = {
    "docs/research/2026-01-01-widget-market.md": doc(BASE, "# Doc\n\nSee [notes](2026-02-01-gadget-market.md).\n"),
    "docs/research/2026-02-01-gadget-market.md": doc({ ...BASE, topic: "gadget-market", date: "2026-02-01" }),
  };
  withFixture(fixed, (root) => assert.deepEqual(codes(root), []));
});

test("a markdown link to an http(s) URL is never treated as dangling", () => {
  withFixture(
    { "docs/research/2026-01-01-widget-market.md": doc(BASE, "# Doc\n\nSee [the vendor](https://example.com/pricing).\n") },
    (root) => assert.ok(!codes(root).includes("DANGLING_LINK")),
  );
});

test("an unresolvable repo-path source fails, correcting it passes", () => {
  const broken = { "docs/research/2026-01-01-widget-market.md": doc({ ...BASE, sources: ["apps/api/src/nope.ts"] }) };
  withFixture(broken, (root) => assert.ok(codes(root).includes("DANGLING_SOURCE")));

  const fixed = {
    "docs/research/2026-01-01-widget-market.md": doc({ ...BASE, sources: ["apps/api/src/real.ts"] }),
    "apps/api/src/real.ts": "export const x = 1;\n",
  };
  withFixture(fixed, (root) => assert.deepEqual(codes(root), []));
});

test("an untracked repo-path source fails (present on disk but not git add'ed)", () => {
  const root = mkdtempSync(join(tmpdir(), "strale-research-fixture-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Research Test"], { cwd: root });
    const schemaAbs = join(root, "docs/research/research.schema.json");
    mkdirSync(dirname(schemaAbs), { recursive: true });
    copyFileSync(resolve(realRoot, "docs/research/research.schema.json"), schemaAbs);
    const researchAbs = join(root, "docs/research/2026-01-01-widget-market.md");
    writeFileSync(researchAbs, doc({ ...BASE, sources: ["apps/api/src/real.ts"] }), "utf8");
    const scriptAbs = join(root, "apps/api/src/real.ts");
    mkdirSync(dirname(scriptAbs), { recursive: true });
    writeFileSync(scriptAbs, "export const x = 1;\n", "utf8");
    // Only the schema + research file are added; the source file is left untracked.
    execFileSync("git", ["add", "docs"], { cwd: root });
    assert.ok(codes(root).includes("DANGLING_SOURCE"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Active decisions citing non-current research
// ---------------------------------------------------------------------------

function decisionRecord(fields) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const v of value) lines.push(`  - ${v}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  lines.push("---", "", "# Decision", "", "Body.", "");
  return lines.join("\n");
}

test("an active decision citing superseded research fails, citing the successor passes", () => {
  const files = {
    "docs/research/2026-01-01-widget-market.md": doc({
      ...BASE,
      status: "superseded",
      superseded_by: "2026-02-01-widget-market-again.md",
    }),
    "docs/research/2026-02-01-widget-market-again.md": doc({
      ...BASE,
      date: "2026-02-01",
      supersedes: ["2026-01-01-widget-market.md"],
    }),
  };
  const broken = {
    ...files,
    "docs/decisions/records/DEC-20260101-A.md": decisionRecord({
      status: "active",
      evidence: ["docs/research/2026-01-01-widget-market.md"],
    }),
  };
  withFixture(broken, (root) => assert.ok(codes(root).includes("ACTIVE_DECISION_CITES_NONCURRENT_RESEARCH")));

  const fixed = {
    ...files,
    "docs/decisions/records/DEC-20260101-A.md": decisionRecord({
      status: "active",
      evidence: ["docs/research/2026-02-01-widget-market-again.md"],
    }),
  };
  withFixture(fixed, (root) => assert.deepEqual(codes(root), []));
});

test("a superseded (not active) decision citing superseded research does not fail", () => {
  withFixture(
    {
      "docs/research/2026-01-01-widget-market.md": doc({
        ...BASE,
        status: "superseded",
        superseded_by: "2026-02-01-widget-market-again.md",
      }),
      "docs/research/2026-02-01-widget-market-again.md": doc({
        ...BASE,
        date: "2026-02-01",
        supersedes: ["2026-01-01-widget-market.md"],
      }),
      "docs/decisions/records/DEC-20260101-A.md": decisionRecord({
        status: "superseded",
        evidence: ["docs/research/2026-01-01-widget-market.md"],
      }),
    },
    (root) => assert.ok(!codes(root).includes("ACTIVE_DECISION_CITES_NONCURRENT_RESEARCH")),
  );
});

// ---------------------------------------------------------------------------
// IDEAS.md line shape
// ---------------------------------------------------------------------------

test("a malformed IDEAS.md line fails, fixing the shape passes", () => {
  const broken = {
    "docs/company/IDEAS.md": "# Ideas\n\n## Inbox\n\n- 2026-01-01 this has no separators at all\n",
  };
  withFixture(broken, (root) => assert.ok(codes(root).includes("MALFORMED_IDEAS_LINE")));

  const fixed = {
    "docs/company/IDEAS.md": "# Ideas\n\n## Inbox\n\n- 2026-01-01 · inbox · a fine idea\n",
  };
  withFixture(fixed, (root) => assert.deepEqual(codes(root), []));
});

test("a promoted idea naming nothing that exists fails, pointing it at a real file passes", () => {
  const broken = {
    "docs/company/IDEAS.md": "# Ideas\n\n## Inbox\n\n- 2026-01-01 · promoted · ship widget research · → 2026-99-99-nonexistent.md\n",
  };
  withFixture(broken, (root) => assert.ok(codes(root).includes("PROMOTED_IDEA_DANGLING_TARGET")));

  const fixed = {
    "docs/research/2026-01-01-widget-market.md": doc(BASE),
    "docs/company/IDEAS.md": "# Ideas\n\n## Inbox\n\n- 2026-01-01 · promoted · ship widget research · → 2026-01-01-widget-market.md\n",
  };
  withFixture(fixed, (root) => assert.deepEqual(codes(root), []));
});

test("a promoted idea pointing at an existing DEC id passes", () => {
  withFixture(
    {
      "docs/decisions/records/DEC-20260101-A.md": decisionRecord({ status: "active", evidence: [] }),
      "docs/company/IDEAS.md": "# Ideas\n\n## Inbox\n\n- 2026-01-01 · promoted · ship it · → DEC-20260101-A\n",
    },
    (root) => assert.ok(!codes(root).includes("PROMOTED_IDEA_DANGLING_TARGET")),
  );
});

test("prose and a fenced code-block example in IDEAS.md are not checked as entries", () => {
  withFixture(
    {
      "docs/company/IDEAS.md": [
        "# Ideas",
        "",
        "Some prose that starts with a dash-like bullet below:",
        "",
        "- `inbox` — captured, not yet looked at.",
        "",
        "```",
        "- YYYY-MM-DD · <status> · <one line> [· → <target>]",
        "```",
        "",
        "## Inbox",
        "",
        "_Empty._",
        "",
      ].join("\n"),
    },
    (root) => assert.deepEqual(codes(root), []),
  );
});

// ---------------------------------------------------------------------------
// Warnings (non-failing)
// ---------------------------------------------------------------------------

test("a research-looking file under docs/strategy warns but does not fail", () => {
  withFixture(
    {
      "docs/research/2026-01-01-widget-market.md": doc(BASE),
      "docs/strategy/2026-01-01-competitor-audit.md": "# Competitor audit\n\nLooks like research.\n",
    },
    (root) => {
      const { failures, warnings } = checkAllResearch(root);
      assert.deepEqual(failures, []);
      assert.ok(warnings.some((w) => w.code === "RESEARCH_LOOKING_FILE_OUTSIDE_CONTRACT"));
    },
  );
});

test("an ordinary docs/strategy file without a research-looking heading does not warn", () => {
  withFixture(
    {
      "docs/research/2026-01-01-widget-market.md": doc(BASE),
      "docs/strategy/2026-01-01-roadmap.md": "# Roadmap\n\nPlain planning doc.\n",
    },
    (root) => {
      const { warnings } = checkAllResearch(root);
      assert.deepEqual(warnings, []);
    },
  );
});

// ---------------------------------------------------------------------------
// README index generator
// ---------------------------------------------------------------------------

test("generateIndex --check passes when the README matches, fails when stale", () => {
  withFixture(
    {
      "docs/research/2026-01-01-widget-market.md": doc(BASE),
    },
    (root) => {
      generateIndex(root, { check: false });
      const ok = generateIndex(root, { check: true });
      assert.equal(ok.stale, false);

      // Add a new research file without regenerating the README.
      const absolute = join(root, "docs/research/2026-02-01-gadget-market.md");
      writeFileSync(absolute, doc({ ...BASE, topic: "gadget-market", date: "2026-02-01" }), "utf8");
      const stale = generateIndex(root, { check: true });
      assert.equal(stale.stale, true);
    },
  );
});

test("generateIndex --check reports missing when README does not exist yet", () => {
  withFixture({ "docs/research/2026-01-01-widget-market.md": doc(BASE) }, (root) => {
    const result = generateIndex(root, { check: true });
    assert.equal(result.missing, true);
    assert.equal(result.stale, true);
  });
});

test("check-research.mjs CLI exits 0 against the real, committed docs/research", () => {
  // check-research.mjs (like check-program-tracks.mjs) anchors its root to its
  // own script location, not to cwd — so this exercises the real repo, the
  // same contract the positive smoke test below checks at the library level.
  const cli = resolve(realRoot, "scripts/check-research.mjs");
  assert.doesNotThrow(() => execFileSync("node", [cli], { cwd: realRoot, stdio: "pipe" }));
});

// ---------------------------------------------------------------------------
// Positive smoke test against the real, committed docs/research/
// ---------------------------------------------------------------------------

test("positive smoke test (not mutation evidence): the committed docs/research passes with zero findings", () => {
  const { failures } = checkAllResearch(realRoot);
  assert.deepEqual(failures, []);
});
