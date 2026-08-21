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
 * Runs in CI after the schema is materialised and before any suite executes.
 * Deliberately a separate step rather than part of the test run: if this
 * fails, nothing should get the chance to write.
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

  for (const { table, max } of CEILINGS) {
    // The lane's schema comes from drizzle-kit push, so a missing table means
    // the bootstrap did not run — worth failing on rather than skipping past.
    const [{ exists }] = await sql`
      SELECT to_regclass(${"public." + table}) IS NOT NULL AS exists`;
    if (!exists) {
      console.error(
        `[disposable-db] Table "${table}" does not exist. The schema was not ` +
          "materialised, so the lane would run against an empty or foreign database.",
      );
      process.exit(1);
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
    "[disposable-db] OK — target is empty enough to be a throwaway database.",
  );
} finally {
  await sql.end({ timeout: 5 });
}
