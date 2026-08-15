/**
 * Block 0083 — the test scheduler must not be entitled to a vendor's entire
 * free allowance.
 *
 * cvrapi.dk documents 50 free lookups per day. quota_cap was also 50, so the
 * scheduler could consume all of it and the one genuinely external call in the
 * 30-day window to 2026-08-15 failed with "quota exceeded". Only
 * internal_test/ci contexts are budget-checked — customer_paid is always ALLOW
 * — so the budget exists to stop US, not to protect customers after the fact.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runMigration0083_danishQuotaHeadroom } from "./startup-migrations.js";

function makeStub(count: number) {
  const captured: unknown[] = [];
  return {
    captured,
    async execute(q: unknown) {
      captured.push(q);
      return { count };
    },
  };
}

describe("Block 0083 — danish-company-data quota headroom", () => {
  it("cuts the test budget and reports the reservation", async () => {
    const stub = makeStub(1);
    const r = await runMigration0083_danishQuotaHeadroom(stub as never);
    expect(r.rows_affected).toBe(1);
    expect(r.outcome).toMatch(/50 to 20/);
  });

  it("is idempotent — a redeploy after retuning is a no-op", async () => {
    const stub = makeStub(0);
    const r = await runMigration0083_danishQuotaHeadroom(stub as never);
    expect(r.rows_affected).toBe(0);
    expect(r.outcome).toMatch(/no change/);
  });

  it("guards on the old value so an operator's retune survives", async () => {
    const stub = makeStub(1);
    await runMigration0083_danishQuotaHeadroom(stub as never);
    const text = JSON.stringify(stub.captured[0]);
    expect(text).toContain("quota_cap");
    expect(text, "must only touch rows still at the old value").toContain("50");
  });

  it("binds no Date or Buffer (DEC-20260504-A bind-encoder shape)", async () => {
    const stub = makeStub(1);
    await runMigration0083_danishQuotaHeadroom(stub as never);
    for (const q of stub.captured) {
      const chunks = (q as { queryChunks?: unknown[] }).queryChunks ?? [];
      expect(chunks.filter((c) => c instanceof Date || Buffer.isBuffer(c))).toEqual([]);
    }
  });

  it("the manifest reserves headroom rather than claiming the vendor's whole allowance", () => {
    // The actual invariant. A future edit that raises quota_cap back to the
    // documented limit re-creates the outage this block fixed.
    const y = readFileSync("../../manifests/danish-company-data.yaml", "utf8");
    const cap = Number(/^quota_cap:\s*(\d+)/m.exec(y)?.[1]);
    const vendor = Number(/^\s*value:\s*(\d+)/m.exec(y.slice(y.indexOf("known_rate_limit")))?.[1]);
    expect(vendor, "vendor limit must be declared").toBe(50);
    expect(cap, "test budget must leave room for customers").toBeLessThan(vendor);
  });
});
