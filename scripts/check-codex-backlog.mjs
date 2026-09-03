#!/usr/bin/env node
/**
 * CLI for the Codex re-review backlog. Exits 1 on any finding; warnings are
 * printed and do not fail.
 *
 *   node scripts/check-codex-backlog.mjs
 *   node scripts/check-codex-backlog.mjs --today 2026-09-08   (test the date rule)
 *   node scripts/check-codex-backlog.mjs --base main          (history against a ref)
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBacklog, BACKLOG_PATH } from "./codex-backlog-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const { findings, warnings, entries } = checkBacklog(root, {
  ...(flag("--today") ? { today: flag("--today") } : {}),
  ...(flag("--base") ? { baseRef: flag("--base") } : {}),
});

const open = entries.filter((e) => e?.status === "pending" || e?.status === "in_review");
console.log(`${entries.length} row(s) in ${BACKLOG_PATH}; ${open.length} awaiting Codex`);
for (const e of open) console.log(`  ${e.id}  ${(e.priority ?? "").padEnd(6)} ${e.subject}`);
for (const w of warnings) console.log(`  note: [${w.code}] ${w.detail}`);

if (findings.length === 0) {
  console.log("ok   codex re-review backlog");
  process.exit(0);
}
for (const f of findings) console.error(`- [${f.code}] ${f.file}: ${f.detail}`);
process.exit(1);
