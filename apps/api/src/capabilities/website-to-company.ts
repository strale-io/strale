import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput, getExecutor } from "./index.js";

/*
 * website-to-company: URL → company behind the domain (DEC-20260411-C)
 *
 * Chain: extract domain → detect country from TLD → extract company name
 * from website meta/title → route to country-specific registry lookup.
 *
 * Whois-based registrant extraction was abandoned because post-GDPR whois
 * returns no registrant data for any major TLD. The company name is
 * extracted from the website itself instead.
 */

const TLD_TO_COUNTRY: Record<string, string> = {
  se: "SE", no: "NO", dk: "DK", fi: "FI", de: "DE", nl: "NL",
  be: "BE", at: "AT", ie: "IE", fr: "FR", es: "ES", it: "IT",
  pt: "PT", pl: "PL", ch: "CH", ee: "EE", lv: "LV", lt: "LT",
  "co.uk": "GB", uk: "GB", au: "AU", br: "BR", jp: "JP",
  ca: "CA", us: "US",
};

const COUNTRY_TO_CAPABILITY: Record<string, { slug: string; inputField: string }> = {
  SE: { slug: "swedish-company-data", inputField: "org_number" },
  NO: { slug: "norwegian-company-data", inputField: "org_number" },
  DK: { slug: "danish-company-data", inputField: "cvr_number" },
  FI: { slug: "finnish-company-data", inputField: "business_id" },
  DE: { slug: "german-company-data", inputField: "company_name" },
  NL: { slug: "dutch-company-data", inputField: "kvk_number" },
  BE: { slug: "belgian-company-data", inputField: "enterprise_number" },
  AT: { slug: "austrian-company-data", inputField: "fn_number" },
  IE: { slug: "irish-company-data", inputField: "cro_number" },
  FR: { slug: "french-company-data", inputField: "siren" },
  ES: { slug: "spanish-company-data", inputField: "cif" },
  IT: { slug: "italian-company-data", inputField: "partita_iva" },
  PT: { slug: "portuguese-company-data", inputField: "nipc" },
  PL: { slug: "polish-company-data", inputField: "krs_number" },
  CH: { slug: "swiss-company-data", inputField: "uid" },
  EE: { slug: "estonian-company-data", inputField: "registry_code" },
  LV: { slug: "latvian-company-data", inputField: "reg_number" },
  LT: { slug: "lithuanian-company-data", inputField: "company_code" },
  GB: { slug: "uk-company-data", inputField: "company_number" },
  AU: { slug: "australian-company-data", inputField: "abn" },
  BR: { slug: "brazilian-company-data", inputField: "cnpj" },
  JP: { slug: "japanese-company-data", inputField: "corporate_number" },
  US: { slug: "us-company-data", inputField: "company" },
  CA: { slug: "canadian-company-data", inputField: "corporation_number" },
};

function extractDomain(url: string): string {
  let domain = url.trim();
  domain = domain.replace(/^https?:\/\//i, "");
  domain = domain.replace(/\/.*$/, "");
  domain = domain.replace(/^www\./, "");
  return domain.toLowerCase();
}

function detectCountryFromTLD(domain: string): string | null {
  // Check multi-part TLDs first (co.uk)
  for (const [tld, country] of Object.entries(TLD_TO_COUNTRY)) {
    if (tld.includes(".") && domain.endsWith(`.${tld}`)) return country;
  }
  const parts = domain.split(".");
  const tld = parts[parts.length - 1];
  return TLD_TO_COUNTRY[tld] ?? null;
}

async function extractCompanyName(url: string): Promise<string | null> {
  // Use meta-extract to get page title/site name
  const metaExtract = getExecutor("meta-extract");
  if (metaExtract) {
    try {
      const result = await metaExtract({ url });
      const output = result.output as Record<string, unknown>;
      const siteName = (output.site_name as string) ?? "";
      const title = (output.title as string) ?? "";
      // Use LLM to extract company name from title
      if (title || siteName) {
        return await llmExtractCompanyName(siteName || title, url);
      }
    } catch { /* meta-extract failed, try url-to-markdown */ }
  }

  // Fallback: url-to-markdown and extract from content
  const urlToMd = getExecutor("url-to-markdown");
  if (urlToMd) {
    try {
      const result = await urlToMd({ url });
      const output = result.output as Record<string, unknown>;
      const title = (output.title as string) ?? "";
      if (title) {
        return await llmExtractCompanyName(title, url);
      }
    } catch { /* url-to-markdown also failed */ }
  }

  return null;
}

async function llmExtractCompanyName(text: string, url: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return text.split(/[|–—:]/)[0].trim();

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [{
      role: "user",
      content: `Extract the legal company or organization name from this website title/metadata. Return ONLY the company name, nothing else. If you can't identify a company name, return the most likely organization name.\n\nURL: ${url}\nText: "${text}"`,
    }],
  });
  const name = r.content[0].type === "text" ? r.content[0].text.trim().replace(/^["']|["']$/g, "") : "";
  return name || text.split(/[|–—:]/)[0].trim();
}

registerCapability("website-to-company", async (input: CapabilityInput) => {
  const rawUrl = (input.url as string) ?? (input.domain as string) ?? "";
  if (!rawUrl.trim()) {
    throw new Error("'url' is required. Provide a website URL or domain name.");
  }

  const domain = extractDomain(rawUrl);
  const fullUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  const country = detectCountryFromTLD(domain);

  // Step 1: Extract company name from the website
  const companyName = await extractCompanyName(fullUrl);

  // Step 2: Try whois for supplementary data
  let whoisData: Record<string, unknown> | null = null;
  const whoisLookup = getExecutor("whois-lookup");
  if (whoisLookup) {
    try {
      const result = await whoisLookup({ domain });
      whoisData = result.output as Record<string, unknown>;
    } catch { /* whois failed, non-fatal */ }
  }

  // Step 3: Route to registry if country is supported
  let companyData: Record<string, unknown> | null = null;
  let resolutionMethod = "whois_only";
  let registryUsed: string | null = null;
  let confidence = "low";

  if (companyName && country && COUNTRY_TO_CAPABILITY[country]) {
    const { slug, inputField } = COUNTRY_TO_CAPABILITY[country];
    const executor = getExecutor(slug);
    if (executor) {
      try {
        const result = await executor({ [inputField]: companyName });
        companyData = result.output as Record<string, unknown>;
        resolutionMethod = "name_search";
        registryUsed = slug;
        confidence = "medium";
      } catch {
        // Registry lookup failed, fall through to whois_only
      }
    }
  }

  return {
    output: {
      domain,
      company_name_extracted: companyName,
      country_detected: country,
      company: companyData,
      resolution_method: resolutionMethod,
      registry_used: registryUsed,
      confidence,
      whois: whoisData ? {
        registrar: whoisData.registrar,
        created: whoisData.created,
        expires: whoisData.expires,
      } : null,
    },
    provenance: {
      source: registryUsed
        ? `Website meta + ${registryUsed}`
        : "Website meta + WHOIS",
      fetched_at: new Date().toISOString(),
    },
  };
});
