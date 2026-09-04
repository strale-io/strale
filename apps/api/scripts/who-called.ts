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
 * Usage:
 *   npx tsx scripts/who-called.ts --slug redirect-trace [--days 10] [--errors]
 *   npx tsx scripts/who-called.ts --error "map is not a function" --days 30
 *   npx tsx scripts/who-called.ts --failing --days 7      # every failing slug
 */
import { sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { callerClassSql, CALLER_CLASSES, type CallerClass } from "../src/lib/metrics/populations.js";

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

async function main() {
  const db = getDb();
  const since = sql`now() - (${String(days)} || ' days')::interval`;
  const slugFilter = slug ? sql` AND c.slug = ${slug}` : sql``;
  const errFilter = errorLike ? sql` AND t.error ILIKE ${`%${errorLike}%`}` : sql``;
  const failingOnly = has("failing") ? sql` AND t.status <> 'completed'` : sql``;

  const res: any = await db.execute(sql`
    SELECT c.slug AS slug,
           ${callerClassSql("t")} AS klass,
           t.status AS status,
           COUNT(*)::int AS n,
           ${showErrors ? sql`left(t.error, 110)` : sql`NULL::text`} AS err
      FROM transactions t
      LEFT JOIN capabilities c ON c.id = t.capability_id
     WHERE t.created_at >= ${since}${slugFilter}${errFilter}${failingOnly}
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
      const label = klass === "harness" ? "harness   (ours)" : klass === "account" ? "account   (registered)" : "anonymous (x402)";
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
    const ext = group.filter((r) => r.klass !== "harness");
    const extAll = ext.reduce((s, r) => s + r.n, 0);
    const extOk = ext.filter((r) => r.status === "completed").reduce((s, r) => s + r.n, 0);
    const extBad = extAll - extOk;
    console.log(
      extAll === 0
        ? "    → no customer call reached this at all in this window\n"
        : extBad === 0
          ? `    → ${extAll} customer call(s), NONE of which failed\n`
          : `    → ${extAll} customer call(s), of which ${extBad} failed\n`,
    );
  }
}

main().then(
  () => process.exit(0),
  (e) => { console.error(e); process.exit(1); },
);
