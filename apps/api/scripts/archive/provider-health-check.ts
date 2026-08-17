/**
 * Diagnostic: which providers does the scheduler currently see as unhealthy?
 * If a provider's health probe is broken, the scheduler perpetually skips
 * every cap that depends on it (test-scheduler.ts:442-470).
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

config({ path: resolve(import.meta.dirname, "../../../.env") });

if (!process.env.DATABASE_URL) {
  const buf = readFileSync(resolve(import.meta.dirname, "../../../.env"));
  const text = buf.toString("utf16le");
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  for (const line of clean.split(/\r?\n/)) {
    if (line.startsWith("DATABASE_URL=")) {
      process.env.DATABASE_URL = line.substring("DATABASE_URL=".length);
      break;
    }
  }
}

import { runDependencyHealthChecks } from "../src/lib/dependency-health.js";
import { getActiveProviders } from "../src/lib/dependency-manifest.js";

console.log(`\n=== Running dependency health checks ===\n`);
const health = await runDependencyHealthChecks();

const providers = getActiveProviders();
const unhealthy: Array<{ provider: string; reason: string; capCount: number; sample: string[] }> = [];
const healthy: Array<{ provider: string; capCount: number }> = [];

for (const p of providers) {
  const h = health[p.name];
  if (h && !h.healthy) {
    unhealthy.push({
      provider: p.name,
      reason: h.error ?? "no reason given",
      capCount: p.capabilities.length,
      sample: p.capabilities.slice(0, 5),
    });
  } else {
    healthy.push({ provider: p.name, capCount: p.capabilities.length });
  }
}

console.log(`=== UNHEALTHY providers (cause skipped scheduling) ===\n`);
console.log(`Total: ${unhealthy.length} unhealthy provider(s)`);
let totalSkipped = 0;
for (const u of unhealthy) {
  totalSkipped += u.capCount;
  console.log(`\n  ${u.provider}`);
  console.log(`    reason: ${u.reason}`);
  console.log(`    capabilities affected: ${u.capCount}`);
  console.log(`    sample: ${u.sample.join(", ")}${u.capCount > 5 ? ", ..." : ""}`);
}

console.log(`\n=== HEALTHY providers ===\n`);
for (const h of healthy) {
  console.log(`  ${h.provider.padEnd(30)} ${h.capCount} caps`);
}

console.log(`\n=== Summary ===`);
console.log(`Unhealthy providers: ${unhealthy.length}`);
console.log(`Caps perpetually skipped by scheduler due to unhealthy providers: ${totalSkipped}`);

process.exit(0);
