/**
 * Input fields that must never be persisted, per capability.
 *
 * A capability's input is normally kept: `transactions.input` stores it (90
 * days before redaction), the audit trail carries `input_hash`, and an
 * Idempotency-Key row carries a fingerprint derived from it. For some inputs
 * that is wrong in kind, not just in duration. `password-strength` tells its
 * callers the password is not stored; before this module that was false, and
 * an unsalted SHA-256 of a weak password is offline-crackable, so a hash of
 * the raw value is no better than the value itself.
 *
 * The rule: the executor receives the REAL input; everything that is written
 * down (the row, the audit hash, the idempotency fingerprint) is derived from
 * the persistence form returned here, where each listed field is replaced by
 * a fixed marker. A fixed marker hashes to the same value for every password,
 * so neither the row nor any hash derived from it carries information about
 * the secret.
 *
 * Adding a capability here is a code change on purpose: the list is a privacy
 * promise, and a promise should be reviewed, not configured.
 *
 * Solutions: step inputs are never persisted, only the solution-level
 * `inputs`, keyed by the solution's own field names. The solution rail looks
 * up the SOLUTION slug here, so a solution that feeds a never-persisted field
 * into a step must be listed under its own slug with its own field name. No
 * solution includes `password-strength` today.
 */

/** What a never-persisted field holds in every stored or hashed form. */
export const NOT_STORED_MARKER = "[not stored]";

/**
 * slug -> input field names that are never persisted or hashed.
 *
 * A Map, not a plain object: the slug is caller-controlled (it reaches this
 * module before matching, and from a URL path on the solution rail), and a
 * plain-object lookup of "constructor" or "__proto__" returns an
 * Object.prototype member, which would throw and turn a 404 into a 500.
 */
export const NEVER_PERSIST_INPUTS: ReadonlyMap<string, readonly string[]> = new Map([
  ["password-strength", Object.freeze(["password"])],
]);

function redactFields(
  input: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const present = fields.filter((f) => Object.prototype.hasOwnProperty.call(input, f));
  if (present.length === 0) return input;
  const copy: Record<string, unknown> = { ...input };
  for (const f of present) copy[f] = NOT_STORED_MARKER;
  return copy;
}

/**
 * The form of `input` that may be persisted or hashed for capability `slug`.
 *
 * - Listed slug: a shallow copy with each listed field that is present
 *   replaced by NOT_STORED_MARKER. The caller's object is never mutated, so
 *   the executor still sees the real value.
 * - Unlisted slug, or a listed slug whose fields are all absent: the SAME
 *   object is returned (identity), so every other capability's persisted
 *   input, audit hash and fingerprint are byte-for-byte unchanged.
 * - A non-object input (null, undefined, array) is returned as-is.
 */
export function inputForPersistence<T>(slug: string | null | undefined, input: T): T {
  if (!slug || input === null || typeof input !== "object" || Array.isArray(input)) return input;
  const fields = NEVER_PERSIST_INPUTS.get(slug);
  if (!fields) return input;
  return redactFields(input as Record<string, unknown>, fields) as T;
}

/**
 * The form of `input` to fingerprint for idempotency.
 *
 * Same as inputForPersistence when the slug is known. When it is not (a
 * task-routed /v1/do request is fingerprinted before routing resolves the
 * capability), every field listed for ANY capability is replaced, because the
 * request may yet route to one of them and the fingerprint is stored.
 *
 * Consequence, accepted: two requests that differ only in a never-persisted
 * field fingerprint identically, so the same Idempotency-Key reused with a
 * different password replays the first result for that customer instead of
 * returning 409. Distinguishing them would require storing something derived
 * from the secret, which is what this module exists to prevent.
 */
export function inputForFingerprint<T>(slug: string | null | undefined, input: T): T {
  if (slug) return inputForPersistence(slug, input);
  if (input === null || typeof input !== "object" || Array.isArray(input)) return input;
  const allFields = [...new Set([...NEVER_PERSIST_INPUTS.values()].flat())];
  return redactFields(input as Record<string, unknown>, allFields) as T;
}
