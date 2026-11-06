/**
 * A page that talks about a product does not use it.
 *
 * Detection reads what a page loads or runs (start tags, executable script and
 * style bodies, tracking pixels), never its visible text or `<a>` links. These
 * tests hold that line for EVERY html signature in the table: each pattern gets
 * a string that provably matches it, and a page that only mentions that string
 * in text or in a link must not detect the technology. A positive control puts
 * the same string where a page loads it, so the mention tests cannot pass
 * because the sample was useless.
 *
 * The ReDoS test at the end runs every pattern in the table, not a sample.
 */
import { describe, expect, it } from "vitest";
import { detectTechnologies, extractActiveMarkup } from "./tech-detect.js";
import { TECH_SIGNATURES, type TechSignature } from "./tech-signatures.js";

// ─── A tiny regex-to-sample generator (enough for this table) ────────────────

function sampleOf(source: string): string[] {
  let pos = 0;

  function parseAlternatives(): string[][] {
    const alts: string[][] = [[]];
    while (pos < source.length && source[pos] !== ")") {
      const ch = source[pos];
      if (ch === "|") { pos++; alts.push([]); continue; }
      alts[alts.length - 1].push(parseAtomWithQuantifier());
    }
    return alts;
  }

  function parseAtomWithQuantifier(): string {
    const atom = parseAtom();
    let min = 1;
    const q = source[pos];
    if (q === "?" || q === "*") { min = 0; pos++; }
    else if (q === "+") { pos++; }
    else if (q === "{") {
      const end = source.indexOf("}", pos);
      min = Number(source.slice(pos + 1, end).split(",")[0]);
      pos = end + 1;
    }
    if (source[pos] === "?") pos++; // lazy marker
    return atom.repeat(min);
  }

  function parseAtom(): string {
    const ch = source[pos];
    if (ch === "\\") {
      const next = source[pos + 1];
      pos += 2;
      switch (next) {
        case "d": return "1";
        case "w": return "a";
        case "s": return " ";
        case "b": case "B": return "";
        default: return next;
      }
    }
    if (ch === "[") {
      let end = pos + 1;
      while (source[end] !== "]" || source[end - 1] === "\\") end++;
      const body = source.slice(pos + 1, end);
      pos = end + 1;
      if (body.startsWith("^")) return "a";
      if (body.startsWith("\\")) return body[1] === "d" ? "1" : body[1] === "w" ? "a" : body[1] === "s" ? " " : body[1];
      return body[0];
    }
    if (ch === "(") {
      pos++;
      let lookaround = false;
      if (source.startsWith("?:", pos)) pos += 2;
      else if (source.startsWith("?!", pos) || source.startsWith("?<!", pos) || source.startsWith("?=", pos)) {
        lookaround = true;
        pos += source.startsWith("?<!", pos) ? 3 : 2;
      }
      const alts = parseAlternatives();
      pos++; // ")"
      return lookaround ? "" : alts[0].join("");
    }
    if (ch === "^" || ch === "$") { pos++; return ""; }
    if (ch === ".") { pos++; return "a"; }
    pos++;
    return ch;
  }

  const topLevel = parseAlternatives();
  return topLevel.map((alt) => alt.join(""));
}

/** A string that provably matches the pattern, or null when the generator could not build one. */
function provableSample(re: RegExp): string | null {
  for (const candidate of sampleOf(re.source)) {
    if (candidate && re.test(candidate)) return candidate;
  }
  return null;
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;");
}

function mentionPage(sample: string): string {
  return `<!doctype html><html><head><title>Notes</title><meta name="description" content="${escapeAttr(sample)}"></head><body>
    <p>Last week we compared tools such as ${escapeText(sample)} for our own use.</p>
    <p><a href="https://example.test/${escapeAttr(sample)}">${escapeText(sample)}</a></p>
    <img src="https://example.test/logo.png" alt="${escapeAttr(sample)}">
    <pre><code>${escapeText(sample)}</code></pre>
  </body></html>`;
}

const NO_DNS = { mx: [], txt: [], ns: [], cname: [] };
function detectedNames(html: string): string[] {
  return detectTechnologies({ headers: {}, html, dns: NO_DNS }).map((t) => t.name);
}

const htmlSignatures: Array<{ sig: TechSignature; pattern: RegExp; sample: string | null }> = TECH_SIGNATURES.flatMap((sig) =>
  (sig.html ?? []).map((pattern) => ({ sig, pattern, sample: provableSample(pattern) })),
);

describe("every html signature ignores a page that only mentions it", () => {
  it("the sample generator covers nearly every pattern", () => {
    const unsampled = htmlSignatures.filter((h) => h.sample === null);
    expect(htmlSignatures.length).toBeGreaterThan(300);
    expect(unsampled.length / htmlSignatures.length, unsampled.map((u) => `${u.sig.name}: ${u.pattern.source}`).join("\n")).toBeLessThan(0.08);
  });

  it.each(htmlSignatures.filter((h) => h.sample !== null).map((h) => [`${h.sig.name}: ${h.pattern.source.slice(0, 70)}`, h] as const))(
    "%s",
    (_label, { sig, sample }) => {
      expect(detectedNames(mentionPage(sample!))).not.toContain(sig.name);
    },
  );

  it("the same samples are detected when the page loads them (the mention tests are not vacuous)", () => {
    const sampled = htmlSignatures.filter((h) => h.sample !== null && /^[\w./:%?=&+@~-]+$/.test(h.sample!));
    expect(sampled.length).toBeGreaterThan(250);
    let detected = 0;
    for (const { sig, sample } of sampled) {
      const loaded = `<html><head><script async src="https://cdn.example.test/${sample}"></script></head><body></body></html>`;
      if (detectedNames(loaded).includes(sig.name)) detected++;
    }
    expect(detected / sampled.length).toBeGreaterThan(0.9);
  });
});

describe("extractActiveMarkup", () => {
  it("keeps what a page loads or runs", () => {
    const { markup } = extractActiveMarkup(`<html><head>
      <script src="https://a.example/x.js"></script><link rel="preconnect" href="https://b.example">
      <style>.x{color:red} /* c-style */</style><script>window.dataLayer = []; // inline-body</script>
    </head><body><iframe src="https://c.example/embed"></iframe><div id="app" class="k-widget" data-thing="1"></div>
      <form action="https://d.example/post"></form><noscript><img src="https://www.facebook.com/tr?id=1"></noscript></body></html>`);
    for (const kept of ["a.example/x.js", "b.example", "c-style", "inline-body", "c.example/embed", 'id="app"', 'class="k-widget"', "d.example/post", "facebook.com/tr?id=1"]) {
      expect(markup, kept).toContain(kept);
    }
  });

  it("drops visible text, links, meta content, content images and data scripts", () => {
    const { markup } = extractActiveMarkup(`<html><head><meta name="description" content="meta-mention">
      <script type="application/ld+json">{"about":"jsonld-mention"}</script>
      <script type="application/json" id="__NEXT_DATA__">{"props":"nextdata-mention"}</script>
      <script>self.__next_f.push([1,"flight-mention"])</script></head>
      <body><p>text-mention</p><a href="https://link.example/link-mention">anchor-mention</a>
      <img src="https://img.example/img-mention.png" alt="alt-mention"><video src="video-mention.mp4"></video></body></html>`);
    for (const dropped of ["meta-mention", "jsonld-mention", "nextdata-mention", "flight-mention", "text-mention", "link-mention", "anchor-mention", "img-mention", "alt-mention", "video-mention"]) {
      expect(markup, dropped).not.toContain(dropped);
    }
    // The data script's own tag still carries its id, which is the real marker.
    expect(markup).toContain('id="__NEXT_DATA__"');
  });

  it("keeps the platform's own JSON settings script that states the WordPress core version", () => {
    const found = detectTechnologies({
      headers: {},
      html: `<script id="wp-emoji-settings" type="application/json">{"source":{"concatemoji":"https://x.test/wp-includes/js/wp-emoji-release.min.js?ver=6.8.1"}}</script>`,
      dns: NO_DNS,
    });
    expect(found.find((t) => t.name === "WordPress")?.version).toBe("6.8.1");
  });

  it("keeps comments apart, for comment signatures only", () => {
    const { markup, comments } = extractActiveMarkup(`<!-- optimized with the Yoast SEO plugin v21.5 --><p>x</p>`);
    expect(comments).toContain("Yoast SEO plugin v21.5");
    expect(markup).not.toContain("Yoast");
  });

  it("detects a comment signature from a comment but not from text", () => {
    const fromComment = detectTechnologies({ headers: {}, html: `<!-- This site is optimized with the Yoast SEO plugin v21.5 - https://yoast.com/ --><p>x</p>`, dns: NO_DNS });
    expect(fromComment.find((t) => t.name === "Yoast SEO")?.version).toBe("21.5");
    const fromText = detectTechnologies({ headers: {}, html: `<p>This site is optimized with the Yoast SEO plugin v21.5</p>`, dns: NO_DNS });
    expect(fromText.find((t) => t.name === "Yoast SEO")).toBeUndefined();
  });

  it("is linear on input made of unterminated tags and scripts", () => {
    const hostile = ["<a<a<a ".repeat(60_000), "<script>".repeat(60_000), "<!--".repeat(60_000), '<div class="'.repeat(60_000)];
    for (const input of hostile) {
      const start = Date.now();
      extractActiveMarkup(input);
      expect(Date.now() - start, input.slice(0, 12)).toBeLessThan(1500);
    }
  });
});

describe("the whole table stays fast on adversarial input", () => {
  const adversarial = [
    "a".repeat(200_000),
    "/".repeat(200_000),
    "1.".repeat(100_000),
    "<script ".repeat(25_000),
    "-.min.js?ver=".repeat(15_000),
  ];

  type Entry = { label: string; pattern: RegExp };
  const entries: Entry[] = [];
  for (const sig of TECH_SIGNATURES) {
    const all: Array<[string, RegExp[] | undefined]> = [
      ["html", sig.html], ["comment", sig.comment], ["cookies", sig.cookies], ["mx", sig.mx], ["txt", sig.txt], ["ns", sig.ns], ["cname", sig.cname],
      ["headers", sig.headers && Object.values(sig.headers)], ["meta", sig.meta && Object.values(sig.meta)],
    ];
    for (const [field, patterns] of all) for (const pattern of patterns ?? []) entries.push({ label: `${sig.name} ${field}: ${pattern.source.slice(0, 60)}`, pattern });
  }

  it("covers every pattern in the table", () => {
    expect(entries.length).toBeGreaterThan(500);
  });

  it("no pattern takes more than 250 ms on any adversarial input, including its own sample repeated then broken", () => {
    const slow: string[] = [];
    for (const { label, pattern } of entries) {
      const sample = provableSample(pattern);
      const inputs = sample ? [...adversarial, `${sample}`.repeat(Math.ceil(100_000 / sample.length)) + "\u0001"] : adversarial;
      for (const input of inputs) {
        const start = performance.now();
        pattern.test(input);
        const ms = performance.now() - start;
        if (ms > 250) slow.push(`${Math.round(ms)}ms ${label}`);
      }
    }
    expect(slow).toEqual([]);
  });
});
