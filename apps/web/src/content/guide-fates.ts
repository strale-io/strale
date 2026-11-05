// What happened to each guide on today's site (strale-frontend, 2026-11-05: 49 under /learn and 6
// under /guides), and where an old address should point. The set follows SITE-STRUCTURE.md §11:
// seven guides pruned, the country-lookup guides folded into country pages, the rest carried over.
//
// This is the input for the redirect list. test/guides.test.ts keeps it honest: every old address
// is accounted for, every target exists, and a carried guide is a guide file.

/** The 49 guides under /learn on today's site. */
export const OLD_LEARN = [
  "iban-validation-langchain-python", "iban-validation-pydantic-ai", "iban-validation-crewai", "vat-validation-python-agent",
  "vat-validation-openai-agents", "swift-bic-validation-agent", "iban-validation-mcp", "multi-currency-iban-validation",
  "financial-data-validation-pipeline", "eori-number-validation-agent", "swedish-company-lookup-agent", "uk-company-verification-agent",
  "german-company-data-agent", "kyb-workflow-crewai", "company-verification-multiple-countries", "beneficial-ownership-lookup-agent",
  "lei-code-lookup-agent", "vat-registration-check-agent", "company-data-openai-agents", "kyb-mcp-claude",
  "sanctions-check-langchain", "sanctions-check-pydantic-ai", "pep-check-ai-agent", "adverse-media-check-agent",
  "full-kyc-pipeline-python", "gdpr-compliance-check-agent", "eu-ai-act-classification-agent", "aml-screening-agent-workflow",
  "compliance-agent-strale-fallback", "kyc-mcp-cursor", "url-to-markdown-langchain", "dns-lookup-agent-python",
  "ssl-certificate-check-agent", "tech-stack-detection-agent", "domain-reputation-check-agent", "json-repair-ai-agent",
  "email-validation-langchain", "web-scraping-agent-anti-bot", "seo-audit-agent-python", "url-to-markdown-mcp",
  "strale-fallback-middleware-agent", "agent-resilience-patterns", "multi-step-due-diligence-agent", "strale-do-natural-language",
  "mcp-server-claude-code-setup", "mcp-server-cursor-setup", "strale-openai-agents-sdk", "audit-trail-compliance-agent",
  "google-adk-strale-agent",
] as const;

/** The six guides under /guides on today's site. */
export const OLD_GUIDES = [
  "swedish-company-lookup-api", "norwegian-company-lookup-api", "vat-number-validation-api",
  "free-apis-for-ai-agents", "x402-pay-per-call-api", "sanctions-pep-adverse-media-comparison",
] as const;

/** The seven pruned guides (SITE-STRUCTURE.md §11), by old address. */
export const PRUNED: Record<string, { to: string; why: string }> = {
  "/learn/iban-validation-pydantic-ai": { to: "/guides/financial-data-validation-pipeline", why: "Duplicate of the other IBAN guides, written for the Pydantic AI package yanked from PyPI on 2026-04-22; the Pydantic AI pipeline guide covers IBAN checks in that framework." },
  "/learn/sanctions-check-pydantic-ai": { to: "/guides/sanctions-check-langchain", why: "Duplicate of the sanctions guide, for the yanked Pydantic AI package." },
  "/learn/vat-validation-openai-agents": { to: "/guides/vat-validation-python-agent", why: "Duplicate VAT guide, for the yanked OpenAI Agents package." },
  "/learn/company-data-openai-agents": { to: "/guides/company-verification-multiple-countries", why: "Same code as the multi-country guide, for the yanked OpenAI Agents package, and it relied on free-text routing to pick a country's register." },
  "/learn/strale-openai-agents-sdk": { to: "/docs/sdks", why: "Overview of the yanked OpenAI Agents package; the supported packages and clients are on the SDKs page." },
  "/learn/google-adk-strale-agent": { to: "/docs/mcp", why: "The only Google ADK guide, tied to the yanked google-adk-strale package; the route for a framework without a Strale package is MCP." },
  "/learn/web-scraping-agent-anti-bot": { to: "/tools/web-extract", why: "Promised handling of anti-bot protection, which the data-access rule (DEC-20261023-A) rules out: fetches stop at blocks and honour robots.txt. The tool page states what Web Extract does." },
};

/**
 * Country-lookup guides (SITE-STRUCTURE.md §11: "fold into the country pages"). Each country page
 * links to its guides (`countries:` in the guide's front matter), and the guide itself stays a
 * built page at /guides/<slug>. The old /learn address points at the guide, never at the country
 * page: no redirect may point away from a built guide. The two old /guides/ addresses are live
 * pages and get no rule.
 */
export const FOLDED: Record<string, { guide: string; country: string }> = {
  "/learn/swedish-company-lookup-agent": { guide: "swedish-company-lookup-agent", country: "/company-data/sweden" },
  "/learn/uk-company-verification-agent": { guide: "uk-company-verification-agent", country: "/company-data/united-kingdom" },
  "/learn/german-company-data-agent": { guide: "german-company-data-agent", country: "/company-data/germany" },
  "/guides/swedish-company-lookup-api": { guide: "swedish-company-lookup-api", country: "/company-data/sweden" },
  "/guides/norwegian-company-lookup-api": { guide: "norwegian-company-lookup-api", country: "/company-data/norway" },
};

export interface Redirect {
  from: string;
  to: string;
  status: 301;
}

/** Redirects the guides section needs, as SITE-STRUCTURE.md §11 sets them. */
export function guideRedirects(): Redirect[] {
  const out: Redirect[] = [{ from: "/learn", to: "/guides", status: 301 }];
  for (const slug of OLD_LEARN) {
    const from = `/learn/${slug}`;
    out.push({ from, to: PRUNED[from]?.to ?? `/guides/${FOLDED[from]?.guide ?? slug}`, status: 301 });
  }
  for (const [from, p] of Object.entries(PRUNED)) if (from.startsWith("/guides/")) out.push({ from, to: p.to, status: 301 });
  return out;
}
