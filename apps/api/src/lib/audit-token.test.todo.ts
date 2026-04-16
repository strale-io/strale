/**
 * Test placeholder for audit-token.ts (F-0-001).
 *
 * Filename ends in `.test.todo.ts` instead of `.test.ts` because vitest is
 * not installed in this workspace (FIX_PHASE_A_verification.md Q3). Phase D
 * will install vitest + wire a `test` script; at that point this file
 * becomes `audit-token.test.ts` and these cases run in CI.
 *
 * Running locally before Phase D:
 *   npx vitest run apps/api/src/lib/audit-token.test.todo.ts
 * (requires `npm i -D vitest` first).
 */

// Import shape is preserved so the test runs unchanged after Phase D.
// import { describe, it, expect } from "vitest";
// import { generateAuditToken, verifyAuditToken } from "./audit-token.js";

/*
describe("audit-token (F-0-001)", () => {
  it("verifyAuditToken returns false for a wrong token of the right length", () => {
    const real = generateAuditToken("txn-123");
    // Flip one hex character — still 32 chars, still valid hex.
    const wrong = (real[0] === "0" ? "1" : "0") + real.slice(1);
    expect(verifyAuditToken("txn-123", wrong)).toBe(false);
  });

  it("verifyAuditToken returns false when token length differs", () => {
    const real = generateAuditToken("txn-123");
    expect(verifyAuditToken("txn-123", real.slice(0, 30))).toBe(false);
    expect(verifyAuditToken("txn-123", real + "00")).toBe(false);
  });

  it("verifyAuditToken returns false for empty/garbage input", () => {
    expect(verifyAuditToken("txn-123", "")).toBe(false);
    expect(verifyAuditToken("txn-123", "not-hex-at-all!!!")).toBe(false);
  });

  it("verifyAuditToken returns true for the real token", () => {
    const real = generateAuditToken("txn-abc");
    expect(verifyAuditToken("txn-abc", real)).toBe(true);
  });

  it("module import throws when AUDIT_HMAC_SECRET is missing", async () => {
    const prev = process.env.AUDIT_HMAC_SECRET;
    delete process.env.AUDIT_HMAC_SECRET;
    // Re-importing with a bust-cache URL forces the module to re-evaluate
    // its top-level assertion.
    await expect(
      import(`./audit-token.js?missing=${Date.now()}`),
    ).rejects.toThrow(/AUDIT_HMAC_SECRET/);
    process.env.AUDIT_HMAC_SECRET = prev;
  });

  it("module import throws when AUDIT_HMAC_SECRET is too short", async () => {
    const prev = process.env.AUDIT_HMAC_SECRET;
    process.env.AUDIT_HMAC_SECRET = "tooshort";
    await expect(
      import(`./audit-token.js?short=${Date.now()}`),
    ).rejects.toThrow(/at least 32 characters/);
    process.env.AUDIT_HMAC_SECRET = prev;
  });
});
*/

export {};
