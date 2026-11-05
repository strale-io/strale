import { describe, expect, it } from "vitest";
import { JsonPicker, type Pick } from "./json-pick.js";

/** Reference: parse everything, then project by the same spec. */
function project(value: unknown, spec: Pick): unknown {
  if (spec === true) return value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (spec === "keys") {
      out[k] = {};
      continue;
    }
    const child = Object.hasOwn(spec, k) ? spec[k] : Object.hasOwn(spec, "*") ? spec["*"] : undefined;
    if (child === undefined) continue;
    const p = project(v, child);
    if (p !== undefined) out[k] = p;
  }
  return out;
}

function pickWith(text: string, spec: Pick, chunk: number): unknown {
  const bytes = Buffer.from(text, "utf8");
  const picker = new JsonPicker(spec);
  for (let i = 0; i < bytes.length; i += chunk) picker.write(bytes.subarray(i, i + chunk));
  return picker.finish();
}

const DOC = {
  name: "pkg",
  "dist-tags": { latest: "1.0.1", next: "2.0.0-rc.1" },
  description: 'He said "}" and \\ and é 😀 {[',
  "esc\"aped": 1,
  versions: {
    "1.0.0": { scripts: { test: "a,b" }, _npmUser: { name: "a" }, big: { x: [1, 2, { y: "}]" }] }, n: 1.5e3, t: true, z: null },
    "1.0.1": { scripts: {}, deprecated: "use 2", arr: [[], {}, [{}]] },
  },
  time: { created: "c", modified: "m", "1.0.0": "t0", "1.0.1": "t1" },
  ignored: [{ a: { b: [1, 2, 3] } }, "str", 12, false, null],
  tail: 7,
};
const TEXT = JSON.stringify(DOC).replace('"__proto__"', '"__proto__"');
const SPEC: Pick = {
  name: true, description: true, "dist-tags": true, time: true, "esc\"aped": true,
  versions: { "*": { scripts: true, deprecated: true, _npmUser: true } },
  tail: true,
};

describe("JsonPicker", () => {
  for (const chunk of [1, 2, 3, 7, 64, 100_000]) {
    it(`matches parse-then-project at chunk size ${chunk}`, () => {
      const got = pickWith(TEXT, SPEC, chunk) as Record<string, any>;
      const want = project(JSON.parse(TEXT), SPEC) as Record<string, any>;
      expect(JSON.parse(JSON.stringify(got))).toEqual(JSON.parse(JSON.stringify(want)));
      expect(got.name).toBe("pkg");
      expect(got.description).toContain('He said "}"');
      expect(Object.keys(got.versions)).toEqual(["1.0.0", "1.0.1"]);
    });
  }

  it("keeps a __proto__ key as data and never writes a prototype", () => {
    const got = pickWith('{"versions":{"__proto__":{"scripts":{"a":"b"}}}}', { versions: { "*": { scripts: true } } }, 5) as any;
    expect(Object.getPrototypeOf(got.versions)).toBeNull();
    expect(Object.keys(got.versions)).toEqual(["__proto__"]);
    expect(({} as any).scripts).toBeUndefined();
  });

  it('"keys" keeps names and drops values', () => {
    const got = pickWith('{"versions":{"1":{"big":"x"},"2":[1],"3":"s","4":7}}', { versions: "keys" }, 3) as any;
    expect(Object.keys(got.versions)).toEqual(["1", "2", "3", "4"]);
    expect(got.versions["1"]).toEqual({});
  });

  it("a scalar that ends the object, and whitespace everywhere, parse", () => {
    const got = pickWith('  { "a" : 12 ,\n "b" :\ttrue , "c":"x" }  ', { a: true, b: true, c: true }, 1) as any;
    expect(got).toEqual({ a: 12, b: true, c: "x" });
  });

  it("throws SyntaxError for a truncated body, a non-object root and a bad captured value", () => {
    expect(() => pickWith('{"a":{"b":', { a: true }, 4)).toThrow(SyntaxError);
    expect(() => pickWith('{"a":"unterminated', { a: true }, 4)).toThrow(SyntaxError);
    expect(() => pickWith("[1,2]", { a: true }, 4)).toThrow(SyntaxError);
    expect(() => pickWith("", { a: true }, 4)).toThrow(SyntaxError);
    expect(() => pickWith('{"a":{"b":nope}}', { a: true }, 4)).toThrow(SyntaxError);
  });
});
