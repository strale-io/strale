import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
const checker = resolve("apps/api/scripts/check-framework-packages.mjs");
test("Zapier integrity rejects an import-only hollow app", () => {
  mkdirSync("audit-output", { recursive: true });
  const root = mkdtempSync(resolve("audit-output/framework-gate-"));
  try {
    const pkg = join(root, "packages/zapier-strale");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(
      join(pkg, "index.js"),
      "const zapier = require('zapier-platform-core');\nmodule.exports = {};\n"
    );
    const hollow = spawnSync(process.execPath, [checker], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(hollow.status, 1);
    assert.match(hollow.stderr, /zapier-strale/);
    writeFileSync(join(pkg, "index.js"), "module.exports = {};\n");
    const absent = spawnSync(process.execPath, [checker], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(absent.status, 1);
    // A framework import in test code must not satisfy the production contract.
    mkdirSync(join(pkg, "test"));
    writeFileSync(join(pkg, "test/app.test.js"), "const zapier = require('zapier-platform-core');\n");
    writeFileSync(join(pkg, "index.js"), "module.exports = zapier.defineApp({authentication: {}, creates, action: zapier.defineCreate({inputFields: [], outputFields: [], perform: () => {}})});\n");
    const testOnly = spawnSync(process.execPath, [checker], { cwd: root, encoding: "utf8" });
    assert.equal(testOnly.status, 1);

  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("AI SDK integrity rejects an import-only hollow package", () => {
  mkdirSync("audit-output", { recursive: true });
  const root = mkdtempSync(resolve("audit-output/framework-gate-"));
  try {
    const src = join(root, "packages/ai-sdk-strale/src");
    mkdirSync(src, { recursive: true });
    const run = () => spawnSync(process.execPath, [checker], { cwd: root, encoding: "utf8" });
    writeFileSync(join(src, "index.ts"), 'import { tool } from "ai";\nexport const x = 1;\n');
    const hollow = run();
    assert.equal(hollow.status, 1);
    assert.match(hollow.stderr, /ai-sdk-strale/);
    writeFileSync(
      join(src, "index.ts"),
      'import { tool } from "ai";\nexport const t = tool({ description: "d", inputSchema: s, execute: async () => 1 });\n',
    );
    assert.equal(run().status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
