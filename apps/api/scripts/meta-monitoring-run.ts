/**
 * Scheduled meta-monitoring runner (Pipeline Phase III).
 *
 * Usage:
 *   npx tsx scripts/meta-monitoring-run.ts --daily    # Checks 11-13 (pipeline health)
 *   npx tsx scripts/meta-monitoring-run.ts --weekly   # Checks 3-10 (coverage + SQS integrity)
 *   npx tsx scripts/meta-monitoring-run.ts --all      # All scheduled checks
 *
 * Post-test-run checks (1-2) are wired inline in test-runner.ts.
 *
 * Railway invocation:
 *   Daily:  npx tsx scripts/meta-monitoring-run.ts --daily
 *   Weekly: npx tsx scripts/meta-monitoring-run.ts --weekly
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

// Side-effect imports to register all executors (needed for DB pool init)
import "../src/app.js";

import {
  runDailyChecks,
  runWeeklyChecks,
  type MetaCheckResult,
} from "../src/lib/meta-monitoring.js";

// ─── Output formatting ──────────────────────────────────────────────────────

function formatResult(result: MetaCheckResult): string {
  const tag = result.passed
    ? "[PASS]   "
    : result.severity === "critical"
      ? "[CRITICAL]"
      : "[WARNING]";

  const affectedSuffix =
    result.affected && result.affected.length > 0
      ? ` — ${result.affected.slice(0, 5).join(", ")}${result.affected.length > 5 ? ` (+${result.affected.length - 5} more)` : ""}`
      : "";

  return `${tag} ${result.details}${affectedSuffix}`;
}

function printSummary(frequency: string, results: MetaCheckResult[]): void {
  const passed = results.filter((r) => r.passed).length;
  const warnings = results.filter((r) => !r.passed && r.severity === "warning").length;
  const criticals = results.filter((r) => !r.passed && r.severity === "critical").length;

  console.log(`=== SUMMARY: ${passed} PASS, ${warnings} WARNING, ${criticals} CRITICAL ===`);

  if (criticals > 0) {
    process.exitCode = 2;
  } else if (warnings > 0) {
    process.exitCode = 1;
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const daily = args.includes("--daily");
  const weekly = args.includes("--weekly");
  const all = args.includes("--all");

  if (!daily && !weekly && !all) {
    console.error("Usage: npx tsx scripts/meta-monitoring-run.ts [--daily | --weekly | --all]");
    process.exit(1);
  }

  if (daily || all) {
    console.log(`\n=== META-MONITORING RUN (daily) — ${new Date().toISOString()} ===`);
    const results = await runDailyChecks();
    for (const r of results) {
      console.log(formatResult(r));
    }
    printSummary("daily", results);
  }

  if (weekly || all) {
    console.log(`\n=== META-MONITORING RUN (weekly) — ${new Date().toISOString()} ===`);
    const results = await runWeeklyChecks();
    for (const r of results) {
      console.log(formatResult(r));
    }
    printSummary("weekly", results);
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
