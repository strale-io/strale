/**
 * Tests for audit-token.ts.
 *
 * F-0-001: `requireAuditSecret()` throws on unset / short `AUDIT_HMAC_SECRET`.
 * F-A-006: token carries `expires_at`; verification enforces expiry;
 *          pre-F-A-006 tokens accepted during sunset window.
 * F-A-007: two-key ring verification; optional `AUDIT_HMAC_SECRET_PREVIOUS`
 *          fallback for rotation.
 *
 * Rotation tests use `verifyAuditTokenWithSecrets` (the pure helper) to
 * inject primary/previous secrets without reloading the module (Vite's
 * dynamic-import literal restriction makes cache-busting imports
 * impractical).
 */

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  generateAuditToken,
  verifyAuditToken,
  verifyAuditTokenWithSecrets,
  requireAuditSecret,
  requireAuditSecretPrevious,
  getShareableUrl,
  DEFAULT_TOKEN_TTL_SECONDS,
  LEGACY_TOKEN_SUNSET_MS,
} from "./audit-token.js";

const SECRET_A = "secret-a-plenty-of-entropy-0123456789abcdef";
const SECRET_B = "secret-b-plenty-of-entropy-0123456789abcdef";

function legacySign(transactionId: string, secret: string): string {
  return createHmac("sha256", secret).update(transactionId).digest("hex").substring(0, 32);
}

function newFormatSign(transactionId: string, expiresAt: number, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${transactionId}:${expiresAt}`)
    .digest("hex")
    .substring(0, 32);
}

// ─── F-0-001 (existing coverage, updated to new API) ─────────────────────────

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
});

describe("requireAuditSecretPrevious (F-A-007)", () => {
  it("returns null when the env value is undefined", () => {
    expect(requireAuditSecretPrevious(undefined)).toBe(null);
  });

  it("returns null when the env value is empty", () => {
    expect(requireAuditSecretPrevious("")).toBe(null);
  });

  it("throws when set but shorter than 32 chars", () => {
    expect(() => requireAuditSecretPrevious("tooshort")).toThrow(/32 characters/);
    expect(() => requireAuditSecretPrevious("a".repeat(31))).toThrow(/32 characters/);
  });

  it("accepts a 32-char secret", () => {
    expect(requireAuditSecretPrevious("a".repeat(32))).toBe("a".repeat(32));
  });
});

// ─── F-A-006 (expiry coverage) ───────────────────────────────────────────────

describe("F-A-006: bounded expiry", () => {
  it("generateAuditToken returns token + expiresAt in the future", () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const { token, expiresAt } = generateAuditToken("txn-abc");
    expect(typeof token).toBe("string");
    expect(token.length).toBe(32);
    expect(expiresAt).toBeGreaterThan(nowSeconds);
    expect(expiresAt - nowSeconds).toBeCloseTo(DEFAULT_TOKEN_TTL_SECONDS, -1);
  });

  it("verifies a freshly-issued token via the module's current secret", () => {
    const { token, expiresAt } = generateAuditToken("txn-abc");
    const result = verifyAuditToken("txn-abc", token, expiresAt);
    expect(result.valid).toBe(true);
  });

  it("rejects a token whose expires_at has passed", () => {
    const nowMs = 2_000_000_000 * 1000; // arbitrary future instant
    const expiresAt = Math.floor(nowMs / 1000) + 3600;
    const token = newFormatSign("txn-abc", expiresAt, SECRET_A);
    // Re-evaluate at a later clock where the token has expired
    const laterMs = nowMs + 7200_000;
    const result = verifyAuditTokenWithSecrets("txn-abc", token, expiresAt, SECRET_A, null, laterMs);
    expect(result).toEqual({ valid: false, reason: "expired" });
  });

  it("rejects tampered expires_at (HMAC mismatch after caller bumps the timestamp)", () => {
    const nowMs = 2_000_000_000 * 1000;
    const issuedExpiresAt = Math.floor(nowMs / 1000) + 3600;
    const token = newFormatSign("txn-abc", issuedExpiresAt, SECRET_A);
    const tamperedExpiresAt = issuedExpiresAt + 86400 * 365; // client extends by a year
    const result = verifyAuditTokenWithSecrets(
      "txn-abc",
      token,
      tamperedExpiresAt,
      SECRET_A,
      null,
      nowMs,
    );
    expect(result).toEqual({ valid: false, reason: "invalid_signature" });
  });

  it("returns malformed when expires_at is non-integer / non-finite", () => {
    const result = verifyAuditTokenWithSecrets("txn-abc", "aa".repeat(16), NaN, SECRET_A, null, Date.now());
    expect(result).toEqual({ valid: false, reason: "malformed" });
  });

  it("returns invalid_signature on non-hex token input", () => {
    const nowMs = 2_000_000_000 * 1000;
    const expiresAt = Math.floor(nowMs / 1000) + 3600;
    const result = verifyAuditTokenWithSecrets(
      "txn-abc",
      "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
      expiresAt,
      SECRET_A,
      null,
      nowMs,
    );
    expect(result).toEqual({ valid: false, reason: "invalid_signature" });
  });
});

// ─── Legacy token path (backwards-compat sunset window) ──────────────────────

describe("F-A-006 backwards-compat: legacy tokens", () => {
  it("accepts a legacy token (no expires_at) during the sunset window", () => {
    const preSunsetMs = LEGACY_TOKEN_SUNSET_MS - 86400_000; // one day before
    const legacyToken = legacySign("txn-abc", SECRET_A);
    const result = verifyAuditTokenWithSecrets(
      "txn-abc",
      legacyToken,
      null,
      SECRET_A,
      null,
      preSunsetMs,
    );
    expect(result).toEqual({ valid: true, legacy: true });
  });

  it("rejects a legacy token after the sunset date", () => {
    const postSunsetMs = LEGACY_TOKEN_SUNSET_MS + 86400_000; // one day after
    const legacyToken = legacySign("txn-abc", SECRET_A);
    const result = verifyAuditTokenWithSecrets(
      "txn-abc",
      legacyToken,
      null,
      SECRET_A,
      null,
      postSunsetMs,
    );
    expect(result).toEqual({ valid: false, reason: "legacy_token_sunset" });
  });

  it("rejects a legacy token signed with the wrong secret", () => {
    const preSunsetMs = LEGACY_TOKEN_SUNSET_MS - 86400_000;
    const legacyTokenForB = legacySign("txn-abc", SECRET_B);
    const result = verifyAuditTokenWithSecrets(
      "txn-abc",
      legacyTokenForB,
      null,
      SECRET_A,
      null,
      preSunsetMs,
    );
    expect(result).toEqual({ valid: false, reason: "invalid_signature" });
  });

  it("accepts a legacy token signed with the previous secret (rotation + legacy combined)", () => {
    const preSunsetMs = LEGACY_TOKEN_SUNSET_MS - 86400_000;
    const legacyTokenForPrev = legacySign("txn-abc", SECRET_B);
    const result = verifyAuditTokenWithSecrets(
      "txn-abc",
      legacyTokenForPrev,
      null,
      SECRET_A,
      SECRET_B,
      preSunsetMs,
    );
    expect(result).toEqual({ valid: true, legacy: true, usedFallback: true });
  });
});

// ─── F-A-007 (two-key rotation) ──────────────────────────────────────────────

describe("F-A-007: two-key rotation", () => {
  it("token signed with primary secret verifies via primary path (no usedFallback)", () => {
    const nowMs = 2_000_000_000 * 1000;
    const expiresAt = Math.floor(nowMs / 1000) + 3600;
    const token = newFormatSign("txn-abc", expiresAt, SECRET_A);
    const result = verifyAuditTokenWithSecrets("txn-abc", token, expiresAt, SECRET_A, SECRET_B, nowMs);
    expect(result).toEqual({ valid: true });
  });

  it("token signed with previous secret verifies via fallback path (usedFallback: true)", () => {
    const nowMs = 2_000_000_000 * 1000;
    const expiresAt = Math.floor(nowMs / 1000) + 3600;
    // Rotation scenario: primary is now SECRET_A, previous is SECRET_B.
    // Token was issued under SECRET_B before the rotation.
    const tokenFromPrev = newFormatSign("txn-abc", expiresAt, SECRET_B);
    const result = verifyAuditTokenWithSecrets(
      "txn-abc",
      tokenFromPrev,
      expiresAt,
      SECRET_A,
      SECRET_B,
      nowMs,
    );
    expect(result).toEqual({ valid: true, usedFallback: true });
  });

  it("token signed with neither secret is rejected", () => {
    const nowMs = 2_000_000_000 * 1000;
    const expiresAt = Math.floor(nowMs / 1000) + 3600;
    const SECRET_C = "secret-c-plenty-of-entropy-0123456789abcdef";
    const orphanToken = newFormatSign("txn-abc", expiresAt, SECRET_C);
    const result = verifyAuditTokenWithSecrets(
      "txn-abc",
      orphanToken,
      expiresAt,
      SECRET_A,
      SECRET_B,
      nowMs,
    );
    expect(result).toEqual({ valid: false, reason: "invalid_signature" });
  });

  it("AUDIT_HMAC_SECRET_PREVIOUS unset: only primary path tried", () => {
    const nowMs = 2_000_000_000 * 1000;
    const expiresAt = Math.floor(nowMs / 1000) + 3600;
    const tokenFromPrev = newFormatSign("txn-abc", expiresAt, SECRET_B);
    // previousSecret = null — fallback path skipped
    const result = verifyAuditTokenWithSecrets(
      "txn-abc",
      tokenFromPrev,
      expiresAt,
      SECRET_A,
      null,
      nowMs,
    );
    expect(result).toEqual({ valid: false, reason: "invalid_signature" });
  });
});

// ─── getShareableUrl ─────────────────────────────────────────────────────────

describe("getShareableUrl (F-A-006)", () => {
  it("embeds token + expires_at as query params", () => {
    const { url, expiresAt } = getShareableUrl("txn-abc");
    expect(url).toMatch(/^https:\/\/strale\.dev\/audit\/txn-abc\?token=[0-9a-f]{32}&expires_at=\d+$/);
    expect(url).toContain(`expires_at=${expiresAt}`);
    expect(expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("honours a custom expiresInSeconds override", () => {
    const { url, expiresAt } = getShareableUrl("txn-abc", 3600);
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(expiresAt - nowSeconds).toBeGreaterThanOrEqual(3599);
    expect(expiresAt - nowSeconds).toBeLessThanOrEqual(3601);
    expect(url).toContain(`expires_at=${expiresAt}`);
  });
});
