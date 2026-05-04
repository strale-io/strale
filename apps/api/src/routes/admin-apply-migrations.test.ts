/**
 * Regression tests for the refactored
 * POST /v1/internal/tests/admin/apply-migrations endpoint.
 *
 * Pre-PR-#52, the endpoint had its own inline block set (0028, 0029,
 * 0030, 0031) that drifted from the startup-time set in
 * apply-migrations.ts (0028, 0029, 0060, 0062). The drift was the
 * underlying cause of the 2026-05-04 PR-#42 deploy outage — apply-
 * migrations.ts itself was never invoked at deploy time, but even if
 * an operator had hit the admin endpoint manually, it was missing the
 * 0060 + 0062 blocks the new code expected.
 *
 * Post-PR-#52, the endpoint delegates to runStartupMigrations() in
 * lib/startup-migrations.ts. Adding a block to startup-migrations.ts
 * automatically extends admin-endpoint coverage. These tests pin the
 * contract:
 *
 *   1. The endpoint calls runStartupMigrations() exactly once per request
 *      (the single source of truth — not duplicated inline).
 *   2. On success, returns 200 with { ok, block_count, blocks } shape.
 *   3. On any block throwing, mirrors the boot-time failure semantics —
 *      returns 500 with the error message; no silent partial success.
 *   4. Auth gate (admin secret) still enforced before the migration runs.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";

// Mock the DB layer — runStartupMigrations is mocked too, so the DB
// stub only needs to satisfy module-load assertions in app.ts.
vi.mock("../db/index.js", () => ({
  getDb: () => ({
    execute: () => Promise.resolve([]),
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([]) }),
        innerJoin: () => ({ where: () => ({ orderBy: () => Promise.resolve([]) }) }),
      }),
    }),
  }),
  closeDbPool: () => Promise.resolve(),
}));

// Mock MCP for the same reason internal-auth.test.ts does — the
// strale-mcp workspace package isn't resolvable in vitest without a
// prior build.
vi.mock("./mcp.js", () => {
  const { Hono } = require("hono");
  return { mcpRoute: new Hono() };
});

// THE mock under test: capture calls to runStartupMigrations and
// substitute scriptable behaviour (success / throw).
const mockRunStartupMigrations = vi.fn();
vi.mock("../lib/startup-migrations.js", () => ({
  runStartupMigrations: () => mockRunStartupMigrations(),
}));

const ADMIN_TOKEN = "unit-test-admin-secret-plenty-of-entropy-0123456789";

beforeAll(() => {
  process.env.ADMIN_SECRET = ADMIN_TOKEN;
  process.env.AUDIT_HMAC_SECRET =
    "unit-test-audit-secret-plenty-of-entropy-0123456789";
});

async function loadApp() {
  const { app } = await import("./../app.js");
  return app;
}

describe("POST /v1/internal/tests/admin/apply-migrations — auth gate", () => {
  it("returns 401 without Authorization header (and does not call runStartupMigrations)", async () => {
    mockRunStartupMigrations.mockReset();
    const app = await loadApp();
    const res = await app.request("/v1/internal/tests/admin/apply-migrations", {
      method: "POST",
    });
    expect(res.status).toBe(401);
    expect(mockRunStartupMigrations).not.toHaveBeenCalled();
  });

  it("returns 401 with wrong admin secret (and does not call runStartupMigrations)", async () => {
    mockRunStartupMigrations.mockReset();
    const app = await loadApp();
    const res = await app.request("/v1/internal/tests/admin/apply-migrations", {
      method: "POST",
      headers: { Authorization: "Bearer wrong-value" },
    });
    expect(res.status).toBe(401);
    expect(mockRunStartupMigrations).not.toHaveBeenCalled();
  });
});

describe("POST /v1/internal/tests/admin/apply-migrations — success path", () => {
  it("delegates to runStartupMigrations exactly once and returns the per-block summary", async () => {
    const fakeBlocks = [
      { block: "0028_sqs_daily_snapshot", outcome: "skipped (table already exists)", duration_ms: 5 },
      { block: "0029_actual_cost_cents", outcome: "skipped (column already exists)", duration_ms: 4 },
      { block: "0030_compliance_columns", outcome: "skipped (columns already exist)", duration_ms: 6 },
      { block: "0031_test_results_suite_executed_idx", outcome: "ensured composite index on (test_suite_id, executed_at DESC)", duration_ms: 3 },
      { block: "0060_marketplace_eligible", outcome: "ensured marketplace_eligible + marketplace_eligible_reason columns", duration_ms: 7 },
      { block: "0062_paid_vendor_costs", outcome: "no rows to update (already classified)", rows_affected: 0, duration_ms: 12 },
    ];
    mockRunStartupMigrations.mockReset();
    mockRunStartupMigrations.mockResolvedValueOnce(fakeBlocks);

    const app = await loadApp();
    const res = await app.request("/v1/internal/tests/admin/apply-migrations", {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });

    expect(res.status).toBe(200);
    expect(mockRunStartupMigrations).toHaveBeenCalledTimes(1);

    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      block_count: 6,
      blocks: fakeBlocks,
    });
  });

  it("response shape is the canonical per-block summary; no inline duplication detectable", async () => {
    // Smoke: every entry the endpoint returns must have come from the
    // mocked function. If someone adds a parallel inline block in the
    // future, this test would either drift or surface it (because the
    // mock returns N blocks but the endpoint would return N+1).
    const fake = [{ block: "0028_sqs_daily_snapshot", outcome: "skipped", duration_ms: 1 }];
    mockRunStartupMigrations.mockReset();
    mockRunStartupMigrations.mockResolvedValueOnce(fake);

    const app = await loadApp();
    const res = await app.request("/v1/internal/tests/admin/apply-migrations", {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const body = await res.json();
    expect(body.block_count).toBe(1);
    expect(body.blocks).toEqual(fake);
  });
});

describe("POST /v1/internal/tests/admin/apply-migrations — failure-aborts semantics", () => {
  it("returns 500 with error message when runStartupMigrations throws (no silent partial success)", async () => {
    mockRunStartupMigrations.mockReset();
    mockRunStartupMigrations.mockRejectedValueOnce(
      new Error("0062_paid_vendor_costs post-condition failed: 1 paid-vendor suites still at external_cost_cents = 0"),
    );

    const app = await loadApp();
    const res = await app.request("/v1/internal/tests/admin/apply-migrations", {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });

    expect(res.status).toBe(500);
    expect(mockRunStartupMigrations).toHaveBeenCalledTimes(1);

    const body = await res.json();
    expect(body.error_code).toBe("migration_failed");
    expect(body.message).toContain("post-condition failed");
    expect(body.message).toContain("paid-vendor suites still at external_cost_cents = 0");
  });

  it("converts non-Error throws to a string in the response (defensive)", async () => {
    mockRunStartupMigrations.mockReset();
    mockRunStartupMigrations.mockRejectedValueOnce("opaque string failure");

    const app = await loadApp();
    const res = await app.request("/v1/internal/tests/admin/apply-migrations", {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toContain("opaque string failure");
  });
});
