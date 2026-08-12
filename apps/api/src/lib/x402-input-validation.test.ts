import { describe, it, expect } from "vitest";
import { validateX402Input } from "./x402-input-validation.js";

/**
 * Regression coverage for the x402 gateway's empty-body discovery gap
 * (2026-08-11 production incident: 5 raw executor-error 400s on
 * tech-stack-detect / image-to-text, both either/or-input capabilities
 * whose DB `input_schema.required` is `[]` / absent). See
 * apps/api/src/routes/x402-gateway-v2.ts for how this is wired in.
 *
 * The old inline check in the wildcard handler was:
 *
 *   if (schema?.required) {
 *     const missing = schema.required.filter(f => inputs[f] == null || inputs[f] === "");
 *     if (missing.length > 0) { ... 400 ... }
 *   }
 *
 * `schema?.required` is an *array*, and arrays are truthy in JS regardless
 * of length — so `required: []` still entered the block, but `.filter()`
 * over an empty array always produces `missing.length === 0`, so the check
 * silently no-ops. When `required` is absent entirely (image-to-text),
 * `schema?.required` is `undefined` and the whole block is skipped. Either
 * way, `{}` sailed straight through to the executor, which then threw its
 * own uncaught-shaped error with no `input_schema` attached.
 *
 * The enforcement for these capabilities is the anyOf required-group branch:
 * their schemas must DECLARE the either/or contract. A properties-only
 * schema with no required and no anyOf is deliberately accepted — that
 * shape also describes all-optional capabilities (fear-greed-index,
 * ecb-interest-rates, gas-price-check, nl-housing-price-index) whose
 * canonical paid call IS `{}`; an earlier draft that rejected empty input
 * on that shape 400'd those valid calls.
 */
describe("validateX402Input", () => {
  it("REGRESSION: accepts {} against a properties-only schema with no required and no anyOf (all-optional capabilities)", () => {
    // Mirrors fear-greed-index / ecb-interest-rates / gas-price-check:
    // properties exist, everything defaults, `{}` is the canonical call.
    // An earlier draft rejected this shape and broke paid traffic.
    const schema = {
      type: "object",
      properties: {
        days: { type: "number" },
      },
    };
    expect(validateX402Input({}, schema).ok).toBe(true);
  });

  it("accepts {} against required:[] with properties and no anyOf (same all-optional shape)", () => {
    const schema = {
      type: "object",
      required: [],
      properties: {
        chain_id: { type: "string" },
      },
    };
    expect(validateX402Input({}, schema).ok).toBe(true);
  });

  it("REGRESSION: rejects null body against a required schema instead of throwing (was a 500)", () => {
    // A JSON body of `null` parses fine and reached the validator as-is;
    // property reads on null threw an uncaught TypeError → 500 for a
    // paying caller. Null coerces to {} and reports the missing fields.
    const schema = {
      type: "object",
      required: ["url"],
      properties: { url: { type: "string" } },
    };
    const result = validateX402Input(null as never, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Missing required fields: url");
    }
  });

  it("treats array and scalar bodies like empty input, without throwing", () => {
    const schema = {
      type: "object",
      properties: { url: { type: "string" }, domain: { type: "string" } },
      anyOf: [{ required: ["url"] }, { required: ["domain"] }],
    };
    expect(validateX402Input([1, 2] as never, schema).ok).toBe(false);
    expect(validateX402Input("str" as never, schema).ok).toBe(false);
  });

  it("rejects {} against classic required:['url'] with the pre-existing message shape", () => {
    const schema = {
      type: "object",
      required: ["url"],
      properties: { url: { type: "string" } },
    };
    const result = validateX402Input({}, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Missing required fields: url");
    }
  });

  it("rejects null/empty-string values for a classic required field, same as absence", () => {
    const schema = {
      type: "object",
      required: ["url"],
      properties: { url: { type: "string" } },
    };
    expect(validateX402Input({ url: null }, schema).ok).toBe(false);
    expect(validateX402Input({ url: "" }, schema).ok).toBe(false);
  });

  it("lists every missing classic-required field", () => {
    const schema = {
      type: "object",
      required: ["a", "b"],
      properties: { a: { type: "string" }, b: { type: "string" } },
    };
    const result = validateX402Input({ a: "present" }, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Missing required fields: b");
    }
  });

  const anyOfUrlOrDomain = {
    type: "object",
    required: [],
    properties: {
      url: { type: "string" },
      domain: { type: "string" },
    },
    anyOf: [{ required: ["url"] }, { required: ["domain"] }],
  };

  it("accepts {domain: 'x.com'} against an anyOf(url|domain) schema", () => {
    const result = validateX402Input({ domain: "x.com" }, anyOfUrlOrDomain);
    expect(result.ok).toBe(true);
  });

  it("accepts {url: 'https://x.com'} against the same anyOf schema", () => {
    const result = validateX402Input({ url: "https://x.com" }, anyOfUrlOrDomain);
    expect(result.ok).toBe(true);
  });

  it("rejects {unrelated: 'junk'} against an anyOf(url|domain) schema, naming both alternatives", () => {
    const result = validateX402Input({ unrelated: "junk" }, anyOfUrlOrDomain);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/url/);
      expect(result.error).toMatch(/domain/);
    }
  });

  it("rejects {} against an anyOf(url|domain) schema", () => {
    const result = validateX402Input({}, anyOfUrlOrDomain);
    expect(result.ok).toBe(false);
  });

  it("accepts a oneOf schema the same way as anyOf", () => {
    const schema = {
      type: "object",
      properties: { base64: { type: "string" }, image_url: { type: "string" } },
      oneOf: [{ required: ["base64"] }, { required: ["image_url"] }],
    };
    expect(validateX402Input({ base64: "aGVsbG8=" }, schema).ok).toBe(true);
    expect(validateX402Input({}, schema).ok).toBe(false);
  });

  it("tolerates extra/unknown keys alongside a valid field", () => {
    const schema = {
      type: "object",
      required: ["field"],
      properties: { field: { type: "string" } },
    };
    const result = validateX402Input({ field: "value", unrelated: "junk", another: 42 }, schema);
    expect(result.ok).toBe(true);
  });

  it("tolerates extra/unknown keys alongside a satisfied anyOf branch", () => {
    const result = validateX402Input(
      { domain: "x.com", unrelated: "junk" },
      anyOfUrlOrDomain,
    );
    expect(result.ok).toBe(true);
  });

  it("accepts when schema is null", () => {
    expect(validateX402Input({}, null).ok).toBe(true);
    expect(validateX402Input({ anything: "goes" }, null).ok).toBe(true);
  });

  it("accepts when schema is undefined", () => {
    expect(validateX402Input({}, undefined).ok).toBe(true);
  });

  it("accepts when schema has no properties key at all", () => {
    const schema = { type: "object" };
    expect(validateX402Input({}, schema).ok).toBe(true);
  });

  it("accepts when schema.properties is an empty object", () => {
    const schema = { type: "object", properties: {} };
    expect(validateX402Input({}, schema).ok).toBe(true);
  });
});
