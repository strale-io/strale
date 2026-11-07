/**
 * Bounds the work an HTML document can make jsdom do (robustness track R1).
 *
 * jsdom parses synchronously, so a hostile page blocks the whole API process
 * while it is parsed. A byte cap does not bound that time: parse5's tree
 * builder scans the stack of open elements on most tokens, so its cost grows
 * with nesting depth times token count, and a deep tree then overflows the
 * stack in the recursive code that walks it (Readability, cloneNode,
 * serialisation). Measured on main before this module: 16 KB of nested
 * <div> took 2 s and 64 KB took 34 s, both ending in a RangeError; 16 MB of
 * flat <p>x ran the process out of heap.
 *
 * Two layers, both before jsdom sees the page:
 *
 *  1. `boundHtmlForParse`, a single linear pass over the markup. It follows
 *     the HTML tokenizer closely enough to skip comments, script, style,
 *     title and textarea contents without regexes that backtrack, keeps a
 *     simplified model of the open-element stack, and rewrites only what is
 *     over a limit: opening tags past the depth limit are dropped (their text
 *     is kept), a tag keeps its first 64 attributes, and an attribute value
 *     is cut at 64 KB. A page with more elements or tags than the budget is
 *     refused with a thrown error. A page within every limit is returned
 *     as the same string, so its conversion is unchanged.
 *
 *  2. `assertParseWithinBounds`, a parse with parse5 itself (the parser jsdom
 *     uses, with jsdom's options) into a tree that keeps no text, counting the
 *     real open-element stack and tree depth. It throws as soon as either goes
 *     past a hard limit. The model in layer 1 is an approximation (the #964
 *     review desynced it with an <svg> inside <select>); this layer makes the
 *     depth and element bounds hold even for markup crafted to fool it, at the
 *     cost of a second parse5 pass, which is a small part of the conversion.
 *
 * These layers shape the tree; they do not bound the time. Both run, with
 * jsdom, Readability and Turndown, inside a worker thread with a wall-clock
 * and a heap limit (readability-convert.ts, readability-worker.ts), and that
 * limit is what keeps a slow page from holding the API.
 */

import { defaultTreeAdapter, parse, type DefaultTreeAdapterMap, type TreeAdapter } from "parse5";
import { ResourceLimitError } from "../../lib/resource-limits.js";

export const HTML_PARSE_LIMITS = {
  /**
   * Model depth past which opening tags are dropped (their text is kept).
   * Readability's cost grows about with the square of depth (0.41 s at 100,
   * 1.5 s at 256 in the third R1 review); real pages rarely nest past 60.
   */
  maxDepth: 128,
  /** Attributes kept per tag. */
  maxAttributesPerTag: 64,
  /** Characters kept per attribute value (inline data: images fit). */
  maxAttributeValueLength: 64 * 1024,
  /**
   * Start tags and comments in one page; a 1.1 MB API reference page has
   * about 25,600. This refuses the plainest markup bombs cheaply. It does not
   * bound conversion time: Readability's cost grows faster than the element
   * count (the #964 review measured 9.4 s for 10k flat <div>, 73 s for 29k).
   * The time bound is the worker's wall-clock limit (readability-convert.ts).
   */
  maxElements: 30_000,
  /** All markup tokens, end tags included. */
  maxMarkupTokens: 100_000,
  /** Hard limit on parse5's open-element stack and the tree's depth. */
  maxParsedDepth: 512,
} as const;

export type HtmlParseLimits = { -readonly [K in keyof typeof HTML_PARSE_LIMITS]: number };

export class HtmlTooComplexError extends ResourceLimitError {
  constructor(detail: string) {
    super(
      `This page's HTML is too complex to convert safely (${detail}). ` +
        "Try a simpler page on the same site, such as a single article.",
    );
    this.name = "HtmlTooComplexError";
  }
}

export interface BoundedHtml {
  /** The markup to parse; the input string itself when nothing was over a limit. */
  html: string;
  /** Opening and matching closing tags dropped for depth. */
  droppedTags: number;
  /** Tags whose attributes were cut. */
  truncatedTags: number;
  /** Markup tokens seen. */
  tokens: number;
  /** Start tags and comments seen. */
  elements: number;
}

// ── Element classes (WHATWG HTML §13.2) ────────────────────────────────────

const VOID = new Set([
  "area", "base", "basefont", "bgsound", "br", "col", "embed", "frame", "hr", "image", "img",
  "input", "keygen", "link", "meta", "param", "source", "track", "wbr",
]);
/** Start tags that never add an element of their own to the stack. */
const NO_PUSH = new Set(["html", "head", "body"]);
const RAW_TEXT = new Set(["style", "xmp", "iframe", "noembed", "noframes"]);
const RCDATA = new Set(["title", "textarea"]);
const FORMATTING = new Set([
  "a", "b", "big", "code", "em", "font", "i", "nobr", "s", "small", "strike", "strong", "tt", "u",
]);
const MARKERS = new Set(["applet", "object", "marquee", "td", "th", "caption", "template"]);
const DEFAULT_SCOPE = new Set(["applet", "caption", "html", "table", "td", "th", "marquee", "object", "template"]);
const BUTTON_SCOPE = new Set([...DEFAULT_SCOPE, "button"]);
const LIST_ITEM_SCOPE = new Set([...DEFAULT_SCOPE, "ol", "ul"]);
const TABLE_SCOPE = new Set(["html", "table", "template"]);
const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const SPECIAL = new Set([
  "address", "applet", "area", "article", "aside", "base", "basefont", "bgsound", "blockquote",
  "body", "br", "button", "caption", "center", "col", "colgroup", "dd", "details", "dir", "div",
  "dl", "dt", "embed", "fieldset", "figcaption", "figure", "footer", "form", "frame", "frameset",
  "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hgroup", "hr", "html", "iframe", "img",
  "input", "keygen", "li", "link", "listing", "main", "marquee", "menu", "meta", "nav", "noembed",
  "noframes", "noscript", "object", "ol", "p", "param", "plaintext", "pre", "script", "search",
  "section", "select", "source", "style", "summary", "table", "tbody", "td", "template",
  "textarea", "tfoot", "th", "thead", "title", "tr", "track", "ul", "wbr", "xmp",
]);
const CLOSES_P = new Set([
  "address", "article", "aside", "blockquote", "center", "details", "dialog", "dir", "div", "dl",
  "fieldset", "figcaption", "figure", "footer", "header", "hgroup", "main", "menu", "nav", "ol",
  "p", "search", "section", "summary", "ul", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "listing",
  "form", "hr", "xmp", "plaintext", "li", "dd", "dt",
]);
const BLOCK_END = new Set([
  "address", "article", "aside", "blockquote", "button", "center", "details", "dialog", "dir",
  "div", "dl", "fieldset", "figcaption", "figure", "footer", "header", "hgroup", "listing", "main",
  "menu", "nav", "ol", "pre", "search", "section", "summary", "ul",
]);
/** parse5's list of start tags that leave SVG/MathML content. */
const LEAVES_FOREIGN = new Set([
  "b", "big", "blockquote", "body", "br", "center", "code", "dd", "div", "dl", "dt", "em", "embed",
  "h1", "h2", "h3", "h4", "h5", "h6", "head", "hr", "i", "img", "li", "listing", "menu", "meta",
  "nobr", "ol", "p", "pre", "ruby", "s", "small", "span", "strong", "strike", "sub", "sup", "table",
  "tt", "u", "ul", "var",
]);
const TABLE_SECTIONS = new Set(["tbody", "thead", "tfoot"]);

const HTML_NS = 0;
const SVG_NS = 1;
const MATH_NS = 2;

interface Entry {
  name: string;
  ns: number;
  /** An HTML or MathML text integration point: its content is parsed as HTML. */
  ip: boolean;
  fmt: Formatting | null;
}
interface Formatting {
  name: string;
  /** Raw attribute text, or null when too long to compare (never "identical"). */
  sig: string | null;
  el: Entry | null;
  inList: boolean;
}
const MARKER_ENTRY = null;

/**
 * Simplified tree-construction model. Its job is to keep the depth parse5
 * will reach at or below `maxDepth` for ordinary and hostile markup alike;
 * where it cannot follow parse5 exactly it errs towards counting more, and
 * `assertParseWithinBounds` catches anything that still gets past it.
 */
class StackModel {
  readonly stack: Entry[] = [];
  /** Active formatting elements; null is a marker. */
  readonly active: (Formatting | null)[] = [];
  /** Formatting elements still active but popped: parse5 reopens them. */
  orphans = 0;
  frameset = false;
  /** parse5's form element pointer: set by <form>, cleared only by </form>. */
  formPointer: Entry | null = null;

  depth(): number {
    return this.stack.length + this.orphans;
  }

  top(): Entry | undefined {
    return this.stack[this.stack.length - 1];
  }

  /** True when parse5 would treat the next token as SVG/MathML content. */
  foreign(): boolean {
    const top = this.top();
    return top !== undefined && top.ns !== HTML_NS && !top.ip;
  }

  private popEntry(): void {
    const e = this.stack.pop()!;
    if (e.fmt && e.fmt.inList && e.fmt.el === e) {
      e.fmt.el = null;
      this.orphans++;
    }
    // parse5 clears the formatting list back to a marker whenever it closes
    // the element that pushed the marker (</td>, closing a cell, </object>).
    if (e.ns === HTML_NS && MARKERS.has(e.name)) this.clearToMarker();
  }

  popTo(index: number): void {
    while (this.stack.length > index) this.popEntry();
  }

  private removeAt(index: number): void {
    const [e] = this.stack.splice(index, 1);
    if (e!.fmt && e!.fmt.inList && e!.fmt.el === e) {
      e!.fmt.el = null;
      this.orphans++;
    }
  }

  private unlist(f: Formatting): void {
    if (!f.inList) return;
    f.inList = false;
    if (f.el === null) this.orphans--;
    const i = this.active.lastIndexOf(f);
    if (i >= 0) this.active.splice(i, 1);
  }

  clearToMarker(): void {
    while (this.active.length > 0) {
      const f = this.active.pop();
      if (f === MARKER_ENTRY || f === undefined) return;
      f.inList = false;
      if (f.el === null) this.orphans--;
    }
  }

  /** Index of the nearest open HTML element named `name` in scope, or -1. */
  inScope(match: (name: string) => boolean, boundaries: Set<string>): number {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const e = this.stack[i]!;
      // Any SVG/MathML element ends the search: parse5 treats several as
      // scope boundaries, and stopping early only ever counts more.
      if (e.ns !== HTML_NS) return -1;
      if (match(e.name)) return i;
      if (boundaries.has(e.name)) return -1;
    }
    return -1;
  }

  private isSpecial(e: Entry): boolean {
    return e.ns !== HTML_NS || SPECIAL.has(e.name);
  }

  push(name: string, ns: number, ip = false): Entry {
    const e: Entry = { name, ns, ip, fmt: null };
    this.stack.push(e);
    if (ns === HTML_NS && MARKERS.has(name)) this.active.push(MARKER_ENTRY);
    return e;
  }

  private pushFormatting(name: string, sig: string | null): void {
    const e = this.push(name, HTML_NS);
    // Noah's Ark clause: at most three identical entries after the last
    // marker. Only byte-identical attribute text counts as identical, so
    // this never removes an entry parse5 would keep.
    if (sig !== null) {
      let same = 0;
      let earliest = -1;
      for (let i = this.active.length - 1; i >= 0; i--) {
        const f = this.active[i];
        if (f === MARKER_ENTRY) break;
        if (f!.name === name && f!.sig === sig) {
          same++;
          earliest = i;
        }
      }
      if (same >= 3) this.unlist(this.active[earliest]!);
    }
    const f: Formatting = { name, sig, el: e, inList: true };
    e.fmt = f;
    this.active.push(f);
  }

  private lastActive(name: string): Formatting | undefined {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const f = this.active[i];
      if (f === MARKER_ENTRY) return undefined;
      if (f!.name === name) return f!;
    }
    return undefined;
  }

  private closeCell(): void {
    const i = this.inScope((n) => n === "td" || n === "th", TABLE_SCOPE);
    if (i >= 0) this.popTo(i); // popping the cell clears its marker
  }

  /** The adoption agency algorithm, one outer iteration, erring towards depth. */
  private adoptionAgency(name: string): void {
    const top = this.top();
    if (top && top.ns === HTML_NS && top.name === name && !(top.fmt && top.fmt.inList)) {
      this.popEntry();
      return;
    }
    const fe = this.lastActive(name);
    if (!fe) {
      this.genericEnd(name);
      return;
    }
    if (fe.el === null) {
      this.unlist(fe);
      return;
    }
    const index = this.stack.lastIndexOf(fe.el);
    for (let i = this.stack.length - 1; i > index; i--) {
      const e = this.stack[i]!;
      if (e.ns !== HTML_NS || DEFAULT_SCOPE.has(e.name)) return; // not in scope
    }
    let furthest = -1;
    for (let i = index + 1; i < this.stack.length; i++) {
      if (this.isSpecial(this.stack[i]!)) {
        furthest = i;
        break;
      }
    }
    if (furthest < 0) {
      fe.inList = false;
      const i = this.active.lastIndexOf(fe);
      if (i >= 0) this.active.splice(i, 1);
      this.popTo(index);
      return;
    }
    // parse5 moves the formatting element below the furthest block and
    // removes plain elements in between; keeping those counts more.
    this.stack.splice(index, 1);
    const clone: Entry = { name, ns: HTML_NS, ip: false, fmt: fe };
    this.stack.splice(furthest, 0, clone);
    fe.el = clone;
  }

  private genericEnd(name: string): void {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const e = this.stack[i]!;
      if (e.ns === HTML_NS && e.name === name) {
        this.popTo(i);
        return;
      }
      if (this.isSpecial(e)) return;
    }
  }

  /** Whether a start tag adds an element to the stack (and can be dropped). */
  pushes(name: string, selfClosing: boolean): boolean {
    if (this.foreign() && !LEAVES_FOREIGN.has(name)) return !selfClosing;
    if (VOID.has(name) || NO_PUSH.has(name)) return false;
    if (name === "form" && this.formIgnored()) return false;
    if (name === "script" || RAW_TEXT.has(name) || RCDATA.has(name)) return false;
    if ((name === "svg" || name === "math") && selfClosing) return false;
    return true;
  }

  /** Applies a kept start tag. Returns the raw-text mode it opens, if any. */
  startTag(name: string, selfClosing: boolean, attrs: ReadonlyMap<string, string>, sig: string | null): string | null {
    if (this.foreign()) {
      const leaves =
        LEAVES_FOREIGN.has(name) ||
        (name === "font" && (attrs.has("color") || attrs.has("face") || attrs.has("size")));
      if (!leaves) {
        const top = this.top()!;
        if (selfClosing) return null;
        let ns = top.ns;
        if (name === "svg" && top.ns === MATH_NS && top.name === "annotation-xml") ns = SVG_NS;
        this.push(name, ns, isIntegrationPoint(name, ns, attrs));
        return null;
      }
      while (this.foreign()) this.popEntry();
    }
    return this.htmlStartTag(name, selfClosing, attrs, sig);
  }

  private htmlStartTag(name: string, selfClosing: boolean, attrs: ReadonlyMap<string, string>, sig: string | null): string | null {
    if (VOID.has(name) || NO_PUSH.has(name)) {
      if (CLOSES_P.has(name)) this.closeP(); // hr
      return null;
    }
    if (name === "form" && this.formIgnored()) return null;
    if (name === "frameset") this.frameset = true;
    if (name === "script") return this.frameset ? null : "script";
    if (RAW_TEXT.has(name) || RCDATA.has(name)) {
      if (name === "xmp") this.closeP();
      if (this.frameset && name !== "noframes") return null;
      return name;
    }
    if (name === "svg" || name === "math") {
      if (!selfClosing) this.push(name, name === "svg" ? SVG_NS : MATH_NS);
      return null;
    }
    if (name === "li" || name === "dd" || name === "dt") {
      const matches = name === "li" ? (n: string) => n === "li" : (n: string) => n === "dd" || n === "dt";
      for (let i = this.stack.length - 1; i >= 0; i--) {
        const e = this.stack[i]!;
        if (e.ns === HTML_NS && matches(e.name)) {
          this.popTo(i);
          break;
        }
        if (this.isSpecial(e) && !(e.ns === HTML_NS && (e.name === "address" || e.name === "div" || e.name === "p"))) break;
      }
    }
    if (CLOSES_P.has(name)) this.closeP();
    if (HEADINGS.has(name)) {
      const top = this.top();
      if (top && top.ns === HTML_NS && HEADINGS.has(top.name)) this.popEntry();
    }
    if (name === "plaintext") {
      this.push(name, HTML_NS);
      return "plaintext";
    }
    if (name === "button") {
      const i = this.inScope((n) => n === "button", DEFAULT_SCOPE);
      if (i >= 0) this.popTo(i);
    }
    if (name === "nobr" && this.inScope((n) => n === "nobr", DEFAULT_SCOPE) >= 0) this.adoptionAgency(name);
    if (name === "a") {
      const fe = this.lastActive(name);
      if (fe) {
        const original = fe.el;
        this.adoptionAgency(name);
        if (fe.inList && fe.el === original) {
          this.unlist(fe);
          if (original) {
            const i = this.stack.lastIndexOf(original);
            if (i >= 0) this.stack.splice(i, 1);
          }
        }
      }
    }
    if (FORMATTING.has(name)) {
      this.pushFormatting(name, sig);
      return null;
    }
    if (name === "td" || name === "th") {
      this.closeCell();
      const top = this.top()?.name;
      if (top === "table") this.push("tbody", HTML_NS);
      if (top === "table" || (top !== undefined && TABLE_SECTIONS.has(top))) this.push("tr", HTML_NS);
    } else if (name === "tr") {
      this.closeCell();
      const i = this.inScope((n) => n === "tr", TABLE_SCOPE);
      if (i >= 0) this.popTo(i);
      if (this.top()?.name === "table") this.push("tbody", HTML_NS);
    } else if (TABLE_SECTIONS.has(name)) {
      this.closeCell();
      const i = this.inScope((n) => TABLE_SECTIONS.has(n), TABLE_SCOPE);
      if (i >= 0) this.popTo(i);
    } else if (name === "option" || name === "optgroup") {
      if (this.top()?.name === "option") this.popEntry();
    }
    const e = this.push(name, HTML_NS);
    if (name === "form") this.formPointer = e;
    return null;
  }

  /** parse5 ignores a <form> while its form pointer is set, outside <template>. */
  private formIgnored(): boolean {
    return this.formPointer !== null && !this.stack.some((e) => e.ns === HTML_NS && e.name === "template");
  }

  private closeP(): void {
    const i = this.inScope((n) => n === "p", BUTTON_SCOPE);
    if (i >= 0) this.popTo(i);
  }

  endTag(name: string): void {
    // parse5 applies the foreign-content end tag rules whenever the current
    // node is SVG/MathML, integration points included (unlike start tags).
    const top = this.top();
    if (top && top.ns !== HTML_NS) {
      if (name === "p" || name === "br") {
        while (this.foreign()) this.popEntry();
      } else {
        for (let i = this.stack.length - 1; ; i--) {
          if (i < 0) return; // only <html> is below: parse5 stops there
          const e = this.stack[i]!;
          if (e.ns === HTML_NS) break; // parse5 hands the tag to the HTML rules
          if (e.name === name) {
            this.popTo(i);
            return;
          }
        }
      }
    }
    this.htmlEndTag(name);
  }

  private htmlEndTag(name: string): void {
    let i: number;
    if (BLOCK_END.has(name)) {
      i = this.inScope((n) => n === name, DEFAULT_SCOPE);
      if (i >= 0) this.popTo(i);
    } else if (name === "form") {
      // parse5 removes the form its pointer names, if in scope, and nothing above it.
      const form = this.formPointer;
      this.formPointer = null;
      if (form) {
        i = this.inScope((n) => n === "form", DEFAULT_SCOPE);
        if (i >= 0 && this.stack[i] === form) this.removeAt(i);
      }
    } else if (name === "p") {
      this.closeP();
    } else if (name === "li") {
      i = this.inScope((n) => n === "li", LIST_ITEM_SCOPE);
      if (i >= 0) this.popTo(i);
    } else if (name === "dd" || name === "dt") {
      i = this.inScope((n) => n === name, DEFAULT_SCOPE);
      if (i >= 0) this.popTo(i);
    } else if (HEADINGS.has(name)) {
      i = this.inScope((n) => HEADINGS.has(n), DEFAULT_SCOPE);
      if (i >= 0) this.popTo(i);
    } else if (name === "applet" || name === "marquee" || name === "object") {
      i = this.inScope((n) => n === name, DEFAULT_SCOPE);
      if (i >= 0) this.popTo(i);
    } else if (name === "td" || name === "th" || name === "caption" || name === "tr" || name === "table" || TABLE_SECTIONS.has(name)) {
      i = this.inScope((n) => n === name, TABLE_SCOPE);
      if (i >= 0) this.popTo(i);
    } else if (name === "template") {
      for (i = this.stack.length - 1; i >= 0; i--) {
        const e = this.stack[i]!;
        if (e.ns === HTML_NS && e.name === "template") {
          this.popTo(i);
          break;
        }
      }
    } else if (name === "br" || NO_PUSH.has(name)) {
      // </br> is a <br>; </body> and </html> leave the stack as it is.
    } else if (FORMATTING.has(name)) {
      this.adoptionAgency(name);
    } else {
      this.genericEnd(name);
    }
  }
}

function isIntegrationPoint(name: string, ns: number, attrs: ReadonlyMap<string, string>): boolean {
  if (ns === SVG_NS) return name === "foreignobject" || name === "desc" || name === "title";
  if (ns === MATH_NS) {
    if (name === "mi" || name === "mo" || name === "mn" || name === "ms" || name === "mtext") return true;
    if (name === "annotation-xml") {
      const encoding = (attrs.get("encoding") ?? "").toLowerCase();
      return encoding === "text/html" || encoding === "application/xhtml+xml";
    }
  }
  return false;
}

// ── Tokenizer ──────────────────────────────────────────────────────────────

function isAlpha(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}
function isSpace(c: number): boolean {
  return c === 9 || c === 10 || c === 12 || c === 13 || c === 32;
}
function lowerAscii(s: string): string {
  return /[A-Z]/.test(s) ? s.replace(/[A-Z]+/g, (m) => m.toLowerCase()) : s;
}

/** End of a tag name: the tokenizer's tag name state runs to space, "/" or ">". */
function nameEndOf(html: string, nameStart: number): number {
  const n = html.length;
  let p = nameStart;
  while (p < n) {
    const c = html.charCodeAt(p);
    if (isSpace(c) || c === 47 /* / */ || c === 62 /* > */) break;
    p++;
  }
  return p;
}

interface ScannedTag {
  /** Index just past the closing ">". */
  end: number;
  nameEnd: number;
  selfClosing: boolean;
  attrCount: number;
  /** Index where the kept attributes end, when there are more than the limit. */
  cutAt: number;
  /** Values longer than the limit, as [start, end) pairs. */
  longValues: number[];
  /** Kept attributes (first value wins), for the few the model reads. */
  attrs: Map<string, string>;
}

/**
 * Scans a tag from `nameStart` (first character of its name) to its ">",
 * following the tokenizer's tag, attribute and value states. Returns null at
 * end of input: the tokenizer drops a tag that never ends.
 */
function scanTag(html: string, nameStart: number, limits: HtmlParseLimits, wantAttrs: boolean): ScannedTag | null {
  const n = html.length;
  let p = nameEndOf(html, nameStart);
  const tag: ScannedTag = {
    end: -1, nameEnd: p, selfClosing: false, attrCount: 0, cutAt: -1, longValues: [], attrs: new Map(),
  };
  for (;;) {
    while (p < n && isSpace(html.charCodeAt(p))) p++;
    if (p >= n) return null;
    let c = html.charCodeAt(p);
    if (c === 62) {
      tag.end = p + 1;
      return tag;
    }
    if (c === 47) {
      if (html.charCodeAt(p + 1) === 62) {
        tag.selfClosing = true;
        tag.end = p + 2;
        return tag;
      }
      p++;
      continue;
    }
    // Attribute name: the first character is taken whatever it is (even "=").
    const attrNameStart = p;
    p++;
    while (p < n) {
      c = html.charCodeAt(p);
      if (isSpace(c) || c === 47 || c === 62 || c === 61 /* = */) break;
      p++;
    }
    const attrNameEnd = p;
    let valueStart = -1;
    let valueEnd = -1;
    while (p < n && isSpace(html.charCodeAt(p))) p++;
    if (p < n && html.charCodeAt(p) === 61) {
      p++;
      while (p < n && isSpace(html.charCodeAt(p))) p++;
      if (p >= n) return null;
      c = html.charCodeAt(p);
      if (c === 34 || c === 39) {
        const close = html.indexOf(c === 34 ? '"' : "'", p + 1);
        if (close < 0) return null;
        valueStart = p + 1;
        valueEnd = close;
        p = close + 1;
      } else if (c !== 62) {
        valueStart = p;
        while (p < n) {
          c = html.charCodeAt(p);
          if (isSpace(c) || c === 62) break;
          p++;
        }
        valueEnd = p;
      }
    }
    tag.attrCount++;
    if (tag.attrCount <= limits.maxAttributesPerTag) {
      if (valueEnd - valueStart > limits.maxAttributeValueLength) tag.longValues.push(valueStart, valueEnd);
      if (wantAttrs) {
        const attrName = lowerAscii(html.slice(attrNameStart, attrNameEnd));
        if (!tag.attrs.has(attrName)) tag.attrs.set(attrName, valueStart < 0 ? "" : html.slice(valueStart, valueEnd));
      }
      if (tag.attrCount === limits.maxAttributesPerTag) tag.cutAt = p;
    }
  }
}

/** Finds `</name` followed by a delimiter, at or after `from`; -1 if none. */
const endTagFinders = new Map<string, RegExp>();
function findEndTag(html: string, name: string, from: number): number {
  let re = endTagFinders.get(name);
  if (!re) {
    re = new RegExp(`</${name}[\\t\\n\\f\\r />]`, "gi");
    endTagFinders.set(name, re);
  }
  re.lastIndex = from;
  const m = re.exec(html);
  return m ? m.index : -1;
}

function isScriptEndAt(html: string, p: number): boolean {
  // p is just past "</".
  return html.substr(p, 6).toLowerCase() === "script" && (() => {
    const c = html.charCodeAt(p + 6);
    return isSpace(c) || c === 47 || c === 62;
  })();
}

/**
 * Where a <script>'s content ends: the "<" of its end tag, or -1 at end of
 * input. Follows the tokenizer's script-data states, including the escaped
 * and double-escaped states that "<!--" and a nested "<script" open, in one
 * pass over the characters.
 */
function findScriptEnd(html: string, from: number): number {
  const n = html.length;
  const DATA = 0, ESCAPED = 1, ESC_DASH = 2, ESC_DASH_DASH = 3, DOUBLE = 4, DBL_DASH = 5, DBL_DASH_DASH = 6;
  let state = DATA;
  let p = from;
  while (p < n) {
    const c = html.charCodeAt(p);
    if (state === DATA) {
      if (c !== 60) {
        const next = html.indexOf("<", p);
        if (next < 0) return -1;
        p = next;
        continue;
      }
      const c1 = html.charCodeAt(p + 1);
      if (c1 === 47 && isScriptEndAt(html, p + 2)) return p;
      if (c1 === 33 /* ! */ && html.charCodeAt(p + 2) === 45 && html.charCodeAt(p + 3) === 45) {
        state = ESC_DASH_DASH;
        p += 4;
        continue;
      }
      p++;
      continue;
    }
    if (state === ESCAPED || state === ESC_DASH || state === ESC_DASH_DASH) {
      if (c === 45 /* - */) {
        state = state === ESCAPED ? ESC_DASH : ESC_DASH_DASH;
        p++;
        continue;
      }
      if (c === 62 && state === ESC_DASH_DASH) {
        state = DATA;
        p++;
        continue;
      }
      if (c !== 60) {
        state = ESCAPED;
        p++;
        continue;
      }
      // "<" in an escaped state.
      state = ESCAPED;
      const c1 = html.charCodeAt(p + 1);
      if (c1 === 47) {
        if (isScriptEndAt(html, p + 2)) return p;
        p += 2;
        continue;
      }
      if (isAlpha(c1)) {
        let q = p + 1;
        while (q < n && isAlpha(html.charCodeAt(q))) q++;
        const delim = html.charCodeAt(q);
        if (q < n && (isSpace(delim) || delim === 47 || delim === 62)) {
          if (html.slice(p + 1, q).toLowerCase() === "script") state = DOUBLE;
          p = q + 1;
        } else {
          p = q;
        }
        continue;
      }
      p++;
      continue;
    }
    // Double-escaped states.
    if (c === 45) {
      state = state === DOUBLE ? DBL_DASH : DBL_DASH_DASH;
      p++;
      continue;
    }
    if (c === 62 && state === DBL_DASH_DASH) {
      state = DATA;
      p++;
      continue;
    }
    if (c !== 60) {
      state = DOUBLE;
      p++;
      continue;
    }
    state = DOUBLE;
    if (html.charCodeAt(p + 1) === 47) {
      let q = p + 2;
      while (q < n && isAlpha(html.charCodeAt(q))) q++;
      const delim = html.charCodeAt(q);
      if (q < n && (isSpace(delim) || delim === 47 || delim === 62)) {
        if (html.slice(p + 2, q).toLowerCase() === "script") state = ESCAPED;
        p = q + 1;
      } else {
        p = q;
      }
      continue;
    }
    p++;
  }
  return -1;
}

/**
 * Rewrites `html` so that parsing it stays within `limits`, in one linear
 * pass. Returns the input string itself when nothing was over a limit.
 * Throws HtmlTooComplexError when the page has more markup than the budget.
 */
export function boundHtmlForParse(html: string, limits: HtmlParseLimits = HTML_PARSE_LIMITS): BoundedHtml {
  const n = html.length;
  const model = new StackModel();
  const dropped = new Map<string, number>();
  const out: string[] = [];
  let copiedTo = 0;
  let droppedTags = 0;
  let truncatedTags = 0;
  let tokens = 0;
  let elements = 0;
  // Next "-->" and "--!>" at or after the last search, -1 once none is left;
  // cached so that many comments cost one pass over the page, not one each.
  let dashCloseAt = -2;
  let bangCloseAt = -2;

  const replace = (start: number, end: number, text: string) => {
    out.push(html.slice(copiedTo, start), text);
    copiedTo = end;
  };
  /** Counts a token; `node` when it creates a node (a start tag or a comment). */
  const countToken = (node: boolean) => {
    if (++tokens > limits.maxMarkupTokens) {
      throw new HtmlTooComplexError(`more than ${limits.maxMarkupTokens} tags`);
    }
    if (node && ++elements > limits.maxElements) {
      throw new HtmlTooComplexError(`more than ${limits.maxElements} elements`);
    }
  };
  /** Emits a scanned tag, cutting attributes and values over the limits. */
  const emitTag = (start: number, tag: ScannedTag, isEnd: boolean) => {
    const overCount = tag.attrCount > limits.maxAttributesPerTag;
    if (!overCount && tag.longValues.length === 0) return;
    truncatedTags++;
    if (isEnd) {
      replace(start, tag.end, `${html.slice(start, tag.nameEnd)}>`);
      return;
    }
    const keepEnd = overCount ? tag.cutAt : tag.end;
    let text = "";
    let from = start;
    for (let k = 0; k < tag.longValues.length; k += 2) {
      const vs = tag.longValues[k]!;
      text += html.slice(from, vs + limits.maxAttributeValueLength);
      from = tag.longValues[k + 1]!;
    }
    text += html.slice(from, keepEnd);
    if (overCount) text += tag.selfClosing ? " />" : ">";
    replace(start, tag.end, text);
  };
  /** Raw attribute text, compared for the Noah's Ark clause. */
  const attrSignature = (tag: ScannedTag): string | null => {
    if (tag.end - tag.nameEnd > 1024 || tag.attrCount > limits.maxAttributesPerTag) return null;
    return html.slice(tag.nameEnd, tag.end - (tag.selfClosing ? 2 : 1)).trim();
  };

  let i = 0;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    const c = html.charCodeAt(lt + 1);

    if (isAlpha(c)) {
      // Start tag.
      const name = lowerAscii(html.slice(lt + 1, nameEndOf(html, lt + 1)));
      const tag = scanTag(html, lt + 1, limits, name === "font" || name === "annotation-xml");
      if (!tag) break;
      countToken(true);
      if (model.pushes(name, tag.selfClosing) && model.depth() >= limits.maxDepth) {
        dropped.set(name, (dropped.get(name) ?? 0) + 1);
        droppedTags++;
        replace(lt, tag.end, "");
        i = tag.end;
        continue;
      }
      emitTag(lt, tag, false);
      const mode = model.startTag(name, tag.selfClosing, tag.attrs, FORMATTING.has(name) ? attrSignature(tag) : null);
      i = tag.end;
      if (mode === null) continue;
      if (mode === "plaintext") break; // everything after is text
      // Raw text, RCDATA or script data: skip to the element's end tag.
      const endAt = mode === "script" ? findScriptEnd(html, i) : findEndTag(html, mode, i);
      if (endAt < 0) break; // text to end of input
      const endTag = scanTag(html, endAt + 2, limits, false);
      if (!endTag) break;
      countToken(false);
      emitTag(endAt, endTag, true);
      i = endTag.end;
      continue;
    }

    if (c === 47 /* / */) {
      const c2 = html.charCodeAt(lt + 2);
      if (isAlpha(c2)) {
        const tag = scanTag(html, lt + 2, limits, false);
        if (!tag) break;
        countToken(false);
        const name = lowerAscii(html.slice(lt + 2, tag.nameEnd));
        const pending = dropped.get(name);
        if (pending) {
          dropped.set(name, pending - 1);
          droppedTags++;
          replace(lt, tag.end, "");
        } else {
          emitTag(lt, tag, true);
          model.endTag(name);
        }
        i = tag.end;
        continue;
      }
      if (c2 === 62) {
        i = lt + 3; // "</>" is dropped by the tokenizer
        continue;
      }
      if (lt + 2 >= n) break;
      // Bogus comment to the next ">".
      const gt = html.indexOf(">", lt + 2);
      if (gt < 0) break;
      countToken(true);
      i = gt + 1;
      continue;
    }

    if (c === 33 /* ! */) {
      countToken(true);
      if (html.startsWith("--", lt + 2)) {
        const s = lt + 4;
        if (html.charCodeAt(s) === 62) {
          i = s + 1; // <!-->
          continue;
        }
        if (html.charCodeAt(s) === 45 && html.charCodeAt(s + 1) === 62) {
          i = s + 2; // <!--->
          continue;
        }
        if (dashCloseAt !== -1 && dashCloseAt < s) dashCloseAt = html.indexOf("-->", s);
        if (bangCloseAt !== -1 && bangCloseAt < s) bangCloseAt = html.indexOf("--!>", s);
        if (dashCloseAt < 0 && bangCloseAt < 0) break; // comment to end of input
        i = bangCloseAt < 0 || (dashCloseAt >= 0 && dashCloseAt < bangCloseAt) ? dashCloseAt + 3 : bangCloseAt + 4;
        continue;
      }
      if (html.startsWith("[CDATA[", lt + 2) && model.foreign()) {
        const close = html.indexOf("]]>", lt + 9);
        if (close < 0) break;
        i = close + 3;
        continue;
      }
      // DOCTYPE or bogus comment: both end at the next ">".
      const gt = html.indexOf(">", lt + 2);
      if (gt < 0) break;
      i = gt + 1;
      continue;
    }

    if (c === 63 /* ? */) {
      const gt = html.indexOf(">", lt + 2);
      if (gt < 0) break;
      countToken(true);
      i = gt + 1;
      continue;
    }

    i = lt + 1; // a "<" that starts no token is text
  }

  if (copiedTo === 0 && out.length === 0) return { html, droppedTags, truncatedTags, tokens, elements };
  out.push(html.slice(copiedTo));
  return { html: out.join(""), droppedTags, truncatedTags, tokens, elements };
}

// ── Exact backstop ─────────────────────────────────────────────────────────

class ParseBoundExceeded extends Error {}

/**
 * Parses `html` with parse5 exactly as jsdom will, into a tree without text,
 * and throws HtmlTooComplexError if the open-element stack or the tree gets
 * deeper than `maxParsedDepth`, or it creates more than twice `maxElements`
 * elements and comments (parse5 adds implied and reopened elements of its
 * own, so the pre-pass count is not the whole story). Aborts at the first
 * violation of those limits. End tags and text are not counted, so its own
 * running time still grows with the page (about 1-2 s for 15 MB of text);
 * like the rest of the conversion, it runs in the worker under its
 * wall-clock limit.
 */
export function assertParseWithinBounds(html: string, limits: HtmlParseLimits = HTML_PARSE_LIMITS): void {
  type Node = DefaultTreeAdapterMap["node"] & { boundDepth?: number };
  let stackDepth = 0;
  let nodes = 0;
  const maxNodes = 2 * limits.maxElements;
  const depthOf = (node: Node): number => node.boundDepth ?? 0;
  const place = (parent: Node, child: Node) => {
    const d = depthOf(parent) + 1;
    if (d > limits.maxParsedDepth) throw new ParseBoundExceeded("depth");
    child.boundDepth = d;
  };
  const adapter: TreeAdapter<DefaultTreeAdapterMap> = {
    ...defaultTreeAdapter,
    createElement(tagName, namespaceURI, attrs) {
      if (++nodes > maxNodes) throw new ParseBoundExceeded("nodes");
      return defaultTreeAdapter.createElement(tagName, namespaceURI, attrs);
    },
    createCommentNode(data) {
      if (++nodes > maxNodes) throw new ParseBoundExceeded("nodes");
      return defaultTreeAdapter.createCommentNode(data);
    },
    appendChild(parent, child) {
      place(parent as Node, child as Node);
      defaultTreeAdapter.appendChild(parent, child);
    },
    insertBefore(parent, child, reference) {
      place(parent as Node, child as Node);
      defaultTreeAdapter.insertBefore(parent, child, reference);
    },
    insertText() {},
    insertTextBefore() {},
    onItemPush() {
      if (++stackDepth > limits.maxParsedDepth) throw new ParseBoundExceeded("stack");
    },
    onItemPop() {
      stackDepth--;
    },
  };
  try {
    parse(html, { treeAdapter: adapter, scriptingEnabled: false });
  } catch (err) {
    if (err instanceof ParseBoundExceeded) {
      throw new HtmlTooComplexError(
        err.message === "nodes"
          ? `more than ${maxNodes} elements`
          : `nesting deeper than ${limits.maxParsedDepth} levels`,
      );
    }
    throw err;
  }
}

/** Both layers: the markup to hand to jsdom, or a thrown HtmlTooComplexError. */
export function prepareHtmlForParse(html: string, limits: HtmlParseLimits = HTML_PARSE_LIMITS): string {
  const bounded = boundHtmlForParse(html, limits);
  assertParseWithinBounds(bounded.html, limits);
  return bounded.html;
}
