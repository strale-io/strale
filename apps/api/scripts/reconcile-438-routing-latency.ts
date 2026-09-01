/**
 * ONE-SHOT: apply #438's two routing-latency corrections. (2026-08-30)
 *
 *   npx tsx apps/api/scripts/reconcile-438-routing-latency.ts
 *
 * Delete this file once it has run. It exists as a script rather than as two
 * pasted SQL statements so the preconditions, the row counts and the
 * "nothing else moved" check are enforced by something that can refuse,
 * instead of by an operator reading output carefully at the end of a long day.
 *
 * ## What it changes
 *
 *   page-speed-test   avg_latency_ms  8000 -> 20000
 *   company-news      avg_latency_ms  NULL -> 28734
 *
 * and `updated_at` on those two rows. Nothing else, on any row.
 *
 * ## Why
 *
 * `/v1/do` picks sync-vs-async from `avg_latency_ms` against a 10s threshold,
 * while the sync path itself dies at 15s (`idle_in_transaction_session_timeout`
 * in `executeSync`'s wallet transaction). Both capabilities sit in that band
 * with tails well past the wall, measured over 90 days of completed
 * executions:
 *
 *   company-news      avg NULL   p50 15,359  p95 29,405  max 29,984  n= 69  52.2% past the wall
 *   page-speed-test   avg 8,000  p50  7,952  p95 19,029  max 49,910  n=436  12.4% past the wall
 *
 * The new values are p95 of those distributions (28,734 for company-news;
 * 20,000 for page-speed-test, chosen just above its 19,029 p95 so routing does
 * not oscillate — its true mean, 10,152, clears the threshold by only 1.5%).
 * `company-news`'s value is exactly what `estimateRoutingLatency` would write,
 * so this manual write and the automated one cannot disagree.
 *
 * The column is named `avg_latency_ms` and now holds a routing budget rather
 * than a mean; `lib/latency-estimate.ts` documents that trade and why no
 * schema field was added for it.
 *
 * ## Authority
 *
 * This action remains `approval_required` in DQ-27. The measured values settle
 * what should change; they do not grant permission to change production.
 * `requireFounderGrant` therefore fails closed until the founder-grant route is
 * installed and a short-lived grant for this exact purpose is supplied.
 */
import { requireFounderGrant } from "../src/lib/production-authority.js";
import { openOperatorWriteDb } from "../src/lib/operator-db.js";

interface Target {
  slug: string;
  /** Precondition AND guard: the update only fires against this value. */
  from: number | null;
  to: number;
}

const TARGETS: Target[] = [
  { slug: "page-speed-test", from: 8000, to: 20000 },
  { slug: "company-news", from: null, to: 28734 },
];

/** Every column except the two this script is allowed to move. */
const MUTABLE = new Set(["avg_latency_ms", "updated_at"]);

function fingerprint(row: Record<string, unknown>): string {
  const kept: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!MUTABLE.has(k)) kept[k] = v instanceof Date ? v.toISOString() : v;
  }
  return JSON.stringify(kept, Object.keys(kept).sort());
}

async function main(): Promise<void> {
  const sql = openOperatorWriteDb(
    requireFounderGrant("reconcile_438_routing_latency"),
  );

  try {
    // ── Baseline, read on the WRITE connection ────────────────────────────
    // Read here rather than trusting the earlier read-only preflight: between
    // the two, a deploy or the test runner could have moved the row. The
    // guard that matters is the one taken against the connection that writes.
    const before = await sql`
      SELECT * FROM capabilities WHERE slug IN ('page-speed-test','company-news') ORDER BY slug`;
    const [{ digest: digestBefore, expected_digest: digestExpected, n: rowsBefore }] = await sql`
      SELECT count(*)::int AS n,
             md5(string_agg(slug || ':' || coalesce(avg_latency_ms::text,'null'), ',' ORDER BY slug)) AS digest,
             md5(string_agg(
               slug || ':' || coalesce(
                 CASE slug
                   WHEN 'page-speed-test' THEN '20000'
                   WHEN 'company-news'    THEN '28734'
                   ELSE avg_latency_ms::text
                 END,
                 'null'
               ),
               ',' ORDER BY slug
             )) AS expected_digest
        FROM capabilities`;

    const baseline = new Map(before.map((r) => [r.slug as string, r]));
    const fpBefore = new Map(before.map((r) => [r.slug as string, fingerprint(r)]));

    console.log(`baseline: ${rowsBefore} capability rows, digest ${digestBefore}`);
    for (const t of TARGETS) {
      const row = baseline.get(t.slug);
      if (!row) throw new Error(`PRECONDITION: no row for '${t.slug}'`);
      const actual = row.avg_latency_ms as number | null;
      if (actual !== t.from) {
        throw new Error(
          `PRECONDITION: ${t.slug}.avg_latency_ms is ${String(actual)}, expected ${String(t.from)} — ` +
            `someone else has moved it. Refusing rather than overwriting their value.`,
        );
      }
      console.log(`  ${t.slug.padEnd(18)} ${String(t.from).padStart(5)} -> ${t.to}  (precondition OK)`);
    }

    // ── The write ─────────────────────────────────────────────────────────
    // One transaction. Each UPDATE repeats its precondition in the WHERE, so
    // a concurrent change between the read above and the write below cannot
    // be clobbered — it just matches zero rows, which the count check turns
    // into a rollback.
    await sql.begin(async (tx) => {
      // postgres-js types `TransactionSql` via `Omit<Sql<T>, …>`, which drops
      // the tagged-template call signature — an upstream typing limitation,
      // not a runtime one. Same cast the other operator scripts use.
      const q = tx as unknown as typeof sql;

      for (const t of TARGETS) {
        const res =
          t.from === null
            ? await q`
                UPDATE capabilities SET avg_latency_ms = ${t.to}, updated_at = now()
                 WHERE slug = ${t.slug} AND avg_latency_ms IS NULL`
            : await q`
                UPDATE capabilities SET avg_latency_ms = ${t.to}, updated_at = now()
                 WHERE slug = ${t.slug} AND avg_latency_ms = ${t.from}`;
        // postgres-js reports the affected count as `.count`, not `.rowCount`.
        if (res.count !== 1) {
          throw new Error(
            `ABORT: ${t.slug} update affected ${res.count} rows, expected exactly 1. ` +
              `Rolling back both statements.`,
          );
        }
        console.log(`  ${t.slug.padEnd(18)} updated (1 row)`);
      }
    });
    console.log("committed");

    // ── Reconciliation ────────────────────────────────────────────────────
    const after = await sql`
      SELECT * FROM capabilities WHERE slug IN ('page-speed-test','company-news') ORDER BY slug`;
    const [{ digest: digestAfter, n: rowsAfter }] = await sql`
      SELECT count(*)::int AS n,
             md5(string_agg(slug || ':' || coalesce(avg_latency_ms::text,'null'), ',' ORDER BY slug)) AS digest
        FROM capabilities`;

    const problems: string[] = [];

    for (const t of TARGETS) {
      const row = after.find((r) => r.slug === t.slug);
      if (!row) {
        problems.push(`${t.slug}: row disappeared`);
        continue;
      }
      if (row.avg_latency_ms !== t.to) {
        problems.push(`${t.slug}: avg_latency_ms is ${String(row.avg_latency_ms)}, expected ${t.to}`);
      }
      // Every other column byte-identical to the baseline.
      if (fingerprint(row) !== fpBefore.get(t.slug)) {
        problems.push(`${t.slug}: a column other than avg_latency_ms/updated_at changed`);
      }
      const before_ = baseline.get(t.slug)!;
      if (!(row.updated_at as Date > (before_.updated_at as Date))) {
        problems.push(`${t.slug}: updated_at did not advance`);
      }
    }

    if (rowsAfter !== rowsBefore) problems.push(`capability row count moved: ${rowsBefore} -> ${rowsAfter}`);

    // Unrelated rows: digestExpected was captured before the transaction with
    // only the two intended substitutions applied. Computing it after the
    // write would absorb an unrelated concurrent mutation and make this guard
    // incapable of detecting the very change it is meant to catch.
    if (digestAfter !== digestExpected) {
      problems.push(
        `an unrelated capability's avg_latency_ms changed (digest ${digestAfter} != expected ${digestExpected})`,
      );
    }

    console.log(`\nafter: ${rowsAfter} capability rows, digest ${digestAfter}`);
    for (const t of TARGETS) {
      const row = after.find((r) => r.slug === t.slug)!;
      const lane = (row.avg_latency_ms as number) > 10_000 ? "ASYNC" : "sync";
      console.log(
        `  ${t.slug.padEnd(18)} avg_latency_ms=${String(row.avg_latency_ms).padEnd(6)} routes=${lane}  updated_at=${(row.updated_at as Date).toISOString()}`,
      );
    }

    if (problems.length > 0) {
      console.error("\nRECONCILIATION FAILED:");
      for (const p of problems) console.error(`  - ${p}`);
      console.error(
        "\nThe write is already committed. Rollback:\n" +
          "  UPDATE capabilities SET avg_latency_ms = 8000 WHERE slug = 'page-speed-test';\n" +
          "  UPDATE capabilities SET avg_latency_ms = NULL WHERE slug = 'company-news';",
      );
      process.exit(1);
    }

    console.log("\nreconciliation OK — both route async, nothing else moved.");
    console.log("Next: npx tsx apps/api/scripts/audit-execution-routing.ts");
  } finally {
    await sql.end();
  }
  process.exit(0);
}

main().catch((err) => {
  // Deliberately the message only. A connection error from postgres-js can
  // carry the connection string in its detail fields.
  console.error("reconcile-438 failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
