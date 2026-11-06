import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { buildBoundedMetadataHtml, extractStructuredCompanyMetadata, METADATA_HTML_LIMIT, stripScriptAndStyleBlocks } from "./structured-metadata.js";

const PAGE = "https://example.com/";

describe("extractStructuredCompanyMetadata", () => {
  it("reads an Organization and PostalAddress from JSON-LD", () => {
    const metadata = extractStructuredCompanyMetadata(`<script type="application/ld+json">${JSON.stringify({
      "@type": "Organization",
      name: "Example AB",
      description: "Published company description.",
      logo: "/logo.png",
      email: "hello@example.com",
      knowsAbout: ["Compliance", "Agent data"],
      address: {
        "@type": "PostalAddress",
        streetAddress: "Main Street 1",
        addressLocality: "Stockholm",
        addressRegion: "Stockholm County",
        postalCode: "111 11",
        addressCountry: "SE",
      },
    })}</script>`, PAGE);

    expect(metadata).toMatchObject({
      company_name: "Example AB",
      description: "Published company description.",
      logo_url: "https://example.com/logo.png",
      email: "hello@example.com",
      specialties: ["Compliance", "Agent data"],
      address: { street: "Main Street 1", city: "Stockholm", region: "Stockholm County", postal_code: "111 11", country: "SE" },
    });
  });

  it("reads Open Graph metadata without JSON-LD", () => {
    const metadata = extractStructuredCompanyMetadata(`
      <meta property="og:site_name" content="Open Graph Co">
      <meta property="og:description" content="The OG description">
      <meta property="og:image" content="https://cdn.example.com/cover.jpg">
    `, PAGE);
    expect(metadata.company_name).toBe("Open Graph Co");
    expect(metadata.description).toBe("The OG description");
    expect(metadata.cover_image_url).toBe("https://cdn.example.com/cover.jpg");
  });

  it("gives explicit JSON-LD values precedence over conflicting Open Graph values", () => {
    const metadata = extractStructuredCompanyMetadata(`
      <meta property="og:site_name" content="OG name"><meta property="og:description" content="OG description">
      <script type="application/ld+json">{"@type":"LocalBusiness","name":"JSON-LD name","description":"JSON-LD description"}</script>
    `, PAGE);
    expect(metadata.company_name).toBe("JSON-LD name");
    expect(metadata.description).toBe("JSON-LD description");
  });

  it("resolves a relative icon as the logo and rejects non-http images", () => {
    expect(extractStructuredCompanyMetadata('<link rel="icon" href="/assets/icon.png">', PAGE).logo_url)
      .toBe("https://example.com/assets/icon.png");
    expect(extractStructuredCompanyMetadata('<meta property="og:image" content="data:image/png;base64,abc">', PAGE).cover_image_url)
      .toBeNull();
  });

  it("drops an off-domain email", () => {
    const html = '<script type="application/ld+json">{"@type":"Organization","email":"agency@outside.test"}</script>';
    expect(extractStructuredCompanyMetadata(html, PAGE).email).toBeNull();
  });

  it("keeps an apex-domain email when the homepage is on a subdomain", () => {
    const html = '<script type="application/ld+json">{"@type":"Organization","email":"hello@example.co.uk"}</script>';
    expect(extractStructuredCompanyMetadata(html, "https://shop.example.co.uk").email).toBe("hello@example.co.uk");
  });

  it.each([
    ["vercel.app", "https://acme.vercel.app", "ceo@evil.vercel.app"],
    ["github.io", "https://acme.github.io", "ceo@evil.github.io"],
  ])("rejects a sibling on the shared %s private suffix", (_suffix, page, email) => {
    const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "Organization", email })}</script>`;
    expect(extractStructuredCompanyMetadata(html, page).email).toBeNull();
  });

  it("returns the complete nullable shape for an empty page", () => {
    expect(extractStructuredCompanyMetadata("", PAGE)).toEqual({
      company_name: null,
      description: null,
      seo_description: null,
      logo_url: null,
      cover_image_url: null,
      email: null,
      address: { street: null, city: null, region: null, postal_code: null, country: null },
      specialties: [],
      social_links: { linkedin: null, twitter: null, github: null },
      title_hints: [],
    });
  });

  it("uses titles only as hints and rejects lookalike social hosts", () => {
    const metadata = extractStructuredCompanyMetadata(`
      <title>Home | Acme Inc</title><meta property="og:title" content="Acme widgets">
      <script type="application/ld+json">${JSON.stringify({
        "@type": "Organization",
        sameAs: ["https://www.dropbox.com/s/abc", "https://notlinkedin.example/acme", "https://social.twitter.com/acme"],
      })}</script>
    `, PAGE);
    expect(metadata.company_name).toBeNull();
    expect(metadata.title_hints).toEqual(["Acme widgets", "Home | Acme Inc"]);
    expect(metadata.social_links).toEqual({ linkedin: null, twitter: "https://social.twitter.com/acme", github: null });
  });

  it("bounds jsdom input while finding JSON-LD at the end of a 10 MB page", () => {
    const html = `<head><meta property="og:site_name" content="Bounded Co"></head>${"x".repeat(10 * 1024 * 1024)}<script type="application/ld+json">{"@type":"Organization","name":"Tail Co"}</script>`;
    let parserInputLength = 0;
    const metadata = extractStructuredCompanyMetadata(html, PAGE, (boundedHtml) => {
      parserInputLength = boundedHtml.length;
      return new JSDOM(boundedHtml);
    });
    expect(metadata.company_name).toBe("Tail Co");
    expect(parserInputLength).toBeGreaterThan(0);
    expect(parserInputLength).toBeLessThanOrEqual(METADATA_HTML_LIMIT);
  });

  it("accepts organization variants, prefers the site-matching node, and normalizes address forms", () => {
    const metadata = extractStructuredCompanyMetadata(`<script type="application/ld+json">${JSON.stringify({
      "@graph": [
        { "@type": "schema:Corporation", name: "Wrong", url: "https://other.test" },
        { "@type": "https://schema.org/Restaurant", name: "Right", "@id": "https://example.com/#company", address: ["Main Street 1"] },
        { "@type": "Article", publisher: { "@type": "Organization", name: "Publisher" } },
      ],
    })}</script>`, PAGE);
    expect(metadata.company_name).toBe("Right");
    expect(metadata.address).toEqual({ street: "Main Street 1", city: null, region: null, postal_code: null, country: null });
  });
});

describe("buildBoundedMetadataHtml", () => {
  it("keeps at most eight bounded icon tags outside the head", () => {
    const html = "<head></head><body>" + '<link rel="icon" href="/a">'.repeat(Math.ceil(4 * 1024 * 1024 / 27));
    const bounded = buildBoundedMetadataHtml(html);
    expect(bounded.length).toBeGreaterThan(0);
    expect(bounded.length).toBeLessThanOrEqual(METADATA_HTML_LIMIT);
    expect(bounded.match(/<link/gi)).toHaveLength(8);
  });

  it("drops a single icon tag over four kilobytes", () => {
    const bounded = buildBoundedMetadataHtml(`<head></head><body><link rel="icon" href="${"a".repeat(16 * 1024 * 1024)}">`);
    expect(bounded.length).toBeGreaterThan(0);
    expect(bounded.length).toBeLessThanOrEqual(METADATA_HTML_LIMIT);
    expect(bounded).not.toContain("<link");
  });

  it("limits a missing-close head to 128 KB", () => {
    const html = "<head>" + '<meta name="x" content="y">'.repeat(Math.ceil(1024 * 1024 / 27));
    const bounded = buildBoundedMetadataHtml(html);
    expect(bounded.length).toBeGreaterThan(0);
    expect(bounded.length).toBeLessThan(129 * 1024);
  });

  it.each([
    ["with a leading JSON-LD opener", '<script type="application/ld+json">'],
    ["with no JSON-LD opener", ""],
  ])("stops after the first unclosed script (%s)", (_label, lead) => {
    // Complete "<script>" openings with no closing tag: the input that made the
    // run-2 scan re-search to the end of the page for every opening.
    const html = lead + "<script>".repeat(Math.ceil(2 * 1024 * 1024 / 8));
    const diagnostics = { scriptOpeningsVisited: 0 };
    const bounded = buildBoundedMetadataHtml(html, diagnostics);
    expect(bounded.length).toBeGreaterThan(0);
    expect(bounded.length).toBeLessThanOrEqual(METADATA_HTML_LIMIT);
    expect(diagnostics.scriptOpeningsVisited).toBe(1);
  });

  const bodyOrganization = `<script type="application/ld+json">${JSON.stringify({
    "@type": "Organization",
    name: "Body LD Co",
    email: "hello@example.com",
    logo: "/logo.png",
  })}</script>`;

  it("keeps body JSON-LD when a long head is full of inline CSS", () => {
    const css = `<style>${"a{color:red}".repeat(Math.ceil(200 * 1024 / 12))}</style>`;
    const html = `<html><head><title>T</title>${css}<meta property="og:site_name" content="Acme Site"></head><body>${bodyOrganization}</body></html>`;
    const metadata = extractStructuredCompanyMetadata(html, PAGE);
    expect(metadata).toMatchObject({ company_name: "Body LD Co", email: "hello@example.com", logo_url: "https://example.com/logo.png" });
    // Stripping the inline CSS keeps the head's own meta tags inside the cap.
    expect(buildBoundedMetadataHtml(html)).toContain('og:site_name');
  });

  it("keeps positions aligned on a page with characters that lowercase to two code units", () => {
    const html = `<html><head><title>İstanbul İzmir İnegöl</title></head><body><p>İİİ</p>${bodyOrganization}</body></html>`;
    expect(extractStructuredCompanyMetadata(html, PAGE)).toMatchObject({ company_name: "Body LD Co", email: "hello@example.com" });
  });

  it.each([
    ["in the head", (ld: string) => `<html><head><link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22><text>A</text></svg>">${ld}<meta property="og:site_name" content="OGNAME"></head><body></body></html>`],
    ["in the body", (ld: string) => `<html><head><meta property="og:site_name" content="OGNAME"></head><body><link rel="icon" href='data:image/svg+xml,<svg><text>A</text></svg>'>${ld}</body></html>`],
  ])("a data-URI SVG favicon %s does not hide the JSON-LD", (_label, page) => {
    const ld = `<script type="application/ld+json">${JSON.stringify({ "@type": "Organization", name: "LDCO", email: "a@example.com" })}</script>`;
    expect(extractStructuredCompanyMetadata(page(ld), PAGE)).toMatchObject({ company_name: "LDCO", email: "a@example.com" });
  });

  it.each([
    ["<style></style>", "style blocks only"],
    ["<script></script>", "script blocks only"],
  ])("strips %s repeated with a bounded number of searches (%s)", (block) => {
    const count = Math.ceil(2 * 1024 * 1024 / block.length);
    const diagnostics = { searches: 0 };
    expect(stripScriptAndStyleBlocks(block.repeat(count) + "<meta>", diagnostics)).toBe("<meta>");
    // Two searches per block (its close and that close's ">"), one per block
    // for the next opening of its kind, and one for the absent kind.
    expect(diagnostics.searches).toBeLessThanOrEqual(3 * count + 4);
  });

  it("still finds an icon that sits beyond the head's kept slice", () => {
    const html = `<html><head>${'<meta name="x" content="y">'.repeat(Math.ceil(200 * 1024 / 27))}<link rel="icon" href="/late.png"></head><body></body></html>`;
    expect(extractStructuredCompanyMetadata(html, PAGE)).toMatchObject({ logo_url: "https://example.com/late.png" });
  });

  it("a malformed body icon with a stray quote does not hide the JSON-LD", () => {
    const ld = `<script type="application/ld+json">${JSON.stringify({ "@type": "Organization", name: "LDCO", email: "a@example.com" })}</script>`;
    for (const icon of [`<link rel=icon x=a"b title="c>d" href=/z.png>`, `<link rel=icon x=a'b title='c>d' href=/z.png>`]) {
      const html = `<html><head><meta property="og:site_name" content="OGNAME"></head><body>${icon}${ld}</body></html>`;
      expect(extractStructuredCompanyMetadata(html, PAGE), icon).toMatchObject({ company_name: "LDCO", email: "a@example.com" });
    }
  });

  it('a JSON-LD value containing "</scr\u0130pt>" does not end the block early', () => {
    // "İ" lowercases to "i", so a scan on a natively lowercased copy would see
    // "</script>" inside the value and cut the JSON short.
    const ld = `<script type="application/ld+json">{"@type":"Organization","name":"A</scr\u0130pt>B","email":"a@example.com"}</script>`;
    const metadata = extractStructuredCompanyMetadata(`<html><head>${ld}</head><body></body></html>`, PAGE);
    expect(metadata).toMatchObject({ company_name: "A</scr\u0130pt>B", email: "a@example.com" });
  });

  it.each([
    ["head", `<html><head><link rel="icon" href="/f.png?a=1&amp;b=2"></head><body></body></html>`],
    ["body", `<html><head></head><body><link rel="icon" href="/f.png?a=1&amp;b=2"></body></html>`],
  ])("keeps an &amp; in a %s icon URL as one ampersand", (_label, html) => {
    expect(extractStructuredCompanyMetadata(html, PAGE)).toMatchObject({ logo_url: "https://example.com/f.png?a=1&b=2" });
  });

  it("reads href, not xml:href, from an icon link", () => {
    const html = `<html><head></head><body><link rel="icon" xml:href="/bad.png" href="/good.png"></body></html>`;
    expect(extractStructuredCompanyMetadata(html, PAGE)).toMatchObject({ logo_url: "https://example.com/good.png" });
  });

  it.each([["letter", "a"], ["dash", "-"]])(
    "bounds the work on 4 KB icon tags full of a %s run",
    (_label, ch) => {
      const tag = `<link icon ${ch.repeat(4000)}>`;
      const html = tag.repeat(Math.ceil(4 * 1024 * 1024 / tag.length));
      const diagnostics = { scriptOpeningsVisited: 0, iconCandidates: 0 };
      const started = performance.now();
      buildBoundedMetadataHtml(html, diagnostics);
      expect(diagnostics.iconCandidates).toBeLessThanOrEqual(64);
      // Unanchored, the attribute pattern took about 23 s on this page.
      expect(performance.now() - started).toBeLessThan(2_000);
    },
  );

  it("does not take <header> for <head> on a page that omits the head tag", () => {
    const html = `<!doctype html><meta property="og:site_name" content="Acme Co"><meta name="description" content="What Acme does."><header><nav>Menu</nav></header><main>Body</main>`;
    expect(extractStructuredCompanyMetadata(html, PAGE)).toMatchObject({ company_name: "Acme Co", description: "What Acme does." });
  });
});
