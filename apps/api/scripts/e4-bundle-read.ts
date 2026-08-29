/**
 * E4's reading: did the four growth bundles fail, or did bundle demand fall
 * away generally? Read-only.
 *
 * `cd apps/api && npx tsx scripts/e4-bundle-read.ts`
 *
 * Prints every bundle that took an external order in the window as well as the
 * cohort and its control, because "no bundle sold" is a claim about all of
 * them and cannot be checked against a list of five.
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// Loaded before the metrics module, which opens a database connection on import.
config({ path: resolve(HERE, "../../..", ".env") });

const { sql } = await import("drizzle-orm");
const { getDb } = await import("../src/db/index.js");
const { bundleSales, cohortVerdict, E4_COHORT, E4_CONTROL, E4_TRIAL_FROM } = await import("../src/lib/metrics/bundles.js");
const { externalCustomers } = await import("../src/lib/metrics/populations.js");
const { renderMeasurement } = await import("../src/lib/metrics/types.js");

const TRIAL_FROM = E4_TRIAL_FROM; // the day the four became payable (GOALS.md, E4)
const eur = (c: number) => `€${(c / 100).toFixed(2)}`;

async function main() {
  // Every bundle slug with any external order in the last 6 weeks, so the
  // cohort is read against the whole bundle line rather than one control.
  const active = (await getDb().execute(sql`
    SELECT DISTINCT t.solution_slug AS slug
    FROM transactions t
    WHERE t.status = 'completed' AND t.solution_slug IS NOT NULL
      AND t.created_at >= now() - interval '42 days'
      AND ${externalCustomers("t")}`)) as unknown as Array<{ slug: string }>;

  const slugs = [...new Set([...E4_COHORT, E4_CONTROL, ...active.map((a) => a.slug)])];
  const m = await bundleSales(slugs, { trialFrom: TRIAL_FROM });

  console.log(`\n═══ E4 — bundle sales, external customers only ═══`);
  console.log(renderMeasurement(m, () => `${slugs.length} bundle(s)`).note || "");

  if (m.status === "unavailable") {
    console.log(`unavailable: ${JSON.stringify(m.reason)}`);
    process.exit(0);
  }

  const weeks = m.value[0]!.weeks.map((w) => w.startsOn);
  const head = weeks.map((w) => w.slice(5)).join("   ");
  console.log(`\n  slug                          ${head}    total   last sale`);
  for (const b of [...m.value].sort((x, y) => y.totalOrders - x.totalOrders)) {
    if (b.totalOrders === 0 && !E4_COHORT.includes(b.slug as never) && b.slug !== E4_CONTROL) continue;
    const cells = b.weeks.map((w) => String(w.orders).padStart(5)).join("   ");
    const mark = E4_COHORT.includes(b.slug as never) ? "*" : b.slug === E4_CONTROL ? "^" : " ";
    console.log(
      `${mark} ${b.slug.padEnd(28)}${cells}   ${String(b.totalOrders).padStart(5)}` +
        `  ${String(b.ordersSince).padStart(11)}   ${b.lastSaleAt?.slice(0, 16) ?? "never"}`,
    );
  }
  console.log(`  (* = E4 cohort, ^ = E4 control; last column of weeks is the week in progress)`);

  const v = cohortVerdict({ cohort: E4_COHORT, controlSlug: E4_CONTROL, sales: m.value, trialFrom: TRIAL_FROM });
  console.log(`\n─── VERDICT: ${v.kind} ───`);
  console.log(`  ${v.why}`);

  // The wider check the verdict does not make: did ANY bundle sell in the
  // trial window? A control-of-one can go quiet for its own reasons.
  const othersInTrial = m.value
    .filter((b) => !E4_COHORT.includes(b.slug as never) && b.ordersSince > 0)
    .map((b) => ({ slug: b.slug, orders: b.ordersSince }))
    .sort((a, b) => b.orders - a.orders);
  console.log(
    `\n  Bundles other than the cohort that sold since ${TRIAL_FROM}: ` +
      (othersInTrial.length
        ? othersInTrial.map((x) => `${x.slug} (${x.orders})`).join(", ")
        : "none — the whole bundle line is quiet"),
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
