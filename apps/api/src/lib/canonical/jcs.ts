/**
 * RFC 8785 — JSON Canonicalization Scheme (JCS), implemented inside Strale.
 *
 * No third-party runtime dependency, by design: this produces the bytes a
 * customer's execution receipt is committed to, so the rule has to be ours and
 * has to be readable here. Independent implementations are used in tests as
 * cross-check references only — never at runtime, never as the authority.
 *
 * ## Why this is short
 *
 * RFC 8785 was written around ECMAScript semantics, so a correct JS
 * implementation is mostly *restriction*, not reimplementation:
 *
 *  - **Numbers.** RFC 8785 §3.2.2.3 specifies ECMAScript `Number::toString`,
 *    which is exactly what `JSON.stringify` emits for a number. Shortest
 *    round-tripping form, exponent normalisation, `1.0` → `1`, `1e2` → `100`,
 *    `-0` → `0`: all already correct.
 *  - **Strings.** RFC 8785 §3.2.2.2 specifies the same minimal escaping
 *    `JSON.stringify` performs — `"` `\` and the C0 controls, using the short
 *    forms `\b \t \n \f \r` where they exist and `\u00xx` otherwise, with
 *    non-ASCII left as literal UTF-8.
 *
 * What JS does NOT do, and this module must:
 *
 *  1. **Sort object properties** by UTF-16 code unit, recursively (§3.2.3).
 *  2. **Refuse everything outside the JSON domain.** `JSON.stringify` silently
 *     drops `undefined`/function/symbol object members and turns them into
 *     `null` inside arrays. Silent omission is precisely what the receipt
 *     schema forbids, so these are errors here, not quiet coercions.
 *  3. **Refuse `NaN`, `Infinity`, `BigInt`, cycles, and lone surrogates.**
 *  4. **Ignore `toJSON`.** `JSON.stringify` would call it, letting an object
 *     choose its own canonical form — a call site selecting what gets hashed,
 *     which the schema forbids. A `Date` therefore does not silently become a
 *     string here; the caller must convert it deliberately.
 *
 * ## Output
 *
 * `canonicalize()` returns a `string`; `canonicalBytes()` returns the UTF-8
 * encoding of it, which is what gets hashed. RFC 8785 is defined over the UTF-8
 * bytes, so anything that digests must go through `canonicalBytes`.
 */

import { types as nodeTypes } from "node:util";

export class CanonicalizationError extends Error {
  readonly code: JcsErrorCode;
  /** JSON Pointer-ish path to the offending value, for a usable message. */
  readonly path: string;

  constructor(code: JcsErrorCode, path: string, detail: string) {
    super(`${code} at ${path || "<root>"}: ${detail}`);
    this.name = "CanonicalizationError";
    this.code = code;
    this.path = path;
  }
}

export type JcsErrorCode =
  | "non_finite_number"
  | "unsupported_type"
  | "cyclic_structure"
  | "lone_surrogate"
  | "sparse_or_exotic_array"
  | "accessor_property"
  | "max_depth_exceeded";

/**
 * The RFC 8785 §3.2.3 ordering rule, defined once.
 *
 * Sorting is by UTF-16 code unit, which is exactly what
 * `Array.prototype.sort`'s default comparator does — so this function is thin
 * on purpose. It exists so the RULE has one home: `idempotency-fingerprint.ts`
 * grew its own recursive key-sort independently, and two implementations of an
 * ordering rule is how they drift. Anything needing "JSON keys in canonical
 * order" calls this.
 *
 * Deliberately NOT code-point order and NOT UTF-8 byte order. Those three
 * disagree above the BMP: U+1F600 (surrogates D83D DE00) sorts before U+FB00
 * by code unit and after it by the other two.
 */
export function sortJsonKeys(keys: readonly string[]): string[] {
  return [...keys].sort();
}

/**
 * Recursively reorder an object's keys without serializing.
 *
 * A shape normalizer, **not** a canonicalizer — it performs §3.2.3 and nothing
 * else, so the result still has to be serialized by something. It exists so the
 * one caller that must keep its legacy `JSON.stringify` bytes
 * (`computeIdempotencyFingerprint`) shares this module's ordering rule instead
 * of keeping a private copy.
 *
 * New code should use `canonicalize` instead.
 */
export function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  const record = value as Record<string, unknown>;
  // NULL PROTOTYPE, deliberately. On an ordinary object literal,
  // `out["__proto__"] = v` does not create a property — it sets the prototype,
  // and the key vanishes from the result. `JSON.parse('{"__proto__":1}')`
  // produces exactly that key as an OWN property, so the member was silently
  // dropped: two requests differing only in `__proto__` produced the same
  // idempotency fingerprint and would have replayed each other's result.
  // Inherited from the private implementation this replaced, found by probing
  // rather than by review. Measured before changing: 23 historical rows carry
  // the literal in their input and ZERO live idempotency keys do, so the
  // fingerprint moves for no key in flight.
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of sortJsonKeys(Object.keys(record))) out[key] = sortKeysDeep(record[key]);
  return out;
}

/**
 * Deepest nesting we will canonicalize.
 *
 * `canonicalize` recurses, and V8's stack gives out somewhere between 1,000 and
 * 5,000 levels — while `JSON.parse` happily accepts far more. Measured: a
 * 5,000-deep array parses fine and then throws a bare `RangeError: Maximum call
 * stack size exceeded` from inside the serializer. That is attacker-reachable
 * on any endpoint taking JSON, and a `RangeError` is not one of this module's
 * closed error codes — on the receipt path it would surface as an unexpected
 * crash rather than a clean, reason-coded refusal.
 *
 * 512 is far beyond any real payload (a receipt is five levels deep) and far
 * below where the stack fails, so the refusal is always ours and never V8's.
 */
const MAX_DEPTH = 512;

const CONTROL_ESCAPES: Record<number, string> = {
  0x08: "\\b",
  0x09: "\\t",
  0x0a: "\\n",
  0x0c: "\\f",
  0x0d: "\\r",
};

/**
 * Serialize one string per RFC 8785 §3.2.2.2.
 *
 * Written out rather than delegated to `JSON.stringify` for two reasons: it
 * makes the escaping rule auditable in the file that claims to implement it,
 * and it lets lone surrogates be an error instead of being silently replaced
 * with `�`-style escapes by the engine's well-formed-stringify behaviour.
 */
function serializeString(value: string, path: string): string {
  let out = '"';
  for (let i = 0; i < value.length; i++) {
    const cp = value.charCodeAt(i);

    if (cp === 0x22) {
      out += '\\"';
    } else if (cp === 0x5c) {
      out += "\\\\";
    } else if (cp < 0x20) {
      out += CONTROL_ESCAPES[cp] ?? `\\u${cp.toString(16).padStart(4, "0")}`;
    } else if (cp >= 0xd800 && cp <= 0xdbff) {
      // High surrogate: must be followed by a low surrogate.
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new CanonicalizationError(
          "lone_surrogate",
          path,
          `unpaired high surrogate U+${cp.toString(16).toUpperCase()}`,
        );
      }
      out += value[i] + value[i + 1];
      i++;
    } else if (cp >= 0xdc00 && cp <= 0xdfff) {
      throw new CanonicalizationError(
        "lone_surrogate",
        path,
        `unpaired low surrogate U+${cp.toString(16).toUpperCase()}`,
      );
    } else {
      out += value[i];
    }
  }
  return out + '"';
}

/**
 * Serialize one number per RFC 8785 §3.2.2.3 (ECMAScript `Number::toString`).
 *
 * `String(n)` is that algorithm. The only adjustment is `-0`, which RFC 8785
 * requires to serialize as `0` and which `String(-0)` already gives — asserted
 * explicitly below so the behaviour is pinned rather than assumed.
 */
function serializeNumber(value: number, path: string): string {
  if (!Number.isFinite(value)) {
    throw new CanonicalizationError(
      "non_finite_number",
      path,
      Number.isNaN(value) ? "NaN is outside the JSON domain" : `${value} is outside the JSON domain`,
    );
  }
  // Object.is distinguishes -0 from 0; String() already collapses it, and this
  // makes that dependence visible instead of incidental.
  if (Object.is(value, -0)) return "0";
  return String(value);
}

function serialize(value: unknown, path: string, seen: Set<object>, depth = 0): string {
  if (depth > MAX_DEPTH) {
    throw new CanonicalizationError(
      "max_depth_exceeded",
      path,
      `nesting deeper than ${MAX_DEPTH} levels`,
    );
  }
  if (value === null) return "null";

  const t = typeof value;

  if (t === "boolean") return value ? "true" : "false";
  if (t === "number") return serializeNumber(value as number, path);
  if (t === "string") return serializeString(value as string, path);

  if (t === "undefined") {
    throw new CanonicalizationError(
      "unsupported_type",
      path,
      "undefined is not a JSON value; JSON.stringify would silently drop it",
    );
  }
  if (t === "bigint") {
    throw new CanonicalizationError(
      "unsupported_type",
      path,
      "BigInt cannot be represented as an IEEE 754 double",
    );
  }
  if (t === "function" || t === "symbol") {
    throw new CanonicalizationError("unsupported_type", path, `${t} is not a JSON value`);
  }

  // Objects and arrays.
  const obj = value as object;
  if (seen.has(obj)) {
    throw new CanonicalizationError("cyclic_structure", path, "value refers to itself");
  }
  seen.add(obj);
  try {
    if (Array.isArray(value)) {
      // A sparse array's holes would serialize as null under JSON.stringify —
      // another silent coercion. Refuse instead.
      for (let i = 0; i < value.length; i++) {
        if (!(i in value)) {
          throw new CanonicalizationError(
            "sparse_or_exotic_array",
            `${path}[${i}]`,
            "sparse array hole would silently become null",
          );
        }
      }
      const parts = value.map((v, i) => serialize(v, `${path}[${i}]`, seen, depth + 1));
      return `[${parts.join(",")}]`;
    }

    // A Proxy can vary what it returns on every read, exactly like a getter —
    // and it defeats the accessor check below, because its
    // getOwnPropertyDescriptor trap reports a plain DATA descriptor while the
    // `get` trap does the varying. Found by probing: the same Proxy
    // canonicalized to {"a":1,"k":1} then {"a":1,"k":2}. Unreachable from
    // JSON.parse, but a commitment primitive must not rest on that.
    if (nodeTypes.isProxy(obj)) {
      throw new CanonicalizationError(
        "unsupported_type",
        path,
        "a Proxy can return a different value on each read, so it has no stable canonical form",
      );
    }

    // Boxed primitives serialize into MISLEADING JSON rather than failing:
    // `new Number(1)` and `new Boolean(true)` both become `{}` — the value
    // disappears entirely — and `new String("x")` becomes `{"0":"x"}`, an
    // index map. This is the one place we deliberately diverge from
    // JSON.stringify, which unwraps them; unwrapping silently would let two
    // different JS values share a commitment.
    if (obj instanceof String || obj instanceof Number || obj instanceof Boolean) {
      throw new CanonicalizationError(
        "unsupported_type",
        path,
        `${obj.constructor.name} object: pass the primitive, not its wrapper`,
      );
    }

    // Reject the exotic objects JSON.stringify would happily mangle. Map and
    // Set stringify as `{}`, losing every entry without complaint.
    if (
      obj instanceof Map ||
      obj instanceof Set ||
      obj instanceof Date ||
      obj instanceof RegExp ||
      ArrayBuffer.isView(obj)
    ) {
      throw new CanonicalizationError(
        "unsupported_type",
        path,
        `${obj.constructor?.name ?? "exotic object"} has no canonical JSON form; ` +
          "convert it deliberately at the call site",
      );
    }

    // RFC 8785 §3.2.3, via the single definition of the ordering rule.
    const record = obj as Record<string, unknown>;
    const keys = sortJsonKeys(Object.keys(record));

    const members: string[] = [];
    for (const key of keys) {
      // An accessor is not a value. A getter may return something different on
      // every read, which would make the digest non-deterministic — the same
      // object canonicalizing to two different commitments. Found by probing:
      // `{ get k() { return ++n; } }` produced `{"a":1,"k":1}` then
      // `{"a":1,"k":2}`. Unreachable from JSON.parse, which is the only source
      // in the receipt path, so this is a guard rather than a fix for a live
      // bug — but a commitment primitive must not depend on that staying true.
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (descriptor && typeof descriptor.get === "function") {
        throw new CanonicalizationError(
          "accessor_property",
          `${path}/${key}`,
          "a getter can return a different value on each read, so it has no stable canonical form",
        );
      }
      const child = record[key];
      // An `undefined` MEMBER is the silent-omission case: JSON.stringify drops
      // the whole property. It must be an error, or a call site could remove a
      // hashed field just by leaving it undefined.
      members.push(
        `${serializeString(key, path)}:${serialize(child, `${path}/${key}`, seen, depth + 1)}`,
      );
    }
    return `{${members.join(",")}}`;
  } finally {
    seen.delete(obj);
  }
}

/**
 * Canonicalize a JSON value to its RFC 8785 string form.
 *
 * Throws `CanonicalizationError` rather than coercing. Every refusal is a case
 * where `JSON.stringify` would have produced *something*, quietly, and that
 * something would have been committed to.
 */
export function canonicalize(value: unknown): string {
  return serialize(value, "", new Set<object>());
}

/** The UTF-8 bytes RFC 8785 is defined over. Digest these, never the string. */
export function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(canonicalize(value), "utf8");
}
