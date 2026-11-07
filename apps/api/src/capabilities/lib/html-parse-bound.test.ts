/**
 * R1: a hostile page must not be able to stall the API through jsdom.
 *
 * The adversarial inputs are the brief's (url-to-markdown-parse-bound-2):
 * measured on main, 16 KB of nested <div> took 2 s, 64 KB took 34 s, nested
 * formatting tags took 10 s at 16 KB, and 16 MB of flat <p>x ran the process
 * out of heap. Each must now finish well inside 2 s or throw
 * HtmlTooComplexError. Ordinary pages must reach jsdom byte for byte as
 * before, which is what keeps their Markdown unchanged.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertParseWithinBounds,
  boundHtmlForParse,
  HTML_PARSE_LIMITS,
  HtmlTooComplexError,
  prepareHtmlForParse,
} from "./html-parse-bound.js";
// The markup bounds are measured on the in-process conversion: the worker
// that runs it in production adds its own time limit, tested in
// readability-convert.test.ts, and would make these timings depend on load.
import { convertHtmlToMarkdownSync as htmlToCleanMarkdown } from "./readability-convert-sync.js";
import { CONVERSION_LIMITS } from "./readability-convert.js";
import { ResourceLimitError } from "../../lib/resource-limits.js";

/**
 * CPU milliseconds this test process has used since `since` (user + system,
 * worker threads included). Vitest runs each test file in its own process
 * (pool: "forks"), so unlike wall-clock time this does not grow when other
 * test files load the machine: CI at full parallelism timed the same 5,000-deep
 * conversion at 2.4 s that takes well under 1 s of CPU.
 */
const cpuMs = (since: NodeJS.CpuUsage): number => {
  const d = process.cpuUsage(since);
  return (d.user + d.system) / 1000;
};

const KB = 1024;
const fill = (unit: string, bytes: number) => unit.repeat(Math.ceil(bytes / unit.length));

function articlePage(bytes: number): string {
  let html =
    "<!doctype html><html><head><title>Normal article</title></head><body>" +
    "<nav><a href='/'>Home</a></nav><article><h1>Heading</h1>";
  let i = 0;
  while (html.length < bytes) {
    i++;
    html += `<p>Paragraph ${i} with <a href="/x${i}">a link</a>, <strong>bold</strong> and <em>emphasis</em> text long enough to read as prose.</p>\n`;
    if (i % 20 === 0) html += `<h2>Section ${i}</h2><ul><li>one</li><li>two</li></ul><pre><code class="language-js">const x = ${i};</code></pre>`;
  }
  return `${html}</article><footer>f</footer></body></html>`;
}

/** Runs the conversion; returns how long it took and whether it threw. */
function convert(html: string): { ms: number; error: unknown; markdown: string | null } {
  const started = process.cpuUsage();
  try {
    const result = htmlToCleanMarkdown(html, "https://example.test/a");
    return { ms: cpuMs(started), error: null, markdown: result.markdown };
  } catch (error) {
    return { ms: cpuMs(started), error, markdown: null };
  }
}

const ADVERSARIAL: Array<[string, () => string]> = [
  ["nested <div>, 16 KB", () => fill("<div>", 16 * KB)],
  ["nested <div>, 32 KB", () => fill("<div>", 32 * KB)],
  ["nested <div>, 64 KB", () => fill("<div>", 64 * KB)],
  ["nested formatting tags, 16 KB", () => fill("<b><i><u><a>", 16 * KB)],
  ["nested formatting tags, 32 KB", () => fill("<b><i><u><a>", 32 * KB)],
  ["1 MB attribute flood on one tag", () => {
    let tag = "<p";
    for (let k = 0; tag.length < 1024 * KB; k++) tag += ` a${k}=1`;
    return `${tag}>words in the flooded paragraph</p>`;
  }],
  ["1 MB attribute value", () => `<p title="${fill("x", 1024 * KB)}">words</p>`],
];

describe("htmlToCleanMarkdown on adversarial markup", () => {
  it.each(ADVERSARIAL)("%s finishes under 2 s or refuses", (_label, make) => {
    const { ms, error } = convert(make());
    if (error) expect(error).toBeInstanceOf(HtmlTooComplexError);
    expect(ms).toBeLessThan(2_000);
  });

  it("16 MB of flat <p>x is refused before jsdom, without exhausting the heap", () => {
    const { ms, error } = convert(fill("<p>x", 16 * 1024 * KB));
    expect(error).toBeInstanceOf(HtmlTooComplexError);
    expect(ms).toBeLessThan(2_000);
  });

  it("a refusal is a ResourceLimitError, so the call is not billed and not a source failure", () => {
    const { error } = convert(fill("<p>x", 1024 * KB));
    expect(error).toBeInstanceOf(ResourceLimitError);
    expect((error as ResourceLimitError).isCapabilityRefusal).toBe(true);
    expect((error as Error).message).toMatch(/too complex to convert safely/);
  });

  it("deep nesting keeps the text: tags past the depth limit are dropped, not their content", () => {
    const html = `<body>${"<div>".repeat(5_000)}<p>The text inside the deep nest survives intact.</p></body>`;
    const { ms, error, markdown } = convert(html);
    // Before the bound this ended in a RangeError. At maxDepth 256 CI runners
    // spent about 2.8 s of CPU on it; at 128 it is about a third of that.
    // The bound sits well under the worker's limit, so a regression shows.
    expect(error).toBeNull();
    expect(ms).toBeLessThan(CONVERSION_LIMITS.timeoutMs / 4);
    // The cost grows with the square of depth; the limit itself is the guard
    // (timing alone did not catch a revert to 256 on every machine).
    expect(HTML_PARSE_LIMITS.maxDepth).toBeLessThanOrEqual(128);
    expect(markdown).toContain("The text inside the deep nest survives intact.");
  });
});

// ── Ordinary pages are untouched ───────────────────────────────────────────

const SLOPPY_SECTION = `
<!-- <div><div> a commented-out block --> <!--> <!---> <!-- bang close --!>
<nav><ul><li>Home<li>About<li>Contact</ul></nav>
<article><h1>Title</h1><p>Para one<p>Para two with <b>bold <i>both</b> italic</i> text
<p><font color=red>red<p>still red</font> and <b><p>bold para</b></p>
<table><tr><td>a<td>b<tr><td><b>c</td><td><font size=2>d</table>
<table><thead><tr><th>h</thead><tbody><tr><td>1</tbody></table>
<select><option>x<option>y<optgroup label=g><option>z</select>
<svg viewBox="0 0 10 10"><path d="M0 0"/><g><circle r="1"/></g><foreignObject><div>in fo</div></foreignObject></svg>
<svg><title>Icon</title><use href="#i"/></svg><svg/>
<math><mi>x</mi><annotation-xml encoding="text/html"><div>h</div></annotation-xml></math>
<a href="/1">one<a href="/2">two</a> <a href="/3">three
<textarea><div></textarea><noscript><p>no js</noscript><template><div>t</div></template>
<dl><dt>term<dd>def<dt>t2<dd>d2</dl>
<div data-a="1" data-b='2' data-c=3 hidden>attrs <span>unclosed span</div>
<pre>code</pre><iframe><div></iframe><xmp><div></xmp><title><div></title>
<button>b<button>c</button><form><form></form>
<script>var s = "<div><div></div>"; if (a < b && c > d) {} //<!-- <script> </script> --></script>
<script><!-- document.write("<div>") //--></script>
<style>p > a { color: red } /* </div> */</style>
<br/><img src=x.png alt=x /><hr><input type=checkbox checked>
<h2>Heading<h3>Sub</h3></h2><ol><li>a<li>b<ol><li>c</ol></ol>
<p>Final paragraph <small>small</small> <code>code</code> <s>strike</s>.
</article>`;

function sloppyPage(sections: number): string {
  return `<!DOCTYPE html><html><head><title>Sloppy</title><meta charset=utf-8></head><body>${SLOPPY_SECTION.repeat(sections)}</body></html>`;
}

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(resolve(here, "../__fixtures__/vasp/mica-page.sample.html"), "utf8");

describe("ordinary pages reach jsdom unchanged", () => {
  const pages: Array<[string, () => string]> = [
    ["a 200 KB article", () => articlePage(200 * KB)],
    ["a 500 KB article", () => articlePage(500 * KB)],
    ["a sloppy page", () => sloppyPage(1)],
    ["a long sloppy page (300 sections)", () => sloppyPage(300)],
    ["the MiCA register fixture", () => FIXTURE],
    ["an inline 60 KB data: image", () => `<p>pic <img src="data:image/png;base64,${"A".repeat(60 * KB)}"></p>`],
    ["64 attributes on one tag", () => `<p ${Array.from({ length: 64 }, (_, k) => `a${k}=${k}`).join(" ")}>x</p>`],
    ["depth exactly at the limit", () => `${"<div>".repeat(HTML_PARSE_LIMITS.maxDepth)}deep`],
  ];

  it.each(pages)("%s", (_label, make) => {
    const html = make();
    const bounded = boundHtmlForParse(html);
    expect(bounded.droppedTags).toBe(0);
    expect(bounded.truncatedTags).toBe(0);
    // The same string, not an equal copy: jsdom gets exactly what it got before.
    expect(bounded.html).toBe(html);
    expect(() => assertParseWithinBounds(html)).not.toThrow();
  });

  it("an ordinary article converts to the same Markdown as an unbounded parse would give", () => {
    const html = articlePage(100 * KB);
    const { error, markdown } = convert(html);
    expect(error).toBeNull();
    expect(prepareHtmlForParse(html)).toBe(html);
    expect(markdown).toContain("# Heading");
    expect(markdown).toContain("Paragraph 1 with [a link](https://example.test/x1)");
  });
});

// ── The pre-pass in detail ─────────────────────────────────────────────────

describe("boundHtmlForParse", () => {
  it("drops opening tags past the depth limit and their matching end tags", () => {
    const html = `${"<div>".repeat(300)}text${"</div>".repeat(300)}`;
    const bounded = boundHtmlForParse(html);
    expect(bounded.droppedTags).toBe(2 * (300 - HTML_PARSE_LIMITS.maxDepth));
    expect(bounded.html).toBe(`${"<div>".repeat(HTML_PARSE_LIMITS.maxDepth)}text${"</div>".repeat(HTML_PARSE_LIMITS.maxDepth)}`);
  });

  it("closed siblings never accumulate depth", () => {
    const html = "<div><span>x</span></div>".repeat(5_000);
    expect(boundHtmlForParse(html).html).toBe(html);
  });

  it("keeps the first 64 attributes of a tag", () => {
    const attrs = Array.from({ length: 100 }, (_, k) => `a${k}="${k}"`);
    const bounded = boundHtmlForParse(`<p ${attrs.join(" ")}>x</p>`);
    expect(bounded.truncatedTags).toBe(1);
    expect(bounded.html).toBe(`<p ${attrs.slice(0, 64).join(" ")}>x</p>`);
  });

  it("keeps a self-closing flag when cutting attributes", () => {
    const attrs = Array.from({ length: 70 }, (_, k) => `a${k}="${k}"`);
    const bounded = boundHtmlForParse(`<svg><path ${attrs.join(" ")}/></svg>`);
    expect(bounded.html).toBe(`<svg><path ${attrs.slice(0, 64).join(" ")} /></svg>`);
  });

  it("cuts an attribute value at the limit, keeping its quotes", () => {
    const long = "x".repeat(HTML_PARSE_LIMITS.maxAttributeValueLength + 10);
    const bounded = boundHtmlForParse(`<p title="${long}" id=a>x</p>`);
    expect(bounded.html).toBe(`<p title="${long.slice(0, HTML_PARSE_LIMITS.maxAttributeValueLength)}" id=a>x</p>`);
  });

  it("does not count markup inside comments, scripts, styles, textareas or titles", () => {
    const deep = "<div>".repeat(1_000);
    for (const html of [
      `<!-- ${deep} -->`,
      `<script>var s = "${deep}";</script>`,
      `<style>/* ${deep} */</style>`,
      `<textarea>${deep}</textarea>`,
      `<title>${deep}</title>`,
    ]) {
      const bounded = boundHtmlForParse(html);
      expect(bounded.droppedTags, html.slice(0, 20)).toBe(0);
      expect(bounded.html).toBe(html);
    }
  });

  it("follows a script's double-escaped state: an inner </script> does not end it", () => {
    // In parse5, "<!--<script>" double-escapes, so the first </script> only
    // returns to the escaped state and every <div> below is script text.
    const html = `<script><!--<script></script>${"<div>".repeat(1_000)}--></script><p>after</p>`;
    const bounded = boundHtmlForParse(html);
    expect(bounded.droppedTags).toBe(0);
    expect(bounded.html).toBe(html);
    expect(() => assertParseWithinBounds(html)).not.toThrow();
  });

  it('ends a comment at "--!>", as the tokenizer does, so markup after it counts', () => {
    const html = `<!-- x --!>${"<div>".repeat(1_000)}`;
    expect(boundHtmlForParse(html).droppedTags).toBe(1_000 - HTML_PARSE_LIMITS.maxDepth);
  });

  it("does not count self-closing SVG elements as open, but does count HTML ones", () => {
    expect(boundHtmlForParse(`<svg>${"<path/>".repeat(1_000)}</svg>`).droppedTags).toBe(0);
    // In HTML, "<div/>" opens a div: it is not self-closing.
    expect(boundHtmlForParse("<div/>".repeat(1_000)).droppedTags).toBe(1_000 - HTML_PARSE_LIMITS.maxDepth);
    // Inside foreignObject the content is HTML again.
    expect(boundHtmlForParse(`<svg><foreignObject>${"<div/>".repeat(1_000)}`).droppedTags).toBeGreaterThan(0);
  });

  it("refuses a page with more elements or tags than the budget, in one linear pass", () => {
    const started = process.cpuUsage();
    expect(() => boundHtmlForParse("<br>".repeat(HTML_PARSE_LIMITS.maxElements + 1))).toThrow(/more than 30000 elements/);
    expect(() => boundHtmlForParse("</br>".repeat(HTML_PARSE_LIMITS.maxMarkupTokens + 1))).toThrow(/more than 100000 tags/);
    expect(cpuMs(started)).toBeLessThan(1_000);
  });

  it("is linear on 16 MB of text with few tags", () => {
    const html = `<p>${fill("plain words and more words ", 16 * 1024 * KB)}</p>`;
    const started = process.cpuUsage();
    expect(boundHtmlForParse(html).html).toBe(html);
    expect(cpuMs(started)).toBeLessThan(1_000);
  });

  it("is linear on unterminated constructs", () => {
    for (const html of [
      fill("<!--", 4 * 1024 * KB),
      fill("<!-- --> --!", 4 * 1024 * KB),
      fill("<a", 4 * 1024 * KB),
      `<script>${fill("<!--<script>", 4 * 1024 * KB)}`,
      `<p title="${fill("x", 4 * 1024 * KB)}`,
    ]) {
      const started = process.cpuUsage();
      try {
        boundHtmlForParse(html);
      } catch (error) {
        expect(error).toBeInstanceOf(HtmlTooComplexError);
      }
      expect(cpuMs(started), html.slice(0, 16)).toBeLessThan(1_000);
    }
  });
});

describe("assertParseWithinBounds (the exact backstop)", () => {
  it("throws on markup the pre-pass model under-counts, before the parse gets expensive", () => {
    // parse5 reopens these formatting elements on every repetition; the
    // pre-pass's simplified model does not follow that, and the backstop,
    // which counts parse5's real stack, catches it.
    const html = boundHtmlForParse(fill("<b><i><u><a>", 32 * KB)).html;
    const started = process.cpuUsage();
    expect(() => assertParseWithinBounds(html)).toThrow(HtmlTooComplexError);
    expect(cpuMs(started)).toBeLessThan(500);
  });

  it("throws on deep nesting it is handed directly", () => {
    expect(() => assertParseWithinBounds("<div>".repeat(HTML_PARSE_LIMITS.maxParsedDepth + 10))).toThrow(
      /nesting deeper than 512 levels/,
    );
  });

  it("counts nesting inside <template>, whose content starts a new fragment", () => {
    expect(() => assertParseWithinBounds("<template>".repeat(HTML_PARSE_LIMITS.maxParsedDepth + 10))).toThrow(
      HtmlTooComplexError,
    );
  });

  it("parses <noscript> content as markup, as jsdom does with scripting disabled", () => {
    // With scripting enabled (parse5's default) this would be raw text.
    expect(() => assertParseWithinBounds(`<noscript>${"<div>".repeat(HTML_PARSE_LIMITS.maxParsedDepth + 10)}`)).toThrow(
      HtmlTooComplexError,
    );
  });
});
