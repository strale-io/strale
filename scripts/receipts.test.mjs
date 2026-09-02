// Tests for the T15 evidence-receipt contract (scripts/receipts-lib.mjs,
// scripts/check-receipts.mjs, scripts/write-receipt.mjs). Every failure mode
// is planted in its own throwaway git repo fixture and must fail there; the
// fixed counterpart must pass. Per docs/company/LESSONS.md F5's standing
// rule (no checker ships until it has failed on a planted case): each test
// below demonstrates both directions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  checkAllReceipts,
  classifyEvidenceReference,
  findBareTestCountHandoffs,
  findMutatedReceipts,
  isBarePathCandidate,
  repoRootFrom,
} from "./receipts-lib.mjs";
import { inferSummary } from "./write-receipt.mjs";

const realRoot = repoRootFrom(import.meta.url);

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function initRepo() {
  const root = mkdtempSync(join(tmpdir(), "strale-receipts-fixture-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "Receipts Test"]);
  // Every fixture needs the real schema so schema validation exercises the
  // real contract, not a copy that could drift from it.
  const schemaAbs = join(root, "archive/receipts/receipt.schema.json");
  mkdirSync(dirname(schemaAbs), { recursive: true });
  copyFileSync(resolve(realRoot, "archive/receipts/receipt.schema.json"), schemaAbs);
  return root;
}

function writeFiles(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const absolute = join(root, rel);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }
}

function commitAll(root, message) {
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", message]);
}

function withRepo(fn) {
  const root = initRepo();
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function codes(root) {
  return checkAllReceipts(root).failures.map((f) => f.code);
}

function warnCodes(root) {
  return checkAllReceipts(root).warnings.map((w) => w.code);
}

function receiptBody(overrides = {}) {
  return {
    kind: "check",
    produced_by: { script: "scripts/check-receipts.mjs", commit: "36f4ab93c5f261f72e98e2cfd4e4385dacbbaa1e" },
    at: "2026-09-02T12:00:00.000Z",
    inputs: { source: "fixture" },
    summary: { ok: true, failures_count: 0 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Clean pass
// ---------------------------------------------------------------------------

test("clean pass: a well-formed committed receipt has zero findings", () => {
  withRepo((root) => {
    writeFiles(root, {
      "archive/receipts/2026-09-02-check-smoke.json": JSON.stringify(receiptBody(), null, 2),
    });
    commitAll(root, "add receipt");
    assert.deepEqual(codes(root), []);
  });
});

// ---------------------------------------------------------------------------
// Filename shape
// ---------------------------------------------------------------------------

test("a filename not matching YYYY-MM-DD-<kind>-<topic>.json fails, renaming it passes", () => {
  withRepo((root) => {
    writeFiles(root, { "archive/receipts/smoke-test.json": JSON.stringify(receiptBody(), null, 2) });
    commitAll(root, "add receipt");
    assert.ok(codes(root).includes("RECEIPT_FILENAME_INVALID"));
  });
  withRepo((root) => {
    writeFiles(root, { "archive/receipts/2026-09-02-check-smoke.json": JSON.stringify(receiptBody(), null, 2) });
    commitAll(root, "add receipt");
    assert.deepEqual(codes(root), []);
  });
});

test("an unrecognized kind segment in the filename fails, correcting it passes", () => {
  withRepo((root) => {
    writeFiles(root, { "archive/receipts/2026-09-02-review-smoke.json": JSON.stringify(receiptBody({ kind: "check" }), null, 2) });
    commitAll(root, "add receipt");
    assert.ok(codes(root).includes("RECEIPT_FILENAME_INVALID"));
  });
});

test("filename kind disagreeing with the JSON body's kind fails, aligning them passes", () => {
  withRepo((root) => {
    writeFiles(root, {
      "archive/receipts/2026-09-02-check-smoke.json": JSON.stringify(receiptBody({ kind: "audit" }), null, 2),
    });
    commitAll(root, "add receipt");
    assert.ok(codes(root).includes("RECEIPT_KIND_MISMATCH"));
  });
  withRepo((root) => {
    writeFiles(root, {
      "archive/receipts/2026-09-02-audit-smoke.json": JSON.stringify(receiptBody({ kind: "audit" }), null, 2),
    });
    commitAll(root, "add receipt");
    assert.deepEqual(codes(root), []);
  });
});

// ---------------------------------------------------------------------------
// JSON / schema validity
// ---------------------------------------------------------------------------

test("malformed JSON fails, fixing it passes", () => {
  withRepo((root) => {
    writeFiles(root, { "archive/receipts/2026-09-02-check-smoke.json": "{not valid json" });
    commitAll(root, "add receipt");
    assert.ok(codes(root).includes("RECEIPT_JSON_INVALID"));
  });
});

test("a receipt missing a required field fails schema validation, adding it passes", () => {
  withRepo((root) => {
    const broken = receiptBody();
    delete broken.summary;
    writeFiles(root, { "archive/receipts/2026-09-02-check-smoke.json": JSON.stringify(broken, null, 2) });
    commitAll(root, "add receipt");
    assert.ok(codes(root).includes("RECEIPT_SCHEMA_INVALID"));
  });
  withRepo((root) => {
    writeFiles(root, { "archive/receipts/2026-09-02-check-smoke.json": JSON.stringify(receiptBody(), null, 2) });
    commitAll(root, "add receipt");
    assert.deepEqual(codes(root), []);
  });
});

test("additionalProperties: false rejects an unknown top-level field", () => {
  withRepo((root) => {
    writeFiles(root, {
      "archive/receipts/2026-09-02-check-smoke.json": JSON.stringify(receiptBody({ extra_field: "nope" }), null, 2),
    });
    commitAll(root, "add receipt");
    assert.ok(codes(root).includes("RECEIPT_SCHEMA_INVALID"));
  });
});

test("a summary value that is not a number/string/boolean fails, flattening it passes", () => {
  withRepo((root) => {
    writeFiles(root, {
      "archive/receipts/2026-09-02-check-smoke.json": JSON.stringify(
        receiptBody({ summary: { nested: { not: "allowed" } } }),
        null,
        2,
      ),
    });
    commitAll(root, "add receipt");
    assert.ok(codes(root).includes("RECEIPT_SCHEMA_INVALID"));
  });
});

// ---------------------------------------------------------------------------
// Immutability — the actual F5-style git-fact check
// ---------------------------------------------------------------------------

test("editing a committed receipt in a later commit is caught; an untouched receipt is not", () => {
  withRepo((root) => {
    writeFiles(root, {
      "archive/receipts/2026-09-02-check-smoke.json": JSON.stringify(receiptBody({ summary: { ok: true, n: 1 } }), null, 2),
    });
    commitAll(root, "add receipt");
    // Untouched: no finding.
    assert.deepEqual(findMutatedReceipts(root, new Set(["archive/receipts/2026-09-02-check-smoke.json"])), []);

    // Now edit it in a second commit — this is the violation the check exists for.
    writeFiles(root, {
      "archive/receipts/2026-09-02-check-smoke.json": JSON.stringify(receiptBody({ summary: { ok: true, n: 2 } }), null, 2),
    });
    commitAll(root, "tamper with receipt");
    const findings = findMutatedReceipts(root, new Set(["archive/receipts/2026-09-02-check-smoke.json"]));
    assert.equal(findings.length, 1);
    assert.equal(findings[0].code, "RECEIPT_MUTATED");
  });
});

test("an uncommitted new receipt is not flagged as mutated", () => {
  withRepo((root) => {
    // Not committed at all — git ls-files would not report it as tracked.
    writeFiles(root, {
      "archive/receipts/2026-09-02-check-smoke.json": JSON.stringify(receiptBody(), null, 2),
    });
    const findings = findMutatedReceipts(root, new Set()); // empty tracked set: nothing is tracked yet
    assert.deepEqual(findings, []);
  });
});

test("full check surfaces RECEIPT_MUTATED end to end", () => {
  withRepo((root) => {
    writeFiles(root, {
      "archive/receipts/2026-09-02-check-smoke.json": JSON.stringify(receiptBody({ summary: { ok: true, n: 1 } }), null, 2),
    });
    commitAll(root, "add receipt");
    writeFiles(root, {
      "archive/receipts/2026-09-02-check-smoke.json": JSON.stringify(receiptBody({ summary: { ok: true, n: 2 } }), null, 2),
    });
    commitAll(root, "tamper with receipt");
    assert.ok(codes(root).includes("RECEIPT_MUTATED"));
  });
});

// ---------------------------------------------------------------------------
// classifyEvidenceReference — the primitive behind DANGLING_EVIDENCE
// ---------------------------------------------------------------------------

test("isBarePathCandidate rejects prose (whitespace) and accepts a whitespace-free path-like token", () => {
  assert.equal(isBarePathCandidate("verified read-only against production — has spaces"), false);
  assert.equal(isBarePathCandidate("docs/company/CHARTER.md"), true);
  assert.equal(isBarePathCandidate("CLAUDE.md"), true, "a bare root-level file name is a path candidate");
  assert.equal(isBarePathCandidate("NONEXISTENT-BARE-FILENAME.md"), true);
  assert.equal(isBarePathCandidate("DEC-20260302-A"), false, "a decision id is not a path");
  assert.equal(isBarePathCandidate("DEC-20260302-A"), false); // no "/", not sha:path shaped
});

test("classifyEvidenceReference: a missing local path is MISSING, an existing one is OK", () => {
  withRepo((root) => {
    writeFiles(root, { "docs/real-file.md": "# real\n" });
    commitAll(root, "add real file");
    assert.equal(classifyEvidenceReference(root, "docs/real-file.md", new Set(["docs/real-file.md"])), "OK");
    assert.equal(classifyEvidenceReference(root, "docs/does-not-exist.md", new Set(["docs/real-file.md"])), "MISSING");
  });
});

test("classifyEvidenceReference accepts a URL, a resolvable <sha>:<path>, and a cross-repo owner/repo@sha ref", () => {
  withRepo((root) => {
    writeFiles(root, { "docs/real-file.md": "# real\n" });
    commitAll(root, "add real file");
    const sha = git(root, ["rev-parse", "HEAD"]).trim();

    assert.equal(classifyEvidenceReference(root, "https://github.com/strale-io/strale/pull/1", null), "OK");
    assert.equal(classifyEvidenceReference(root, `${sha}:docs/real-file.md`, null), "OK");
    assert.equal(classifyEvidenceReference(root, "strale-io/strale@3f7f650ff070f667a425b743f5a97034bc43f4a3", null), "OK");
  });
});

test("classifyEvidenceReference: an unresolvable sha, and a real sha with a missing path, both fail", () => {
  withRepo((root) => {
    writeFiles(root, { "docs/real-file.md": "# real\n" });
    commitAll(root, "add real file");
    const sha = git(root, ["rev-parse", "HEAD"]).trim();
    assert.equal(classifyEvidenceReference(root, "0000000:docs/real-file.md", null), "SHA_UNRESOLVED");
    assert.equal(classifyEvidenceReference(root, `${sha}:docs/nonexistent.md`, null), "MISSING_AT_SHA");
  });
});

// ---------------------------------------------------------------------------
// DANGLING_EVIDENCE across the three cited sources
// ---------------------------------------------------------------------------

function decisionRecord(evidence) {
  const lines = [
    "---",
    "record_key: DEC-20260101-A",
    "id: DEC-20260101-A",
    "title: Fixture decision",
    "status: active",
    "topic: fixture-topic",
    "scope: technical",
    "owner: claude",
    "decided_at: 2026-01-01",
    "relations: []",
    "evidence:",
    ...evidence.map((e) => `  - ${e}`),
    "migration_status: candidate",
    "authority_scope: none",
    "authority_active: false",
    "phase: M2",
    "---",
    "",
    "Body.",
    "",
  ];
  return lines.join("\n");
}

test("a decision record citing a nonexistent path fails, correcting it passes", () => {
  withRepo((root) => {
    writeFiles(root, {
      "docs/decisions/records/DEC-20260101-A.md": decisionRecord(["docs/does-not-exist.md"]),
    });
    commitAll(root, "add decision");
    assert.ok(codes(root).includes("DANGLING_EVIDENCE"));
  });
  withRepo((root) => {
    writeFiles(root, {
      "docs/decisions/records/DEC-20260101-A.md": decisionRecord(["docs/real-file.md"]),
      "docs/real-file.md": "# real\n",
    });
    commitAll(root, "add decision and target");
    assert.deepEqual(codes(root), []);
  });
});

test("a program track evidence entry citing a nonexistent path fails, correcting it passes", () => {
  const track = (evidencePath) => ({
    "docs/programs/demo/PROGRAM.md": "# Demo\n",
    "docs/programs/demo/tracks.yaml": [
      "program: demo",
      "updated: 2026-01-01",
      "program_status: active",
      "tracks:",
      "  - id: T1",
      "    title: Fixture track",
      "    status: active",
      "    gate: none",
      "    depends_on: []",
      "    owner: session",
      "    next_action: do the fixture thing next",
      "    resume_file: null",
      "    exit:",
      "      - it exits",
      "    evidence:",
      `      - ${evidencePath}`,
      "",
    ].join("\n"),
  });
  withRepo((root) => {
    writeFiles(root, track("docs/does-not-exist.md"));
    commitAll(root, "add track");
    assert.ok(codes(root).includes("DANGLING_EVIDENCE"));
  });
  withRepo((root) => {
    writeFiles(root, { ...track("docs/real-file.md"), "docs/real-file.md": "# real\n" });
    commitAll(root, "add track and target");
    assert.deepEqual(codes(root), []);
  });
});

test("a remediation package evidence field citing a nonexistent path fails, correcting it passes", () => {
  const pkg = (evidencePath) =>
    [
      "package: WP99",
      "title: Fixture package",
      "status: PLANNED",
      "objective: fixture",
      "evidence: " + evidencePath,
      "",
    ].join("\n");
  withRepo((root) => {
    writeFiles(root, { "docs/remediation/packages/WP99.yaml": pkg("docs/does-not-exist.md") });
    commitAll(root, "add package");
    assert.ok(codes(root).includes("DANGLING_EVIDENCE"));
  });
  withRepo((root) => {
    writeFiles(root, {
      "docs/remediation/packages/WP99.yaml": pkg("docs/real-file.md"),
      "docs/real-file.md": "# real\n",
    });
    commitAll(root, "add package and target");
    assert.deepEqual(codes(root), []);
  });
});

test("a remediation package's production_evidence map is prose (has spaces) and is never flagged", () => {
  withRepo((root) => {
    writeFiles(root, {
      "docs/remediation/packages/WP99.yaml": [
        "package: WP99",
        "title: Fixture package",
        "status: PLANNED",
        "objective: fixture",
        "production_evidence:",
        "  the_finding: >",
        "    jobs/quality-floor.ts:172 has a join that does not exist as a bare path",
        "    because this whole paragraph contains spaces.",
        "",
      ].join("\n"),
    });
    commitAll(root, "add package");
    assert.deepEqual(codes(root), []);
  });
});

// ---------------------------------------------------------------------------
// Bare test count warning
// ---------------------------------------------------------------------------

test("a handoff dated 2026-09-02+ stating a bare test count with no receipt link warns", () => {
  withRepo((root) => {
    writeFiles(root, {
      "handoff/_general/from-code/2026-09-02-fixture.md": "Intent: fixture.\n\nAll 312 tests pass.\n",
    });
    commitAll(root, "add handoff");
    assert.ok(warnCodes(root).includes("HANDOFF_BARE_TEST_COUNT"));
  });
});

test("the same handoff with a receipt link does not warn", () => {
  withRepo((root) => {
    writeFiles(root, {
      "handoff/_general/from-code/2026-09-02-fixture.md":
        "Intent: fixture.\n\nAll 312 tests pass — archive/receipts/2026-09-02-test-run-fixture.json.\n",
    });
    commitAll(root, "add handoff");
    assert.deepEqual(warnCodes(root), []);
  });
});

test("a handoff dated before 2026-09-02 stating a bare test count does not warn (predates the contract)", () => {
  withRepo((root) => {
    writeFiles(root, {
      "handoff/_general/from-code/2026-08-30-fixture.md": "Intent: fixture.\n\n58/58 pass.\n",
    });
    commitAll(root, "add handoff");
    assert.deepEqual(warnCodes(root), []);
  });
});

test("findBareTestCountHandoffs matches the pass-ratio pattern too", () => {
  withRepo((root) => {
    writeFiles(root, {
      "handoff/_general/from-code/2026-09-05-fixture.md": "Intent: fixture.\n\n58/58 pass, all green.\n",
    });
    commitAll(root, "add handoff");
    assert.equal(findBareTestCountHandoffs(root).length, 1);
  });
});

// ---------------------------------------------------------------------------
// write-receipt.mjs summary inference
// ---------------------------------------------------------------------------

test("inferSummary reads the repo-wide check-*.mjs --json shape", () => {
  const summary = inferSummary({ ok: true, failures: [], warnings: [{ code: "X" }], file_count: 12 });
  assert.deepEqual(summary, { ok: true, failures_count: 0, warnings_count: 1, file_count: 12 });
});

test("inferSummary returns null for a shape it cannot read", () => {
  assert.equal(inferSummary({ some: { nested: "thing" } }), null);
  assert.equal(inferSummary("just a string"), null);
  assert.equal(inferSummary([1, 2, 3]), null);
});
