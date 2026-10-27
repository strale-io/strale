import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import Ajv from "ajv";
import { validateManifest, validateCapabilityStructure } from "../lib/onboarding-gates.js";
import type { Manifest } from "../lib/capability-manifest-types.js";
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: vi.fn(actual.randomInt), randomBytes: vi.fn(actual.randomBytes), randomUUID: vi.fn(actual.randomUUID) };
});
import { randomInt, randomBytes, randomUUID } from "node:crypto";
import { getExecutor } from "./index.js";
import { CapabilityRefusalError } from "../lib/capability-refusal.js";
import { classifyTransactionFailure } from "../lib/transaction-failure-taxonomy.js";
import "./secure-random.js";
const execute = getExecutor("secure-random")!;
beforeEach(() => vi.clearAllMocks());

it("returns UUIDv4 values, resolved parameters and provenance", async () => {
  const { output, provenance } = await execute({ operation: "uuid", count: 1000 });
  expect(output.operation).toBe("uuid");
  expect(output.parameters).toEqual({ operation: "uuid", count: 1000 });
  expect(output.values).toHaveLength(1000);
  for (const value of output.values as string[]) expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(provenance).toEqual({ source: "node:crypto CSPRNG", acquisition_method: "computed", fetched_at: expect.any(String) });
  expect(new Date(provenance.fetched_at).toISOString()).toBe(provenance.fetched_at);
});
it("defaults UUID count to one", async () => {
  expect((await execute({ operation: "uuid" })).output.values).toHaveLength(1);
});
it.each(["hex", "base64"] as const)("encodes exact byte lengths as %s", async encoding => {
  for (const length of [1, 7, 1024]) {
    const { output } = await execute({ operation: "bytes", length, encoding });
    const values = output.values as string;
    expect(Buffer.from(values, encoding)).toHaveLength(length);
    expect(Buffer.from(values, encoding).toString(encoding)).toBe(values);
  }
});
it("defaults bytes to hex", async () => {
  const { output } = await execute({ operation: "bytes", length: 3 });
  expect(output.parameters).toEqual({ operation: "bytes", length: 3, encoding: "hex" });
  expect(output.values).toMatch(/^[a-f0-9]{6}$/);
});
it.each([[-500, 499], [0, 0], [Number.MAX_SAFE_INTEGER - 9, Number.MAX_SAFE_INTEGER], [Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER + 9]])("fills inclusive range %s to %s without repeats", async (min, max) => {
  const count = max - min + 1;
  const { output } = await execute({ operation: "integers", min, max, count, unique: true });
  const values = output.values as number[];
  expect(values).toHaveLength(count);
  expect(new Set(values).size).toBe(count);
  expect(Math.min(...values)).toBe(min);
  expect(Math.max(...values)).toBe(max);
});
it("accepts largest supported randomInt range", async () => {
  const { output } = await execute({ operation: "integers", min: 0, max: 2 ** 48 - 2 });
  expect((output.values as number[])[0]).toBeGreaterThanOrEqual(0);
  expect((output.values as number[])[0]).toBeLessThanOrEqual(2 ** 48 - 2);
});
it("respects integer bounds and loose chi-square uniformity", async () => {
  const buckets = Array<number>(10).fill(0);
  for (let batch = 0; batch < 50; batch++) {
    const { output } = await execute({ operation: "integers", min: -5, max: 4, count: 1000 });
    expect(output.values).toHaveLength(1000);
    for (const value of output.values as number[]) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(-5);
      expect(value).toBeLessThanOrEqual(4);
      buckets[value + 5]++;
    }
  }
  // df=9, threshold far above ordinary sampling variation (tail < 1e-16).
  expect(buckets.reduce((sum, n) => sum + (n - 5000) ** 2 / 5000, 0)).toBeLessThan(100);
});
it("shuffles a copy preserving all elements and duplicate multiplicities", async () => {
  const items = [null, "item-1", "same", "same", 42, false];
  const original = [...items];
  const { output } = await execute({ operation: "shuffle", items });
  const values = output.values as unknown[];
  expect(values).toHaveLength(items.length);
  for (const item of items) expect(values.filter(v => JSON.stringify(v) === JSON.stringify(item))).toHaveLength(items.filter(v => JSON.stringify(v) === JSON.stringify(item)).length);
  expect(items).toEqual(original);
  expect(randomInt).toHaveBeenCalledTimes(items.length - 1);
});
it("uses Fisher–Yates index bounds", async () => {
  vi.mocked(randomInt).mockReturnValueOnce(0).mockReturnValueOnce(0);
  expect((await execute({ operation: "shuffle", items: [1, 2, 3] })).output.values).toEqual([2, 3, 1]);
  expect(randomInt).toHaveBeenNthCalledWith(1, 3);
  expect(randomInt).toHaveBeenNthCalledWith(2, 2);
});
it.each([0, 1, 10, 1000])("picks %s input positions without replacement", async k => {
  const items = Array.from({ length: 1000 }, (_, id) => id);
  const { output } = await execute({ operation: "pick", items, k });
  const values = output.values as number[];
  expect(values).toHaveLength(k);
  expect(new Set(values).size).toBe(k);
  for (const item of values) expect(items).toContainEqual(item);
  expect(items).toEqual(Array.from({ length: 1000 }, (_, i) => i));
});
it("allows empty shuffle and pick and duplicates at distinct positions", async () => {
  expect((await execute({ operation: "shuffle", items: [] })).output.values).toEqual([]);
  expect((await execute({ operation: "pick", items: [], k: 0 })).output.values).toEqual([]);
  expect((await execute({ operation: "pick", items: [1, 1], k: 2 })).output.values).toEqual([1, 1]);
});
describe("input refusals before entropy is requested", () => {
  it.each([
    null, [], {}, { operation: "password" }, { operation: "uuid", count: 0 },
    { operation: "uuid", count: 1001 }, { operation: "uuid", count: 1.2 },
    { operation: "uuid", count: "2" }, { operation: "uuid", count: null },
    { operation: "uuid", extra: true }, { operation: "bytes", length: 0 },
    { operation: "bytes", length: 1025 }, { operation: "bytes", length: 1.5 },
    { operation: "bytes", length: 1, encoding: "utf8" }, { operation: "bytes" },
    { operation: "integers", min: 5, max: 4 },
    { operation: "integers", min: 0, max: 2, count: 4, unique: true },
    { operation: "integers", min: 0, max: 2 ** 48 - 1 },
    { operation: "integers", min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER },
    { operation: "integers", min: NaN, max: 1 }, { operation: "integers", min: 0, max: Infinity },
    { operation: "integers", min: 0.1, max: 1 },
    { operation: "integers", min: 0, max: Number.MAX_SAFE_INTEGER + 1 },
    { operation: "integers", min: 0, max: 1, unique: "true" }, { operation: "integers", max: 1 },
    { operation: "shuffle", items: "abc" }, { operation: "shuffle", items: Array(1001).fill(1) },
    { operation: "pick", items: [1], k: 2 }, { operation: "pick", items: [1], k: -1 },
    { operation: "pick", items: [1], k: 0.5 }, { operation: "pick", items: [1] },
    { operation: "pick", items: Array(1001).fill(1), k: 1 },
  ])("rejects invalid input %# with actionable structured details", async input => {
    let error: unknown;
    try { await execute(input as never); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(CapabilityRefusalError);
    expect(error).toMatchObject({ code: "invalid_request", details: { field: expect.any(String), fix: expect.any(String) } });
    expect(classifyTransactionFailure((error as Error).message)).toBe("caller_input");
    expect(randomInt).not.toHaveBeenCalled();
    expect(randomBytes).not.toHaveBeenCalled();
    expect(randomUUID).not.toHaveBeenCalled();
  });
});
it("executor never uses Math.random", () => {
  expect(readFileSync(new URL("./secure-random.ts", import.meta.url), "utf8")).not.toMatch(/Math\s*\.\s*random/);
});

it("passes offline manifest authoring and structural gates", () => {
  const m = yaml.load(readFileSync(new URL("../../../../manifests/secure-random.yaml", import.meta.url), "utf8")) as Manifest;
  expect(validateManifest(m, false)).toEqual([]);
  expect(validateCapabilityStructure({
    slug: m.slug, name: m.name, description: m.description, category: m.category,
    priceCents: m.price_cents, isFreeTier: m.is_free_tier ?? false,
    inputSchema: m.input_schema, outputSchema: m.output_schema, dataSource: m.data_source,
    dataClassification: m.data_source_type, transparencyTag: m.transparency_tag ?? null,
    maintenanceClass: m.maintenance_class ?? null, processesPersonalData: m.processes_personal_data,
    gdprArt22Classification: "data_lookup",
  })).toEqual([]);
});
it("manifest schemas accept every operation and describe actual outputs", async () => {
  const m = yaml.load(readFileSync(new URL("../../../../manifests/secure-random.yaml", import.meta.url), "utf8")) as Manifest;
  const ajv = new Ajv({ strict: false });
  const validInput = ajv.compile(m.input_schema);
  const validOutput = ajv.compile(m.output_schema);
  const inputs = [
    { operation: "integers", min: 0, max: 9, count: 3 },
    { operation: "uuid", count: 2 }, { operation: "bytes", length: 4 },
    { operation: "shuffle", items: [1, 2] }, { operation: "pick", items: [1, 2], k: 1 },
  ];
  for (const input of inputs) {
    expect(validInput(input), JSON.stringify(validInput.errors)).toBe(true);
    const { output } = await execute(input);
    expect(validOutput(output), JSON.stringify(validOutput.errors)).toBe(true);
    expect(Object.keys(output).sort()).toEqual(Object.keys(m.output_field_reliability).sort());
  }
  expect(validInput({ operation: "uuid", min: 1 })).toBe(false);
  expect(validInput({ operation: "shuffle", items: [{}] })).toBe(false);
  expect(validInput({ operation: "pick", items: [[1]], k: 1 })).toBe(false);
  expect(validOutput({ operation: "shuffle", values: [], parameters: { operation: "shuffle", items: [] } })).toBe(false);
  const fixture = m.test_fixtures.known_answer;
  if (!fixture || Array.isArray(fixture)) throw new Error("Expected one known-answer fixture");
  const { output } = await execute(fixture.input);
  for (const field of fixture.expected_fields) {
    const value = field.field.split(".").reduce<unknown>((v, key) => (v as Record<string, unknown>)?.[key], output);
    if (field.operator === "type") expect(Array.isArray(value) ? "array" : typeof value).toBe(field.value);
    else if (field.operator === "equals") expect(value).toBe(field.value);
    else throw new Error("Unexpected fixture assertion");
  }
});

it.each(["shuffle", "pick"] as const)("bounds %s UTF-8 JSON bytes and echoes only items_count", async operation => {
  // The brackets and quotes take four bytes; multibyte characters count by UTF-8 bytes.
  const items = ["é".repeat((65536 - 4) / 2)];
  const input = { operation, items, ...(operation === "pick" ? { k: 1 } : {}) };
  const { output } = await execute(input);
  expect(Buffer.byteLength(JSON.stringify(items), "utf8")).toBe(65536);
  expect(output.values).toEqual(items);
  expect(output.parameters).toEqual({ operation, items_count: 1, ...(operation === "pick" ? { k: 1 } : {}) });
  vi.clearAllMocks();
  const fix = "Send at most 64 KB of items; send IDs or indexes instead of full objects";
  await expect(execute({ ...input, items: [items[0] + "a"] })).rejects.toMatchObject({
    message: `'items' must be corrected: ${fix}`,
    details: { field: "items", fix },
  });
  // Escaping counts too: a newline serializes as two bytes.
  await expect(execute({ ...input, items: ["\n".repeat(32767)] })).rejects.toMatchObject({ details: { field: "items", fix } });
  expect(randomInt).not.toHaveBeenCalled();
});

it.each([
  [{ operation: "integers", min: 0 }, "max", "Provide 'max' as an integer."],
  [{ operation: "pick", items: [] }, "k", "Provide 'k' as an integer."],
  [{ operation: "shuffle" }, "items", "Provide 'items' as an array of scalars."],
  [{ operation: "uuid", count: "2" }, "count", "Send 'count' as a JSON number from 1 to 1000."],
  [{ operation: "uuid", count: 1.5 }, "count", "Send 'count' as a JSON number from 1 to 1000."],
  [{ operation: "uuid", count: 0 }, "count", "Send 'count' as a JSON number from 1 to 1000."],
  [{ operation: "uuid", count: 1001 }, "count", "Send 'count' as a JSON number from 1 to 1000."],
  [{ operation: "uuid", foo: true }, "foo", "Remove 'foo'; operation 'uuid' accepts only 'count'."],
  [{ operation: "uuid", foo: true, bar: 2 }, "foo", "Remove 'foo', 'bar'; operation 'uuid' accepts only 'count'."],
  [{ operation: "bytes", length: 1, encoding: "utf8" }, "encoding", "Send 'encoding' as 'hex' or 'base64'."],
  [{ operation: "bytes", length: Infinity }, "length", "Send 'length' as a JSON integer from 1 to 1024."],
  [{ operation: "other" }, "operation", "Send 'operation' as 'integers', 'uuid', 'bytes', 'shuffle' or 'pick'."],
  [{ operation: "shuffle", items: [{}] }, "items.0", "Send each item as a JSON scalar (string, number, boolean or null); send IDs or indexes instead of full objects."],
  [{ operation: "pick", items: [[[[[1]]]]], k: 1 }, "items.0", "Send each item as a JSON scalar (string, number, boolean or null); send IDs or indexes instead of full objects."],
  [null, "input", "Send a JSON object with an 'operation' and its accepted fields."],
] as const)("names the exact fix for Zod refusal %#", async (input, field, fix) => {
  const message = `'${field}' must be corrected: ${fix}`;
  await expect(execute(input as never)).rejects.toMatchObject({ message, code: "invalid_request", details: { field, fix } });
  expect(classifyTransactionFailure(message)).toBe("caller_input");
  expect(randomInt).not.toHaveBeenCalled();
  expect(randomBytes).not.toHaveBeenCalled();
  expect(randomUUID).not.toHaveBeenCalled();
});

it.each(["unique", "shuffle", "pick"] as const)("keeps %s permutation cells uniform", async operation => {
  const permutations: number[][] = [];
  for (const a of [0, 1, 2, 3]) for (const b of [0, 1, 2, 3])
    for (const c of [0, 1, 2, 3]) for (const d of [0, 1, 2, 3])
      if (new Set([a, b, c, d]).size === 4) permutations.push([a, b, c, d]);
  // pick's ordered triples give 4P3=24 cells, exercising a partial sample.
  const buckets = new Map(permutations.map(p => [(operation === "pick" ? p.slice(0, 3) : p).join(","), 0]));
  const input = operation === "unique"
    ? { operation: "integers", min: 0, max: 3, count: 4, unique: true }
    : { operation, items: [0, 1, 2, 3], ...(operation === "pick" ? { k: 3 } : {}) };
  for (let i = 0; i < 24000; i++) {
    const { output } = await execute(input);
    const key = (output.values as number[]).join(",");
    const n = buckets.get(key);
    if (n === undefined) throw new Error("Result is not a permutation cell");
    buckets.set(key, n + 1);
  }
  const chiSquare = [...buckets.values()].reduce((sum, n) => sum + (n - 1000) ** 2 / 1000, 0);
  // Finite-sample false-failure probability < 1e-9, without a chi-square approximation:
  // X² >= 1500 implies some cell deviates by >= 250 from its mean 1000.
  // Binomial Bernstein + union bound: 24*2*exp(-250²/(2*24000*(1/24)*(23/24)+2*250/3))
  // = 48*exp(-30) < 4.5e-12 per operation; all three combined < 1.35e-11.
  expect(chiSquare).toBeLessThan(1500);
});
