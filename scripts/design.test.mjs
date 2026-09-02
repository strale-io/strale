// Tests for the T13 design-tokens contract (scripts/design-lib.mjs,
// scripts/check-design.mjs, scripts/generate-design-tokens.mjs).
// Every failure mode is planted in its own throwaway git repo fixture (with
// a real origin/main history for the checks that need one) and must fail
// there; the fixed counterpart must pass. See
// archive/sessions/2026-09-02-t13-design-tokens-plan.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  checkAllDesign,
  checkTokenFiles,
  checkPromotionRequiresDecision,
  checkAllowlistRatchet,
  checkLint,
  scanAllLintTargets,
  repoRootFrom,
  SCHEMA_PATH,
  scanFileForLiterals,
} from "./design-lib.mjs";
import { generate } from "./generate-design-tokens.mjs";

const realRoot = repoRootFrom(import.meta.url);

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

function configUser(dir) {
  git(dir, ["config", "user.email", "test@example.invalid"]);
  git(dir, ["config", "user.name", "Design Test"]);
}

function writeFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const absolute = join(dir, rel);
    mkdirSync(dirname(absolute), { recursive: true });
    if (typeof content === "string") {
      writeFileSync(absolute, content, "utf8");
    } else {
      writeFileSync(absolute, JSON.stringify(content, null, 2) + "\n", "utf8");
    }
  }
}

/**
 * Builds a throwaway repo `root` with `localFiles` on disk (staged, not
 * necessarily committed) plus a real `origin/main` remote-tracking ref
 * seeded from `mainFiles`. When `mainFiles` is omitted, no remote is set up
 * at all — the promotion/ratchet checks then warn ORIGIN_MAIN_UNAVAILABLE
 * and pass, which is itself exercised by a dedicated test.
 */
function makeFixture(localFiles, mainFiles) {
  const root = mkdtempSync(join(tmpdir(), "strale-design-fixture-"));

  if (mainFiles) {
    const remoteDir = mkdtempSync(join(tmpdir(), "strale-design-remote-"));
    git(remoteDir, ["init", "-q", "--bare"]);

    const seedDir = mkdtempSync(join(tmpdir(), "strale-design-seed-"));
    git(seedDir, ["init", "-q", "-b", "main"]);
    configUser(seedDir);
    writeFiles(seedDir, mainFiles);
    git(seedDir, ["add", "-A"]);
    git(seedDir, ["commit", "-q", "-m", "seed"]);
    git(seedDir, ["remote", "add", "origin", remoteDir]);
    git(seedDir, ["push", "-q", "origin", "main"]);

    git(root, ["init", "-q", "-b", "main"]);
    configUser(root);
    git(root, ["remote", "add", "origin", remoteDir]);
    git(root, ["fetch", "-q", "origin"]);
  } else {
    git(root, ["init", "-q", "-b", "main"]);
    configUser(root);
  }

  const schemaAbs = join(root, SCHEMA_PATH);
  mkdirSync(dirname(schemaAbs), { recursive: true });
  copyFileSync(resolve(realRoot, SCHEMA_PATH), schemaAbs);

  writeFiles(root, localFiles);
  git(root, ["add", "-A"]);
  return root;
}

function withFixture(localFiles, mainFiles, fn) {
  const root = makeFixture(localFiles, mainFiles);
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function codes(root) {
  return checkAllDesign(root).failures.map((f) => f.code);
}

// ---------------------------------------------------------------------------
// Fixture building blocks
// ---------------------------------------------------------------------------

const SURFACE = {
  palette: { accent: "#2563EB", bg: "#F5F6F9" },
  type: { families: { sans: "system-ui" }, scale: { body: 14 } },
  spacing: [4, 8, 12, 16],
  radii: [4, 8, "full"],
  shadows: [],
  motion: {},
  provenance: { source: "apps/api/scripts/lib/design-system.ts" },
};

function activeJson({ accent = "#2563EB", adoptedBy = "DEC-TEST-1" } = {}) {
  return {
    surfaces: {
      "internal-reports": {
        ...SURFACE,
        palette: { ...SURFACE.palette, accent },
        adopted_by: adoptedBy,
        adopted_at: "2026-08-15",
      },
    },
  };
}

function candidateJson({ status = "proposed" } = {}) {
  return {
    name: "Test Candidate",
    status,
    supersedes: null,
    superseded_by: null,
    ...SURFACE,
    provenance: { source: "somewhere.css" },
  };
}

const CONSUMER = "apps/api/scripts/ceo-dashboard.ts";
const CLEAN_CONSUMER_TEXT = 'export const x = "hello world";\n';

function generatedTs(accent = "#2563EB") {
  return [
    "// GENERATED FILE — do not edit by hand.",
    "// Source: design/tokens/active.json, surfaces[\"internal-reports\"].palette.",
    "// Regenerate: npm run design:tokens:generate (checked by npm run design:check).",
    "//",
    "// design-system.ts imports TOKENS from here and re-exports it unchanged;",
    "// DESIGN_SYSTEM_CSS stays authored there, built from these values.",
    "",
    "export const TOKENS = {",
    `  accent: ${JSON.stringify(accent)},`,
    `  bg: ${JSON.stringify(SURFACE.palette.bg)},`,
    "} as const;",
    "",
  ].join("\n");
}

function baseFiles({ accent = "#2563EB", consumerText = CLEAN_CONSUMER_TEXT, allowlist = [] } = {}) {
  return {
    "design/tokens/active.json": activeJson({ accent }),
    "design/tokens/candidates/test-candidate.json": candidateJson(),
    "design/lint-allowlist.json": allowlist,
    "apps/api/scripts/lib/design-tokens.generated.ts": generatedTs(accent),
    [CONSUMER]: consumerText,
  };
}

// ---------------------------------------------------------------------------
// Clean pass
// ---------------------------------------------------------------------------

test("clean pass: valid tokens, matching generated file, no lint findings — zero failures", () => {
  const files = baseFiles();
  withFixture(files, files, (root) => {
    assert.deepEqual(codes(root), []);
    const gen = generate(root, { check: true });
    assert.equal(gen.stale, false);
  });
});

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

test("active.json missing a required field fails schema validation, fixing it passes", () => {
  const broken = baseFiles();
  const activeNoProvenance = activeJson();
  delete activeNoProvenance.surfaces["internal-reports"].provenance;
  broken["design/tokens/active.json"] = activeNoProvenance;
  withFixture(broken, broken, (root) => assert.ok(codes(root).includes("SCHEMA_INVALID")));

  const fixed = baseFiles();
  withFixture(fixed, fixed, (root) => assert.deepEqual(codes(root), []));
});

test("a candidate with an invalid status fails schema validation, fixing it passes", () => {
  const broken = baseFiles();
  broken["design/tokens/candidates/test-candidate.json"] = candidateJson({ status: "maybe-someday" });
  withFixture(broken, broken, (root) => assert.ok(codes(root).includes("SCHEMA_INVALID")));

  const fixed = baseFiles();
  withFixture(fixed, fixed, (root) => assert.deepEqual(codes(root), []));
});

test("invalid JSON in a token file is reported, not thrown", () => {
  const broken = baseFiles();
  broken["design/tokens/candidates/test-candidate.json"] = "{ not valid json";
  withFixture(broken, broken, (root) => {
    const failures = checkTokenFiles(root);
    assert.ok(failures.some((f) => f.code === "INVALID_JSON"));
  });
});

// ---------------------------------------------------------------------------
// One active file
// ---------------------------------------------------------------------------

test("a second top-level file in design/tokens/ fails, removing it passes", () => {
  const broken = baseFiles();
  broken["design/tokens/active-2.json"] = activeJson();
  withFixture(broken, broken, (root) => assert.ok(codes(root).includes("MULTIPLE_ACTIVE_FILES")));

  const fixed = baseFiles();
  withFixture(fixed, fixed, (root) => assert.deepEqual(codes(root), []));
});

test("a missing active.json fails", () => {
  const broken = baseFiles();
  delete broken["design/tokens/active.json"];
  withFixture(broken, broken, (root) => assert.ok(codes(root).includes("ACTIVE_MISSING")));
});

// ---------------------------------------------------------------------------
// Promotion requires a decision
// ---------------------------------------------------------------------------

test("active.json changed against origin/main with no adopted_by change fails, changing adopted_by too passes", () => {
  const main = baseFiles({ accent: "#111111" });
  const brokenLocal = baseFiles({ accent: "#222222" }); // adopted_by unchanged from main's "DEC-TEST-1"
  withFixture(brokenLocal, main, (root) => {
    const { findings } = checkPromotionRequiresDecision(root);
    assert.ok(findings.some((f) => f.code === "PROMOTION_WITHOUT_DECISION"));
  });

  const fixedLocal = baseFiles({ accent: "#222222" });
  fixedLocal["design/tokens/active.json"] = activeJson({ accent: "#222222", adoptedBy: "DEC-TEST-2" });
  withFixture(fixedLocal, main, (root) => {
    const { findings } = checkPromotionRequiresDecision(root);
    assert.deepEqual(findings, []);
  });
});

test("active.json absent on origin/main (this PR creates it) is a pass", () => {
  const local = baseFiles();
  const mainWithoutActive = baseFiles();
  delete mainWithoutActive["design/tokens/active.json"];
  withFixture(local, mainWithoutActive, (root) => {
    const { findings } = checkPromotionRequiresDecision(root);
    assert.deepEqual(findings, []);
  });
});

test("no origin/main ref available warns and passes, not fails", () => {
  const local = baseFiles();
  withFixture(local, null, (root) => {
    const { findings, warnings } = checkPromotionRequiresDecision(root);
    assert.deepEqual(findings, []);
    assert.ok(warnings.some((w) => w.code === "ORIGIN_MAIN_UNAVAILABLE"));
  });
});

test("active.json unchanged from origin/main is a pass even with a stale adopted_by", () => {
  const same = baseFiles();
  withFixture(same, same, (root) => {
    const { findings } = checkPromotionRequiresDecision(root);
    assert.deepEqual(findings, []);
  });
});

// ---------------------------------------------------------------------------
// Off-token literal lint
// ---------------------------------------------------------------------------

test("an off-token hex literal in a consumer fails, allowlisting it (and matching origin/main) passes", () => {
  const withHex = { ...baseFiles(), [CONSUMER]: 'const bg = "#123456";\n' };
  withFixture(withHex, withHex, (root) => assert.ok(codes(root).includes("LINT_VIOLATION")));

  const allowlisted = {
    ...baseFiles({ allowlist: [{ file: CONSUMER, kind: "hex", value: "#123456" }] }),
    [CONSUMER]: 'const bg = "#123456";\n',
  };
  withFixture(allowlisted, allowlisted, (root) => assert.deepEqual(codes(root), []));
});

test("a raw font-family: declaration in a consumer fails", () => {
  const files = { ...baseFiles(), [CONSUMER]: 'const s = "font-family: Arial;";\n' };
  withFixture(files, files, (root) => assert.ok(codes(root).includes("LINT_VIOLATION")));
});

test("an off-scale margin px value in a consumer fails; an on-scale one passes", () => {
  const offScale = { ...baseFiles(), [CONSUMER]: 'const s = "margin:37px;";\n' };
  withFixture(offScale, offScale, (root) => assert.ok(codes(root).includes("LINT_VIOLATION")));

  const onScale = { ...baseFiles(), [CONSUMER]: 'const s = "margin:8px;";\n' }; // 8 is in SURFACE.spacing
  withFixture(onScale, onScale, (root) => assert.deepEqual(codes(root), []));
});

test("an off-scale border-radius px value fails; an on-scale one passes", () => {
  const offScale = { ...baseFiles(), [CONSUMER]: 'const s = "border-radius:9px;";\n' };
  withFixture(offScale, offScale, (root) => assert.ok(codes(root).includes("LINT_VIOLATION")));

  const onScale = { ...baseFiles(), [CONSUMER]: 'const s = "border-radius:4px;";\n' }; // 4 is in SURFACE.radii
  withFixture(onScale, onScale, (root) => assert.deepEqual(codes(root), []));
});

test("an HTML numeric entity is not mistaken for a hex color", () => {
  const files = { ...baseFiles(), [CONSUMER]: 'const s = "&#128202;";\n' };
  withFixture(files, files, (root) => {
    const { unique } = scanAllLintTargets(root);
    assert.deepEqual(unique, []);
  });
});

test("an allowlist entry whose literal no longer appears in the file fails, removing the entry passes", () => {
  const stale = baseFiles({ allowlist: [{ file: CONSUMER, kind: "hex", value: "#abcdef" }] });
  withFixture(stale, stale, (root) => assert.ok(codes(root).includes("ALLOWLIST_STALE_ENTRY")));

  const fixed = baseFiles();
  withFixture(fixed, fixed, (root) => assert.deepEqual(codes(root), []));
});

test("the allowlist growing versus origin/main fails, matching origin/main passes", () => {
  const main = baseFiles();
  const grown = baseFiles({
    allowlist: [{ file: CONSUMER, kind: "hex", value: "#123456" }],
    consumerText: 'const bg = "#123456";\n',
  });
  withFixture(grown, main, (root) => {
    const { findings } = checkAllowlistRatchet(root);
    assert.ok(findings.some((f) => f.code === "ALLOWLIST_GROWTH"));
  });

  withFixture(main, main, (root) => {
    const { findings } = checkAllowlistRatchet(root);
    assert.deepEqual(findings, []);
  });
});

test("an allowlist shrinking versus origin/main is not growth", () => {
  const main = baseFiles({ allowlist: [{ file: CONSUMER, kind: "hex", value: "#123456" }] });
  const shrunk = baseFiles({ allowlist: [] });
  withFixture(shrunk, main, (root) => {
    const { findings } = checkAllowlistRatchet(root);
    assert.deepEqual(findings.filter((f) => f.code === "ALLOWLIST_GROWTH"), []);
  });
});

// ---------------------------------------------------------------------------
// Generated file sync
// ---------------------------------------------------------------------------

test("a stale generated file is detected by generate({check:true})", () => {
  const stale = baseFiles({ accent: "#333333" });
  stale["apps/api/scripts/lib/design-tokens.generated.ts"] = generatedTs("#999999"); // wrong value
  withFixture(stale, stale, (root) => {
    const result = generate(root, { check: true });
    assert.equal(result.stale, true);
    assert.equal(result.missing, false);
  });
});

test("a missing generated file is detected by generate({check:true})", () => {
  const missing = baseFiles();
  delete missing["apps/api/scripts/lib/design-tokens.generated.ts"];
  withFixture(missing, missing, (root) => {
    const result = generate(root, { check: true });
    assert.equal(result.stale, true);
    assert.equal(result.missing, true);
  });
});

test("hex literals are found in CSS declarations (followed by a semicolon) and inside strings, but HTML entities are not", () => {
  const scale = { spacing: new Set([8]), radii: new Set([12]), radiiStrings: new Set() };
  const found = scanFileForLiterals('const css = `color:#2563EB;background:#abcdef}` + "#ABCDEF" + "&#128202;" + "#ABCDEFAB";', scale);
  const hex = found.filter((f) => f.kind === "hex").map((f) => f.value).sort();
  assert.deepEqual(hex, ["#2563EB", "#ABCDEF", "#abcdef"]);
});

test("regenerating a stale file makes it match", () => {
  const stale = baseFiles({ accent: "#333333" });
  stale["apps/api/scripts/lib/design-tokens.generated.ts"] = generatedTs("#999999");
  withFixture(stale, stale, (root) => {
    generate(root, { check: false });
    const result = generate(root, { check: true });
    assert.equal(result.stale, false);
  });
});
