// Tests for the protocol coverage manifest check (T6 M3 batch 7,
// scripts/protocol-coverage-lib.mjs, scripts/check-protocol-coverage.mjs).
// One planted-failure fixture per finding code, a clean fixture, and a
// real-repo test that the committed manifest and router pass today with no
// findings and no warnings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import {
  checkAllProtocolCoverage,
  loadManifest,
  protocolRouterMarkdown,
  repoRootFrom,
  MANIFEST_PATH,
  SCHEMA_PATH,
  ROUTER_PATH,
} from "./protocol-coverage-lib.mjs";
import { BEGIN_MARKER, END_MARKER } from "./protocol-extraction-lib.mjs";

const realRoot = repoRootFrom(import.meta.url);
const REAL_SCHEMA = readFileSync(resolve(realRoot, SCHEMA_PATH), "utf8");

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
  return mkdtempSync(join(tmpdir(), "protocol-coverage-"));
}

const MIRROR_HEADING = "Example Protocol (DEC-TEST)";
const MIRROR_BODY = ["**MANDATORY** - a fixture protocol.", "", "1. Step one."];

function mirrorFile({ heading = MIRROR_HEADING, bodyLines = MIRROR_BODY } = {}) {
  return [
    "---",
    "status: candidate",
    "authority_active: false",
    "source: CLAUDE.md",
    `source_heading: "${heading}"`,
    "---",
    "",
    `# ${heading}`,
    "",
    BEGIN_MARKER,
    `### ${heading}`,
    "",
    ...bodyLines,
    END_MARKER,
    "",
  ].join("\n");
}

function claudeMdFixture({ heading = MIRROR_HEADING, bodyLines = MIRROR_BODY } = {}) {
  return [
    "## Workflow Protocol",
    "",
    "Unrelated top-level section that groups subsections; not itself a row.",
    "",
    `### ${heading}`,
    "",
    ...bodyLines,
    "",
    "### The Next Section",
    "Unrelated next-section content.",
    "",
  ].join("\n");
}

function manifestRow(overrides = {}) {
  return {
    id: "example-protocol",
    name: MIRROR_HEADING,
    trigger: "A test fixture exercises this protocol.",
    full_body: "docs/governance/protocols/EXAMPLE_PROTOCOL.md",
    source: `CLAUDE.md heading: ${MIRROR_HEADING}`,
    decision: "none",
    decision_reason: "Fixture row; not tied to a numbered decision id.",
    decision_record: null,
    decision_record_note: "Recorded only in the CLAUDE.md fixture.",
    enforced_by: ["docs/governance/protocols/EXAMPLE_PROTOCOL.md"],
    ...overrides,
  };
}

const VERIFIED_AT = "2026-09-11";

/** The two headings claudeMdFixture() adds besides the row's own heading:
 * the grouping "## Workflow Protocol" and the unrelated "### The Next
 * Section". Every clean fixture excludes both, since review round 1 makes
 * every level-2/3 CLAUDE.md heading either a row or an excluded_sections
 * entry -- there is no third state. */
function defaultExcludedSections() {
  return [
    { heading: "Workflow Protocol", reason: "Section header grouping fixture subsections; not itself a protocol." },
    { heading: "The Next Section", reason: "Unrelated fixture section, not a protocol." },
  ];
}

function manifestYaml(rows, excludedSections = defaultExcludedSections()) {
  return stringifyYaml({
    schema_version: 1,
    authority_active: false,
    verified_at: VERIFIED_AT,
    protocols: rows,
    excluded_sections: excludedSections,
  });
}

/** Writes a complete, otherwise-clean fixture repo: CLAUDE.md, the schema,
 * a manifest, a mirror file, and (unless `router` is given) a router
 * generated to match. Returns the fixture root. */
function cleanFixture({ rows = [manifestRow()], excludedSections = defaultExcludedSections(), router } = {}) {
  const dir = makeFixture();
  writeFiles(dir, {
    "CLAUDE.md": claudeMdFixture(),
    [SCHEMA_PATH]: REAL_SCHEMA,
    [MANIFEST_PATH]: manifestYaml(rows, excludedSections),
    "docs/governance/protocols/EXAMPLE_PROTOCOL.md": mirrorFile(),
  });
  const manifest = { schema_version: 1, authority_active: false, verified_at: VERIFIED_AT, protocols: rows };
  writeFiles(dir, { [ROUTER_PATH]: router ?? protocolRouterMarkdown(manifest) });
  return dir;
}

function findingCodes(result) {
  return result.findings.map((f) => f.code);
}

test("clean fixture: no findings, no warnings", () => {
  const dir = cleanFixture();
  try {
    const result = checkAllProtocolCoverage(dir);
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.protocolCount, 1);
  } finally {
    cleanup(dir);
  }
});

test("SCHEMA_INVALID: manifest missing required fields", () => {
  const dir = makeFixture();
  writeFiles(dir, {
    "CLAUDE.md": claudeMdFixture(),
    [SCHEMA_PATH]: REAL_SCHEMA,
    [MANIFEST_PATH]: stringifyYaml({ schema_version: 1, protocols: [] }), // missing authority_active
  });
  try {
    const result = checkAllProtocolCoverage(dir);
    assert.ok(findingCodes(result).every((code) => code === "SCHEMA_INVALID"));
    assert.ok(findingCodes(result).length > 0);
  } finally {
    cleanup(dir);
  }
});

test("DUPLICATE_ID: duplicate rows share an id", () => {
  const dir = cleanFixture({ rows: [manifestRow(), manifestRow()] });
  try {
    const result = checkAllProtocolCoverage(dir);
    assert.ok(findingCodes(result).includes("DUPLICATE_ID"));
  } finally {
    cleanup(dir);
  }
});

test("FULL_BODY_MISSING: full_body path does not exist", () => {
  const dir = cleanFixture({
    rows: [manifestRow({ full_body: "docs/governance/protocols/DOES_NOT_EXIST.md" })],
  });
  try {
    const result = checkAllProtocolCoverage(dir);
    assert.ok(findingCodes(result).includes("FULL_BODY_MISSING"));
    // The mirror file that does exist now has no covering row either.
    assert.ok(findingCodes(result).includes("MIRROR_UNCOVERED"));
  } finally {
    cleanup(dir);
  }
});

test("DECISION_RECORD_MISSING: decision_record path does not exist", () => {
  const dir = cleanFixture({
    rows: [
      manifestRow({
        decision: "DEC-99999999-Z",
        decision_reason: undefined,
        decision_record: "docs/decisions/records/DOES-NOT-EXIST.md",
        decision_record_note: undefined,
      }),
    ],
  });
  try {
    const result = checkAllProtocolCoverage(dir);
    assert.ok(findingCodes(result).includes("DECISION_RECORD_MISSING"));
  } finally {
    cleanup(dir);
  }
});

test("ENFORCED_BY_MISSING: enforced_by path does not exist", () => {
  const dir = cleanFixture({
    rows: [manifestRow({ enforced_by: ["scripts/does-not-exist.mjs"] })],
  });
  try {
    const result = checkAllProtocolCoverage(dir);
    assert.ok(findingCodes(result).includes("ENFORCED_BY_MISSING"));
  } finally {
    cleanup(dir);
  }
});

test("MIRROR_UNCOVERED: a mirror file with no manifest row", () => {
  const dir = cleanFixture();
  writeFiles(dir, {
    "docs/governance/protocols/ORPHAN.md": mirrorFile({ heading: "Orphan Protocol (DEC-ORPHAN)" }),
  });
  try {
    const result = checkAllProtocolCoverage(dir);
    assert.ok(
      result.findings.some((f) => f.code === "MIRROR_UNCOVERED" && f.file === "docs/governance/protocols/ORPHAN.md"),
    );
  } finally {
    cleanup(dir);
  }
});

test("HEADING_UNCLASSIFIED: a level-3 heading with no row and no excluded_sections entry", () => {
  const dir = cleanFixture();
  writeFiles(dir, {
    "CLAUDE.md": claudeMdFixture() + "\n### Another Unclassified Section\n\nBody text.\n",
  });
  try {
    const result = checkAllProtocolCoverage(dir);
    assert.ok(
      result.findings.some(
        (f) => f.code === "HEADING_UNCLASSIFIED" && f.detail.includes("Another Unclassified Section"),
      ),
    );
  } finally {
    cleanup(dir);
  }
});

test("HEADING_UNCLASSIFIED: a level-2 heading with no row and no excluded_sections entry", () => {
  const dir = cleanFixture();
  writeFiles(dir, {
    "CLAUDE.md": claudeMdFixture() + "\n## Another Unclassified Top-Level Section\n\nBody text.\n",
  });
  try {
    const result = checkAllProtocolCoverage(dir);
    assert.ok(
      result.findings.some(
        (f) => f.code === "HEADING_UNCLASSIFIED" && f.detail.includes("Another Unclassified Top-Level Section"),
      ),
    );
  } finally {
    cleanup(dir);
  }
});

test("EXCLUSION_STALE: an excluded_sections entry names a heading no longer in CLAUDE.md", () => {
  const dir = cleanFixture({
    excludedSections: [...defaultExcludedSections(), { heading: "Long Gone Section", reason: "Fixture reason." }],
  });
  try {
    const result = checkAllProtocolCoverage(dir);
    assert.ok(
      result.findings.some((f) => f.code === "EXCLUSION_STALE" && f.detail.includes("Long Gone Section")),
    );
  } finally {
    cleanup(dir);
  }
});

test("EXCLUSION_STALE: removing an excluded_sections entry's heading from CLAUDE.md is caught", () => {
  const dir = cleanFixture();
  writeFiles(dir, {
    // "The Next Section" is still listed in excluded_sections (the default),
    // but no longer appears in CLAUDE.md.
    "CLAUDE.md": [
      "## Workflow Protocol",
      "",
      "Unrelated top-level section that groups subsections; not itself a row.",
      "",
      `### ${MIRROR_HEADING}`,
      "",
      ...MIRROR_BODY,
      "",
    ].join("\n"),
  });
  try {
    const result = checkAllProtocolCoverage(dir);
    assert.ok(
      result.findings.some((f) => f.code === "EXCLUSION_STALE" && f.detail.includes("The Next Section")),
    );
  } finally {
    cleanup(dir);
  }
});

test("ROUTER_STALE: router does not match the manifest", () => {
  const dir = cleanFixture({ router: "stale content, not generated from the manifest\n" });
  try {
    const result = checkAllProtocolCoverage(dir);
    assert.ok(findingCodes(result).includes("ROUTER_STALE"));
  } finally {
    cleanup(dir);
  }
});

test("ROUTER_STALE: router file missing entirely", () => {
  const dir = makeFixture();
  writeFiles(dir, {
    "CLAUDE.md": claudeMdFixture(),
    [SCHEMA_PATH]: REAL_SCHEMA,
    [MANIFEST_PATH]: manifestYaml([manifestRow()]),
    "docs/governance/protocols/EXAMPLE_PROTOCOL.md": mirrorFile(),
  });
  try {
    const result = checkAllProtocolCoverage(dir);
    assert.ok(findingCodes(result).includes("ROUTER_STALE"));
  } finally {
    cleanup(dir);
  }
});

test("DECISION_ID_UNCOVERED: a decision id named inside a covered section is a warning, not a finding", () => {
  const dir = cleanFixture({
    rows: [manifestRow()],
  });
  writeFiles(dir, {
    "CLAUDE.md": claudeMdFixture({ bodyLines: [...MIRROR_BODY, "See DEC-88888888-Q for background."] }),
  });
  try {
    const result = checkAllProtocolCoverage(dir);
    assert.deepEqual(result.findings, []);
    assert.ok(
      result.warnings.some((w) => w.code === "DECISION_ID_UNCOVERED" && w.detail.includes("DEC-88888888-Q")),
    );
  } finally {
    cleanup(dir);
  }
});

test("real repository: docs/project/protocol-coverage.yaml and the generated router pass with no findings", () => {
  const result = checkAllProtocolCoverage(realRoot);
  assert.deepEqual(result.findings, []);
  // The "Review routing" section names both DEC-20260903-A (this row's
  // decision, which created npm run codex:check) and DEC-20260910-A (the
  // amendment that waived the register), so one of the two is always
  // report-only DECISION_ID_UNCOVERED -- see the row's decision_record_note
  // in docs/project/protocol-coverage.yaml. Not a finding; becomes blocking
  // guard scope only at the M4 cutover per this file's header.
  assert.deepEqual(
    result.warnings.map((w) => w.code),
    ["DECISION_ID_UNCOVERED"],
  );
  assert.ok(result.warnings[0].detail.includes("DEC-20260910-A"));
});

test("real repository: two generations of the router are byte-identical (deterministic)", () => {
  const manifest = loadManifest(realRoot);
  const first = protocolRouterMarkdown(manifest);
  const second = protocolRouterMarkdown(manifest);
  assert.equal(first, second);
  assert.equal(first, readFileSync(resolve(realRoot, ROUTER_PATH), "utf8"));
});
