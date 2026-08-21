/**
 * What an idempotency key is a key TO (WP6, risks CR-03 / N4).
 *
 * An Idempotency-Key means "this is the same request as before; do not perform
 * it twice". It does not mean "return whatever I got last time I used this
 * string". Without a record of what the key was issued for, those two readings
 * are indistinguishable, and the platform implemented the second — proved by
 * three tests WP1 left in place specifically as this package's acceptance
 * signal:
 *
 *   - a DIFFERENT payload under the same key replayed the old result
 *   - a DIFFERENT capability under the same key returned the first one's output,
 *     while the response echoed the slug the caller had just asked for
 *   - the same key from a DIFFERENT customer collided, because the unique index
 *     was global while the replay lookup was per-user
 *
 * The first two are the dangerous ones. A client that reuses a key across
 * different work — "order-123" is the canonical example, and far more likely
 * than a UUID collision — silently receives an answer to a question it did not
 * ask, presented as an answer to the one it did.
 *
 * So a key is bound to a fingerprint of the request it was first used for. Same
 * key and same fingerprint is a replay. Same key and a different fingerprint is
 * a client bug, and the correct answer is 409, not a plausible-looking wrong
 * result.
 */

import { createHash } from "node:crypto";

/**
 * Stable across key order, so `{a:1,b:2}` and `{b:2,a:1}` are one request.
 *
 * JSON.stringify preserves insertion order, and an HTTP client has no
 * obligation to serialise object keys consistently between a call and its
 * retry — which is exactly when idempotency matters. Sorting recursively means
 * a retry that differs only in serialisation still replays instead of 409ing.
 */
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) out[key] = canonicalize(obj[key]);
  return out;
}

/**
 * Bind a key to the work it was issued for.
 *
 * Covers the routing decision as well as the payload: `task` and
 * `capability_slug` are alternative ways of selecting what runs, and a key
 * reused across two different capabilities is precisely the case that returned
 * the wrong capability's output.
 */
export function computeIdempotencyFingerprint(params: {
  task?: string | null;
  capabilitySlug?: string | null;
  inputs?: Record<string, unknown> | null;
}): string {
  const payload = JSON.stringify({
    task: params.task ?? null,
    capability_slug: params.capabilitySlug ?? null,
    inputs: canonicalize(params.inputs ?? null),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

/**
 * May this stored request be replayed for the incoming one?
 *
 * A null stored fingerprint means the row predates this column. Those replay,
 * because refusing would break live clients holding keys issued before the
 * deploy — and the pre-existing behaviour for them is unchanged, not worsened.
 * The set is finite and drains as old keys age out.
 */
export function isReplayable(
  storedFingerprint: string | null | undefined,
  incomingFingerprint: string,
): boolean {
  // `undefined` as well as `null`. A column read as NULL arrives as null, but a
  // row that never carried the field at all — a projection that omits it, a
  // fixture, a cached shape — arrives as undefined, and `undefined === null` is
  // false. Treating those differently would 409 a legitimate retry, which is a
  // worse failure than the one this package fixes. Caught by an existing
  // do.core test rather than by inspection.
  if (storedFingerprint == null) return true;
  return storedFingerprint === incomingFingerprint;
}
