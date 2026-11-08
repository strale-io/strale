import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import {
  HTML_TO_TEXT_INPUT_LIMIT,
  HTML_TO_TEXT_OUTPUT_LIMIT,
  htmlToText,
} from "./browserless-extract.js";

function oldHtmlToText(html: string): string {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(
    /<\/?(p|div|tr|td|th|li|h[1-6]|dt|dd|section|br)[^>]*>/gi,
    "\n"
  );
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\u00a0/g, " ");
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n\s*\n/g, "\n");
  return text.trim().slice(0, 15_000);
}

function elapsedMs(input: string): number {
  const start = performance.now();
  htmlToText(input);
  return performance.now() - start;
}

function medianElapsedMs(input: string): number {
  const samples = Array.from({ length: 5 }, () => elapsedMs(input)).sort(
    (a, b) => a - b
  );
  return samples[2];
}

describe("htmlToText", () => {
  it.each([
    [
      "paragraph page",
      "<main><p>Hello world.</p><p>Second paragraph.</p></main>",
    ],
    [
      "table",
      "<table><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>1</td></tr></table>",
    ],
    [
      "nested lists",
      "<ul><li>One<ul><li>Nested</li></ul></li><li>Two</li></ul>",
    ],
    [
      "script and style",
      `<script>const value = "1 < 2";</script><style>.x::after { content: "<"; }</style><p>Visible</p>`,
    ],
    ["entities", "Fish &amp; chips &lt;3 &gt; 2&nbsp;now\u00a0please"],
    ["mixed-case tags", "<DIV>Heading</DIV><P>Copy<BR>More</P>"],
    ["self-closing break", "before<br/>after"],
    [
      "inline tags",
      "<p>A <strong>bold</strong> and <em>useful</em> sentence.</p>",
    ],
  ])("matches the old output for an ordinary %s", (_name, html) => {
    expect(htmlToText(html)).toBe(oldHtmlToText(html));
  });

  it("does not expose the tail of a quoted attribute as text", () => {
    const html = '<div title="one > two">Visible</div>';
    expect(htmlToText(html)).toBe("Visible");
    expect(oldHtmlToText(html)).toBe('two">Visible');
  });

  it("drops an unclosed script because its contents are not page text", () => {
    const html = "Before<script>const secret = '<p';";
    expect(htmlToText(html)).toBe("Before");
    expect(oldHtmlToText(html)).toBe("Before const secret = '<p';");
  });

  it.each(["script", "style"])(
    "preserves source indices around a %s tag after length-changing Unicode case folds",
    (name) => {
      const html = `İ<${name}>hidden</${name}>after`;
      expect(htmlToText(html)).toBe("İafter");
      expect(htmlToText(html)).toBe(oldHtmlToText(html));
    }
  );

  it("preserves the five existing entity substitutions and no others", () => {
    const html = "&amp;|&lt;|&gt;|&nbsp;|\u00a0|&quot;|&AMP;|&#38;";
    expect(htmlToText(html)).toBe("&|<|>| | |&quot;|&AMP;|&#38;");
    expect(htmlToText(html)).toBe(oldHtmlToText(html));
  });

  it.each([
    ["repeated <p", "<p".repeat(512 * 1024)],
    ["repeated <", "<".repeat(1024 * 1024)],
    [
      "unclosed script",
      `<script>${"x".repeat(1024 * 1024)}`.slice(0, 1024 * 1024),
    ],
    [
      "unclosed style",
      `<style>${"x".repeat(1024 * 1024)}`.slice(0, 1024 * 1024),
    ],
    [
      "newline runs",
      "\n \n ".repeat(Math.ceil((1024 * 1024) / 4)).slice(0, 1024 * 1024),
    ],
    [
      "alternating tag prefixes and text",
      "<avisible text "
        .repeat(Math.ceil((1024 * 1024) / 15))
        .slice(0, 1024 * 1024),
    ],
  ])(
    "scans 1 MiB of hostile %s input within a generous bound",
    (_name, input) => {
      expect(input).toHaveLength(1024 * 1024);
      expect(elapsedMs(input)).toBeLessThan(500);
    }
  );

  it("grows linearly when hostile input doubles", () => {
    const oneMiB = "<".repeat(1024 * 1024);
    const twoMiB = oneMiB + oneMiB;
    const oneMiBTime = medianElapsedMs(oneMiB);
    const twoMiBTime = medianElapsedMs(twoMiB);
    expect(twoMiBTime).toBeLessThan(oneMiBTime * 3);
  });

  it("caps a huge benign page and stops after the bounded prefix", () => {
    const tenMiB = `<p>${"a".repeat(10 * 1024 * 1024)}</p>`;
    const start = performance.now();
    const result = htmlToText(tenMiB);
    const duration = performance.now() - start;
    expect(result).toHaveLength(HTML_TO_TEXT_OUTPUT_LIMIT);
    expect(duration).toBeLessThan(500);
    expect(HTML_TO_TEXT_INPUT_LIMIT).toBe(2 * 1024 * 1024);
  });

  it("collapses blank lines during the scan", () => {
    expect(htmlToText("first\n \n \nsecond")).toBe("first\nsecond");
  });

  it.each([
    ["CRLF", "first\n\r\nsecond"],
    ["form feed", "first\n\f\nsecond"],
    ["vertical tab", "first\n\v\nsecond"],
    ["Unicode whitespace", "first\n\u2003\nsecond"],
  ])("matches blank-line collapse through %s", (_name, html) => {
    expect(htmlToText(html)).toBe(oldHtmlToText(html));
    expect(htmlToText(html)).toBe("first\nsecond");
  });
});
