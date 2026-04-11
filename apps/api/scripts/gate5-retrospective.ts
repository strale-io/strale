/**
 * Gate 5 Retrospective — run path coverage check against all active capabilities.
 * Produces a report, does NOT block or modify any capabilities.
 *
 * Usage: npx tsx scripts/gate5-retrospective.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { retrospectiveCheck } from "../src/lib/gate5-path-coverage.js";
import { writeFileSync } from "node:fs";

async function main() {
  console.log("Running Gate 5 retrospective check...\n");

  const result = await retrospectiveCheck();

  const lines: string[] = [];
  lines.push("# Gate 5 Retrospective — Path Coverage Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total active capabilities checked | ${result.totalChecked} |`);
  lines.push(`| Multi-path capabilities | ${result.multiPath} |`);
  lines.push(`| Passing Gate 5 | ${result.passing} |`);
  lines.push(`| Failing Gate 5 | ${result.failing} |`);
  lines.push("");

  if (result.results.length === 0) {
    lines.push("All multi-path capabilities pass Gate 5.");
  } else {
    lines.push("## Failing Capabilities");
    lines.push("");

    for (const r of result.results) {
      lines.push(`### ${r.slug}`);
      lines.push("");
      lines.push("| Entry Point | Type | Covered | Fixtures |");
      lines.push("|-------------|------|---------|----------|");
      for (const c of r.coverageMap) {
        const icon = c.covered ? "YES" : "**NO**";
        lines.push(`| ${c.entryPoint.field} | ${c.entryPoint.pathType} | ${icon} | ${c.fixtureCount} |`);
      }
      lines.push("");
      for (const issue of r.issues) {
        lines.push(`- ${issue}`);
      }
      lines.push("");
    }
  }

  const report = lines.join("\n");
  const outPath = resolve(import.meta.dirname, "../../../gate5-retrospective-report.md");
  writeFileSync(outPath, report);

  console.log(report);
  console.log(`\nReport written to: ${outPath}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Retrospective check failed:", err);
  process.exit(1);
});
