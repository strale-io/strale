/**
 * Regression coverage for internalAccountEmailExclusionSql(), the shared
 * drizzle-safe fragment builder for the internal-account exclusion rule.
 *
 * This pins the bug this function exists to prevent: drizzle-orm's `sql`
 * template tag does not serialize a JS array as a single Postgres array
 * bind parameter for ANY() — `... = ANY(${array})` expands to a row-value
 * tuple `ANY(($1, $2))`, which Postgres rejects with "op ANY/ALL (array)
 * requires array on right side". That exact bug shipped in commit 4bf58d0
 * (crashed loadCatalog on every /v1/suggest request) and resurfaced in
 * auto-register.ts and test-scheduler.ts. It is easy to reintroduce here by
 * copying jobs/quality-floor.ts's shape verbatim — that file's
 * `LIKE ANY(${array})` is safe only because it runs through the `postgres`
 * package's own tag, not drizzle's.
 *
 * The first test fails against an `= ANY(${array})` implementation and
 * passes against the `sql.join(...)` form — verified manually with
 * drizzle's own PgDialect against both shapes before writing this
 * assertion.
 */
import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  internalAccountEmailExclusionSql,
  INTERNAL_EMAIL_LIKE_PATTERNS,
  EXTRA_EXCLUDED_EMAILS,
} from "./internal-accounts.js";

const dialect = new PgDialect();

describe("internalAccountEmailExclusionSql", () => {
  it("builds a parameterized OR-list, never ANY(array)", () => {
    const built = dialect.sqlToQuery(internalAccountEmailExclusionSql());

    // The suffix patterns and exact-match extras are both present, flattened
    // into one OR chain (not an OR-of-LIKEs joined to a separate IN-list).
    expect(built.sql).toContain("email LIKE");
    expect(built.sql).toContain("email =");
    expect(built.sql).not.toContain(" IN (");

    // No ANY(array-param) anywhere. drizzle's tuple expansion renders as
    // `ANY(($1, $2, ...))` — a literal `(` right after `ANY(` is the tell.
    expect(built.sql).not.toMatch(/ANY\(\(/);

    // No raw JS array reached the bind-parameter list — the structural
    // shape of the 4bf58d0 bug.
    for (const param of built.params) {
      expect(Array.isArray(param)).toBe(false);
    }

    // Every pattern/email is present as its own bound parameter.
    for (const pattern of INTERNAL_EMAIL_LIKE_PATTERNS) {
      expect(built.params).toContain(pattern);
    }
    for (const email of EXTRA_EXCLUDED_EMAILS) {
      expect(built.params).toContain(email);
    }
  });

  it("condition count matches the source lists (one OR term per pattern/email)", () => {
    const built = dialect.sqlToQuery(internalAccountEmailExclusionSql());
    const orCount = (built.sql.match(/ OR /g) ?? []).length;
    expect(orCount).toBe(
      INTERNAL_EMAIL_LIKE_PATTERNS.length + EXTRA_EXCLUDED_EMAILS.length - 1,
    );
  });
});
