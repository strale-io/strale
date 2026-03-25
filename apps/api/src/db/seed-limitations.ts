import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { capabilityLimitations } from "./schema.js";
import { eq, and } from "drizzle-orm";

interface LimitationDef {
  capabilitySlug: string;
  title: string;
  limitationText: string;
  category: string;
  severity: string;
  affectedPercentage?: number;
  workaround?: string;
}

const LIMITATIONS: LimitationDef[] = [
  // ── swedish-company-data ──
  { capabilitySlug: "swedish-company-data", category: "coverage", severity: "info",
    title: "Does not cover sole proprietorships — about 15% of Swedish businesses",
    limitationText: "Does not cover sole proprietorships (enskild firma) — approximately 15% of Swedish businesses",
    affectedPercentage: 15,
    workaround: "Use the company name to search Skatteverket's public registry directly for enskild firma entities" },
  { capabilitySlug: "swedish-company-data", category: "freshness", severity: "info",
    title: "Financial data comes from annual reports and can be up to 12 months old",
    limitationText: "Financial data from annual reports — can be up to 12 months old",
    workaround: "Check the report_date field in the response and fetch directly from Bolagsverket for time-sensitive decisions" },
  { capabilitySlug: "swedish-company-data", category: "availability", severity: "info",
    title: "Bolagsverket maintenance windows may cause 2-4 hour quarterly outages",
    limitationText: "Bolagsverket maintenance windows may cause temporary unavailability (typically 2-4 hours quarterly)",
    workaround: "Implement a retry with exponential backoff; maintenance windows are announced at bolagsverket.se/driftinformation" },

  // ── norwegian-company-data ──
  { capabilitySlug: "norwegian-company-data", category: "coverage", severity: "info",
    title: "Does not cover sole proprietorships — about 15% of Norwegian businesses",
    limitationText: "Does not cover sole proprietorships (enkeltpersonforetak)",
    affectedPercentage: 15,
    workaround: "Query Brønnøysundregistrene (brreg.no) directly for enkeltpersonforetak using the person's national ID" },
  { capabilitySlug: "norwegian-company-data", category: "freshness", severity: "info",
    title: "Financial data comes from annual reports and can be up to 12 months old",
    limitationText: "Financial data from annual reports — can be up to 12 months old",
    workaround: "Check the report_date field and query Brønnøysundregistrene's regnskapsregisteret for the latest filing" },

  // ── danish-company-data ──
  { capabilitySlug: "danish-company-data", category: "coverage", severity: "info",
    title: "Does not cover sole proprietorships — about 15% of Danish businesses",
    limitationText: "Does not cover sole proprietorships (enkeltmandsvirksomhed)",
    affectedPercentage: 15,
    workaround: "Search the CVR register (datacvr.virk.dk) directly using the person's CPR-linked CVR number" },
  { capabilitySlug: "danish-company-data", category: "freshness", severity: "info",
    title: "Financial data comes from annual reports and can be up to 12 months old",
    limitationText: "Financial data from annual reports — can be up to 12 months old",
    workaround: "Check the report_date field and retrieve the latest filing from the Danish Business Authority (erhvervsstyrelsen.dk)" },

  // ── finnish-company-data ──
  { capabilitySlug: "finnish-company-data", category: "coverage", severity: "info",
    title: "Does not cover sole traders without a separate business ID — about 10%",
    limitationText: "Does not cover sole traders (toiminimi) without separate business ID",
    affectedPercentage: 10,
    workaround: "Search the YTJ register (ytj.fi) by the trader's personal name to find toiminimi entries without a Y-tunnus" },
  { capabilitySlug: "finnish-company-data", category: "freshness", severity: "info",
    title: "Financial data comes from annual reports and can be up to 12 months old",
    limitationText: "Financial data from annual reports — can be up to 12 months old",
    workaround: "Check the report_date field and query PRH's financial statement database for the most recent filing" },

  // ── us-company-data ──
  { capabilitySlug: "us-company-data", category: "coverage", severity: "warning",
    title: "SEC coverage varies by state — some states have limited registry data",
    limitationText: "Coverage varies by state — Delaware, California, New York most complete. Some states have limited electronic registry access",
    workaround: "For states with limited coverage, supplement with the state's Secretary of State website directly" },
  { capabilitySlug: "us-company-data", category: "freshness", severity: "info",
    title: "Secretary of State filings may lag 1-5 business days behind actual filing",
    limitationText: "Secretary of State filings may lag 1-5 business days behind actual filing date",
    workaround: "For time-critical checks, compare the filing_date in the response against SEC EDGAR for publicly traded companies" },
  { capabilitySlug: "us-company-data", category: "coverage", severity: "info",
    title: "Private company financial data is not included — public filings only",
    limitationText: "Does not include privately held financial data — only publicly filed information",
    workaround: "Request financials directly from the company or use a commercial data provider like D&B for private company data" },

  // ── iban-validate ──
  { capabilitySlug: "iban-validate", category: "coverage", severity: "info",
    title: "Validates IBAN structure and checksum only, not whether the account exists or is active",
    limitationText: "Validates structure and checksum only — does not confirm the account is open or active",
    workaround: "Use a SEPA test transaction (€0.01) or bank account verification API to confirm the account is live before large transfers" },
  { capabilitySlug: "iban-validate", category: "coverage", severity: "info",
    title: "Non-SEPA country IBANs are validated structurally but bank details may be incomplete",
    limitationText: "Covers all SEPA-zone IBANs. Non-SEPA country IBANs validated structurally but bank lookup may be incomplete",
    workaround: "For non-SEPA IBANs, cross-reference the bank code portion against SWIFT's IBAN Plus directory" },

  // ── bank-bic-lookup ──
  { capabilitySlug: "bank-bic-lookup", category: "coverage", severity: "info",
    title: "Small regional banks and credit unions may not be found in the BIC directory",
    limitationText: "Database covers major banks globally. Small regional banks or credit unions may not be found",
    workaround: "If no result is returned, look up the BIC via the national central bank's payment system participant list" },
  { capabilitySlug: "bank-bic-lookup", category: "freshness", severity: "info",
    title: "BIC directory updates monthly, so recently merged or renamed banks may lag up to 30 days",
    limitationText: "BIC directory updated monthly — newly merged or renamed banks may show outdated information for up to 30 days",
    workaround: "Cross-check the returned BIC against SWIFT's online BIC search (swift.com) for recently merged institutions" },

  // ── vat-validate ──
  { capabilitySlug: "vat-validate", category: "availability", severity: "warning",
    title: "EU VIES validation service has periodic outages that may increase response times",
    limitationText: "VIES (EU VAT validation service) experiences periodic outages — Strale retries automatically but response times may increase",
    workaround: "Cache successful validation results with a TTL matching your business requirements (e.g., 24h for invoicing)" },
  { capabilitySlug: "vat-validate", category: "freshness", severity: "info",
    title: "VAT registration status may lag up to 24 hours behind national registry changes",
    limitationText: "VAT registration status reflects latest VIES database — typically within 24 hours of national registry changes",
    workaround: "For same-day registration verification, contact the national tax authority directly or use their local e-service" },
  { capabilitySlug: "vat-validate", category: "coverage", severity: "info",
    title: "Covers EU member states only — Norwegian and Swiss VAT numbers have reduced detail",
    limitationText: "Covers EU member states only. Norwegian and Swiss VAT numbers use separate validation and may have reduced detail",
    workaround: "For Norwegian MVA numbers, verify directly via Brønnøysundregistrene; for Swiss UID numbers, use uid.admin.ch" },

  // ── exchange-rate ──
  { capabilitySlug: "exchange-rate", category: "freshness", severity: "info",
    title: "Exchange rates update hourly during market hours but may be stale on weekends and holidays",
    limitationText: "Rates updated every hour during market hours, may be stale during weekends and holidays",
    workaround: "For weekend transactions, use the Friday close rate and flag the amount for reconciliation on Monday" },
  { capabilitySlug: "exchange-rate", category: "accuracy", severity: "info",
    title: "Uses mid-market rates — actual bank conversion rates differ by 0.5-3% depending on provider",
    limitationText: "Mid-market rates — actual bank conversion rates will differ by 0.5-3% depending on provider",
    workaround: "Apply your bank's typical spread as a margin buffer (e.g., ±1.5%) when displaying converted amounts to users" },

  // ── email-validate ──
  { capabilitySlug: "email-validate", category: "accuracy", severity: "info",
    title: "Catch-all domains used by enterprises show as valid even for non-existent mailboxes",
    limitationText: "Catch-all domains (common in enterprises) will show as valid even for non-existent mailboxes",
    workaround: "Check the is_catchall field in the response and require email confirmation via a verification link for catch-all domains" },
  { capabilitySlug: "email-validate", category: "coverage", severity: "info",
    title: "Disposable email detection covers major providers but newly registered throwaway domains may pass",
    limitationText: "Disposable email detection covers major providers but new throwaway domains may not be flagged",
    workaround: "Supplement with a domain age check — disposable domains are typically registered within the last 30 days" },

  // ── dns-lookup ──
  { capabilitySlug: "dns-lookup", category: "freshness", severity: "info",
    title: "DNS results reflect current propagation — recent record changes may take up to 48 hours to appear",
    limitationText: "Results reflect current DNS propagation — recent changes may take up to 48 hours to appear",
    workaround: "Query the authoritative nameserver directly (returned in the NS records) to see changes before full propagation" },

  // ── whois-lookup ──
  { capabilitySlug: "whois-lookup", category: "coverage", severity: "warning",
    title: "EU domain registrations are commonly GDPR-redacted, showing limited registrant information",
    limitationText: "GDPR-redacted registrations (common for EU domains) show limited registrant information",
    workaround: "Use the abuse contact email from the WHOIS response to request registrant details through the registrar's disclosure process" },
  { capabilitySlug: "whois-lookup", category: "availability", severity: "info",
    title: "Some registrars rate-limit WHOIS queries, causing slower responses during bulk lookups",
    limitationText: "Some registrars rate-limit WHOIS queries — bulk lookups may see slower response times",
    workaround: "Batch lookups with 1-2 second delays between requests, or use the RDAP protocol endpoint when available" },

  // ── ssl-check ──
  { capabilitySlug: "ssl-check", category: "coverage", severity: "info",
    title: "Only checks the certificate on port 443, not non-standard TLS ports or configurations",
    limitationText: "Checks the certificate presented on port 443 only — does not verify non-standard TLS configurations",
    workaround: "For services on non-standard ports, use ssl-certificate-chain with the specific hostname:port combination" },

  // ── ssl-certificate-chain ──
  { capabilitySlug: "ssl-certificate-chain", category: "coverage", severity: "info",
    title: "Certificate chains are validated against public root CAs — private or internal CAs show as untrusted",
    limitationText: "Validates chain to known root CAs — private/internal CAs will show as untrusted",
    workaround: "If you use a private CA, compare the returned issuer fingerprint against your internal CA's known fingerprint" },

  // ── domain-reputation ──
  { capabilitySlug: "domain-reputation", category: "accuracy", severity: "info",
    title: "A single blocklist appearance may not indicate actual malicious activity",
    limitationText: "Reputation scores aggregate multiple blocklists — a single listing may not indicate actual malicious activity",
    workaround: "Check which specific blocklist flagged the domain in the response details and verify the listing reason before blocking" },
  { capabilitySlug: "domain-reputation", category: "freshness", severity: "info",
    title: "Blocklist data refreshes daily, so resolved issues may still show negative reputation for 24-48 hours",
    limitationText: "Blocklist data refreshed daily — recently resolved issues may still show negative reputation for 24-48 hours",
    workaround: "If a domain was recently cleaned, re-check after 48 hours and use the trend direction to assess improvement" },

  // ── sanctions-check ──
  { capabilitySlug: "sanctions-check", category: "freshness", severity: "info",
    title: "Sanctions lists update daily from OFAC, EU, and UN — newly sanctioned entities may lag up to 24 hours",
    limitationText: "Sanctions lists updated daily from OFAC, EU, and UN sources — newly sanctioned entities may take up to 24 hours to appear",
    workaround: "For same-day compliance, subscribe to OFAC's RSS feed and cross-reference against today's additions" },
  { capabilitySlug: "sanctions-check", category: "accuracy", severity: "warning",
    title: "Name matching uses fuzzy logic and may produce false positives for common names",
    limitationText: "Name matching uses fuzzy logic — common names may produce false positives. Always verify flagged results",
    workaround: "Filter results by match confidence score and verify flagged entities against the primary sanctions list PDF" },

  // ── pep-check ──
  { capabilitySlug: "pep-check", category: "coverage", severity: "warning",
    title: "PEP coverage varies by country — major economies and EU members have strong coverage",
    limitationText: "PEP coverage varies by country — major economies and EU members have strong coverage, smaller nations may have gaps",
    workaround: "For countries with limited coverage, supplement with local registry checks or use the LLM fallback as a secondary signal" },
  { capabilitySlug: "pep-check", category: "accuracy", severity: "warning",
    title: "Name matching uses fuzzy logic and may produce false positives for common names",
    limitationText: "Name matching uses fuzzy logic — common names may produce false positives. Birth date strongly recommended for disambiguation",
    workaround: "Always provide birth_date when available to reduce false positives. Verify flagged results against official government records" },
  { capabilitySlug: "pep-check", category: "freshness", severity: "info",
    title: "PEP lists updated multiple times per day — recently appointed officials may take up to 48 hours",
    limitationText: "PEP lists updated multiple times per day — recently appointed officials may take up to 48 hours to appear",
    workaround: "For time-sensitive checks on recently appointed officials, cross-reference with news sources" },

  // ── adverse-media-check ──
  { capabilitySlug: "adverse-media-check", category: "accuracy", severity: "warning",
    title: "AI-categorized results may produce false positives for common names",
    limitationText: "AI-categorized results — may produce false positives for common names or names that appear in unrelated news contexts",
    workaround: "Review top articles manually to confirm relevance. Use entity_type parameter to improve precision" },
  { capabilitySlug: "adverse-media-check", category: "coverage", severity: "info",
    title: "Screens 235,000+ sources but paywalled content may not be fully indexed",
    limitationText: "Screens 235,000+ sources but paywalled content may not be fully indexed. Non-English language coverage varies by region",
    workaround: "For high-stakes screening, supplement with manual searches in local-language news sources" },
  { capabilitySlug: "adverse-media-check", category: "freshness", severity: "info",
    title: "Articles typically appear in near real-time with 24-48 hour indexing delay for some sources",
    limitationText: "Articles typically appear in near real-time but some sources may have a 24-48 hour indexing delay",
    workaround: "For breaking news events, supplement with direct web search" },

  // ── beneficial-ownership-lookup ──
  { capabilitySlug: "beneficial-ownership-lookup", category: "coverage", severity: "warning",
    title: "Currently covers UK companies only — more jurisdictions coming soon",
    limitationText: "Currently covers UK companies only. Beneficial ownership data depends on company filings — some companies may not have filed PSC information",
    workaround: "For non-UK companies, use company-data capabilities for the relevant country and check local UBO registries" },
  { capabilitySlug: "beneficial-ownership-lookup", category: "accuracy", severity: "info",
    title: "PSC data is self-reported by companies to Companies House",
    limitationText: "PSC data is self-reported by companies to Companies House. Accuracy depends on the filing company — data is not independently verified",
    workaround: "Cross-reference with other compliance data sources for high-value due diligence" },
  { capabilitySlug: "beneficial-ownership-lookup", category: "coverage", severity: "info",
    title: "Companies listed on regulated markets are exempt from PSC filing requirements",
    limitationText: "Companies listed on regulated markets (e.g. London Stock Exchange) are exempt from PSC filing requirements",
    workaround: "For listed companies, check shareholder registers and annual reports instead" },

  // ── url-to-markdown ──
  { capabilitySlug: "url-to-markdown", category: "coverage", severity: "info",
    title: "JavaScript-heavy single-page applications may not render completely before content is extracted",
    limitationText: "JavaScript-heavy single-page applications may not render completely",
    workaround: "Pass a wait_for_selector parameter if available, or use web-extract-clean which renders JS via headless browser" },
  { capabilitySlug: "url-to-markdown", category: "coverage", severity: "info",
    title: "Login-protected or paywalled content cannot be extracted",
    limitationText: "Login-protected or paywalled content cannot be extracted",
    workaround: "Provide the direct content URL if accessible via API, or pre-fetch the HTML and pass it as raw input instead" },

  // ── pii-redact ──
  { capabilitySlug: "pii-redact", category: "accuracy", severity: "warning",
    title: "Names and other PII without surrounding context may occasionally be missed during redaction",
    limitationText: "Context-dependent PII (e.g., names without surrounding context) may occasionally be missed",
    workaround: "Run a second pass with an explicit entity list of known names from your dataset to catch context-free occurrences" },
  { capabilitySlug: "pii-redact", category: "coverage", severity: "info",
    title: "Optimized for English and Nordic languages — other languages have lower PII detection accuracy",
    limitationText: "Optimized for English and Nordic languages — other languages may have lower detection accuracy",
    workaround: "For non-supported languages, pre-tag known PII patterns (e.g., national ID formats) with regex before calling pii-redact" },

  // ── email-deliverability-check ──
  { capabilitySlug: "email-deliverability-check", category: "accuracy", severity: "info",
    title: "SMTP verification may be blocked by some mail servers, so deliverable results are not guaranteed",
    limitationText: "SMTP verification may be blocked by some mail servers — a 'deliverable' result is not guaranteed delivery",
    workaround: "Treat SMTP-verified results as 'likely deliverable' and implement bounce handling in your email pipeline for definitive status" },

  // ── page-speed-test ──
  { capabilitySlug: "page-speed-test", category: "accuracy", severity: "info",
    title: "Results are measured from a single geographic location and may not reflect all users' experience",
    limitationText: "Results measured from a single geographic location — actual user experience varies by region",
    workaround: "Run tests at multiple times and average the scores, or use the lab data breakdown to identify bottlenecks independent of location" },
  { capabilitySlug: "page-speed-test", category: "freshness", severity: "info",
    title: "Page speed scores reflect a single point-in-time test and may vary throughout the day",
    limitationText: "Scores reflect a point-in-time test — site performance may vary throughout the day",
    workaround: "Schedule periodic tests (e.g., every 6 hours) and track the trend rather than relying on a single measurement" },

  // ── eu-ai-act-classify ──
  { capabilitySlug: "eu-ai-act-classify", category: "accuracy", severity: "warning",
    title: "EU AI Act classification is guidance only — official risk categorization requires legal analysis",
    limitationText: "Classification is guidance only — official EU AI Act risk categorization requires legal analysis",
    workaround: "Use the classification output as a starting point for legal review — include the returned risk factors in your compliance documentation" },
  { capabilitySlug: "eu-ai-act-classify", category: "freshness", severity: "info",
    title: "Based on the latest published AI Act text — implementing regulations may shift interpretation over time",
    limitationText: "Based on AI Act text as of latest published version — implementing regulations may change interpretation",
    workaround: "Monitor the EU AI Office website for delegated acts and compare against the version_date field in the response" },

  // ── data-protection-authority-lookup ──
  { capabilitySlug: "data-protection-authority-lookup", category: "coverage", severity: "info",
    title: "Covers EU/EEA national DPAs only — sub-national authorities like German Länder DPAs are not included",
    limitationText: "Covers all EU/EEA member state DPAs — does not include sub-national authorities (e.g., German Länder DPAs)",
    workaround: "For German entities, map the company's registered state to the corresponding Landesdatenschutzbeauftragter via datenschutz.de" },

  // ── gdpr-fine-lookup ──
  { capabilitySlug: "gdpr-fine-lookup", category: "freshness", severity: "info",
    title: "GDPR fine database updates weekly — recently announced fines may take up to 7 days to appear",
    limitationText: "Fine database updated weekly — recently announced fines may take up to 7 days to appear",
    workaround: "For breaking enforcement news, check enforcementtracker.com directly or subscribe to the relevant DPA's press feed" },
  { capabilitySlug: "gdpr-fine-lookup", category: "coverage", severity: "info",
    title: "Covers publicly reported fines only, as some national DPAs delay or omit publication",
    limitationText: "Covers publicly reported fines only — some national DPAs delay publication",
    workaround: "Supplement with the target company's own regulatory disclosure filings, which may reference unpublished penalties" },

  // ── gdpr-website-check ──
  { capabilitySlug: "gdpr-website-check", category: "accuracy", severity: "info",
    title: "Automated scan checks for common GDPR indicators but does not constitute a legal compliance audit",
    limitationText: "Automated scan checks for common compliance indicators — does not constitute a legal compliance audit",
    workaround: "Use the flagged items as a checklist for your DPO or legal team to prioritize their manual review" },
  { capabilitySlug: "gdpr-website-check", category: "coverage", severity: "info",
    title: "Checks only visible website elements — cannot assess internal data processing practices",
    limitationText: "Checks visible elements only — cannot assess internal data processing practices",
    workaround: "Combine with a manual review of the company's data processing agreements and internal privacy impact assessments" },

  // ── cookie-scan ──
  { capabilitySlug: "cookie-scan", category: "coverage", severity: "info",
    title: "Only scans cookies set on initial page load — cookies set after interaction or on sub-pages may be missed",
    limitationText: "Scans cookies set on initial page load — cookies set after user interaction or on sub-pages may not be captured",
    workaround: "Run separate scans on high-traffic sub-pages (e.g., /checkout, /login) and merge the cookie inventories" },

  // ── privacy-policy-analyze ──
  { capabilitySlug: "privacy-policy-analyze", category: "accuracy", severity: "info",
    title: "AI-powered analysis identifies common GDPR issues but does not replace qualified legal review",
    limitationText: "AI-powered analysis identifies common GDPR requirements — does not replace legal review",
    workaround: "Use the gap analysis output to brief your legal counsel on specific sections requiring human review" },
  { capabilitySlug: "privacy-policy-analyze", category: "coverage", severity: "info",
    title: "Analyzes the provided privacy policy URL only — separate cookie policies or terms pages are not included",
    limitationText: "Analyzes the linked privacy policy page only — separate cookie policies or terms may not be included",
    workaround: "Pass each policy URL (privacy, cookies, terms) as separate requests and combine the results" },

  // ── tech-stack-detect ──
  { capabilitySlug: "tech-stack-detect", category: "accuracy", severity: "info",
    title: "Only detects client-side and header-visible technologies — server-side-only tools are not visible",
    limitationText: "Detection based on HTTP headers, JavaScript libraries, and HTML signatures — technologies loaded conditionally or server-side only may not be detected",
    workaround: "Complement with dns-lookup and ssl-check results to infer infrastructure choices not visible in the HTML" },
  { capabilitySlug: "tech-stack-detect", category: "coverage", severity: "info",
    title: "Database covers 1,000+ technologies but niche or custom-built tools may not be identified",
    limitationText: "Database covers 1,000+ technologies — niche or custom-built tools may not be identified",
    workaround: "Check the raw HTTP headers in the response for custom X-Powered-By or Server values that indicate unlisted technology" },

  // ── seo-audit ──
  { capabilitySlug: "seo-audit", category: "accuracy", severity: "info",
    title: "Analyzes on-page SEO factors only — backlink profile and domain authority are not assessed",
    limitationText: "Analyzes on-page SEO factors only — does not assess backlink profile, domain authority, or content quality",
    workaround: "Combine with domain-reputation for authority signals and google-search to check actual SERP positioning" },

  // ── landing-page-roast ──
  { capabilitySlug: "landing-page-roast", category: "accuracy", severity: "info",
    title: "AI critique covers conversion best practices only — subjective elements like brand tone are not assessed",
    limitationText: "AI-generated critique based on conversion best practices — subjective elements like brand tone are not assessed",
    workaround: "Use the structural and CTA recommendations directly, but validate brand-voice feedback against your own style guide" },

  // ── social-profile-check ──
  { capabilitySlug: "social-profile-check", category: "coverage", severity: "info",
    title: "Searches LinkedIn, Twitter/X, Facebook, Instagram, and GitHub only — niche or regional platforms not covered",
    limitationText: "Searches major platforms (LinkedIn, Twitter/X, Facebook, Instagram, GitHub) — niche or regional platforms not covered",
    workaround: "For regional coverage, supplement with a google-search query scoped to the target platform domain (e.g., site:xing.com)" },
  { capabilitySlug: "social-profile-check", category: "accuracy", severity: "info",
    title: "Profile matching may return incorrect results for very common or generic company names",
    limitationText: "Profile matching uses name and domain signals — may return incorrect matches for very common company names",
    workaround: "Cross-reference matched profile URLs against the company's official website for link verification before trusting the match" },

  // ── code-review ──
  { capabilitySlug: "code-review", category: "accuracy", severity: "warning",
    title: "AI review may miss subtle logic errors that require full codebase context to identify",
    limitationText: "AI-powered review may miss subtle logic errors or context-dependent bugs that require full codebase understanding",
    workaround: "Use as a first-pass filter to catch common issues, then follow up with human review for critical code paths" },
  { capabilitySlug: "code-review", category: "coverage", severity: "info",
    title: "Reviews individual code snippets only — cannot analyze cross-file dependencies or architecture",
    limitationText: "Reviews individual code snippets — cannot analyze cross-file dependencies or architectural patterns",
    workaround: "Provide surrounding context or interface definitions in the input to improve review accuracy for coupled code" },

  // ── llm-output-validate ──
  { capabilitySlug: "llm-output-validate", category: "accuracy", severity: "info",
    title: "Validates LLM output structure and format only — cannot verify factual correctness of content",
    limitationText: "Validates output structure and format — cannot verify factual correctness of LLM-generated content",
    workaround: "Combine with domain-specific validation (e.g., schema checks, reference lookups) for factual verification" },

  // ── prompt-optimize ──
  { capabilitySlug: "prompt-optimize", category: "accuracy", severity: "info",
    title: "Optimization suggestions are model-agnostic — some techniques work better with specific LLM providers",
    limitationText: "Optimization suggestions are model-agnostic — some techniques work better with specific LLM providers",
    workaround: "Test optimized prompts against your target model and iterate based on actual output quality" },

  // ── brand-mention-search ──
  { capabilitySlug: "brand-mention-search", category: "coverage", severity: "info",
    title: "Searches web results via Serper.dev — social media posts, private forums, and paywalled content not covered",
    limitationText: "Searches web results via Serper.dev — does not cover social media posts, private forums, or paywalled content",
    workaround: "Supplement with social-profile-check for social media presence and direct platform API monitoring for comprehensive coverage" },
  { capabilitySlug: "brand-mention-search", category: "freshness", severity: "info",
    title: "Results depend on Google's index — mentions published within the last 24 hours may not yet appear",
    limitationText: "Results depend on Google's index — very recent mentions (under 24 hours) may not yet appear",
    workaround: "For real-time monitoring, set up Google Alerts or use a dedicated media monitoring service alongside periodic Strale checks" },

  // ── company-tech-stack ──
  { capabilitySlug: "company-tech-stack", category: "accuracy", severity: "info",
    title: "Detects technologies in public-facing web properties only — internal tools and backends are not visible",
    limitationText: "Detects technologies visible in public-facing web properties — internal tools and backend infrastructure are not visible",
    workaround: "Cross-reference with job postings (job-board-search) to infer backend technologies from required skills" },

  // ── competitor-compare ──
  { capabilitySlug: "competitor-compare", category: "accuracy", severity: "info",
    title: "Comparison is based on public information only — pricing and features may lag behind actual product changes",
    limitationText: "Comparison based on publicly available information — pricing, features, and positioning may lag behind actual product changes",
    workaround: "Verify key competitive claims against each competitor's current website and changelog before presenting to stakeholders" },

  // ── pricing-page-extract ──
  { capabilitySlug: "pricing-page-extract", category: "coverage", severity: "info",
    title: "Extracts visible list pricing only — enterprise tiers, volume discounts, and negotiated rates are not available",
    limitationText: "Extracts visible pricing — custom/enterprise pricing, volume discounts, and negotiated rates are not available",
    workaround: "Flag extracted prices as 'list price' and note that enterprise or high-volume pricing requires direct contact" },
  { capabilitySlug: "pricing-page-extract", category: "accuracy", severity: "info",
    title: "Dynamic pricing pages with complex JavaScript interactions may not render all plan tiers",
    limitationText: "Dynamic pricing pages with complex JavaScript interactions may not fully render all plan tiers",
    workaround: "If results appear incomplete, pass the direct pricing page URL rather than the homepage" },

  // ── eu-regulation-search ──
  { capabilitySlug: "eu-regulation-search", category: "freshness", severity: "info",
    title: "Searches published EU regulations only — draft proposals and pending amendments are not included",
    limitationText: "Searches published EU regulations — draft proposals and pending amendments may not be included",
    workaround: "Check EUR-Lex directly for the latest legislative procedure status on regulations returned in results" },
  { capabilitySlug: "eu-regulation-search", category: "accuracy", severity: "warning",
    title: "AI relevance ranking means returned regulations should be verified against official EUR-Lex text",
    limitationText: "AI-assisted relevance ranking — returned regulations should be verified against the official EUR-Lex text",
    workaround: "Use the regulation reference numbers from results to retrieve the canonical text from eur-lex.europa.eu" },

  // ── blog-post-outline ──
  { capabilitySlug: "blog-post-outline", category: "accuracy", severity: "info",
    title: "AI-generated outlines follow general best practices and may not match your brand voice or audience",
    limitationText: "AI-generated outline reflects general best practices — may not match your specific brand voice or audience expectations",
    workaround: "Provide target audience, tone, and key messaging points in the input for more tailored outlines" },

  // ── email-draft ──
  { capabilitySlug: "email-draft", category: "accuracy", severity: "info",
    title: "Generated drafts follow standard templates and may miss nuances of existing threads or relationships",
    limitationText: "Generated drafts follow standard professional templates — may not capture nuances of existing email threads or relationships",
    workaround: "Include relevant context from prior correspondence in the input to improve tone and content relevance" },

  // ── social-post-generate ──
  { capabilitySlug: "social-post-generate", category: "accuracy", severity: "info",
    title: "Generated posts follow platform conventions but may not comply with platform-specific advertising rules",
    limitationText: "Generated posts follow platform conventions but cannot verify compliance with platform-specific advertising rules",
    workaround: "Review generated content against the target platform's advertising and content policies before publishing" },

  // ── amazon-price ──
  { capabilitySlug: "amazon-price", category: "availability", severity: "warning",
    title: "Amazon bot detection or CAPTCHA may block price extraction during high-traffic periods",
    limitationText: "Amazon pages may trigger CAPTCHA or bot detection — extraction may fail during high-traffic periods",
    workaround: "Retry after a short delay if extraction fails; pass the direct product ASIN rather than a search query for higher reliability" },
  { capabilitySlug: "amazon-price", category: "freshness", severity: "info",
    title: "Prices reflect the moment of scraping and may change frequently due to dynamic pricing algorithms",
    limitationText: "Prices reflect the moment of scraping — Amazon prices change frequently due to dynamic pricing algorithms",
    workaround: "For price monitoring, run periodic checks and track the trend rather than relying on a single data point" },

  // ── annual-report-extract ──
  { capabilitySlug: "annual-report-extract", category: "accuracy", severity: "warning",
    title: "AI extraction from PDF reports may not fully capture complex tables, charts, or footnotes",
    limitationText: "AI extraction from PDF reports — complex tables, charts, and footnotes may not be fully captured",
    workaround: "Cross-reference extracted financial figures against the original PDF for any values used in financial decisions" },
  { capabilitySlug: "annual-report-extract", category: "coverage", severity: "info",
    title: "Best results with English and Nordic-language reports — other languages have reduced extraction accuracy",
    limitationText: "Best results with English and Nordic-language reports — reports in other languages may have reduced extraction accuracy",
    workaround: "For non-supported languages, use pdf-extract for raw text and process the output with a language-specific parser" },

  // ── australian-company-data ──
  { capabilitySlug: "australian-company-data", category: "coverage", severity: "info",
    title: "Basic data comes from ASIC public records — detailed financial statements require paid ASIC searches",
    limitationText: "Data sourced from ASIC public records — detailed financial statements require paid ASIC searches",
    workaround: "Use the ACN/ABN from the response to purchase detailed extracts directly from ASIC Connect" },

  // ── austrian-company-data ──
  { capabilitySlug: "austrian-company-data", category: "coverage", severity: "info",
    title: "Extracted from Firmenbuch via web scraping — older registrations may have incomplete fields",
    limitationText: "Extracted from Firmenbuch via web scraping — some fields may be incomplete for older registrations",
    workaround: "For complete records, use the Firmenbuchnummer from the response to query the Austrian Commercial Register directly" },

  // ── backlink-check ──
  { capabilitySlug: "backlink-check", category: "coverage", severity: "info",
    title: "Uses CommonCrawl index data, which covers a subset of the web and may miss recent or niche backlinks",
    limitationText: "Uses CommonCrawl index data — covers a subset of the web and may miss recently created or niche backlinks",
    workaround: "Combine with google-search using 'link:domain.com' queries for additional backlink discovery" },

  // ── barcode-lookup ──
  { capabilitySlug: "barcode-lookup", category: "coverage", severity: "info",
    title: "Open Food Facts coverage is strong for food and beverage but weak for electronics and general merchandise",
    limitationText: "Product database via Open Food Facts — coverage strongest for food/beverage products, weaker for electronics and general merchandise",
    workaround: "If no result is found, try the barcode with a commercial product API like UPCitemdb or Barcodelookup.com" },

  // ── belgian-company-data ──
  { capabilitySlug: "belgian-company-data", category: "coverage", severity: "info",
    title: "Extracted from KBO/BCE via Browserless — financial data availability varies by company size and filing obligations",
    limitationText: "Extracted from KBO/BCE via Browserless — financial data availability varies by company size and filing obligations",
    workaround: "Use the enterprise number from the response to query the NBB Central Balance Sheet Office for full financial filings" },

  // ── brazilian-company-data ──
  { capabilitySlug: "brazilian-company-data", category: "coverage", severity: "info",
    title: "Data extracted via web scraping — CNPJ coverage may vary and some registrations show limited detail",
    limitationText: "Data extracted via web scraping — CNPJ lookup coverage may vary and some registrations show limited detail",
    workaround: "Use the CNPJ from the response to query the Receita Federal directly for the most complete registration data" },

  // ── business-license-check-se ──
  { capabilitySlug: "business-license-check-se", category: "coverage", severity: "info",
    title: "Checks Swedish business licenses via web scraping — only licenses in public registries are covered",
    limitationText: "Checks Swedish business licenses via web scraping — coverage limited to licenses published in public registries",
    workaround: "For regulated industries (banking, insurance), verify directly with the relevant authority (Finansinspektionen, IVO)" },

  // ── canadian-company-data ──
  { capabilitySlug: "canadian-company-data", category: "coverage", severity: "info",
    title: "Covers federally incorporated Canadian companies — provincially registered businesses may have limited data",
    limitationText: "Covers federally incorporated companies — provincially registered businesses may have limited information",
    workaround: "For provincial companies, supplement with the relevant provincial registry (e.g., Ontario ONBIS, BC Registry)" },

  // ── charity-lookup-uk ──
  { capabilitySlug: "charity-lookup-uk", category: "coverage", severity: "info",
    title: "Covers charities registered in England and Wales only — Scottish and Northern Irish charities are not included",
    limitationText: "Covers charities registered with the Charity Commission for England and Wales — Scottish (OSCR) and Northern Irish charities not included",
    workaround: "For Scottish charities, query OSCR at oscr.org.uk; for Northern Ireland, use charitycommissionni.org.uk" },

  // ── company-enrich ──
  { capabilitySlug: "company-enrich", category: "accuracy", severity: "info",
    title: "Enrichment combines multiple web sources via AI — some data points may be inferred rather than verified",
    limitationText: "Enrichment combines multiple web sources via AI — some data points may be inferred rather than directly verified",
    workaround: "Check the data_sources field in the response and independently verify critical data points against the listed sources" },

  // ── container-track ──
  { capabilitySlug: "container-track", category: "availability", severity: "warning",
    title: "Tracking data is scraped from carrier websites, which may change layouts without notice causing failures",
    limitationText: "Tracking data scraped from carrier websites — carriers may change page layouts without notice, causing temporary failures",
    workaround: "If tracking fails, use the carrier name and container number to check the carrier's website directly" },
  { capabilitySlug: "container-track", category: "freshness", severity: "info",
    title: "Some carriers only update container positions at port milestones, not during transit",
    limitationText: "Tracking updates depend on carrier reporting frequency — some carriers update positions only at port milestones, not in transit",
    workaround: "Check the last_updated timestamp in the response to assess data freshness before making logistics decisions" },

  // ── country-tax-rates ──
  { capabilitySlug: "country-tax-rates", category: "freshness", severity: "info",
    title: "Tax rates are based on AI knowledge and may not reflect the most recent annual budget changes",
    limitationText: "Tax rate data based on AI knowledge — rates change with annual budgets and may not reflect the most recent fiscal year",
    workaround: "Verify rates against the national tax authority's website before using in financial calculations or invoicing" },

  // ── country-trade-data ──
  { capabilitySlug: "country-trade-data", category: "freshness", severity: "info",
    title: "Trade statistics are based on AI knowledge and may lag 6-12 months behind actual trade flows",
    limitationText: "Trade statistics based on AI knowledge — most recent data may lag 6-12 months behind actual trade flows",
    workaround: "Cross-reference with UN Comtrade or national customs statistics for the most current trade figures" },

  // ── crypto-price ──
  { capabilitySlug: "crypto-price", category: "freshness", severity: "info",
    title: "CoinGecko prices may have a 1-5 minute delay compared to real-time exchange prices",
    limitationText: "Prices from CoinGecko API — may have a 1-5 minute delay from real-time exchange prices",
    workaround: "For trading decisions, use the exchange's native API; treat CoinGecko prices as indicative market data" },
  { capabilitySlug: "crypto-price", category: "coverage", severity: "info",
    title: "Covers tokens listed on CoinGecko only — very new or delisted tokens may not return data",
    limitationText: "Covers tokens listed on CoinGecko — very new or delisted tokens may not return data",
    workaround: "Search by CoinGecko ID rather than symbol to avoid ambiguity between tokens sharing the same ticker" },

  // ── customs-duty-lookup ──
  { capabilitySlug: "customs-duty-lookup", category: "accuracy", severity: "warning",
    title: "Duty rates from TARIC depend on correct HS code classification and declared country of origin",
    limitationText: "Duty rates extracted via TARIC web scraping — rates depend on correct HS code classification and country of origin",
    workaround: "Verify extracted duty rates against the official TARIC database and consult a customs broker for complex classifications" },

  // ── dangerous-goods-classify ──
  { capabilitySlug: "dangerous-goods-classify", category: "accuracy", severity: "warning",
    title: "AI-based dangerous goods classification is a preliminary screen only — certified testing and documentation are required",
    limitationText: "AI-based classification guidance — official dangerous goods classification requires certified testing and documentation",
    workaround: "Use as a preliminary screen and confirm the UN number and packing group with your certified DG advisor" },

  // ── docker-hub-info ──
  { capabilitySlug: "docker-hub-info", category: "coverage", severity: "info",
    title: "Queries Docker Hub's public API only — private repositories and other registries like GitHub CR are not accessible",
    limitationText: "Queries Docker Hub's public API — private repositories and other registries (GitHub CR, AWS ECR) are not accessible",
    workaround: "For private registries, use their respective APIs; for GitHub Container Registry, use github-repo-analyze" },

  // ── dutch-company-data ──
  { capabilitySlug: "dutch-company-data", category: "coverage", severity: "info",
    title: "Data extracted from KVK via Browserless — some company details require a paid KVK extract for completeness",
    limitationText: "Data extracted from KVK via Browserless — some company details require paid KVK extract for completeness",
    workaround: "Use the KVK number from the response to purchase a full extract from kvk.nl for legal due diligence" },

  // ── ecb-interest-rates ──
  { capabilitySlug: "ecb-interest-rates", category: "availability", severity: "warning",
    title: "ECB SDW API is geo-restricted and may block requests originating from non-EU servers",
    limitationText: "ECB SDW API is geo-restricted — requests from non-EU servers may be blocked",
    workaround: "If the request fails, check the ECB's statistical data warehouse (sdw.ecb.europa.eu) directly for current rates" },

  // ── employer-review-summary ──
  { capabilitySlug: "employer-review-summary", category: "accuracy", severity: "info",
    title: "Scraped ratings may be biased toward extreme experiences — very satisfied and very dissatisfied reviews dominate",
    limitationText: "Reviews scraped from public platforms — ratings may be biased toward extreme experiences (very satisfied or very dissatisfied)",
    workaround: "Consider the sample size in the response and weight results higher when based on 50+ reviews" },

  // ── employment-cost-estimate ──
  { capabilitySlug: "employment-cost-estimate", category: "accuracy", severity: "info",
    title: "AI-generated estimates based on general knowledge — actual employment costs vary by industry and benefits",
    limitationText: "AI-generated estimates based on general knowledge — actual costs vary by industry, company size, and specific benefits packages",
    workaround: "Use as a ballpark estimate and validate against local payroll provider quotes for budgeting decisions" },

  // ── estonian-company-data ──
  { capabilitySlug: "estonian-company-data", category: "availability", severity: "info",
    title: "Estonian e-Business Register (ariregister) may block requests from certain external IP ranges",
    limitationText: "Estonian e-Business Register (ariregister) may block requests from certain IP ranges",
    workaround: "If lookup fails, use the registry code to search directly at ariregister.rik.ee" },

  // ── eu-court-case-search ──
  { capabilitySlug: "eu-court-case-search", category: "coverage", severity: "info",
    title: "Searches CURIA database only — covers CJEU and General Court, not national courts or ECHR",
    limitationText: "Searches CURIA database — covers CJEU and General Court only, not national courts or ECHR",
    workaround: "For ECHR cases, search hudoc.echr.coe.int directly; for national cases, use the respective country's legal database" },

  // ── eu-trademark-search ──
  { capabilitySlug: "eu-trademark-search", category: "coverage", severity: "info",
    title: "Searches EUIPO database for EU trademarks only — national trademark registrations are not included",
    limitationText: "Searches EUIPO database for EU trademarks — national trademark registrations are not included",
    workaround: "Supplement with national IP office searches (e.g., UKIPO, DPMA, INPI) for complete trademark clearance" },

  // ── financial-year-dates ──
  { capabilitySlug: "financial-year-dates", category: "coverage", severity: "info",
    title: "Standard financial year patterns are covered — companies with non-standard fiscal years may compute incorrectly",
    limitationText: "Covers standard financial year patterns — companies with non-standard fiscal years may not be accurately computed",
    workaround: "Check if the company has filed for a non-standard financial year in their articles of association" },

  // ── flight-status ──
  { capabilitySlug: "flight-status", category: "availability", severity: "info",
    title: "AviationStack free tier has limited requests and may not include real-time gate or delay information",
    limitationText: "Uses AviationStack API — free tier has limited requests and may not include real-time gate or delay information",
    workaround: "For real-time gate changes, check the airline's official app or FlightAware directly" },
  { capabilitySlug: "flight-status", category: "coverage", severity: "info",
    title: "Coverage is best for major airlines and international routes — regional carriers and charters may have limited data",
    limitationText: "Coverage best for major airlines and international routes — regional carriers and charter flights may have limited data",
    workaround: "If no data is returned, try searching by route (departure/arrival airports) rather than flight number" },

  // ── food-safety-rating-uk ──
  { capabilitySlug: "food-safety-rating-uk", category: "coverage", severity: "info",
    title: "Covers England, Wales, and Northern Ireland via FSA API — Scottish hygiene ratings use a different system",
    limitationText: "Covers England, Wales, and Northern Ireland via FSA API — Scottish food hygiene ratings (FHIS) use a different system",
    workaround: "For Scottish establishments, search the Food Standards Scotland website at foodstandards.gov.scot" },

  // ── forex-history ──
  { capabilitySlug: "forex-history", category: "freshness", severity: "info",
    title: "Frankfurter API provides ECB reference rates published daily at 16:00 CET — no intraday data available",
    limitationText: "Historical rates from Frankfurter API (ECB reference rates) — published daily around 16:00 CET, no intraday data",
    workaround: "For intraday rates, use a commercial forex data provider; ECB reference rates are suitable for accounting and reporting" },

  // ── french-company-data ──
  { capabilitySlug: "french-company-data", category: "coverage", severity: "info",
    title: "Data from INSEE/SIRENE via api.gouv.fr — financial statements require separate access to INPI",
    limitationText: "Data from api.gouv.fr (INSEE/SIRENE) — financial statements require separate access to INPI or Societe.com",
    workaround: "Use the SIREN/SIRET from the response to look up financial data on pappers.fr or societe.com" },

  // ── german-company-data ──
  { capabilitySlug: "german-company-data", category: "coverage", severity: "info",
    title: "Handelsregister search works best with an exact company name or registration number",
    limitationText: "Extracted from Handelsregister via Browserless — search works best with exact company name or registration number",
    workaround: "If search returns no results, try the official Handelsregister portal at handelsregister.de with the Registernummer" },

  // ── github-repo-compare ──
  { capabilitySlug: "github-repo-compare", category: "coverage", severity: "info",
    title: "Compares public GitHub repositories only — private repos require authenticated GitHub API access",
    limitationText: "Compares public GitHub repositories only — private repos require authenticated GitHub API access",
    workaround: "For private repos, use the GitHub API directly with a personal access token" },

  // ── github-user-profile ──
  { capabilitySlug: "github-user-profile", category: "coverage", severity: "info",
    title: "Returns public profile and repository data only — private repository contributions are not visible",
    limitationText: "Returns public profile and repository data only — contribution details for private repositories are not visible",
    workaround: "For organization-level data, use the GitHub API with appropriate org read permissions" },

  // ── hong-kong-company-data ──
  { capabilitySlug: "hong-kong-company-data", category: "coverage", severity: "info",
    title: "Extracted from ICRIS via Browserless — detailed filings and annual returns require paid ICRIS access",
    limitationText: "Extracted from ICRIS via Browserless — detailed filings and annual returns require paid ICRIS access",
    workaround: "Use the company number from the response to purchase detailed records from the Hong Kong Companies Registry (CR)" },

  // ── incoterms-explain ──
  { capabilitySlug: "incoterms-explain", category: "accuracy", severity: "info",
    title: "Incoterms 2020 explanation does not account for contractual modifications or local trade customs",
    limitationText: "AI-generated explanation of Incoterms 2020 — does not account for contractual modifications or local trade customs",
    workaround: "Verify specific obligations against the ICC Incoterms 2020 publication and your actual contract terms" },

  // ── indian-company-data ──
  { capabilitySlug: "indian-company-data", category: "coverage", severity: "info",
    title: "Data extracted via MCA web scraping — LLP and older company records may have limited digital availability",
    limitationText: "Data extracted via MCA/web scraping — LLP and older company records may have limited digital availability",
    workaround: "Use the CIN from the response to access detailed filings on the MCA portal at mca.gov.in" },

  // ── invoice-extract ──
  { capabilitySlug: "invoice-extract", category: "accuracy", severity: "warning",
    title: "AI extraction from invoices means line item totals and tax calculations should be verified against source",
    limitationText: "AI extraction from invoice documents — line item totals and tax calculations should be verified against source",
    workaround: "Validate that extracted line items sum to the total amount and cross-check VAT calculations before booking" },
  { capabilitySlug: "invoice-extract", category: "coverage", severity: "info",
    title: "Best results with standard invoice layouts — handwritten or heavily stylized invoices have lower accuracy",
    limitationText: "Best results with standard invoice layouts — handwritten invoices or heavily stylized designs may have lower accuracy",
    workaround: "For non-standard formats, use pdf-extract for raw text and apply custom parsing rules" },

  // ── ip-geolocation ──
  { capabilitySlug: "ip-geolocation", category: "accuracy", severity: "info",
    title: "City-level accuracy is approximately 80% for fixed IPs but lower for mobile and VPN traffic",
    limitationText: "IP location accuracy varies — city-level accuracy is approximately 80% for fixed IPs but lower for mobile and VPN traffic",
    workaround: "Use country-level data for access control decisions; city-level data is best used for analytics, not enforcement" },

  // ── irish-company-data ──
  { capabilitySlug: "irish-company-data", category: "coverage", severity: "info",
    title: "Extracted from Irish CRO via Browserless — some company filings require a paid CRO search for full documents",
    limitationText: "Extracted from CRO via Browserless — some company filings may require a paid CRO search for full documents",
    workaround: "Use the company number from the response to access full filings at core.cro.ie" },

  // ── iso-country-lookup ──
  { capabilitySlug: "iso-country-lookup", category: "freshness", severity: "info",
    title: "Country data is based on ISO 3166-1 — newly created or renamed countries may not yet be reflected",
    limitationText: "Country data based on ISO 3166-1 standard — newly created or renamed countries may take time to be reflected",
    workaround: "For edge cases, cross-reference with the ISO Online Browsing Platform at iso.org/obp" },

  // ── italian-company-data ──
  { capabilitySlug: "italian-company-data", category: "coverage", severity: "info",
    title: "Extracted from Registro Imprese via Browserless — detailed financial data requires a paid Visura Camerale",
    limitationText: "Extracted from Registro Imprese via Browserless — detailed financial data requires a paid Visura Camerale",
    workaround: "Use the Codice Fiscale from the response to purchase a full Visura from registroimprese.it" },

  // ── japanese-company-data ──
  { capabilitySlug: "japanese-company-data", category: "coverage", severity: "info",
    title: "Japan NTA database provides corporate numbers only — financial data and officer details are not included",
    limitationText: "Extracted from National Tax Agency corporate number database — financial data and officer details are not included",
    workaround: "Use the corporate number from the response to search EDINET (edinet-fsa.go.jp) for listed company filings" },

  // ── job-board-search ──
  { capabilitySlug: "job-board-search", category: "coverage", severity: "info",
    title: "Uses Arbetsförmedlingen and Adzuna APIs — coverage varies by country and company career pages may be missed",
    limitationText: "Uses Arbetsförmedlingen (Sweden) and optional Adzuna API — coverage varies by country and may miss company career pages",
    workaround: "For comprehensive results, supplement with google-search scoped to the target company's careers page" },

  // ── keyword-suggest ──
  { capabilitySlug: "keyword-suggest", category: "accuracy", severity: "info",
    title: "Google Autocomplete suggestions reflect search popularity, not commercial intent or conversion potential",
    limitationText: "Uses Google Autocomplete API — suggestions reflect search popularity, not commercial intent or conversion potential",
    workaround: "Filter suggestions through your conversion data to identify which keywords actually drive business value" },

  // ── latvian-company-data ──
  { capabilitySlug: "latvian-company-data", category: "coverage", severity: "info",
    title: "Extracted from Lursoft/UR via Browserless — detailed Latvian financial data may require paid access",
    limitationText: "Extracted from Lursoft/UR via Browserless — detailed financial data may require paid access",
    workaround: "Use the registration number from the response to query the Latvian Enterprise Register directly at ur.gov.lv" },

  // ── lithuanian-company-data ──
  { capabilitySlug: "lithuanian-company-data", category: "coverage", severity: "info",
    title: "Extracted from Lithuanian Registrų Centras via Browserless — full financial filings require separate access",
    limitationText: "Extracted from Registrų Centras via Browserless — full financial filings require separate access",
    workaround: "Use the company code from the response to search registrucentras.lt for complete filings" },

  // ── npm-package-info ──
  { capabilitySlug: "npm-package-info", category: "coverage", severity: "info",
    title: "Queries the public npm registry only — private packages and packages from private registries are not accessible",
    limitationText: "Queries the public npm registry — private packages and scoped packages from private registries are not accessible",
    workaround: "For private packages, query your organization's registry endpoint directly" },

  // ── patent-search ──
  { capabilitySlug: "patent-search", category: "coverage", severity: "info",
    title: "Searches Google Patents via Browserless — focused on US, EP, and WO patents; some national patents may not appear",
    limitationText: "Searches via Browserless + Google Patents — coverage focused on US, EP, and WO patents; some national patents may not appear",
    workaround: "For comprehensive patent searches, supplement with Espacenet (worldwide.espacenet.com) or the national patent office" },

  // ── pdf-extract ──
  { capabilitySlug: "pdf-extract", category: "accuracy", severity: "info",
    title: "Scanned PDFs (image-based) have lower extraction accuracy than native text PDFs",
    limitationText: "AI extraction from PDFs — scanned documents (image PDFs) have lower accuracy than native text PDFs",
    workaround: "For scanned documents, use image-to-text on individual pages for better OCR control" },
  { capabilitySlug: "pdf-extract", category: "coverage", severity: "info",
    title: "Password-protected or DRM-encrypted PDFs cannot be processed and will return an error",
    limitationText: "Password-protected or DRM-encrypted PDFs cannot be processed",
    workaround: "Remove password protection before submitting, or extract text using a local PDF library with the document password" },

  // ── polish-company-data ──
  { capabilitySlug: "polish-company-data", category: "coverage", severity: "info",
    title: "Covers KRS-registered entities only — Polish sole traders registered in CEIDG are not included",
    limitationText: "Data from KRS — coverage limited to entities registered in the National Court Register; sole traders (CEIDG) not included",
    workaround: "For sole traders, query the CEIDG register directly at prod.ceidg.gov.pl using the NIP or PESEL" },

  // ── port-lookup ──
  { capabilitySlug: "port-lookup", category: "coverage", severity: "info",
    title: "AI-based port information covers major seaports and airports — small inland ports may have limited data",
    limitationText: "AI-based port information — covers major seaports and airports; small inland ports may have limited data",
    workaround: "For UN/LOCODE validation, cross-reference against the UNECE code list at unece.org/cefact/locode" },

  // ── portuguese-company-data ──
  { capabilitySlug: "portuguese-company-data", category: "coverage", severity: "info",
    title: "Extracted from Portal da Empresa via Browserless — detailed financial data requires paid IES filing access",
    limitationText: "Extracted from Portal da Empresa via Browserless — detailed financial data requires paid access to IES filings",
    workaround: "Use the NIF from the response to access company filings via racius.com or einforma.pt" },

  // ── price-compare ──
  { capabilitySlug: "price-compare", category: "accuracy", severity: "info",
    title: "Prices scraped from retailer websites do not include personalized pricing or member discounts",
    limitationText: "Prices scraped from retailer websites — results may not include personalized pricing, member discounts, or real-time promotions",
    workaround: "Treat as list price comparison; check each retailer link in the response for current promotions before purchase decisions" },

  // ── product-reviews-extract ──
  { capabilitySlug: "product-reviews-extract", category: "coverage", severity: "info",
    title: "Extracts visible product page reviews only — hidden, filtered, or paginated reviews may not be captured",
    limitationText: "Extracts reviews visible on the product page — filtered/hidden reviews and reviews behind 'load more' may not be captured",
    workaround: "Request the direct product review page URL rather than the main product page for more complete review coverage" },

  // ── product-search ──
  { capabilitySlug: "product-search", category: "coverage", severity: "info",
    title: "Product search results depend on retailer scraping and vary by region and product category",
    limitationText: "Search results depend on retailer website scraping — results vary by region and product category",
    workaround: "Include the target market or retailer name in the search query for more relevant results" },

  // ── public-holiday-lookup ──
  { capabilitySlug: "public-holiday-lookup", category: "coverage", severity: "info",
    title: "Covers national public holidays via Nager.Date — regional, state, and bank holidays may not be included",
    limitationText: "Covers national public holidays via Nager.Date API — regional/state holidays and bank holidays may not be included",
    workaround: "For regional holidays (e.g., German Bundesländer), check the specific state's official holiday calendar" },

  // ── pypi-package-info ──
  { capabilitySlug: "pypi-package-info", category: "coverage", severity: "info",
    title: "Queries the public PyPI registry only — private packages and alternative indexes like Artifactory are not accessible",
    limitationText: "Queries the public PyPI registry — private packages and packages hosted on alternative indexes (e.g., Artifactory) are not accessible",
    workaround: "For private packages, query your organization's Python package index directly" },

  // ── return-policy-extract ──
  { capabilitySlug: "return-policy-extract", category: "accuracy", severity: "info",
    title: "Complex conditional return policies or product-specific exceptions may be simplified during extraction",
    limitationText: "Extracts return policy terms via scraping — policies with complex conditional logic or product-specific exceptions may be simplified",
    workaround: "Verify extracted terms against the retailer's full return policy page for product-category-specific conditions" },

  // ── salary-benchmark ──
  { capabilitySlug: "salary-benchmark", category: "accuracy", severity: "info",
    title: "Salary data from public sources tends to skew toward larger companies and tech-heavy markets",
    limitationText: "Salary data scraped from public sources — samples may skew toward larger companies and tech-heavy markets",
    workaround: "Use as a directional benchmark and adjust for company size, location, and industry using local compensation surveys" },

  // ── serp-analyze ──
  { capabilitySlug: "serp-analyze", category: "accuracy", severity: "info",
    title: "SERP analysis is a point-in-time snapshot — rankings change frequently with Google algorithm updates",
    limitationText: "Analyzes search results at a point in time — SERP rankings change frequently based on Google algorithm updates",
    workaround: "Track SERP positions over time rather than relying on a single snapshot for SEO strategy decisions" },

  // ── shipping-cost-estimate ──
  { capabilitySlug: "shipping-cost-estimate", category: "accuracy", severity: "info",
    title: "Shipping cost estimates are AI-generated — actual costs depend on account-specific rates and surcharges",
    limitationText: "AI-generated estimates based on general carrier pricing — actual costs depend on account-specific rates, surcharges, and seasonal adjustments",
    workaround: "Use as an order-of-magnitude estimate and request actual quotes from your contracted carriers for budgeting" },

  // ── shipping-track ──
  { capabilitySlug: "shipping-track", category: "coverage", severity: "info",
    title: "Tracking is scraped from carrier websites and some regional carriers may not be supported",
    limitationText: "Tracking via carrier websites — supported carriers may vary and some regional carriers are not covered",
    workaround: "If tracking fails, use the tracking number format to identify the carrier and check their website directly" },

  // ── singapore-company-data ──
  { capabilitySlug: "singapore-company-data", category: "coverage", severity: "info",
    title: "Extracted from Singapore ACRA via Browserless — detailed financial filings require a paid BizFile+ search",
    limitationText: "Extracted from ACRA via Browserless — detailed financial filings require a paid BizFile+ search",
    workaround: "Use the UEN from the response to purchase detailed profiles at bizfile.gov.sg" },

  // ── skill-extract ──
  { capabilitySlug: "skill-extract", category: "accuracy", severity: "info",
    title: "AI skill extraction may categorize competencies differently than industry taxonomies like ESCO or O*NET",
    limitationText: "AI-powered skill extraction — may categorize broad competencies differently than specific industry taxonomies (e.g., ESCO, O*NET)",
    workaround: "Map extracted skills to your target taxonomy (ESCO, O*NET) as a post-processing step for HR system integration" },

  // ── skill-gap-analyze ──
  { capabilitySlug: "skill-gap-analyze", category: "accuracy", severity: "info",
    title: "Skill gap analysis is based on descriptions only — actual proficiency and certifications are not measured",
    limitationText: "Gap analysis based on AI assessment of skill descriptions — does not measure actual proficiency or certification status",
    workaround: "Use as a starting point for development planning and validate critical gaps with skills assessments or interviews" },

  // ── spanish-company-data ──
  { capabilitySlug: "spanish-company-data", category: "coverage", severity: "info",
    title: "Extracted from Spanish Registro Mercantil via Browserless — financial data requires a paid access subscription",
    limitationText: "Extracted from Registro Mercantil via Browserless — financial data requires paid access to the Registro Mercantil",
    workaround: "Use the CIF from the response to access full filings at registradores.org or infocif.es" },

  // ── swift-message-parse ──
  { capabilitySlug: "swift-message-parse", category: "coverage", severity: "info",
    title: "Parses MT message formats like MT103 and MT202 only — MX/ISO 20022 XML messages are not supported",
    limitationText: "Parses MT message formats (MT103, MT202, etc.) — MX/ISO 20022 XML messages are not supported",
    workaround: "For ISO 20022 messages, use xml-to-json to parse the XML structure first" },

  // ── swiss-company-data ──
  { capabilitySlug: "swiss-company-data", category: "coverage", severity: "info",
    title: "Extracted from Zefix/Handelsregister via Browserless — detailed financial data is not publicly available in Switzerland",
    limitationText: "Extracted from Zefix/Handelsregister via Browserless — detailed financial data not publicly available in Switzerland",
    workaround: "Use the CHE number from the response to order a certified extract from the cantonal Handelsregisteramt" },

  // ── ted-procurement ──
  { capabilitySlug: "ted-procurement", category: "coverage", severity: "info",
    title: "Covers EU public procurement above threshold values only — below-threshold tenders are on national portals",
    limitationText: "Covers EU public procurement above threshold values — below-threshold national tenders are published on country-specific portals",
    workaround: "For national tenders, supplement with the country's procurement portal (e.g., Mercell, SIMAP, Contracts Finder)" },

  // ── terms-of-service-extract ──
  { capabilitySlug: "terms-of-service-extract", category: "accuracy", severity: "info",
    title: "AI extracts key terms of service clauses but legal interpretation requires qualified legal review",
    limitationText: "AI extraction of key terms — legal interpretation of clauses requires qualified legal review",
    workaround: "Use extracted terms as a quick screening tool and flag unusual clauses for legal counsel review" },

  // ── ticker-lookup ──
  { capabilitySlug: "ticker-lookup", category: "coverage", severity: "info",
    title: "Yahoo Finance autocomplete covers major global exchanges but may miss OTC or recently listed securities",
    limitationText: "Uses Yahoo Finance autocomplete — covers major exchanges globally but may miss OTC or very recently listed securities",
    workaround: "For OTC securities, try searching by ISIN or check the specific exchange's website directly" },

  // ── trustpilot-score ──
  { capabilitySlug: "trustpilot-score", category: "coverage", severity: "info",
    title: "Scrapes Trustpilot directly — companies not listed on Trustpilot will return no results",
    limitationText: "Scrapes Trustpilot — companies not listed on Trustpilot will return no results",
    workaround: "If no Trustpilot profile exists, check Google Business Profile or use google-search for alternative review sources" },

  // ── uk-companies-house-officers ──
  { capabilitySlug: "uk-companies-house-officers", category: "coverage", severity: "info",
    title: "Returns current and recently resigned officers — historical data beyond Companies House retention may be incomplete",
    limitationText: "Returns current and recently resigned officers — historical officer data beyond Companies House retention may be incomplete",
    workaround: "For complete officer history, use the filing_history endpoint at Companies House with the company number" },

  // ── uk-company-data ──
  { capabilitySlug: "uk-company-data", category: "coverage", severity: "info",
    title: "Companies House API includes LLPs but sole traders and unregistered partnerships are not covered",
    limitationText: "Data from Companies House API — LLPs and Scottish LPs included, but sole traders and partnerships are not registered",
    workaround: "For sole traders, check HMRC's contractor verification or use the business name with google-search" },

  // ── vat-rate-lookup ──
  { capabilitySlug: "vat-rate-lookup", category: "freshness", severity: "info",
    title: "AI-generated VAT rates may not reflect the most recent fiscal policy changes or rate adjustments",
    limitationText: "AI-generated VAT rates — rates change with fiscal policy and may not reflect the most recent adjustments",
    workaround: "Verify rates against the EU VAT rate database at ec.europa.eu/taxation_customs before use in invoicing systems" },

  // ── weather-lookup ──
  { capabilitySlug: "weather-lookup", category: "accuracy", severity: "info",
    title: "Open-Meteo forecast accuracy decreases beyond 3 days and varies by geographic region",
    limitationText: "Current weather from Open-Meteo — forecast accuracy decreases beyond 3 days and varies by geographic region",
    workaround: "For critical operations, cross-reference with national meteorological services for severe weather warnings" },

  // ── web-extract ──
  { capabilitySlug: "web-extract", category: "coverage", severity: "info",
    title: "Pages requiring login, CAPTCHA, or multi-step navigation cannot be accessed via headless browser",
    limitationText: "Renders pages via headless browser — pages requiring login, CAPTCHA, or multi-step navigation cannot be accessed",
    workaround: "For authenticated content, pre-fetch the HTML and pass it directly as input instead of a URL" },
  { capabilitySlug: "web-extract", category: "accuracy", severity: "info",
    title: "AI extraction may lose structural context in complex data tables or deeply nested page layouts",
    limitationText: "AI extraction interprets page content — complex data tables or deeply nested layouts may lose structural context",
    workaround: "Use structured-scrape with CSS selectors for precise extraction when you know the page structure" },

  // ── website-carbon-estimate ──
  { capabilitySlug: "website-carbon-estimate", category: "accuracy", severity: "info",
    title: "Carbon estimates based on page weight only — actual emissions depend on server location and energy grid mix",
    limitationText: "Carbon estimates based on page weight and transfer size — actual emissions depend on server location, CDN, and energy grid mix",
    workaround: "Use as a relative benchmark for comparing pages; for certified carbon reporting, use tools like Green Web Foundation or Ecograder" },

  // ── work-permit-requirements ──
  { capabilitySlug: "work-permit-requirements", category: "accuracy", severity: "warning",
    title: "AI-generated immigration guidance changes frequently and varies by individual circumstances — verify with authorities",
    limitationText: "AI-generated guidance on immigration rules — requirements change frequently and vary by individual circumstances",
    workaround: "Verify requirements with the destination country's immigration authority or a qualified immigration lawyer before filing" },

  // ── address-parse ──
  { capabilitySlug: "address-parse", category: "accuracy", severity: "info",
    title: "Addresses with ambiguous formatting or missing components may be parsed incorrectly by the AI",
    limitationText: "AI-powered parsing — addresses with ambiguous formatting or missing components may be parsed incorrectly",
    workaround: "Validate parsed components against a postal address database (e.g., Google Address Validation API) for critical use cases" },

  // ── csv-clean ──
  { capabilitySlug: "csv-clean", category: "coverage", severity: "info",
    title: "Handles common CSV encoding and delimiter issues — extremely malformed files may require manual preprocessing",
    limitationText: "Handles common CSV issues (encoding, delimiters, quoting) — extremely malformed files may require manual preprocessing",
    workaround: "If cleaning fails, specify the exact delimiter and encoding in the input parameters" },

  // ── csv-to-json ──
  { capabilitySlug: "csv-to-json", category: "coverage", severity: "info",
    title: "Expects consistent column counts — multi-line cell values or mixed delimiters may cause parse errors",
    limitationText: "Expects well-formed CSV with consistent column counts — multi-line cell values or mixed delimiters may cause parse errors",
    workaround: "Pre-clean the CSV with csv-clean before converting, or specify the delimiter explicitly" },

  // ── data-quality-check ──
  { capabilitySlug: "data-quality-check", category: "coverage", severity: "info",
    title: "Checks for nulls, duplicates, and type mismatches only — domain-specific validation rules are not applied",
    limitationText: "Checks for common data quality issues (nulls, duplicates, type mismatches) — domain-specific validation rules are not applied",
    workaround: "Combine with json-schema-validate to enforce domain-specific constraints on your data" },

  // ── date-parse ──
  { capabilitySlug: "date-parse", category: "accuracy", severity: "info",
    title: "Ambiguous date formats like 01/02/03 may misinterpret month/day order without an explicit locale hint",
    limitationText: "Ambiguous date formats (e.g., 01/02/03) are resolved using locale hints — may misinterpret month/day order without explicit format",
    workaround: "Pass the expected date format or locale in the input to eliminate ambiguity for MM/DD vs DD/MM formats" },

  // ── deduplicate ──
  { capabilitySlug: "deduplicate", category: "accuracy", severity: "info",
    title: "Exact and fuzzy matching may miss records that are semantic duplicates but structurally different",
    limitationText: "Uses exact and fuzzy matching — records that are semantically duplicates but structurally different may not be caught",
    workaround: "Adjust the similarity threshold parameter and review the flagged duplicates before automatic removal" },

  // ── flatten-json ──
  { capabilitySlug: "flatten-json", category: "coverage", severity: "info",
    title: "Circular references or extremely deep nesting beyond 50 levels may cause flattening errors",
    limitationText: "Flattens nested objects using dot notation — circular references or extremely deep nesting (>50 levels) may cause errors",
    workaround: "Pre-process input to remove circular references and limit nesting depth before flattening" },

  // ── json-repair ──
  { capabilitySlug: "json-repair", category: "coverage", severity: "info",
    title: "Repairs common JSON errors like trailing commas and unquoted keys — severely malformed input may not recover",
    limitationText: "Repairs common JSON errors (trailing commas, unquoted keys, single quotes) — severely malformed input may not be recoverable",
    workaround: "If repair fails, extract the valid JSON segments manually or use an LLM to reconstruct the intended structure" },

  // ── json-to-csv ──
  { capabilitySlug: "json-to-csv", category: "coverage", severity: "info",
    title: "Deeply nested JSON objects are flattened with dot notation and may produce very wide CSV output",
    limitationText: "Best with flat or shallow JSON arrays — deeply nested objects are flattened with dot notation which may produce wide CSVs",
    workaround: "Use flatten-json first with a controlled depth parameter to preview the flattened structure before converting" },

  // ── name-parse ──
  { capabilitySlug: "name-parse", category: "accuracy", severity: "info",
    title: "Compound surnames, non-Western naming conventions, and honorifics may be split incorrectly",
    limitationText: "AI-powered name parsing — compound surnames, cultural naming conventions, and honorifics may be split incorrectly",
    workaround: "Provide locale or cultural context in the input to improve parsing accuracy for non-Western name formats" },

  // ── phone-normalize ──
  { capabilitySlug: "phone-normalize", category: "coverage", severity: "info",
    title: "Country code detection relies on input hints when the phone number does not include a + prefix",
    limitationText: "Normalizes to E.164 format — country code detection relies on input hints when the number doesn't include a +prefix",
    workaround: "Always include the country code or specify the default_country parameter to avoid ambiguous normalization" },

  // ── schema-infer ──
  { capabilitySlug: "schema-infer", category: "accuracy", severity: "info",
    title: "Schema is inferred from sample data — optional fields or rare value types may not appear in the output",
    limitationText: "Infers schema from sample data — optional fields or rare value types may not appear in the inferred schema",
    workaround: "Provide a representative sample including edge cases and null values for more accurate schema inference" },

  // ── unit-convert ──
  { capabilitySlug: "unit-convert", category: "coverage", severity: "info",
    title: "Covers common unit categories like length, weight, and speed — specialized units like radiation are not supported",
    limitationText: "Covers common unit categories (length, weight, volume, temperature, speed) — specialized units (e.g., radiation, magnetic flux) not supported",
    workaround: "For unsupported unit types, use the conversion factor directly in your application logic" },

  // ── xml-to-json ──
  { capabilitySlug: "xml-to-json", category: "coverage", severity: "info",
    title: "XML with mixed content — text interleaved with elements — may lose text ordering during conversion",
    limitationText: "Converts standard XML — XML with mixed content (text interleaved with elements) may lose text ordering during conversion",
    workaround: "For mixed-content XML, use a streaming parser that preserves text node positions" },

  // ── agent-trace-analyze ──
  { capabilitySlug: "agent-trace-analyze", category: "accuracy", severity: "info",
    title: "AI trace analysis may not identify all performance bottlenecks in complex multi-agent orchestrations",
    limitationText: "AI analysis of agent traces — may not identify all performance bottlenecks in complex multi-agent orchestrations",
    workaround: "Provide the full trace including timestamps and tool outputs for the most actionable analysis" },

  // ── api-docs-generate ──
  { capabilitySlug: "api-docs-generate", category: "accuracy", severity: "info",
    title: "Generated documentation reflects only the provided API spec — undocumented behavior is not inferred",
    limitationText: "Generated documentation reflects the provided API spec — undocumented behavior and edge cases are not inferred",
    workaround: "Review generated docs against actual API behavior and add examples for complex endpoints" },

  // ── api-mock-response ──
  { capabilitySlug: "api-mock-response", category: "accuracy", severity: "info",
    title: "Mock values are schema-based and may not satisfy complex cross-field validation rules",
    limitationText: "Generates plausible mock data based on schema — mock values may not satisfy complex cross-field validation rules",
    workaround: "Provide example responses in the input to guide mock generation for fields with specific value constraints" },

  // ── changelog-generate ──
  { capabilitySlug: "changelog-generate", category: "accuracy", severity: "info",
    title: "AI-generated changelog may not correctly distinguish user-facing impact from internal code changes",
    limitationText: "AI-generated changelog from commit messages or diffs — may not correctly identify user-facing impact vs internal changes",
    workaround: "Use conventional commit prefixes (feat:, fix:, chore:) in your commits for more accurate categorization" },

  // ── code-convert ──
  { capabilitySlug: "code-convert", category: "accuracy", severity: "warning",
    title: "AI code conversion may need manual adjustment for language-specific idioms and library differences",
    limitationText: "AI-powered code conversion — language-specific idioms, standard library differences, and edge cases may require manual adjustment",
    workaround: "Run the converted code through the target language's linter and test suite before using in production" },

  // ── commit-message-generate ──
  { capabilitySlug: "commit-message-generate", category: "accuracy", severity: "info",
    title: "AI-generated commit messages from diff content may not capture the intent or reason behind changes",
    limitationText: "AI-generated messages based on diff content — may not capture the 'why' behind changes without additional context",
    workaround: "Include a brief description of the intent in the input alongside the diff for more meaningful commit messages" },

  // ── context-window-optimize ──
  { capabilitySlug: "context-window-optimize", category: "accuracy", severity: "info",
    title: "Token savings from optimization suggestions vary by LLM — actual counts depend on the specific tokenizer",
    limitationText: "Optimization suggestions based on general best practices — actual token savings depend on the specific LLM's tokenizer",
    workaround: "Measure actual token counts with the target model's tokenizer before and after applying suggestions" },

  // ── crontab-generate ──
  { capabilitySlug: "crontab-generate", category: "accuracy", severity: "info",
    title: "Generates standard cron expressions — non-standard extensions like seconds field may not work in all schedulers",
    limitationText: "Generates standard cron expressions — non-standard extensions (e.g., seconds field, @reboot) may not be supported by all schedulers",
    workaround: "Verify the generated expression against your specific cron implementation (e.g., systemd vs crontab vs cloud scheduler)" },

  // ── curl-to-code ──
  { capabilitySlug: "curl-to-code", category: "coverage", severity: "info",
    title: "Supports major languages like Python and Go — less common target languages may produce suboptimal output",
    limitationText: "Supports conversion to major languages (Python, JavaScript, Go, etc.) — less common languages may have suboptimal output",
    workaround: "Review the generated HTTP client code against your project's preferred HTTP library and error handling patterns" },

  // ── dependency-audit ──
  { capabilitySlug: "dependency-audit", category: "accuracy", severity: "info",
    title: "AI audit covers declared dependencies only — transitive vulnerability chains and runtime dependencies are not detected",
    limitationText: "AI-based audit of declared dependencies — cannot detect transitive vulnerability chains or runtime-only dependencies",
    workaround: "Supplement with npm audit or pip-audit for vulnerability scanning that includes transitive dependencies" },

  // ── dockerfile-generate ──
  { capabilitySlug: "dockerfile-generate", category: "accuracy", severity: "info",
    title: "Generated Dockerfiles follow best practices but may not account for project-specific build requirements",
    limitationText: "Generated Dockerfiles follow best practices but may not account for project-specific build requirements or private registries",
    workaround: "Test the generated Dockerfile in a CI pipeline and adjust base images, build args, and secrets as needed" },

  // ── docstring-generate ──
  { capabilitySlug: "docstring-generate", category: "accuracy", severity: "info",
    title: "AI-generated docstrings may not capture non-obvious side effects, thread safety, or exception behavior",
    limitationText: "AI-generated docstrings — may not capture non-obvious side effects, thread safety, or exception behavior",
    workaround: "Review generated docstrings for accuracy and add implementation-specific warnings or notes manually" },

  // ── env-template-generate ──
  { capabilitySlug: "env-template-generate", category: "coverage", severity: "info",
    title: "Dynamically constructed environment variable names may be missed during code analysis",
    limitationText: "Generates .env templates from code analysis — dynamically constructed environment variable names may be missed",
    workaround: "Cross-reference with your deployment documentation to catch environment variables not referenced in code" },

  // ── error-explain ──
  { capabilitySlug: "error-explain", category: "accuracy", severity: "info",
    title: "Root cause suggestions are pattern-based hypotheses and may not match your specific environment",
    limitationText: "AI explanation of error messages — root cause suggestions are based on common patterns and may not match your specific environment",
    workaround: "Use the suggested causes as debugging hypotheses and verify against your application's logs and configuration" },

  // ── fake-data-generate ──
  { capabilitySlug: "fake-data-generate", category: "accuracy", severity: "info",
    title: "Generated fake data follows realistic patterns but may not pass strict checksum or format validation",
    limitationText: "Generated fake data follows realistic patterns but may not pass strict validation (e.g., valid-checksum IBANs, real postal codes)",
    workaround: "For fields requiring valid checksums or format validation, use dedicated validators on the generated data" },

  // ── github-actions-generate ──
  { capabilitySlug: "github-actions-generate", category: "accuracy", severity: "info",
    title: "Generated workflows use common action versions — pinned SHA references and custom runners are not included",
    limitationText: "Generated workflows use common action versions — pinned SHA references and organization-specific runners are not included",
    workaround: "Pin action versions to SHAs for security and replace runner references with your organization's self-hosted runners if applicable" },

  // ── github-repo-analyze ──
  { capabilitySlug: "github-repo-analyze", category: "coverage", severity: "info",
    title: "Analyzes public repository metadata only — code quality, test coverage, and internal docs are not assessed",
    limitationText: "Analyzes public repository metadata — code quality metrics, test coverage, and internal documentation are not assessed",
    workaround: "Combine with dependency-audit for security insights and code-review for quality assessment of specific files" },

  // ── gitignore-generate ──
  { capabilitySlug: "gitignore-generate", category: "coverage", severity: "info",
    title: "Generates patterns for common tools and frameworks — project-specific build artifacts may need manual additions",
    limitationText: "Generates patterns for common tools and frameworks — project-specific build artifacts or custom tooling may need manual additions",
    workaround: "Review the generated .gitignore against your actual build output directory and add project-specific patterns" },

  // ── http-to-curl ──
  { capabilitySlug: "http-to-curl", category: "coverage", severity: "info",
    title: "Binary payloads and multipart uploads may produce simplified curl equivalents that need manual adjustment",
    limitationText: "Converts standard HTTP request formats — binary payloads or multipart uploads may produce simplified curl equivalents",
    workaround: "For binary payloads, use the --data-binary flag manually and reference the file path instead of inline content" },

  // ── job-posting-analyze ──
  { capabilitySlug: "job-posting-analyze", category: "accuracy", severity: "info",
    title: "Job posting salary estimates and seniority are inferred from language patterns, not verified data",
    limitationText: "AI analysis of job posting text — salary estimates and seniority inference are based on language patterns, not verified data",
    workaround: "Cross-reference inferred salary ranges with salary-benchmark results for the same role and location" },

  // ── jsdoc-generate ──
  { capabilitySlug: "jsdoc-generate", category: "accuracy", severity: "info",
    title: "AI-generated JSDoc may produce incomplete annotations for complex generics or overloaded function signatures",
    limitationText: "AI-generated JSDoc — complex generic types or overloaded function signatures may produce incomplete type annotations",
    workaround: "Validate generated JSDoc with TypeScript compiler type checking to catch annotation mismatches" },

  // ── json-to-pydantic ──
  { capabilitySlug: "json-to-pydantic", category: "accuracy", severity: "info",
    title: "Optional fields may be marked as required if they appear in every sample provided to the model inferrer",
    limitationText: "Infers Pydantic models from JSON samples — optional fields may be marked as required if always present in the sample",
    workaround: "Provide samples with null values for optional fields, or manually adjust Field(default=None) after generation" },

  // ── json-to-typescript ──
  { capabilitySlug: "json-to-typescript", category: "accuracy", severity: "info",
    title: "Union types and optional fields may not be detected correctly from a single JSON sample",
    limitationText: "Infers TypeScript interfaces from JSON samples — union types and optional fields may not be correctly detected from a single sample",
    workaround: "Provide multiple JSON samples with varying shapes to produce more accurate optional and union type inference" },

  // ── json-to-zod ──
  { capabilitySlug: "json-to-zod", category: "accuracy", severity: "info",
    title: "Generates Zod schemas from JSON samples but string format constraints like email or URL are not inferred",
    limitationText: "Generates Zod schemas from JSON samples — string format constraints (email, URL, date) are not inferred automatically",
    workaround: "Add .email(), .url(), or .datetime() refinements manually for fields that require format validation" },

  // ── jwt-decode ──
  { capabilitySlug: "jwt-decode", category: "coverage", severity: "info",
    title: "Decodes JWT payload only — signature is not verified, so a decoded token is not proof of authenticity",
    limitationText: "Decodes JWT payload without signature verification — a decoded token is not proof of authenticity",
    workaround: "Always verify JWT signatures using the issuer's public key or JWKS endpoint before trusting claims" },

  // ── llm-cost-calculate ──
  { capabilitySlug: "llm-cost-calculate", category: "freshness", severity: "info",
    title: "LLM pricing uses a built-in model table — new models or recent pricing changes may not be reflected",
    limitationText: "Pricing data based on built-in model table — new models or pricing changes may not be reflected immediately",
    workaround: "Check the provider's current pricing page for models showing unexpected costs, especially after major releases" },

  // ── log-parse ──
  { capabilitySlug: "log-parse", category: "coverage", severity: "info",
    title: "Custom or proprietary log formats may require specific format hints for accurate AI parsing",
    limitationText: "AI-powered log parsing — custom or proprietary log formats may require specific format hints for accurate parsing",
    workaround: "Include a sample log line description or format string in the input for non-standard log formats" },

  // ── nginx-config-generate ──
  { capabilitySlug: "nginx-config-generate", category: "accuracy", severity: "info",
    title: "Generates standard nginx configurations — custom modules and OpenResty/Lua blocks are not supported",
    limitationText: "Generates standard nginx configurations — complex setups with custom modules or OpenResty/Lua blocks are not supported",
    workaround: "Use the generated config as a base template and add custom directives for your specific nginx modules" },

  // ── openapi-generate ──
  { capabilitySlug: "openapi-generate", category: "accuracy", severity: "info",
    title: "AI-generated OpenAPI specs may need manual refinement for complex request/response schemas",
    limitationText: "AI-generated OpenAPI spec from code or descriptions — complex request/response schemas may need manual refinement",
    workaround: "Validate the generated spec with openapi-validate and test against actual API behavior" },

  // ── openapi-validate ──
  { capabilitySlug: "openapi-validate", category: "coverage", severity: "info",
    title: "Validates against OpenAPI 3.0/3.1 specification only — custom vendor extensions are not checked",
    limitationText: "Validates against OpenAPI 3.0/3.1 specification — custom extensions and vendor-specific annotations are not checked",
    workaround: "For vendor extensions (x- prefixed), add your own validation rules in a post-processing step" },

  // ── pr-description-generate ──
  { capabilitySlug: "pr-description-generate", category: "accuracy", severity: "info",
    title: "AI-generated PR descriptions may not capture business motivation or link to relevant issues automatically",
    limitationText: "AI-generated from diff content — may not capture the business motivation or link to relevant issues automatically",
    workaround: "Include the ticket/issue number in the input and review the generated description for completeness" },

  // ── prompt-compress ──
  { capabilitySlug: "prompt-compress", category: "accuracy", severity: "info",
    title: "Compression may remove context that appears redundant but is semantically important for specific tasks",
    limitationText: "Compression may remove context that appears redundant but is semantically important for specific LLM tasks",
    workaround: "Test compressed prompts against your original to verify output quality is maintained before switching" },

  // ── readme-generate ──
  { capabilitySlug: "readme-generate", category: "accuracy", severity: "info",
    title: "AI-generated README installation steps and configuration details may not match your actual setup process",
    limitationText: "AI-generated README from project context — installation steps and configuration details may not reflect your actual setup process",
    workaround: "Verify all command examples and installation steps in a clean environment before publishing" },

  // ── regex-explain ──
  { capabilitySlug: "regex-explain", category: "coverage", severity: "info",
    title: "Explains standard regex syntax only — engine-specific features like PCRE2 lookbehinds may not be fully documented",
    limitationText: "Explains standard regex syntax — engine-specific features (PCRE2 lookbehinds, .NET named groups) may not be fully documented",
    workaround: "Specify the target regex engine in the input for more accurate explanations of engine-specific syntax" },

  // ── release-notes-generate ──
  { capabilitySlug: "release-notes-generate", category: "accuracy", severity: "info",
    title: "Breaking changes may not be prominently flagged without conventional commit markers in the source",
    limitationText: "Generated from commits or changelogs — breaking changes may not be prominently flagged without conventional commit markers",
    workaround: "Use breaking change prefixes (BREAKING CHANGE:, feat!:) in commits for accurate breaking change detection" },

  // ── schema-migration-generate ──
  { capabilitySlug: "schema-migration-generate", category: "accuracy", severity: "warning",
    title: "AI-generated migrations with destructive operations like DROP COLUMN must be verified before running on production",
    limitationText: "AI-generated migrations — destructive operations (DROP COLUMN, type changes) should be verified before running on production data",
    workaround: "Always review generated migrations in a staging environment and add explicit backfill steps for data transformations" },

  // ── sql-explain ──
  { capabilitySlug: "sql-explain", category: "accuracy", severity: "info",
    title: "SQL performance explanations depend on your specific database engine, indexes, and data distribution",
    limitationText: "AI explanation of SQL queries — performance implications depend on your specific database engine, indexes, and data distribution",
    workaround: "Run EXPLAIN ANALYZE on your actual database to see the real execution plan alongside the AI explanation" },

  // ── sql-generate ──
  { capabilitySlug: "sql-generate", category: "accuracy", severity: "warning",
    title: "AI-generated SQL with complex joins and subqueries must be tested against your schema before production use",
    limitationText: "AI-generated SQL — complex joins and subqueries should be tested against your schema before running on production",
    workaround: "Test generated queries against a staging database with representative data volume to verify correctness and performance" },

  // ── sql-optimize ──
  { capabilitySlug: "sql-optimize", category: "accuracy", severity: "info",
    title: "SQL optimization suggestions are generic — actual gains depend on your database engine, data size, and indexes",
    limitationText: "Optimization suggestions are generic — actual performance gains depend on your database engine, data size, and index configuration",
    workaround: "Benchmark optimized queries with EXPLAIN ANALYZE against your actual data to measure real improvement" },

  // ── test-case-generate ──
  { capabilitySlug: "test-case-generate", category: "accuracy", severity: "info",
    title: "AI-generated tests cover common paths — edge cases specific to your business logic require manual authoring",
    limitationText: "AI-generated test cases cover common paths — edge cases specific to your business logic may require manual test authoring",
    workaround: "Use generated tests as a starting coverage baseline and add domain-specific edge cases manually" },

  // ── token-count ──
  { capabilitySlug: "token-count", category: "accuracy", severity: "info",
    title: "Token counts use character-based heuristics and may vary 5-15% from the model's actual tokenizer",
    limitationText: "Token counts are estimated using character-based heuristics — actual counts vary by 5-15% depending on the tokenizer",
    workaround: "For exact counts, use the model provider's official tokenizer (tiktoken for OpenAI, Anthropic's token counter)" },

  // ── tool-call-validate ──
  { capabilitySlug: "tool-call-validate", category: "coverage", severity: "info",
    title: "Validates tool call structure and parameter types only — semantic correctness of parameter values is not checked",
    limitationText: "Validates tool call structure and parameter types — cannot verify whether parameter values are semantically correct",
    workaround: "Combine with runtime testing against the actual tool to verify that parameter values produce expected results" },

  // ── webhook-test-payload ──
  { capabilitySlug: "webhook-test-payload", category: "accuracy", severity: "info",
    title: "Generated payloads match common webhook schemas — provider-specific fields or versioned formats may differ",
    limitationText: "Generated payloads match common webhook schemas — provider-specific fields or versioned payload formats may differ",
    workaround: "Compare generated payloads against the provider's webhook documentation and adjust field names as needed" },

  // ── contract-extract ──
  { capabilitySlug: "contract-extract", category: "accuracy", severity: "warning",
    title: "AI extraction of contract terms does not replace qualified legal review of interpretation or enforceability",
    limitationText: "AI extraction of contract terms — legal interpretation and enforceability assessment require qualified legal review",
    workaround: "Use extracted terms for initial screening and route flagged clauses to legal counsel for review" },

  // ── meeting-notes-extract ──
  { capabilitySlug: "meeting-notes-extract", category: "accuracy", severity: "info",
    title: "AI extraction of action items may miss nuanced verbal agreements or implicit commitments from meetings",
    limitationText: "AI extraction of action items and decisions — nuanced verbal agreements or implicit commitments may be missed",
    workaround: "Distribute extracted notes to all participants for confirmation before treating action items as final" },

  // ── receipt-categorize ──
  { capabilitySlug: "receipt-categorize", category: "accuracy", severity: "info",
    title: "Unusual merchants or multi-category purchases may be miscategorized by the AI expense categorizer",
    limitationText: "AI categorization based on merchant name and amount — unusual merchants or multi-category purchases may be miscategorized",
    workaround: "Provide your chart of accounts or category taxonomy in the input for more accurate categorization" },

  // ── resume-parse ──
  { capabilitySlug: "resume-parse", category: "accuracy", severity: "info",
    title: "Non-standard layouts, multi-column designs, and heavily formatted PDFs may lose structure during parsing",
    limitationText: "AI parsing of resume/CV content — non-standard layouts, multi-column designs, or heavily formatted PDFs may lose structure",
    workaround: "For best results, accept resumes in standard single-column formats or plain text alongside the PDF" },

  // ── base64-encode-url ──
  { capabilitySlug: "base64-encode-url", category: "coverage", severity: "info",
    title: "Fetches URL content before encoding — files larger than 10MB may timeout or exceed memory limits",
    limitationText: "Fetches URL content for encoding — very large files (>10MB) may timeout or exceed memory limits",
    workaround: "For large files, download locally and use a native base64 encoder instead of fetching through the API" },

  // ── html-to-pdf ──
  { capabilitySlug: "html-to-pdf", category: "coverage", severity: "info",
    title: "Headless browser rendering may not match desktop browsers for web fonts and JavaScript-dependent layouts",
    limitationText: "Renders via headless browser — web fonts, external CSS, and JavaScript-dependent layouts may not render identically to desktop browsers",
    workaround: "Inline critical CSS and fonts in the HTML input for consistent rendering across environments" },

  // ── image-resize ──
  { capabilitySlug: "image-resize", category: "coverage", severity: "info",
    title: "Supports JPEG, PNG, and WebP only — animated GIFs, SVGs, and RAW image formats are not supported",
    limitationText: "Supports common formats (JPEG, PNG, WebP) — animated GIFs, SVGs, and RAW image formats are not supported",
    workaround: "Convert unsupported formats to PNG before resizing, or use a dedicated image processing library for animated content" },

  // ── image-to-text ──
  { capabilitySlug: "image-to-text", category: "accuracy", severity: "info",
    title: "Handwritten text, low-resolution images, and complex layouts like multi-column pages have lower OCR accuracy",
    limitationText: "AI-powered OCR — handwritten text, low-resolution images, and complex layouts (multi-column, overlapping) have lower accuracy",
    workaround: "Pre-process images to improve contrast and resolution before submission for better OCR results" },

  // ── markdown-to-html ──
  { capabilitySlug: "markdown-to-html", category: "coverage", severity: "info",
    title: "Converts standard CommonMark syntax — GitHub-flavored extensions like task lists and tables may not render",
    limitationText: "Converts standard CommonMark syntax — GitHub-flavored extensions (task lists, tables) may not all be supported",
    workaround: "Check if your markdown uses GFM extensions and test the output for table and task list rendering" },

  // ── credit-report-summary ──
  { capabilitySlug: "credit-report-summary", category: "coverage", severity: "info",
    title: "Data from Allabolag.se covers Swedish companies only — credit ratings are indicative, not an official check",
    limitationText: "Data from Allabolag.se — covers Swedish companies only; credit ratings are indicative, not an official credit check",
    workaround: "For official credit decisions, use a licensed credit bureau (UC, Creditsafe, Bisnode) with the org number from the response" },

  // ── currency-convert ──
  { capabilitySlug: "currency-convert", category: "accuracy", severity: "info",
    title: "Uses mid-market exchange rates — actual bank and payment processor conversion rates include spread and fees",
    limitationText: "Uses mid-market exchange rates — actual conversion rates from banks and payment processors include spread and fees",
    workaround: "Apply your payment processor's typical markup (0.5-3%) to the converted amount for realistic cost estimates" },

  // ── stock-quote ──
  { capabilitySlug: "stock-quote", category: "freshness", severity: "info",
    title: "Yahoo Finance quotes are delayed approximately 15-20 minutes for most stock exchanges",
    limitationText: "Quotes from Yahoo Finance — delayed by approximately 15-20 minutes for most exchanges",
    workaround: "For real-time quotes, use the exchange's official data feed or a licensed market data provider" },
  { capabilitySlug: "stock-quote", category: "coverage", severity: "info",
    title: "Covers major exchange listings only — OTC, pink sheet, and some international exchange stocks may be missing",
    limitationText: "Covers stocks listed on major exchanges — OTC, pink sheets, and some international exchanges may have limited data",
    workaround: "Use the exchange suffix in the symbol (e.g., VOLV-B.ST for Stockholm) for non-US exchanges" },

  // ── mx-lookup ──
  { capabilitySlug: "mx-lookup", category: "coverage", severity: "info",
    title: "Returns MX records from DNS only — cannot verify whether the mail server is actually accepting connections",
    limitationText: "Returns MX records from DNS — cannot verify whether the mail server is actually accepting connections",
    workaround: "Combine with port-check on port 25 of the returned MX hosts to verify mail server reachability" },

  // ── port-check ──
  { capabilitySlug: "port-check", category: "coverage", severity: "info",
    title: "TCP connection test only — firewalls may block probes from Strale's IP range while allowing other traffic",
    limitationText: "TCP connection test only — firewalls may block probes from Strale's IP range while allowing traffic from other sources",
    workaround: "If a port shows as closed, verify from your own network before concluding the service is down" },

  // ── redirect-trace ──
  { capabilitySlug: "redirect-trace", category: "coverage", severity: "info",
    title: "Follows HTTP 301/302/307/308 redirects only — JavaScript-based redirects and meta refresh tags are not traced",
    limitationText: "Follows HTTP redirects (301, 302, 307, 308) — JavaScript-based redirects and meta refresh tags are not traced",
    workaround: "For JavaScript redirects, use screenshot-url or url-to-markdown to see the final rendered destination" },

  // ── robots-txt-parse ──
  { capabilitySlug: "robots-txt-parse", category: "coverage", severity: "info",
    title: "Parses standard robots.txt directives — non-standard extensions like Crawl-delay may be reported but not interpreted",
    limitationText: "Parses standard robots.txt directives — non-standard extensions (e.g., Crawl-delay, custom directives) may be reported but not interpreted",
    workaround: "Check the raw text in the response for non-standard directives that may affect your specific crawler" },

  // ── sitemap-parse ──
  { capabilitySlug: "sitemap-parse", category: "coverage", severity: "info",
    title: "Sitemap index files are not recursively fetched and dynamically generated sitemaps may be incomplete",
    limitationText: "Parses XML sitemaps — sitemap index files are not recursively fetched and dynamically generated sitemaps may be incomplete",
    workaround: "If the sitemap is an index, extract the child sitemap URLs and process each one separately" },

  // ── uptime-check ──
  { capabilitySlug: "uptime-check", category: "accuracy", severity: "info",
    title: "Single point-in-time check from one server location — does not represent historical or multi-region uptime",
    limitationText: "Single point-in-time check from one server location — does not represent historical uptime or multi-region availability",
    workaround: "Schedule periodic checks and compute uptime percentage over time rather than relying on a single probe" },

  // ── cve-lookup ──
  { capabilitySlug: "cve-lookup", category: "freshness", severity: "info",
    title: "OSV database may take hours to reflect newly published CVEs, and severity scores may change after initial publication",
    limitationText: "Uses OSV database — newly published CVEs may take hours to appear and severity scores may be updated after initial publication",
    workaround: "For zero-day awareness, supplement with the NVD RSS feed and vendor security advisories" },

  // ── header-security-check ──
  { capabilitySlug: "header-security-check", category: "coverage", severity: "info",
    title: "Checks HTTP security headers only, not server configuration, TLS settings, or application vulnerabilities",
    limitationText: "Checks HTTP security headers only — does not assess server configuration, TLS settings, or application-level vulnerabilities",
    workaround: "Combine with ssl-check for TLS assessment and use a full DAST scanner for application-level security testing" },

  // ── password-strength ──
  { capabilitySlug: "password-strength", category: "coverage", severity: "info",
    title: "Evaluates entropy and common patterns only — cannot check against breach databases or custom password policies",
    limitationText: "Evaluates entropy and common patterns — cannot check against breach databases or organization-specific password policies",
    workaround: "Supplement with a Have I Been Pwned API check to verify the password hasn't appeared in known breaches" },

  // ── secret-scan ──
  { capabilitySlug: "secret-scan", category: "coverage", severity: "info",
    title: "Pattern-based detection covers common secret formats only — custom API key formats and encrypted secrets are missed",
    limitationText: "Pattern-based detection of common secret formats — custom API key formats and encrypted secrets will not be detected",
    workaround: "Add custom regex patterns for your organization's API key formats and service-specific credential patterns" },

  // ── classify-text ──
  { capabilitySlug: "classify-text", category: "accuracy", severity: "info",
    title: "Ambiguous text may be assigned to the wrong category without sufficient category descriptions as context",
    limitationText: "AI-powered classification — ambiguous text may be assigned to multiple categories or the wrong category without sufficient context",
    workaround: "Provide the complete list of valid categories and a brief description of each in the input for more accurate classification" },

  // ── sentiment-analyze ──
  { capabilitySlug: "sentiment-analyze", category: "accuracy", severity: "info",
    title: "AI-based sentiment analysis may misinterpret sarcasm, irony, and culturally-specific expressions",
    limitationText: "AI-based sentiment — sarcasm, irony, and culturally-specific expressions may be misinterpreted",
    workaround: "Use the confidence score in the response and flag low-confidence results for human review in critical applications" },

  // ── summarize ──
  { capabilitySlug: "summarize", category: "accuracy", severity: "info",
    title: "AI-generated summaries may omit nuances or context-dependent details from long or technical documents",
    limitationText: "AI-generated summaries may omit nuances or context-dependent details from very long or technical documents",
    workaround: "For critical documents, compare the summary against the original to verify no essential details were lost" },

  // ── translate ──
  { capabilitySlug: "translate", category: "accuracy", severity: "info",
    title: "AI translation may render technical terminology, legal language, and domain-specific jargon imprecisely",
    limitationText: "AI translation — technical terminology, legal language, and domain-specific jargon may be translated imprecisely",
    workaround: "Provide a glossary of key terms in the input or use the domain parameter to improve translation of specialized vocabulary" },

  // ── hs-code-lookup ──
  { capabilitySlug: "hs-code-lookup", category: "accuracy", severity: "warning",
    title: "AI-based HS code suggestion only — official classification requires customs authority review and binding tariff info",
    limitationText: "AI-based HS code suggestion — official classification requires customs authority review and binding tariff information",
    workaround: "Use the suggested HS code as a starting point and verify with your customs broker or national tariff database" },

  // ── marketplace-fee-calculate ──
  { capabilitySlug: "marketplace-fee-calculate", category: "freshness", severity: "info",
    title: "Fee structures based on AI knowledge — marketplaces update fees periodically and actual fees vary by seller tier",
    limitationText: "Fee structures based on AI knowledge — marketplaces update fees periodically and actual fees depend on seller tier and category",
    workaround: "Verify calculated fees against the marketplace's current seller fee schedule before pricing decisions" },

  // ── payment-reference-generate ──
  { capabilitySlug: "payment-reference-generate", category: "coverage", severity: "info",
    title: "Generated OCR/reference formats may need additional validation for country-specific payment reference requirements",
    limitationText: "Generates standard OCR/reference formats — country-specific payment reference formats may have additional validation requirements",
    workaround: "Validate generated references against the receiving bank's format requirements before issuing payment instructions" },

  // ── startup-domain-check ──
  { capabilitySlug: "startup-domain-check", category: "coverage", severity: "info",
    title: "Checks .com availability and common social handles only — country TLDs and niche platforms are not checked",
    limitationText: "Checks .com availability and common social handles — country TLDs and niche platforms are not checked",
    workaround: "Supplement with whois-lookup for specific TLDs and social-profile-check for additional platform availability" },

  // ── timezone-meeting-find ──
  { capabilitySlug: "timezone-meeting-find", category: "accuracy", severity: "info",
    title: "Suggests meeting times based on timezone offsets only — individual calendar availability is not considered",
    limitationText: "Suggests meeting times based on timezone offsets — does not account for individual calendar availability or local business hour customs",
    workaround: "Use the suggested time window as a starting range and verify with participants' calendar availability" },

  // ── youtube-summarize ──
  { capabilitySlug: "youtube-summarize", category: "coverage", severity: "info",
    title: "Requires a video with available captions or transcripts — videos without captions cannot be summarized",
    limitationText: "Requires videos with available transcripts or captions — videos without captions cannot be summarized",
    workaround: "If no transcript is available, use a third-party transcription service first and pass the text to summarize" },

  // ── accessibility-audit ──
  { capabilitySlug: "accessibility-audit", category: "coverage", severity: "info",
    title: "Automated HTML checks cover common WCAG criteria only — cognitive accessibility and screen reader behavior require manual testing",
    limitationText: "Automated HTML analysis checks common WCAG criteria — cannot assess cognitive accessibility, screen reader behavior, or keyboard-only navigation",
    workaround: "Use as a first pass and follow up with manual testing using a screen reader (NVDA, VoiceOver) for full WCAG compliance" },

  // ── api-health-check ──
  { capabilitySlug: "api-health-check", category: "coverage", severity: "info",
    title: "Checks endpoint reachability and HTTP status only — business logic correctness and data integrity are not verified",
    limitationText: "Checks endpoint reachability and response status — cannot verify business logic correctness or data integrity",
    workaround: "Combine with expected response schema validation to verify the API is returning correct data, not just a 200 status" },

  // ── company-id-detect ──
  { capabilitySlug: "company-id-detect", category: "accuracy", severity: "info",
    title: "Ambiguous IDs matching multiple country formats may return multiple candidates requiring manual disambiguation",
    limitationText: "Pattern-based detection of company IDs — ambiguous formats (e.g., a number matching multiple country patterns) may return multiple candidates",
    workaround: "Provide the expected country or ID type to disambiguate when the input matches multiple format patterns" },

  // ── cron-explain ──
  { capabilitySlug: "cron-explain", category: "coverage", severity: "info",
    title: "Explains standard 5-field cron syntax only — non-standard extensions like seconds field may not be fully explained",
    limitationText: "Explains standard 5-field cron syntax — non-standard extensions (seconds, years, L/W/# operators) may not be fully explained",
    workaround: "Specify the cron implementation (Quartz, AWS EventBridge, systemd) for accurate explanation of non-standard fields" },

  // ── diff-json ──
  { capabilitySlug: "diff-json", category: "coverage", severity: "info",
    title: "Semantically equivalent values in different formats like '1.0' vs 1 are reported as differences in the diff",
    limitationText: "Computes structural diff — semantically equivalent values in different formats (e.g., '1.0' vs 1) are reported as differences",
    workaround: "Normalize number and boolean types before diffing if your data has mixed string/native representations" },

  // ── eori-validate ──
  { capabilitySlug: "eori-validate", category: "availability", severity: "info",
    title: "EU EORI validation service has periodic downtime and may respond slowly during peak hours",
    limitationText: "Validates against the EU EORI service — the service experiences periodic downtime and may be slow during peak hours",
    workaround: "Cache successful validations and implement retry logic; the EORI database is updated weekly so cached results remain valid short-term" },

  // ── invoice-validate ──
  { capabilitySlug: "invoice-validate", category: "coverage", severity: "info",
    title: "Validates invoice structure and arithmetic only — cannot verify items were delivered or prices match contracts",
    limitationText: "Validates invoice structure and arithmetic — cannot verify that billed items were actually delivered or that prices match contracts",
    workaround: "Use as a structural pre-check before manual review of business terms and delivery confirmation" },

  // ── isbn-validate ──
  { capabilitySlug: "isbn-validate", category: "coverage", severity: "info",
    title: "Validates ISBN-10 and ISBN-13 format and check digits only — does not verify the ISBN is assigned to a publication",
    limitationText: "Validates ISBN-10 and ISBN-13 format and check digits — does not verify the ISBN is assigned to an actual publication",
    workaround: "Use the validated ISBN with Open Library API or Google Books to verify the publication exists" },

  // ── json-schema-validate ──
  { capabilitySlug: "json-schema-validate", category: "coverage", severity: "info",
    title: "Validates against JSON Schema Draft-07 only — newer drafts like 2020-12 may have unsupported features",
    limitationText: "Validates against JSON Schema Draft-07 — newer drafts (2019-09, 2020-12) may have features not fully supported",
    workaround: "Specify your target draft version and test edge cases with draft-specific keywords like $dynamicRef" },

  // ── lei-lookup ──
  { capabilitySlug: "lei-lookup", category: "coverage", severity: "info",
    title: "Only approximately 2.5 million entities worldwide have LEIs via GLEIF, primarily financial institutions",
    limitationText: "Covers entities with LEI registration via GLEIF — only ~2.5 million entities worldwide have LEIs, primarily financial institutions",
    workaround: "If no LEI is found, search by company name and jurisdiction; consider that smaller entities may not have an LEI" },

  // ── linkedin-url-validate ──
  { capabilitySlug: "linkedin-url-validate", category: "coverage", severity: "info",
    title: "Validates LinkedIn URL format and structure only — cannot verify the profile exists or is active",
    limitationText: "Validates URL format and structure — cannot verify the profile exists or is active without LinkedIn API access",
    workaround: "Use the validated URL with social-profile-check for existence verification" },

  // ── og-image-check ──
  { capabilitySlug: "og-image-check", category: "coverage", severity: "info",
    title: "Checks Open Graph and Twitter Card meta tags — OG tags injected via JavaScript may not be captured",
    limitationText: "Checks Open Graph and Twitter Card meta tags — dynamically injected OG tags via JavaScript may not be captured",
    workaround: "For JavaScript-rendered OG tags, use meta-extract which renders the page via headless browser" },

  // ── regex-generate ──
  { capabilitySlug: "regex-generate", category: "accuracy", severity: "info",
    title: "AI-generated regex may need refinement for edge cases — always test against your full dataset before deploying",
    limitationText: "AI-generated regex — complex patterns with edge cases may need refinement and testing against your full dataset",
    workaround: "Test the generated regex against both matching and non-matching examples before deploying in production" },

  // ── sepa-xml-validate ──
  { capabilitySlug: "sepa-xml-validate", category: "coverage", severity: "info",
    title: "Validates standard SEPA XML schemas pain.001 and pain.002 only — bank-specific extensions are not checked",
    limitationText: "Validates against standard SEPA XML schemas (pain.001, pain.002) — bank-specific extensions or proprietary formats are not checked",
    workaround: "Submit a test file to your bank's validation endpoint to verify compatibility with their specific SEPA implementation" },

  // ── swift-validate ──
  { capabilitySlug: "swift-validate", category: "coverage", severity: "info",
    title: "Validates SWIFT/BIC code format only — does not verify the code is active or assigned to an operating institution",
    limitationText: "Validates SWIFT/BIC code format — does not verify the code is currently active or assigned to an operating institution",
    workaround: "Cross-reference validated codes against SWIFT's online directory at swift.com for active status confirmation" },

  // ── url-health-check ──
  { capabilitySlug: "url-health-check", category: "coverage", severity: "info",
    title: "Checks HTTP response status and basic connectivity only — content correctness and page rendering are not assessed",
    limitationText: "Checks HTTP response status and basic connectivity — does not assess content correctness or page rendering",
    workaround: "Combine with screenshot-url for visual verification or structured-scrape for content validation" },

  // ── vat-format-validate ──
  { capabilitySlug: "vat-format-validate", category: "coverage", severity: "info",
    title: "Validates VAT number format and check digits only — does not confirm the number is registered or active",
    limitationText: "Validates format and check digits algorithmically — does not confirm the VAT number is registered or active",
    workaround: "Use vat-validate for VIES database confirmation after format validation passes" },

  // ── google-search ──
  { capabilitySlug: "google-search", category: "coverage", severity: "info",
    title: "Results come from Google's index via Serper.dev — paywalled, login-required, and deep web content not accessible",
    limitationText: "Results from Serper.dev API — limited to Google's index; paywalled, login-required, or deep web content is not accessible",
    workaround: "For deep web or database content, use specialized search capabilities (ted-procurement, patent-search) instead" },

  // ── link-extract ──
  { capabilitySlug: "link-extract", category: "coverage", severity: "info",
    title: "Extracts links from static HTML only — JavaScript-rendered links in SPAs and lazy-loaded content may be missed",
    limitationText: "Extracts links from static HTML — JavaScript-rendered links (SPAs, lazy-loaded content) may not be captured",
    workaround: "For JavaScript-heavy pages, use web-extract or structured-scrape which render via headless browser before extraction" },

  // ── meta-extract ──
  { capabilitySlug: "meta-extract", category: "coverage", severity: "info",
    title: "Extracts meta tags from initial HTML only — meta tags injected dynamically via JavaScript are not captured",
    limitationText: "Extracts meta tags from the initial HTML response — dynamically injected meta tags via JavaScript are not captured",
    workaround: "For SPAs with dynamic meta tags, use url-to-markdown or web-extract which render JavaScript before extraction" },

  // ── screenshot-url ──
  { capabilitySlug: "screenshot-url", category: "performance", severity: "info",
    title: "Pages taking longer than 25 seconds to fully render will be captured in their current loading state",
    limitationText: "Pages that take longer than 25 seconds to fully render will be captured in their current loading state",
    workaround: "Use the wait_for parameter to target a specific CSS selector if the page loads progressively" },
  { capabilitySlug: "screenshot-url", category: "coverage", severity: "info",
    title: "Captures pages from a US-based server — geo-restricted or localized content may appear differently than expected",
    limitationText: "Captures the page as rendered from a US-based server — geo-restricted content or localized pages may show differently",
    workaround: "Include the target URL with explicit locale parameters (e.g., ?lang=en-GB) to control the rendered content" },

  // ── structured-scrape ──
  { capabilitySlug: "structured-scrape", category: "coverage", severity: "info",
    title: "Sites using CSS-in-JS with dynamically generated class names may require adjusted selectors between runs",
    limitationText: "Requires CSS selectors for extraction — sites with dynamically generated class names (CSS-in-JS) may need adjusted selectors",
    workaround: "Use data attributes or semantic HTML tags as selectors instead of class names for sites using CSS-in-JS" },

  // ── url-to-text ──
  { capabilitySlug: "url-to-text", category: "coverage", severity: "info",
    title: "Extracted text includes navigation, footers, and other boilerplate content alongside the main page content",
    limitationText: "Extracts text from the rendered page — navigation, footers, and boilerplate content are included alongside main content",
    workaround: "Use url-to-markdown for cleaner output that better separates main content from page chrome" },
];

async function seed() {
  const db = getDb();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < LIMITATIONS.length; i++) {
    const lim = LIMITATIONS[i];

    // Idempotent: check if this exact limitation text already exists for this slug
    const [existing] = await db
      .select({ id: capabilityLimitations.id, workaround: capabilityLimitations.workaround, title: capabilityLimitations.title })
      .from(capabilityLimitations)
      .where(
        and(
          eq(capabilityLimitations.capabilitySlug, lim.capabilitySlug),
          eq(capabilityLimitations.limitationText, lim.limitationText),
        ),
      )
      .limit(1);

    if (existing) {
      // Update workaround or title if either changed
      const newWorkaround = lim.workaround ?? null;
      if (existing.workaround !== newWorkaround || existing.title !== lim.title) {
        await db.update(capabilityLimitations)
          .set({ workaround: newWorkaround, title: lim.title, sortOrder: i })
          .where(eq(capabilityLimitations.id, existing.id));
        updated++;
      } else {
        skipped++;
      }
      continue;
    }

    await db.insert(capabilityLimitations).values({
      capabilitySlug: lim.capabilitySlug,
      title: lim.title,
      limitationText: lim.limitationText,
      category: lim.category,
      severity: lim.severity,
      affectedPercentage: lim.affectedPercentage?.toFixed(1) ?? null,
      workaround: lim.workaround ?? null,
      sortOrder: i,
    });
    inserted++;
  }

  // Summary
  console.log(`Seeded: ${inserted} inserted, ${updated} updated, ${skipped} unchanged.`);
  console.log(`Total limitations defined: ${LIMITATIONS.length}`);

  const slugs = new Set(LIMITATIONS.map((l) => l.capabilitySlug));
  console.log(`Capabilities covered: ${slugs.size}`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
