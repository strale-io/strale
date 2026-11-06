import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { extractStructuredCompanyMetadata } from "./structured-metadata.js";

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
    expect(parserInputLength).toBeLessThanOrEqual(6 * 1024 * 1024);
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
