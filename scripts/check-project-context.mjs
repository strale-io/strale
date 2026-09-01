#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  M2_CANDIDATE_DOCUMENTS,
  SKELETON_DOCUMENTS,
  buildInventory,
  generatedFiles,
  isDirectInvocation,
  repoRootFrom,
  validateInventory,
  validateCandidateDocument,
  validateOperatorActions,
  validateOperatorActionEvidence,
  validateOperatorActionHistoryAgainstGit,
  validatePendingFounderDecisions,
  validateStateEvidence,
  validateSkeletonDocument,
} from "./project-context-lib.mjs";

function finding(code, path, detail) {
  return { severity: "warning", code, path, ...(detail ? { detail } : {}) };
}

export function checkPrivateArchiveStatus(root) {
  const relativePath = "docs/project/private-archive-status.json";
  const statusPath = resolve(root, relativePath);
  if (!existsSync(statusPath)) {
    return [finding("PRIVATE_ARCHIVE_STATUS_MISSING", relativePath)];
  }

  try {
    const status = JSON.parse(readFileSync(statusPath, "utf8"));
    if (status.complete !== true) {
      return [
        finding(
          "M0_NOTION_EXPORT_INCOMPLETE",
          relativePath,
          "private preservation export remains incomplete; blocks M2 and cutover",
        ),
      ];
    }
    return [];
  } catch (error) {
    return [finding("PRIVATE_ARCHIVE_STATUS_INVALID", relativePath, error.message)];
  }
}

export function checkPrecutoverEntrypoint(entrypoint, content) {
  return /docs[\\/](?:project|decisions)(?:[\\/]|\b)/.test(content)
    ? [finding("M1_ENTRYPOINT_ACTIVATED", entrypoint)]
    : [];
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

  for (const [file, expectedDocType] of Object.entries(M2_CANDIDATE_DOCUMENTS)) {
    const absolute = resolve(root, file);
    if (!existsSync(absolute)) {
      findings.push(finding("CANDIDATE_FILE_MISSING", file));
      continue;
    }
    const actual = readFileSync(absolute, "utf8");
    findings.push(
      ...validateCandidateDocument(file, actual, expectedDocType).map((item) => ({
        severity: "warning",
        ...item,
      })),
    );
    if (expectedDocType === "project-state") {
      findings.push(
        ...validateStateEvidence(root, file, actual).map((item) => ({
          severity: "warning",
          ...item,
        })),
      );
    }
    if (expectedDocType === "pending-founder-decisions") {
      findings.push(
        ...validatePendingFounderDecisions(file, actual).map((item) => ({
          severity: "warning",
          ...item,
        })),
      );
    }
  }

  const operatorActionsFile = "docs/operations/operator-actions.yaml";
  const operatorActionsPath = resolve(root, operatorActionsFile);
  if (!existsSync(operatorActionsPath)) {
    findings.push(finding("OPERATOR_ACTIONS_FILE_MISSING", operatorActionsFile));
  } else {
    findings.push(
      ...validateOperatorActions(
        operatorActionsFile,
        readFileSync(operatorActionsPath, "utf8"),
      ).map((item) => ({ severity: "warning", ...item })),
      ...validateOperatorActionEvidence(
        root,
        operatorActionsFile,
        readFileSync(operatorActionsPath, "utf8"),
      ).map((item) => ({ severity: "warning", ...item })),
      ...validateOperatorActionHistoryAgainstGit(
        root,
        operatorActionsFile,
        readFileSync(operatorActionsPath, "utf8"),
      ).map((item) => ({ severity: "warning", ...item })),
    );
  }

  for (const file of [
    "docs/project/DECISIONS.md",
    "docs/project/RECENT.md",
    "docs/project/legacy-authority-inventory.json",
    "docs/project/schemas/project-document.schema.json",
    "docs/project/schemas/operator-actions.schema.json",
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
    findings.push(...checkPrecutoverEntrypoint(entrypoint, content));
  }

  findings.push(...checkPrivateArchiveStatus(root));

  return findings;
}

function main() {
  const findings = runChecks();
  const json = process.argv.includes("--json");
  if (json) {
    console.log(JSON.stringify({ mode: "warning-only", findings }, null, 2));
  } else {
    console.log("project context check: warning-only (M2 candidate foundation)");
    if (findings.length === 0) console.log("  no warnings");
    for (const item of findings) {
      console.log(`  WARN ${item.code} ${item.path}${item.detail ? ` — ${item.detail}` : ""}`);
    }
  }
  // M1 contract: findings are reports, never a blocking exit code.
  process.exitCode = 0;
}

if (isDirectInvocation(import.meta.url)) main();
