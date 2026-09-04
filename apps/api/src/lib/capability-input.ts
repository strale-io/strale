/**
 * Shared input-shape guards for capability executors.
 *
 * Why this module exists (production incident 2026-09-04):
 * several executors read a list-shaped input as
 * `(input.x as string[]) ?? []` and then call `.map()` / `.join()` on it.
 * The cast is a lie the compiler cannot check — the value arrives off the
 * wire as arbitrary JSON. When a caller sends a bare string
 * (`languages: "python"` instead of `languages: ["python"]`) the value
 * passes every `.length` guard, because a string has a length too, and then
 * dies on `.map is not a function`. The customer gets an unstructured 500
 * where the manifest contract promises a structured refusal — and
 * `error_code`-based client handling has nothing to match on.
 *
 * Observed in production on gitignore-generate, timezone-meeting-find,
 * blog-post-outline, prompt-optimize and regex-generate. All of those
 * manifests declare `type: array`, so a bare string is a contract violation
 * and refusing it is the correct behaviour — this helper does not coerce a
 * string into a one-element array, because inventing that semantics would
 * change a declared contract rather than fix a crash.
 *
 * Guard test: `capability-input.guard.test.ts` fails the build if a new
 * executor reintroduces the raw `as T[]) ?? []` cast on a user input.
 */

/** Thrown for a caller-supplied value of the wrong shape. */
export class InputShapeError extends Error {}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}

/**
 * Read a list-of-strings input.
 *
 * Absent (`undefined`/`null`) yields `[]` — absence is the caller's business,
 * and the executor's own required-field check decides whether that is fatal.
 * Anything present but not an array of strings is refused.
 */
export function readStringArray(
  value: unknown,
  field: string,
  hint?: string,
): string[] {
  if (value === undefined || value === null) return [];

  const suffix = hint ? ` ${hint}` : "";

  if (!Array.isArray(value)) {
    throw new InputShapeError(
      `'${field}' must be an array of strings, but received ${describe(value)}.` +
        ` Send ["value"] rather than "value".${suffix}`,
    );
  }

  const bad = value.findIndex((item) => typeof item !== "string");
  if (bad !== -1) {
    throw new InputShapeError(
      `'${field}' must contain only strings, but item ${bad} is ${describe(value[bad])}.${suffix}`,
    );
  }

  return value as string[];
}

/**
 * Read a bounded integer input.
 *
 * A non-numeric value yields NaN from `Number()`, and every comparison
 * against NaN is false — which silently skipped a `for` loop in
 * redirect-trace and left its result array empty, crashing the caller-facing
 * read that followed. Clamping here means the loop always runs at least
 * `min` times.
 */
export function readBoundedInt(
  value: unknown,
  field: string,
  { min, max, fallback }: { min: number; max: number; fallback: number },
): number {
  if (value === undefined || value === null) return fallback;

  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new InputShapeError(
      `'${field}' must be a number between ${min} and ${max}, but received ${describe(value)}.`,
    );
  }

  return Math.min(Math.max(Math.trunc(n), min), max);
}
