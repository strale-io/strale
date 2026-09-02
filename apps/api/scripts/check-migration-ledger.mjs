#!/usr/bin/env node
// CLI: validates apps/api/src/lib/startup-migrations.ledger.json against
// apps/api/src/lib/startup-migrations.ts. Fails on: a ledgered block whose
// content hash has changed (edited in place — migration blocks are
// append-only, an edit needs a new block), a block in the source with no
// ledger row, a ledger row whose block no longer exists, and two blocks
// writing the same table.column that isn't in known_overlaps (the
// 2026-08-21 incident class).
//
// Usage:
//   node apps/api/scripts/check-migration-ledger.mjs [--json]
//   node apps/api/scripts/check-migration-ledger.mjs --update   (append rows for new blocks only; never rewrites an existing row; never touches known_overlaps)
//
// Wired at the repo root as `npm run migrations:check` (mirrors models:check).
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  addedDateForLine,
  checkLedger,
  computeCurrentBlocks,
  isDirectInvocation,
  LEDGER_PATH,
  loadLedger,
  repoRootFrom,
  SOURCE_PATH,
} from "./migration-ledger-lib.mjs";

function runUpdate(root) {
  const current = computeCurrentBlocks(root);
  let ledger = loadLedger(root);
  if (!ledger) ledger = { source: SOURCE_PATH, blocks: [], known_overlaps: [] };

  const existingFunctions = new Set(ledger.blocks.map((b) => b.function));
  const existingIdNumbers = ledger.blocks.map((b) => Number(b.id.replace(/^M/, ""))).filter((n) => !Number.isNaN(n));
  let nextIdNumber = existingIdNumbers.length > 0 ? Math.max(...existingIdNumbers) + 1 : 1;

  const added = [];
  for (const block of current) {
    if (existingFunctions.has(block.functionName)) continue;
    const id = `M${String(nextIdNumber).padStart(3, "0")}`;
    nextIdNumber++;
    const addedDate = addedDateForLine(root, SOURCE_PATH, block.startLine + 1) ?? new Date().toISOString().slice(0, 10);
    const row = {
      id,
      function: block.functionName,
      title: block.title,
      added: addedDate,
      columns_written: block.columns_written,
      sha256: block.sha256,
    };
    ledger.blocks.push(row);
    added.push(row);
  }

  writeFileSync(resolve(root, LEDGER_PATH), `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return added;
}

if (isDirectInvocation(import.meta.url)) {
  const root = repoRootFrom(import.meta.url);
  const json = process.argv.includes("--json");
  const update = process.argv.includes("--update");

  if (update) {
    const added = runUpdate(root);
    if (json) {
      console.log(JSON.stringify({ ok: true, added: added.map((b) => b.id) }, null, 2));
    } else if (added.length === 0) {
      console.log(`${LEDGER_PATH}: no new blocks to add`);
    } else {
      console.log(`${LEDGER_PATH}: added ${added.length} block${added.length === 1 ? "" : "s"}: ${added.map((b) => `${b.id} (${b.function})`).join(", ")}`);
    }
    process.exit(0);
  }

  const { findings, current } = checkLedger(root);
  if (json) {
    console.log(JSON.stringify({ ok: findings.length === 0, findings, block_count: current.length }, null, 2));
  } else {
    console.log(`checked ${current.length} migration blocks in ${SOURCE_PATH}`);
    if (findings.length === 0) {
      console.log("ok   migration ledger");
    } else {
      console.log(`FAIL migration ledger (${findings.length} finding${findings.length === 1 ? "" : "s"})`);
      for (const f of findings) console.log(`  ${f.code} ${f.block}: ${f.detail}`);
    }
  }
  process.exit(findings.length === 0 ? 0 : 1);
}
