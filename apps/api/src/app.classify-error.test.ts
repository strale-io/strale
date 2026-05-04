/**
 * Tests for the global error classifier in app.ts.
 *
 * The classifier exists because the PR-43 incident (do.ts
 * spendCapWouldExceed Date-encoding bug) sat silent in production for
 * 4 days — every 500 logged as plain "[unhandled]" and the underlying
 * cause was indistinguishable from any other generic failure. The
 * classifier surfaces error_class + pg_code in structured logs so a
 * sudden surge of `db_bind_encoder` entries (or `db_lock_timeout`,
 * `db_unique_violation`, etc.) is alertable, while keeping the
 * client-facing response generic.
 */

import { describe, it, expect } from "vitest";
import { classifyError } from "./app.js";

function withCode(message: string, code: string): Error {
  const err = new Error(message) as Error & { code?: string };
  err.code = code;
  return err;
}

function fakePostgresBindEncoderError(): Error {
  // The exact shape postgres-js produces when a Date reaches the bind
  // encoder via the sql-template path. Reproduced from the production
  // log entries on 2026-05-04 before the fix landed.
  const err = new TypeError(
    'The "string" argument must be of type string or an instance of Buffer or ArrayBuffer. Received an instance of Date',
  );
  err.stack = [
    "TypeError [ERR_INVALID_ARG_TYPE]: ...",
    "    at Function.byteLength (node:buffer:776:11)",
    "    at Function.str (postgres/src/bytes.js:22:27)",
    "    at Bind (postgres/src/connection.js:954:16)",
    "    at prepared (postgres/src/connection.js:209:7)",
    "    at ParameterDescription (postgres/src/connection.js:633:58)",
  ].join("\n");
  return err;
}

describe("classifyError", () => {
  it("classifies the bind-encoder Date failure (PR-43 incident shape)", () => {
    const err = fakePostgresBindEncoderError();
    expect(classifyError(err)).toEqual({ error_class: "db_bind_encoder" });
  });

  it("maps known SQLSTATEs to specific buckets", () => {
    expect(classifyError(withCode("dup", "23505"))).toEqual({
      error_class: "db_unique_violation",
      pg_code: "23505",
    });
    expect(classifyError(withCode("fk", "23503"))).toEqual({
      error_class: "db_foreign_key_violation",
      pg_code: "23503",
    });
    expect(classifyError(withCode("lock timeout", "55P03"))).toEqual({
      error_class: "db_lock_timeout",
      pg_code: "55P03",
    });
    expect(classifyError(withCode("idle tx timeout", "25P03"))).toEqual({
      error_class: "db_idle_in_tx_timeout",
      pg_code: "25P03",
    });
    expect(classifyError(withCode("deadlock", "40P01"))).toEqual({
      error_class: "db_deadlock",
      pg_code: "40P01",
    });
    expect(classifyError(withCode("col missing", "42703"))).toEqual({
      error_class: "db_undefined_column",
      pg_code: "42703",
    });
  });

  it("falls through to db_unknown for SQLSTATEs not in the known table", () => {
    expect(classifyError(withCode("oddball", "9ZZZZ"))).toEqual({
      error_class: "db_unknown",
      pg_code: "9ZZZZ",
    });
  });

  it("ignores garbage `code` fields that aren't 5-char SQLSTATE", () => {
    const err = new Error("nope") as Error & { code?: string };
    err.code = "ENOTSQLSTATE";
    expect(classifyError(err)).toEqual({ error_class: "unknown" });
  });

  it("classifies AbortError (client cancelled / hard timeout)", () => {
    const err = new Error("operation aborted");
    err.name = "AbortError";
    expect(classifyError(err)).toEqual({ error_class: "request_aborted" });
  });

  it("classifies Zod validation failures", () => {
    const err = new Error("issue");
    err.name = "ZodError";
    expect(classifyError(err)).toEqual({ error_class: "validation_error" });
  });

  it("returns 'unknown' for genuinely unknown shapes", () => {
    const err = new Error("something went sideways");
    expect(classifyError(err)).toEqual({ error_class: "unknown" });
  });
});
