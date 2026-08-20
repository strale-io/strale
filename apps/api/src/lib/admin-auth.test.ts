/**
 * WP0 §3 (CR-10) — ADMIN_SECRET strength floor.
 *
 * Discriminating property: pre-fix, `isAdminSecretUsable` did not exist and a
 * one-character ADMIN_SECRET authenticated every admin surface, including
 * /v1/admin/external-transactions (raw customer input/output). The weak-secret
 * cases below therefore fail pre-fix.
 */

import { describe, it, expect } from "vitest";
import { isAdminSecretUsable, ADMIN_SECRET_MIN_LENGTH } from "./admin-auth.js";

describe("admin secret strength floor", () => {
  it("matches the AUDIT_HMAC_SECRET floor already enforced elsewhere", () => {
    expect(ADMIN_SECRET_MIN_LENGTH).toBe(32);
  });

  it("rejects unset, empty and trivially short secrets", () => {
    expect(isAdminSecretUsable(undefined)).toBe(false);
    expect(isAdminSecretUsable("")).toBe(false);
    expect(isAdminSecretUsable("x")).toBe(false);
    expect(isAdminSecretUsable("admin")).toBe(false);
    expect(isAdminSecretUsable("hunter2")).toBe(false);
  });

  it("rejects a secret one character below the floor", () => {
    expect(isAdminSecretUsable("a".repeat(ADMIN_SECRET_MIN_LENGTH - 1))).toBe(
      false,
    );
  });

  it("accepts a secret at and above the floor", () => {
    expect(isAdminSecretUsable("a".repeat(ADMIN_SECRET_MIN_LENGTH))).toBe(true);
    // The deployed production secret is 64 chars (verified read-only before
    // landing this floor), so enforcement cannot lock operators out.
    expect(isAdminSecretUsable("a".repeat(64))).toBe(true);
  });
});
