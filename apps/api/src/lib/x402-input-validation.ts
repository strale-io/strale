/**
 * Pure input-validation for x402 capability/solution requests.
 *
 * Framework-agnostic (no Hono, no DB) so it can be unit-tested without any
 * HTTP harness. Wired into x402-gateway-v2.ts's wildcard capability handler
 * and solutions handler — called strictly AFTER payment verification. See
 * the ordering comments around the wildcard handler in that file: CDP's
 * Bazaar crawler probes with an empty, unauthenticated request and requires
 * an HTTP 402 back, so this validation must never run before verify, and
 * it must always run before settle (bad input must never cost the caller).
 *
 * Handles two shapes of "the caller didn't supply usable input":
 *
 *  1. Classic `required: [...]` — a named field is absent, null, or "".
 *     Preserves the exact pre-existing message shape
 *     (`Missing required fields: a, b`).
 *
 *  2. anyOf/oneOf branches that each declare their own `required` — the
 *     constraint is satisfied when at least one branch's fields are all
 *     present. Otherwise the error names every branch's fields as the
 *     acceptable alternatives. This is how either/or capabilities
 *     (tech-stack-detect's url|domain, image-to-text's base64|image_url)
 *     express their contract — their flat `required` is `[]`, which made
 *     the old `if (schema?.required)` check a no-op against `{}`.
 *
 * There is intentionally no "empty input vs properties-only schema" rule —
 * see the comment at the bottom of validateX402Input for why that shape is
 * unenforceable (it can't be told apart from a legitimately all-optional
 * capability's schema).
 *
 * Never rejects on unknown/extra keys — agents routinely pass extra fields
 * alongside the ones the schema declares, and that must stay tolerated.
 * Non-object bodies (null, arrays, scalars) are treated as {}.
 */

export type X402ValidationResult =
  | { ok: true }
  | { ok: false; error: string };

type JsonSchema = Record<string, unknown>;

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function fieldPresent(inputs: Record<string, unknown>, field: string): boolean {
  return !isBlank(inputs[field]);
}

/**
 * Exported so other schema consumers (task-value-hints.ts's
 * unsatisfiedGroupFields) parse anyOf/oneOf branches through the same walker
 * instead of re-implementing it — two independent walkers of the same schema
 * shape drift silently (reuse review, 2026-08-15).
 */
export function requiredOf(schema: unknown): string[] {
  const req = (schema as JsonSchema | undefined)?.required;
  return Array.isArray(req) ? (req.filter((f): f is string => typeof f === "string")) : [];
}

export function branchesOf(schema: JsonSchema): unknown[] | null {
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) return schema.anyOf as unknown[];
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) return schema.oneOf as unknown[];
  return null;
}

/**
 * Validate `inputs` against a capability/solution's JSON Schema `input_schema`.
 *
 * Returns `{ ok: true }` when the schema is missing/non-object (nothing to
 * validate against) or when the input satisfies it. Returns
 * `{ ok: false, error }` with an actionable message otherwise. Callers are
 * responsible for attaching `input_schema` / `example` / `hint` to the HTTP
 * response — this function stays pure and knows nothing about the wire shape.
 */
export function validateX402Input(
  inputs: Record<string, unknown>,
  inputSchema: Record<string, unknown> | null | undefined,
): X402ValidationResult {
  if (!inputSchema || typeof inputSchema !== "object") return { ok: true };
  const schema = inputSchema as JsonSchema;

  // A JSON body of `null` (or a non-object like `[1,2]` / `"str"`) parses
  // fine and reaches us as-is. Coerce to {} so the checks below report
  // missing fields instead of crashing on a property read of null — this
  // was a reachable 500 for any paying caller who POSTed `null`.
  const safeInputs: Record<string, unknown> =
    inputs !== null && typeof inputs === "object" && !Array.isArray(inputs) ? inputs : {};

  // 1. Classic required — preserves the pre-existing message/behaviour.
  const required = requiredOf(schema);
  if (required.length > 0) {
    const missing = required.filter((f) => !fieldPresent(safeInputs, f));
    if (missing.length > 0) {
      return { ok: false, error: `Missing required fields: ${missing.join(", ")}` };
    }
  }

  // 2. anyOf/oneOf required-groups — satisfied if any single branch's
  // required fields are all present.
  const branches = branchesOf(schema);
  if (branches) {
    const branchRequiredLists = branches
      .map((b) => requiredOf(b))
      .filter((list) => list.length > 0);
    if (branchRequiredLists.length > 0) {
      const satisfied = branchRequiredLists.some((list) =>
        list.every((f) => fieldPresent(safeInputs, f)),
      );
      if (!satisfied) {
        const alternatives = branchRequiredLists.map((list) => list.join(" + ")).join(", ");
        return { ok: false, error: `Provide one of: ${alternatives}` };
      }
    }
  }

  // There is deliberately NO "reject wholly-empty input against a
  // properties-only schema" rule. That shape is ambiguous: it describes both
  // either/or capabilities (url|domain — {} is garbage) AND all-optional
  // capabilities (fear-greed-index, ecb-interest-rates, gas-price-check,
  // nl-housing-price-index — {} is the canonical paid call). The two are
  // indistinguishable from the schema alone, and an earlier draft of this
  // rule 400'd valid paid requests. Either/or capabilities must declare
  // their contract via anyOf branches (rule 2); until a capability's schema
  // does, empty input falls through to the executor, whose error the
  // gateway now returns WITH input_schema + example attached — so the
  // caller still learns the contract.
  return { ok: true };
}
