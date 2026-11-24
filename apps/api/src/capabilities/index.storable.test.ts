import { describe, expect, it } from "vitest";
import { getExecutor, registerCapability } from "./index.js";

describe("getExecutor removes characters the database cannot store", () => {
  it("cleans a tool's output and provenance before any caller records it", async () => {
    registerCapability("test-unstorable-output", async () => ({
      output: { text: "%PDF-1.7\u0000\u0000body", title: "x\uD800" },
      provenance: { source: "example\u0000.test", fetched_at: "2026-11-23T00:00:00Z" },
    }));
    const result = await getExecutor("test-unstorable-output")!({});
    expect(result.output).toEqual({ text: "%PDF-1.7body", title: "x" });
    expect(result.provenance.source).toBe("example.test");
    expect(result.provenance.unstorable_chars_removed).toBe(4);
    expect(JSON.stringify(result)).not.toMatch(/\\u0000|\\ud[89a-f]/i);
  });

  it("returns a clean result unchanged", async () => {
    const clean = { output: { text: "fine" }, provenance: { source: "s", fetched_at: "t" } };
    registerCapability("test-clean-output", async () => clean);
    expect(await getExecutor("test-clean-output")!({})).toBe(clean);
  });

  it("cleans a thrown error's message and keeps the same error object", async () => {
    class UpstreamRefusal extends Error {
      code = "upstream_refused";
    }
    const thrown = new UpstreamRefusal("upstream said \u0000no\uDC00");
    registerCapability("test-unstorable-error", async () => {
      throw thrown;
    });
    const caught = await getExecutor("test-unstorable-error")!({}).catch((e: unknown) => e);
    expect(caught).toBe(thrown);
    expect((caught as UpstreamRefusal).message).toBe("upstream said no");
    expect((caught as UpstreamRefusal).code).toBe("upstream_refused");
  });

  it("cleans a thrown string", async () => {
    registerCapability("test-unstorable-string-error", async () => {
      throw "bad\u0000 input";
    });
    await expect(getExecutor("test-unstorable-string-error")!({})).rejects.toBe("bad input");
  });

  it("rethrows a clean error untouched", async () => {
    const thrown = new Error("plain failure");
    registerCapability("test-clean-error", async () => {
      throw thrown;
    });
    await expect(getExecutor("test-clean-error")!({})).rejects.toBe(thrown);
    expect(thrown.message).toBe("plain failure");
  });

  it("cleans a thrown plain object's message", async () => {
    const thrown = { message: "nope\u0000", code: "refused" };
    registerCapability("test-unstorable-object-error", async () => {
      throw thrown;
    });
    await expect(getExecutor("test-unstorable-object-error")!({})).rejects.toBe(thrown);
    expect(thrown).toEqual({ message: "nope", code: "refused" });
  });

  it("rethrows a frozen error unchanged instead of failing", async () => {
    const thrown = Object.freeze(new Error("frozen\u0000"));
    registerCapability("test-frozen-error", async () => {
      throw thrown;
    });
    await expect(getExecutor("test-frozen-error")!({})).rejects.toBe(thrown);
  });

  it("rethrows an error whose message getter throws, unchanged", async () => {
    const thrown = new Proxy({}, { get() { throw new Error("getter"); } });
    registerCapability("test-throwing-getter-error", async () => {
      throw thrown;
    });
    await expect(getExecutor("test-throwing-getter-error")!({})).rejects.toBe(thrown);
  });
});
