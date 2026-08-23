/**
 * F1 step 2 — measure the full population the failure taxonomy has judged.
 *
 * LESSONS.md family F1 ("false quality attribution") is an open root-cause
 * investigation. Its step 2 asks for the FULL affected population rather than
 * the incidents that happened to be noticed, because the noticed ones are a
 * biased sample by construction: an instrument is only caught misattributing
 * when the misattribution costs something visible.
 *
 * This is that measurement, made repeatable so a later session can re-run it
 * against the repaired taxonomy and see the numbers move (step 6's replay).
 * It is READ-ONLY and takes no arguments.
 *
 * What it answers:
 *
 *   1. Every distinct error string a failed transaction has carried inside the
 *      90-day retention window, classified by `classifyTransactionFailure`.
 *   2. Of the strings that land in `internal` — the class whose own comment
 *      reads "everything else -- OUR bug until proven otherwise", and the only
 *      class the quality floor counts against a capability -- how many carry
 *      positive evidence that they are NOT a statement about our code.
 *
 * The rules below are deliberately conservative. Each names evidence in the
 * string itself; anything no rule claims stays in `possibly ours`. So the
 * headline percentage is a LOWER bound on misattribution, not an estimate.
 *
 * Run: cd apps/api && npx tsx scripts/f1-failure-attribution.ts [--all|--paid]
 *   --paid (default) also prints the external paid population separately,
 *   because that is the only traffic the quality floor acts on. Measuring
 *   both is the point: a finding that holds on one population and not the
 *   other is a finding about the population.
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(HERE, "../../..", ".env") });

const { openOperatorDrizzle } = await import("../src/lib/operator-db.js");
const { sql } = await import("drizzle-orm");
const { classifyTransactionFailure } = await import(
  "../src/lib/transaction-failure-taxonomy.js"
);
const { externalCustomers } = await import("../src/lib/metrics/populations.js");

/**
 * Each rule names evidence that the string is not about our capability logic.
 * Order does not matter -- a string is claimed by the first that matches and
 * the categories are reported, not summed into a verdict.
 */
const NOT_A_DEFECT: Array<[string, RegExp]> = [
  [
    "our own guard refusing, by design",
    /ALLOW_MATRIX governs this|refusing to follow further|IP lookup failed: reserved range|is not available via free APIs|contains no searchable words|not covered by the .* data source|Name lookup is not supported/i,
  ],
  [
    "bare runtime transport error (names the transport, not the code)",
    /^fetch failed$|^Service temporarily unreachable$|^WHOIS query failed:\s*$/i,
  ],
  [
    "caller input: a required field was absent or malformed",
    /\b(is|are) required\b|must (start with|contain|have|be one of)|Invalid \w+ format|Provide (a |either |\d)|Expected \d|Pass '/i,
  ],
  [
    "caller input: an identifier or code we do not cover",
    /Unsupported (country code|reference type)|not yet supported|Could not resolve country|not supported by|is not a valid \w+ ?\w*(nummer|number)|No trade data available for country code/i,
  ],
  [
    "named third-party service returned an error",
    /(Frankfurter|Yahoo Finance|Docker Hub|DeFi Llama|ECB|CBS OpenData|GoPlus|PageSpeed Insights|Zefix|VIES|Nager\.Date|Browserless|ReceitaWS)\b.*\b(API |returned |error)/i,
  ],
];

const UNCLAIMED = "possibly ours -- no rule claims it";

async function report(label: string, rows: Array<{ err: string; n: number }>) {
  const byClass: Record<string, { strings: number; calls: number }> = {};
  const internal: Array<[string, number]> = [];
  let total = 0;
  for (const r of rows) {
    const cls = classifyTransactionFailure(r.err);
    const b = (byClass[cls] ??= { strings: 0, calls: 0 });
    b.strings++;
    b.calls += r.n;
    total += r.n;
    if (cls === "internal") internal.push([r.err.replace(/\s+/g, " "), r.n]);
  }
  console.log(`
=== ${label} ===`);
  console.log(`${rows.length} distinct error strings, ${total} failed calls, 90d
`);
  for (const [k, v] of Object.entries(byClass).sort((a, b) => b[1].calls - a[1].calls))
    console.log(
      `  ${k.padEnd(13)} ${String(v.calls).padStart(7)} calls  ${String(v.strings).padStart(4)} strings  ${((100 * v.calls) / total).toFixed(1)}%`,
    );

  const internalCalls = internal.reduce((s, [, n]) => s + n, 0);
  if (!internalCalls) return;
  const tally: Record<string, { s: number; c: number }> = {};
  for (const [msg, n] of internal) {
    const hit = NOT_A_DEFECT.find(([, re]) => re.test(msg));
    const key = hit ? hit[0] : UNCLAIMED;
    const t = (tally[key] ??= { s: 0, c: 0 });
    t.s++;
    t.c += n;
  }
  console.log(
    `
  inside 'internal' ("OUR bug until proven otherwise") -- ${internal.length} strings, ${internalCalls} calls:`,
  );
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1].c - a[1].c))
    console.log(
      `    ${String(v.c).padStart(6)} calls  ${String(v.s).padStart(3)} strings  ${((100 * v.c) / internalCalls).toFixed(1).padStart(5)}%  ${k}`,
    );
  const notOurs = internalCalls - (tally[UNCLAIMED]?.c ?? 0);
  console.log(
    `
  LOWER BOUND on misattribution: ${notOurs} of ${internalCalls} calls (${((100 * notOurs) / internalCalls).toFixed(1)}%)`,
  );
  console.log(
    `  carry positive evidence they are not a defect in our logic, and are counted as one.`,
  );
}

async function main() {
  // Read-only by construction, not by intention: the operator handle is a
  // Postgres role that refuses writes. CI refuses any script here that reaches
  // for the application's read-write pool instead.
  const db = openOperatorDrizzle();
  const all = (await db.execute(sql`
    select t.error as err, count(*)::int as n
    from transactions t
    where t.error is not null and t.error <> ''
      and t.created_at > now() - interval '90 days'
    group by 1 order by n desc`)) as unknown as Array<{ err: string; n: number }>;
  await report("ALL traffic (dominated by our own harness -- see GOALS.md)", all);

  const paid = (await db.execute(sql`
    select t.error as err, count(*)::int as n
    from transactions t
    where t.error is not null and t.error <> ''
      and t.created_at > now() - interval '90 days'
      and t.is_free_tier = false
      and ${externalCustomers("t")}
    group by 1 order by n desc`)) as unknown as Array<{ err: string; n: number }>;
  await report("EXTERNAL PAID traffic -- the only population the floor acts on", paid);
  process.exit(0);
}

await main();
