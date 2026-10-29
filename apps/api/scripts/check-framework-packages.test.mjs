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

test("n8n integrity rejects a hollow, unregistered or dependency-carrying node package", () => {
  mkdirSync("audit-output", { recursive: true });
  const root = mkdtempSync(resolve("audit-output/framework-gate-"));
  const run = () => spawnSync(process.execPath, [checker], { cwd: root, encoding: "utf8" });
  try {
    const pkg = join(root, "packages/n8n-nodes-strale");
    mkdirSync(join(pkg, "nodes/Strale"), { recursive: true });
    mkdirSync(join(pkg, "credentials"), { recursive: true });
    const manifest = {
      name: "n8n-nodes-strale",
      n8n: {
        nodes: ["dist/nodes/Strale/Strale.node.js"],
        credentials: ["dist/credentials/StraleApi.credentials.js"],
      },
    };
    const node =
      "import type { IExecuteFunctions, INodeType, INodeTypeDescription } from 'n8n-workflow';\n" +
      "export class Strale implements INodeType {\n  description: INodeTypeDescription = {\n    properties: [],\n  };\n" +
      "  async execute(this: IExecuteFunctions) { return [[]]; }\n}\n";
    const cred =
      "import type { ICredentialType } from 'n8n-workflow';\nexport class StraleApi implements ICredentialType {}\n";
    const write = (m, n, c) => {
      writeFileSync(join(pkg, "package.json"), JSON.stringify(m));
      writeFileSync(join(pkg, "nodes/Strale/Strale.node.ts"), n);
      writeFileSync(join(pkg, "credentials/StraleApi.credentials.ts"), c);
    };
    write(manifest, node, cred);
    assert.equal(run().status, 0, "a real node and credential pass");
    // Import only, no node class or execute.
    write(manifest, "import { NodeOperationError } from 'n8n-workflow';\nexport const x = NodeOperationError;\n", cred);
    const hollow = run();
    assert.equal(hollow.status, 1);
    assert.match(hollow.stderr, /n8n-nodes-strale/);
    // A runtime dependency disqualifies a verified n8n package.
    write({ ...manifest, dependencies: { axios: "1.0.0" } }, node, cred);
    assert.equal(run().status, 1);
    // The node must be registered in package.json's n8n block.
    write({ ...manifest, n8n: { nodes: [], credentials: manifest.n8n.credentials } }, node, cred);
    assert.equal(run().status, 1);
    // Missing credential class.
    write(manifest, node, "export const nothing = 1;\n");
    assert.equal(run().status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
