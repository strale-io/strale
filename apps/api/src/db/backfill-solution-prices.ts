import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { recomputeAllSolutionPrices, getMarkup } from "../lib/solution-pricing.js";

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║         DYNAMIC SOLUTION PRICING BACKFILL                   ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Markup multipliers:");
  console.log(`  data-lookup:  ${getMarkup("data-lookup")}x`);
  console.log(`  verification: ${getMarkup("verification")}x`);
  console.log(`  compliance:   ${getMarkup("compliance")}x`);

  const updates = await recomputeAllSolutionPrices();

  const changed = updates.filter((u) => u.changed);
  const unchanged = updates.filter((u) => !u.changed);

  console.log(`\n── Changed (${changed.length}) ──`);
  for (const u of changed.sort((a, b) => a.slug.localeCompare(b.slug))) {
    const dir = u.newPrice > u.oldPrice ? "↑" : "↓";
    const diff = u.newPrice - u.oldPrice;
    console.log(
      `  ${u.slug.padEnd(35)} €${(u.oldPrice / 100).toFixed(2)} → €${(u.newPrice / 100).toFixed(2)} (${dir}${Math.abs(diff)}¢) | sum=${u.componentSum}¢ × ${u.markup}x [${u.valueTier}]`,
    );
  }

  console.log(`\n── Unchanged (${unchanged.length}) ──`);
  for (const u of unchanged.sort((a, b) => a.slug.localeCompare(b.slug))) {
    console.log(
      `  ${u.slug.padEnd(35)} €${(u.oldPrice / 100).toFixed(2)} | sum=${u.componentSum}¢ × ${u.markup}x [${u.valueTier}]`,
    );
  }

  console.log(`\n── Summary ──`);
  console.log(`  Total solutions:  ${updates.length}`);
  console.log(`  Changed:          ${changed.length}`);
  console.log(`  Unchanged:        ${unchanged.length}`);

  const priceIncreases = changed.filter((u) => u.newPrice > u.oldPrice);
  const priceDecreases = changed.filter((u) => u.newPrice < u.oldPrice);
  console.log(`  Price increases:  ${priceIncreases.length}`);
  console.log(`  Price decreases:  ${priceDecreases.length}`);

  if (priceDecreases.length > 0) {
    const totalDecrease = priceDecreases.reduce((s, u) => s + (u.oldPrice - u.newPrice), 0);
    console.log(`  Avg decrease:     ${Math.round(totalDecrease / priceDecreases.length)}¢`);
  }
  if (priceIncreases.length > 0) {
    const totalIncrease = priceIncreases.reduce((s, u) => s + (u.newPrice - u.oldPrice), 0);
    console.log(`  Avg increase:     ${Math.round(totalIncrease / priceIncreases.length)}¢`);
  }

  console.log("\n✓ Backfill complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
