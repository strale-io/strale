import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { capabilityLimitations } from "./schema.js";
import { eq, and } from "drizzle-orm";

interface LimitationDef {
  capabilitySlug: string;
  limitationText: string;
  category: string;
  severity: string;
  affectedPercentage?: number;
  workaround?: string;
}

const LIMITATIONS: LimitationDef[] = [
  // ── swedish-company-data ──
  { capabilitySlug: "swedish-company-data", category: "coverage", severity: "info",
    limitationText: "Does not cover sole proprietorships (enskild firma) — approximately 15% of Swedish businesses",
    affectedPercentage: 15,
    workaround: "Use the company name to search Skatteverket's public registry directly for enskild firma entities" },
  { capabilitySlug: "swedish-company-data", category: "freshness", severity: "info",
    limitationText: "Financial data from annual reports — can be up to 12 months old",
    workaround: "Check the report_date field in the response and fetch directly from Bolagsverket for time-sensitive decisions" },
  { capabilitySlug: "swedish-company-data", category: "availability", severity: "info",
    limitationText: "Bolagsverket maintenance windows may cause temporary unavailability (typically 2-4 hours quarterly)",
    workaround: "Implement a retry with exponential backoff; maintenance windows are announced at bolagsverket.se/driftinformation" },

  // ── norwegian-company-data ──
  { capabilitySlug: "norwegian-company-data", category: "coverage", severity: "info",
    limitationText: "Does not cover sole proprietorships (enkeltpersonforetak)",
    affectedPercentage: 15,
    workaround: "Query Brønnøysundregistrene (brreg.no) directly for enkeltpersonforetak using the person's national ID" },
  { capabilitySlug: "norwegian-company-data", category: "freshness", severity: "info",
    limitationText: "Financial data from annual reports — can be up to 12 months old",
    workaround: "Check the report_date field and query Brønnøysundregistrene's regnskapsregisteret for the latest filing" },

  // ── danish-company-data ──
  { capabilitySlug: "danish-company-data", category: "coverage", severity: "info",
    limitationText: "Does not cover sole proprietorships (enkeltmandsvirksomhed)",
    affectedPercentage: 15,
    workaround: "Search the CVR register (datacvr.virk.dk) directly using the person's CPR-linked CVR number" },
  { capabilitySlug: "danish-company-data", category: "freshness", severity: "info",
    limitationText: "Financial data from annual reports — can be up to 12 months old",
    workaround: "Check the report_date field and retrieve the latest filing from the Danish Business Authority (erhvervsstyrelsen.dk)" },

  // ── finnish-company-data ──
  { capabilitySlug: "finnish-company-data", category: "coverage", severity: "info",
    limitationText: "Does not cover sole traders (toiminimi) without separate business ID",
    affectedPercentage: 10,
    workaround: "Search the YTJ register (ytj.fi) by the trader's personal name to find toiminimi entries without a Y-tunnus" },
  { capabilitySlug: "finnish-company-data", category: "freshness", severity: "info",
    limitationText: "Financial data from annual reports — can be up to 12 months old",
    workaround: "Check the report_date field and query PRH's financial statement database for the most recent filing" },

  // ── us-company-data ──
  { capabilitySlug: "us-company-data", category: "coverage", severity: "warning",
    limitationText: "Coverage varies by state — Delaware, California, New York most complete. Some states have limited electronic registry access",
    workaround: "For states with limited coverage, supplement with the state's Secretary of State website directly" },
  { capabilitySlug: "us-company-data", category: "freshness", severity: "info",
    limitationText: "Secretary of State filings may lag 1-5 business days behind actual filing date",
    workaround: "For time-critical checks, compare the filing_date in the response against SEC EDGAR for publicly traded companies" },
  { capabilitySlug: "us-company-data", category: "coverage", severity: "info",
    limitationText: "Does not include privately held financial data — only publicly filed information",
    workaround: "Request financials directly from the company or use a commercial data provider like D&B for private company data" },

  // ── iban-validate ──
  { capabilitySlug: "iban-validate", category: "coverage", severity: "info",
    limitationText: "Validates structure and checksum only — does not confirm the account is open or active",
    workaround: "Use a SEPA test transaction (€0.01) or bank account verification API to confirm the account is live before large transfers" },
  { capabilitySlug: "iban-validate", category: "coverage", severity: "info",
    limitationText: "Covers all SEPA-zone IBANs. Non-SEPA country IBANs validated structurally but bank lookup may be incomplete",
    workaround: "For non-SEPA IBANs, cross-reference the bank code portion against SWIFT's IBAN Plus directory" },

  // ── bank-bic-lookup ──
  { capabilitySlug: "bank-bic-lookup", category: "coverage", severity: "info",
    limitationText: "Database covers major banks globally. Small regional banks or credit unions may not be found",
    workaround: "If no result is returned, look up the BIC via the national central bank's payment system participant list" },
  { capabilitySlug: "bank-bic-lookup", category: "freshness", severity: "info",
    limitationText: "BIC directory updated monthly — newly merged or renamed banks may show outdated information for up to 30 days",
    workaround: "Cross-check the returned BIC against SWIFT's online BIC search (swift.com) for recently merged institutions" },

  // ── vat-validate ──
  { capabilitySlug: "vat-validate", category: "availability", severity: "warning",
    limitationText: "VIES (EU VAT validation service) experiences periodic outages — Strale retries automatically but response times may increase",
    workaround: "Cache successful validation results with a TTL matching your business requirements (e.g., 24h for invoicing)" },
  { capabilitySlug: "vat-validate", category: "freshness", severity: "info",
    limitationText: "VAT registration status reflects latest VIES database — typically within 24 hours of national registry changes",
    workaround: "For same-day registration verification, contact the national tax authority directly or use their local e-service" },
  { capabilitySlug: "vat-validate", category: "coverage", severity: "info",
    limitationText: "Covers EU member states only. Norwegian and Swiss VAT numbers use separate validation and may have reduced detail",
    workaround: "For Norwegian MVA numbers, verify directly via Brønnøysundregistrene; for Swiss UID numbers, use uid.admin.ch" },

  // ── exchange-rate ──
  { capabilitySlug: "exchange-rate", category: "freshness", severity: "info",
    limitationText: "Rates updated every hour during market hours, may be stale during weekends and holidays",
    workaround: "For weekend transactions, use the Friday close rate and flag the amount for reconciliation on Monday" },
  { capabilitySlug: "exchange-rate", category: "accuracy", severity: "info",
    limitationText: "Mid-market rates — actual bank conversion rates will differ by 0.5-3% depending on provider",
    workaround: "Apply your bank's typical spread as a margin buffer (e.g., ±1.5%) when displaying converted amounts to users" },

  // ── email-validate ──
  { capabilitySlug: "email-validate", category: "accuracy", severity: "info",
    limitationText: "Catch-all domains (common in enterprises) will show as valid even for non-existent mailboxes",
    workaround: "Check the is_catchall field in the response and require email confirmation via a verification link for catch-all domains" },
  { capabilitySlug: "email-validate", category: "coverage", severity: "info",
    limitationText: "Disposable email detection covers major providers but new throwaway domains may not be flagged",
    workaround: "Supplement with a domain age check — disposable domains are typically registered within the last 30 days" },

  // ── dns-lookup ──
  { capabilitySlug: "dns-lookup", category: "freshness", severity: "info",
    limitationText: "Results reflect current DNS propagation — recent changes may take up to 48 hours to appear",
    workaround: "Query the authoritative nameserver directly (returned in the NS records) to see changes before full propagation" },

  // ── whois-lookup ──
  { capabilitySlug: "whois-lookup", category: "coverage", severity: "warning",
    limitationText: "GDPR-redacted registrations (common for EU domains) show limited registrant information",
    workaround: "Use the abuse contact email from the WHOIS response to request registrant details through the registrar's disclosure process" },
  { capabilitySlug: "whois-lookup", category: "availability", severity: "info",
    limitationText: "Some registrars rate-limit WHOIS queries — bulk lookups may see slower response times",
    workaround: "Batch lookups with 1-2 second delays between requests, or use the RDAP protocol endpoint when available" },

  // ── ssl-check ──
  { capabilitySlug: "ssl-check", category: "coverage", severity: "info",
    limitationText: "Checks the certificate presented on port 443 only — does not verify non-standard TLS configurations",
    workaround: "For services on non-standard ports, use ssl-certificate-chain with the specific hostname:port combination" },

  // ── ssl-certificate-chain ──
  { capabilitySlug: "ssl-certificate-chain", category: "coverage", severity: "info",
    limitationText: "Validates chain to known root CAs — private/internal CAs will show as untrusted",
    workaround: "If you use a private CA, compare the returned issuer fingerprint against your internal CA's known fingerprint" },

  // ── domain-reputation ──
  { capabilitySlug: "domain-reputation", category: "accuracy", severity: "info",
    limitationText: "Reputation scores aggregate multiple blocklists — a single listing may not indicate actual malicious activity",
    workaround: "Check which specific blocklist flagged the domain in the response details and verify the listing reason before blocking" },
  { capabilitySlug: "domain-reputation", category: "freshness", severity: "info",
    limitationText: "Blocklist data refreshed daily — recently resolved issues may still show negative reputation for 24-48 hours",
    workaround: "If a domain was recently cleaned, re-check after 48 hours and use the trend direction to assess improvement" },

  // ── sanctions-check ──
  { capabilitySlug: "sanctions-check", category: "freshness", severity: "info",
    limitationText: "Sanctions lists updated daily from OFAC, EU, and UN sources — newly sanctioned entities may take up to 24 hours to appear",
    workaround: "For same-day compliance, subscribe to OFAC's RSS feed and cross-reference against today's additions" },
  { capabilitySlug: "sanctions-check", category: "accuracy", severity: "warning",
    limitationText: "Name matching uses fuzzy logic — common names may produce false positives. Always verify flagged results",
    workaround: "Filter results by match confidence score and verify flagged entities against the primary sanctions list PDF" },

  // ── url-to-markdown ──
  { capabilitySlug: "url-to-markdown", category: "coverage", severity: "info",
    limitationText: "JavaScript-heavy single-page applications may not render completely",
    workaround: "Pass a wait_for_selector parameter if available, or use web-extract-clean which renders JS via headless browser" },
  { capabilitySlug: "url-to-markdown", category: "coverage", severity: "info",
    limitationText: "Login-protected or paywalled content cannot be extracted",
    workaround: "Provide the direct content URL if accessible via API, or pre-fetch the HTML and pass it as raw input instead" },

  // ── pii-redact ──
  { capabilitySlug: "pii-redact", category: "accuracy", severity: "warning",
    limitationText: "Context-dependent PII (e.g., names without surrounding context) may occasionally be missed",
    workaround: "Run a second pass with an explicit entity list of known names from your dataset to catch context-free occurrences" },
  { capabilitySlug: "pii-redact", category: "coverage", severity: "info",
    limitationText: "Optimized for English and Nordic languages — other languages may have lower detection accuracy",
    workaround: "For non-supported languages, pre-tag known PII patterns (e.g., national ID formats) with regex before calling pii-redact" },

  // ── email-deliverability-check ──
  { capabilitySlug: "email-deliverability-check", category: "accuracy", severity: "info",
    limitationText: "SMTP verification may be blocked by some mail servers — a 'deliverable' result is not guaranteed delivery",
    workaround: "Treat SMTP-verified results as 'likely deliverable' and implement bounce handling in your email pipeline for definitive status" },

  // ── page-speed-test ──
  { capabilitySlug: "page-speed-test", category: "accuracy", severity: "info",
    limitationText: "Results measured from a single geographic location — actual user experience varies by region",
    workaround: "Run tests at multiple times and average the scores, or use the lab data breakdown to identify bottlenecks independent of location" },
  { capabilitySlug: "page-speed-test", category: "freshness", severity: "info",
    limitationText: "Scores reflect a point-in-time test — site performance may vary throughout the day",
    workaround: "Schedule periodic tests (e.g., every 6 hours) and track the trend rather than relying on a single measurement" },

  // ── eu-ai-act-classify ──
  { capabilitySlug: "eu-ai-act-classify", category: "accuracy", severity: "warning",
    limitationText: "Classification is guidance only — official EU AI Act risk categorization requires legal analysis",
    workaround: "Use the classification output as a starting point for legal review — include the returned risk factors in your compliance documentation" },
  { capabilitySlug: "eu-ai-act-classify", category: "freshness", severity: "info",
    limitationText: "Based on AI Act text as of latest published version — implementing regulations may change interpretation",
    workaround: "Monitor the EU AI Office website for delegated acts and compare against the version_date field in the response" },

  // ── data-protection-authority-lookup ──
  { capabilitySlug: "data-protection-authority-lookup", category: "coverage", severity: "info",
    limitationText: "Covers all EU/EEA member state DPAs — does not include sub-national authorities (e.g., German Länder DPAs)",
    workaround: "For German entities, map the company's registered state to the corresponding Landesdatenschutzbeauftragter via datenschutz.de" },

  // ── gdpr-fine-lookup ──
  { capabilitySlug: "gdpr-fine-lookup", category: "freshness", severity: "info",
    limitationText: "Fine database updated weekly — recently announced fines may take up to 7 days to appear",
    workaround: "For breaking enforcement news, check enforcementtracker.com directly or subscribe to the relevant DPA's press feed" },
  { capabilitySlug: "gdpr-fine-lookup", category: "coverage", severity: "info",
    limitationText: "Covers publicly reported fines only — some national DPAs delay publication",
    workaround: "Supplement with the target company's own regulatory disclosure filings, which may reference unpublished penalties" },

  // ── gdpr-website-check ──
  { capabilitySlug: "gdpr-website-check", category: "accuracy", severity: "info",
    limitationText: "Automated scan checks for common compliance indicators — does not constitute a legal compliance audit",
    workaround: "Use the flagged items as a checklist for your DPO or legal team to prioritize their manual review" },
  { capabilitySlug: "gdpr-website-check", category: "coverage", severity: "info",
    limitationText: "Checks visible elements only — cannot assess internal data processing practices",
    workaround: "Combine with a manual review of the company's data processing agreements and internal privacy impact assessments" },

  // ── cookie-scan ──
  { capabilitySlug: "cookie-scan", category: "coverage", severity: "info",
    limitationText: "Scans cookies set on initial page load — cookies set after user interaction or on sub-pages may not be captured",
    workaround: "Run separate scans on high-traffic sub-pages (e.g., /checkout, /login) and merge the cookie inventories" },

  // ── privacy-policy-analyze ──
  { capabilitySlug: "privacy-policy-analyze", category: "accuracy", severity: "info",
    limitationText: "AI-powered analysis identifies common GDPR requirements — does not replace legal review",
    workaround: "Use the gap analysis output to brief your legal counsel on specific sections requiring human review" },
  { capabilitySlug: "privacy-policy-analyze", category: "coverage", severity: "info",
    limitationText: "Analyzes the linked privacy policy page only — separate cookie policies or terms may not be included",
    workaround: "Pass each policy URL (privacy, cookies, terms) as separate requests and combine the results" },

  // ── tech-stack-detect ──
  { capabilitySlug: "tech-stack-detect", category: "accuracy", severity: "info",
    limitationText: "Detection based on HTTP headers, JavaScript libraries, and HTML signatures — technologies loaded conditionally or server-side only may not be detected",
    workaround: "Complement with dns-lookup and ssl-check results to infer infrastructure choices not visible in the HTML" },
  { capabilitySlug: "tech-stack-detect", category: "coverage", severity: "info",
    limitationText: "Database covers 1,000+ technologies — niche or custom-built tools may not be identified",
    workaround: "Check the raw HTTP headers in the response for custom X-Powered-By or Server values that indicate unlisted technology" },

  // ── seo-audit ──
  { capabilitySlug: "seo-audit", category: "accuracy", severity: "info",
    limitationText: "Analyzes on-page SEO factors only — does not assess backlink profile, domain authority, or content quality",
    workaround: "Combine with domain-reputation for authority signals and google-search to check actual SERP positioning" },

  // ── landing-page-roast ──
  { capabilitySlug: "landing-page-roast", category: "accuracy", severity: "info",
    limitationText: "AI-generated critique based on conversion best practices — subjective elements like brand tone are not assessed",
    workaround: "Use the structural and CTA recommendations directly, but validate brand-voice feedback against your own style guide" },

  // ── social-profile-check ──
  { capabilitySlug: "social-profile-check", category: "coverage", severity: "info",
    limitationText: "Searches major platforms (LinkedIn, Twitter/X, Facebook, Instagram, GitHub) — niche or regional platforms not covered",
    workaround: "For regional coverage, supplement with a google-search query scoped to the target platform domain (e.g., site:xing.com)" },
  { capabilitySlug: "social-profile-check", category: "accuracy", severity: "info",
    limitationText: "Profile matching uses name and domain signals — may return incorrect matches for very common company names",
    workaround: "Cross-reference matched profile URLs against the company's official website for link verification before trusting the match" },
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
      .select({ id: capabilityLimitations.id, workaround: capabilityLimitations.workaround })
      .from(capabilityLimitations)
      .where(
        and(
          eq(capabilityLimitations.capabilitySlug, lim.capabilitySlug),
          eq(capabilityLimitations.limitationText, lim.limitationText),
        ),
      )
      .limit(1);

    if (existing) {
      // Update workaround if it changed
      const newWorkaround = lim.workaround ?? null;
      if (existing.workaround !== newWorkaround) {
        await db.update(capabilityLimitations)
          .set({ workaround: newWorkaround, sortOrder: i })
          .where(eq(capabilityLimitations.id, existing.id));
        updated++;
      } else {
        skipped++;
      }
      continue;
    }

    await db.insert(capabilityLimitations).values({
      capabilitySlug: lim.capabilitySlug,
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
