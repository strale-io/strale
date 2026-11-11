import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { assertXmlShape } from "./nta-corporate.js";

const limits = { maxDepth: 8, maxElements: 5000 };

describe("assertXmlShape", () => {
  it.each([
    ["comment", "<root><!-- <a><a><a> --><child/></root>"],
    ["CDATA", "<root><![CDATA[<a><a><a>]]><child/></root>"],
  ])("does not count markup inside a %s", (_label, xml) => {
    expect(() => assertXmlShape(xml, { maxDepth: 2, maxElements: 2 })).not.toThrow();
  });

  it("counts a self-closing tag as an element without adding depth", () => {
    expect(() => assertXmlShape("<root><child/></root>", { maxDepth: 1, maxElements: 2 })).not.toThrow();
    expect(() => assertXmlShape("<root><child/></root>", { maxDepth: 1, maxElements: 1 })).toThrow(/element limit/);
  });

  it("stops safely at an unclosed comment", () => {
    expect(() => assertXmlShape("<root><!-- <a>".padEnd(1024 * 1024, "<"), limits)).not.toThrow();
  });

  it("rejects a 1 MiB hostile document in under 200 ms", () => {
    const xml = "<a>".repeat(Math.ceil(1024 * 1024 / 3));
    const started = performance.now();
    expect(() => assertXmlShape(xml, limits)).toThrow(/nesting limit/);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
