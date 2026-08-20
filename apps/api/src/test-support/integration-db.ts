/**
 * Safety gate for DB-writing integration tests (WP1).
 *
 * These tests INSERT, UPDATE and DELETE. They must therefore never be able to
 * reach production. Two things make that risk real:
 *
 *   1. The tests seed rows through DATABASE_URL_TEST, but the routes they
 *      exercise call getDb(), which reads DATABASE_URL. So the app-facing
 *      variable has to be pointed at the test database too — which means a
 *      DATABASE_URL already present in the shell would otherwise be inherited.
 *   2. This repo's root .env holds a live production DATABASE_URL for
 *      read-only prod queries. Vitest does not load it today, but nothing
 *      structurally prevents a future setup file from doing so.
 *
 * So the target is validated before anything connects: the host must be
 * loopback. A CI service container is published on localhost, so this costs
 * nothing there, and it makes "point the suite at prod" impossible rather
 * than merely discouraged.
 *
 * Deliberately not an allowlist of production hostnames — that fails open for
 * every host nobody thought to list. Loopback-only fails closed.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export class UnsafeTestDatabaseError extends Error {}

/**
 * Validate a candidate test-database URL. Exported separately from the
 * process-mutating helper so the rule itself is unit-testable without
 * touching process.env.
 */
export function assertLoopbackDatabaseUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafeTestDatabaseError(
      "DATABASE_URL_TEST is not a valid URL. Refusing to run DB-writing tests.",
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new UnsafeTestDatabaseError(
      `DATABASE_URL_TEST points at host "${host}". DB-writing integration ` +
        "tests only run against a loopback database — they INSERT, UPDATE and " +
        "DELETE, and must never be able to reach a shared or production " +
        "database. Start a throwaway Postgres and point DATABASE_URL_TEST at it.",
    );
  }
}

/**
 * Resolve the test database URL and point the application's own DATABASE_URL
 * at it for the duration of the process. Returns null when DATABASE_URL_TEST
 * is unset, so a suite can skip cleanly on a machine with no test database.
 *
 * Throws — never skips — when the variable IS set but unsafe. A silent skip
 * there would hide the very misconfiguration this guard exists to catch.
 */
export function useTestDatabase(): string | null {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    // In the CI integration lane a missing database is a broken lane, not a
    // reason to skip. Vitest exits 0 for a fully skipped file, so skipping
    // here would produce a green job that asserted nothing — the exact way
    // these suites lay dormant before WP1. The lane sets this flag so the
    // failure is loud and needs no report parsing to detect.
    if (process.env.STRALE_REQUIRE_INTEGRATION_DB === "1") {
      throw new UnsafeTestDatabaseError(
        "STRALE_REQUIRE_INTEGRATION_DB=1 but DATABASE_URL_TEST is unset. The " +
          "integration lane must run against a real Postgres; refusing to skip " +
          "and report success.",
      );
    }
    return null;
  }

  assertLoopbackDatabaseUrl(url);

  // Routes under test resolve their connection through getDb() → DATABASE_URL.
  process.env.DATABASE_URL = url;
  return url;
}
