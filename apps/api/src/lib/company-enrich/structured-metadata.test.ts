import { describe, expect, it } from "vitest";
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
    });
  });
});
