/**
 * Phase B.3 (DEC-20260512-A): 78 capabilities reading ANTHROPIC_API_KEY,
 * classified as paid_prepaid (every call bills per-token on Anthropic).
 *
 * Source: c:/tmp/phase-b-audit-report.csv (filter:
 * proposed_cost_class=paid_prepaid AND confidence=high AND
 * env_var=ANTHROPIC_API_KEY). The cost-class-coherence CI lint
 * (apps/api/scripts/check-cost-class-coherence.mjs) already enforces
 * that reading ANTHROPIC_API_KEY requires paid_prepaid or
 * paid_subscription; this list ships the classification to DB.
 *
 * Why this list lives separately: same rationale as
 * PHASE_B1_FREE_UNLIMITED_SLUGS and BLOCK_0064_SLUGS — keeps the
 * 90-line literal out of startup-migrations.ts and lets a dedicated
 * regression test pin the size + content.
 *
 * Semantics: paid_prepaid × any-internal-context = refuse via
 * ALLOW_MATRIX. customer_paid is allowed unchanged. Scheduler
 * eligibility stays FALSE (was already FALSE via Block 0066's bridge
 * derivation from external_cost_cents > 0; now structurally derived
 * from cost_class per Block 0069).
 */
export const PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS: ReadonlyArray<string> = [
  "address-parse",
  "agent-trace-analyze",
  "api-docs-generate",
  "api-mock-response",
  "blog-post-outline",
  "brand-mention-search",
  "changelog-generate",
  "classify-text",
  "code-convert",
  "code-review",
  "commit-message-generate",
  "company-enrich",
  "company-industry-classify",
  "company-tech-stack",
  "competitor-compare",
  "container-track",
  "context-window-optimize",
  "contract-extract",
  "cookie-scan",
  "crontab-generate",
  "curl-to-code",
  "customs-duty-lookup",
  "cz-company-data",
  "diff-review",
  "dockerfile-generate",
  "docstring-generate",
  "email-draft",
  "env-template-generate",
  "error-explain",
  "estonian-company-data",
  "eu-regulation-search",
  "eu-trademark-search",
  "fake-data-generate",
  "finnish-company-data",
  "french-company-data",
  "gdpr-fine-lookup",
  "github-actions-generate",
  "github-repo-analyze",
  "hs-code-lookup",
  "image-to-text",
  "invoice-extract",
  "job-posting-analyze",
  "jsdoc-generate",
  "landing-page-roast",
  "meeting-notes-extract",
  "nginx-config-generate",
  "norwegian-company-data",
  "openapi-generate",
  "pdf-extract",
  "pii-redact",
  "pr-description-generate",
  "price-compare",
  "pricing-page-extract",
  "privacy-policy-analyze",
  "product-reviews-extract",
  "product-search",
  "prompt-compress",
  "prompt-optimize",
  "readme-generate",
  "receipt-categorize",
  "regex-explain",
  "regex-generate",
  "release-notes-generate",
  "resume-parse",
  "return-policy-extract",
  "risk-narrative-generate",
  "schema-migration-generate",
  "sentiment-analyze",
  "social-post-generate",
  "sql-explain",
  "sql-generate",
  "sql-optimize",
  "structured-scrape",
  "summarize",
  "terms-of-service-extract",
  "test-case-generate",
  "translate",
  "uk-company-data",
  "us-company-data",
  "web-extract",
  "webhook-test-payload",
  "website-to-company",
  "youtube-summarize",
];
