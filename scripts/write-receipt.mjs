#!/usr/bin/env node
// Writes an archive/receipts/*.json file from a command's JSON output.
// Fills produced_by.commit and `at` automatically; produced_by.script,
// inputs, and summary are inferred where the source JSON matches the
// repo-wide check-*.mjs --json shape ({ok, failures[], warnings[], ...
// count fields}) and can be overridden explicitly.
//
// Usage:
//   node scripts/write-receipt.mjs --kind check --topic handoff-gate --from <path|->
//   node scripts/handoff/handoff-check.mjs --json | node scripts/write-receipt.mjs --kind check --topic handoff-gate --from -
//
// Flags:
//   --kind <kind>        required: test-run | sweep | audit | check
//   --topic <topic>      required: kebab-slug, becomes the filename's <topic>
//   --from <path|->      required: JSON source file, or "-" for stdin
//   --script <path>      optional: producer script recorded in produced_by.script
//                         (default: scripts/write-receipt.mjs, since this tool
//                         is what actually wrote the file)
//   --summary <json>     optional: explicit summary object; overrides inference
//   --inputs <json>      optional: explicit inputs value; overrides the default
//   --date <YYYY-MM-DD>  optional: override the filename/at date (default: today, UTC)
//   --out-dir <dir>      optional: override archive/receipts (default)
//   --dry-run            print the receipt and target path without writing
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isCalendarDate, repoRootFrom } from "./program-tracks-lib.mjs";
import { isDirectInvocation, RECEIPTS_DIR } from "./receipts-lib.mjs";

const KIND_ENUM = new Set(["test-run", "sweep", "audit", "check"]);
const TOPIC_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    const flag = arg.replace(/^--/, "");
    const known = ["kind", "topic", "from", "script", "summary", "inputs", "date", "out-dir"];
    if (arg.startsWith("--") && known.includes(flag)) {
      out[flag] = argv[++i];
    }
  }
  return out;
}

function readStdin() {
  return readFileSync(0, "utf8");
}

/**
 * Infers a summary object from a parsed JSON value that matches the
 * repo-wide check-*.mjs --json convention: {ok, failures: [...],
 * warnings: [...], <count fields>}. Returns null when nothing usable is
 * found — the caller must then supply --summary explicitly.
 */
export function inferSummary(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const summary = {};
  if ("ok" in data && (typeof data.ok === "boolean")) summary.ok = data.ok;
  for (const key of ["failures", "warnings", "findings"]) {
    if (Array.isArray(data[key])) summary[`${key}_count`] = data[key].length;
  }
  for (const [key, value] of Object.entries(data)) {
    if (["failures", "warnings", "findings", "ok"].includes(key)) continue;
    if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
      summary[key] = value;
    }
  }
  return Object.keys(summary).length > 0 ? summary : null;
}

function fail(message) {
  console.error(`write-receipt: ${message}`);
  process.exit(1);
}

function main() {
  const root = repoRootFrom(import.meta.url);
  const args = parseArgs(process.argv.slice(2));

  if (!args.kind || !KIND_ENUM.has(args.kind)) {
    fail(`--kind is required and must be one of ${[...KIND_ENUM].join(", ")}`);
  }
  if (!args.topic || !TOPIC_PATTERN.test(args.topic)) {
    fail("--topic is required and must be a kebab-slug (e.g. handoff-gate)");
  }
  if (!args.from) fail("--from <path|-> is required");

  let raw;
  const source = args.from === "-" ? readStdin() : readFileSync(resolve(root, args.from), "utf8");
  try {
    raw = JSON.parse(source);
  } catch (err) {
    fail(`--from did not contain valid JSON: ${err.message}`);
  }

  let summary = null;
  if (args.summary) {
    try {
      summary = JSON.parse(args.summary);
    } catch (err) {
      fail(`--summary is not valid JSON: ${err.message}`);
    }
  } else {
    summary = inferSummary(raw);
  }
  if (!summary) {
    fail("could not infer a summary from --from's JSON shape; pass --summary '{...}' explicitly");
  }

  let inputs;
  if (args.inputs) {
    try {
      inputs = JSON.parse(args.inputs);
    } catch (err) {
      fail(`--inputs is not valid JSON: ${err.message}`);
    }
  } else {
    inputs = { source: args.from === "-" ? "stdin" : args.from };
  }

  const date = args.date ?? new Date().toISOString().slice(0, 10);
  if (!isCalendarDate(date)) fail(`--date "${date}" is not a real calendar date`);

  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

  const receipt = {
    kind: args.kind,
    produced_by: {
      script: args.script ?? "scripts/write-receipt.mjs",
      commit,
    },
    at: new Date().toISOString(),
    inputs,
    summary,
    topic: args.topic,
    raw,
  };

  const outDir = resolve(root, args["out-dir"] ?? RECEIPTS_DIR);
  const filename = `${date}-${args.kind}-${args.topic}.json`;
  const outPath = resolve(outDir, filename);
  const relPath = `${(args["out-dir"] ?? RECEIPTS_DIR).replace(/\\/g, "/")}/${filename}`;

  if (args.dryRun) {
    console.log(JSON.stringify(receipt, null, 2));
    console.log(`(dry run — would write ${relPath})`);
    return;
  }

  if (existsSync(outPath)) {
    fail(`${relPath} already exists — receipts are never overwritten; use a different --topic or wait a day`);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  console.log(`wrote ${relPath}`);
}

if (isDirectInvocation(import.meta.url)) main();
