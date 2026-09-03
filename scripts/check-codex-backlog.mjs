#!/usr/bin/env node
/**
 * CLI for the Codex re-review backlog. Exits 1 on any finding.
 *
 *   node scripts/check-codex-backlog.mjs
 *   node scripts/check-codex-backlog.mjs --today 2026-09-08   (test the date rule)
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBacklog, BACKLOG_PATH } from "./codex-backlog-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const todayIndex = args.indexOf("--today");
const today = todayIndex >= 0 ? args[todayIndex + 1] : undefined;

const { findings, entries } = checkBacklog(root, today ? { today } : {});

const open = entries.filter((e) => e?.status === "pending" || e?.status === "in_review");
console.log(`${entries.length} row(s) in ${BACKLOG_PATH}; ${open.length} awaiting Codex`);
for (const e of open) {
  console.log(`  ${e.id}  ${e.priority?.padEnd(6) ?? ""} ${e.subject}`);
}

if (findings.length === 0) {
  console.log("ok   codex re-review backlog");
  process.exit(0);
}
for (const f of findings) console.error(`- [${f.code}] ${f.file}: ${f.detail}`);
process.exit(1);
