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

  it("counts every attribute, and refuses 1 MiB of attributes fast", () => {
    const limited = { ...limits, maxAttributes: 2 };
    expect(() => assertXmlShape('<root a="1" b="2"><c/></root>', limited)).not.toThrow();
    expect(() => assertXmlShape('<root a="1"><c b="2" d="3"/></root>', limited)).toThrow(/attribute limit/);
    // An '=' inside a quoted value or in text is not an attribute.
    expect(() => assertXmlShape('<root a="x=y=z">p=q</root>', { ...limits, maxAttributes: 1 })).not.toThrow();
    let flood = "<corporations";
    for (let i = 0; flood.length < 1024 * 1024; i++) flood += ` a${i}=""`;
    flood += "><count>1</count></corporations>";
    const started = performance.now();
    expect(() => assertXmlShape(flood, { ...limits, maxAttributes: 64 })).toThrow(/attribute limit/);
    expect(performance.now() - started).toBeLessThan(200);
  });

  it.each([
    ["comments", "<!---->"],
    ["processing instructions", "<?p?>"],
    ["CDATA sections", "<![CDATA[]]>"],
  ])("counts %s toward the node limit", (_label, unit) => {
    const xml = `<root>${unit.repeat(10)}</root>`;
    expect(() => assertXmlShape(xml, { ...limits, maxNodes: 11 })).not.toThrow();
    expect(() => assertXmlShape(xml, { ...limits, maxNodes: 10 })).toThrow(/node limit/);
  });

  it("rejects a 1 MiB hostile document in under 200 ms", () => {
    const xml = "<a>".repeat(Math.ceil(1024 * 1024 / 3));
    const started = performance.now();
    expect(() => assertXmlShape(xml, limits)).toThrow(/nesting limit/);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
