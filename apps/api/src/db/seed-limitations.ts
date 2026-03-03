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
    affectedPercentage: 15 },
  { capabilitySlug: "swedish-company-data", category: "freshness", severity: "info",
    limitationText: "Financial data from annual reports — can be up to 12 months old" },
  { capabilitySlug: "swedish-company-data", category: "availability", severity: "info",
    limitationText: "Bolagsverket maintenance windows may cause temporary unavailability (typically 2-4 hours quarterly)" },

  // ── norwegian-company-data ──
  { capabilitySlug: "norwegian-company-data", category: "coverage", severity: "info",
    limitationText: "Does not cover sole proprietorships (enkeltpersonforetak)",
    affectedPercentage: 15 },
  { capabilitySlug: "norwegian-company-data", category: "freshness", severity: "info",
    limitationText: "Financial data from annual reports — can be up to 12 months old" },

  // ── danish-company-data ──
  { capabilitySlug: "danish-company-data", category: "coverage", severity: "info",
    limitationText: "Does not cover sole proprietorships (enkeltmandsvirksomhed)",
    affectedPercentage: 15 },
  { capabilitySlug: "danish-company-data", category: "freshness", severity: "info",
    limitationText: "Financial data from annual reports — can be up to 12 months old" },

  // ── finnish-company-data ──
  { capabilitySlug: "finnish-company-data", category: "coverage", severity: "info",
    limitationText: "Does not cover sole traders (toiminimi) without separate business ID",
    affectedPercentage: 10 },
  { capabilitySlug: "finnish-company-data", category: "freshness", severity: "info",
    limitationText: "Financial data from annual reports — can be up to 12 months old" },

  // ── us-company-data ──
  { capabilitySlug: "us-company-data", category: "coverage", severity: "warning",
    limitationText: "Coverage varies by state — Delaware, California, New York most complete. Some states have limited electronic registry access" },
  { capabilitySlug: "us-company-data", category: "freshness", severity: "info",
    limitationText: "Secretary of State filings may lag 1-5 business days behind actual filing date" },
  { capabilitySlug: "us-company-data", category: "coverage", severity: "info",
    limitationText: "Does not include privately held financial data — only publicly filed information" },

  // ── iban-validate ──
  { capabilitySlug: "iban-validate", category: "coverage", severity: "info",
    limitationText: "Validates structure and checksum only — does not confirm the account is open or active" },
  { capabilitySlug: "iban-validate", category: "coverage", severity: "info",
    limitationText: "Covers all SEPA-zone IBANs. Non-SEPA country IBANs validated structurally but bank lookup may be incomplete" },

  // ── bank-bic-lookup ──
  { capabilitySlug: "bank-bic-lookup", category: "coverage", severity: "info",
    limitationText: "Database covers major banks globally. Small regional banks or credit unions may not be found" },
  { capabilitySlug: "bank-bic-lookup", category: "freshness", severity: "info",
    limitationText: "BIC directory updated monthly — newly merged or renamed banks may show outdated information for up to 30 days" },

  // ── vat-validate ──
  { capabilitySlug: "vat-validate", category: "availability", severity: "warning",
    limitationText: "VIES (EU VAT validation service) experiences periodic outages — Strale retries automatically but response times may increase" },
  { capabilitySlug: "vat-validate", category: "freshness", severity: "info",
    limitationText: "VAT registration status reflects latest VIES database — typically within 24 hours of national registry changes" },
  { capabilitySlug: "vat-validate", category: "coverage", severity: "info",
    limitationText: "Covers EU member states only. Norwegian and Swiss VAT numbers use separate validation and may have reduced detail" },

  // ── exchange-rate ──
  { capabilitySlug: "exchange-rate", category: "freshness", severity: "info",
    limitationText: "Rates updated every hour during market hours, may be stale during weekends and holidays" },
  { capabilitySlug: "exchange-rate", category: "accuracy", severity: "info",
    limitationText: "Mid-market rates — actual bank conversion rates will differ by 0.5-3% depending on provider" },

  // ── email-validate ──
  { capabilitySlug: "email-validate", category: "accuracy", severity: "info",
    limitationText: "Catch-all domains (common in enterprises) will show as valid even for non-existent mailboxes" },
  { capabilitySlug: "email-validate", category: "coverage", severity: "info",
    limitationText: "Disposable email detection covers major providers but new throwaway domains may not be flagged" },

  // ── dns-lookup ──
  { capabilitySlug: "dns-lookup", category: "freshness", severity: "info",
    limitationText: "Results reflect current DNS propagation — recent changes may take up to 48 hours to appear" },

  // ── whois-lookup ──
  { capabilitySlug: "whois-lookup", category: "coverage", severity: "warning",
    limitationText: "GDPR-redacted registrations (common for EU domains) show limited registrant information" },
  { capabilitySlug: "whois-lookup", category: "availability", severity: "info",
    limitationText: "Some registrars rate-limit WHOIS queries — bulk lookups may see slower response times" },

  // ── ssl-check ──
  { capabilitySlug: "ssl-check", category: "coverage", severity: "info",
    limitationText: "Checks the certificate presented on port 443 only — does not verify non-standard TLS configurations" },

  // ── ssl-certificate-chain ──
  { capabilitySlug: "ssl-certificate-chain", category: "coverage", severity: "info",
    limitationText: "Validates chain to known root CAs — private/internal CAs will show as untrusted" },

  // ── domain-reputation ──
  { capabilitySlug: "domain-reputation", category: "accuracy", severity: "info",
    limitationText: "Reputation scores aggregate multiple blocklists — a single listing may not indicate actual malicious activity" },
  { capabilitySlug: "domain-reputation", category: "freshness", severity: "info",
    limitationText: "Blocklist data refreshed daily — recently resolved issues may still show negative reputation for 24-48 hours" },

  // ── sanctions-check ──
  { capabilitySlug: "sanctions-check", category: "freshness", severity: "info",
    limitationText: "Sanctions lists updated daily from OFAC, EU, and UN sources — newly sanctioned entities may take up to 24 hours to appear" },
  { capabilitySlug: "sanctions-check", category: "accuracy", severity: "warning",
    limitationText: "Name matching uses fuzzy logic — common names may produce false positives. Always verify flagged results" },

  // ── url-to-markdown ──
  { capabilitySlug: "url-to-markdown", category: "coverage", severity: "info",
    limitationText: "JavaScript-heavy single-page applications may not render completely" },
  { capabilitySlug: "url-to-markdown", category: "coverage", severity: "info",
    limitationText: "Login-protected or paywalled content cannot be extracted" },

  // ── pii-redact ──
  { capabilitySlug: "pii-redact", category: "accuracy", severity: "warning",
    limitationText: "Context-dependent PII (e.g., names without surrounding context) may occasionally be missed" },
  { capabilitySlug: "pii-redact", category: "coverage", severity: "info",
    limitationText: "Optimized for English and Nordic languages — other languages may have lower detection accuracy" },

  // ── email-deliverability-check ──
  { capabilitySlug: "email-deliverability-check", category: "accuracy", severity: "info",
    limitationText: "SMTP verification may be blocked by some mail servers — a 'deliverable' result is not guaranteed delivery" },

  // ── page-speed-test ──
  { capabilitySlug: "page-speed-test", category: "accuracy", severity: "info",
    limitationText: "Results measured from a single geographic location — actual user experience varies by region" },
  { capabilitySlug: "page-speed-test", category: "freshness", severity: "info",
    limitationText: "Scores reflect a point-in-time test — site performance may vary throughout the day" },

  // ── eu-ai-act-classify ──
  { capabilitySlug: "eu-ai-act-classify", category: "accuracy", severity: "warning",
    limitationText: "Classification is guidance only — official EU AI Act risk categorization requires legal analysis" },
  { capabilitySlug: "eu-ai-act-classify", category: "freshness", severity: "info",
    limitationText: "Based on AI Act text as of latest published version — implementing regulations may change interpretation" },

  // ── data-protection-authority-lookup ──
  { capabilitySlug: "data-protection-authority-lookup", category: "coverage", severity: "info",
    limitationText: "Covers all EU/EEA member state DPAs — does not include sub-national authorities (e.g., German Länder DPAs)" },

  // ── gdpr-fine-lookup ──
  { capabilitySlug: "gdpr-fine-lookup", category: "freshness", severity: "info",
    limitationText: "Fine database updated weekly — recently announced fines may take up to 7 days to appear" },
  { capabilitySlug: "gdpr-fine-lookup", category: "coverage", severity: "info",
    limitationText: "Covers publicly reported fines only — some national DPAs delay publication" },

  // ── gdpr-website-check ──
  { capabilitySlug: "gdpr-website-check", category: "accuracy", severity: "info",
    limitationText: "Automated scan checks for common compliance indicators — does not constitute a legal compliance audit" },
  { capabilitySlug: "gdpr-website-check", category: "coverage", severity: "info",
    limitationText: "Checks visible elements only — cannot assess internal data processing practices" },

  // ── cookie-scan ──
  { capabilitySlug: "cookie-scan", category: "coverage", severity: "info",
    limitationText: "Scans cookies set on initial page load — cookies set after user interaction or on sub-pages may not be captured" },

  // ── privacy-policy-analyze ──
  { capabilitySlug: "privacy-policy-analyze", category: "accuracy", severity: "info",
    limitationText: "AI-powered analysis identifies common GDPR requirements — does not replace legal review" },
  { capabilitySlug: "privacy-policy-analyze", category: "coverage", severity: "info",
    limitationText: "Analyzes the linked privacy policy page only — separate cookie policies or terms may not be included" },

  // ── tech-stack-detect ──
  { capabilitySlug: "tech-stack-detect", category: "accuracy", severity: "info",
    limitationText: "Detection based on HTTP headers, JavaScript libraries, and HTML signatures — technologies loaded conditionally or server-side only may not be detected" },
  { capabilitySlug: "tech-stack-detect", category: "coverage", severity: "info",
    limitationText: "Database covers 1,000+ technologies — niche or custom-built tools may not be identified" },

  // ── seo-audit ──
  { capabilitySlug: "seo-audit", category: "accuracy", severity: "info",
    limitationText: "Analyzes on-page SEO factors only — does not assess backlink profile, domain authority, or content quality" },

  // ── landing-page-roast ──
  { capabilitySlug: "landing-page-roast", category: "accuracy", severity: "info",
    limitationText: "AI-generated critique based on conversion best practices — subjective elements like brand tone are not assessed" },

  // ── social-profile-check ──
  { capabilitySlug: "social-profile-check", category: "coverage", severity: "info",
    limitationText: "Searches major platforms (LinkedIn, Twitter/X, Facebook, Instagram, GitHub) — niche or regional platforms not covered" },
  { capabilitySlug: "social-profile-check", category: "accuracy", severity: "info",
    limitationText: "Profile matching uses name and domain signals — may return incorrect matches for very common company names" },
];

async function seed() {
  const db = getDb();
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < LIMITATIONS.length; i++) {
    const lim = LIMITATIONS[i];

    // Idempotent: check if this exact limitation text already exists for this slug
    const [existing] = await db
      .select({ id: capabilityLimitations.id })
      .from(capabilityLimitations)
      .where(
        and(
          eq(capabilityLimitations.capabilitySlug, lim.capabilitySlug),
          eq(capabilityLimitations.limitationText, lim.limitationText),
        ),
      )
      .limit(1);

    if (existing) {
      skipped++;
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
  console.log(`Seeded: ${inserted} inserted, ${skipped} already existed.`);
  console.log(`Total limitations defined: ${LIMITATIONS.length}`);

  const slugs = new Set(LIMITATIONS.map((l) => l.capabilitySlug));
  console.log(`Capabilities covered: ${slugs.size}`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
