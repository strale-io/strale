#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SKELETON_DOCUMENTS,
  buildInventory,
  generatedFiles,
  isDirectInvocation,
  repoRootFrom,
  validateInventory,
  validateSkeletonDocument,
} from "./project-context-lib.mjs";

function finding(code, path, detail) {
  return { severity: "warning", code, path, ...(detail ? { detail } : {}) };
}

export function runChecks(root = repoRootFrom(import.meta.url)) {
  const findings = [];
  let expected;
  try {
    expected = generatedFiles(root);
  } catch (error) {
    return [finding("FOUNDATION_GENERATION_FAILED", ".", error.message)];
  }

  for (const [file, expectedContent] of Object.entries(SKELETON_DOCUMENTS)) {
    const absolute = resolve(root, file);
    if (!existsSync(absolute)) {
      findings.push(finding("SKELETON_FILE_MISSING", file));
      continue;
    }
    const actual = readFileSync(absolute, "utf8");
    findings.push(
      ...validateSkeletonDocument(file, actual, expectedContent).map((item) => ({
        severity: "warning",
        ...item,
      })),
    );
  }

  for (const file of [
    "docs/project/DECISIONS.md",
    "docs/project/RECENT.md",
    "docs/project/legacy-authority-inventory.json",
    "docs/project/schemas/project-document.schema.json",
    "docs/project/schemas/legacy-authority-inventory.schema.json",
  ]) {
    const absolute = resolve(root, file);
    if (!existsSync(absolute)) continue;
    const actual = readFileSync(absolute, "utf8");
    if (actual !== expected[file]) {
      findings.push(finding("GENERATED_FILE_DRIFT", file));
    }
  }

  const inventoryPath = resolve(root, "docs/project/legacy-authority-inventory.json");
  if (existsSync(inventoryPath)) {
    try {
      const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
      findings.push(
        ...validateInventory(inventory).map((item) => ({ severity: "warning", ...item })),
      );
      const expectedInventory = buildInventory(root);
      if (JSON.stringify(inventory) !== JSON.stringify(expectedInventory)) {
        findings.push(finding("INVENTORY_HASH_DRIFT", "docs/project/legacy-authority-inventory.json"));
      }
    } catch (error) {
      findings.push(finding("INVENTORY_INVALID_JSON", "docs/project/legacy-authority-inventory.json", error.message));
    }
  }

  for (const entrypoint of ["AGENTS.md", "CLAUDE.md"]) {
    const content = readFileSync(resolve(root, entrypoint), "utf8");
    if (
      content.includes("docs/project/START-HERE.md") ||
      content.includes("docs/project/PROTOCOL-ROUTER.md")
    ) {
      findings.push(finding("M1_ENTRYPOINT_ACTIVATED", entrypoint));
    }
  }

  const notionManifestPath = resolve(root, "archive/imports/notion/2026-08-31/manifest.json");
  if (existsSync(notionManifestPath)) {
    const manifest = JSON.parse(readFileSync(notionManifestPath, "utf8"));
    if (manifest.complete !== true) {
      findings.push(
        finding(
          "M0_NOTION_EXPORT_INCOMPLETE",
          "archive/imports/notion/2026-08-31/manifest.json",
          "expected while M1 runs in parallel; blocks M2 and cutover",
        ),
      );
    }
  }

  return findings;
}

function main() {
  const findings = runChecks();
  const json = process.argv.includes("--json");
  if (json) {
    console.log(JSON.stringify({ mode: "warning-only", findings }, null, 2));
  } else {
    console.log("project context check: warning-only (M1 foundation)");
    if (findings.length === 0) console.log("  no warnings");
    for (const item of findings) {
      console.log(`  WARN ${item.code} ${item.path}${item.detail ? ` — ${item.detail}` : ""}`);
    }
  }
  // M1 contract: findings are reports, never a blocking exit code.
  process.exitCode = 0;
}

if (isDirectInvocation(import.meta.url)) main();
