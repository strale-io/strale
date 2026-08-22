/**
 * The commercial pack — step A of the daily run.
 *
 * Prints the twelve commercial questions DAILY-RUN.md requires, each with its
 * reading. The point is the readings: a session that prints only the numbers
 * will write a brief that reports "€56.89, a record" and miss that the same
 * week deepened a single-customer dependency.
 *
 * Reads production read-only. Computes nothing itself — every figure comes from
 * src/lib/metrics, which owns the window, the population and the instrument
 * guard for each one.
 *
 * Run:  cd apps/api && npx tsx scripts/commercial-brief.ts [--json]
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
// Before the metrics module, which opens a database connection on import.
config({ path: resolve(REPO, ".env") });

const {
  discreteWeeks, growth, payerFacts, concentration, quietPayers, activatingSlugs, interpret,
  startOfIsoWeek,
} = await import("../src/lib/metrics/commercial.js");
const { windowOf } = await import("../src/lib/metrics/metrics.js");
const { closeDbPool } = await import("../src/db/index.js");

const eur = (c: number) => `€${(c / 100).toFixed(2)}`;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

async function main() {
  const now = new Date();
  const asJson = process.argv.includes("--json");

  const weeksM = await discreteWeeks(6, now);
  const weeks = weeksM.status === "unavailable" ? [] : weeksM.value;
  const g = growth(weeks);

  // The window for payer questions is the current ISO week, so concentration
  // and revenue describe the same period. Comparing a rolling 7 days against a
  // discrete week is the failure this whole module exists to avoid.
  const thisWeek = { from: startOfIsoWeek(now), to: now, label: "this week so far" };
  const priorWeekStart = new Date(startOfIsoWeek(now).getTime() - 7 * 86_400_000);
  const priorWeek = { from: priorWeekStart, to: startOfIsoWeek(now), label: "last week" };

  const factsM = await payerFacts(thisWeek);
  const facts = factsM.status === "unavailable" ? [] : factsM.value.payers;
  const unattributed = factsM.status === "unavailable" ? 0 : factsM.value.unattributedCents;
  const conc = facts.length > 0 ? await concentration(thisWeek, facts, unattributed) : null;

  const priorFactsM = await payerFacts(priorWeek);
  const priorConc = priorFactsM.status === "unavailable" || priorFactsM.value.payers.length === 0
    ? null
    : await concentration(priorWeek, priorFactsM.value.payers, priorFactsM.value.unattributedCents);

  const quietM = await quietPayers(thisWeek);
  const quiet = quietM.status === "unavailable" ? null : quietM.value;

  const slugs = conc ? activatingSlugs(facts, conc.newPayerKeys) : [];
  const conclusions = interpret({
    weeks, growth: g, concentration: conc, quiet, activatingSlugs: slugs,
    // Only when BOTH windows are comparable. The prior week straddles the day
    // payer identity switched on, so its share is a share of two days' worth of
    // visibility; presenting the move would invent a trend out of coverage.
    priorTopShare: conc?.comparable && priorConc?.comparable ? priorConc.topShare : null,
  });

  if (asJson) {
    console.log(JSON.stringify({
      weeks, growth: g,
      concentration: conc ? { ...conc, newPayerKeys: [...conc.newPayerKeys] } : null,
      quiet, activatingSlugs: slugs, conclusions,
    }, null, 2));
    return;
  }

  console.log("\n═══ COMMERCIAL PACK ═══\n");

  console.log("Discrete weeks (newest first)");
  if (weeks.length === 0) {
    console.log(`  unavailable — ${weeksM.status === "unavailable" ? weeksM.reason.kind : "no data"}`);
  } else {
    for (const w of weeks) {
      const tag = w.partial ? `  [in progress, day ${w.daysElapsed} of 7 — NOT comparable]` : "";
      console.log(`  ${w.startsOn}  ${eur(w.cents).padStart(9)}  ${String(w.calls).padStart(5)} calls${tag}`);
    }
  }
  console.log(`\nGrowth: ${g.kind}${g.kind === "not_comparable" ? ` — ${g.why}` : ""}`);

  console.log("\nPayers, this week so far");
  if (!conc) {
    console.log("  unavailable — no attributable payer in the window");
  } else {
    console.log(`  distinct payers            ${conc.payers}`);
    console.log(`  largest payer share        ${pct(conc.topShare)}  (${eur(conc.topCents)} vs ${eur(conc.othersCents)} from all others)`);
    console.log(`  unattributed revenue       ${eur(conc.unattributedCents)}`);
    console.log(`  new payers                 ${conc.newPayers ?? "cannot tell yet — a buyer active before the identity instrument carries no identity, so it would read as new"}`);
    console.log(`  returning payers           ${conc.returningPayers ?? "cannot tell yet — identity instrument is younger than the lookback"}`);
    console.log(`  bought on >1 day           ${conc.repeatPayers}`);
    console.log(`  days anyone paid us        ${conc.activePayingDays}`);
    console.log(`  revenue traced to a payer  ${pct(conc.attributedShare)}${conc.comparable ? "" : "  (window not comparable — see below)"}`);
    if (priorConc) {
      console.log(`  last week's top share      ${pct(priorConc.topShare)} across ${priorConc.payers} payers` +
        (priorConc.comparable ? "" : `  ← NOT COMPARABLE: only ${pct(priorConc.attributedShare)} of that week was traceable`));
    }
  }

  console.log("\nFirst purchase of a new payer");
  if (conc && conc.newPayers === null) {
    // The keys are still populated, but "new" is not answerable yet, so
    // presenting these as activations would launder an unmeasurable claim
    // through a list that looks like evidence.
    console.log("  unavailable — cannot yet tell a first purchase from a returning buyer");
    console.log(`  (first purchase of each payer, for reference only: ${
      slugs.map((s) => s.slug).join(", ") || "none"})`);
  } else {
    console.log(slugs.length === 0
      ? "  none — no new payer this week"
      : slugs.map((s) => `  ${s.slug}  ${s.payers} payer(s)`).join("\n"));
  }

  console.log("\nPreviously paying, now quiet");
  if (quiet === null) {
    console.log(`  unavailable — ${quietM.status === "unavailable" ? quietM.reason.kind : ""}`);
  } else if (quiet.length === 0) {
    console.log("  none");
  } else {
    for (const q of quiet) console.log(`  ${eur(q.cents).padStart(9)}  last bought ${q.daysQuiet}d ago`);
  }

  console.log("\n─── THE READING (this is what the brief carries) ───\n");
  for (const c of conclusions) {
    console.log(`  ${c.headline ? "★" : "·"} ${c.text}`);
  }
  console.log("");
}

try {
  await main();
} finally {
  await closeDbPool();
}
