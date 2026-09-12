#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  M2_CANDIDATE_DOCUMENTS,
  M2_GENERATED_DOCUMENTS,
  SKELETON_DOCUMENTS,
  buildInventory,
  generatedFiles,
  isCutoverUnderway,
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
import {
  readDecisionRecords,
  validateDecisionRepository,
} from "./decision-records-lib.mjs";
import { checkClosureRegister } from "./m2-closure-register-lib.mjs";

function finding(code, path, detail) {
  return { severity: "warning", code, path, ...(detail ? { detail } : {}) };
}

const GENERATED_CONTEXT_FILES = [
  "docs/project/DECISIONS.md",
  "docs/project/PROTOCOL-ROUTER.md",
  "docs/project/RECENT.md",
  "docs/project/legacy-authority-inventory.json",
  "docs/project/schemas/project-document.schema.json",
  "docs/project/schemas/operator-actions.schema.json",
  "docs/project/schemas/decision-record.schema.json",
  "docs/project/schemas/decision-id-collisions.schema.json",
  "docs/project/schemas/legacy-authority-inventory.schema.json",
];

export function checkGeneratedFileState(root, expected, files = GENERATED_CONTEXT_FILES) {
  const findings = [];
  for (const file of files) {
    const absolute = resolve(root, file);
    if (!existsSync(absolute)) {
      findings.push(finding("GENERATED_FILE_MISSING", file));
      continue;
    }
    if (readFileSync(absolute, "utf8") !== expected[file]) {
      findings.push(finding("GENERATED_FILE_DRIFT", file));
    }
  }
  return findings;
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

// Findings that mean "the generated project context was not regenerated",
// the drift the commit gate's `inventory` step exists to catch. Every code
// below comes from a check whose expected value is written by
// `npm run context:generate` (checkGeneratedFileState's byte comparison, the
// SKELETON_DOCUMENTS contract validateSkeletonDocument enforces, and the
// legacy-authority-inventory.json shape/hash validateInventory and the
// INVENTORY_HASH_DRIFT comparison enforce), plus the one failure mode where
// computing the expected content itself throws. Every other finding code in
// this file is about hand-authored candidate or registry content
// (M2_CANDIDATE_DOCUMENTS, docs/operations/operator-actions.yaml,
// docs/decisions/records, docs/project/m2-closure-register.yaml, the
// pre-cutover entrypoint guard, the private-archive status) that
// `context:generate` never touches, so staging an inventory target must not
// fail a commit over one of those.
export const REGENERATION_FINDING_CODES = new Set([
  "FOUNDATION_GENERATION_FAILED",
  "GENERATED_FILE_MISSING",
  "GENERATED_FILE_DRIFT",
  "SKELETON_FILE_MISSING",
  "SKELETON_FRONTMATTER_MISSING",
  "SKELETON_MARKER_INVALID",
  "SKELETON_BANNER_MISSING",
  "SKELETON_SENTINEL_MISSING",
  "SKELETON_TEMPLATE_DRIFT",
  "INVENTORY_HASH_DRIFT",
  "INVENTORY_INVALID_JSON",
  "INVENTORY_MODE_INVALID",
  "INVENTORY_FIELD_OUT_OF_SCOPE",
]);

export function checkPrecutoverEntrypoint(entrypoint, content, cutoverUnderway = false) {
  // Once the M4 cutover track (cto-readiness T7) is under way, an entrypoint
  // pointing at docs/project or docs/decisions is expected, not a violation:
  // that is the whole point of the cutover batches. Before T7 starts, the
  // rule is exactly what it always was.
  if (cutoverUnderway) return [];
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

  for (const [file, expectedDocType] of Object.entries({
    ...M2_CANDIDATE_DOCUMENTS,
    ...M2_GENERATED_DOCUMENTS,
  })) {
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

  try {
    findings.push(
      ...validateDecisionRepository(root, readDecisionRecords(root)).map((item) => ({
        severity: "warning",
        ...item,
      })),
    );
  } catch (error) {
    findings.push(finding("DECISION_RECORD_CHECK_FAILED", "docs/decisions/records", error.message));
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

  findings.push(...checkGeneratedFileState(root, expected));

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

  const cutoverUnderway = isCutoverUnderway(root);
  for (const entrypoint of ["AGENTS.md", "CLAUDE.md"]) {
    const content = readFileSync(resolve(root, entrypoint), "utf8");
    findings.push(...checkPrecutoverEntrypoint(entrypoint, content, cutoverUnderway));
  }

  findings.push(...checkPrivateArchiveStatus(root));

  try {
    findings.push(
      ...checkClosureRegister(root).map((item) => ({ severity: "warning", ...item })),
    );
  } catch (error) {
    findings.push(finding("CLOSURE_REGISTER_CHECK_FAILED", "docs/project/m2-closure-register.yaml", error.message));
  }

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
