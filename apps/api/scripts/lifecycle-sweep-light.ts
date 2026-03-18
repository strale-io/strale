/**
 * Lightweight lifecycle sweep — no scheduler, no side effects.
 * Calls runLifecycleSweep() directly without starting the full app.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { runLifecycleSweep } from "../src/lib/lifecycle.js";

console.log("Running lifecycle sweep...\n");
const transitions = await runLifecycleSweep();

if (transitions.length === 0) {
  console.log("No transitions triggered.");
} else {
  console.log(`${transitions.length} transition(s):`);
  for (const t of transitions) {
    console.log(`  ${t.slug}: ${t.from} → ${t.to} — ${t.reason}`);
  }
}

process.exit(0);
