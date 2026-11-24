import { describe, expect, it } from "vitest";
import { sliceStorable, toStorableJson } from "./storable-json.js";

describe("toStorableJson", () => {
  it("removes U+0000 from nested strings and keys and counts what it removed", () => {
    const { value, removed } = toStorableJson({ text: "a\u0000b", list: ["\u0000", { "k\u0000": "v" }] });
    expect(value).toEqual({ text: "ab", list: ["", { k: "v" }] });
    expect(removed).toBe(3);
    // What the database write sees: no NUL escape left.
    expect(JSON.stringify(value)).not.toContain("\\u0000");
  });

  it("removes lone surrogates but keeps paired ones (emoji)", () => {
    const { value, removed } = toStorableJson({ high: "x\uD83Dy", low: "x\uDE00y", emoji: "ok 😀" });
    expect(value).toEqual({ high: "xy", low: "xy", emoji: "ok 😀" });
    expect(removed).toBe(2);
    expect(JSON.stringify(value)).not.toMatch(/\\ud[89ab]/i);
  });

  it("returns the same references when nothing needs removing", () => {
    const input = { a: "plain", b: [1, "two", { c: null }], d: true };
    const { value, removed } = toStorableJson(input);
    expect(value).toBe(input);
    expect(removed).toBe(0);
  });

  it("does not mutate the input", () => {
    const input = { text: "a\u0000b", nested: { list: ["\u0000x"] } };
    toStorableJson(input);
    expect(input).toEqual({ text: "a\u0000b", nested: { list: ["\u0000x"] } });
  });

  it("leaves non-plain objects, numbers and null untouched", () => {
    const date = new Date(0);
    const buffer = Buffer.from([0, 1, 2]);
    const { value } = toStorableJson({ date, buffer, n: 1, z: null, u: undefined, s: "\u0000" });
    expect(value.date).toBe(date);
    expect(value.buffer).toBe(buffer);
    expect(value).toMatchObject({ n: 1, z: null, s: "" });
  });

  it("cleans a bare string", () => {
    expect(toStorableJson("a\u0000").value).toBe("a");
  });

  it("never lets a cleaned key overwrite a key the object already has", () => {
    expect(toStorableJson({ a: "keep", "a\u0000": "x" }).value).toEqual({ a: "keep" });
    expect(toStorableJson({ "a\u0000": "x", a: "keep" }).value).toEqual({ a: "keep" });
  });

  it("keeps a cleaned __proto__ key as a key, never as the prototype", () => {
    const { value } = toStorableJson({ "__proto__\u0000": { polluted: true } }) as { value: Record<string, unknown> };
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.keys(value)).toEqual(["__proto__"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("sliceStorable", () => {
  it("never ends on half of a surrogate pair", () => {
    const text = "ab\u{1F600}cd"; // the emoji is two UTF-16 units, at 2 and 3
    expect(sliceStorable(text, 3)).toBe("ab");
    expect(toStorableJson(sliceStorable(text, 3)).removed).toBe(0);
    expect(sliceStorable(text, 4)).toBe("ab\u{1F600}");
  });

  it("is a plain slice otherwise", () => {
    expect(sliceStorable("hello", 3)).toBe("hel");
    expect(sliceStorable("hello", 10)).toBe("hello");
    expect(sliceStorable("hello", 0)).toBe("");
  });
});
