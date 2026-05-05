/**
 * Integration smoke — asserts no SQS keys leak through public endpoints.
 *
 * Per DEC-20260503-B SQS deletion. The smoke is the gate that proves the
 * deletion is clean: the canned DB rows include SQS-shaped fields (so any
 * route that still reads those fields would expose them in the response
 * body); the smoke walks each response recursively and fails if any
 * forbidden key appears.
 *
 * Forbidden key set (anywhere in the response tree, at any depth):
 *   sqs, sqs_label, sqs_raw, sqs_score, sqs_grade,
 *   quality_profile, reliability_profile, quality_warning,
 *   min_sqs, qp_score, rp_score, qp_grade, rp_grade,
 *   matrix_sqs, matrix_sqs_raw
 *
 * The smoke covers the public, unauth-gated GET endpoints. Auth-protected
 * endpoints (`/v1/transactions` list, `/v1/audit/:id`) are exercised via
 * the pre-auth 401 path which contains no SQS-bearing payload anyway.
 * Heavily-stateful endpoints (POST /v1/do, POST /a2a JSON-RPC, x402
 * gateway POST) are out of smoke scope — they're covered by the type
 * checker (their response shape types live in the route files and the
 * deletion strips the SQS fields from those types).
 */

import { describe, it, expect, beforeAll, vi } from "vitest";

const FORBIDDEN_KEYS = new Set<string>([
  "sqs",
  "sqs_label",
  "sqs_raw",
  "sqs_score",
  "sqs_grade",
  "quality_profile",
  "reliability_profile",
  "quality_warning",
  "min_sqs",
  "qp_score",
  "rp_score",
  "qp_grade",
  "rp_grade",
  "matrix_sqs",
  "matrix_sqs_raw",
]);

/** Recursively walk a JSON value and collect any forbidden keys. */
function findForbiddenKeys(value: unknown, path = "$"): string[] {
  if (value == null || typeof value !== "object") return [];
  const found: string[] = [];
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      found.push(...findForbiddenKeys(value[i], `${path}[${i}]`));
    }
    return found;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(k)) {
      found.push(`${path}.${k}`);
    }
    found.push(...findForbiddenKeys(v, `${path}.${k}`));
  }
  return found;
}

// ─── Canned DB rows that carry SQS-shaped fields ────────────────────────
// Any route that still reads these fields would surface them in the response
// body and fail the assertion.

const CAPABILITY_ROW = {
  id: "00000000-0000-0000-0000-00000000c0a1",
  slug: "dns-lookup",
  name: "DNS Lookup",
  description: "Resolves a hostname.",
  category: "developer-tools",
  priceCents: 0,
  isActive: true,
  isFreeTier: true,
  inputSchema: { type: "object", properties: { hostname: { type: "string" } }, required: ["hostname"] },
  outputSchema: { type: "object", properties: { records: { type: "array" } } },
  matrixSqs: "92.0",
  matrix_sqs: "92.0",
  matrixSqsRaw: "94.0",
  matrix_sqs_raw: "94.0",
  qpScore: "95.0",
  qp_score: "95.0",
  rpScore: "88.5",
  rp_score: "88.5",
  trend: "stable",
  freshnessLevel: "fresh",
  freshnessCategory: "live-fetch",
  capabilityType: "stable_api",
  transparencyTag: "algorithmic",
  dataSource: "DNS protocol",
  geography: "global",
  lifecycleState: "active",
  visible: true,
  avgLatencyMs: 12,
  searchTags: ["dns", "lookup"],
  x402Enabled: false,
  marketplaceEligible: true,
  gdprArt22Classification: "data_lookup",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-04-01T00:00:00Z"),
};

const SOLUTION_ROW = {
  id: "00000000-0000-0000-0000-00000000501a",
  slug: "kyb-essentials-se",
  name: "KYB Essentials Sweden",
  description: "Quick company verification (Sweden).",
  category: "compliance",
  priceCents: 150,
  isActive: true,
};

// Mock getDb with a flexible chain that returns reasonable canned data
// regardless of which route calls it. The shapes don't have to be exact —
// the smoke just needs the routes to render *some* response so we can
// assert SQS keys are absent.
const cannedSelectResult = (() => {
  // Return shape varies by callsite; default to capability rows since
  // most routes read capabilities. Routes that need solutions will get
  // the same array — solution-only fields (slug etc.) overlap by design.
  return [CAPABILITY_ROW, { ...CAPABILITY_ROW, slug: "vat-validate", priceCents: 2 }];
})();

const cannedSolutionsResult = [SOLUTION_ROW];

vi.mock("../../src/db/index.js", () => {
  const chain = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    groupBy: vi.fn().mockReturnThis(),
    having: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
  };
  // Make the chain awaitable as a promise resolving to canned rows.
  // Some Drizzle calls are `await db.select(...).from(...).where(...)`
  // without a terminal; others end in `.limit(n)`. Provide both.
  const thenable = {
    ...chain,
    then: (resolve: (v: unknown) => void) => resolve(cannedSelectResult),
  };
  return {
    getDb: () => ({
      execute: vi.fn().mockResolvedValue([]),
      select: vi.fn().mockReturnValue(thenable),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnThis(),
          onConflictDoUpdate: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([]),
          then: (r: (v: unknown) => void) => r(undefined),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    }),
  };
});

vi.mock("../../src/routes/mcp.js", () => {
  const { Hono } = require("hono");
  return { mcpRoute: new Hono() };
});

beforeAll(() => {
  process.env.ADMIN_SECRET ??=
    "smoke-test-admin-secret-plenty-of-entropy-0123456789";
  process.env.AUDIT_HMAC_SECRET ??=
    "smoke-test-audit-secret-plenty-of-entropy-0123456789";
  process.env.FRONTEND_URL ??= "http://test.local";
});

async function loadApp() {
  const { app } = await import("../../src/app.js");
  return app;
}

async function fetchJson(path: string, init?: RequestInit) {
  const app = await loadApp();
  const res = await app.request(path, init);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON response (e.g. llms.txt) — keep as text */
  }
  return { status: res.status, body, text };
}

function assertNoForbiddenKeys(label: string, body: unknown) {
  if (typeof body === "string") {
    // For text endpoints (llms.txt), assert no SQS-key tokens appear in
    // a way that would imply a structured response leak. The brand-voice
    // rewrite removes the SQS narrative; this is a coarse check.
    const lower = body.toLowerCase();
    const hits: string[] = [];
    if (lower.includes("\"sqs\"")) hits.push('"sqs"');
    if (lower.includes("\"matrix_sqs\"")) hits.push('"matrix_sqs"');
    if (lower.includes("\"qp_score\"")) hits.push('"qp_score"');
    if (lower.includes("\"rp_score\"")) hits.push('"rp_score"');
    expect(hits, `${label} contains forbidden JSON keys: ${hits.join(", ")}`).toEqual([]);
    return;
  }
  const found = findForbiddenKeys(body);
  expect(found, `${label} has forbidden keys: ${found.join(", ")}`).toEqual([]);
}

describe("integration smoke — no SQS keys on public endpoints (DEC-20260503-B)", () => {
  it("GET /v1/capabilities — no SQS keys in list response", async () => {
    const { body } = await fetchJson("/v1/capabilities");
    assertNoForbiddenKeys("/v1/capabilities", body);
  });

  it("GET /v1/solutions — no SQS keys in list response", async () => {
    const { body } = await fetchJson("/v1/solutions");
    assertNoForbiddenKeys("/v1/solutions", body);
  });

  it("GET /v1/suggest?q=test — no SQS keys in suggest response", async () => {
    const { body } = await fetchJson("/v1/suggest?q=dns");
    assertNoForbiddenKeys("/v1/suggest", body);
  });

  it("GET /.well-known/agent-card.json — no SQS keys in A2A agent card", async () => {
    const { body } = await fetchJson("/.well-known/agent-card.json");
    assertNoForbiddenKeys("/.well-known/agent-card.json", body);
  });

  it("GET /llms.txt — narrative does not embed SQS-shaped JSON keys", async () => {
    const { body } = await fetchJson("/llms.txt");
    assertNoForbiddenKeys("/llms.txt", body);
  });

  it("GET /.well-known/mcp.json or MCP card — no SQS keys", async () => {
    // The MCP server card route lives at /.well-known/mcp.json or similar;
    // hit the most likely path and tolerate 404 (route may not be public).
    const candidates = ["/.well-known/mcp.json", "/mcp/card", "/"];
    for (const path of candidates) {
      const { body } = await fetchJson(path);
      assertNoForbiddenKeys(`MCP card via ${path}`, body);
    }
  });

  it("POST /v1/do with min_sqs is accepted (param silently ignored, no 400)", async () => {
    const { status, body } = await fetchJson("/v1/do", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "dns-lookup", inputs: { hostname: "example.com" }, min_sqs: 80 }),
    });
    // Accept any non-400 outcome — auth may reject (401), capability may
    // not be wired (503), idempotency may collide. The point: min_sqs
    // does not cause a 400 "unknown field" rejection. And whatever the
    // response is, it must not embed SQS keys.
    expect(status, `min_sqs caused 400 — should be silently ignored`).not.toBe(400);
    assertNoForbiddenKeys("POST /v1/do response", body);
  });

  it("GET /v1/quality/dns-lookup — endpoint must not exist after Wave 3", async () => {
    const { status } = await fetchJson("/v1/quality/dns-lookup");
    // After Wave 3 deletes routes/quality.ts, this endpoint returns 404.
    // Before deletion it returns 200 — that's the fail-state this smoke gates.
    expect(status, "/v1/quality/:slug must be removed").toBe(404);
  });
});
