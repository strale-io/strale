// Weekly TOAST-readability scan over money/compliance-critical JSONB columns.
//
// Why this exists: on 2026-08-12 a TOAST corruption ("missing chunk number 0
// for toast value 32384 in pg_toast_16411") was found in
// transactions.audit_trail — one row from 2026-04-04, discovered only four
// months later by an unrelated full-table scan. The row is documented with an
// approved corruption marker (health_monitor_events event_type
// 'audit_corruption_documented'). This scan makes any recurrence surface
// within a week instead of months.
//
// Mechanism: length(col::text) forces a full detoast of every value; a lost
// TOAST chunk raises a PostgresError with code XX000 ("missing chunk ...").
//
// OUTPUT SAFETY: this script's output is tee'd into a PUBLIC GitHub issue by
// the weekly-drift workflow. postgres.js connection/auth error messages embed
// the DB host:port and username — so err.message is only ever printed for
// genuine corruption-class Postgres errors (whose messages name TOAST values,
// not endpoints). Everything else is reported as a sanitized code.
//
// Exit codes:
//   0 — every scanned column fully readable
//   1 — at least one column raised a corruption-class error
//   2 — could not scan (connection/auth/schema/config problem — NOT corruption)

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("check-audit-trail-readability: DATABASE_URL is not set");
  process.exit(2);
}

// Curated list: the audit/compliance artifacts (transactions is the EU AI Act
// record + hash chain) and the catalog surfaces machines read. Extend when a
// new TOAST-able compliance column ships.
const TARGETS = [
  ["transactions", ["audit_trail", "input", "output", "provenance"]],
  ["health_monitor_events", ["details"]],
  ["capabilities", ["input_schema", "output_schema", "output_field_reliability", "onboarding_manifest"]],
  ["test_suites", ["input", "validation_rules", "baseline_output"]],
];

// Corruption-class SQLSTATEs: internal_error (XX000, the "missing chunk"
// class), data_corrupted (XX001), index_corrupted (XX002).
const CORRUPTION_CODES = new Set(["XX000", "XX001", "XX002"]);

const IDENT_RE = /^[a-z_]+$/;

const sql = postgres(DATABASE_URL, {
  max: 1,
  idle_timeout: 5,
  ssl: "require",
  connect_timeout: 30,
  // Bound every statement: a hung seq scan must not pin the xmin horizon
  // (blocking autovacuum on transactions) beyond five minutes.
  connection: { statement_timeout: "300s" },
});

let corruption = 0;
let scanErrors = 0;
for (const [table, columns] of TARGETS) {
  // The identifiers are compile-time constants; this assertion keeps the
  // sql.unsafe below safe against a future refactor wiring input into TARGETS.
  if (!IDENT_RE.test(table) || columns.some((c) => !IDENT_RE.test(c))) {
    console.error(`invalid identifier in TARGETS: ${table} / ${columns.join(",")}`);
    process.exit(2);
  }
  // One query per TABLE (not per column): transactions is the largest,
  // write-hottest table — one seq scan + detoast pass instead of four.
  const sumExprs = columns.map((c) => `coalesce(sum(length("${c}"::text)), 0)::bigint AS "${c}"`).join(", ");
  try {
    const rows = await sql.unsafe(
      `SELECT count(*)::bigint AS __rows, ${sumExprs} FROM "${table}"`,
    );
    const r = rows[0];
    console.log(`ok      ${table} — ${r.__rows} rows; bytes: ${columns.map((c) => `${c}=${r[c]}`).join(" ")}`);
  } catch (err) {
    if (CORRUPTION_CODES.has(err?.code)) {
      // Per-column retry so the report attributes the corruption precisely.
      for (const column of columns) {
        try {
          await sql.unsafe(`SELECT coalesce(sum(length("${column}"::text)), 0) FROM "${table}"`);
          console.log(`ok      ${table}.${column}`);
        } catch (colErr) {
          if (CORRUPTION_CODES.has(colErr?.code)) {
            corruption++;
            // Corruption-class messages name TOAST values, not endpoints —
            // safe to print (and needed for the bisect).
            console.error(`CORRUPT ${table}.${column} — [${colErr.code}] ${colErr.message}`);
            console.error(
              `        Bisect per created_at range probing length(${column}::text) — see the ` +
                `2026-08-12 incident notes (handoff 2026-08-12-readiness-p2-p3-parallel-audits.md).`,
            );
          } else {
            scanErrors++;
            console.error(`SCAN-ERROR ${table}.${column} — [${colErr?.code ?? "no-code"}] (message withheld: may embed connection details)`);
          }
        }
      }
    } else {
      // Connection/auth/schema/timeout — NOT corruption. Message withheld:
      // postgres.js embeds host:port/username in these, and this output lands
      // in a public issue.
      scanErrors++;
      console.error(`SCAN-ERROR ${table} — [${err?.code ?? "no-code"}] could not scan (message withheld: may embed connection details)`);
    }
  }
}

await sql.end();

if (corruption > 0) {
  console.error(`\ntoast-readability: ${corruption} column(s) UNREADABLE — storage corruption, investigate immediately`);
  process.exit(1);
}
if (scanErrors > 0) {
  console.error(`\ntoast-readability: could not complete the scan (${scanErrors} error(s)) — check DATABASE_URL/connectivity. NOT a corruption signal.`);
  process.exit(2);
}
console.log("\ntoast-readability: all scanned columns fully readable");
process.exit(0);
