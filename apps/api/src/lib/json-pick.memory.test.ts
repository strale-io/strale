/**
 * Review B2: json-pick must keep its memory promise ("one chunk plus the
 * picks") for the parts of a document it does NOT pick.
 *
 * Whoever publishes an npm package controls its packument, so a paid call can
 * be given a document built to make a naive reader grow:
 *   - one 64 MiB KEY (the first cut kept every key byte as a JS array element,
 *     8-16 bytes each: measured 1.6 GB for a 100 MB key);
 *   - 64 MiB of nested `[` / `{"a":` (one frame per level: 1.6-2.4 GB, and OOM
 *     for 100 MB).
 *
 * Each body is streamed (64 KiB chunks, never held), run through
 * readJsonPickWithLimit, and the peak of heapUsed + external is sampled while
 * it runs. Growth must stay under 32 MiB. The GC is exposed through V8 flags
 * so the baseline is a settled one.
 */

import { describe, expect, it } from "vitest";
import v8 from "node:v8";
import vm from "node:vm";
import { MAX_PACKUMENT_BYTES, ResourceLimitError, readJsonPickWithLimit } from "./resource-limits.js";

v8.setFlagsFromString("--expose-gc");
const gc = vm.runInNewContext("gc") as () => void;

const MIB = 1024 * 1024;
const CHUNK = 64 * 1024;
const BODY = 64 * MIB;
const enc = new TextEncoder();

/** A lazily generated body: `head`, then `fill` repeated up to `fillBytes`, then `tail`. */
function stream(head: string, fill: number | string, fillBytes: number, tail: string): Response {
  const fillChunk = typeof fill === "number" ? new Uint8Array(CHUNK).fill(fill) : enc.encode(fill.repeat(Math.ceil(CHUNK / fill.length)));
  let phase: 0 | 1 | 2 | 3 = 0;
  let sent = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(ctrl) {
        if (phase === 0) {
          ctrl.enqueue(enc.encode(head));
          phase = 1;
        } else if (phase === 1) {
          const n = Math.min(fillChunk.length, fillBytes - sent);
          if (n > 0) ctrl.enqueue(fillChunk.subarray(0, n));
          sent += n;
          if (sent >= fillBytes) phase = 2;
        } else if (phase === 2) {
          ctrl.enqueue(enc.encode(tail));
          phase = 3;
        } else ctrl.close();
      },
    },
    { highWaterMark: 0 },
  );
  return new Response(body, { status: 200 });
}

async function growthOf<T>(work: () => Promise<T>): Promise<{ result: T | Error; growthMiB: number }> {
  gc();
  gc();
  const used = () => process.memoryUsage().heapUsed + process.memoryUsage().external;
  const base = used();
  let peak = base;
  const timer = setInterval(() => {
    peak = Math.max(peak, used());
  }, 2);
  let result: T | Error;
  try {
    result = await work();
  } catch (e) {
    result = e as Error;
  }
  peak = Math.max(peak, used());
  clearInterval(timer);
  return { result, growthMiB: (peak - base) / MIB };
}

const LIMIT_MIB = 32;
// 200,000 kept entries are real objects (about 250 bytes each): the entry cap
// bounds them near 50 MiB, which is what the flood tests allow.
const FLOOD_LIMIT_MIB = 64;

describe("memory stays flat for the parts of a document that are not picked", () => {
  it("a 64 MiB key in an unpicked object", async () => {
    const res = stream('{"x":{"', "a", BODY, '":1},"name":"ok"}');
    const { result, growthMiB } = await growthOf(() => readJsonPickWithLimit(res, MAX_PACKUMENT_BYTES, { name: true }, "package"));
    expect(result).toEqual({ name: "ok" });
    expect(growthMiB, `grew ${growthMiB.toFixed(0)} MiB`).toBeLessThan(LIMIT_MIB);
  }, 60_000);

  it("a 64 MiB key in a picked object whose spec cannot match it", async () => {
    const res = stream('{"', "a", BODY, '":1,"name":"ok"}');
    const { result, growthMiB } = await growthOf(() => readJsonPickWithLimit(res, MAX_PACKUMENT_BYTES, { name: true }, "package"));
    expect(result).toEqual({ name: "ok" });
    expect(growthMiB, `grew ${growthMiB.toFixed(0)} MiB`).toBeLessThan(LIMIT_MIB);
  }, 60_000);

  it("a 64 MiB key under a wildcard is refused, not collected", async () => {
    const res = stream('{"versions":{"', "a", BODY, '":{}}}');
    const { result, growthMiB } = await growthOf(() => readJsonPickWithLimit(res, MAX_PACKUMENT_BYTES, { versions: { "*": true } }, "package"));
    expect(result).toBeInstanceOf(ResourceLimitError);
    expect((result as Error).message).toMatch(/'package' must be .* without a key longer than 4096 bytes/);
    expect(growthMiB, `grew ${growthMiB.toFixed(0)} MiB`).toBeLessThan(LIMIT_MIB);
  }, 60_000);

  it("64 MiB of nested arrays is refused at the depth limit", async () => {
    const res = stream('{"x":', 0x5b, BODY, "");
    const { result, growthMiB } = await growthOf(() => readJsonPickWithLimit(res, MAX_PACKUMENT_BYTES, { name: true }, "package"));
    expect(result).toBeInstanceOf(ResourceLimitError);
    expect((result as Error).message).toMatch(/'package' must be .* without nesting deeper than 128 levels/);
    expect(growthMiB, `grew ${growthMiB.toFixed(0)} MiB`).toBeLessThan(LIMIT_MIB);
  }, 60_000);

  it("64 MiB of nested objects is refused at the depth limit", async () => {
    const res = stream("{", '"a":{', BODY, "");
    const { result, growthMiB } = await growthOf(() => readJsonPickWithLimit(res, MAX_PACKUMENT_BYTES, { name: true }, "package"));
    expect(result).toBeInstanceOf(ResourceLimitError);
    expect(growthMiB, `grew ${growthMiB.toFixed(0)} MiB`).toBeLessThan(LIMIT_MIB);
  }, 60_000);

  it("deep nesting inside a PICKED value is refused too", async () => {
    const res = stream('{"time":', 0x5b, BODY, "");
    const { result, growthMiB } = await growthOf(() => readJsonPickWithLimit(res, MAX_PACKUMENT_BYTES, { time: true }, "package"));
    expect(result).toBeInstanceOf(ResourceLimitError);
    expect(growthMiB, `grew ${growthMiB.toFixed(0)} MiB`).toBeLessThan(LIMIT_MIB);
  }, 60_000);

  it("a picked value larger than 16 MiB is refused", async () => {
    const res = stream('{"readme":"', "x", 20 * MIB, '"}');
    const { result, growthMiB } = await growthOf(() => readJsonPickWithLimit(res, MAX_PACKUMENT_BYTES, { readme: true }, "package"));
    expect(result).toBeInstanceOf(ResourceLimitError);
    expect((result as Error).message).toMatch(/selected value larger than 16 MiB/);
    expect(growthMiB, `grew ${growthMiB.toFixed(0)} MiB`).toBeLessThan(LIMIT_MIB);
  }, 60_000);

  it("a wrong-shaped 40 MiB array where an object was named is not kept", async () => {
    const res = stream('{"versions":[', "1,", 40 * MIB, '0],"name":"ok"}');
    const { result, growthMiB } = await growthOf(() => readJsonPickWithLimit(res, MAX_PACKUMENT_BYTES, { name: true, versions: { "*": { scripts: true } } }, "package"));
    expect(result).toEqual({ versions: [], name: "ok" });
    expect(growthMiB, `grew ${growthMiB.toFixed(0)} MiB`).toBeLessThan(LIMIT_MIB);
  }, 60_000);

  it("cancels the response when the document is refused", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new Uint8Array(CHUNK).fill(0x5b));
      },
      cancel() {
        cancelled = true;
      },
    });
    // A body whose consumer throws mid-stream is cancelled, not left open.
    await expect(readJsonPickWithLimit(new Response(body), MAX_PACKUMENT_BYTES, { name: true })).rejects.toThrow();
    expect(cancelled).toBe(true);
  });

  /** `head`, then entries `entry(i)` forever (the cap must stop it), no tail. */
  function flood(head: string, entry: (i: number) => string): Response {
    let n = 0;
    let first = true;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(ctrl) {
          let out = first ? head : "";
          first = false;
          while (out.length < CHUNK && n < 12_000_000) out += entry(n++);
          ctrl.enqueue(enc.encode(out));
        },
      },
      { highWaterMark: 0 },
    );
    return new Response(body, { status: 200 });
  }

  it('a flood of keys under a "keys" pick is refused at the entry cap', async () => {
    const res = flood('{"versions":{', (i) => `"${i}":0,`);
    const { result, growthMiB } = await growthOf(() => readJsonPickWithLimit(res, MAX_PACKUMENT_BYTES, { versions: "keys" }, "package"));
    expect(result).toBeInstanceOf(ResourceLimitError);
    expect((result as Error).message).toMatch(/more than 200000 selected entries/);
    expect(growthMiB, `grew ${growthMiB.toFixed(0)} MiB`).toBeLessThan(FLOOD_LIMIT_MIB);
  }, 60_000);

  it("a flood of keys under a wildcard pick is refused at the entry cap", async () => {
    const res = flood('{"versions":{', (i) => `"${i}":{"a":1},`);
    const { result, growthMiB } = await growthOf(() => readJsonPickWithLimit(res, MAX_PACKUMENT_BYTES, { versions: { "*": { a: true } } }, "package"));
    expect(result).toBeInstanceOf(ResourceLimitError);
    expect((result as Error).message).toMatch(/selected entries/);
    expect(growthMiB, `grew ${growthMiB.toFixed(0)} MiB`).toBeLessThan(FLOOD_LIMIT_MIB);
  }, 60_000);

  it("a realistic number of versions (10,000) is accepted", async () => {
    const body = Array.from({ length: 10_000 }, (_, i) => `"1.0.${i}":{"a":1}`).join(",");
    const res = new Response(`{"versions":{${body}}}`);
    const out = await readJsonPickWithLimit(res, MAX_PACKUMENT_BYTES, { versions: { "*": { a: true } } }, "package");
    expect(Object.keys(out.versions)).toHaveLength(10_000);
  });
});

