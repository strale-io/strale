/**
 * WP0 §3 (CR-14 / N2) — demand signals must not republish customer text.
 *
 * `failed_requests.task` is free text submitted by the caller. It captures
 * genuine unmet demand, but equally captures input fumbles where the text is
 * the payload the caller meant to send — a company name, a person, an email, a
 * document URL. GET /v1/demand-signals returned that text verbatim
 * (`task_normalized`), unauthenticated and with `Cache-Control: public`.
 * Production held 3,426 rows.
 *
 * Discriminating property: pre-fix the anonymous request returned 200 with a
 * signals array. The aggregate /categories endpoint must stay public — a test
 * that simply locked the whole router behind auth would pass while breaking
 * the legitimate public surface, so both halves are asserted.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    execute: () => Promise.resolve([]),
  }),
}));

beforeAll(async () => {
  process.env.ADMIN_SECRET =
    "unit-test-admin-secret-plenty-of-entropy-0123456789";
  // Warm the module graph here rather than inside the first test — the cold
  // transform alone can exceed the per-test timeout, which would fail the
  // test for a reason unrelated to what it asserts.
  await loadRoute();
});

async function loadRoute() {
  const { demandSignalsRoute } = await import("./demand-signals.js");
  return demandSignalsRoute;
}

describe("GET /v1/demand-signals", () => {
  it("refuses anonymous access to verbatim customer task text", async () => {
    const route = await loadRoute();
    const res = await route.request("/");
    expect(res.status).toBe(401);

    // And the refusal must not itself leak a sample of the data.
    const body = await res.text();
    expect(body).not.toContain("task_normalized");
    expect(body).not.toContain("signals");
  });

  it("serves the verbatim listing to an authenticated admin", async () => {
    const route = await loadRoute();
    const res = await route.request("/", {
      headers: { Authorization: `Bearer ${process.env.ADMIN_SECRET}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty("signals");
  });

  it("keeps the aggregate /categories endpoint public", async () => {
    // Category counts carry no customer-authored text, and this is the half
    // of the surface that is safe to publish. Locking the whole router would
    // be over-containment.
    const route = await loadRoute();
    const res = await route.request("/categories");
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty("categories");
  });
});
