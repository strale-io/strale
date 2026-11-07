// Tests for the reference-data register (robustness R2): scripts/reference-data-lib.mjs.
// Each failure mode is planted in a throwaway fixture and must fail there; the
// clean fixture must pass. The last test runs the real register against the
// real code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkRegister, dueDate, dueRows, findDateConstants, loadRegister, repoRootFrom } from "./reference-data-lib.mjs";

const TODAY = "2026-11-07";

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), "refdata-"));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

const CODE = 'export const LIST_AS_OF = "2026-11-06";\nexport const LIST = new Set(["AA"]);\n';
const BASE_FILES = {
  "apps/api/src/capabilities/tool.ts": CODE,
  "manifests/tool.yaml": "slug: tool\n",
};
function row(over = {}) {
  return {
    id: "tool-list",
    harm: "A",
    file: "apps/api/src/capabilities/tool.ts",
    symbol: "LIST",
    tools: ["tool"],
    active: true,
    holds: "a list",
    source: "the authority",
    recheck_against: "the authority's page",
    trigger: "on change",
    as_of: "2026-11-06",
    as_of_symbol: "LIST_AS_OF",
    evidence: "PR #1",
    review_days: 90,
    ...over,
  };
}
function run(rows, files = BASE_FILES) {
  const dir = fixture(files);
  try {
    return checkRegister(dir, { version: 1, datasets: rows }, { today: TODAY }).findings.map((f) => f.code);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a clean register passes", () => {
  assert.deepEqual(run([row()]), []);
});

test("a date constant in the code with no row fails (REFDATA_UNREGISTERED_DATE)", () => {
  assert.deepEqual(run([row({ as_of_symbol: undefined })]), ["REFDATA_UNREGISTERED_DATE"]);
});

test("a constant moved without the register fails (REFDATA_AS_OF_MISMATCH)", () => {
  const files = { ...BASE_FILES, "apps/api/src/capabilities/tool.ts": CODE.replace("2026-11-06", "2026-11-07") };
  assert.deepEqual(run([row()], files), ["REFDATA_AS_OF_MISMATCH"]);
});

test("a row naming a constant the code lacks fails (REFDATA_AS_OF_SYMBOL_MISSING)", () => {
  // The code's constant is still unregistered, so both directions report.
  assert.deepEqual(run([row({ as_of_symbol: "OTHER_AS_OF" })]).sort(), ["REFDATA_AS_OF_SYMBOL_MISSING", "REFDATA_UNREGISTERED_DATE"]);
});

test("a missing file, a missing symbol and an unknown tool each fail", () => {
  assert.ok(run([row(), row({ id: "gone", file: "apps/api/src/capabilities/gone.ts", as_of_symbol: undefined })]).includes("REFDATA_FILE_MISSING"));
  assert.deepEqual(run([row({ symbol: "RENAMED" })]), ["REFDATA_SYMBOL_MISSING"]);
  assert.deepEqual(run([row({ tools: ["delisted-tool"] })]), ["REFDATA_UNKNOWN_TOOL"]);
});

test("schema: duplicate ids, a bad harm class, an undated row with no first_review_by", () => {
  assert.ok(run([row(), row()]).includes("REFDATA_DUPLICATE_ID"));
  assert.ok(run([row({ harm: "E" })]).includes("REFDATA_SCHEMA"));
  const undated = row({ as_of: null, as_of_symbol: undefined, evidence: undefined });
  assert.ok(run([undated, row({ id: "dated" })]).includes("REFDATA_SCHEMA"));
  assert.deepEqual(run([{ ...undated, first_review_by: "2026-12-15" }, row({ id: "dated" })]), []);
});

test("an as_of or checked_on in the future fails; checked_on before as_of fails", () => {
  const files = { ...BASE_FILES, "apps/api/src/capabilities/tool.ts": CODE.replace("2026-11-06", "2026-12-01") };
  assert.deepEqual(run([row({ as_of: "2026-12-01" })], files), ["REFDATA_AS_OF_FUTURE"]);
  assert.deepEqual(run([row({ checked_on: "2026-12-01" })]), ["REFDATA_AS_OF_FUTURE"]);
  assert.deepEqual(run([row({ checked_on: "2026-11-01" })]), ["REFDATA_SCHEMA"]);
});

test("the structural check never fails because time has passed", () => {
  // A row checked long ago, and an undated row whose first check is overdue:
  // the structural mode reports nothing; only dueRows lists them.
  const files = { ...BASE_FILES, "apps/api/src/capabilities/tool.ts": CODE.replace("2026-11-06", "2020-01-01") };
  const rows = [row({ as_of: "2020-01-01" }), row({ id: "undated", as_of: null, as_of_symbol: undefined, evidence: undefined, first_review_by: "2021-01-01" })];
  assert.deepEqual(run(rows, files), []);
  assert.deepEqual(dueRows(rows, TODAY).map((d) => d.id).sort(), ["tool-list", "undated"]);
});

test("due dates: from checked_on when set, else as_of, else first_review_by; inactive rows are never due", () => {
  assert.equal(dueDate(row()), "2027-02-04");
  assert.equal(dueDate(row({ as_of: "2026-10-30", checked_on: "2026-11-06", review_days: 120 })), "2027-03-06");
  assert.equal(dueDate(row({ as_of: null, first_review_by: "2026-12-15" })), "2026-12-15");
  const due = row({ as_of: "2026-01-01" });
  assert.equal(dueRows([due], TODAY).length, 1);
  assert.equal(dueRows([{ ...due, active: false }], TODAY).length, 0);
  assert.equal(dueRows([row()], TODAY).length, 0);
  // Harm A sorts before D.
  const ids = dueRows([{ ...due, id: "d", harm: "D" }, { ...due, id: "a" }], TODAY).map((d) => d.id);
  assert.deepEqual(ids, ["a", "d"]);
});

test("date constants in tests are not scanned", () => {
  const dir = fixture({ ...BASE_FILES, "apps/api/src/capabilities/tool.test.ts": 'const X_AS_OF = "2026-01-01";\n' });
  try {
    assert.deepEqual(findDateConstants(dir).map((c) => c.name), ["LIST_AS_OF"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the real register matches the real code", () => {
  const root = repoRootFrom(import.meta.url);
  const { findings, rows } = checkRegister(root, loadRegister(root));
  assert.ok(rows.length >= 80, `expected the inventory's datasets, got ${rows.length}`);
  assert.deepEqual(findings, []);
});
