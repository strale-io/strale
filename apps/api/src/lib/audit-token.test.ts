/**
 * Tests for audit-token.ts (F-0-001).
 *
 * The module's top-level `requireAuditSecret()` throws when
 * AUDIT_HMAC_SECRET is unset or shorter than 32 chars. Rather than
 * cache-bust `import("./audit-token.js?...")` (which Vite refuses —
 * non-literal dynamic import), the assertion is exercised by calling
 * `requireAuditSecret` directly with explicit env arguments. Behaviour
 * is identical because the top-level caller delegates to the same
 * function.
 */

import { describe, it, expect } from "vitest";
import {
  generateAuditToken,
  verifyAuditToken,
  requireAuditSecret,
} from "./audit-token.js";

describe("requireAuditSecret (F-0-001 assertion)", () => {
  it("throws when the env value is undefined", () => {
    expect(() => requireAuditSecret(undefined)).toThrow(/AUDIT_HMAC_SECRET/);
  });

  it("throws when the env value is an empty string", () => {
    expect(() => requireAuditSecret("")).toThrow(/AUDIT_HMAC_SECRET/);
  });

  it("throws when shorter than 32 chars", () => {
    expect(() => requireAuditSecret("tooshort")).toThrow(/at least 32 characters/);
    expect(() => requireAuditSecret("a".repeat(31))).toThrow(/at least 32 characters/);
  });

  it("accepts a 32-char secret", () => {
    expect(requireAuditSecret("a".repeat(32))).toBe("a".repeat(32));
  });

  it("accepts a realistic 64-char hex secret", () => {
    const realistic = "unit-test-secret-plenty-of-entropy-0123456789abcdef";
    expect(requireAuditSecret(realistic)).toBe(realistic);
  });
});

describe("verifyAuditToken (F-0-001, timingSafeEqual guard)", () => {
  it("accepts a correctly-minted token for the same transaction id", () => {
    const token = generateAuditToken("txn-abc");
    expect(verifyAuditToken("txn-abc", token)).toBe(true);
  });

  it("rejects a wrong token of the same length", () => {
    const real = generateAuditToken("txn-abc");
    // Flip the first hex char to something guaranteed different.
    const flipped = (real[0] === "0" ? "1" : "0") + real.slice(1);
    expect(verifyAuditToken("txn-abc", flipped)).toBe(false);
  });

  it("rejects a token with a different length (would crash timingSafeEqual otherwise)", () => {
    const real = generateAuditToken("txn-abc");
    expect(verifyAuditToken("txn-abc", real.slice(0, 30))).toBe(false);
    expect(verifyAuditToken("txn-abc", real + "00")).toBe(false);
  });

  it("rejects empty and non-hex input without throwing", () => {
    expect(verifyAuditToken("txn-abc", "")).toBe(false);
    // Buffer.from("zz…", "hex") returns an empty buffer when the whole
    // string is non-hex, not a throw. Our length guard still catches it.
    expect(verifyAuditToken("txn-abc", "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz")).toBe(false);
  });

  it("rejects a token minted for a different transaction id", () => {
    const tokenForA = generateAuditToken("txn-a");
    expect(verifyAuditToken("txn-b", tokenForA)).toBe(false);
  });
});
