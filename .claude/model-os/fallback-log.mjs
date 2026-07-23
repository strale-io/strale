#!/usr/bin/env node
// Bounded, atomic writer for machine-local fallback evidence. Runtime evidence
// never dirties a source or synced consumer checkout.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findPolicy, readPolicy } from "./route-state.mjs";
import { findLedger } from "./select.mjs";
import { acquireWriteLock, atomicWriteFile, releaseWriteLock, resolveStateDir } from "./state-store.mjs";

const MARKER = "<!-- append entries below this line -->";
const REASONS = new Set(["limit", "unavailable", "founder-call"]);

function field(value, name) {
  const clean = String(value || "").replace(/[|\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) throw new Error(`${name} is required`);
  return clean;
}

export function appendFallbackEntry({ logPath, entry, maxEntries }) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new Error("maxEntries must be a positive integer");
  const resolved = path.resolve(logPath);
  const dir = path.dirname(resolved);
  const lock = acquireWriteLock(dir, { lockName: `${path.basename(resolved)}.lock` });
  try {
    const text = existsSync(resolved)
      ? readFileSync(resolved, "utf8")
      : `# MODEL-OS fallback log — machine-local evidence\n\n${MARKER}\n`;
    const markerAt = text.indexOf(MARKER);
    if (markerAt < 0) throw new Error(`fallback log marker missing: ${MARKER}`);
    const preamble = text.slice(0, markerAt + MARKER.length).trimEnd();
    const tail = text.slice(markerAt + MARKER.length);
    const previousRotated = Number(tail.match(/<!--\s*rotated_entries:\s*(\d+)\s*-->/)?.[1] || 0);
    const existing = tail.split(/\r?\n/).map((line) => line.trim())
      .filter((line) => line && !line.startsWith("<!--"));
    const date = field(entry?.date, "date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must be YYYY-MM-DD");
    const reason = field(entry?.reason, "reason");
    if (!REASONS.has(reason)) throw new Error(`reason must be one of ${[...REASONS].join("/")}`);
    const line = `${date} | wanted ${field(entry?.wanted, "wanted")} | got ${field(entry?.got, "got")} | ${reason} | ${field(entry?.context, "context")}`;
    const all = [...existing, line];
    const kept = all.slice(-maxEntries);
    const rotated = previousRotated + all.length - kept.length;
    const rendered = `${preamble}\n<!-- rotated_entries: ${rotated} -->\n${kept.length ? `${kept.join("\n")}\n` : ""}`;
    atomicWriteFile(resolved, rendered);
    return { entries: kept.length, rotated, line };
  } finally { releaseWriteLock(lock); }
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`unknown argument: ${arg}`);
    const value = argv[++index];
    if (!value) throw new Error(`${arg} requires a value`);
    out[arg.slice(2)] = value;
  }
  return out;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const foundLedger = args.ledger || findLedger();
  if (!foundLedger) throw new Error("no routing.json found");
  const ledgerPath = path.resolve(foundLedger);
  const policy = readPolicy(args.policy || findPolicy(ledgerPath));
  const maxEntries = policy?.retention?.fallback_log_max_entries;
  const result = appendFallbackEntry({
    logPath: args.log ? path.resolve(args.log) : path.join(resolveStateDir(args["state-dir"]), "fallback.log.md"),
    maxEntries,
    entry: {
      date: args.date || new Date().toISOString().slice(0, 10),
      wanted: args.wanted,
      got: args.got,
      reason: args.reason,
      context: [args.role ? `role ${args.role}` : null, args.context].filter(Boolean).join("; "),
    },
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { process.stderr.write(`fallback-log: ${error.message}\n`); process.exitCode = 3; }
}
