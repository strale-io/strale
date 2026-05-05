/**
 * Admin CLI for lifecycle state management.
 *
 * Usage:
 *   npx tsx scripts/lifecycle-transition.ts --slug <slug> --to <state> [--reason <text>]
 *
 * Valid states: draft | validating | probation | active | degraded | suspended
 *
 * Note: --sweep mode was removed with the SQS engine (DEC-20260503-B).
 * Automatic transitions no longer exist; manual flips only.
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

// Side-effect import to register executors
import "../src/app.js";

import { eq } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { capabilities } from "../src/db/schema.js";
import {
  transitionCapability,
  type LifecycleState,
} from "../src/lib/lifecycle.js";

const VALID_STATES: LifecycleState[] = [
  "draft",
  "validating",
  "probation",
  "active",
  "degraded",
  "suspended",
];

async function main() {
  const args = process.argv.slice(2);
  const slugIdx = args.indexOf("--slug");
  const toIdx = args.indexOf("--to");
  const reasonIdx = args.indexOf("--reason");

  if (slugIdx === -1 || toIdx === -1) {
    console.error("Usage:");
    console.error(
      "  npx tsx scripts/lifecycle-transition.ts --slug <slug> --to <state> [--reason <text>]",
    );
    console.error(`\nValid states: ${VALID_STATES.join(", ")}`);
    process.exit(1);
  }

  const slug = args[slugIdx + 1];
  const toState = args[toIdx + 1] as LifecycleState;
  const reason = reasonIdx !== -1 ? args[reasonIdx + 1] : "manual admin transition";

  if (!VALID_STATES.includes(toState)) {
    console.error(`Invalid state '${toState}'. Valid: ${VALID_STATES.join(", ")}`);
    process.exit(1);
  }

  // Verify capability exists
  const db = getDb();
  const [cap] = await db
    .select({ slug: capabilities.slug, lifecycleState: capabilities.lifecycleState })
    .from(capabilities)
    .where(eq(capabilities.slug, slug))
    .limit(1);

  if (!cap) {
    console.error(`Capability '${slug}' not found.`);
    process.exit(1);
  }

  const fromState = cap.lifecycleState as LifecycleState;

  if (fromState === toState) {
    console.log(`${slug} is already in '${toState}' state. No change.`);
    return;
  }

  await transitionCapability(slug, toState, reason, "admin");
  console.log(`✅ ${slug}: ${fromState} → ${toState}`);
  console.log(`   Reason: ${reason}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
