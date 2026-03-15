/**
 * Error code registry — classifies errors as retryable (upstream) or permanent (bad input).
 *
 * Populated per capability type. Individual capabilities can override.
 * Retryable = upstream/transient issues. Permanent = bad input, always fails.
 */

export interface CapabilityErrorCodes {
  slug: string;
  distinguishableErrors: boolean;
  retryable: string[];
  permanent: string[];
}

// ─── Shared error patterns by type ──────────────────────────────────────────

const DETERMINISTIC_ERRORS: Pick<CapabilityErrorCodes, "distinguishableErrors" | "retryable" | "permanent"> = {
  distinguishableErrors: true,
  retryable: [], // No external deps — nothing to retry
  permanent: ["INVALID_INPUT", "MISSING_REQUIRED_FIELD", "MALFORMED_INPUT", "UNSUPPORTED_FORMAT"],
};

const STABLE_API_ERRORS: Pick<CapabilityErrorCodes, "distinguishableErrors" | "retryable" | "permanent"> = {
  distinguishableErrors: true,
  retryable: [
    "UPSTREAM_TIMEOUT", "UPSTREAM_UNAVAILABLE", "RATE_LIMITED",
    "CONNECTION_REFUSED", "CONNECTION_RESET", "DNS_FAILURE",
    "HTTP_502", "HTTP_503", "HTTP_429",
  ],
  permanent: ["INVALID_INPUT", "MISSING_REQUIRED_FIELD", "NOT_FOUND", "UNSUPPORTED_COUNTRY"],
};

const SCRAPING_ERRORS: Pick<CapabilityErrorCodes, "distinguishableErrors" | "retryable" | "permanent"> = {
  distinguishableErrors: true,
  retryable: [
    "BROWSERLESS_TIMEOUT", "NAVIGATION_TIMEOUT", "PAGE_LOAD_TIMEOUT",
    "UPSTREAM_UNAVAILABLE", "RATE_LIMITED", "CONNECTION_RESET",
    "SSL_ERROR", "ANTI_BOT_BLOCK", "CAPTCHA_DETECTED",
    "HTTP_502", "HTTP_503", "HTTP_429",
  ],
  permanent: [
    "INVALID_INPUT", "MISSING_REQUIRED_FIELD", "NOT_FOUND",
    "UNSUPPORTED_COUNTRY", "INVALID_URL",
  ],
};

const AI_ASSISTED_ERRORS: Pick<CapabilityErrorCodes, "distinguishableErrors" | "retryable" | "permanent"> = {
  distinguishableErrors: true,
  retryable: [
    "CLAUDE_OVERLOADED", "CLAUDE_RATE_LIMITED", "CLAUDE_TIMEOUT",
    "UPSTREAM_TIMEOUT", "UPSTREAM_UNAVAILABLE",
    "HTTP_502", "HTTP_503", "HTTP_429",
  ],
  permanent: [
    "INVALID_INPUT", "MISSING_REQUIRED_FIELD", "UNSUPPORTED_FORMAT",
    "CONTENT_TOO_LARGE", "EMPTY_CONTENT",
  ],
};

// ─── Per-type slug lists ────────────────────────────────────────────────────

const DETERMINISTIC_SLUGS = [
  "bank-bic-lookup", "company-id-detect", "country-tax-rates", "cron-explain",
  "csv-clean", "csv-to-json", "dangerous-goods-classify", "data-protection-authority-lookup",
  "data-quality-check", "date-parse", "deduplicate", "diff-json",
  "employment-cost-estimate", "eu-ai-act-classify", "financial-year-dates", "flatten-json",
  "gitignore-generate", "http-to-curl", "iban-validate", "incoterms-explain",
  "invoice-validate", "isbn-validate", "iso-country-lookup", "json-repair",
  "json-schema-validate", "json-to-csv", "json-to-pydantic", "json-to-typescript",
  "json-to-zod", "jwt-decode", "llm-cost-calculate", "llm-output-validate",
  "log-parse", "markdown-to-html", "marketplace-fee-calculate", "name-parse",
  "openapi-validate", "password-strength", "payment-reference-generate", "phone-normalize",
  "schema-infer", "sepa-xml-validate", "shipping-cost-estimate", "shipping-track",
  "skill-extract", "skill-gap-analyze", "swift-message-parse", "swift-validate",
  "timezone-meeting-find", "tool-call-validate", "unit-convert", "vat-format-validate",
  "vat-rate-lookup", "work-permit-requirements", "xml-to-json",
];

const SCRAPING_SLUGS = [
  "accessibility-audit", "amazon-price", "australian-company-data", "austrian-company-data",
  "belgian-company-data", "business-license-check-se", "canadian-company-data",
  "company-tech-stack", "competitor-compare", "container-track", "cookie-scan",
  "credit-report-summary", "customs-duty-lookup", "dutch-company-data",
  "employer-review-summary", "eu-court-case-search", "eu-regulation-search",
  "eu-trademark-search", "gdpr-fine-lookup", "german-company-data",
  "hong-kong-company-data", "html-to-pdf", "indian-company-data", "irish-company-data",
  "italian-company-data", "japanese-company-data", "landing-page-roast",
  "latvian-company-data", "lithuanian-company-data", "patent-search",
  "portuguese-company-data", "price-compare", "pricing-page-extract",
  "privacy-policy-analyze", "product-reviews-extract", "product-search",
  "return-policy-extract", "salary-benchmark", "screenshot-url", "seo-audit",
  "singapore-company-data", "spanish-company-data", "structured-scrape",
  "swedish-company-data", "swiss-company-data", "tech-stack-detect",
  "terms-of-service-extract", "trustpilot-score", "url-to-markdown",
];

const AI_ASSISTED_SLUGS = [
  "address-parse", "agent-trace-analyze", "annual-report-extract", "api-docs-generate",
  "api-mock-response", "blog-post-outline", "brand-mention-search",
  "brazilian-company-data", "changelog-generate", "classify-text", "code-convert",
  "code-review", "commit-message-generate", "company-enrich", "context-window-optimize",
  "contract-extract", "crontab-generate", "curl-to-code", "danish-company-data",
  "dockerfile-generate", "docstring-generate", "email-draft", "env-template-generate",
  "error-explain", "estonian-company-data", "fake-data-generate", "finnish-company-data",
  "french-company-data", "github-actions-generate", "github-repo-analyze",
  "hs-code-lookup", "image-to-text", "invoice-extract", "job-posting-analyze",
  "jsdoc-generate", "meeting-notes-extract", "nginx-config-generate",
  "norwegian-company-data", "openapi-generate", "pdf-extract", "pii-redact",
  "polish-company-data", "pr-description-generate", "prompt-compress",
  "prompt-optimize", "readme-generate", "receipt-categorize", "regex-explain",
  "regex-generate", "release-notes-generate", "resume-parse", "sanctions-check",
  "schema-migration-generate", "secret-scan", "sentiment-analyze", "social-post-generate",
  "sql-explain", "sql-generate", "sql-optimize", "summarize", "test-case-generate",
  "token-count", "translate", "uk-company-data", "us-company-data", "web-extract",
  "webhook-test-payload", "youtube-summarize",
];

// Everything not in the above lists defaults to stable_api

// ─── Build the registry ─────────────────────────────────────────────────────

function buildRegistry(): CapabilityErrorCodes[] {
  const registry: CapabilityErrorCodes[] = [];

  for (const slug of DETERMINISTIC_SLUGS) {
    registry.push({ slug, ...DETERMINISTIC_ERRORS });
  }

  for (const slug of SCRAPING_SLUGS) {
    registry.push({ slug, ...SCRAPING_ERRORS });
  }

  for (const slug of AI_ASSISTED_SLUGS) {
    registry.push({ slug, ...AI_ASSISTED_ERRORS });
  }

  // Remaining slugs are stable_api — we don't enumerate them here,
  // they get the default from the lookup function.

  return registry;
}

export const ERROR_CODE_REGISTRY = buildRegistry();

/**
 * Look up error codes for a capability. Falls back to stable_api pattern
 * if not explicitly in the registry.
 */
export function getErrorCodes(slug: string): CapabilityErrorCodes {
  const entry = ERROR_CODE_REGISTRY.find((e) => e.slug === slug);
  if (entry) return entry;

  // Default: stable_api pattern
  return { slug, ...STABLE_API_ERRORS };
}
