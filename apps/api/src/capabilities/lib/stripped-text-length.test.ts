import { describe, expect, it } from "vitest";
import { strippedTextLength } from "./stripped-text-length.js";

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
