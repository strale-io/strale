/**
 * Tests for GET /v1/transactions/:id — specifically F-A-005 redaction
 * of the unauthenticated free-tier lookup path.
 *
 * The full HTTP-level assertion:
 *   - Unauth GET on a free-tier transaction returns 200 with a redacted
 *     envelope: body fields (input/output/error/provenance/audit_trail)
 *     absent, `body_redacted: true` and `body_redacted_reason` present.
 *   - The authed branch is not exercised here because it requires mocking
 *     both the user-lookup (optionalAuthMiddleware) and the transaction
 *     lookup with distinct shapes, which is awkward under the shared
 *     getDb mock. That path is regression-tested via live spot-check at
 *     deploy time — see F-A-005.b spot-check B.
 *   - The verify endpoint (GET /:id/verify) is not touched by F-A-005 and
 *     is also regression-tested at deploy time.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";

// A canned row shaped like `selectFields` in transactions.ts. The mock
// getDb returns this for every SELECT to keep the test focused — the test
// asserts on RESPONSE shape, not the query.
const MOCK_FREE_TIER_ROW = {
  id: "00000000-0000-0000-0000-000000000001",
  status: "completed",
  capability_slug: "dns-lookup",
  solution_slug: null,
  input: { hostname: "example.com" },
  output: { records: ["93.184.216.34"] },
  error: null,
  price_cents: 0,
  latency_ms: 12,
  provenance: { source: "dns-protocol", fetched_at: "2026-04-20T00:00:00Z" },
  audit_trail: { request_context: { ipHash: "deadbeef" } },
  transparency_marker: "algorithmic",
  data_jurisdiction: "EU",
  is_free_tier: true,
  created_at: new Date("2026-04-20T00:00:00Z"),
  completed_at: new Date("2026-04-20T00:00:01Z"),
  _matrix_sqs: "84.6",
  _qp_score: "82.1",
  _rp_score: "93.8",
  _guidance_usable: true,
  _guidance_strategy: "direct",
};

// Mock the select chain: select(fields).from(tbl).leftJoin(...).where(...).limit(n) → [row]
const mockLimit = vi.fn(() => Promise.resolve([MOCK_FREE_TIER_ROW]));
vi.mock("../db/index.js", () => ({
  getDb: () => ({
    execute: () => Promise.resolve([]),
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => ({ limit: mockLimit }),
        }),
        where: () => ({ limit: mockLimit }),
        innerJoin: () => ({ where: () => ({ orderBy: () => Promise.resolve([]) }) }),
      }),
    }),
  }),
}));

// Same MCP stub as health-deep.test.ts and internal-auth.test.ts.
vi.mock("./mcp.js", () => {
  const { Hono } = require("hono");
  return { mcpRoute: new Hono() };
});

beforeAll(() => {
  process.env.ADMIN_SECRET =
    "unit-test-admin-secret-plenty-of-entropy-0123456789";
  process.env.AUDIT_HMAC_SECRET =
    "unit-test-audit-secret-plenty-of-entropy-0123456789";
  // wallet.ts throws at module-load if FRONTEND_URL is absent; app.ts
  // imports wallet.ts transitively, so the test needs this set before
  // loadApp() triggers the import chain.
  process.env.FRONTEND_URL = process.env.FRONTEND_URL ?? "http://test.local";
});

async function loadApp() {
  const { app } = await import("./../app.js");
  return app;
}

describe("GET /v1/transactions/:id — F-A-005 redaction", () => {
  it("unauth GET on free-tier transaction returns redacted envelope", async () => {
    const app = await loadApp();
    const res = await app.request(
      `/v1/transactions/${MOCK_FREE_TIER_ROW.id}`,
      // No Authorization header — triggers the unauth branch.
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    // F-A-005 redaction markers present
    expect(body.body_redacted).toBe(true);
    expect(typeof body.body_redacted_reason).toBe("string");
    expect(body.body_redacted_reason.length).toBeGreaterThan(0);

    // PII fields absent from the response envelope
    expect(body.input).toBeUndefined();
    expect(body.output).toBeUndefined();
    expect(body.error).toBeUndefined();
    expect(body.provenance).toBeUndefined();
    expect(body.audit_trail).toBeUndefined();

    // Non-PII metadata fields present
    expect(body.id).toBe(MOCK_FREE_TIER_ROW.id);
    expect(body.capability_slug).toBe("dns-lookup");
    expect(body.type).toBe("capability");
    expect(body.status).toBe("completed");
    expect(body.price_cents).toBe(0);
    expect(body.latency_ms).toBe(12);
    expect(body.transparency_marker).toBe("algorithmic");
    expect(body.data_jurisdiction).toBe("EU");
    expect(body.is_free_tier).toBe(true);
    expect(body.quality).toBeDefined();
    expect(typeof body.quality.sqs).toBe("number");
  });
});

describe("POST /v1/transactions/:id/audit-token — F-A-006 re-issue", () => {
  // The re-issue endpoint requires authMiddleware. Testing the ownership /
  // happy-path cases requires mocking the users table lookup with a valid
  // API key row, which diverges from the shared getDb mock. Those cases
  // are covered by deploy-time spot-checks F/G/H per F-A-006/007.b
  // verification. What's unit-tested here: the pre-auth 401 path (no
  // Authorization header → rejected before any handler logic runs).
  it("returns 401 when Authorization header is absent", async () => {
    const app = await loadApp();
    const res = await app.request(
      `/v1/transactions/${MOCK_FREE_TIER_ROW.id}/audit-token`,
      { method: "POST" },
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error_code).toBe("unauthorized");
  });

  it("returns 401 for malformed Authorization (not 500, not 400)", async () => {
    const app = await loadApp();
    const res = await app.request(
      `/v1/transactions/${MOCK_FREE_TIER_ROW.id}/audit-token`,
      {
        method: "POST",
        headers: { Authorization: "NotBearer something" },
      },
    );
    expect(res.status).toBe(401);
  });
});
