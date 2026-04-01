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

const ANOMALOUS = [
  "amazon-price",
  "hong-kong-company-data",
  "indian-company-data",
  "singapore-company-data",
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
      console.log(`[skip] ${slug} — not found`);
      continue;
    }

    console.log(`[fix] ${slug}: active=${cap.isActive} visible=${cap.visible} state=${cap.lifecycleState}`);

    // Transition to deactivated via lifecycle system
    await transitionCapability(slug, "deactivated", "Manual cleanup — lifecycle state alignment", "admin");

    // Ensure is_active=false and set deactivation reason
    await db.update(capabilities).set({
      isActive: false,
      deactivationReason: "Manual deactivation — lifecycle state cleanup (2026-04-01)",
      updatedAt: new Date(),
    }).where(eq(capabilities.slug, slug));

    console.log(`[done] ${slug} → deactivated, is_active=false, visible=false`);
  }

  console.log("\nAll anomalies fixed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
