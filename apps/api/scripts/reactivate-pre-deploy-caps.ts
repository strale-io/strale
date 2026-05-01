/**
 * Re-activate the 4 capabilities suspended by suspend-pre-deploy-caps.ts.
 * Run this AFTER the corresponding PRs (#23, #24, #25, #28) merge and
 * Railway has deployed.
 *
 * Sets: isActive=true, visible=true, lifecycleState=active.
 *
 * The scheduler picks them up on the next tick. After 3 consecutive
 * passes, recovery is automatic per the SQS recovery rule.
 *
 * Verification: after running this, watch the test_results table for
 * passing test runs — should see PASS results within ~10-15 minutes.
 * If failures continue, the executor still isn't deployed.
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

import { getDb } from "../src/db/index.js";
import { capabilities } from "../src/db/schema.js";
import { inArray } from "drizzle-orm";

const SLUGS = [
  "gleif-l2-ubo-lookup",
  "fr-bodacc-lookup",
  "no-bankruptcy-check",
  "gleif-l2-children-lookup",
];

const db = getDb();
const result = await db
  .update(capabilities)
  .set({
    isActive: true,
    visible: true,
    lifecycleState: "active",
    updatedAt: new Date(),
  })
  .where(inArray(capabilities.slug, SLUGS))
  .returning({
    slug: capabilities.slug,
    isActive: capabilities.isActive,
    visible: capabilities.visible,
    lifecycleState: capabilities.lifecycleState,
  });

console.log("Re-activated:");
for (const r of result) {
  console.log(`  ${r.slug.padEnd(28)} active=${r.isActive} visible=${r.visible} lifecycle=${r.lifecycleState}`);
}
console.log(`\n${result.length} of ${SLUGS.length} rows updated.`);
console.log(`\nNext: watch test_results for PASS results within ~10-15 min. If failures persist, executor isn't deployed.`);
process.exit(0);
