// Tests for the protocol-extraction check (T6 M3 batch 6a,
// scripts/protocol-extraction-lib.mjs, scripts/check-protocol-extraction.mjs).
// One planted-failure fixture per finding code, a clean fixture, a fixture
// proving heading lookup is by text (not line number), and a real-repo test
// that the committed extraction (docs/governance/protocols/
// DEPLOY_MECHANISM_VERIFICATION.md) passes against CLAUDE.md today.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  checkAllProtocolExtraction,
  checkProtocolFile,
  listCandidateProtocolFiles,
  repoRootFrom,
  CLAUDE_MD_PATH,
  PROTOCOLS_DIR,
  BEGIN_MARKER,
  END_MARKER,
} from "./protocol-extraction-lib.mjs";

const realRoot = repoRootFrom(import.meta.url);
const PROTO_REL = `${PROTOCOLS_DIR}/EXAMPLE_PROTOCOL.md`;
const SOURCE_HEADING = "Example Protocol (DEC-TEST)";

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
  return mkdtempSync(join(tmpdir(), "protocol-extraction-"));
}

/** The CLAUDE.md fixture: one unrelated heading before the target protocol
 * (proving lookup is by heading text, not line number), then the protocol
 * section itself, then a following heading to bound it. */
function claudeMdFixture({ bodyLines = DEFAULT_BODY } = {}) {
  return [
    "## Some Other Section",
    "",
    "Unrelated content that has nothing to do with the protocol below.",
    "",
    `### ${SOURCE_HEADING}`,
    "",
    ...bodyLines,
    "",
    "### The Next Protocol",
    "1. Unrelated next-section content.",
    "",
  ].join("\n");
}

const DEFAULT_BODY = [
  "**MANDATORY** - applies to every test fixture.",
  "",
  "1. Step one.",
  "2. Step two.",
];

function protocolFileFixture({ frontmatter = DEFAULT_FRONTMATTER, bodyLines = DEFAULT_BODY, begin = 1, end = 1 } = {}) {
  const lines = [...bodyLines];
  const beginMarkers = Array(begin).fill(BEGIN_MARKER);
  const endMarkers = Array(end).fill(END_MARKER);
  return [
    frontmatter,
    "",
    `# ${SOURCE_HEADING}`,
    "",
    ...beginMarkers,
    `### ${SOURCE_HEADING}`,
    "",
    ...lines,
    ...endMarkers,
    "",
  ].join("\n");
}

const DEFAULT_FRONTMATTER = [
  "---",
  "status: candidate",
  "authority_active: false",
  "source: CLAUDE.md",
  `source_heading: "${SOURCE_HEADING}"`,
  "---",
].join("\n");

function writeCleanFixture(dir, { claudeBody = DEFAULT_BODY, fileBody = DEFAULT_BODY } = {}) {
  writeFiles(dir, {
    [CLAUDE_MD_PATH]: claudeMdFixture({ bodyLines: claudeBody }),
    [PROTO_REL]: protocolFileFixture({ bodyLines: fileBody }),
  });
}

// ── Clean fixture: zero findings ────────────────────────────────────────

test("checkAllProtocolExtraction: a clean fixture has zero findings", () => {
  const dir = makeFixture();
  try {
    writeCleanFixture(dir);
    const { findings, fileCount } = checkAllProtocolExtraction(dir);
    assert.deepEqual(findings, []);
    assert.equal(fileCount, 1);
  } finally {
    cleanup(dir);
  }
});

// ── Located by heading text, not line number ────────────────────────────

test("locates the protocol by source_heading even when CLAUDE.md gains an unrelated section earlier in the file", () => {
  const dir = makeFixture();
  try {
    writeCleanFixture(dir);
    // Grow the unrelated leading section so every subsequent line number
    // shifts; the heading text itself is untouched.
    const grown = [
      "## Some Other Section",
      "",
      "Line one of new unrelated content.",
      "Line two of new unrelated content.",
      "Line three of new unrelated content.",
      "Line four of new unrelated content.",
      "",
      `### ${SOURCE_HEADING}`,
      "",
      ...DEFAULT_BODY,
      "",
      "### The Next Protocol",
      "1. Unrelated next-section content.",
      "",
    ].join("\n");
    writeFiles(dir, { [CLAUDE_MD_PATH]: grown });
    const { findings } = checkAllProtocolExtraction(dir);
    assert.deepEqual(findings, []);
  } finally {
    cleanup(dir);
  }
});

// ── Planted failure: PROTOCOL_HEADING_NOT_FOUND ─────────────────────────

test("fails with PROTOCOL_HEADING_NOT_FOUND when source_heading is absent from CLAUDE.md", () => {
  const dir = makeFixture();
  try {
    writeCleanFixture(dir);
    writeFiles(dir, {
      [CLAUDE_MD_PATH]: claudeMdFixture().replace(SOURCE_HEADING, "A Completely Different Heading"),
    });
    const findings = checkProtocolFile(dir, PROTO_REL);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].code, "PROTOCOL_HEADING_NOT_FOUND");
  } finally {
    cleanup(dir);
  }
});

// ── Planted failure: PROTOCOL_HEADING_DUPLICATE ─────────────────────────

test("fails with PROTOCOL_HEADING_DUPLICATE when source_heading appears twice in CLAUDE.md", () => {
  const dir = makeFixture();
  try {
    writeCleanFixture(dir);
    const duplicated = [claudeMdFixture(), "", `### ${SOURCE_HEADING}`, "", "Duplicate section body.", ""].join("\n");
    writeFiles(dir, { [CLAUDE_MD_PATH]: duplicated });
    const findings = checkProtocolFile(dir, PROTO_REL);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].code, "PROTOCOL_HEADING_DUPLICATE");
  } finally {
    cleanup(dir);
  }
});

// ── Planted failure: PROTOCOL_MARKER_MISSING ────────────────────────────

test("fails with PROTOCOL_MARKER_MISSING when the END marker is absent", () => {
  const dir = makeFixture();
  try {
    writeFiles(dir, {
      [CLAUDE_MD_PATH]: claudeMdFixture(),
      [PROTO_REL]: protocolFileFixture({ end: 0 }),
    });
    const findings = checkProtocolFile(dir, PROTO_REL);
    assert.ok(findings.some((f) => f.code === "PROTOCOL_MARKER_MISSING"));
  } finally {
    cleanup(dir);
  }
});

// ── Planted failure: PROTOCOL_MARKER_DUPLICATE ──────────────────────────

test("fails with PROTOCOL_MARKER_DUPLICATE when the BEGIN marker appears twice", () => {
  const dir = makeFixture();
  try {
    writeFiles(dir, {
      [CLAUDE_MD_PATH]: claudeMdFixture(),
      [PROTO_REL]: protocolFileFixture({ begin: 2 }),
    });
    const findings = checkProtocolFile(dir, PROTO_REL);
    assert.ok(findings.some((f) => f.code === "PROTOCOL_MARKER_DUPLICATE"));
  } finally {
    cleanup(dir);
  }
});

// ── Planted failure: PROTOCOL_VERBATIM_MISMATCH ─────────────────────────

test("fails with PROTOCOL_VERBATIM_MISMATCH and names the first differing line when the copy diverges", () => {
  const dir = makeFixture();
  try {
    writeCleanFixture(dir, { fileBody: ["**MANDATORY** - a changed word breaks the mirror.", "", "1. Step one.", "2. Step two."] });
    const findings = checkProtocolFile(dir, PROTO_REL);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].code, "PROTOCOL_VERBATIM_MISMATCH");
    assert.match(findings[0].detail, /first differing line 3/);
  } finally {
    cleanup(dir);
  }
});

// ── Planted failure: PROTOCOL_FRONTMATTER_MISSING ───────────────────────

test("fails with PROTOCOL_FRONTMATTER_MISSING when the file has markers but no front matter", () => {
  const dir = makeFixture();
  try {
    writeFiles(dir, {
      [CLAUDE_MD_PATH]: claudeMdFixture(),
      [PROTO_REL]: [
        `# ${SOURCE_HEADING}`,
        "",
        BEGIN_MARKER,
        `### ${SOURCE_HEADING}`,
        "",
        ...DEFAULT_BODY,
        END_MARKER,
        "",
      ].join("\n"),
    });
    const findings = checkProtocolFile(dir, PROTO_REL);
    assert.ok(findings.some((f) => f.code === "PROTOCOL_FRONTMATTER_MISSING"));
  } finally {
    cleanup(dir);
  }
});

// ── Planted failure: PROTOCOL_FRONTMATTER_INVALID ───────────────────────

test("fails with PROTOCOL_FRONTMATTER_INVALID when authority_active is not false", () => {
  const dir = makeFixture();
  try {
    const badFrontmatter = [
      "---",
      "status: candidate",
      "authority_active: true",
      "source: CLAUDE.md",
      `source_heading: "${SOURCE_HEADING}"`,
      "---",
    ].join("\n");
    writeFiles(dir, {
      [CLAUDE_MD_PATH]: claudeMdFixture(),
      [PROTO_REL]: protocolFileFixture({ frontmatter: badFrontmatter }),
    });
    const findings = checkProtocolFile(dir, PROTO_REL);
    assert.ok(findings.some((f) => f.code === "PROTOCOL_FRONTMATTER_INVALID"));
  } finally {
    cleanup(dir);
  }
});

test("fails with PROTOCOL_FRONTMATTER_INVALID when source_heading is missing", () => {
  const dir = makeFixture();
  try {
    const badFrontmatter = ["---", "status: candidate", "authority_active: false", "source: CLAUDE.md", "---"].join("\n");
    writeFiles(dir, {
      [CLAUDE_MD_PATH]: claudeMdFixture(),
      [PROTO_REL]: protocolFileFixture({ frontmatter: badFrontmatter }),
    });
    const findings = checkProtocolFile(dir, PROTO_REL);
    assert.ok(findings.some((f) => f.code === "PROTOCOL_FRONTMATTER_INVALID"));
  } finally {
    cleanup(dir);
  }
});

// ── Files without markers are ignored by rule, not by name ─────────────

test("listCandidateProtocolFiles ignores a .md file with no verbatim markers", () => {
  const dir = makeFixture();
  try {
    writeFiles(dir, {
      [CLAUDE_MD_PATH]: claudeMdFixture(),
      [`${PROTOCOLS_DIR}/README.md`]: "# Protocol Library\n\nNo markers here at all.\n",
      [PROTO_REL]: protocolFileFixture(),
    });
    const files = listCandidateProtocolFiles(dir);
    assert.deepEqual(files, [PROTO_REL]);
  } finally {
    cleanup(dir);
  }
});

// ── Real-repo test: the committed extraction passes today ──────────────

test("checkAllProtocolExtraction runs against the live repository with zero findings", () => {
  const { findings, fileCount } = checkAllProtocolExtraction(realRoot);
  assert.deepEqual(findings, []);
  assert.ok(fileCount >= 1, "expected at least one extracted protocol mirror in the committed repository");
});
