/** Read-only marginal upstream cost view. Reporting FX estimates, no paid calls.
 * Run: npx tsx scripts/margin-per-tool.ts [days, default 7]
 */
import { marginPerTool } from "../src/lib/metrics/commercial.js";
import { closeDbPool } from "../src/db/index.js";
const days = Number(process.argv[2] ?? 7);
if (!Number.isFinite(days) || days <= 0 || days > 366) throw new Error("days must be between 0 and 366");
const to = new Date();
try {
  console.log(JSON.stringify({ currency: "EUR", fx_basis: "reporting estimate", window_days: days,
    tools: await marginPerTool({ from: new Date(to.getTime() - days * 86_400_000), to, label: `last ${days} days` }) }, null, 2));
} finally { await closeDbPool(); }
