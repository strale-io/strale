/**
 * free_tier_health: the daily check that kept meta-daily from ever recording
 * a success. Its query interpolated a JS slug array into `ANY(${...})`, which
 * drizzle renders as a row tuple that Postgres rejects, so every run returned
 * "Check error" and checksCompleted() withheld the heartbeat. The check now
 * selects by the canonical is_free_tier flag. Verified against Postgres 16 in
 * the PR; this pins the query shape and the outcomes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

// A plain recorder, not vi.fn(): vitest 4 fails a test whose vi.fn
// implementation rejects even when the code under test catches it.
let respond: () => Promise<unknown> = async () => [];
const calls: SQL[] = [];
const execute = (query: SQL) => { calls.push(query); return respond(); };
vi.mock("../db/index.js", () => ({ getDb: () => ({ execute }) }));
vi.mock("./health-monitor.js", () => ({ logHealthEvent: vi.fn(async () => {}) }));

const { checkFreeTierHealth } = await import("./meta-monitoring.js");
const { checksCompleted } = await import("./job-run-context.js");

const rendered = () => new PgDialect().sqlToQuery(calls[0]);

describe("checkFreeTierHealth", () => {
  beforeEach(() => { calls.length = 0; respond = async () => []; });

  it("selects by the is_free_tier flag and binds no array into ANY()", async () => {
    respond = async () => ([{ slug: "iban-validate", capability_type: "computed", external_failures_7d: 0 }]);
    await checkFreeTierHealth();
    const { sql, params } = rendered();
    expect(sql).toMatch(/c\.is_free_tier = true/);
    expect(sql).not.toMatch(/ANY\(\(/);
    expect(params.some(Array.isArray)).toBe(false);
  });

  it("passes and counts when every free-tier capability is clean", async () => {
    respond = async () => ([
      { slug: "iban-validate", capability_type: "computed", external_failures_7d: 0 },
      { slug: "json-repair", capability_type: "computed", external_failures_7d: 0 },
    ]);
    const result = await checkFreeTierHealth();
    expect(result.passed).toBe(true);
    expect(result.details).toContain("All 2 free-tier");
    expect(checksCompleted([result])).toBe(true);
  });

  it("fails on external failures, and the run still counts as completed", async () => {
    respond = async () => ([{ slug: "dns-lookup", capability_type: "stable_api", external_failures_7d: 3 }]);
    const result = await checkFreeTierHealth();
    expect(result.passed).toBe(false);
    expect(result.details).toContain("dns-lookup: 3 external failures");
    expect(checksCompleted([result])).toBe(true);
  });

  it("fails when no free-tier capability is active (not a pass over nothing)", async () => {
    respond = async () => ([]);
    const result = await checkFreeTierHealth();
    expect(result.passed).toBe(false);
    expect(result.details).toMatch(/No active free-tier capabilities/);
  });

  it("a query error stays visible: the run does not count as completed", async () => {
    respond = async () => { throw new Error("op ANY/ALL (array) requires array on right side"); };
    const result = await checkFreeTierHealth();
    expect(result.details).toMatch(/^Check error: /);
    expect(checksCompleted([result])).toBe(false);
  });
});
