/**
 * Integration-test helper for asserting on the MESSAGE of a rejection that
 * originates from a real Postgres trigger/constraint/permission failure.
 *
 * Since drizzle-orm 0.44 (PR #510, 2026-09-04), `db.execute(sql\`...\`)`
 * rethrows driver errors wrapped in `DrizzleQueryError` — the wrapper's own
 * `.message` is a generic `Failed query: ...\nparams: ...` string that
 * never contains the trigger name or constraint text a test wants to match.
 * The real message is on `.cause`. See lib/db-error.ts for the full
 * incident.
 *
 * `expectDbRejection` awaits the rejection, unwraps it with the same
 * `dbErrorMessage` the rest of the platform uses, and asserts the regex
 * against that unwrapped message — falling back to the raw (possibly
 * still-wrapped) message so the same assertion also passes against an
 * unwrapped driver error (an older drizzle-orm, or any call path that
 * doesn't go through the wrapper).
 */

import { expect } from "vitest";
import { dbErrorMessage } from "../lib/db-error.js";

export async function expectDbRejection(
  promise: Promise<unknown>,
  pattern: RegExp,
  label?: string,
): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught, label ?? "expected the promise to reject").toBeDefined();

  const unwrappedMessage = dbErrorMessage(caught);
  const rawMessage = caught instanceof Error ? caught.message : String(caught);

  if (pattern.test(unwrappedMessage) || pattern.test(rawMessage)) return;

  expect(
    unwrappedMessage,
    (label ? `${label}: ` : "") +
      `neither the unwrapped message nor the raw message matched ${pattern}. ` +
      `unwrapped: ${JSON.stringify(unwrappedMessage)}; raw: ${JSON.stringify(rawMessage)}`,
  ).toMatch(pattern);
}
