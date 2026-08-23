/**
 * WP11 / CR-10 — the parts of proof-before-rotation that are decidable without
 * a database.
 *
 * The behaviour that matters (issue, redeem once, rotate) depends on
 * conditional UPDATEs and transaction isolation, so it is proved against a
 * real Postgres in `account-lifecycle.integration.test.ts`. What is left here
 * is the token's own shape and the email comparison, both of which are cheap
 * to get subtly wrong.
 */

import { describe, expect, it } from "vitest";

import {
  emailsMatch,
  generateRecoveryToken,
  hashRecoveryToken,
  RECOVERY_TOKEN_TTL_MINUTES,
} from "./key-recovery.js";

describe("recovery tokens", () => {
  it("is 256 bits of entropy, so guessing is not a threat model", () => {
    expect(generateRecoveryToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateRecoveryToken()));
    expect(seen.size).toBe(200);
  });

  it("is stored hashed, so table read access does not confer account takeover", () => {
    const token = generateRecoveryToken();
    const hash = hashRecoveryToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(token);
    expect(hashRecoveryToken(token)).toBe(hash);
  });

  it("expires in well under a day", () => {
    // A recovery code that lives for days is a standing credential in a
    // mailbox. The exact number is a judgement call; the bound is not.
    expect(RECOVERY_TOKEN_TTL_MINUTES).toBeLessThanOrEqual(60);
    expect(RECOVERY_TOKEN_TTL_MINUTES).toBeGreaterThan(0);
  });
});

describe("emailsMatch", () => {
  it("matches ignoring case and surrounding whitespace", () => {
    expect(emailsMatch("  Person@Example.com ", "person@example.com")).toBe(true);
  });

  it("does not match different addresses", () => {
    expect(emailsMatch("a@example.com", "b@example.com")).toBe(false);
  });

  it("does not match a prefix", () => {
    // timingSafeEqual throws on length mismatch; the length guard has to come
    // first or a shorter candidate crashes the redemption instead of failing it.
    expect(emailsMatch("a@example.com", "a@example.co")).toBe(false);
    expect(emailsMatch("", "a@example.com")).toBe(false);
  });
});
