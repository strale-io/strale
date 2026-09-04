/**
 * Regression coverage for the drizzle-orm 0.44+ query-error wrapper (PR
 * #510 follow-up, 2026-09-04 — see db-error.ts's own doc comment for the
 * incident). These tests are the fail-first evidence: run against
 * pre-fix `account-service.ts`/`app.ts` (which read `.code`/`.message`
 * directly) this module did not exist at all, so its own unit tests are
 * new — they prove the wrapper's actual shape and this module's
 * behaviour against it, independent of any call site.
 */

import { describe, it, expect } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { unwrapDbError, pgErrorCode, dbErrorMessage, wasWrapped } from "./db-error.js";

function pgError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

/**
 * Shapes an error the way postgres-js's real `PostgresError` looks: a
 * SQLSTATE `code` PLUS the `severity`/`routine` fields postgres-js always
 * sets. This is what the fallback (non-`DrizzleQueryError`) unwrap
 * heuristic in db-error.ts requires since the round-three narrowing —
 * a bare `{ code }` is no longer enough (see the `EPIPE`/`EINTR`
 * rejected-shape test below for why).
 */
function postgresLikeError(message: string, code: string): Error {
  return Object.assign(new Error(message), {
    name: "PostgresError",
    code,
    severity: "ERROR",
    routine: "errorFinish",
  });
}

describe("db-error", () => {
  describe("unwrapDbError", () => {
    it("unwraps a real DrizzleQueryError down to its cause", () => {
      const inner = pgError(
        "duplicate key value violates unique constraint \"users_email_key\"",
        "23505",
      );
      const wrapped = new DrizzleQueryError("insert into users ...", [], inner);
      expect(unwrapDbError(wrapped)).toBe(inner);
    });

    it("passes an unwrapped (plain) error through unchanged", () => {
      const plain = pgError("duplicate key value violates unique constraint", "23505");
      expect(unwrapDbError(plain)).toBe(plain);

      const generic = new Error("something else entirely");
      expect(unwrapDbError(generic)).toBe(generic);
    });

    it("unwraps a non-DrizzleQueryError object shaped like the wrapper (cause is a PostgresError-like SQLSTATE)", () => {
      const inner = postgresLikeError("foreign key violation", "23503");
      const lookalike = Object.assign(new Error("Failed query: ..."), { cause: inner });
      expect(unwrapDbError(lookalike)).toBe(inner);
    });

    it("unwraps a non-DrizzleQueryError lookalike when the cause is named PostgresError even without severity/routine", () => {
      const inner = Object.assign(new Error("dup"), { name: "PostgresError", code: "23505" });
      const lookalike = Object.assign(new Error("Failed query: ..."), { cause: inner });
      expect(unwrapDbError(lookalike)).toBe(inner);
    });

    it("does not unwrap when cause is not SQLSTATE-shaped and is not a real DrizzleQueryError", () => {
      const withNonDbCause = Object.assign(new Error("outer"), {
        cause: new Error("inner, but no code at all"),
      });
      expect(unwrapDbError(withNonDbCause)).toBe(withNonDbCause);
    });

    // Round three (rejected shape): the fallback heuristic previously
    // unwrapped ANY object with a cause.code matching the 5-char SQLSTATE
    // regex — but Node system error codes like "EPIPE" and "EINTR" are
    // ALSO exactly 5 uppercase letters, so a plain wrapper around an
    // unrelated Node error (nothing to do with Postgres) was silently
    // misidentified as a DB wrapper and unwrapped. Fails against the
    // pre-narrowing heuristic (which returns `epipeErr`, not
    // `withEpipeCause`); passes once the heuristic also requires a
    // PostgresError-like shape (name, or severity/routine alongside the
    // code).
    it("does NOT unwrap a lookalike whose cause carries a Node system error code (EPIPE), not a real Postgres SQLSTATE", () => {
      const epipeErr = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
      const withEpipeCause = Object.assign(new Error("Failed query: ..."), { cause: epipeErr });
      expect(unwrapDbError(withEpipeCause)).toBe(withEpipeCause);
    });

    it("does NOT unwrap a lookalike whose cause carries EINTR", () => {
      const eintrErr = Object.assign(new Error("interrupted"), { code: "EINTR" });
      const withEintrCause = Object.assign(new Error("Failed query: ..."), { cause: eintrErr });
      expect(unwrapDbError(withEintrCause)).toBe(withEintrCause);
    });

    it("passes through non-objects (null, undefined, string, number) unchanged", () => {
      expect(unwrapDbError(null)).toBeNull();
      expect(unwrapDbError(undefined)).toBeUndefined();
      expect(unwrapDbError("plain string")).toBe("plain string");
      expect(unwrapDbError(42)).toBe(42);
    });

    it("is bounded against a cyclic cause chain", () => {
      const a: { message: string; cause?: unknown; code?: string } = {
        message: "a",
        code: "23505",
      };
      const b: { message: string; cause?: unknown; code?: string } = {
        message: "b",
        code: "23505",
      };
      a.cause = b;
      b.cause = a; // cycle
      // Must terminate (not hang) and return SOME finite result.
      const result = unwrapDbError(a);
      expect(result === a || result === b).toBe(true);
    });

    it("stops after MAX_UNWRAP_DEPTH steps on a long (non-cyclic) SQLSTATE-cause chain", () => {
      // Build a chain of 10 SQLSTATE-carrying wrappers, deeper than the bound.
      let deepest: { message: string; code: string; cause?: unknown } = {
        message: "root cause",
        code: "23505",
      };
      for (let i = 0; i < 10; i++) {
        deepest = { message: `layer ${i}`, code: "23505", cause: deepest };
      }
      const result = unwrapDbError(deepest);
      // Did not reach the true root (11 layers deep) — the depth bound fired.
      expect(result).not.toEqual({ message: "root cause", code: "23505" });
    });
  });

  describe("pgErrorCode", () => {
    it("returns the SQLSTATE of the unwrapped error", () => {
      const inner = pgError("duplicate key value violates unique constraint", "23505");
      const wrapped = new DrizzleQueryError("q", [], inner);
      expect(pgErrorCode(wrapped)).toBe("23505");
    });

    it("returns the SQLSTATE directly for an unwrapped error", () => {
      expect(pgErrorCode(pgError("fk violation", "23503"))).toBe("23503");
    });

    it("returns undefined when there is no SQLSTATE-shaped code", () => {
      expect(pgErrorCode(new Error("plain"))).toBeUndefined();
      expect(pgErrorCode(Object.assign(new Error("bad code"), { code: "NOTSQL" }))).toBeUndefined();
      expect(pgErrorCode(null)).toBeUndefined();
    });
  });

  describe("dbErrorMessage", () => {
    it("gives the inner message, not the wrapper's generic 'Failed query' text", () => {
      const inner = pgError(
        "duplicate key value violates unique constraint \"users_email_key\"",
        "23505",
      );
      const wrapped = new DrizzleQueryError("insert into users (email) values ($1)", ["a@b.com"], inner);
      expect(wrapped.message).toMatch(/^Failed query:/); // sanity: the wrapper really is generic
      expect(dbErrorMessage(wrapped)).toBe(inner.message);
      expect(dbErrorMessage(wrapped)).not.toMatch(/^Failed query:/);
    });

    it("falls back to String(err) for a non-Error unwrapped value", () => {
      expect(dbErrorMessage("just a string")).toBe("just a string");
      expect(dbErrorMessage(null)).toBe("null");
    });
  });

  describe("wasWrapped", () => {
    it("is true only when unwrapping actually peeled a layer off", () => {
      const inner = pgError("dup", "23505");
      const wrapped = new DrizzleQueryError("q", [], inner);
      expect(wasWrapped(wrapped)).toBe(true);
      expect(wasWrapped(inner)).toBe(false);
      expect(wasWrapped(new Error("plain"))).toBe(false);
    });
  });
});
