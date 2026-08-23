/**
 * Regression tests for the 2026-08-22 "0 cap trust, 0 sol trust" defect.
 *
 * A clean-user smoke test of the published `strale-mcp` package printed, on
 * every start:
 *
 *   Failed to fetch trust batch: Strale API 401:
 *     {"error_code":"unauthorized","message":"Admin authentication required."}
 *   Loaded 297 capabilities, 104 solutions, 0 cap trust, 0 sol trust
 *
 * Root cause was not an access-control decision. `/v1/internal/trust/*` was
 * DELETED with the SQS engine (DEC-20260503-B, 2026-05-05), and because
 * `adminOnly` is mounted on the whole `/v1/internal/*` prefix (app.ts), requests
 * for the now-nonexistent path were rejected by the wall before routing could
 * 404 them. The client caught the error, logged to stderr, and continued with
 * empty trust maps — invisible inside an MCP client, so it shipped for months.
 *
 * The fix is a narrow PUBLIC projection, not a hole in the admin wall. These
 * tests pin both halves of that: the projection is reachable unauthenticated,
 * and it cannot grow admin-only fields.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const suiteRows = [
  { id: "suite-1", slug: "email-validate" },
  { id: "suite-2", slug: "email-validate" },
];

const latestResults = [
  { test_suite_id: "suite-1", passed: true, executed_at: new Date("2026-08-22T10:00:00Z") },
  { test_suite_id: "suite-2", passed: false, executed_at: new Date("2026-08-22T11:00:00Z") },
];

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: async () => suiteRows,
        innerJoin: () => ({ where: async () => [] }),
      }),
    }),
    execute: async () => latestResults,
  }),
}));

beforeEach(() => {
  vi.resetModules();
});

async function get(path: string, headers: Record<string, string> = {}) {
  const { app } = await import("../app.js");
  return app.request(new Request(`http://localhost${path}`, { headers }));
}

describe("an unauthenticated public install can read trust metadata", () => {
  it("serves the capability batch with no Authorization header", async () => {
    const resp = await get("/v1/public/ops/trust/capabilities/batch?slugs=email-validate");

    // Discriminating: against the pre-fix tree this path did not exist, and the
    // client's old path returned 401 from the admin wall. Either way, not 200.
    expect(resp.status).toBe(200);

    const body = (await resp.json()) as Record<string, any>;
    expect(body).toHaveProperty("email-validate");
    expect(body["email-validate"].tested).toBe(true);
    expect(body["email-validate"].badge).toBe("strale_tested");
    // One of two suites passed.
    expect(body["email-validate"].pass_rate).toBe(50);
  });

  it("never answers 401 — the projection is outside the admin wall", async () => {
    const resp = await get("/v1/public/ops/trust/capabilities/batch?slugs=email-validate");
    expect(resp.status).not.toBe(401);
  });

  it("still rejects a request with no slugs, rather than scanning the catalog", async () => {
    const resp = await get("/v1/public/ops/trust/capabilities/batch");
    expect(resp.status).toBe(400);
  });
});

describe("no admin-only field reaches the public projection", () => {
  it("returns only the allowlisted fields", async () => {
    const { PUBLIC_TRUST_FIELDS } = await import("./public-trust.js");
    const resp = await get("/v1/public/ops/trust/capabilities/batch?slugs=email-validate");
    const body = (await resp.json()) as Record<string, Record<string, unknown>>;

    for (const entry of Object.values(body)) {
      expect(Object.keys(entry).sort()).toEqual([...PUBLIC_TRUST_FIELDS].sort());
    }
  });

  it("does not resurrect the retired SQS/guidance internals", async () => {
    const resp = await get("/v1/public/ops/trust/capabilities/batch?slugs=email-validate");
    const raw = await resp.text();

    // These were fields of the deleted /v1/internal/trust route. Reviving any of
    // them here would republish a scoring surface the platform retired, and
    // would do it on an unauthenticated endpoint.
    for (const forbidden of [
      "sqs",
      "raw_sqs",
      "sqs_label",
      "matrix_sqs",
      "qp_score",
      "rp_score",
      "guidance_usable",
      "guidance_strategy",
      "quality",
      "reliability",
      "trend",
    ]) {
      expect(raw).not.toContain(`"${forbidden}"`);
    }
  });
});

describe("the admin wall itself is untouched", () => {
  it("still refuses an unauthenticated request under /v1/internal/*", async () => {
    const resp = await get("/v1/internal/tests/health");
    expect(resp.status).toBe(401);
  });
});
