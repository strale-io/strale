// Tests for the T14 environment manifest contract (scripts/env-lib.mjs,
// scripts/check-env.mjs, scripts/generate-env-example.mjs). Every failure
// mode is planted in its own throwaway directory fixture and must fail
// there; the fixed counterpart must pass. See
// archive/sessions/2026-09-02-t14-cheap-extras-plan.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { stringify } from "yaml";
import {
  checkAllEnv,
  scanFileForEnvNames,
  stripLineComment,
  repoRootFrom,
  SCHEMA_PATH,
} from "./env-lib.mjs";
import { generate } from "./generate-env-example.mjs";

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
    name: "FOO_API_KEY",
    purpose: "Test row.",
    provider: "Test Vendor",
    holder: "petter",
    cost_class: "metered",
    required_in: ["production", "local"],
    set_in: ["railway", ".env"],
    ...overrides,
  };
}

function makeFixture(rows, codeFiles = {}) {
  const dir = mkdtempSync(join(tmpdir(), "env-test-"));
  writeFiles(dir, {
    "config/env-manifest.schema.json": realSchema,
    "config/env-manifest.yaml": stringify(rows),
    ...codeFiles,
  });
  return dir;
}

test("a documented, read variable passes clean", () => {
  const dir = makeFixture([baseRow()], {
    "apps/api/src/capabilities/foo.ts": `const key = process.env.FOO_API_KEY;\n`,
  });
  const { findings } = checkAllEnv(dir);
  assert.deepEqual(findings, []);
  rmSync(dir, { recursive: true, force: true });
});

test("UNDOCUMENTED_ENV_VAR: code reads a name with no manifest row", () => {
  const dir = makeFixture([], {
    "apps/api/src/capabilities/foo.ts": `const key = process.env.UNDOCUMENTED_THING;\n`,
  });
  const { findings } = checkAllEnv(dir);
  assert.ok(findings.some((f) => f.code === "UNDOCUMENTED_ENV_VAR" && f.detail.includes("UNDOCUMENTED_THING")));
  rmSync(dir, { recursive: true, force: true });
});

test("DEAD_ENV_ROW: manifest row for a name no code reads", () => {
  const dir = makeFixture([baseRow()], {
    "apps/api/src/capabilities/foo.ts": `// no env read here\n`,
  });
  const { findings } = checkAllEnv(dir);
  assert.ok(findings.some((f) => f.code === "DEAD_ENV_ROW" && f.detail.includes("FOO_API_KEY")));
  rmSync(dir, { recursive: true, force: true });
});

test("a retired row for an unread name is exempt from DEAD_ENV_ROW", () => {
  const dir = makeFixture([baseRow({ retired: "2026-01-01" })], {
    "apps/api/src/capabilities/foo.ts": `// no env read here\n`,
  });
  const { findings } = checkAllEnv(dir);
  assert.equal(findings.filter((f) => f.code === "DEAD_ENV_ROW").length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("a read_indirectly row for an unread name is exempt from DEAD_ENV_ROW", () => {
  const dir = makeFixture([baseRow({ read_indirectly: true })], {
    "apps/api/src/capabilities/foo.ts": `// no env read here\n`,
  });
  const { findings } = checkAllEnv(dir);
  assert.equal(findings.filter((f) => f.code === "DEAD_ENV_ROW").length, 0);
  rmSync(dir, { recursive: true, force: true });
});

// ── Row contradictions ──────────────────────────────────────────────────────
// `set_in` was data no check ever read, and it drifted: the 2026-09-02 Railway
// audit found 43 of 127 rows claiming a Railway value for a variable Railway
// does not hold. Membership of Railway is not checkable in CI (it needs a
// credential CI must not have), but a row that contradicts itself is. Each
// mode below is planted and must fail; the clean counterpart must pass.

test("SET_IN_NONE_BUT_REQUIRED: nothing sets it, yet something requires it", () => {
  const dir = makeFixture([baseRow({ set_in: ["none"], required_in: ["production"] })], {
    "apps/api/src/capabilities/foo.ts": `const key = process.env.FOO_API_KEY;
`,
  });
  const { findings } = checkAllEnv(dir);
  assert.ok(findings.some((f) => f.code === "SET_IN_NONE_BUT_REQUIRED" && f.detail.includes("FOO_API_KEY")));
  rmSync(dir, { recursive: true, force: true });
});

test("set_in: [none] with an empty required_in is fine — an optional, unset variable", () => {
  const dir = makeFixture([baseRow({ set_in: ["none"], required_in: [] })], {
    "apps/api/src/capabilities/foo.ts": `const key = process.env.FOO_API_KEY;
`,
  });
  const { findings } = checkAllEnv(dir);
  assert.deepEqual(findings, []);
  rmSync(dir, { recursive: true, force: true });
});

test("SET_IN_NONE_WITH_OTHERS: 'none' cannot be combined with a place", () => {
  const dir = makeFixture([baseRow({ set_in: ["none", "railway"], required_in: [] })], {
    "apps/api/src/capabilities/foo.ts": `const key = process.env.FOO_API_KEY;
`,
  });
  const { findings } = checkAllEnv(dir);
  assert.ok(findings.some((f) => f.code === "SET_IN_NONE_WITH_OTHERS" && f.detail.includes("FOO_API_KEY")));
  rmSync(dir, { recursive: true, force: true });
});

test("RETIRED_BUT_REQUIRED: a retired variable nothing reads cannot be required", () => {
  const dir = makeFixture([baseRow({ retired: "2026-01-01", required_in: ["production"] })], {
    "apps/api/src/capabilities/foo.ts": `// no env read here
`,
  });
  const { findings } = checkAllEnv(dir);
  assert.ok(findings.some((f) => f.code === "RETIRED_BUT_REQUIRED" && f.detail.includes("FOO_API_KEY")));
  rmSync(dir, { recursive: true, force: true });
});

test("a retired row with an empty required_in is the shape held credentials use", () => {
  // OPENSANCTIONS_API_KEY / USPTO_ODP_API_KEY (DQ-30): still set in Railway,
  // read by nothing, kept on purpose. This must stay a clean pass, or the
  // decision to hold them turns into a permanent CI failure.
  const dir = makeFixture(
    [baseRow({ retired: "2026-04-27", required_in: [], set_in: ["railway"] })],
    { "apps/api/src/capabilities/foo.ts": `// no env read here
` },
  );
  const { findings } = checkAllEnv(dir);
  assert.deepEqual(findings, []);
  rmSync(dir, { recursive: true, force: true });
});

test("DUPLICATE_ENV_ROW: same name appears twice", () => {
  const dir = makeFixture([baseRow(), baseRow()], {
    "apps/api/src/capabilities/foo.ts": `const key = process.env.FOO_API_KEY;\n`,
  });
  const { findings } = checkAllEnv(dir);
  assert.ok(findings.some((f) => f.code === "DUPLICATE_ENV_ROW"));
  rmSync(dir, { recursive: true, force: true });
});

test("SCHEMA_INVALID: a row missing a required field", () => {
  const dir = makeFixture([{ name: "FOO_API_KEY", purpose: "x" }]);
  const { findings } = checkAllEnv(dir);
  assert.ok(findings.some((f) => f.code === "SCHEMA_INVALID"));
  rmSync(dir, { recursive: true, force: true });
});

test("SCHEMA_INVALID: holder outside the enum", () => {
  const dir = makeFixture([baseRow({ holder: "petters-cousin" })]);
  const { findings } = checkAllEnv(dir);
  assert.ok(findings.some((f) => f.code === "SCHEMA_INVALID"));
  rmSync(dir, { recursive: true, force: true });
});

test("a name mentioned only in a // line comment is not a read", () => {
  const dir = makeFixture([], {
    "apps/api/src/capabilities/foo.ts": `// example: process.env.SOME_EXAMPLE_VAR (Node.js)\n`,
  });
  const { findings } = checkAllEnv(dir);
  assert.equal(findings.filter((f) => f.code === "UNDOCUMENTED_ENV_VAR").length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("a name mentioned only in a /* block */ comment is not a read", () => {
  const dir = makeFixture([], {
    "apps/api/src/capabilities/foo.ts": `/**\n * example: process.env.SOME_EXAMPLE_VAR\n */\n`,
  });
  const { findings } = checkAllEnv(dir);
  assert.equal(findings.filter((f) => f.code === "UNDOCUMENTED_ENV_VAR").length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("a real read on the line after a block comment still counts", () => {
  const dir = makeFixture([baseRow()], {
    "apps/api/src/capabilities/foo.ts": `/** doc */\nconst key = process.env.FOO_API_KEY;\n`,
  });
  const { findings } = checkAllEnv(dir);
  assert.deepEqual(findings, []);
  rmSync(dir, { recursive: true, force: true });
});

test("bracket-notation reads are detected", () => {
  const dir = makeFixture([baseRow()], {
    "apps/api/src/capabilities/foo.ts": `const key = process.env["FOO_API_KEY"];\n`,
  });
  const { findings } = checkAllEnv(dir);
  assert.deepEqual(findings, []);
  rmSync(dir, { recursive: true, force: true });
});

test("a URL containing '://' is not mistaken for a comment", () => {
  const line = 'const url = "https://example.com"; const key = process.env.FOO_API_KEY;';
  const found = scanFileForEnvNames(line);
  assert.ok(found.has("FOO_API_KEY"));
});

test("stripLineComment leaves code before a real // comment intact", () => {
  assert.equal(stripLineComment('const x = 1; // process.env.NOT_READ'), "const x = 1; ");
  assert.equal(stripLineComment('const url = "https://x"; // trailing'), 'const url = "https://x"; ');
});

test("STALE_ENV_EXAMPLE: generate --check reports missing/stale files, and generate fixes them", () => {
  const dir = makeFixture([baseRow({ required_in: ["local"] })], {
    "apps/api/src/capabilities/foo.ts": `const key = process.env.FOO_API_KEY;\n`,
  });

  const before = generate(dir, { check: true });
  assert.equal(before.stale, true);
  assert.ok(before.results.every((r) => r.missing));

  generate(dir, { check: false });
  const after = generate(dir, { check: true });
  assert.equal(after.stale, false);

  rmSync(dir, { recursive: true, force: true });
});

test("a variable required only in production/ci is not written to the local example file", () => {
  const dir = makeFixture([baseRow({ name: "PROD_ONLY_VAR", required_in: ["production"] })], {
    "apps/api/src/capabilities/foo.ts": `const key = process.env.PROD_ONLY_VAR;\n`,
  });
  generate(dir, { check: false });
  const content = readFileSync(join(dir, ".env.example"), "utf8");
  assert.ok(!content.includes("PROD_ONLY_VAR"));
  rmSync(dir, { recursive: true, force: true });
});

test("real repo: env manifest is currently clean (schema, coverage, dead rows, examples)", () => {
  const { findings } = checkAllEnv(realRoot);
  assert.deepEqual(findings, []);
  const gen = generate(realRoot, { check: true });
  assert.equal(gen.stale, false);
});
