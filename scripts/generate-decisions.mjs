#!/usr/bin/env node
// Regenerates the decision index (docs/project/DECISIONS.md) and its two
// schemas from docs/decisions/ (DEC-20261024-A; checked by
// scripts/check-decisions.mjs).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { decisionGeneratedFiles } from "./decision-records-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const [file, content] of Object.entries(decisionGeneratedFiles(root))) {
  mkdirSync(dirname(resolve(root, file)), { recursive: true });
  writeFileSync(resolve(root, file), content, "utf8");
  console.log(`wrote ${file}`);
}
