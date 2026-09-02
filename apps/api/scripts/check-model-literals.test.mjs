// Tests for the T14 model-registry contract (model-literals-lib.mjs,
// check-model-literals.mjs). Every failure mode is planted in its own
// throwaway directory fixture and must fail there; the fixed counterpart
// must pass. See archive/sessions/2026-09-02-t14-cheap-extras-plan.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkAllModels, scanFileForLiterals, repoRootFrom, MODELS_PATH } from "./model-literals-lib.mjs";

const realRoot = repoRootFrom(import.meta.url);

function writeFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const absolute = join(dir, rel);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }
}

const VALID_MODELS_TS = `
export const MODELS = {
  capability_default: {
    id: "claude-haiku-4-5-20251001",
    pinned_at: "2026-02-26",
    decision: "unrecorded",
    purpose: "test",
  },
} as const satisfies Record<string, unknown>;
`;

function makeFixture(files) {
  const dir = mkdtempSync(join(tmpdir(), "models-test-"));
  writeFiles(dir, { [MODELS_PATH]: VALID_MODELS_TS, ...files });
  return dir;
}

test("a file importing the registry role passes clean", () => {
  const dir = makeFixture({
    "apps/api/src/capabilities/foo.ts": `import { MODELS } from "../lib/models.js";\nconst model = MODELS.capability_default.id;\n`,
  });
  const { findings } = checkAllModels(dir);
  assert.deepEqual(findings, []);
  rmSync(dir, { recursive: true, force: true });
});

test("LITERAL_OUTSIDE_REGISTRY: a dated Claude snapshot hardcoded outside models.ts", () => {
  const dir = makeFixture({
    "apps/api/src/capabilities/foo.ts": `const model = "claude-haiku-4-5-20251001";\n`,
  });
  const { findings } = checkAllModels(dir);
  assert.ok(findings.some((f) => f.code === "LITERAL_OUTSIDE_REGISTRY" && f.detail.includes("claude-haiku-4-5-20251001")));
  rmSync(dir, { recursive: true, force: true });
});

test("LITERAL_OUTSIDE_REGISTRY: an undated Claude alias hardcoded outside models.ts", () => {
  const dir = makeFixture({
    "apps/api/src/capabilities/foo.ts": `const model = "claude-sonnet-4-6";\n`,
  });
  const { findings } = checkAllModels(dir);
  assert.ok(findings.some((f) => f.code === "LITERAL_OUTSIDE_REGISTRY" && f.detail.includes("claude-sonnet-4-6")));
  rmSync(dir, { recursive: true, force: true });
});

test("LITERAL_OUTSIDE_REGISTRY: a GPT id hardcoded outside models.ts", () => {
  const dir = makeFixture({
    "apps/api/src/capabilities/foo.ts": `const model = "gpt-4o-mini";\n`,
  });
  const { findings } = checkAllModels(dir);
  assert.ok(findings.some((f) => f.code === "LITERAL_OUTSIDE_REGISTRY" && f.detail.includes("gpt-4o-mini")));
  rmSync(dir, { recursive: true, force: true });
});

test("a *.test.ts file is exempt from the literal scan", () => {
  const dir = makeFixture({
    "apps/api/src/capabilities/foo.test.ts": `process.env.ANTHROPIC_API_KEY = "test-key";\nconst model = "claude-haiku-4-5-20251001";\n`,
  });
  const { findings } = checkAllModels(dir);
  assert.equal(findings.filter((f) => f.code === "LITERAL_OUTSIDE_REGISTRY").length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("a name that merely starts with gpt-/voyage- but has no digit is not a false positive", () => {
  const found = scanFileForLiterals('logWarn("voyage-rate-limited", "retrying");\nconst x = "gpt-referral";\n');
  assert.deepEqual(found, []);
});

test("a real Voyage id with a digit is detected", () => {
  const found = scanFileForLiterals('const MODEL = "voyage-3.5-lite";\n');
  assert.ok(found.some((f) => f.match === "voyage-3.5-lite"));
});

test("a model id mentioned only in a // line comment is not flagged", () => {
  const dir = makeFixture({
    "apps/api/src/capabilities/foo.ts": `// e.g. "claude-sonnet-4-6" is the current alias\nconst x = 1;\n`,
  });
  const { findings } = checkAllModels(dir);
  assert.equal(findings.filter((f) => f.code === "LITERAL_OUTSIDE_REGISTRY").length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("a model id mentioned only in a block comment is not flagged", () => {
  const dir = makeFixture({
    "apps/api/src/capabilities/foo.ts": `/**\n * pinned to "claude-sonnet-4-6" for now\n */\nconst x = 1;\n`,
  });
  const { findings } = checkAllModels(dir);
  assert.equal(findings.filter((f) => f.code === "LITERAL_OUTSIDE_REGISTRY").length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("the documented data-file allowlist is exempt (e.g. a pricing reference table)", () => {
  const dir = makeFixture({
    "apps/api/src/capabilities/llm-cost-calculate.ts": `const table = { "claude-opus-5": {} };\n`,
  });
  const { findings } = checkAllModels(dir);
  assert.equal(findings.filter((f) => f.code === "LITERAL_OUTSIDE_REGISTRY").length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("REGISTRY_MISSING_FIELD: a role missing pinned_at", () => {
  const dir = makeFixture({
    [MODELS_PATH]: `
export const MODELS = {
  capability_default: {
    id: "claude-haiku-4-5-20251001",
    decision: "unrecorded",
    purpose: "test",
  },
} as const satisfies Record<string, unknown>;
`,
  });
  const { findings } = checkAllModels(dir);
  assert.ok(findings.some((f) => f.code === "REGISTRY_MISSING_FIELD" && f.detail.includes("pinned_at")));
  rmSync(dir, { recursive: true, force: true });
});

test("REGISTRY_MISSING_FIELD: a role missing decision", () => {
  const dir = makeFixture({
    [MODELS_PATH]: `
export const MODELS = {
  capability_default: {
    id: "claude-haiku-4-5-20251001",
    pinned_at: "2026-02-26",
    purpose: "test",
  },
} as const satisfies Record<string, unknown>;
`,
  });
  const { findings } = checkAllModels(dir);
  assert.ok(findings.some((f) => f.code === "REGISTRY_MISSING_FIELD" && f.detail.includes("decision")));
  rmSync(dir, { recursive: true, force: true });
});

test("REGISTRY_INVALID_DATE: pinned_at not a calendar date", () => {
  const dir = makeFixture({
    [MODELS_PATH]: `
export const MODELS = {
  capability_default: {
    id: "claude-haiku-4-5-20251001",
    pinned_at: "not-a-date",
    decision: "unrecorded",
    purpose: "test",
  },
} as const satisfies Record<string, unknown>;
`,
  });
  const { findings } = checkAllModels(dir);
  assert.ok(findings.some((f) => f.code === "REGISTRY_INVALID_DATE"));
  rmSync(dir, { recursive: true, force: true });
});

test("real repo: model registry is currently clean", () => {
  const { findings } = checkAllModels(realRoot);
  assert.deepEqual(findings, []);
});
