/**
 * Regression coverage for the drizzle-orm 0.44+ query-error wrapper hitting
 * `isUniqueViolation` (PR #510 follow-up, 2026-09-04). Pre-fix,
 * `isUniqueViolation` read `err.code` directly; since drizzle-orm wraps
 * `db.transaction()` failures in `DrizzleQueryError`, `.code` lives on
 * `.cause` and the direct read always misses — a duplicate-email race
 * escaped as an unhandled 500 instead of the intended
 * `EmailAlreadyRegisteredError` -> 409.
 */

import { describe, it, expect } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { createAccount, EmailAlreadyRegisteredError } from "./account-service.js";

function wrappedPgError(code: string, message: string) {
  const inner = Object.assign(new Error(message), { code });
  return new DrizzleQueryError("insert into users (email) values ($1)", ["a@b.com"], inner);
}

function fakeDbThatThrowsOnTransaction(err: unknown) {
  return {
    transaction: async () => {
      throw err;
    },
  };
}

const BASE_PARAMS = {
  email: "duplicate@example.com",
  name: null,
  ipHash: null,
  trialIpHash: null,
  grantCents: 0,
  grantDescription: "trial credit",
  channel: "web" as const,
  tosVersion: "v1",
};

describe("account-service isUniqueViolation (wrapped driver errors)", () => {
  it("a wrapped 23505 (unique violation) rejects with EmailAlreadyRegisteredError", async () => {
    const db = fakeDbThatThrowsOnTransaction(
      wrappedPgError("23505", 'duplicate key value violates unique constraint "users_email_key"'),
    );
    await expect(createAccount(db as any, BASE_PARAMS)).rejects.toBeInstanceOf(
      EmailAlreadyRegisteredError,
    );
  });

  it("a wrapped 23503 (foreign key violation) rethrows unchanged, not as a duplicate-email error", async () => {
    const err = wrappedPgError("23503", "insert or update on table violates foreign key constraint");
    const db = fakeDbThatThrowsOnTransaction(err);
    await expect(createAccount(db as any, BASE_PARAMS)).rejects.toBe(err);
  });

  it("an UNWRAPPED 23505 (no drizzle wrapper) still rejects with EmailAlreadyRegisteredError", async () => {
    const plain = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
    });
    const db = fakeDbThatThrowsOnTransaction(plain);
    await expect(createAccount(db as any, BASE_PARAMS)).rejects.toBeInstanceOf(
      EmailAlreadyRegisteredError,
    );
  });
});
