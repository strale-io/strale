#!/usr/bin/env node
/**
 * Refuse to run the integration lane against anything holding real data.
 *
 * The in-process guard (src/test-support/integration-db.ts) checks the URL:
 * loopback host, and a database name containing "test". Both are properties of
 * the *address*, and an address can lie. A local PgBouncer or SSH tunnel can
 * publish `localhost:5432/strale_test` and route it to production — the URL
 * passes every string check and the writes land on customer data.
 *
 * So this asks the database what it CONTAINS. A freshly provisioned lane
 * database has an empty catalog and no users; production has hundreds of
 * capabilities and real customers. That distinction cannot be forged by a
 * proxy, because the proxy has to serve the real rows to be useful.
 *
 * Runs in CI BEFORE the schema is materialised, and before any suite executes.
 * The ordering is the whole point: `drizzle-kit push --force` is itself a
 * write, and against a proxied production database it could alter or drop real
 * schema. A safety check that runs after the first write has already lost.
 *
 * That means the target is usually empty when this runs, so an absent table is
 * treated as evidence of a fresh database rather than as an error. A proxy
 * pointing at production fails the other way: the tables exist and are full.
 */

import postgres from "postgres";

const url = process.env.DATABASE_URL_TEST;
if (!url) {
  console.error(
    "[disposable-db] DATABASE_URL_TEST is not set; nothing to verify.",
  );
  process.exit(1);
}

/**
 * Ceilings a throwaway lane database cannot plausibly exceed, set far below
 * production's real figures (340+ capabilities, real users, large transaction
 * history) and far above what the suites themselves seed (a handful of rows,
 * cleaned up per test).
 */
const CEILINGS = [
  { table: "capabilities", max: 50 },
  { table: "users", max: 50 },
  { table: "transactions", max: 1000 },
  { table: "wallet_transactions", max: 1000 },
];

const sql = postgres(url, { max: 1, idle_timeout: 5 });

try {
  const findings = [];

  let absent = 0;

  for (const { table, max } of CEILINGS) {
    const [{ exists }] = await sql`
      SELECT to_regclass(${"public." + table}) IS NOT NULL AS exists`;

    // Runs before the schema is created, so an absent table is the normal
    // case for a fresh lane database — and positive evidence that this is not
    // production, where every one of these exists and is populated.
    if (!exists) {
      absent += 1;
      continue;
    }

    const [{ count }] = await sql.unsafe(
      `SELECT COUNT(*)::int AS count FROM ${table}`,
    );
    if (count > max) {
      findings.push(`${table} holds ${count} rows (ceiling ${max})`);
    }
  }

  if (findings.length > 0) {
    console.error(
      "[disposable-db] REFUSING to run DB-writing tests. The target contains " +
        "far more data than a throwaway lane database should:\n  - " +
        findings.join("\n  - ") +
        "\n\nThe URL passed the loopback and name checks, so this is most " +
        "likely a proxy or tunnel pointing at a real database. These suites " +
        "INSERT, UPDATE and DELETE; they must not touch it.",
    );
    process.exit(1);
  }

  console.log(
    absent === CEILINGS.length
      ? "[disposable-db] OK — target has no Strale tables yet; treating as a " +
          "fresh throwaway database."
      : "[disposable-db] OK — target is empty enough to be a throwaway database.",
  );
} finally {
  await sql.end({ timeout: 5 });
}
