/**
 * Unwraps drizzle-orm's query-error wrapper so callers can read the real
 * Postgres error underneath.
 *
 * Since drizzle-orm 0.44.0, every query path (`db.execute`, `tx.execute`,
 * the query builder, transactions) rethrows driver errors wrapped in
 * `DrizzleQueryError` (node_modules/drizzle-orm/errors.js): a generic
 * `Failed query: ...\nparams: ...` message, with `query`, `params` and
 * `cause` fields but no `code`. The real Postgres error — SQLSTATE `code`,
 * `detail`, `constraint`, the actual message — is only reachable at
 * `.cause`.
 *
 * PR #510 (drizzle-orm 0.38.4 -> 0.45.2, 2026-09-04) upgraded past that
 * boundary without updating any reader of a caught DB error, so every
 * `err.code` / `err.message` check silently started reading the wrapper
 * instead of the driver error: `isUniqueViolation` stopped catching
 * duplicate-email races (they escaped as 500s instead of 409s),
 * `classifyError` stopped classifying anything DB-shaped, and the
 * execution-receipt integration tests stopped matching their trigger/
 * constraint text. This module is the ONLY place that is allowed to know
 * the wrapper's shape — every other reader of a caught DB error goes
 * through these three functions instead of reading `.code`/`.message`
 * directly.
 *
 * Note: `DrizzleQueryError` does NOT set `this.name` — it inherits the
 * plain `"Error"` name from its `Error` superclass, so `err.name ===
 * "DrizzleQueryError"` never matches (verified against the installed
 * 0.45.2 build). Identification here is by `instanceof` against the
 * class itself, with a cause-shape heuristic as a fallback for any other
 * wrapper (present or future) that carries a SQLSTATE-bearing `cause`
 * without being this exact class.
 */

import { DrizzleQueryError } from "drizzle-orm/errors";

/** Matches a 5-character Postgres SQLSTATE, e.g. "23505". */
const SQLSTATE_RE = /^[0-9A-Z]{5}$/;

/** Bounds the unwrap walk so a cyclic (or absurdly deep) `cause` chain cannot loop forever. */
const MAX_UNWRAP_DEPTH = 5;

function hasSqlstateCause(err: object): boolean {
  const cause = (err as { cause?: unknown }).cause;
  return (
    typeof cause === "object" &&
    cause !== null &&
    typeof (cause as { code?: unknown }).code === "string" &&
    SQLSTATE_RE.test((cause as { code: string }).code)
  );
}

/**
 * Unwraps a drizzle-orm `DrizzleQueryError` (or any error shaped like one —
 * an object carrying a `cause` whose own `code` is a 5-character SQLSTATE)
 * down to the underlying driver error. Returns `err` unchanged when it is
 * not such a wrapper, and stops after `MAX_UNWRAP_DEPTH` steps regardless
 * of what the chain looks like.
 */
export function unwrapDbError(err: unknown): unknown {
  let current = err;
  for (let depth = 0; depth < MAX_UNWRAP_DEPTH; depth++) {
    if (typeof current !== "object" || current === null) return current;
    const isWrapper = current instanceof DrizzleQueryError || hasSqlstateCause(current);
    if (!isWrapper) return current;
    const cause = (current as { cause?: unknown }).cause;
    if (cause === undefined || cause === current) return current;
    current = cause;
  }
  return current;
}

/** The unwrapped error's Postgres SQLSTATE (5-char code), or undefined. */
export function pgErrorCode(err: unknown): string | undefined {
  const unwrapped = unwrapDbError(err);
  if (typeof unwrapped !== "object" || unwrapped === null) return undefined;
  const code = (unwrapped as { code?: unknown }).code;
  return typeof code === "string" && SQLSTATE_RE.test(code) ? code : undefined;
}

/** The unwrapped error's message — `Error#message` when it is an Error, else `String(err)`. */
export function dbErrorMessage(err: unknown): string {
  const unwrapped = unwrapDbError(err);
  return unwrapped instanceof Error ? unwrapped.message : String(unwrapped);
}

/** True when `unwrapDbError` actually peeled off a wrapper layer. */
export function wasWrapped(err: unknown): boolean {
  return unwrapDbError(err) !== err;
}
