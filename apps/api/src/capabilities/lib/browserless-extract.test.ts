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

function minimumElapsedMs(input: string): number {
  return Math.min(...Array.from({ length: 7 }, () => elapsedMs(input)));
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
    ["space before a double newline", "Hello \n\nWorld"],
    ["pre prefix", "Before<pre>code</pre>After"],
    ["thead prefix", "<table><thead><tr><th>A</th></tr></thead></table>"],
    ["tbody prefix", "<table><tbody><tr><td>A</td></tr></tbody></table>"],
    ["leading carriage returns", "\r\r\rVisible"],
  ])("matches the old output for an ordinary %s", (_name, html) => {
    expect(htmlToText(html)).toBe(oldHtmlToText(html));
  });

  it("ends a tag at its first >, as the old function did, so quotes cannot hide text", () => {
    // Quote-aware tag ends were tried in review rounds 1 and 2: a stray
    // apostrophe emptied the page, and the fallback rescanned per tag. The old
    // regex's first-`>` rule is kept; a `>` inside a quoted attribute leaks its
    // tail, as it always did.
    const html = '<div title="one > two">Visible</div>';
    expect(htmlToText(html)).toBe(oldHtmlToText(html));
  });

  it("drops an unclosed script because its contents are not page text", () => {
    const html = "Before<script>const secret = '<p';";
    expect(htmlToText(html)).toBe("Before");
    expect(oldHtmlToText(html)).toBe("Before const secret = '<p';");
  });

  it("falls back to the first tag end for an unmatched apostrophe", () => {
    for (const html of [
      "<!-- Don't remove --><p>Price</p>",
      "<p title=don't>text</p>",
      "<p title=don't>Price</p><p>Bob's shop</p>",
      "<p title=don't>It's here</p>",
      "<img alt=Petter's>Petter's bio is short.</p><p>Next</p>",
      "Price < 100 for all",
      "a <> b",
      "Tail <!-- never closed",
    ]) {
      expect(htmlToText(html)).toBe(oldHtmlToText(html));
    }
  });

  it("keeps scripts inside comments and skips only real opening script tags", () => {
    const html =
      "Intro<!-- <script src=x></script> --><p>Return window</p><p>Refunds</p><script>x</script><p>Contact us</p>";
    expect(htmlToText(html)).toBe("Intro \nReturn window\nRefunds\nContact us");
  });

  it.each([
    ["stray script close", "Before</script>After", "Before After"],
    [
      "script-like custom element",
      "Before<script-loader>After",
      "Before After",
    ],
  ])("does not start a skip for a %s", (_name, html, expected) => {
    expect(htmlToText(html)).toBe(expected);
  });

  it("retains the scanner's intentional handling of whitespace after <", () => {
    expect(oldHtmlToText("Before< p>After")).toBe("Before After");
    expect(htmlToText("Before< p>After")).toBe("Before\nAfter");
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
    [
      "repeated unmatched quotes",
      "<a '".repeat(256 * 1024).slice(0, 1024 * 1024),
    ],
    [
      "repeated unclosed comments",
      "<!-- don't".repeat(1024 * 103).slice(0, 1024 * 1024),
    ],
    // Review round 2 found both of these quadratic (over 60 s and 36 s).
    [
      "repeated comments with no close but a tag end",
      "<!-- x>".repeat(Math.ceil((1024 * 1024) / 7)).slice(0, 1024 * 1024),
    ],
    [
      "balanced quote pairs ending in an unmatched quote",
      "xxx" + "<'>'".repeat(256 * 1024 - 1) + "'",
    ],
    [
      "closed script pairs",
      "<script>x</script>"
        .repeat(Math.ceil((1024 * 1024) / 18))
        .slice(0, 1024 * 1024),
    ],
    [
      "quoted tag ends that close later",
      "<a 'x>y'z ".repeat(Math.ceil((1024 * 1024) / 10)).slice(0, 1024 * 1024),
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
    const oneMiBTime = minimumElapsedMs(oneMiB.slice(0, 512 * 1024));
    const twoMiBTime = minimumElapsedMs(twoMiB);
    expect(twoMiBTime).toBeLessThanOrEqual(oneMiBTime * 8);
    expect(twoMiBTime).toBeLessThan(2_000);
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
