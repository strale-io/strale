/**
 * Tests for the /v1/internal/* auth boundary and the /v1/public/ops/*
 * allowlist (F-0-003).
 *
 * These exercise the mount-level middleware in app.ts, not individual
 * handlers. The underlying handlers hit the DB, which isn't available
 * in unit tests — so each test stops at the FIRST middleware that
 * rejects the request (401 for admin, 404 for unlisted public, etc.).
 * That's exactly the invariant we need to cover: F-0-003 is about the
 * MOUNT boundary, not the handlers themselves.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";

// Mock the DB layer — handlers that do get past the mount middleware
// try to call it. We don't want these tests to need a live Postgres.
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
}));

// Mock the MCP HTTP route — it imports from the `strale-mcp/tools` workspace
// package which vitest's resolver can't find without a prior build. We aren't
// exercising /mcp in these tests, but app.ts imports it at module-load, so
// a stub is needed to get past the import.
vi.mock("./mcp.js", () => {
  const { Hono } = require("hono");
  return { mcpRoute: new Hono() };
});

const ADMIN_TOKEN = "unit-test-admin-secret-plenty-of-entropy-0123456789";

beforeAll(() => {
  process.env.ADMIN_SECRET = ADMIN_TOKEN;
  process.env.AUDIT_HMAC_SECRET =
    "unit-test-audit-secret-plenty-of-entropy-0123456789";
});

async function loadApp() {
  // Dynamic import so the env vars above are in place when module-load
  // assertions (F-0-001 / adminOnly config) evaluate.
  const { app } = await import("./../app.js");
  return app;
}

describe("F-0-003: /v1/internal/* rejects requests without admin auth", () => {
  it("returns 401 for a GET without Authorization header", async () => {
    const app = await loadApp();
    const res = await app.request("/v1/internal/tests/capabilities/email-validate");
    expect(res.status).toBe(401);
  });

  it("returns 401 for a POST admin action without Authorization header", async () => {
    const app = await loadApp();
    const res = await app.request("/v1/internal/tests/run", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for a request with wrong admin secret", async () => {
    const app = await loadApp();
    const res = await app.request("/v1/internal/tests/run", {
      method: "POST",
      headers: { Authorization: "Bearer wrong-secret-value" },
    });
    expect(res.status).toBe(401);
  });

  it("passes the mount gate when admin secret is correct (handler may still 4xx/5xx)", async () => {
    const app = await loadApp();
    const res = await app.request("/v1/internal/tests/run", {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    // The mount gate returned the request into the handler; anything
    // beyond 401 means the gate passed (the DB mock may produce 5xx or
    // the handler's own logic may produce 4xx — either proves the gate
    // isn't the one rejecting).
    expect(res.status).not.toBe(401);
  });
});

describe("F-0-003: /v1/public/ops/* allowlist", () => {
  it("passes the mount gate for an allowlisted dashboard path (GET)", async () => {
    const app = await loadApp();
    const res = await app.request(
      "/v1/public/ops/tests/capabilities/email-validate",
    );
    // Same reasoning as above: gate passed if status != 404.
    expect(res.status).not.toBe(404);
  });

  it("returns 404 for a non-GET method on the dashboard path", async () => {
    const app = await loadApp();
    const res = await app.request(
      "/v1/public/ops/tests/capabilities/email-validate",
      { method: "POST" },
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for a GET to an admin action path (allowlist excludes it)", async () => {
    const app = await loadApp();
    const res = await app.request("/v1/public/ops/tests/run");
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown public-ops path (deny by default)", async () => {
    const app = await loadApp();
    const res = await app.request("/v1/public/ops/tests/secret-backdoor");
    expect(res.status).toBe(404);
  });

  it("returns 404 for a POST attempt on an allowlisted path (method mismatch)", async () => {
    const app = await loadApp();
    const res = await app.request(
      "/v1/public/ops/tests/solutions/kyb-essentials-se",
      { method: "POST" },
    );
    expect(res.status).toBe(404);
  });
});
