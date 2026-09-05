/**
 * Who actually called this, and what did they get.
 *
 * Production read-only. The one command to run before writing down that
 * something is happening "in production" — because on this platform an
 * unfiltered count is a harness count by default, and the harness is roughly
 * 98% of all traffic.
 *
 * It exists because of a measured failure (LESSONS.md F2 incident 10,
 * 2026-09-04): a merged change reported three capabilities crashing "in
 * production, last 24h" at 13/12/12 calls. Every one of those calls — 2,425
 * of them, going back to 2026-05-29 — was our own test harness feeding
 * malformed input to its own negative tests. No customer had ever hit any of
 * the three. The query behind that claim was correct; its population was
 * everybody.
 *
 * So this prints the PARTITION, never a filtered total: harness, registered
 * account and anonymous (x402) side by side, with the error strings under
 * each. A customer-impact figure of zero is then something you have to read
 * past, rather than something you have to remember to ask for.
 *
 * The handle is openOperatorDrizzle() — read-only, enforced by Postgres, not
 * the application's read-write pool. A script that only ever SELECTs still has
 * to hold the read-only handle: the guard is on the handle, because intent is
 * not a control. Caught by guard-production-write-access.mjs, 2026-09-05.
 *
 * Usage:
 *   npx tsx scripts/who-called.ts --slug redirect-trace [--days 10] [--errors]
 *   npx tsx scripts/who-called.ts --error "map is not a function" --days 30
 *   npx tsx scripts/who-called.ts --failing --days 7      # every failing slug
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { openOperatorDrizzle } from "../src/lib/operator-db.js";
import {
  callerClassSql, CALLER_CLASSES, EXTERNAL_CALLER_CLASSES, HEALTH_PROBE_STATUS,
  type CallerClass,
} from "../src/lib/metrics/populations.js";

// The operator handle reads DATABASE_URL when it is opened, and unlike the
// application pool it loads no environment of its own. Without this the script
// dies with "DATABASE_URL is required" even on a machine where .env sits right
// there — which is how it read on first run. Safe after the imports because the
// handle is opened inside main(), never at module scope. Same repo-root .env
// every other operator script reads.
const HERE = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(HERE, "../../..", ".env") });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const has = (name: string) => process.argv.includes(`--${name}`);

const slug = arg("slug");
const errorLike = arg("error");
const days = Number(arg("days") ?? 7);
const showErrors = has("errors") || Boolean(errorLike) || has("failing");

if (!slug && !errorLike && !has("failing")) {
  console.error("give one of --slug <slug>, --error <substring>, or --failing");
  process.exit(2);
}
if (!Number.isFinite(days) || days <= 0) {
  console.error("--days must be a positive number");
  process.exit(2);
}

type Row = { slug: string | null; klass: CallerClass; status: string; n: number; err: string | null };

/**
 * Printed even at zero, so a class that is empty is something you read past
 * rather than something you have to remember to ask for.
 *
 * `anonymous` was labelled "(x402)" until 2026-09-05. It is not: a null user
 * also covers free-tier and progressive-unlock calls, and over 30 days 59 of
 * them had no wallet at all. The wallet calls are now their own class.
 */
const LABELS: Record<CallerClass, string> = {
  harness: "harness   (ours)",
  account: "account   (registered)",
  x402: "x402      (wallet paid)",
  anonymous: "anonymous (no account)",
};

async function main() {
  const db = openOperatorDrizzle();
  const since = sql`now() - (${String(days)} || ' days')::interval`;
  const slugFilter = slug ? sql` AND c.slug = ${slug}` : sql``;
  const errFilter = errorLike ? sql` AND t.error ILIKE ${`%${errorLike}%`}` : sql``;
  // Named, not "everything that is not completed". That denylist swept in our
  // own `health_probe` rows — 77 of the 78 "failing customer calls" this tool
  // printed over a 20-day window were the platform pinging its own database.
  // They are classified `harness` now, so this is belt and braces; it also
  // keeps `pending`/`executing` (a call still in flight) out of the failed
  // column, which the denylist would have counted as a failure the moment one
  // existed. Found by independent review of PR #507.
  const failingOnly = has("failing") ? sql` AND t.status = 'failed'` : sql``;
  const noProbes = sql` AND t.status <> ${HEALTH_PROBE_STATUS}`;

  const res: any = await db.execute(sql`
    SELECT c.slug AS slug,
           ${callerClassSql("t")} AS klass,
           t.status AS status,
           COUNT(*)::int AS n,
           ${showErrors ? sql`left(t.error, 110)` : sql`NULL::text`} AS err
      FROM transactions t
      LEFT JOIN capabilities c ON c.id = t.capability_id
     WHERE t.created_at >= ${since}${noProbes}${slugFilter}${errFilter}${failingOnly}
     GROUP BY 1, 2, 3, 5
     ORDER BY 1, 2, 4 DESC`);
  const rows: Row[] = (res.rows ?? res) as Row[];

  if (rows.length === 0) {
    console.log(`no transactions matched in the last ${days} day(s).`);
    return;
  }

  const bySlug = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.slug ?? "(solution / no capability)";
    (bySlug.get(k) ?? bySlug.set(k, []).get(k)!).push(r);
  }

  console.log(`window: last ${days} day(s), production read-only\n`);
  for (const [name, group] of [...bySlug].sort()) {
    const total = group.reduce((s, r) => s + r.n, 0);
    console.log(`${name}  (${total} call${total === 1 ? "" : "s"})`);
    for (const klass of CALLER_CLASSES) {
      const mine = group.filter((r) => r.klass === klass);
      const n = mine.reduce((s, r) => s + r.n, 0);
      const ok = mine.filter((r) => r.status === "completed").reduce((s, r) => s + r.n, 0);
      // Printed even at zero. A class that vanishes when empty is how "13
      // calls" gets read as "13 customers".
      const label = LABELS[klass];
      console.log(`    ${label.padEnd(24)} ${String(n).padStart(5)}   completed ${String(ok).padStart(5)}   failed ${String(n - ok).padStart(5)}`);
      if (!showErrors) continue;
      for (const r of mine.filter((x) => x.status !== "completed" && x.err)) {
        console.log(`        ${String(r.n).padStart(4)} × ${r.err}`);
      }
    }
    // Split, not summed. An earlier version printed one total of every
    // non-harness row — so a slug with 9 completed and 3 failed customer calls
    // closed with "12 customer-facing call(s)", which in a tool built to stop
    // "13 calls" being read as "13 customers affected" is the one line that
    // reads exactly that way. Impact is the failed half; the completed half is
    // ordinary business. Caught by review, 2026-09-04.
    //
    // Second correction, 2026-09-05: "customer" is a claim about who called,
    // and this line was making it for every non-harness row. Two of those
    // classes are people who paid us (`account`, `x402`); the third is anybody
    // at all with a free-tier call, including the crawlers `categorise()`
    // exists to keep out of demand figures. They are counted and named
    // separately now, and nothing disappears — the free half is still printed.
    const ext = group.filter((r) => EXTERNAL_CALLER_CLASSES.includes(r.klass));
    const paidRows = group.filter((r) => r.klass === "account" || r.klass === "x402");
    const tally = (rs: Row[]) => {
      const all = rs.reduce((acc, r) => acc + r.n, 0);
      const ok = rs.filter((r) => r.status === "completed").reduce((acc, r) => acc + r.n, 0);
      return { all, bad: all - ok };
    };
    const e = tally(ext);
    const paid = tally(paidRows);
    const free = { all: e.all - paid.all, bad: e.bad - paid.bad };
    if (e.all === 0) {
      console.log("    → nobody outside our own harness reached this in this window\n");
    } else {
      const paidLine =
        paid.all === 0
          ? "no call from a paying caller"
          : paid.bad === 0
            ? `${paid.all} paying call(s), NONE of which failed`
            : `${paid.all} paying call(s), of which ${paid.bad} failed`;
      const freeLine =
        free.all === 0
          ? ""
          : `; plus ${free.all} anonymous free-tier call(s)` +
            `${free.bad ? `, ${free.bad} failed` : ""} — callers, not necessarily customers`;
      console.log(`    → ${paidLine}${freeLine}\n`);
    }
  }
}

main().then(
  () => process.exit(0),
  (e) => { console.error(e); process.exit(1); },
);
