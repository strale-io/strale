import { describe, expect, it } from "vitest";
import { bodyHasMoreTextThan, bodyVisibleText, hasMoreTextThan, strippedTextLength, TEXT_CHECK_WINDOW } from "./stripped-text-length.js";

/** The regex chain url-to-markdown used before, kept here as the reference. */
function reference(html: string): number {
  let stripped = html;
  stripped = stripped.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  stripped = stripped.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  stripped = stripped.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
  stripped = stripped.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
  stripped = stripped.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
  stripped = stripped.replace(/<[^>]+>/g, " ");
  return stripped.replace(/\s+/g, " ").trim().length;
}

/** Small deterministic PRNG, so a failure reproduces. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const FRAGMENTS = [
  "<script>", "</script>", "<SCRIPT type=x>", "</Script>", "<scripts>", "<script", "<style>", "</style>",
  "<nav class=a>", "</nav>", "<NAV>", "<footer>", "</footer>", "<header>", "</header>", "<head>", "<headers>",
  "<", ">", "<>", "<<", ">>", "</", "<a>", "<p>", "</p>", "text", " ", "\n", "\t", "word ", "é", "<!-- x -->",
  "</scr", "ipt>", "<scr", "<nav", "</nav", "x>", " ", "İ", "K",
];

describe("strippedTextLength", () => {
  it("matches the regex chain on ordinary pages", () => {
    const pages = [
      "<html><head><title>T</title><style>p{}</style></head><body><header>H</header><nav>N</nav><p>Hello <b>world</b></p><footer>F</footer><script>var a='<p>';</script></body></html>",
      `<body>${"<p>Some readable text in a paragraph.</p>".repeat(200)}</body>`,
      "<div>no closing tags at all <p>still text",
      "",
    ];
    for (const html of pages) expect(strippedTextLength(html)).toBe(reference(html));
  });

  it("matches the regex chain on 5,000 random fragment soups", () => {
    const random = prng(20261106);
    for (let run = 0; run < 5_000; run++) {
      const parts: string[] = [];
      const length = 1 + Math.floor(random() * 30);
      for (let k = 0; k < length; k++) parts.push(FRAGMENTS[Math.floor(random() * FRAGMENTS.length)]!);
      const html = parts.join("");
      expect(strippedTextLength(html), JSON.stringify(html)).toBe(reference(html));
    }
  });

  it("stays linear where the regexes were quadratic", () => {
    // Measured on the regex chain: 256 KB of "<a" took 13 s, 256 KB of
    // "<script>" 1.7 s, growing with the square of the size.
    for (const html of ["<a".repeat(4 * 1024 * 1024), "<script>".repeat(1024 * 1024), "<nav>".repeat(2 * 1024 * 1024)]) {
      const started = performance.now();
      strippedTextLength(html);
      expect(performance.now() - started, html.slice(0, 8)).toBeLessThan(1_000);
    }
  });
});

describe("bodyVisibleText", () => {
  const regexVersion = (html: string): string => {
    const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    return m
      ? m[1]
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, "")
          .trim()
      : "";
  };

  it("returns exactly what the regex chain returns", () => {
    const cases = [
      "<html><BODY class=x><p>Hello <b>world</b></p><script>var a = '<p>'</script></Body></html>",
      "<body><p>a</p></body><body><p>b</p></body>",
      "<body>no close",
      "<body",
      "</body><body>after</body>",
      "<body><style>p{}</style>x<STYLE>y",
      "<body><p>İstanbul ß <i>x</i></p></body>",
      "<bodyx>odd tag</body>",
    ];
    for (const html of cases) expect(bodyVisibleText(html), html).toBe(regexVersion(html));
    const alphabet = ["<", ">", "/", "body", "BODY", "script", "style", "p", "x", " ", "</body>", "<body>"];
    for (let k = 0; k < 3_000; k++) {
      let html = "";
      const n = 1 + Math.floor(Math.random() * 14);
      for (let j = 0; j < n; j++) html += alphabet[Math.floor(Math.random() * alphabet.length)];
      expect(bodyVisibleText(html), JSON.stringify(html)).toBe(regexVersion(html));
    }
  });

  it("is linear on a flood of <body>", () => {
    // The regex took over 4 s on this (second R1 review of #964).
    const html = `<html><body>${"<body>".repeat(43_690)}`;
    const started = performance.now();
    bodyVisibleText(html);
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe("the windowed text checks", () => {
  const W = TEXT_CHECK_WINDOW;
  const words = "Readable words that a person would want to read. ".repeat(40);

  it("read no further than the window", () => {
    // Text only after 600 KiB of tags: not seen (a page like this goes to the renderer).
    const late = `<html><body>${"<i></i>".repeat(Math.ceil((W + 100_000) / 7))}<p>${words}</p></body></html>`;
    expect(hasMoreTextThan(late, 500)).toBe(false);
    expect(bodyHasMoreTextThan(late, 200)).toBe(false);
    expect(strippedTextLength(late)).toBeGreaterThan(500); // the full scan would see it
  });

  it("do not count an inline script that crosses the window as text", () => {
    // A client-rendered page: 600 KiB of state, an empty root. It must not pass
    // as a real page (fourth R1 review, F2).
    const state = `<script>window.__STATE__=${JSON.stringify("x".repeat(600 * 1024))}</script>`;
    const shell = `<html><head>${state}</head><body><div id="root"></div></body></html>`;
    expect(hasMoreTextThan(shell, 500)).toBe(false);
    const inBody = `<html><body>${state}<div id="root"></div></body></html>`;
    expect(bodyHasMoreTextThan(inBody, 200)).toBe(false);
    // ...and still see real text after such a script.
    const real = `<html><head>${state}</head><body><p>${words}</p></body></html>`;
    expect(hasMoreTextThan(real, 500)).toBe(true);
    expect(bodyHasMoreTextThan(`<html><body>${state}<p>${words}</p></body></html>`, 200)).toBe(true);
  });

  it("agree with the full check on pages inside the window", () => {
    for (const html of [`<body><p>${words}</p></body>`, "<body><script>x</script>short</body>", "<p>no body</p>"]) {
      expect(hasMoreTextThan(html, 500)).toBe(strippedTextLength(html) > 500);
      expect(bodyHasMoreTextThan(html, 200)).toBe(bodyVisibleText(html).length > 200);
    }
  });
});
