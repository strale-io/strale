/**
 * Verify execution guidance for all active capabilities.
 *
 * Usage: npx tsx scripts/verify-execution-guidance.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { desc, eq } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { capabilities, testResults } from "../src/db/schema.js";
import { computeDualProfileSQS } from "../src/lib/sqs.js";
import { computeExecutionGuidance, type ComputeGuidanceInput, type ExecutionGuidance } from "../src/lib/execution-guidance.js";
import type { CapabilityType } from "../src/lib/reliability-profile.js";

interface CapRow {
  slug: string;
  capabilityType: string;
  priceCents: number;
  dataSource: string | null;
  matrixSqs: string | null;
}

async function verify() {
  const db = getDb();

  const allCaps = await db
    .select({
      slug: capabilities.slug,
      capabilityType: capabilities.capabilityType,
      priceCents: capabilities.priceCents,
      dataSource: capabilities.dataSource,
      matrixSqs: capabilities.matrixSqs,
    })
    .from(capabilities)
    .where(eq(capabilities.isActive, true))
    .orderBy(capabilities.slug) as CapRow[];

  console.log(`Computing execution guidance for ${allCaps.length} capabilities...\n`);

  const rows: {
    slug: string;
    type: string;
    sqs: number;
    qp: string;
    rp: string;
    usable: boolean;
    strategy: string;
    confidence: number;
    fallback: string | null;
    recoveryH: number | null;
  }[] = [];

  const anomalies: string[] = [];

  for (const cap of allCaps) {
    try {
      const dual = await computeDualProfileSQS(cap.slug);

      if (dual.qp.pending && dual.rp.pending) {
        rows.push({
          slug: cap.slug,
          type: cap.capabilityType,
          sqs: 0,
          qp: "?",
          rp: "?",
          usable: false,
          strategy: "pending",
          confidence: 0,
          fallback: null,
          recoveryH: null,
        });
        continue;
      }

      const capType = cap.capabilityType as CapabilityType;

      const rpAvailRate = dual.rp.factors.availability.has_data
        ? dual.rp.factors.availability.rate
        : 100;

      const hasExtFailures = dual.rp.factors.availability.has_data
        && dual.rp.factors.availability.rate < 90;

      // Get last test time
      const [lastTest] = await db
        .select({ executedAt: testResults.executedAt })
        .from(testResults)
        .where(eq(testResults.capabilitySlug, cap.slug))
        .orderBy(desc(testResults.executedAt))
        .limit(1);

      const input: ComputeGuidanceInput = {
        slug: cap.slug,
        qpGrade: dual.qp.grade === "pending" ? "F" : dual.qp.grade,
        rpGrade: dual.rp.grade === "pending" ? "F" : dual.rp.grade,
        rpScore: dual.rp.score,
        rpTrend: dual.rp.trend,
        rpAvailabilityRate: rpAvailRate,
        matrixSqs: dual.matrix.score,
        capabilityType: capType,
        testScheduleHours: 24,
        lastTestedAt: lastTest?.executedAt?.toISOString() ?? null,
        priceCents: cap.priceCents,
        dataSource: cap.dataSource,
        hasExternalFailures: hasExtFailures,
      };

      const guidance = await computeExecutionGuidance(input);

      rows.push({
        slug: cap.slug,
        type: cap.capabilityType,
        sqs: dual.matrix.score,
        qp: dual.qp.grade,
        rp: dual.rp.grade,
        usable: guidance.usable,
        strategy: guidance.strategy,
        confidence: guidance.confidence_after_strategy,
        fallback: guidance.if_strategy_fails?.fallback_capability ?? null,
        recoveryH: guidance.recovery.estimated_hours,
      });

      // Anomaly checks
      if (!guidance.usable && dual.matrix.score >= 50) {
        anomalies.push(`WARN: ${cap.slug} — usable=false but SQS=${dual.matrix.score} (QP=${dual.qp.grade}, RP=${dual.rp.grade})`);
      }
      if (guidance.usable && dual.matrix.score < 30) {
        anomalies.push(`DANGER: ${cap.slug} — usable=true but SQS=${dual.matrix.score}`);
      }
      if (guidance.strategy === "retry_with_backoff" && capType === "deterministic") {
        anomalies.push(`LOGIC: ${cap.slug} — retry_with_backoff for deterministic capability`);
      }
      if (guidance.if_strategy_fails && guidance.if_strategy_fails.fallback_sqs !== null && guidance.if_strategy_fails.fallback_sqs < 50) {
        anomalies.push(`FALLBACK: ${cap.slug} — fallback ${guidance.if_strategy_fails.fallback_capability} has SQS=${guidance.if_strategy_fails.fallback_sqs}`);
      }
      if (guidance.confidence_after_strategy > 100 || guidance.confidence_after_strategy < 0) {
        anomalies.push(`CONFIDENCE: ${cap.slug} — confidence=${guidance.confidence_after_strategy}`);
      }
    } catch (err) {
      console.error(`  ERR ${cap.slug}: ${(err as Error).message}`);
    }
  }

  // Print table
  console.log("=== EXECUTION GUIDANCE TABLE ===");
  console.log(
    "Slug".padEnd(40) +
    "Type".padEnd(15) +
    "SQS".padStart(5) +
    " QP".padStart(4) +
    " RP".padStart(4) +
    " Usable".padStart(7) +
    " Strategy".padEnd(20) +
    "Conf".padStart(5) +
    " Fallback".padEnd(25) +
    "RecH".padStart(6),
  );
  console.log("-".repeat(135));

  for (const r of rows) {
    console.log(
      r.slug.padEnd(40) +
      r.type.padEnd(15) +
      String(r.sqs).padStart(5) +
      ` ${r.qp}`.padStart(4) +
      ` ${r.rp}`.padStart(4) +
      ` ${r.usable}`.padStart(7) +
      ` ${r.strategy}`.padEnd(20) +
      String(r.confidence).padStart(5) +
      ` ${r.fallback ?? "-"}`.padEnd(25) +
      (r.recoveryH !== null ? String(r.recoveryH) : "-").padStart(6),
    );
  }

  // Anomalies
  if (anomalies.length > 0) {
    console.log(`\n=== ANOMALIES (${anomalies.length}) ===`);
    for (const a of anomalies) {
      console.log(`  ${a}`);
    }
  } else {
    console.log("\n=== NO ANOMALIES ===");
  }

  // Summary
  const usableCount = rows.filter((r) => r.usable).length;
  const strategyDist: Record<string, number> = {};
  for (const r of rows) {
    strategyDist[r.strategy] = (strategyDist[r.strategy] ?? 0) + 1;
  }
  const withFallback = rows.filter((r) => r.fallback !== null).length;
  const withRecovery = rows.filter((r) => r.recoveryH !== null).length;

  console.log("\n=== SUMMARY ===");
  console.log(`Usable: ${usableCount} / ${rows.length}`);
  console.log(`Strategy distribution: ${JSON.stringify(strategyDist)}`);
  console.log(`With fallbacks: ${withFallback}`);
  console.log(`With recovery data: ${withRecovery}`);

  process.exit(0);
}

verify().catch((e) => {
  console.error(e);
  process.exit(1);
});
