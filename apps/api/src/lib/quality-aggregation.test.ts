/**
 * Regression coverage for the internal-account latency filter added to
 * computeCapabilityQuality's `recent_latency` CTE.
 *
 * Before this fix, `recent_latency` had no account exclusion at all, so the
 * hourly free-tier test scheduler's own traffic (>=98% of rows on most
 * capabilities) dominated the p95 that gates a caller's `max_latency_ms` in
 * routes/do.ts:849. This pins that the filter is actually wired into the
 * CTE. The SQL-shape details of the exclusion itself (drizzle's ANY(array)
 * bug, the OR-list construction) are covered once, at their source, in
 * internal-accounts.test.ts — not re-asserted here.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SQL } from "drizzle-orm";

const capturedQueries: SQL[] = [];

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    execute: (query: SQL) => {
      capturedQueries.push(query);
      return Promise.resolve([
        {
          success_rate: null,
          avg_response_time_ms: null,
          p95_response_time_ms: null,
          schema_conformance_rate: null,
          avg_field_completeness_pct: null,
          total_30d: "0",
          total_all: "0",
        },
      ]);
    },
  }),
}));

describe("computeCapabilityQuality — recent_latency internal-account filter", () => {
  beforeEach(() => {
    capturedQueries.length = 0;
  });

  it("excludes internal accounts from the recent_latency CTE and keeps the >= 5 sample gate", async () => {
    const { getCapabilityQuality } = await import("./quality-aggregation.js");
    const { PgDialect } = await import("drizzle-orm/pg-core");

    await getCapabilityQuality(`test-slug-${Math.random()}`);

    expect(capturedQueries).toHaveLength(1);
    const built = new PgDialect().sqlToQuery(capturedQueries[0]);

    // The filter is present: recent_latency joins against a users exclusion,
    // not just capabilities/transactions.
    expect(built.sql).toContain("NOT IN");
    expect(built.sql).toMatch(/SELECT id FROM users WHERE/);
    expect(built.sql).toContain("email LIKE");

    // Unaffected by this change — still gates avg/p95 on >= 5 samples.
    expect(built.sql).toContain("COUNT(*) >= 5");
  });
});
