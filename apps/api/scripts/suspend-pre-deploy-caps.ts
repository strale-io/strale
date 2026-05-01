/**
 * Suspend the 4 capabilities onboarded today (2026-04-30) until their
 * PRs merge and Railway redeploys with the executor files.
 *
 * Why: the onboarding pipeline writes to the production DB even when the
 * executor file only exists on a feature branch. Production's auto-register
 * can't find the file at startup, every test run fails with "No executor
 * registered", and the cap auto-degrades. Customers may see the cap in
 * /v1/capabilities and call it, getting an error response.
 *
 * This script suspends them: isActive=false + visible=false +
 * lifecycleState=validating. Re-activate via reactivate-pre-deploy-caps.ts
 * once the PRs merge and the new code is deployed.
 *
 * Slugs:
 *   gleif-l2-ubo-lookup        (PR #23)
 *   fr-bodacc-lookup           (PR #24)
 *   no-bankruptcy-check        (PR #25)
 *   gleif-l2-children-lookup   (PR #28)
 *
 * Long-term fix (out of scope here): pipeline should detect missing
 * executor on the deploy target and refuse to set lifecycle=active.
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
    isActive: false,
    visible: false,
    lifecycleState: "validating",
    updatedAt: new Date(),
  })
  .where(inArray(capabilities.slug, SLUGS))
  .returning({
    slug: capabilities.slug,
    isActive: capabilities.isActive,
    visible: capabilities.visible,
    lifecycleState: capabilities.lifecycleState,
  });

console.log("Suspended:");
for (const r of result) {
  console.log(`  ${r.slug.padEnd(28)} active=${r.isActive} visible=${r.visible} lifecycle=${r.lifecycleState}`);
}
console.log(`\n${result.length} of ${SLUGS.length} rows updated.`);
process.exit(0);
