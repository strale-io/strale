#!/usr/bin/env node
// Resolve one complete MODEL-OS installation so executable code, registry, policy,
// and hooks always come from the same nearest source.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REQUIRED = [
  "routing.json",
  "policy.json",
  "select.mjs",
  "dispatch.mjs",
  "maintenance.mjs",
  "freshness-daemon.mjs",
  "phase-execution.mjs",
  "task-evidence.mjs",
  "calibration.mjs",
  "quota-recovery.mjs",
  "resolve-root.mjs",
  "hooks/model-os-health.mjs",
];

const LOCAL_IMPORT_PATTERNS = [
  /(?:from\s*|import\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g,
  /import\s*["'](\.{1,2}\/[^"']+)["']/g,
  /new\s+URL\(\s*["'](\.{1,2}\/[^"']+)["']\s*,\s*import\.meta\.url/g,
];

function complete(candidate) {
  if (!candidate) return false;
  const root = path.resolve(candidate);
  const queue = [...REQUIRED];
  const seen = new Set();
  try {
    while (queue.length) {
      const relative = queue.shift().replaceAll("\\", "/");
      if (seen.has(relative)) continue;
      seen.add(relative);
      const file = path.resolve(root, relative);
      if (file !== root && !file.startsWith(`${root}${path.sep}`)) return false;
      if (!existsSync(file)) return false;
      if (path.extname(file).toLowerCase() !== ".mjs") continue;
      const source = readFileSync(file, "utf8");
      for (const pattern of LOCAL_IMPORT_PATTERNS) {
        pattern.lastIndex = 0;
        for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
          const dependency = path.resolve(path.dirname(file), match[1]);
          if (!dependency.startsWith(`${root}${path.sep}`)) return false;
          queue.push(path.relative(root, dependency).replaceAll("\\", "/"));
        }
      }
    }
    return true;
  } catch { return false; }
}

export function resolveModelOsRoot({ startDir = process.cwd(), env = process.env, selfDir = HERE } = {}) {
  let current = path.resolve(startDir);
  while (true) {
    for (const candidate of [
      path.join(current, ".claude", "model-os"),
      path.join(current, "model-os"),
      path.basename(current).toLowerCase() === "model-os" ? current : null,
    ]) {
      if (complete(candidate)) return path.resolve(candidate);
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (complete(env.MODEL_OS_HOME)) return path.resolve(env.MODEL_OS_HOME);
  if (complete(selfDir)) return path.resolve(selfDir);
  throw new Error("no complete MODEL-OS installation found");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${resolveModelOsRoot()}\n`); }
  catch (error) {
    process.stderr.write(`MODEL-OS resolver failed: ${error.message}\n`);
    process.exitCode = 3;
  }
}
