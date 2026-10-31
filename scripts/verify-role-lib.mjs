import { strict as assert } from "node:assert";

/**
 * Helpers for the verify-role provisioning script, kept here so they can be
 * exercised by a test rather than only grepped for.
 *
 * A 2026-10-31 security review planted `return url` in the TLS helper and a
 * short-circuit in the refusal classifier; both escaped, because the tests
 * matched source text instead of behaviour. Text matching cannot tell a
 * working guard from a gutted one that still contains the right words.
 */

/** SQLSTATE insufficient_privilege: the only error that means "refused". */
export const INSUFFICIENT_PRIVILEGE = "42501";

/**
 * Force TLS on a derived connection URL.
 *
 * postgres.js enables none by default, and the parked operator URL in this
 * repository's own docs carries `sslmode=disable`, so a URL derived from it
 * would otherwise hand cloud sessions a cleartext connection to production.
 * `searchParams.set` replaces any existing value and collapses duplicates, so
 * a `disable` cannot survive.
 */
export function withRequiredTls(url) {
  const u = new URL(url);
  u.searchParams.set("sslmode", "require");
  return u.toString();
}

/**
 * Did a statement that must fail, fail for the right reason?
 *
 * `null` means it succeeded. Anything other than insufficient_privilege — a
 * renamed table, a typo, a dropped connection, a statement timeout — is NOT a
 * refusal: counting it as one is the hollow gate this project calls F5, and
 * it passes hardest exactly when the schema has moved underneath.
 */
export function classifyRefusal(err) {
  if (err === null || err === undefined) return { ok: false, why: "the statement succeeded" };
  const code = err?.code ?? err?.cause?.code;
  if (code === INSUFFICIENT_PRIVILEGE) return { ok: true };
  return { ok: false, why: `refused with SQLSTATE ${code ?? "none"} (${err?.message ?? err}), not ${INSUFFICIENT_PRIVILEGE}` };
}

assert.ok(typeof withRequiredTls === "function" && typeof classifyRefusal === "function");
