/**
 * Capability fallback map — simpler alternatives that provide partial coverage.
 *
 * Rules:
 * - The fallback must be SIMPLER (fewer dependencies, ideally deterministic)
 * - The fallback must cover at least SOME of the same use case
 * - Conservative: only include clear, genuine relationships
 */

export interface CapabilityFallback {
  primarySlug: string;
  fallbackSlug: string;
  coverage: string;
  verificationLevel: "full" | "partial" | "none";
}

export const CAPABILITY_FALLBACKS: CapabilityFallback[] = [
  // ── Validation: live check → format-only check ──────────────────────────
  {
    primarySlug: "vat-validate",
    fallbackSlug: "vat-format-validate",
    coverage:
      "Structural format validation only — confirms VAT number format is valid for the country. Cannot verify registration status with VIES.",
    verificationLevel: "partial",
  },
  {
    primarySlug: "eori-validate",
    fallbackSlug: "vat-format-validate",
    coverage:
      "VAT format check only. EORI numbers share format with VAT numbers in many EU countries. Cannot verify customs registration.",
    verificationLevel: "none",
  },

  // ── URL/web: visual → text extraction ───────────────────────────────────
  {
    primarySlug: "screenshot-url",
    fallbackSlug: "url-to-markdown",
    coverage:
      "Text extraction instead of visual capture. Returns page content as markdown. No rendered screenshot or visual layout.",
    verificationLevel: "none",
  },
  {
    primarySlug: "url-to-markdown",
    fallbackSlug: "url-to-text",
    coverage:
      "Plain text extraction without markdown formatting. Simpler HTTP fetch without Browserless rendering.",
    verificationLevel: "partial",
  },
  {
    primarySlug: "web-extract",
    fallbackSlug: "url-to-text",
    coverage:
      "Raw text content from URL. No AI-powered structured extraction or field mapping.",
    verificationLevel: "none",
  },
  {
    primarySlug: "structured-scrape",
    fallbackSlug: "url-to-text",
    coverage:
      "Raw text content from URL. No CSS-selector-based structured extraction.",
    verificationLevel: "none",
  },
  {
    primarySlug: "meta-extract",
    fallbackSlug: "og-image-check",
    coverage:
      "OpenGraph image check only. Does not extract full meta tags, title, or description.",
    verificationLevel: "none",
  },

  // ── DNS/network ─────────────────────────────────────────────────────────
  {
    primarySlug: "dns-lookup",
    fallbackSlug: "domain-reputation",
    coverage:
      "DNS data included in reputation check, but also includes additional reputation scoring. Heavier operation.",
    verificationLevel: "partial",
  },
  {
    primarySlug: "ssl-check",
    fallbackSlug: "ssl-certificate-chain",
    coverage:
      "Certificate chain data without full SSL configuration audit. Shows cert details but not protocol/cipher analysis.",
    verificationLevel: "partial",
  },
  {
    primarySlug: "email-deliverability-check",
    fallbackSlug: "mx-lookup",
    coverage:
      "MX record lookup only. Confirms domain has mail servers but cannot verify deliverability or spam score.",
    verificationLevel: "partial",
  },
  {
    primarySlug: "email-deliverability-check",
    fallbackSlug: "email-validate",
    coverage:
      "Email format and MX validation. Cannot verify inbox existence or deliverability score.",
    verificationLevel: "partial",
  },

  // ── Finance ─────────────────────────────────────────────────────────────
  {
    primarySlug: "exchange-rate",
    fallbackSlug: "currency-convert",
    coverage:
      "Currency conversion with current rates. Provides the same core data — current exchange rates between currencies.",
    verificationLevel: "full",
  },
  {
    primarySlug: "invoice-extract",
    fallbackSlug: "pdf-extract",
    coverage:
      "Generic PDF text extraction. Returns raw text without invoice-specific field mapping (invoice number, line items, totals).",
    verificationLevel: "none",
  },

  // ── Company data: scraping → API-based registries ───────────────────────
  {
    primarySlug: "competitor-compare",
    fallbackSlug: "url-to-text",
    coverage:
      "Raw page text for manual comparison. No structured competitive analysis or AI-generated insights.",
    verificationLevel: "none",
  },

  // ── SEO/web analysis ────────────────────────────────────────────────────
  {
    primarySlug: "seo-audit",
    fallbackSlug: "page-speed-test",
    coverage:
      "Page speed metrics only. No content analysis, keyword density, meta tag audit, or link structure review.",
    verificationLevel: "none",
  },
  {
    primarySlug: "seo-audit",
    fallbackSlug: "header-security-check",
    coverage:
      "Security headers check only. Covers a small subset of SEO technical requirements.",
    verificationLevel: "none",
  },
  {
    primarySlug: "accessibility-audit",
    fallbackSlug: "page-speed-test",
    coverage:
      "Performance metrics only. No WCAG compliance checking or accessibility issue detection.",
    verificationLevel: "none",
  },

  // ── Code/dev tools: AI → deterministic ──────────────────────────────────
  {
    primarySlug: "regex-generate",
    fallbackSlug: "regex-explain",
    coverage:
      "Explains existing regex patterns but cannot generate new ones. Useful for validation but not creation.",
    verificationLevel: "none",
  },
  {
    primarySlug: "openapi-generate",
    fallbackSlug: "openapi-validate",
    coverage:
      "Validates existing OpenAPI specs but cannot generate new ones. Useful for checking but not creation.",
    verificationLevel: "none",
  },

  // ── Product/price: scraping → simpler scraping ──────────────────────────
  {
    primarySlug: "price-compare",
    fallbackSlug: "product-search",
    coverage:
      "Product search results without price comparison analysis. Shows available products but no price ranking.",
    verificationLevel: "partial",
  },

  // ── Job/HR ──────────────────────────────────────────────────────────────
  {
    primarySlug: "job-posting-analyze",
    fallbackSlug: "skill-extract",
    coverage:
      "Skill extraction from text. Extracts skills mentioned but no salary analysis, company info, or job market context.",
    verificationLevel: "none",
  },

  // ── Cookie/privacy: scraping → deterministic ────────────────────────────
  {
    primarySlug: "cookie-scan",
    fallbackSlug: "gdpr-website-check",
    coverage:
      "GDPR compliance header checks without active cookie scanning. Checks policy pages and headers but not actual cookie behavior.",
    verificationLevel: "partial",
  },
  {
    primarySlug: "privacy-policy-analyze",
    fallbackSlug: "gdpr-website-check",
    coverage:
      "GDPR compliance header checks. Cannot analyze full privacy policy text for completeness.",
    verificationLevel: "none",
  },
];
