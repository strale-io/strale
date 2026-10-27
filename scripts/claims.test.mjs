// Tests for the T14 claims register contract (scripts/claims-lib.mjs,
// scripts/check-claims.mjs). Every failure mode is planted in its own
// throwaway directory fixture and must fail there; the fixed counterpart
// must pass. See archive/sessions/2026-09-02-t14-cheap-extras-plan.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { stringify, parse as parseYaml } from "yaml";
import { checkAllClaims, checkForbiddenClaims, compileMatcher, repoRootFrom, REGISTER_PATH, SCHEMA_PATH, SOURCE_TARGETS } from "./claims-lib.mjs";

const realRoot = repoRootFrom(import.meta.url);
const realSchema = readFileSync(join(realRoot, SCHEMA_PATH), "utf8");

function writeFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const absolute = join(dir, rel);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }
}

function baseRow(overrides = {}) {
  return {
    id: "test-claim",
    claim: "unlikely test phrase xyzzy",
    status: "allowed",
    evidence: "README.md",
    surfaces: ["homepage"],
    decided_by: "founder-2026-09-02",
    ...overrides,
  };
}

function makeFixture(rows, surfaceFiles = {}) {
  const dir = mkdtempSync(join(tmpdir(), "claims-test-"));
  writeFiles(dir, {
    [SCHEMA_PATH]: realSchema,
    [REGISTER_PATH]: stringify(rows),
    "README.md": "Nothing interesting here.\n",
    ...Object.fromEntries(SOURCE_TARGETS.map(file => [file, ""])),
    ...surfaceFiles,
  });
  return dir;
}

test("a clean register with no matching surfaces passes", () => {
  const dir = makeFixture([baseRow()]);
  const { findings, warnings } = checkAllClaims(dir);
  assert.deepEqual(findings, []);
  assert.deepEqual(warnings, []);
  rmSync(dir, { recursive: true, force: true });
});

test("SCHEMA_INVALID: a row missing a required field", () => {
  const dir = makeFixture([{ id: "x", claim: "y" }]);
  const { findings } = checkAllClaims(dir);
  assert.ok(findings.some((f) => f.code === "SCHEMA_INVALID"));
  rmSync(dir, { recursive: true, force: true });
});

test("SCHEMA_INVALID: status outside the enum", () => {
  const dir = makeFixture([baseRow({ status: "vibes-based" })]);
  const { findings } = checkAllClaims(dir);
  assert.ok(findings.some((f) => f.code === "SCHEMA_INVALID"));
  rmSync(dir, { recursive: true, force: true });
});

test("MISSING_EVIDENCE: an allowed row with no evidence field", () => {
  const dir = makeFixture([{ id: "x", claim: "y", status: "allowed", surfaces: ["homepage"], decided_by: "founder-2026-09-02" }]);
  const { findings } = checkAllClaims(dir);
  assert.ok(findings.some((f) => f.code === "MISSING_EVIDENCE"));
  rmSync(dir, { recursive: true, force: true });
});

test("a forbidden row needs no evidence field", () => {
  const dir = makeFixture([
    { id: "x", claim: "banned phrase", status: "forbidden", surfaces: ["homepage"], decided_by: "founder-2026-09-02" },
  ]);
  const { findings } = checkAllClaims(dir);
  assert.equal(findings.filter((f) => f.code === "MISSING_EVIDENCE").length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("DUPLICATE_CLAIM_ID: the same id twice", () => {
  const dir = makeFixture([baseRow(), baseRow()]);
  const { findings } = checkAllClaims(dir);
  assert.ok(findings.some((f) => f.code === "DUPLICATE_CLAIM_ID"));
  rmSync(dir, { recursive: true, force: true });
});

test("FORBIDDEN_CLAIM_FOUND: a literal phrase appears in README.md", () => {
  const dir = makeFixture(
    [{ id: "x", claim: "SOC 2 certified", status: "forbidden", surfaces: ["homepage"], decided_by: "founder-2026-09-02" }],
    { "README.md": "We are SOC 2 certified and proud of it.\n" },
  );
  const { findings } = checkAllClaims(dir);
  assert.ok(findings.some((f) => f.code === "FORBIDDEN_CLAIM_FOUND" && f.file === "README.md"));
  rmSync(dir, { recursive: true, force: true });
});

test("FORBIDDEN_CLAIM_FOUND: a regex claim matches a package README", () => {
  const dir = makeFixture(
    [{ id: "x", claim: "\\btrusted by\\s+\\d+\\b", is_regex: true, status: "forbidden", surfaces: ["homepage"], decided_by: "founder-2026-09-02" }],
    { "packages/example-pkg/README.md": "Trusted by 500 companies worldwide.\n" },
  );
  const { findings } = checkAllClaims(dir);
  assert.ok(findings.some((f) => f.code === "FORBIDDEN_CLAIM_FOUND" && f.file === "packages/example-pkg/README.md"));
  rmSync(dir, { recursive: true, force: true });
});

test("FORBIDDEN_CLAIM_FOUND: a manifest description field matches", () => {
  const dir = makeFixture(
    [{ id: "x", claim: "guaranteed accurate", status: "forbidden", surfaces: ["homepage"], decided_by: "founder-2026-09-02" }],
    { "manifests/example-cap.yaml": "slug: example-cap\ndescription: This capability is guaranteed accurate always.\n" },
  );
  const { findings } = checkAllClaims(dir);
  assert.ok(findings.some((f) => f.code === "FORBIDDEN_CLAIM_FOUND" && f.file === "manifests/example-cap.yaml"));
  rmSync(dir, { recursive: true, force: true });
});

test("FORBIDDEN_CLAIM_FOUND: platform-facts.ts matches", () => {
  const dir = makeFixture(
    [{ id: "x", claim: "99.9% uptime", status: "forbidden", surfaces: ["homepage"], decided_by: "founder-2026-09-02" }],
    { "apps/api/src/lib/platform-facts.ts": "// we guarantee 99.9% uptime\nexport const x = 1;\n" },
  );
  const { findings } = checkAllClaims(dir);
  assert.ok(findings.some((f) => f.code === "FORBIDDEN_CLAIM_FOUND" && f.file === "apps/api/src/lib/platform-facts.ts"));
  rmSync(dir, { recursive: true, force: true });
});

test("a status:retired row is never scanned for, even if the phrase is present", () => {
  const dir = makeFixture(
    [{ id: "x", claim: "old retired phrase", status: "retired", surfaces: ["homepage"], decided_by: "founder-2026-09-02" }],
    { "README.md": "This has the old retired phrase right here.\n" },
  );
  const { findings } = checkAllClaims(dir);
  assert.equal(findings.filter((f) => f.code === "FORBIDDEN_CLAIM_FOUND").length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("EVIDENCE_UNRESOLVED: a needs_evidence row whose evidence path doesn't exist is a warning, not a failure", () => {
  const dir = makeFixture([baseRow({ status: "needs_evidence", evidence: "docs/does-not-exist.md" })]);
  const { findings, warnings } = checkAllClaims(dir);
  assert.equal(findings.length, 0);
  assert.ok(warnings.some((w) => w.code === "EVIDENCE_UNRESOLVED"));
  rmSync(dir, { recursive: true, force: true });
});

test("EVIDENCE_UNRESOLVED: an http(s) evidence URL is treated as resolved without a network call", () => {
  const dir = makeFixture([baseRow({ status: "needs_evidence", evidence: "https://example.com/proof" })]);
  const { warnings } = checkAllClaims(dir);
  assert.equal(warnings.filter((w) => w.code === "EVIDENCE_UNRESOLVED").length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("an allowed row's evidence not resolving is also only a warning (the plan scopes the resolve check to needs_evidence, but a broken evidence path on an allowed claim shouldn't silently pass either)", () => {
  // Documents current behaviour precisely: checkEvidenceResolves only
  // walks needs_evidence rows per the plan text ("warns on needs_evidence
  // claims whose evidence does not resolve"). An allowed row with bad
  // evidence produces neither a finding nor a warning today.
  const dir = makeFixture([baseRow({ status: "allowed", evidence: "docs/does-not-exist.md" })]);
  const { findings, warnings } = checkAllClaims(dir);
  assert.equal(findings.length, 0);
  assert.equal(warnings.filter((w) => w.code === "EVIDENCE_UNRESOLVED").length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("INVALID_CLAIM_PATTERN: an unparseable regex claim", () => {
  const dir = makeFixture([{ id: "x", claim: "(unclosed", is_regex: true, status: "forbidden", surfaces: ["homepage"], decided_by: "founder-2026-09-02" }]);
  const { findings } = checkAllClaims(dir);
  assert.ok(findings.some((f) => f.code === "INVALID_CLAIM_PATTERN"));
  rmSync(dir, { recursive: true, force: true });
});

test("a literal (non-regex) claim containing regex special characters matches only literally", () => {
  const dir = makeFixture(
    [{ id: "x", claim: "99.9% uptime", status: "forbidden", surfaces: ["homepage"], decided_by: "founder-2026-09-02" }],
    { "README.md": "We do NOT claim 9999% uptime anywhere.\n" },
  );
  const { findings } = checkAllClaims(dir);
  // "." in "99.9%" must not act as a wildcard and match "9999%".
  assert.equal(findings.filter((f) => f.code === "FORBIDDEN_CLAIM_FOUND").length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("real repo: claims register is currently clean against every scanned surface", () => {
  const { findings, warnings } = checkAllClaims(realRoot);
  assert.deepEqual(findings, []);
  // Surfaces outside this repository (the frontend's llms.txt) may carry a
  // forbidden claim this repo cannot fix; they are reported, never fatal.
  assert.deepEqual(warnings.filter((w) => w.code !== "FORBIDDEN_CLAIM_EXTERNAL"), []);
});

test("a forbidden row written as /pattern/ matches prose on a surface; a literal row matches verbatim", () => {
  const dir = mkdtempSync(join(tmpdir(), "claims-slash-"));
  try {
    writeFileSync(join(dir, "README.md"), "Strale is enterprise-ready, SOC 2 certified, and trusted by 500+ companies.\n");
    const rows = [
      { id: "soc2", claim: "/\\bSOC\\s*2\\b/", status: "forbidden", surfaces: ["README"] },
      { id: "social-proof", claim: "/\\b(trusted by|used by)\\s+\\d+(\\+|\\s*(companies|customers))?\\b/", status: "forbidden", surfaces: ["README"] },
      { id: "literal", claim: "enterprise-ready", status: "forbidden", surfaces: ["README"] },
      { id: "absent", claim: "/\\bISO 27001\\b/", status: "forbidden", surfaces: ["README"] },
    ];
    const found = checkForbiddenClaims(dir, rows).filter((f) => f.code === "FORBIDDEN_CLAIM_FOUND").map((f) => f.detail.match(/forbidden claim "([^"]+)"/)[1]).sort();
    assert.deepEqual(found, ["literal", "soc2", "social-proof"]);
    assert.equal(compileMatcher({ claim: "/abc/g" }).flags, "gi");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const file of ["server.json", "smithery.yaml", "glama.json", "context7.json", "packages/mcp-server/server.json", "packages/skill/SKILL.md", "docs/x402-listing.md", "apps/api/src/routes/a2a.ts", "apps/api/src/routes/mcp-server-card.ts", "packages/mcp-server/src/tools.ts"]) {
  test(`listing guard catches retired copy and typed totals in ${file}`, () => {
    const rows = [
      baseRow({id:"retired",claim:"quality-scored",status:"forbidden"}),
      baseRow({id:"count",claim:"/\\b\\d+ countries\\b/",status:"forbidden",scan_paths:[file]}),
    ];
    const code = file.endsWith(".ts");
    const dir = makeFixture(rows, {[file]: code ? 'export const description = "290+ quality-scored tools across 27 countries";' : '290+ quality-scored tools across 27 countries'});
    try {
      const {findings} = checkAllClaims(dir);
      assert.equal(findings.filter(f => f.file === file).length, 2);
      writeFileSync(join(dir,file), code ? '// Old copy: quality-scored\nexport const description = "Pay-per-call tools; see platform facts for coverage";' : 'Pay-per-call tools; see platform facts for coverage');
      assert.deepEqual(checkAllClaims(dir).findings, []);
    } finally { rmSync(dir, {recursive:true,force:true}); }
  });
}

test("listing-specific bans leave unrelated dataset quality descriptions alone", () => {
  const dir = makeFixture([baseRow({claim:"quality score",status:"forbidden",scan_paths:["server.json"]})], {
    "server.json":"Pay-per-call tools", "manifests/data-quality-check.yaml":"description: Computes a dataset quality score",
  });
  try { assert.deepEqual(checkAllClaims(dir).findings, []); }
  finally { rmSync(dir,{recursive:true,force:true}); }
});

test("real distribution matchers reject plus totals, pre-built totals and universal x402 paraphrases", () => {
  const rows = parseRegisterForTest();
  const count = compileMatcher(rows.find(row => row.id === "static-distribution-counts"));
  for (const text of ["301+ pay-per-call tools", "301+", "81 pre-built solutions", "Available Tools (8)"]) assert.ok(count.test(text), text);
  for (const text of ["Python 3.10+", "Node 18+", "Python 3.100+", "Node.js 20+"]) assert.equal(count.test(text), false, text);
  const coverage = compileMatcher(rows.find(row => row.id === "all-x402-coverage"));
  assert.ok(coverage.test("All Strale capabilities are also available via x402"));
  assert.equal(coverage.test("Eligible tools are available via x402"), false);
});
function parseRegisterForTest() {
  return parseYaml(readFileSync(join(realRoot,REGISTER_PATH),"utf8"));
}

test("listing base origins stay plain and skill links carry exactly one source", () => {
  for (const file of ["packages/mcp-server/README.md", "packages/sdk-typescript/README.md", "packages/sdk-python/README.md", "context7.json"]) {
    assert.doesNotMatch(readFileSync(join(realRoot,file),"utf8"), /https:\/\/api\.strale\.io\?src=/, file);
  }
  const text=readFileSync(join(realRoot,"packages/skill/README.md"),"utf8");
  for (const match of text.matchAll(/https:\/\/(?:api\.strale\.io|strale\.dev)[^\s)"<>`]*/g)) {
    const url=new URL(match[0]);
    if (["/SKILL.md", "/.well-known/mcp.json", "/v1/capabilities", "/v1/platform/facts"].includes(url.pathname)) {
      assert.equal(url.searchParams.has("src"), false);
    } else assert.deepEqual(url.searchParams.getAll("src"),["skill"]);
    assert.ok(!url.searchParams.get("utm_campaign")?.includes("?"));
  }
});

test("configured scan paths and source targets must exist", () => {
  const dir = makeFixture([baseRow({scan_paths:["missing.md"]})]);
  try {
    rmSync(join(dir, SOURCE_TARGETS[0]));
    const findings = checkAllClaims(dir).findings;
    assert.ok(findings.some(f => f.code === "SCAN_PATH_MISSING" && f.file === "missing.md"));
    assert.ok(findings.some(f => f.code === "SCAN_PATH_MISSING" && f.file === SOURCE_TARGETS[0]));
  } finally { rmSync(dir, {recursive:true, force:true}); }
});


test("unrecorded discovery GET links carry no decorative source tags", () => {
  for (const file of ["README.md", "context7.json", "docs/x402-listing.md", "packages/skill/SKILL.md", ...SOURCE_TARGETS]) {
    const text = readFileSync(join(realRoot, file), "utf8");
    assert.doesNotMatch(text, /\/(?:SKILL\.md|\.well-known\/(?:mcp|ai-catalog|x402)\.json|v1\/(?:capabilities(?:\/vat-validate)?|platform\/facts|web3-assurance))\?src=/, file);
  }
  for (const file of ["packages/skill/SKILL.md", "apps/api/src/routes/skill.ts"]) {
    const text = readFileSync(join(realRoot, file), "utf8");
    assert.doesNotMatch(text, /src=llms-txt/, file);
    assert.match(text, /src=skill/, file);
  }
});
