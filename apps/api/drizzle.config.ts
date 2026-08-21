/**
 * drizzle-kit config — TEST-DATABASE BOOTSTRAP ONLY (WP1).
 *
 * This exists so CI can materialise the schema in a throwaway Postgres from
 * `src/db/schema.ts`, which is this repo's source of truth for table shape.
 * Deriving the test database from the same file the application imports is
 * what makes a DB-contract test meaningful: if schema.ts and the tests
 * disagree, the lane fails rather than silently testing a stale shape.
 *
 * It is NOT a production migration mechanism. Production schema changes go
 * through `runStartupMigrations()` (see DEC-20260504-C); nothing here runs at
 * deploy time, and `push` must never be pointed at a production database.
 * The URL is read from DATABASE_URL_TEST specifically so a stray DATABASE_URL
 * in the environment cannot become the target.
 */
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL_TEST;
if (!url) {
  throw new Error(
    "DATABASE_URL_TEST is required. This config only ever targets a throwaway " +
      "test database — never production.",
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: false,
  verbose: false,
});
