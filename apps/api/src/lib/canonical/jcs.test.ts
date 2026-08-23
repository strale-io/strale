/**
 * RFC 8785 conformance for Strale's own canonicalizer (Phase 3).
 *
 * Three kinds of assertion, deliberately separated:
 *
 *  1. **Committed vectors** — `jcs-vectors.json`, hand-derived from the RFC's
 *     rules. A vector generated from the implementation under test proves
 *     nothing, so none of them were.
 *  2. **Independent cross-check** — every vector is also run through two
 *     third-party JCS implementations (`canonicalize`, `json-canonicalize`).
 *     They are devDependencies and verification references only: nothing here
 *     imports them at runtime, and if they disagree with us the test fails
 *     rather than deferring to them.
 *  3. **Domain refusals** — the values `JSON.stringify` would silently coerce
 *     or drop. Each is an error here, because silent omission is exactly what
 *     a closed receipt schema cannot tolerate.
 */

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import refA from "canonicalize";
import { canonicalize as refB } from "json-canonicalize/src/index.ts";

import { canonicalize, canonicalBytes, sortKeysDeep, CanonicalizationError } from "./jcs.js";
import { DOMAIN_TAGS, domainDigest, digestPreimage } from "./domain-digest.js";

interface Vector {
  name: string;
  input: unknown;
  expected: string;
}

const VECTORS = JSON.parse(
  readFileSync(join(import.meta.dirname, "jcs-vectors.json"), "utf8"),
) as Record<string, Vector[] | unknown>;

const GROUPS = Object.entries(VECTORS).filter(
  //  is an array of strings, not a vector group. Without this the
  // suite iterated it and produced seven tests named "undefined".
  (entry): entry is [string, Vector[]] =>
    !entry[0].startsWith("_") &&
    Array.isArray(entry[1]) &&
    entry[1].every((v) => typeof (v as Vector)?.name === "string"),
);

function sha256Hex(b: Buffer): string {
  return createHash("sha256").update(b).digest("hex");
}

describe("RFC 8785 canonicalization — committed vectors", () => {
  it("the vector file actually contains vectors", () => {
    // Guards the whole suite: a rename or a parse slip would otherwise make
    // every `it.each` below iterate an empty list and report success.
    const total = GROUPS.reduce((n, [, v]) => n + v.length, 0);
    expect(GROUPS.length).toBeGreaterThanOrEqual(7);
    expect(total).toBeGreaterThanOrEqual(40);
  });

  for (const [group, vectors] of GROUPS) {
    describe(group, () => {
      for (const v of vectors) {
        it(v.name, () => {
          expect(canonicalize(v.input)).toBe(v.expected);
        });
      }
    });
  }
});

describe("independent implementations agree, vector for vector", () => {
  for (const [group, vectors] of GROUPS) {
    for (const v of vectors) {
      it(`${group}: ${v.name}`, () => {
        const ours = canonicalize(v.input);
        const a = refA(v.input as never);
        const b = refB(v.input);

        expect(a, "reference `canonicalize` disagrees with the committed vector").toBe(v.expected);
        expect(b, "reference `json-canonicalize` disagrees with the committed vector").toBe(
          v.expected,
        );
        expect(ours).toBe(a);
        expect(ours).toBe(b);

        // The bytes and the digest, not just the string — RFC 8785 is defined
        // over UTF-8 bytes and that is what we commit to.
        expect(sha256Hex(canonicalBytes(v.input))).toBe(
          sha256Hex(Buffer.from(a as string, "utf8")),
        );
      });
    }
  }
});

describe("insertion order cannot reach the bytes", () => {
  it("two objects built in opposite orders produce identical bytes and digest", () => {
    const forward: Record<string, unknown> = {};
    forward.alpha = 1;
    forward.beta = { x: 1, y: 2 };
    forward.gamma = [1, 2, 3];

    const backward: Record<string, unknown> = {};
    backward.gamma = [1, 2, 3];
    backward.beta = {} as Record<string, unknown>;
    (backward.beta as Record<string, unknown>).y = 2;
    (backward.beta as Record<string, unknown>).x = 1;
    backward.alpha = 1;

    // Sanity: they really were built differently, or this test proves nothing.
    expect(JSON.stringify(forward)).not.toBe(JSON.stringify(backward));

    expect(canonicalize(forward)).toBe(canonicalize(backward));
    expect(canonicalBytes(forward).equals(canonicalBytes(backward))).toBe(true);
    expect(domainDigest(DOMAIN_TAGS.executionReceipt, forward)).toBe(
      domainDigest(DOMAIN_TAGS.executionReceipt, backward),
    );
  });

  it("deleting and re-adding a key does not change the digest", () => {
    const o: Record<string, unknown> = { a: 1, b: 2, c: 3 };
    const before = domainDigest(DOMAIN_TAGS.executionReceipt, o);
    delete o.a;
    o.a = 1; // now last in insertion order
    expect(domainDigest(DOMAIN_TAGS.executionReceipt, o)).toBe(before);
  });

  it("a round trip through JSON.parse does not change the digest", () => {
    const o = { z: [1, { b: 2, a: 3 }], a: "x" };
    expect(domainDigest(DOMAIN_TAGS.executionReceipt, JSON.parse(JSON.stringify(o)))).toBe(
      domainDigest(DOMAIN_TAGS.executionReceipt, o),
    );
  });
});

describe("values outside the JSON domain are refused, never coerced", () => {
  function refusal(value: unknown, code: string) {
    let err: unknown;
    try {
      canonicalize(value);
    } catch (e) {
      err = e;
    }
    expect(err, "expected a refusal, got a canonical string").toBeInstanceOf(
      CanonicalizationError,
    );
    expect((err as CanonicalizationError).code).toBe(code);
  }

  it("NaN", () => refusal({ k: NaN }, "non_finite_number"));
  it("Infinity", () => refusal({ k: Infinity }, "non_finite_number"));
  it("-Infinity", () => refusal({ k: -Infinity }, "non_finite_number"));

  it("undefined as an object member — the silent-omission case", () => {
    // JSON.stringify DROPS the property entirely. If this were allowed, a call
    // site could remove a hashed field just by leaving it undefined, which the
    // closed schema forbids.
    expect(JSON.stringify({ a: 1, b: undefined })).toBe('{"a":1}');
    refusal({ a: 1, b: undefined }, "unsupported_type");
  });

  it("undefined as an array element — silently becomes null", () => {
    expect(JSON.stringify([1, undefined])).toBe("[1,null]");
    refusal([1, undefined], "unsupported_type");
  });

  it("BigInt", () => refusal({ k: BigInt(1) }, "unsupported_type"));
  it("function", () => refusal({ k: () => 1 }, "unsupported_type"));
  it("symbol", () => refusal({ k: Symbol("s") }, "unsupported_type"));

  it("a direct cycle", () => {
    const o: Record<string, unknown> = { a: 1 };
    o.self = o;
    refusal(o, "cyclic_structure");
  });

  it("an indirect cycle through an array", () => {
    const a: unknown[] = [];
    a.push({ back: a });
    refusal(a, "cyclic_structure");
  });

  it("shared (non-cyclic) references are NOT a cycle", () => {
    // A diamond is legal JSON. Refusing it would be over-detection.
    const shared = { v: 1 };
    expect(canonicalize({ a: shared, b: shared })).toBe('{"a":{"v":1},"b":{"v":1}}');
  });

  it("Map and Set — JSON.stringify turns them into {} and loses everything", () => {
    expect(JSON.stringify({ k: new Map([["a", 1]]) })).toBe('{"k":{}}');
    refusal({ k: new Map([["a", 1]]) }, "unsupported_type");
    refusal({ k: new Set([1]) }, "unsupported_type");
  });

  it("Date — refused rather than silently becoming a string via toJSON", () => {
    // The call site must convert deliberately. Honouring toJSON would let an
    // object choose its own canonical form.
    refusal({ k: new Date(0) }, "unsupported_type");
  });

  it("a sparse array hole would become null", () => {
    const sparse = [1, , 3] as unknown[];
    expect(JSON.stringify(sparse)).toBe("[1,null,3]");
    refusal(sparse, "sparse_or_exotic_array");
  });

  it("lone surrogates", () => {
    refusal({ k: "\ud83d" }, "lone_surrogate");
    refusal({ k: "\ude00" }, "lone_surrogate");
    refusal({ "\ud83d": 1 }, "lone_surrogate");
    // A correctly paired surrogate is fine.
    expect(canonicalize({ k: "😀" })).toBe('{"k":"😀"}');
  });

  it("toJSON is ignored, not honoured", () => {
    const o = { k: { toJSON: () => "hijacked", real: 1 } };
    // JSON.stringify would emit the hijacked value.
    expect(JSON.stringify(o)).toBe('{"k":"hijacked"}');
    // We refuse, because toJSON is a function member.
    refusal(o, "unsupported_type");
  });
});

describe("properties JavaScript treats specially", () => {
  it("a literal __proto__ key survives canonicalization", () => {
    // JSON.parse produces __proto__ as an OWN property, and `out[key] = v` on
    // an ordinary object would set the prototype instead of storing it.
    const parsed = JSON.parse('{"__proto__": 1, "a": 2}');
    expect(Object.keys(parsed)).toContain("__proto__");
    expect(canonicalize(parsed)).toBe('{"__proto__":1,"a":2}');
  });

  it("sortKeysDeep preserves __proto__ instead of silently dropping it", () => {
    // The bug this fixes: two requests differing only in __proto__ produced
    // the SAME idempotency fingerprint and would have replayed each other.
    const parsed = JSON.parse('{"__proto__": 1, "a": 2}');
    const sorted = sortKeysDeep(parsed) as Record<string, unknown>;
    expect(Object.keys(sorted)).toEqual(["__proto__", "a"]);
    expect(JSON.stringify(sorted)).toBe('{"__proto__":1,"a":2}');
  });

  it("two inputs differing ONLY in __proto__ get different fingerprints", () => {
    const a = JSON.parse('{"__proto__": 1, "x": 1}');
    const b = JSON.parse('{"x": 1}');
    expect(JSON.stringify(sortKeysDeep(a))).not.toBe(JSON.stringify(sortKeysDeep(b)));
  });

  it("a getter is refused, because it has no stable value", () => {
    let n = 0;
    const withGetter = {
      a: 1,
      get k() {
        return ++n;
      },
    };
    let err: unknown;
    try {
      canonicalize(withGetter);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CanonicalizationError);
    expect((err as CanonicalizationError).code).toBe("accessor_property");
  });

  it("a Proxy is refused — it defeats the accessor check and can vary per read", () => {
    // The getOwnPropertyDescriptor trap reports a plain data descriptor while
    // the get trap does the varying, so the getter guard never fires.
    let n = 0;
    const proxy = new Proxy(
      { a: 1, k: 0 },
      { get: (t, p) => (p === "k" ? ++n : (t as Record<string, unknown>)[p as string]) },
    );
    let err: unknown;
    try {
      canonicalize(proxy);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CanonicalizationError);
    expect((err as CanonicalizationError).code).toBe("unsupported_type");
  });

  it("boxed primitives are refused rather than becoming misleading JSON", () => {
    // Without this they do not throw — they produce something plausible and
    // wrong. new Number(1) and new Boolean(true) lose their value entirely.
    expect(JSON.stringify({ k: new Number(1) })).toBe('{"k":1}');
    for (const boxed of [new String("x"), new Number(1), new Boolean(true)]) {
      let err: unknown;
      try {
        canonicalize({ k: boxed });
      } catch (e) {
        err = e;
      }
      expect(err, `${boxed.constructor.name} was not refused`).toBeInstanceOf(
        CanonicalizationError,
      );
    }
  });

  it("inherited properties are excluded; only own members are canonicalized", () => {
    const proto = { inherited: "must not appear" };
    const child = Object.create(proto) as Record<string, unknown>;
    child.own = 1;
    expect(canonicalize(child)).toBe('{"own":1}');
  });

  it("a null-prototype object canonicalizes like any other", () => {
    const np = Object.create(null) as Record<string, unknown>;
    np.b = 1;
    np.a = 2;
    expect(canonicalize(np)).toBe('{"a":2,"b":1}');
  });

  it("integer-like keys sort by code unit, not by JS integer-key order", () => {
    // Object.keys returns integer-like keys first, ascending numerically:
    // ["1","2","10","b"]. RFC 8785 wants "1","10","2","b".
    const o = { "10": 1, "2": 2, b: 3, "1": 4 };
    expect(Object.keys(o)).toEqual(["1", "2", "10", "b"]);
    expect(canonicalize(o)).toBe('{"1":4,"10":1,"2":2,"b":3}');
  });

  it("a toJSON on the PROTOTYPE is ignored, not honoured", () => {
    class T {
      a = 1;
      toJSON() {
        return "hijacked";
      }
    }
    const inst = new T();
    expect(JSON.stringify({ k: inst })).toBe('{"k":"hijacked"}');
    // Not an own enumerable member, so it is simply not serialized.
    expect(canonicalize({ k: inst })).toBe('{"k":{"a":1}}');
  });

  it("symbol keys and non-enumerable properties are excluded, as JSON requires", () => {
    // Documented rather than refused: these are not JSON members at all, and
    // JSON.stringify omits them too. Pinned so the behaviour is a decision.
    const withSymbol = { a: 1, [Symbol("s")]: 2 };
    expect(canonicalize(withSymbol)).toBe('{"a":1}');

    const withHidden = { a: 1 };
    Object.defineProperty(withHidden, "hidden", { value: 2, enumerable: false });
    expect(canonicalize(withHidden)).toBe('{"a":1}');
  });
});

describe("domain separation", () => {
  it("the same payload digests differently under different domains", () => {
    const payload = { a: 1 };
    expect(domainDigest(DOMAIN_TAGS.executionReceipt, payload)).not.toBe(
      domainDigest(DOMAIN_TAGS.manifestSnapshot, payload),
    );
  });

  it("the preimage is TAG || 0x00 || canonical bytes, exactly", () => {
    const payload = { a: 1 };
    const pre = digestPreimage(DOMAIN_TAGS.executionReceipt, payload);
    const tag = Buffer.from(DOMAIN_TAGS.executionReceipt, "ascii");

    expect(pre.subarray(0, tag.length).equals(tag)).toBe(true);
    expect(pre[tag.length]).toBe(0x00);
    expect(pre.subarray(tag.length + 1).equals(canonicalBytes(payload))).toBe(true);
  });

  it("the tag cannot be forged from payload content", () => {
    // Without the NUL separator, a payload whose canonical bytes began with the
    // rest of another tag could collide. The separator makes the boundary
    // unambiguous, and the tags contain no NUL.
    for (const tag of Object.values(DOMAIN_TAGS)) {
      expect(tag).toMatch(/^[\x21-\x7e]+$/);
      expect(tag.includes(" ")).toBe(false);
    }
  });

  it("the digest is the full 256-bit value, hex, prefixed", () => {
    const d = domainDigest(DOMAIN_TAGS.executionReceipt, { a: 1 });
    expect(d).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("the digest is over the BYTES, matching an out-of-band recomputation", () => {
    // What an independent verifier would do with only the published rule.
    const payload = { b: 2, a: 1 };
    const independent = createHash("sha256")
      .update(
        Buffer.concat([
          Buffer.from("strale.execution.v1", "ascii"),
          Buffer.from([0x00]),
          Buffer.from(refA(payload as never) as string, "utf8"),
        ]),
      )
      .digest("hex");
    expect(domainDigest(DOMAIN_TAGS.executionReceipt, payload)).toBe(`sha256:${independent}`);
  });
});

describe("the UTF-16 code-unit ordering rule specifically", () => {
  it("sorts by code unit, which differs from code point above the BMP", () => {
    // U+1F600 == D83D DE00; U+FB00 is a single unit. Code POINT order puts
    // U+FB00 first; UTF-16 CODE UNIT order puts the emoji first. RFC 8785
    // mandates the latter.
    const out = canonicalize({ "ﬀ": 1, "\u{1F600}": 2 });
    expect(out.indexOf("\u{1F600}")).toBeLessThan(out.indexOf("ﬀ"));

    // And it is not merely "our sort" — the references agree.
    expect(refA({ "ﬀ": 1, "\u{1F600}": 2 } as never)).toBe(out);
    expect(refB({ "ﬀ": 1, "\u{1F600}": 2 })).toBe(out);
  });

  it("differs from a UTF-8 byte sort, so a byte-sorting impl fails here", () => {
    const keys = ["ﬀ", "\u{1F600}"];
    const byUtf8 = [...keys].sort((x, y) =>
      Buffer.from(x, "utf8").compare(Buffer.from(y, "utf8")),
    );
    const byCodeUnit = [...keys].sort();
    expect(byUtf8).not.toEqual(byCodeUnit);
  });
});
