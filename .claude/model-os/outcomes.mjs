#!/usr/bin/env node
// Append-only verification and acceptance outcomes for dispatch receipts.
// No transcript or artifact content is stored here.

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { appendBoundedJsonl, resolveStateDir } from "./state-store.mjs";
import { sanitizeBoundedText } from "./telemetry.mjs";

const VERIFICATION = new Set(["unknown", "passed", "failed"]);
const ACCEPTANCE = new Set(["unknown", "accepted", "rejected", "reverted"]);
const BOUNDED_ID = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,119}$/;

function nonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function stringArray(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  return [...new Set(value.map((item) => item.trim()))];
}

function optionalId(value, label) {
  if (value == null) return null;
  if (typeof value !== "string" || !BOUNDED_ID.test(value)) throw new Error(`${label} must be a bounded identifier`);
  return value;
}

export function validateOutcome(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("outcome must be an object");
  const receiptId = nonEmptyString(input.receipt_id || input.receiptId, "receipt_id");
  const verification = input.verification || "unknown";
  const acceptance = input.acceptance || "unknown";
  if (!VERIFICATION.has(verification)) throw new Error(`verification '${verification}' is invalid`);
  if (!ACCEPTANCE.has(acceptance)) throw new Error(`acceptance '${acceptance}' is invalid`);
  const source = nonEmptyString(input.source, "source");
  const checks = stringArray(input.checks, "checks");
  if (verification !== "unknown" && (!source.startsWith("machine:") || !checks.length)) {
    throw new Error("verified outcomes require a machine: source and at least one named check");
  }
  const reworkCount = input.rework_count == null ? 0 : Number(input.rework_count);
  if (!Number.isInteger(reworkCount) || reworkCount < 0) throw new Error("rework_count must be a non-negative integer");
  return {
    schema_version: 1,
    id: input.id || randomUUID(),
    at: input.at || new Date().toISOString(),
    receipt_id: receiptId,
    task_id: optionalId(input.task_id || input.taskId, "task_id"),
    phase_id: optionalId(input.phase_id || input.phaseId, "phase_id"),
    verification,
    acceptance,
    source,
    checks,
    rework_count: reworkCount,
    user_override: Boolean(input.user_override),
    notes: typeof input.notes === "string" && input.notes.trim() ? sanitizeBoundedText(input.notes.trim(), { maxLength: 500 }) : null,
  };
}

export function recordOutcome(input, { stateDir = null, maxEntries = 2000 } = {}) {
  const row = validateOutcome(input);
  appendBoundedJsonl({ stateDir: resolveStateDir(stateDir), fileName: "outcomes.jsonl", row, maxEntries });
  return row;
}

export function readOutcomes({ stateDir = null } = {}) {
  const file = path.join(resolveStateDir(stateDir), "outcomes.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
    try { return validateOutcome(JSON.parse(line)); }
    catch (error) { throw new Error(`outcomes.jsonl line ${index + 1}: ${error.message}`); }
  });
}

export function latestOutcomesByReceipt(rows) {
  const latest = new Map();
  for (const row of rows || []) {
    const previous = latest.get(row.receipt_id);
    if (!previous || Date.parse(row.at) >= Date.parse(previous.at)) latest.set(row.receipt_id, row);
  }
  return latest;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--user-override" || arg === "--json") args[arg.slice(2)] = true;
    else if (arg.startsWith("--")) {
      const value = argv[++index];
      if (value == null) throw new Error(`${arg} requires a value`);
      args[arg.slice(2)] = value;
    } else throw new Error(`unexpected positional argument '${arg}'`);
  }
  return args;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const row = recordOutcome({
    receipt_id: args["receipt-id"],
    task_id: args["task-id"] || null,
    phase_id: args["phase-id"] || null,
    verification: args.verification || "unknown",
    acceptance: args.acceptance || "unknown",
    source: args.source,
    checks: args.checks ? String(args.checks).split(",").map((item) => item.trim()).filter(Boolean) : [],
    rework_count: args["rework-count"] == null ? 0 : Number(args["rework-count"]),
    user_override: args["user-override"] === true,
    notes: args.notes || null,
  }, { stateDir: args["state-dir"], maxEntries: args["max-entries"] == null ? 2000 : Number(args["max-entries"]) });
  process.stdout.write(args.json ? `${JSON.stringify(row, null, 2)}\n` : `outcome recorded for ${row.receipt_id}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`MODEL-OS outcome error: ${error.message}\n`);
    process.exitCode = 3;
  });
}
