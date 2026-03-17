/**
 * Batch Publish — Dark Launch Tooling
 *
 * Publishes qualified capabilities (lifecycle_state='active', SQS ≥ 60)
 * by setting visible = true.
 *
 * Usage:
 *   npx tsx scripts/batch-publish.ts --slugs slug1,slug2,slug3
 *   npx tsx scripts/batch-publish.ts --all-qualified
 *   npx tsx scripts/batch-publish.ts --all-qualified --dry-run
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import "../src/app.js";

import { eq, and } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { capabilities } from "../src/db/schema.js";
import { computeDualProfileSQS } from "../src/lib/sqs.js";
import { logHealthEvent } from "../src/lib/health-monitor.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const PUBLISH_SQS_THRESHOLD = 60;

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const allQualified = args.includes("--all-qualified");
  const dryRun = args.includes("--dry-run");
  const slugsIdx = args.indexOf("--slugs");
  const slugsArg = slugsIdx !== -1 ? args[slugsIdx + 1] : null;

  if (!allQualified && !slugsArg) {
    console.error("Usage:");
    console.error("  npx tsx scripts/batch-publish.ts --slugs slug1,slug2,slug3");
    console.error("  npx tsx scripts/batch-publish.ts --all-qualified [--dry-run]");
    process.exit(1);
  }

  if (dryRun) {
    console.log("DRY RUN — no changes will be made\n");
  }

  const db = getDb();

  // Resolve candidate slugs
  let candidates: string[];

  if (allQualified) {
    const rows = await db
      .select({ slug: capabilities.slug })
      .from(capabilities)
      .where(
        and(
          eq(capabilities.isActive, true),
          eq(capabilities.lifecycleState, "active"),
          eq(capabilities.visible, false),
        ),
      );
    candidates = rows.map((r) => r.slug);
  } else {
    candidates = slugsArg!.split(",").map((s) => s.trim()).filter(Boolean);
  }

  if (candidates.length === 0) {
    console.log("No candidates found.");
    return;
  }

  console.log(`Checking ${candidates.length} candidate(s)...\n`);

  const published: Array<{ slug: string; sqs: number }> = [];
  const skipped: Array<{ slug: string; reason: string }> = [];

  for (const slug of candidates) {
    // Verify capability exists and is in 'active' state
    const [cap] = await db
      .select({
        slug: capabilities.slug,
        name: capabilities.name,
        lifecycleState: capabilities.lifecycleState,
        visible: capabilities.visible,
        isActive: capabilities.isActive,
      })
      .from(capabilities)
      .where(eq(capabilities.slug, slug))
      .limit(1);

    if (!cap) {
      skipped.push({ slug, reason: "not found" });
      continue;
    }

    if (!cap.isActive) {
      skipped.push({ slug, reason: "capability is inactive" });
      continue;
    }

    if (cap.lifecycleState !== "active") {
      skipped.push({
        slug,
        reason: `lifecycle_state is '${cap.lifecycleState}' (must be 'active')`,
      });
      continue;
    }

    if (cap.visible) {
      skipped.push({ slug, reason: "already visible" });
      continue;
    }

    // Check SQS
    const dual = await computeDualProfileSQS(slug);

    if (dual.matrix.pending) {
      skipped.push({ slug, reason: `SQS pending — not enough test runs yet` });
      continue;
    }

    if (dual.score < PUBLISH_SQS_THRESHOLD) {
      skipped.push({
        slug,
        reason: `SQS ${dual.score.toFixed(1)} below publication threshold of ${PUBLISH_SQS_THRESHOLD}`,
      });
      continue;
    }

    // Publish
    if (!dryRun) {
      await db
        .update(capabilities)
        .set({ visible: true, updatedAt: new Date() })
        .where(eq(capabilities.slug, slug));

      await logHealthEvent({
        eventType: "lifecycle_transition",
        capabilitySlug: slug,
        tier: 2,
        actionTaken: `Published: now visible in catalog (SQS ${dual.score.toFixed(1)})`,
        details: {
          action: "publish",
          sqs_score: dual.score,
          triggered_by: "admin",
        },
        humanOverride: true,
      });
    }

    published.push({ slug, sqs: Math.round(dual.score) });
  }

  // ── Print summary ──────────────────────────────────────────────────────────

  console.log("═".repeat(60));
  console.log(`BATCH PUBLISH SUMMARY${dryRun ? " (DRY RUN)" : ""}`);
  console.log("═".repeat(60));

  if (published.length > 0) {
    console.log(`\n✅ Published (${published.length}):`);
    for (const { slug, sqs } of published) {
      console.log(`   ${slug} — SQS ${sqs}`);
    }
  }

  if (skipped.length > 0) {
    console.log(`\n⏭  Skipped (${skipped.length}):`);
    for (const { slug, reason } of skipped) {
      console.log(`   ${slug} — ${reason}`);
    }
  }

  console.log(`\n${"═".repeat(60)}`);

  if (published.length > 0 && !dryRun) {
    console.log(`\n${published.length} capability(ies) are now visible in the catalog.`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
