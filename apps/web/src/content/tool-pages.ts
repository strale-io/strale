/** Editorial landing-page content. Names, prices and availability still come from the catalogue. */
interface ToolPage {
  title: string;
  description: string;
  intro: string;
  example: { input: Record<string, unknown>; output: Record<string, unknown>; note: string; selected?: boolean };
  uses: string[];
  results: { label: string; explanation: string }[];
  /** Display corrections verified against the executor; do not change the API contract. */
  outputOverrides?: Record<string, { type?: string; appears?: string }>;
  guide: { href: string; label: string };
  nextTools?: { slug: string; label: string }[];
}

export const toolPages: Partial<Record<string, ToolPage>> = {
  "aml-risk-score": {
    title: "AML Risk Scoring API — score supplied screening results",
    description: "Turn sanctions, PEP and adverse-media screening results into an AML risk score as JSON. See the inputs, risk factors and API example for your app or agent.",
    intro: "Strale’s AML risk scoring API combines the screening results you supply with jurisdiction risk to return a score from 0 to 100, a risk level and the factors behind it. Run the screening checks first: this tool does not look up a person or company or search sanctions lists.",
    example: {
      input: { entity_name: "Example Supplier Ltd", entity_type: "company", country_code: "SE", sanctions_match: false, pep_match: false, adverse_media_match: true },
      output: { entity_name: "Example Supplier Ltd", entity_type: "company", country_code: "SE", risk_score: 20, risk_level: "medium", risk_factors: [{ factor: "adverse_media", points: 20, description: "Negative media coverage found (fraud, litigation, regulatory action)" }], jurisdiction_risk: "standard", inputs_received: { sanctions_match: false, pep_match: false, adverse_media_match: true } },
      selected: true,
      note: "Illustrative company and supplied screening flags. Selected output fields show how one adverse-media flag contributes to the score; this is not a screening result for a real company.",
    },
    uses: [
      "Add a scoring step after sanctions, PEP and adverse-media checks in a supplier-onboarding workflow.",
      "Send the score and its contributing factors to a reviewer, alongside the underlying screening evidence.",
      "Compare how different supplied flags affect a score. A missing flag defaults to false; it does not mean a screening check was completed.",
    ],
    results: [
      { label: "risk_score and risk_factors", explanation: "The score is computed from fixed rules, not a probability of money laundering. The factors list shows which inputs and jurisdiction rules contributed points." },
      { label: "risk_level and jurisdiction_risk", explanation: "Read both fields together with the recommendation. Jurisdiction rules can call for additional review even when the numeric score is low." },
      { label: "A low score", explanation: "A low score only describes the inputs supplied. It does not establish that an entity is safe, that screening is complete or that your legal obligations have been met. Review the source evidence before acting." },
    ],
    guide: { href: "/guides/aml-screening-agent-workflow", label: "Build a screening workflow for an AI agent" },
    nextTools: [{ slug: "sanctions-check", label: "Check for sanctions matches" }, { slug: "pep-check", label: "Check politically exposed person status" }, { slug: "adverse-media-check", label: "Find adverse-media signals" }],
  },
  "url-to-markdown": {
    title: "URL to Markdown API — convert web pages for AI agents",
    description: "Convert a public web page to Markdown with Strale’s API. Try it without a key, inspect the extracted text and use it in your app or AI agent.",
    intro: "Give Strale a public web page URL and get its readable content back as Markdown, with a title and word count. Use the text in an AI agent, summarisation step or document-processing workflow. Try the API here without a key.",
    example: {
      input: { url: "https://strale.io/guides/url-to-markdown-mcp", include_links: true, include_images: false },
      output: { url: "https://strale.io/guides/url-to-markdown-mcp", title: "How do I fetch and convert web pages to Markdown through MCP?", markdown: "-   MCP\n-   JSON\n\n## Steps\n\n1.  Add the Strale MCP server to your client's configuration. No key is needed for free tools.\n2.  Restart the client.\n3.  Ask the assistant to convert a URL to Markdown.\n4.  Use the Markdown it returns." },
      selected: true,
      note: "Recorded from a free call on 10 November 2026. The Markdown shown is the opening excerpt, not the full response. Run the tool below to inspect the current page’s complete result.",
    },
    uses: [
      "Read a public guide or article as Markdown before passing it to an agent for summarisation.",
      "Prepare public web content for a document-processing workflow, keeping links when you need to trace statements back to their source.",
      "Set include_links to false to remove link destinations, or include_images to false to omit images. Both options default to true.",
    ],
    results: [
      { label: "markdown, title and word_count", explanation: "Read the markdown field as the extracted content. The word count describes the returned text, not the whole source page; check the result before using it downstream." },
      { label: "Missing or incomplete content", explanation: "Dynamic pages and very long pages can produce incomplete results. Compare the returned text with the source page. Extraction does not verify that the page’s claims are true." },
      { label: "An access or input error", explanation: "Use a publicly accessible HTML page. Login pages, paywalls, blocked sites and unsupported platforms cannot be read. For a PDF, use PDF Extraction instead." },
    ],
    guide: { href: "/guides/url-to-markdown-mcp", label: "Read web pages through MCP" },
    nextTools: [{ slug: "web-extract", label: "Extract named fields from a web page" }, { slug: "pdf-extract", label: "Extract information from a PDF" }],
  },
  "sanctions-check": {
    title: "Sanctions Screening API — check person and company names",
    description: "Screen a person or company name with Strale’s sanctions API. Get potential matches and source lists as JSON, with guidance on reviewing the results.",
    intro: "Screen a person or company name against Dilisense’s consolidated sanctions index. Strale returns potential matches, source lists and available identifying details as JSON so your app or AI agent can pass them on for review.",
    example: {
      input: { name: "Example Supplier Ltd", entity_type: "company" },
      output: { query: "Example Supplier Ltd", schema: "Company", is_sanctioned: false, match_count: 0, total_results: 0, matches: [] },
      selected: true,
      note: "Illustrative no-match response for a fictional company, showing selected fields. This is not a live screening result. Every call example below uses the same name; replace it with the entity you want to check.",
    },
    uses: [
      "Screen a supplier or customer name during onboarding and send potential matches for review.",
      "For individuals, provide birth_date when known to help distinguish people with the same name.",
      "Review the underlying matches before passing a sanctions flag into AML Risk Score.",
    ],
    results: [
      { label: "is_sanctioned: true", explanation: "The provider returned at least one potential sanctions match. The field name does not establish that the person or company you searched for is the listed entity. Compare identifying details and the primary source before deciding." },
      { label: "No matches", explanation: "No potential matches were returned for this query. This is not a guarantee that the entity is absent from every list or that a new designation has reached the provider." },
      { label: "Source details and freshness", explanation: "Read lists_queried for the provider’s coverage and refresh statement. Per-list update timestamps are not available. match_count can exceed the matches array, which contains at most ten records; no match confidence score is returned." },
    ],
    guide: { href: "/guides/sanctions-check-langchain", label: "Add sanctions screening to a LangChain agent" },
    nextTools: [{ slug: "aml-risk-score", label: "Score reviewed screening results" }, { slug: "pep-check", label: "Check politically exposed person status" }],
  },
  "dns-lookup": {
    title: "DNS Lookup API — DNS records, SPF and DMARC",
    description: "Look up A, AAAA, MX, TXT, CNAME and NS records as JSON with Strale’s DNS lookup API. Check SPF and DMARC presence. Try it in your browser without a key.",
    intro: "Strale’s DNS lookup API returns a domain’s DNS records as JSON for your app or AI agent. Read its IP addresses, mail servers and nameservers, and check whether SPF and DMARC records are present.",
    example: {
      input: { domain: "strale.io" },
      output: {
        domain: "strale.io",
        a_records: ["172.67.181.122", "104.21.35.241"],
        mx_records: [{ priority: 0, exchange: "strale-io.mail.protection.outlook.com" }],
        has_spf: true,
        has_dmarc: true,
      },
      selected: true,
      note: "Selected output fields from a real lookup on 10 November 2026. DNS records can change; run the tool below for a fresh result. The full response also includes AAAA, TXT, CNAME and NS records and the DMARC record.",
    },
    uses: [
      "Check A and AAAA records when investigating where a domain points.",
      "Read MX records to see which servers handle a domain’s email.",
      "Check for SPF and DMARC before investigating email authentication. Their presence alone does not prove that the policies are correct or that mail will be delivered.",
    ],
    results: [
      { label: "Records returned", explanation: "Use the record arrays in your workflow. An empty array means no records of that type were returned; it is not a full diagnosis of the domain." },
      { label: "Lookup fails", explanation: "Check the domain spelling and try again. An error or missing record is not evidence that a company is untrustworthy." },
    ],
    guide: { href: "/guides/dns-lookup-agent-python", label: "Run DNS lookups from Python" },
  },
  "eori-validate": {
    title: "EORI Validation API — check EU EORI numbers",
    description: "Validate an EORI number against the EU register with Strale’s API. Get validity and available trader details as JSON for customs and supplier onboarding.",
    intro: "Check an Economic Operators Registration and Identification (EORI) number against the European Commission’s validation service. Strale returns the result as JSON, with trader details when the register provides them, so your app or AI agent can use it in a customs or supplier-onboarding workflow.",
    example: {
      input: { eori: "SE5560125790" },
      output: {
        valid: true,
        eori_number: "SE5560125790",
        country_code: "SE",
        trader_name: "Aktiebolaget Volvo",
        trader_address: "AB Volvo",
        street: null,
        city: "GÖTEBORG",
        postal_code: "40508",
        country: "Sweden",
      },
      note: "Recorded from the EU service on 10 November 2026. Registration details can change. A valid result can still have missing name or address fields.",
    },
    uses: [
      "Check a supplier’s EORI number during onboarding and send missing or invalid registrations for follow-up.",
      "Validate an EORI number before preparing customs paperwork. This checks the registration; it does not determine whether a shipment meets every customs requirement.",
    ],
    results: [
      { label: "valid: true", explanation: "The EU service returned a valid registration. Read the trader details where available; fields can be null." },
      { label: "valid: false", explanation: "The number failed the format check or the EU service did not confirm a valid registration. Check the number with the supplier and correct any typing errors before retrying." },
      { label: "valid: null", explanation: "The EU service was unavailable, so the registration has not been verified. Retry later. A format_valid value of true only confirms the syntax; do not treat it as a valid registration." },
    ],
    outputOverrides: {
      valid: { type: "boolean or null" },
      trader_name: { type: "string or null", appears: "May be null; omitted when the input format is invalid" },
    },
    guide: { href: "/guides/eori-number-validation-agent", label: "Add EORI validation to a Python agent" },
  },
};
