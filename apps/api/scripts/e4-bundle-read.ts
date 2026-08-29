/**
 * E4's reading: did the four growth bundles fail, or did bundle demand fall
 * away generally? Read-only.
 *
 * `cd apps/api && npx tsx scripts/e4-bundle-read.ts`
 *
 * Computes nothing itself. Every figure comes from `src/lib/metrics/bundles`,
 * which owns the window, the population and the trial boundary — and this
 * script holds no database handle of its own, which is what
 * `scripts/guard-production-write-access.mjs` requires of an operator script.
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// Loaded before the metrics module, which opens a connection on import.
config({ path: resolve(HERE, "../../..", ".env") });

const { bundleSales, cohortVerdict, activeBundleSlugs, E4_COHORT, E4_CONTROL, E4_TRIAL_FROM } =
  await import("../src/lib/metrics/bundles.js");
const { renderMeasurement } = await import("../src/lib/metrics/types.js");

const eur = (c: number) => `€${(c / 100).toFixed(2)}`;

async function main() {
  // The cohort is read against every bundle that sold recently, not against
  // one control: "no bundle sold" is a claim about all of them.
  const slugs = [...new Set([...E4_COHORT, E4_CONTROL, ...(await activeBundleSlugs())])];
  const m = await bundleSales(slugs, { trialFrom: E4_TRIAL_FROM });

  console.log(`\n═══ E4 — bundle sales, external customers only ═══`);
  const note = renderMeasurement(m, () => `${slugs.length} bundle(s)`).note;
  if (note) console.log(note);

  if (m.status === "unavailable") {
    console.log(`unavailable: ${JSON.stringify(m.reason)}`);
    process.exit(0);
  }

  const head = m.value[0]!.weeks.map((w) => w.startsOn.slice(5)).join("   ");
  console.log(`\n  slug                          ${head}    total  since ${E4_TRIAL_FROM}   last sale`);
  for (const b of [...m.value].sort((x, y) => y.totalOrders - x.totalOrders)) {
    const isCohort = (E4_COHORT as readonly string[]).includes(b.slug);
    if (b.totalOrders === 0 && !isCohort && b.slug !== E4_CONTROL) continue;
    const cells = b.weeks.map((w) => String(w.orders).padStart(5)).join("   ");
    const mark = isCohort ? "*" : b.slug === E4_CONTROL ? "^" : " ";
    console.log(
      `${mark} ${b.slug.padEnd(28)}${cells}   ${String(b.totalOrders).padStart(5)}` +
        `  ${String(b.ordersSince).padStart(11)}   ${b.lastSaleAt?.slice(0, 16) ?? "never"}` +
        `   ${eur(b.totalCents)}`,
    );
  }
  console.log(`  (* = E4 cohort, ^ = E4 control; leftmost week column is the week in progress)`);

  const v = cohortVerdict({
    cohort: E4_COHORT, controlSlug: E4_CONTROL, sales: m.value, trialFrom: E4_TRIAL_FROM,
  });
  console.log(`\n─── VERDICT: ${v.kind} ───`);
  console.log(`  ${v.why}`);

  // The wider check the verdict does not make: a control of one can go quiet
  // for its own reasons, so name every other bundle that sold in the window.
  const others = m.value
    .filter((b) => !(E4_COHORT as readonly string[]).includes(b.slug) && b.ordersSince > 0)
    .map((b) => `${b.slug} (${b.ordersSince})`)
    .sort();
  console.log(
    `\n  Bundles other than the cohort that sold since ${E4_TRIAL_FROM}: ` +
      (others.length ? others.join(", ") : "none — the whole bundle line is quiet"),
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
