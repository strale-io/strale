/**
 * One-time fix: 4 capabilities have is_active=false but lifecycle_state='active'.
 * They were deactivated via direct DB update, bypassing transitionCapability().
 * This script aligns them.
 *
 * Usage: cd apps/api && npx tsx src/jobs/fix-lifecycle-anomalies.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env") });

import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities } from "../db/schema.js";
import { transitionCapability } from "../lib/lifecycle.js";
import { log, logError } from "../lib/log.js";

const ANOMALOUS = [
  "amazon-price",
  "hong-kong-company-data",
  "indian-company-data",
  // singapore-company-data retired 2026-04-21 (DEC-20260421-I). State is
  // now intentional per retirement, not an ongoing anomaly.
];

async function main() {
  const db = getDb();

  for (const slug of ANOMALOUS) {
    const [cap] = await db
      .select({ isActive: capabilities.isActive, lifecycleState: capabilities.lifecycleState, visible: capabilities.visible })
      .from(capabilities)
      .where(eq(capabilities.slug, slug))
      .limit(1);

    if (!cap) {
      log.info({ label: "fix-lifecycle-skip", capability_slug: slug, reason: "not-found" }, "fix-lifecycle-skip");
      continue;
    }

    log.info(
      {
        label: "fix-lifecycle-fixing",
        capability_slug: slug,
        is_active: cap.isActive,
        visible: cap.visible,
        lifecycle_state: cap.lifecycleState,
      },
      "fix-lifecycle-fixing",
    );

    // Transition to deactivated via lifecycle system
    await transitionCapability(slug, "deactivated", "Manual cleanup — lifecycle state alignment", "admin");

    // Ensure is_active=false and set deactivation reason
    await db.update(capabilities).set({
      isActive: false,
      deactivationReason: "Manual deactivation — lifecycle state cleanup (2026-04-01)",
      updatedAt: new Date(),
    }).where(eq(capabilities.slug, slug));

    log.info({ label: "fix-lifecycle-done", capability_slug: slug }, "fix-lifecycle-done");
  }

  log.info({ label: "fix-lifecycle-all-done" }, "fix-lifecycle-all-done");
  process.exit(0);
}

main().catch((err) => {
  logError("fix-lifecycle-fatal", err);
  process.exit(1);
});
