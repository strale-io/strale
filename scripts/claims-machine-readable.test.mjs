// The claims register's `forbidden` rows, run over the text the website's machine-readable files
// carry: /llms.txt, /.well-known/agent.json, /.well-known/mcp.json (SWITCH-OVER-READINESS item 6).
//
// This lives at the root, not in apps/web, because it needs root dependencies (claims-lib.mjs
// uses yaml, ajv and typescript) and the CI `web` job installs only apps/web. It runs in the
// existing CI `check` job through `npm run claims:test`. The apps/web renderer is TypeScript and
// the `check` job runs Node 20, which cannot strip types, so the two modules are transpiled with
// the root `typescript` into a temp directory and imported from there.
//
// check-claims.mjs scans apps/web/src, i.e. the renderer's source; this scans what it renders.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { checkSchema, compileMatcher, repoRootFrom } from "./claims-lib.mjs";

const root = repoRootFrom(import.meta.url);
const web = resolve(root, "apps/web/src");

/** Transpile apps/web/src/<rel>.ts to <out>/<rel>.mjs, pointing its relative .ts imports at .mjs. */
function transpile(rel, out) {
  const source = readFileSync(resolve(web, `${rel}.ts`), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  mkdirSync(join(out, rel, ".."), { recursive: true });
  writeFileSync(join(out, `${rel}.mjs`), js.replace(/(from\s+"\.[^"]*)\.ts"/g, '$1.mjs"'));
}

async function render(site) {
  const out = mkdtempSync(join(tmpdir(), "strale-mr-"));
  try {
    transpile("content/positioning", out);
    transpile("lib/machine-readable", out);
    const mod = await import(pathToFileURL(join(out, "lib/machine-readable.mjs")).href);
    return mod.allMachineReadableText(site);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

const SITE = "https://example.test";

test("the rendered llms.txt and both cards match no forbidden claim in the register, whatever its scan_paths", async () => {
  const files = await render(SITE);
  assert.deepEqual(files.map((f) => f.file), ["llms.txt", ".well-known/agent.json", ".well-known/mcp.json"]);
  for (const f of files) assert.ok(f.text.length > 200, `${f.file} rendered empty`);

  const { register } = checkSchema(root);
  const forbidden = register.filter((r) => r.status === "forbidden");
  assert.ok(forbidden.length > 10, "the register's forbidden rows were not loaded");
  for (const row of forbidden) {
    const matcher = compileMatcher(row);
    assert.ok(matcher, `${row.id} is not a valid pattern`);
    for (const f of files) {
      matcher.lastIndex = 0;
      assert.ok(!matcher.test(f.text), `${f.file} matches forbidden claim ${row.id}`);
    }
  }
});
