import { afterEach, expect, it, vi } from "vitest";
import { Ajv } from "ajv";
vi.mock("./log.js", () => ({ logWarn: vi.fn() }));
import { logWarn } from "./log.js";
import { validateDispatchInput } from "./input-validation.js";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("H6 compiles equal schemas once, without coercing input", () => {
  const compile = vi.spyOn(Ajv.prototype, "compile");
  const schema = { type: "object", properties: { cached_unique: { type: "integer" } } };
  const input = { cached_unique: "7" };
  try {
    validateDispatchInput("cache-test", "do", schema, input);
    validateDispatchInput("cache-test", "do", structuredClone(schema), input);
    expect(compile).toHaveBeenCalledTimes(1);
    expect(input.cached_unique).toBe("7");
  } finally { compile.mockRestore(); }
});
it("H6 report is the default and logs only paths, slug and rail", () => {
  vi.stubEnv("INPUT_VALIDATION_MODE", "");
  const result = validateDispatchInput("test", "do", { type: "object", properties: { nested: { type: "object", properties: { email: { type: "string", format: "email" } } } } }, { nested: { email: "private-value" } });
  expect(result).toBeUndefined();
  expect(logWarn).toHaveBeenCalledWith("input-schema-mismatch", expect.any(String), { slug: "test", rail: "do", paths: ["/nested/email"] });
  expect(JSON.stringify(vi.mocked(logWarn).mock.calls)).not.toContain("private-value");
});
it.each([null, [], "text", 42])("H6 enforce rejects invalid root inputs %j", input => {
  vi.stubEnv("INPUT_VALIDATION_MODE", "enforce");
  expect(validateDispatchInput("test", "x402", { type: "object" }, input)).toMatchObject({ error_code: "invalid_input", details: { paths: [""], fix: expect.any(String) } });
});
it("H6 validates bounds, required fields and composition", () => {
  vi.stubEnv("INPUT_VALIDATION_MODE", "enforce");
  const schema = { type: "object", required: ["count"], properties: { count: { type: "integer", minimum: 1 }, choice: { enum: ["a", "b"] } }, anyOf: [{ required: ["a"] }, { required: ["b"] }] };
  expect(validateDispatchInput("test", "do", schema, { count: 0, choice: "secret-value" })).toMatchObject({ error_code: "invalid_input" });
  expect(validateDispatchInput("test", "do", schema, { count: 1, a: true })).toBeUndefined();
  expect(JSON.stringify(vi.mocked(logWarn).mock.calls)).not.toContain("secret-value");
});

const malformed = [{ type: "foo" }, { $ref: "missing-schema" }, { type: "string", pattern: "[" }, { type: "object", properties: { a: { type: "string" } }, required: "a" }, []];
it.each(malformed)("Round 2 caches malformed schema %j in report then fails closed in enforce", schema => {
  vi.stubEnv("INPUT_VALIDATION_MODE", "report");
  const compile = vi.spyOn(Ajv.prototype, "compile");
  try {
    for (let i = 0; i < 2; i++) expect(validateDispatchInput("broken", "wallet", schema, {})).toBeUndefined();
    expect(compile).toHaveBeenCalledTimes(1);
    expect(logWarn).toHaveBeenCalledTimes(1);
    expect(logWarn).toHaveBeenCalledWith("input-schema-compile-failed", expect.any(String), { slug: "broken", rail: "wallet" });
    vi.stubEnv("INPUT_VALIDATION_MODE", "enforce");
    expect(validateDispatchInput("broken", "wallet", schema, {})).toMatchObject({ error_code: "capability_unavailable", details: { fix: expect.any(String) } });
    expect(logWarn).toHaveBeenCalledTimes(1);
  } finally { compile.mockRestore(); }
});
it("Round 2 bounds a 10000-item invalid array's logged paths", () => {
  validateDispatchInput("large", "wallet", { type: "array", items: { type: "integer" } }, Array(10000).fill("private-value"));
  const paths = vi.mocked(logWarn).mock.calls[0][2]!.paths as string[];
  expect(paths.length).toBeGreaterThan(0);
  expect(paths.length).toBeLessThanOrEqual(20);
});
it("Round 2 catches validation exceptions and caches the failed validator", () => {
  const compile = vi.spyOn(Ajv.prototype, "compile").mockImplementationOnce(() => {
    return (() => { throw new Error("validator failed"); }) as never;
  });
  const schema = { title: "throwing-validator", type: "object" };
  try {
    expect(validateDispatchInput("throwing", "wallet", schema, {})).toBeUndefined();
    expect(validateDispatchInput("throwing", "wallet", schema, {})).toBeUndefined();
    expect(compile).toHaveBeenCalledOnce();
    expect(logWarn).toHaveBeenCalledOnce();
    vi.stubEnv("INPUT_VALIDATION_MODE", "enforce");
    expect(validateDispatchInput("throwing", "wallet", schema, {})).toMatchObject({ error_code: "capability_unavailable" });
  } finally { compile.mockRestore(); }
});
