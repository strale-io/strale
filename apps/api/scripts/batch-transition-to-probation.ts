/**
 * Batch-transition dark-launch caps to probation (then let the sweep promote them).
 * Only transitions caps currently in draft/validating with SQS >= 50.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { getDb } from "../src/db/index.js";
import { capabilities } from "../src/db/schema.js";
import { and, eq, inArray } from "drizzle-orm";
import { transitionCapability } from "../src/lib/lifecycle.js";
import { computeDualProfileSQS } from "../src/lib/sqs.js";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const DRY_RUN = process.argv.includes("--dry-run");
const TO_STATE = (process.argv.find(a => a.startsWith("--to="))?.split("=")[1] ?? "probation") as any;
const MIN_SQS = 50;

const db = getDb();

const FROM_STATES = ["draft", "validating", "probation"] as const;

const darkCaps = await db
  .select({ slug: capabilities.slug, lifecycleState: capabilities.lifecycleState })
  .from(capabilities)
  .where(
    and(
      eq(capabilities.visible, false),
      inArray(capabilities.lifecycleState, [...FROM_STATES]),
    )
  )
  .orderBy(capabilities.slug);

console.log(`Found ${darkCaps.length} dark-launch caps in draft/validating`);
console.log(`Transitioning to: ${TO_STATE}`);
console.log(`Min SQS required: ${MIN_SQS}`);
console.log(`Dry run: ${DRY_RUN}\n`);

let transitioned = 0;
let skipped = 0;

for (const cap of darkCaps) {
  const dual = await computeDualProfileSQS(cap.slug);
  const score = dual.score;
  const pending = dual.matrix.pending;
  const meetsThreshold = !pending && score >= MIN_SQS;

  process.stdout.write(`  ${cap.slug.padEnd(42)} SQS=${pending ? "pending" : score.toFixed(1).padStart(5)} `);

  if (!meetsThreshold) {
    console.log(`→ SKIP (${pending ? "pending" : `SQS ${score.toFixed(1)} < ${MIN_SQS}`})`);
    skipped++;
    continue;
  }

  if (!DRY_RUN) {
    await transitionCapability(
      cap.slug,
      TO_STATE,
      `Admin batch: dark-launch qualification (SQS ${score.toFixed(1)})`,
      "admin",
      score,
    );
  }

  console.log(`→ ${cap.lifecycleState} → ${TO_STATE} ✓`);
  transitioned++;
}

console.log(`\n${transitioned} transitioned, ${skipped} skipped`);

if (!DRY_RUN && transitioned > 0) {
  console.log("\nDone. Run the lifecycle sweep next to promote qualifying caps to active.");
}

process.exit(0);
