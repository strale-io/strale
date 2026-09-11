// Tests for the shadow distribution-surfaces register (M3 batch 3, T6,
// scripts/distribution-lib.mjs, scripts/check-distribution.mjs,
// docs/operations/distribution-registry.yaml). Every failure mode is
// planted in a throwaway fixture and must fail there; the clean fixture and
// the real, committed register must both pass. Shadow mode: none of this
// changes what the production digest reads or renders, and the register is
// not authoritative until the founder-gated M4 cutover.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  checkAllDistribution,
  checkSchema,
  checkUniqueIds,
  checkAuthorityActiveFalse,
  checkEvidenceExists,
  checkStatusDateNotFuture,
  repoNativeDistributionSurfaces,
  compareDistributionSurfaces,
  repoRootFrom,
  REGISTER_PATH,
  SCHEMA_PATH,
} from "./distribution-lib.mjs";

const realRoot = repoRootFrom(import.meta.url);

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
  return mkdtempSync(join(tmpdir(), "distribution-lib-"));
}

/** A minimal, clean fixture: schema copied from the real repo (it never
 * changes across fixtures), one valid surface row, one existing evidence
 * path. */
function writeCleanFixture(dir) {
  cpSync(join(realRoot, SCHEMA_PATH), join(dir, SCHEMA_PATH));
  writeFiles(dir, {
    "some/evidence.md": "proof",
  });
  const yamlText = [
    "schema_version: 1",
    "authority_active: false",
    "surfaces:",
    "  - id: example-one",
    "    surface: Example One",
    "    kind: directory",
    "    target: example/one",
    "    status: open",
    "    status_date: 2026-01-01",
    "    evidence: some/evidence.md",
  ].join("\n");
  writeFiles(dir, { [REGISTER_PATH]: yamlText });
}

// ── Clean fixture: every check passes ───────────────────────────────────

test("checkAllDistribution: a clean fixture has zero findings", () => {
  const dir = makeFixture();
  try {
    writeCleanFixture(dir);
    const { findings, surfaceCount } = checkAllDistribution(dir, { now: new Date("2026-06-01") });
    assert.deepEqual(findings, []);
    assert.equal(surfaceCount, 1);
  } finally {
    cleanup(dir);
  }
});

// ── Planted failure: SCHEMA_INVALID ─────────────────────────────────────

test("checkSchema: fails when authority_active is not false", () => {
  const dir = makeFixture();
  try {
    cpSync(join(realRoot, SCHEMA_PATH), join(dir, SCHEMA_PATH));
    writeFiles(dir, {
      [REGISTER_PATH]: [
        "schema_version: 1",
        "authority_active: true",
        "surfaces: []",
      ].join("\n"),
    });
    const { findings, valid } = checkSchema(dir);
    assert.equal(valid, false);
    assert.ok(findings.some((f) => f.code === "SCHEMA_INVALID"));
  } finally {
    cleanup(dir);
  }
});

test("checkSchema: fails when a surface is missing a required field", () => {
  const dir = makeFixture();
  try {
    cpSync(join(realRoot, SCHEMA_PATH), join(dir, SCHEMA_PATH));
    writeFiles(dir, {
      [REGISTER_PATH]: [
        "schema_version: 1",
        "authority_active: false",
        "surfaces:",
        "  - id: missing-target",
        "    surface: Missing Target",
        "    kind: directory",
        "    status: open",
        "    status_date: 2026-01-01",
        "    evidence: some/evidence.md",
      ].join("\n"),
    });
    const { findings, valid } = checkSchema(dir);
    assert.equal(valid, false);
    assert.ok(findings.some((f) => f.code === "SCHEMA_INVALID"));
  } finally {
    cleanup(dir);
  }
});

// ── Planted failure: DUPLICATE_ID ───────────────────────────────────────

test("checkUniqueIds: fails when two surfaces share an id", () => {
  const register = {
    surfaces: [
      { id: "dup", surface: "A" },
      { id: "dup", surface: "B" },
    ],
  };
  const findings = checkUniqueIds(register);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "DUPLICATE_ID");
});

test("checkUniqueIds: passes when all ids are unique", () => {
  const register = {
    surfaces: [
      { id: "one", surface: "A" },
      { id: "two", surface: "B" },
    ],
  };
  assert.deepEqual(checkUniqueIds(register), []);
});

// ── Planted failure: AUTHORITY_ACTIVE_NOT_FALSE ─────────────────────────

test("checkAuthorityActiveFalse: fails when authority_active is true", () => {
  const findings = checkAuthorityActiveFalse({ authority_active: true });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "AUTHORITY_ACTIVE_NOT_FALSE");
});

test("checkAuthorityActiveFalse: passes when authority_active is false", () => {
  assert.deepEqual(checkAuthorityActiveFalse({ authority_active: false }), []);
});

// ── Planted failure: EVIDENCE_PATH_MISSING ──────────────────────────────

test("checkEvidenceExists: fails when a repo-path evidence value does not exist", () => {
  const dir = makeFixture();
  try {
    const register = {
      surfaces: [{ id: "broken", evidence: "does/not/exist.md" }],
    };
    const findings = checkEvidenceExists(dir, register);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].code, "EVIDENCE_PATH_MISSING");
  } finally {
    cleanup(dir);
  }
});

test("checkEvidenceExists: passes for an existing repo path and a well-formed URL, without fetching it", () => {
  const dir = makeFixture();
  try {
    writeFiles(dir, { "real/file.md": "here" });
    const register = {
      surfaces: [
        { id: "path-ok", evidence: "real/file.md" },
        { id: "url-ok", evidence: "https://example.invalid/definitely-not-fetched" },
      ],
    };
    assert.deepEqual(checkEvidenceExists(dir, register), []);
  } finally {
    cleanup(dir);
  }
});

// ── Planted failure: STATUS_DATE_IN_FUTURE ──────────────────────────────

test("checkStatusDateNotFuture: fails when status_date is after now", () => {
  const register = { surfaces: [{ id: "future", status_date: "2099-01-01" }] };
  const findings = checkStatusDateNotFuture(register, { now: new Date("2026-06-01") });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "STATUS_DATE_IN_FUTURE");
});

test("checkStatusDateNotFuture: passes for today and the past", () => {
  const register = {
    surfaces: [
      { id: "today", status_date: "2026-06-01" },
      { id: "past", status_date: "2020-01-01" },
    ],
  };
  const findings = checkStatusDateNotFuture(register, { now: new Date("2026-06-01") });
  assert.deepEqual(findings, []);
});

// ── compareDistributionSurfaces: data only, case-insensitive/trimmed match ─

test("compareDistributionSurfaces: counts, and names present on only one side, matched case-insensitively after trimming", () => {
  const repo = [
    { name: "  Glama MCP Directory  ", status: "listed" },
    { name: "repo-only surface", status: "open" },
  ];
  const notion = [
    { name: "glama mcp directory", status: "listed" },
    { name: "notion-only surface", status: "open" },
  ];
  const comparison = compareDistributionSurfaces(repo, notion);
  assert.equal(comparison.repoCount, 2);
  assert.equal(comparison.notionCount, 2);
  assert.deepEqual(comparison.repoOnly, ["repo-only surface"]);
  assert.deepEqual(comparison.notionOnly, ["notion-only surface"]);
});

// ── repoNativeDistributionSurfaces: shape ───────────────────────────────

test("repoNativeDistributionSurfaces: maps register rows to { name, status }", () => {
  const dir = makeFixture();
  try {
    writeCleanFixture(dir);
    const surfaces = repoNativeDistributionSurfaces(dir);
    assert.deepEqual(surfaces, [{ name: "Example One", status: "open" }]);
  } finally {
    cleanup(dir);
  }
});

// ── Real-repo test: the committed register passes today ────────────────

test("checkAllDistribution runs against the live repository with zero findings", () => {
  const { findings, surfaceCount } = checkAllDistribution(realRoot);
  assert.deepEqual(findings, []);
  assert.ok(surfaceCount > 0, "expected at least one surface in the committed register");
});

test("repoNativeDistributionSurfaces runs against the live repository without error", () => {
  const surfaces = repoNativeDistributionSurfaces(realRoot);
  assert.ok(Array.isArray(surfaces));
  assert.ok(surfaces.length > 0);
  for (const s of surfaces) {
    assert.equal(typeof s.name, "string");
    assert.equal(typeof s.status, "string");
  }
});
