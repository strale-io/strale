// Real CLI regressions: each case empties the gate's input in a disposable
// repository snapshot. No source checkout mutation, stash, network, or secrets.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { requireInputs } from "./require-inputs.mjs";

const repo = resolve(import.meta.dirname, "..");
const scratch = join(repo, "audit-output");
mkdirSync(scratch, { recursive: true });
const fixture = mkdtempSync(join(scratch, "empty-gates-"));
after(() => rmSync(fixture, { recursive: true, force: true }));
// Copy text inputs only; no node_modules link and no media needed by these CLIs.
const paths = new Set(execFileSync("git", ["ls-files", "-z"], { cwd: repo, encoding: "utf8" }).split("\0").filter(Boolean));
paths.add("scripts/require-inputs.mjs");
for (const file of paths) {
  if (!/\.(?:mjs|js|ts|tsx|json|yaml|yml|md|txt|toml|py)$/.test(file) || !existsSync(join(repo, file))) continue;
  mkdirSync(dirname(join(fixture, file)), { recursive: true });
  cpSync(join(repo, file), join(fixture, file));
}
execFileSync("git", ["init", "-q"], { cwd: fixture });

function emptyDir(path, keep = () => false) {
  for (const name of readdirSync(join(fixture, path))) if (!keep(name)) rmSync(join(fixture, path, name), { recursive: true, force: true });
}
function write(path, text) { writeFileSync(join(fixture, path), text); }
// All mutations are restored after each case, including on failed assertions.
function runCase(script, targets, mutate, expected = /EMPTY_INPUT/, env = {}) {
  const saved = targets.map((path, i) => {
    const backup = join(fixture, `saved-${i}`);
    cpSync(join(fixture, path), backup, { recursive: true });
    return [path, backup];
  });
  try {
    mutate();
    const args = script.endsWith(".ts") ? ["--import", "tsx", script] : [script];
    const result = spawnSync(process.execPath, args, { cwd: fixture, encoding: "utf8", timeout: 30000, env: { ...process.env, ...env } });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0, `${script} accepted empty inputs`);
    assert.match(result.stdout + result.stderr, expected, `${script} failed for a different reason`);
  } finally {
    for (const [path, backup] of saved) {
      rmSync(join(fixture, path), { recursive: true, force: true });
      renameSync(backup, join(fixture, path));
    }
  }
}
const api = "apps/api/scripts/";
for (const name of ["check-no-bare-catch", "check-no-external-column-access", "check-no-new-console", "check-fetch-timeout-coverage", "check-ssrf-inventory", "check-no-unguarded-user-fetch"]) {
  test(`${name}: no source inputs fails`, () => runCase(`${api}${name}.mjs`, ["apps/api/src"], () => {
    emptyDir("apps/api/src");
    mkdirSync(join(fixture, "apps/api/src/capabilities"));
  }));
}
for (const name of ["check-manifest-guaranteed-consistency", "check-tier-coverage", "check-identity-fixture-shape", "check-cost-class-coherence", "check-pii"]) {
  test(`${name}: no manifests fails`, () => runCase(`${api}${name}.mjs`, ["manifests"], () => emptyDir("manifests")));
}
for (const [script, file, value] of [
  ["scripts/check-claims.mjs", "docs/company/claims.yaml", "[]"],
  ["scripts/check-env.mjs", "config/env-manifest.yaml", "[]"],
  ["scripts/check-vendors.mjs", "config/vendors.yaml", "schema_version: 1\nauthority_active: false\nvendors: []"],
  ["scripts/check-distribution.mjs", "docs/operations/distribution-registry.yaml", "schema_version: 1\nauthority_active: false\nsurfaces: []"],
]) test(`${script}: no records fails`, () => runCase(script, [file], () => write(file, value)));
for (const [script, dir, keep] of [
  // Remove every program directory (any program, present or future); keep the README and schema.
  ["scripts/check-program-tracks.mjs", "docs/programs", (n) => !readdirSync(join(fixture, "docs/programs"), { withFileTypes: true }).find((e) => e.name === n)?.isDirectory()],
  ["scripts/check-research.mjs", "docs/research", (n) => n === "README.md" || n.endsWith(".json")],
  ["scripts/check-receipts.mjs", "archive/receipts", (n) => n === "receipt.schema.json" || !n.endsWith(".json")],
  ["scripts/check-protocol-extraction.mjs", "docs/governance/protocols", () => false],
  ["scripts/check-docs-index.mjs", "docs", (n) => !readdirSync(join(fixture, "docs"), { withFileTypes: true }).find((e) => e.name === n)?.isDirectory()],
  [`${api}check-framework-packages.mjs`, "packages", () => false],
  [`${api}validate-coverage-matrix.mjs`, "apps/api/coverage-matrix", (n) => !n.endsWith(".yaml")],
  [`${api}regenerate-coverage-matrix-summary.mjs`, "apps/api/coverage-matrix", (n) => !n.endsWith(".yaml")],
  [`${api}check-ceo-brief.ts`, "docs/company/briefs", () => false],
]) test(`${script}: no files fails`, () => runCase(script, [dir], () => emptyDir(dir, keep)));
test("migration ledger: empty source and ledger fail", () => runCase(`${api}check-migration-ledger.mjs`, ["apps/api/src/lib/startup-migrations.ts", "apps/api/src/lib/startup-migrations.ledger.json"], () => {
  write("apps/api/src/lib/startup-migrations.ts", "");
  const path = "apps/api/src/lib/startup-migrations.ledger.json";
  const ledger = JSON.parse(readFileSync(join(fixture, path), "utf8"));
  ledger.blocks = []; write(path, JSON.stringify(ledger));
}));
test("model literals: empty scan fails even when registry exists", () => runCase(`${api}check-model-literals.mjs`, ["apps/api/src", "apps/api/scripts"], () => {
  const models = readFileSync(join(fixture, "apps/api/src/lib/models.ts"));
  emptyDir("apps/api/src"); mkdirSync(join(fixture, "apps/api/src/lib"));
  write("apps/api/src/lib/models.ts", models);
  // The model guard now scans API TypeScript scripts as well as runtime src.
  // Keep its .mjs implementation available while emptying both input roots.
  for (const name of readdirSync(join(fixture, "apps/api/scripts"), { recursive: true })) {
    if (/\.tsx?$/.test(name)) rmSync(join(fixture, "apps/api/scripts", name));
  }
}));
for (const script of [`${api}check-no-committed-secrets.mjs`, "scripts/guard-production-write-access.mjs"]) {
  test(`${script}: empty git candidate set fails`, () => runCase(script, [], () => {}));
}
test("shared helper accepts nonempty arrays, maps, sets, objects and counts", () => {
  for (const inputs of [[1], new Map([[1, 2]]), new Set([1]), { a: 1 }, 1]) assert.equal(requireInputs(inputs, "test"), inputs);
});
test("shared helper rejects each empty collection shape", () => {
  for (const inputs of [[], new Map(), new Set(), {}, 0]) assert.throws(() => requireInputs(inputs, "test"), /EMPTY_INPUT: test/);
});

for (const [script, file, key] of [
  ["scripts/check-scheduled-reachability.mjs", "config/scheduled-mechanisms.yaml", "mechanisms"],
  ["scripts/check-protocol-coverage.mjs", "docs/project/protocol-coverage.yaml", "protocols"],
]) test(`${script}: empty record collection fails`, () => runCase(script, [file], () => {
  const data = parseYaml(readFileSync(join(fixture, file), "utf8"));
  data[key] = []; write(file, stringifyYaml(data));
}));
test("scheduled outcomes: no scheduled workflows fails without network", () => runCase("scripts/check-scheduled-outcomes.mjs", [".github/workflows"], () => emptyDir(".github/workflows")));
test("design: absent consumers fail rather than lint zero files", () => {
  const targets = ["apps/api/scripts/ceo-dashboard.ts", "apps/api/src/lib/digest-formatter.ts", "apps/api/src/lib/interrupt-sender.ts"];
  runCase("scripts/check-design.mjs", targets, () => targets.forEach((path) => rmSync(join(fixture, path))));
});
for (const name of ["check-mjs-syntax", "check-no-direct-getexecutor-in-scripts"]) {
  test(`${name}: empty script selector fails`, () => {
    const content = readFileSync(join(fixture, api, `${name}.mjs`));
    // A .js entry point is executable ESM (apps/api/package.json) but outside
    // these gates' .mjs / .ts / .mts selectors. Even self-scanning gates must
    // reject a future accidentally emptied selector.
    runCase(`${api}${name}.js`, ["apps/api/scripts"], () => {
      emptyDir("apps/api/scripts"); write(`${api}${name}.js`, content);
    });
  });
}
for (const [name, dir] of [["archive", "archive"], ["handoff", "handoff"]]) {
  test(`${name} index: empty input fails`, () => runCase("scripts/generate-archive-index.mjs", [dir], () => emptyDir(dir)));
}
for (const dir of ["manifests", "packages"]) {
  test(`claims: empty ${dir} scan fails despite other nonempty surfaces`, () => runCase("scripts/check-claims.mjs", [dir], () => emptyDir(dir)));
}

test("tier coverage: no matching captured fixtures fails", () => runCase(`${api}check-tier-coverage.mjs`, ["apps/api/test/fixtures/tier-coverage"], () => emptyDir("apps/api/test/fixtures/tier-coverage")));
test("unguarded fetch: test-only source set fails", () => runCase(`${api}check-no-unguarded-user-fetch.mjs`, ["apps/api/src/capabilities"], () => {
  emptyDir("apps/api/src/capabilities"); write("apps/api/src/capabilities/only.test.ts", "// no runtime source");
}));
test("shape contracts: present frontend with empty matching interfaces fails", () => {
  const front = "shape-fixture-frontend";
  mkdirSync(join(fixture, front, "src/lib"), { recursive: true });
  write(`${front}/src/lib/compliance-types.ts`, "export interface AuditRecord { /* no fields */ }\n");
  runCase(`${api}check-shape-contracts.mjs`, ["apps/api/src/routes/audit.ts"], () => {
    write("apps/api/src/routes/audit.ts", "export interface AuditRecord { /* no fields */ }\n");
  }, /EMPTY_INPUT/, { STRALE_FRONTEND_PATH: join(fixture, front) });
});

for (const name of ["check-identity-fixture-shape", "check-cost-class-coherence", "check-manifest-guaranteed-consistency"]) {
  test(`${name}: no effective records fails with nonempty file glob`, () => runCase(`${api}${name}.mjs`, ["manifests"], () => {
    emptyDir("manifests");
    write("manifests/unrelated.yaml", name === "check-manifest-guaranteed-consistency" ? "null" : "slug: unrelated");
  }));
}
test("PII: absent ignored scratch is valid on a clean checkout", () => {
  assert.equal(existsSync(join(fixture, "audit-output")), false);
  const result = spawnSync(process.execPath, [`${api}check-pii.mjs`, "--strict"], { cwd: fixture, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
test("scheduled reachability: empty workflow glob fails", () => runCase("scripts/check-scheduled-reachability.mjs", [".github/workflows"], () => emptyDir(".github/workflows")));
