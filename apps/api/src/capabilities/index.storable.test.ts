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
});
