/**
 * Capability Onboarding Audit CLI
 *
 * Uses the readiness checker as single source of truth.
 *
 * Flags:
 *   --json         Output only JSON (for piping into other tools)
 *   --issues-only  Only show capabilities with issues
 *   --slug=xxx     Audit a single capability
 *
 * Run: cd apps/api && npx tsx src/db/audit-onboarding.ts [flags]
 */

import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { autoRegisterCapabilities } from "../capabilities/auto-register.js";
import {
  checkReadiness,
  checkAllReadiness,
  clearReadinessCache,
  type ReadinessCheck,
} from "../lib/capability-readiness.js";
import { writeFileSync } from "node:fs";

// ─── CLI flags ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const jsonOnly = args.includes("--json");
const issuesOnly = args.includes("--issues-only");
const slugFlag = args.find((a) => a.startsWith("--slug="))?.split("=")[1];

// ─── Issue categorization (maps readiness issues to audit categories) ─────────

type IssueCategory =
  | "MISSING_IMPORT"
  | "MISSING_EXECUTOR"
  | "MISSING_TESTS"
  | "MISSING_LATENCY"
  | "MISSING_TRANSPARENCY"
  | "SCHEMA_ISSUES"
  | "DEACTIVATED";

function categorizeIssues(check: ReadinessCheck): IssueCategory[] {
  const cats: IssueCategory[] = [];
  if (check.deactivated) cats.push("DEACTIVATED");
  if (check.issues.some((i) => i.includes("No executor"))) cats.push("MISSING_EXECUTOR");
  if (check.issues.some((i) => i.includes("Deactivated"))) {
    if (!cats.includes("DEACTIVATED")) cats.push("DEACTIVATED");
  }
  if (!check.dimensions.has_test_suites) cats.push("MISSING_TESTS");
  if (check.dimensions.has_db_row && !check.dimensions.has_latency_estimate) cats.push("MISSING_LATENCY");
  if (check.dimensions.has_db_row && !check.dimensions.has_transparency_tag) cats.push("MISSING_TRANSPARENCY");
  if (check.dimensions.has_db_row && (!check.dimensions.has_input_schema || !check.dimensions.has_output_schema)) cats.push("SCHEMA_ISSUES");
  // MISSING_IMPORT: deactivated capabilities (have executor file but won't be imported)
  if (check.deactivated && !check.dimensions.has_executor) {
    if (!cats.includes("MISSING_IMPORT")) cats.push("MISSING_IMPORT");
  }
  return cats;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Register executors so readiness checker can find them
  await autoRegisterCapabilities();
  clearReadinessCache();

  // Single slug mode
  if (slugFlag) {
    const check = await checkReadiness(slugFlag);
    if (jsonOnly) {
      console.log(JSON.stringify(check, null, 2));
    } else {
      console.log(`\n=== READINESS: ${slugFlag} ===`);
      console.log(`Ready: ${check.ready ? "YES" : "NO"}`);
      console.log(`Deactivated: ${check.deactivated}`);
      console.log(`Dimensions:`);
      for (const [k, v] of Object.entries(check.dimensions)) {
        console.log(`  ${k}: ${v}`);
      }
      if (check.issues.length > 0) {
        console.log(`Issues:`);
        for (const issue of check.issues) {
          console.log(`  - ${issue}`);
        }
      }
    }
    process.exit(0);
  }

  // Full audit
  const all = await checkAllReadiness();
  const checks = [...all.values()];

  const ready = checks.filter((c) => c.ready);
  const withIssues = checks.filter((c) => !c.ready);
  const deactivated = checks.filter((c) => c.deactivated);
  const critical = checks.filter(
    (c) =>
      !c.ready &&
      !c.deactivated &&
      (!c.dimensions.has_executor || (c.dimensions.has_db_row && !c.dimensions.has_executor)),
  );

  // Group by issue category
  const groups: Record<IssueCategory, ReadinessCheck[]> = {
    DEACTIVATED: [],
    MISSING_EXECUTOR: [],
    MISSING_IMPORT: [],
    MISSING_TESTS: [],
    MISSING_LATENCY: [],
    MISSING_TRANSPARENCY: [],
    SCHEMA_ISSUES: [],
  };
  for (const check of withIssues) {
    for (const cat of categorizeIssues(check)) {
      groups[cat].push(check);
    }
  }

  // Count active/inactive from dimensions
  const activeCount = checks.filter((c) => c.dimensions.has_db_row && c.dimensions.is_active).length;
  const inactiveCount = checks.filter((c) => c.dimensions.has_db_row && !c.dimensions.is_active).length;

  // ─── JSON output ──────────────────────────────────────────────────────

  const jsonOutput = {
    date: new Date().toISOString(),
    totalSlugs: checks.length,
    sources: {
      dbRowsActive: activeCount,
      dbRowsInactive: inactiveCount,
    },
    fullyOnboarded: ready.length,
    issueCounts: Object.fromEntries(
      Object.entries(groups).map(([k, v]) => [k, v.length]),
    ),
    critical: critical.map((c) => ({ slug: c.slug, issues: c.issues })),
    audits: (issuesOnly ? withIssues : checks).map((c) => ({
      slug: c.slug,
      ready: c.ready,
      deactivated: c.deactivated,
      dimensions: c.dimensions,
      issues: c.issues,
    })),
  };

  const jsonPath = resolve(import.meta.dirname, "audit-results.json");
  writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));

  if (jsonOnly) {
    console.log(JSON.stringify(jsonOutput, null, 2));
    process.exit(0);
  }

  // ─── Human-readable output ────────────────────────────────────────────

  console.log(`\n=== CAPABILITY ONBOARDING AUDIT ===`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Total unique slugs found: ${checks.length}`);
  console.log();
  console.log(`SOURCES:`);
  console.log(`  Database rows (active):     ${activeCount}`);
  console.log(`  Database rows (inactive):   ${inactiveCount}`);
  console.log();
  console.log(
    `FULLY ONBOARDED:              ${ready.length} / ${checks.length}`,
  );

  const sectionOrder: { cat: IssueCategory; label: string }[] = [
    { cat: "DEACTIVATED", label: "intentionally deactivated" },
    { cat: "MISSING_EXECUTOR", label: "DB row exists, no executor" },
    { cat: "MISSING_TESTS", label: "no test suites" },
    { cat: "MISSING_LATENCY", label: "avg_latency_ms is null" },
    { cat: "MISSING_TRANSPARENCY", label: "transparency_tag is null" },
    { cat: "SCHEMA_ISSUES", label: "empty input or output schema" },
  ];

  const hasAnyIssues = Object.values(groups).some((g) => g.length > 0);

  if (hasAnyIssues) {
    console.log(`\nISSUES FOUND:\n`);
    for (const section of sectionOrder) {
      const group = groups[section.cat];
      if (group.length === 0) continue;
      console.log(`[${section.cat}] (${section.label}):`);
      for (const c of group.sort((a, b) => a.slug.localeCompare(b.slug))) {
        console.log(`  - ${c.slug}`);
      }
      console.log();
    }
  } else {
    console.log(`\nNo issues found — all capabilities fully onboarded!\n`);
  }

  console.log(`SUMMARY:`);
  console.log(`  Fully onboarded: ${ready.length}`);
  console.log(`  Has issues:      ${withIssues.length}`);
  console.log(`  Deactivated:     ${deactivated.length}`);
  console.log(`  Critical (will fail at runtime): ${critical.length}`);
  if (critical.length > 0) {
    for (const c of critical.sort((a, b) => a.slug.localeCompare(b.slug))) {
      console.log(`    - ${c.slug} [${c.issues.join(", ")}]`);
    }
  }

  console.log(`\nJSON results written to: ${jsonPath}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
