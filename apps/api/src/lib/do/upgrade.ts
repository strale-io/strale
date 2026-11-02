

// F-0-009 Stage 2: integrity hashing moved to jobs/integrity-hash-retry.ts.

// ── Contextual upgrade block for free-tier responses ──────────────────────────

const FALLBACK_EXAMPLES: Record<string, Array<{ slug: string; description: string; price: string }>> = {
  "url-to-markdown":  [{ slug: "web-extract", description: "Extract structured data from any web page", price: "€0.05" }, { slug: "meta-extract", description: "Extract Open Graph, title, and structured data", price: "€0.02" }, { slug: "screenshot-url", description: "Take a screenshot of any web page", price: "€0.10" }],
  "email-validate":   [{ slug: "domain-reputation", description: "Assess domain trust and reputation signals", price: "€0.05" }, { slug: "mx-lookup", description: "Mail server lookup for deliverability", price: "€0.02" }, { slug: "pep-check", description: "Screen against politically exposed persons lists", price: "€0.15" }],
  "iban-validate":    [{ slug: "vat-validate", description: "Validate EU VAT numbers via VIES", price: "€0.02" }, { slug: "swift-validate", description: "Validate SWIFT/BIC codes", price: "€0.02" }, { slug: "sanctions-check", description: "Screen against global sanctions lists", price: "€0.02" }],
  "dns-lookup":       [{ slug: "whois-lookup", description: "WHOIS registration data for any domain", price: "€0.05" }, { slug: "ssl-check", description: "SSL certificate validity and details", price: "€0.02" }, { slug: "domain-reputation", description: "Domain trust signals and reputation", price: "€0.05" }],
  "json-repair":      [{ slug: "json-schema-validate", description: "Validate JSON against a schema", price: "€0.02" }, { slug: "xml-to-json", description: "Convert XML to structured JSON", price: "€0.02" }, { slug: "csv-to-json", description: "Parse CSV to JSON array", price: "€0.02" }],
};

const DEFAULT_EXAMPLES = [
  { slug: "sanctions-check", description: "Screen against global sanctions lists", price: "€0.02" },
  { slug: "swedish-company-data", description: "Company data from Bolagsverket", price: "€0.05" },
  { slug: "package-security-audit", description: "CVE + license + scorecard audit for npm/PyPI", price: "€0.15" },
];

/**
 * Contextual nudges — analyze the input to suggest relevant paid capabilities.
 * A user extracting a bank's privacy policy is more likely to want compliance
 * tools than generic web scraping upgrades.
 */
export function buildUpgradeBlock(capabilitySlug: string, input?: Record<string, unknown>, output?: Record<string, unknown>) {
  const nudge = inferContextualNudge(capabilitySlug, input, output);
  return {
    message: nudge?.message ?? "You're using a free capability. Create an account to access paid tools; trial credits are available where eligible.",
    signup_url: "https://strale.dev/signup",
    self_signup: {
      url: "https://api.strale.io/v1/signup",
      method: "POST",
      body: { email: "your-agent@yourdomain.com" },
      description: "Create an account programmatically with trial credits where eligible.",
    },
    paid_examples: nudge?.examples ?? FALLBACK_EXAMPLES[capabilitySlug] ?? DEFAULT_EXAMPLES,
    x402_note: "Or pay per call with USDC on Base — no signup needed. Try: GET https://api.strale.io/x402/catalog",
  };
}

interface Nudge {
  message: string;
  examples: Array<{ slug: string; description: string; price: string }>;
}

function inferContextualNudge(
  slug: string,
  input?: Record<string, unknown>,
  output?: Record<string, unknown>,
): Nudge | null {
  const inputStr = JSON.stringify(input ?? {}).toLowerCase();
  const title = String((output as Record<string, unknown>)?.title ?? "").toLowerCase();
  const url = String(input?.url ?? input?.link ?? "").toLowerCase();
  const domain = String(input?.domain ?? "").toLowerCase();
  const email = String(input?.email ?? "").toLowerCase();
  const iban = String(input?.iban ?? "").toUpperCase();

  // ── url-to-markdown: detect intent from URL/title ─────────────────
  if (slug === "url-to-markdown" || slug === "dns-lookup") {
    const text = `${url} ${domain} ${title} ${inputStr}`;

    // Privacy/compliance/legal content
    if (/privacy.policy|gdpr|cookie.policy|terms.of.service|legal|compliance|data.protection/.test(text)) {
      return {
        message: "Analyzing legal/compliance content? Strale has purpose-built compliance capabilities.",
        examples: [
          { slug: "gdpr-website-check", description: "Automated GDPR compliance audit for any website", price: "€0.15" },
          { slug: "privacy-policy-analyze", description: "AI-powered privacy policy risk analysis", price: "€0.15" },
          { slug: "cookie-scan", description: "Scan a website for tracking cookies and consent issues", price: "€0.15" },
        ],
      };
    }

    // Banking/fintech domains
    if (/bank|fintech|payment|finance|lending|credit|mortgage|insurance/.test(text)) {
      return {
        message: "Researching a financial institution? Get structured compliance data instead of scraping.",
        examples: [
          { slug: "sanctions-check", description: "Screen against global sanctions lists", price: "€0.02" },
          { slug: "lei-lookup", description: "Legal Entity Identifier lookup via GLEIF", price: "€0.05" },
          { slug: "kyb-essentials-uk", description: "Full company verification (UK)", price: "€1.50" },
        ],
      };
    }

    // Company/business research
    if (/company|corporate|about.us|investor|annual.report|business|enterprise/.test(text)) {
      return {
        message: "Researching a company? Get structured company data from official registries.",
        examples: [
          { slug: "uk-company-data", description: "Companies House data for UK entities", price: "€0.05" },
          { slug: "company-enrich", description: "AI-powered company profile enrichment", price: "€0.15" },
          { slug: "beneficial-ownership-lookup", description: "UK beneficial ownership (PSC) lookup", price: "€0.25" },
        ],
      };
    }

    // Crypto/blockchain/web3
    if (/crypto|blockchain|web3|defi|token|nft|dao|wallet|ethereum|bitcoin|solana/.test(text)) {
      return {
        message: "Researching a crypto project? Get structured due diligence data.",
        examples: [
          { slug: "smart-contract-audit-check", description: "Check if a contract has been audited", price: "€0.05" },
          { slug: "token-info", description: "Token metadata and market data", price: "€0.05" },
          { slug: "ens-resolve", description: "Resolve ENS names to addresses", price: "€0.02" },
        ],
      };
    }

    // E-commerce/product research
    if (/product|shop|store|price|review|ecommerce|e-commerce|retail|trustpilot/.test(text)) {
      return {
        message: "Researching a product or store? Get structured e-commerce intelligence.",
        examples: [
          { slug: "trustpilot-score", description: "Trustpilot rating and review summary", price: "€0.15" },
          { slug: "domain-reputation", description: "Domain trust and reputation signals", price: "€0.05" },
          { slug: "whois-lookup", description: "Domain registration and ownership data", price: "€0.05" },
        ],
      };
    }

    // Tech/developer content
    if (/github|npm|pypi|package|library|framework|api|sdk|developer|documentation/.test(text)) {
      return {
        message: "Analyzing a software project? Get structured security and quality data.",
        examples: [
          { slug: "package-security-audit", description: "CVE + supply chain + license audit for npm/PyPI", price: "€0.15" },
          { slug: "license-compatibility-check", description: "Check license compatibility for your stack", price: "€0.05" },
          { slug: "github-repo-compare", description: "Compare GitHub repos by stars, activity, health", price: "€0.02" },
        ],
      };
    }
  }

  // ── email-validate: detect business vs personal ───────────────────
  if (slug === "email-validate" && email) {
    const domain = email.split("@")[1] ?? "";
    if (domain && !["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "protonmail.com"].includes(domain)) {
      return {
        message: `Validating a business email? Check the company behind ${domain} with structured registry data.`,
        examples: [
          { slug: "domain-reputation", description: `Check reputation signals for ${domain}`, price: "€0.05" },
          { slug: "whois-lookup", description: `Domain registration data for ${domain}`, price: "€0.05" },
          { slug: "sanctions-check", description: "Screen the company against sanctions lists", price: "€0.02" },
        ],
      };
    }
  }

  // ── iban-validate: detect country and suggest KYB ─────────────────
  if (slug === "iban-validate" && iban.length >= 2) {
    const country = iban.slice(0, 2);
    const countryNames: Record<string, string> = {
      SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland", GB: "UK",
      DE: "Germany", FR: "France", NL: "Netherlands", BE: "Belgium", AT: "Austria",
      IE: "Ireland", ES: "Spain", IT: "Italy", CH: "Switzerland", PL: "Poland",
      PT: "Portugal", US: "US", CA: "Canada", AU: "Australia", SG: "Singapore",
    };
    const name = countryNames[country];
    if (name) {
      const cc = country.toLowerCase();
      return {
        message: `Validating a ${name} IBAN? Run a full counterparty check on the account holder.`,
        examples: [
          { slug: `kyb-essentials-${cc}`, description: `Quick company verification (${name})`, price: "€1.50" },
          { slug: "sanctions-check", description: "Screen the account holder against sanctions lists", price: "€0.02" },
          { slug: "vat-validate", description: "Validate the company's VAT number", price: "€0.02" },
        ],
      };
    }
  }

  return null;
}

