-- Add transparency_tag column to capabilities
ALTER TABLE capabilities ADD COLUMN transparency_tag VARCHAR(30) DEFAULT NULL;

-- AI-powered capabilities (directly use Claude/Anthropic SDK)
UPDATE capabilities SET transparency_tag = 'ai_generated' WHERE slug IN (
  'address-parse', 'agent-trace-analyze', 'api-docs-generate', 'api-mock-response',
  'blog-post-outline', 'brand-mention-search', 'changelog-generate', 'classify-text',
  'code-convert', 'code-review', 'commit-message-generate', 'company-enrich',
  'context-window-optimize', 'contract-extract', 'crontab-generate', 'curl-to-code',
  'dockerfile-generate', 'docstring-generate', 'email-draft', 'error-explain',
  'fake-data-generate', 'github-actions-generate', 'github-repo-analyze',
  'image-to-text', 'invoice-extract', 'job-posting-analyze', 'jsdoc-generate',
  'meeting-notes-extract', 'nginx-config-generate', 'openapi-generate',
  'pdf-extract', 'pii-redact', 'pr-description-generate', 'prompt-compress',
  'prompt-optimize', 'readme-generate', 'receipt-categorize', 'regex-explain',
  'regex-generate', 'release-notes-generate', 'resume-parse', 'sanctions-check',
  'schema-migration-generate', 'sentiment-analyze', 'social-post-generate',
  'sql-explain', 'sql-generate', 'sql-optimize', 'summarize', 'test-case-generate',
  'translate', 'web-extract', 'webhook-test-payload', 'youtube-summarize'
);

-- Browserless + Claude extraction (scrape page then extract with AI)
UPDATE capabilities SET transparency_tag = 'ai_generated' WHERE slug IN (
  'amazon-price', 'australian-company-data', 'austrian-company-data',
  'belgian-company-data', 'brazilian-company-data', 'business-license-check-se',
  'canadian-company-data', 'company-tech-stack', 'competitor-compare',
  'container-track', 'cookie-scan', 'credit-report-summary', 'customs-duty-lookup',
  'dutch-company-data', 'employer-review-summary', 'estonian-company-data',
  'eu-court-case-search', 'eu-regulation-search', 'eu-trademark-search',
  'french-company-data', 'gdpr-fine-lookup', 'german-company-data',
  'hong-kong-company-data', 'hs-code-lookup', 'indian-company-data',
  'irish-company-data', 'italian-company-data', 'japanese-company-data',
  'landing-page-roast', 'latvian-company-data', 'lithuanian-company-data',
  'patent-search', 'polish-company-data', 'portuguese-company-data',
  'price-compare', 'pricing-page-extract', 'privacy-policy-analyze',
  'product-reviews-extract', 'product-search', 'return-policy-extract',
  'salary-benchmark', 'seo-audit', 'singapore-company-data',
  'spanish-company-data', 'structured-scrape', 'swedish-company-data',
  'swiss-company-data', 'tech-stack-detect', 'terms-of-service-extract',
  'trustpilot-score', 'uk-company-data', 'us-company-data'
) AND transparency_tag IS NULL;

-- Company registries that use direct API + Claude for name resolution
UPDATE capabilities SET transparency_tag = 'mixed' WHERE slug IN (
  'danish-company-data', 'finnish-company-data', 'norwegian-company-data'
) AND transparency_tag IS NULL;

-- All remaining capabilities are algorithmic (pure API, regex, parsing, etc.)
UPDATE capabilities SET transparency_tag = 'algorithmic' WHERE transparency_tag IS NULL;
