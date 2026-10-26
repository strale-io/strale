// Job groups: the vocabulary visitors filter the catalogue by, taken from the
// level-2 lines in docs/programs/brand-website/MESSAGING-LEVELS.md instead of
// the API's internal category names. Every tool lands in exactly one group:
// a slug override wins, then the category, and test/editorial.test.ts fails
// on a category this file does not know, so a new category has to be placed
// deliberately rather than falling into a default.
//
// `examples` are chosen for the job, never for popularity (claims.yaml
// `most-popular-tools` is forbidden). Each is checked against the live
// catalogue at build time; one that is not visible is dropped, not shown.

export type JobId = "web" | "documents" | "check" | "company" | "screening" | "developer" | "reference";

export interface JobGroup {
  id: JobId;
  /** Short filter label. */
  label: string;
  /** The level-2 line, as a sentence. */
  line: string;
  examples: string[];
}

export const JOB_GROUPS: JobGroup[] = [
  { id: "web", label: "Search and read the web", line: "Search results, search-result analysis, and any page as clean text for the model.", examples: ["google-search", "serp-analyze", "url-to-markdown"] },
  { id: "documents", label: "Read documents", line: "Text from images, and the fields from invoices, receipts and PDFs.", examples: ["image-to-text", "invoice-extract", "pdf-extract"] },
  { id: "check", label: "Check details before acting", line: "Email addresses, phone numbers, IBAN format and EU VAT numbers.", examples: ["email-validate", "phone-validate", "iban-validate", "vat-validate"] },
  { id: "company", label: "Company records", line: "Companies in official records: name and registration number, plus status, address and directors where the source provides them.", examples: ["uk-company-data", "swedish-company-data", "japanese-company-data"] },
  { id: "screening", label: "Screening and ownership", line: "Sanctions and politically exposed person lists, adverse media, and ownership where it is published.", examples: ["sanctions-check", "pep-check", "adverse-media-check"] },
  { id: "developer", label: "Web and developer jobs", line: "DNS, SSL and domain checks, tech-stack detection, SEO audits, translation, wallet and ENS lookups.", examples: ["dns-lookup", "ssl-check", "seo-audit", "ens-resolve"] },
  { id: "reference", label: "Reference and market data", line: "Exchange rates, public holidays, tax rates, trade codes and shipping.", examples: ["exchange-rate", "public-holiday-lookup", "hs-code-lookup"] },
];

export const CATEGORY_GROUP: Record<string, JobId> = {
  "web-scraping": "web",
  "competitive-intelligence": "developer",
  "web-intelligence": "developer",
  "document-extraction": "documents",
  "file-conversion": "documents",
  "text-processing": "documents",
  validation: "check",
  "company-data": "company",
  compliance: "screening",
  "developer-tools": "developer",
  "data-processing": "developer",
  security: "developer",
  monitoring: "developer",
  utility: "developer",
  "content-writing": "developer",
  "agent-tooling": "developer",
  media: "developer",
  web3: "developer",
  "data-extraction": "reference",
  financial: "reference",
  finance: "reference",
  trade: "reference",
};

/** Tools whose category puts them in the wrong job for a visitor. */
export const SLUG_GROUP: Record<string, JobId> = {
  // data-extraction is a catch-all category; these are web, document or company jobs.
  "serp-analyze": "web",
  "web-extract": "web",
  "academic-paper-search": "web",
  "arxiv-search": "web",
  "pubmed-search": "web",
  "hacker-news-search": "web",
  "paper-details": "web",
  "citation-graph": "web",
  "doi-resolve": "web",
  "clinical-trials-search": "web",
  "patent-search": "web",
  "job-board-search": "web",
  "product-search": "web",
  "price-compare": "web",
  "youtube-summarize": "documents",
  "invoice-extract": "documents",
  "pdf-extract": "documents",
  "annual-report-extract": "documents",
  "privacy-policy-analyze": "documents",
  "terms-of-service-extract": "documents",
  "return-policy-extract": "documents",
  "swift-message-parse": "documents",
  "company-enrich": "company",
  "uk-companies-house-officers": "company",
  "business-license-check-se": "company",
  "charity-lookup-uk": "company",
  "company-fundamentals": "company",
  "lei-lookup": "company",
  "company-id-detect": "check",
  "iban-to-bank": "check",
  "backlink-check": "developer",
  "cookie-scan": "developer",
  "domain-age-check": "developer",
  "docker-hub-info": "developer",
  "npm-package-info": "developer",
  "pypi-package-info": "developer",
  "github-repo-compare": "developer",
  "github-user-profile": "developer",
  "page-speed-test": "developer",
  "keyword-rank-check": "developer",
  "website-carbon-estimate": "developer",
  "translate": "developer",
  "domain-reputation": "developer",
  "gdpr-website-check": "developer",
  "risk-narrative-generate": "screening",
  "screenshot-url": "web",
};

export function jobFor(slug: string, category: string): JobId | undefined {
  return SLUG_GROUP[slug] ?? CATEGORY_GROUP[category];
}
