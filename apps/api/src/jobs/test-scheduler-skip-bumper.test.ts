/**
 * Regression test for the test-scheduler skip-bumper SQL bug.
 *
 * Bug shape (pre-fix, lived in `apps/api/src/jobs/test-scheduler.ts` for
 * the lifetime of the skip-marker block):
 *
 *   await getDb().execute(sql`
 *     UPDATE capabilities
 *     SET last_tested_at = NOW(),
 *         freshness_level = 'unverified'
 *     WHERE slug = ANY(${skippedSlugs})       -- <-- skippedSlugs is a JS array
 *   `);
 *
 * Drizzle's sql-template interpolation expanded the JS array into a row
 * constructor — `WHERE slug = ANY(($1, $2, $3, $4, $5))` — which Postgres
 * rejects: `op ANY/ALL (array) requires array on right side at character 144`.
 *
 * Production-log evidence: every ~5 min for hours leading up to the
 * 2026-05-04 postgres crash, the scheduler tried to bump unhealthy-
 * provider skipped capabilities and the UPDATE failed silently inside
 * the surrounding try/catch. The skipped capabilities therefore
 * permanently occupied the queue head and starved the rest of the
 * catalog — the exact failure mode the skip-marker was added to prevent.
 *
 * Fix: switch from raw sql template to drizzle's typed UPDATE +
 * inArray(), which compiles the array as separate bound parameters
 * (`WHERE slug IN ($1, $2, $3, $4, $5)`) — Postgres-safe.
 */

import { describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { capabilities } from "../db/schema.js";

describe("test-scheduler skip-bumper SQL shape", () => {
  const dialect = new PgDialect();

  /**
   * The fixed query as the scheduler now builds it. PgDialect.sqlToQuery
   * compiles a Drizzle SQL chunk to a {sql, params} pair without
   * touching the wire — exactly what we need to assert the rendered
   * shape without prod DB access.
   */
  it("inArray-based WHERE compiles to per-element bound parameters", () => {
    const skippedSlugs = ["alpha", "beta", "gamma", "delta", "epsilon"];
    const where = inArray(capabilities.slug, skippedSlugs);

    const compiled = dialect.sqlToQuery(where);

    // Expect exactly one bind per slug — the IN-list shape Postgres
    // expects. The buggy form would have produced a single array bind
    // or a row-constructor expansion.
    expect(compiled.params).toHaveLength(skippedSlugs.length);
    for (const param of compiled.params) {
      expect(typeof param).toBe("string");
      expect(skippedSlugs).toContain(param);
    }

    // Rendered SQL: drizzle's inArray() emits `"slug" in ($1,...)` —
    // standard SQL IN-list. The buggy form had `slug = ANY(...)` with
    // a JS array on the right; the new form does not contain `ANY`.
    expect(compiled.sql.toLowerCase()).toMatch(/"slug"\s+in\s*\(/);
    expect(compiled.sql.toLowerCase()).not.toMatch(/=\s*any\s*\(/);
  });

  /**
   * Single-element arrays are the boundary case. Drizzle still emits
   * an IN-list for them; we verify it does not collapse to `=`.
   */
  it("handles single-element skippedSlugs without collapsing to =", () => {
    const skippedSlugs = ["only-one"];
    const where = inArray(capabilities.slug, skippedSlugs);
    const compiled = dialect.sqlToQuery(where);

    expect(compiled.params).toEqual(["only-one"]);
    expect(compiled.sql.toLowerCase()).toMatch(/"slug"\s+in\s*\(/);
  });

  /**
   * Empty-array boundary: the production code-path is gated by
   * `if (skippedSlugs.length > 0)` so the UPDATE never runs with an
   * empty array. Asserted here for completeness — drizzle's inArray
   * with an empty array is documented as `false` (no rows match), not
   * a runtime error, but the scheduler relies on the outer guard.
   */
  it("documents the empty-array boundary (caller must guard)", () => {
    const where = inArray(capabilities.slug, []);
    const compiled = dialect.sqlToQuery(where);
    // Drizzle emits `false` for empty IN — safe but pointless. The
    // scheduler's outer length-check is what keeps the query from
    // running in this case.
    expect(compiled.sql.toLowerCase()).not.toMatch(/=\s*any\s*\(/);
  });
});
