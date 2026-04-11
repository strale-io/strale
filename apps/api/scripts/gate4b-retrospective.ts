/**
 * Gate 4b Retrospective — run dry-run composition check against all active solutions.
 * Produces a report, does NOT block or modify any solutions.
 *
 * Usage: npx tsx scripts/gate4b-retrospective.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { retrospectiveSolutionDryRun } from "../src/lib/gate4b-solution-dryrun.js";
import { writeFileSync } from "node:fs";

async function main() {
  console.log("Running Gate 4b retrospective (solution dry-run)...\n");

  const result = await retrospectiveSolutionDryRun();

  const lines: string[] = [];
  lines.push("# Gate 4b Retrospective — Solution Dry-Run Composition Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Total active solutions checked | ${result.totalChecked} |`);
  lines.push(`| Passing composition check | ${result.passing} |`);
  lines.push(`| Failing composition check | ${result.failing} |`);
  lines.push(`| Skipped (no output schemas) | ${result.skipped} |`);
  lines.push("");

  if (result.results.length === 0) {
    lines.push("All solutions pass the dry-run composition check.");
  } else {
    lines.push("## Failing Solutions");
    lines.push("");

    for (const r of result.results) {
      lines.push(`### ${r.solutionSlug}`);
      lines.push("");

      const realFailures = r.compositionFailures.filter((f) => f.type !== "DRY_RUN_UNSUPPORTED");
      const warnings = r.compositionFailures.filter((f) => f.type === "DRY_RUN_UNSUPPORTED");

      if (realFailures.length > 0) {
        lines.push("**Composition failures:**");
        for (const f of realFailures) {
          lines.push(`- Step ${f.stepIndex} (${f.stepSlug}): **${f.type}** on field \`${f.field}\` — ${f.detail}`);
        }
      }

      if (warnings.length > 0) {
        lines.push("");
        lines.push("**Warnings (non-blocking):**");
        for (const w of warnings) {
          lines.push(`- ${w.detail}`);
        }
      }
      lines.push("");
    }
  }

  const report = lines.join("\n");
  const outPath = resolve(import.meta.dirname, "../../../gate4b-retrospective-report.md");
  writeFileSync(outPath, report);

  console.log(report);
  console.log(`\nReport written to: ${outPath}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Retrospective check failed:", err);
  process.exit(1);
});
