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
  inputDescriptions?: Record<string, string>;
  guide: { href: string; label: string };
  nextTools?: { slug: string; label: string }[];
}

export const toolPages: Partial<Record<string, ToolPage>> = {
  "singapore-company-data": {
    title: "Singapore Company Lookup API — search ACRA data by UEN",
    description: "Look up Singapore company data by UEN or name. Get ACRA open-data records as JSON, understand monthly updates and copy a working API request.",
    intro: "Look up a Singapore entity by UEN or name and get its name, status, entity type and available address details as JSON. Strale’s Singapore company lookup API reads ACRA open data from data.gov.sg. Use the returned UEN to match a supplier or customer to the right register record.",
    example: {
      input: { uen: "197200078R" },
      output: { entity_name: "SINGAPORE AIRLINES LIMITED", uen: "197200078R", entity_type: "Local Company", status: "Registered", registered_address: "AIRLINE ROAD, Singapore 819829", jurisdiction: "SG" },
      selected: true,
      note: "Selected fields from the catalogue example, not a live lookup. The address contains a street and postal code, not a building or unit number. The source is a monthly snapshot, so recent changes may not appear yet.",
    },
    uses: [
      "Match a UEN from a supplier form or invoice to the entity name in ACRA open data.",
      "Retrieve an entity’s status and available address details for an onboarding record.",
      "Try a short name search such as DBS BANK when you do not know the UEN. Check the returned identity: the tool selects one match, and identifier-like text can be routed to UEN lookup instead.",
    ],
    results: [
      { label: "uen and entity_name", explanation: "Prefer an exact UEN lookup when you have the identifier. The tool checks both input fields for UEN-like text first: a name that becomes 9–10 letters or digits after removing spaces, dots and hyphens, or contains a run of 9 or more letters or digits, can be treated as an identifier. Other name searches select one record, preferring names containing the search text and then Registered status. Check the returned identity." },
      { label: "status and is_active", explanation: "is_active is true when the source status is Registered. It describes that monthly record, not a current trading, solvency or compliance assessment. A failed request or missing match does not establish that an entity is deregistered." },
      { label: "Address and dates", explanation: "registered_address combines the available street and postal code. It is not a full mailing address. uen_issue_date is the source’s UEN issue date. Source fields can be missing; this lookup does not include directors, beneficial owners, financial statements or GST registration." },
    ],
    inputDescriptions: { uen: "Singapore Unique Entity Number, such as 197200078R. Provide uen or company_name; uen takes priority.", company_name: "Name text, such as DBS BANK. UEN-like text can trigger identifier lookup instead; see the name-search limitations above. Check the selected record’s UEN." },
    outputOverrides: {
      company_name: { appears: "Not returned by this tool; use entity_name" }, vat_number: { appears: "Not returned; this lookup does not check GST registration" },
      entity_name: { type: "string or null", appears: "May be null when the source value is missing" }, entity_type: { type: "string or null", appears: "May be null when the source value is missing" },
      status: { type: "string or null", appears: "May be null when the source value is missing" }, issuance_agency: { type: "string or null", appears: "May be null when the source value is missing" },
      uen_issue_date: { type: "string or null", appears: "UEN issue date; may be null" }, registered_street: { type: "string or null" }, registered_postal_code: { type: "string or null" }, registered_address: { type: "string or null" },
    },
    guide: { href: "/guides/singapore-company-lookup-api", label: "Look up Singapore entities by UEN" },
    nextTools: [{ slug: "sanctions-check", label: "Screen the matched entity name for potential sanctions matches" }],
  },
  "page-speed-test": {
    title: "Page Speed Test API — Lighthouse performance as JSON",
    description: "Run a mobile or desktop page speed test through Strale’s API. Get Lighthouse performance metrics, understand the units and find suggested improvements.",
    intro: "Send a public page URL to Strale’s page speed test API and get a Lighthouse performance score, lab metrics and suggested improvements as JSON. Choose mobile or desktop to check a page before and after a change, or add a performance check to your app or agent.",
    example: {
      input: { url: "https://web.dev/", strategy: "mobile" },
      output: { url: "https://web.dev/", strategy: "mobile", performance_score: 82, grade: "B", metrics: { lcp_ms: 2400, fcp_ms: 1400, cls_score: 0.04, tbt_ms: 180, ttfb_ms: 200, speed_index: 2100 } },
      selected: true,
      note: "Illustrative metrics for a mobile test, not a measured score for web.dev. Selected fields are shown. Run the call for a current result; scores vary between runs.",
    },
    uses: [
      "Compare a public page before and after a release, keeping the same URL and mobile or desktop strategy.",
      "Read performance metrics in a website review workflow without processing the full PageSpeed Insights report.",
      "Use the returned opportunities and diagnostics to choose what to investigate next. Your application decides when to run another test.",
    ],
    results: [
      { label: "performance_score and grade", explanation: "The score runs from 0 to 100. Strale maps it to A at 90 or above, B at 70–89, C at 50–69, D at 30–49 and F below 30. Compare repeated tests using the same strategy; one score does not describe every visitor’s experience." },
      { label: "Timing and layout metrics", explanation: "lcp_ms, fcp_ms, tbt_ms and ttfb_ms are milliseconds; speed_index is also in milliseconds. For example, lcp_ms: 2400 means 2.4 seconds. cls_score has no time unit. Individual metrics may be null when Lighthouse does not supply them." },
      { label: "Lab results, not a real-user assessment", explanation: "This tool returns Lighthouse lab data. It does not return CrUX field data, INP or a Core Web Vitals pass/fail assessment. TBT measures blocking time in the lab; it is not a real-user INP measurement." },
      { label: "Suggested improvements", explanation: "opportunities contains estimated savings and diagnostics contains supporting findings. Treat savings as estimates, not promises, and do not add them together: fixes can overlap. A page that Lighthouse cannot load returns an error rather than a score." },
    ],
    inputDescriptions: { url: "Public page URL that Lighthouse can load without signing in.", strategy: "mobile or desktop; defaults to mobile. Keep this the same when comparing runs." },
    outputOverrides: { metrics: { appears: "Object is present; individual measurements may be null" } },
    guide: { href: "/guides/page-speed-test-api", label: "Run and interpret a page speed test" },
    nextTools: [{ slug: "header-security-check", label: "Check the page’s HTTP security headers separately" }],
  },
  "http-to-curl": {
    title: "HTTP to cURL Converter API — generate a request command",
    description: "Convert HTTP request details into a cURL command with Strale. See a complete GET example and understand the difference between generating and sending a request.",
    intro: "Give Strale a request URL, method and headers to generate a cURL command. The HTTP-to-cURL tool returns code as text; it does not send the request to the target URL. Use it to turn structured request details into a command you can inspect and run yourself.",
    example: {
      input: { url: "https://api.strale.io/v1/capabilities", method: "GET", headers: { Accept: "application/json" } },
      output: { method: "GET", url: "https://api.strale.io/v1/capabilities", curl_command: "curl \\\n  'https://api.strale.io/v1/capabilities' \\\n  -H 'Accept: application/json'" },
      selected: true,
      note: "A GET request for Strale’s public tool catalogue, with no request body or credentials. Selected output fields are shown. Generating this command does not fetch the catalogue.",
    },
    uses: [
      "Turn a structured GET request into a cURL command for documentation or debugging.",
      "Give an agent a command it can present for review before anyone sends the request.",
      "Keep the request URL, method and headers together when handing an example to another developer.",
    ],
    results: [
      { label: "curl_command", explanation: "This is executable text, not an HTTP response. Review the destination and request details before running it. Running the command is a separate action from calling this converter." },
      { label: "method and url", explanation: "The example uses GET with an Accept header and no body. The outer POST to Strale’s /v1/do endpoint invokes the converter; it does not change the method of the generated request." },
      { label: "Credentials and generated code", explanation: "Use placeholders when sharing request examples. If you supply credentials, they can appear in the generated code. Review snippets before running them, especially after changing the method, body or authentication." },
    ],
    inputDescriptions: { url: "Target URL to include in the generated command; the converter does not fetch it.", method: "HTTP method for the generated request; defaults to GET.", headers: "Request header names and values. This example requests a JSON response with Accept.", body: "Optional request body. Omit it for this GET example.", auth: "Optional authentication details; supplied credentials can appear in generated code." },
    guide: { href: "/guides/http-to-curl-api", label: "Convert a GET request to cURL" },
  },
  "belgian-company-data": {
    title: "Belgian Company Lookup API — KBO/BCE company records",
    description: "Look up Belgian company records by enterprise number or name. Get JSON for your app or agent, see the KBO/BCE source and copy an API example.",
    intro: "Look up a Belgian company by enterprise number or name and get its identity, status and available address details as JSON. Strale’s Belgian company lookup API uses KBO/BCE public-register data supplied by CBEAPI.be. Use it to check company details in supplier onboarding or invoice workflows.",
    example: {
      input: { enterprise_number: "0417497106" },
      output: { company_name: "ANHEUSER-BUSCH INBEV", registration_number: "0417.497.106", vat_number: "BE0417497106", jurisdiction: "BE" },
      selected: true,
      note: "Selected fields from the catalogue example; this is not a live lookup. The VAT number is derived from the enterprise number and does not confirm VAT registration. Run the call for the current company record.",
    },
    uses: [
      "Retrieve a supplier’s registered company name and available address before creating its record in your system.",
      "Compare an enterprise number from an invoice with the company record returned by the register provider.",
      "Look up a company name when you do not have its enterprise number. The tool returns the first search result, so check the identity before using it.",
    ],
    results: [
      { label: "registration_number and company_name", explanation: "Prefer an enterprise-number lookup when you know the identifier. A name search returns the first provider match, not a list of candidates. Compare the returned number and name with your source document." },
      { label: "vat_number", explanation: "This field is constructed from the Belgian enterprise number. Use VAT Validation for a separate registration check; the presence of a BE-prefixed number is not evidence that it is registered for VAT." },
      { label: "Company details and missing fields", explanation: "Address, legal form and registration date may be missing. This tool does not return directors or beneficial owners. A company record is one input to a review, not a complete due-diligence result." },
    ],
    inputDescriptions: { enterprise_number: "KBO/BCE enterprise number, with or without dots; a BE prefix is accepted.", company_name: "Company name to search. Returns the first provider match; verify its enterprise number." },
    outputOverrides: { address: { type: "string or null" }, business_type: { type: "string or null", appears: "May be null when the provider does not supply a legal form" }, registration_date: { type: "string or null" }, vat_number: { appears: "Derived from the enterprise number; not a VAT-registration check" } },
    guide: { href: "/guides/belgian-company-lookup-api", label: "Look up a Belgian company with the API" },
    nextTools: [{ slug: "vat-validate", label: "Check VAT registration separately" }, { slug: "sanctions-check", label: "Screen the company name for potential sanctions matches" }],
  },
  "sec-edgar-filings": {
    title: "SEC EDGAR Filings API — find filings by ticker or CIK",
    description: "Find recent SEC filings by ticker or CIK. Filter for 10-K, 10-Q or 8-K forms and get filing dates and document links as JSON through Strale’s API.",
    intro: "Find a company’s recent SEC filings by ticker or CIK and return their dates, form types and document links as JSON. Strale’s SEC EDGAR filings API lets your app or agent filter for forms such as 10-K, 10-Q and 8-K without handling the SEC’s ticker mapping and submissions format itself.",
    example: {
      input: { ticker: "AAPL", form_type: "10-K", limit: 1 },
      output: { cik: 320193, ticker: "AAPL", returned: 1, filings: [{ form: "10-K", filing_date: "2025-10-31", report_date: "2025-09-27", url: "https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm" }] },
      selected: true,
      note: "Illustrative response using Apple’s 2025 10-K, with selected fields shown. This is not a live latest-filing result; running the call may return a newer filing.",
    },
    uses: [
      "Find a company’s recent annual reports with form_type set to 10-K, or quarterly reports with 10-Q.",
      "Retrieve recent 8-K filing links for a review workflow. Your application decides when to call and which filings it has already processed.",
      "Pass a CIK instead of a ticker when the filer is absent from the ticker index. The lookup returns filing metadata and links, not the document contents.",
    ],
    results: [
      { label: "filing_date and report_date", explanation: "The filing date is when the document was filed with the SEC. The report date is the period or event date reported by the source; it can be absent. They describe different dates." },
      { label: "filings and returned", explanation: "The limit is a maximum, not a promise of that many results. The tool filters the recent filings supplied by EDGAR; an empty list does not prove the company has never filed that form. Older filings may be outside the recent window." },
      { label: "Document links", explanation: "Open the returned url to read a filing. The response does not contain extracted financial figures, full filing text or XBRL facts. Use the SEC source document for the underlying information." },
    ],
    inputDescriptions: { ticker: "Exchange ticker, such as AAPL. Provide ticker or cik; cik takes priority if both are supplied.", cik: "SEC Central Index Key, up to 10 digits. Use this when the filer is not in the ticker index.", form_type: "Exact form filter, such as 10-K, 10-Q or 8-K. Omit to include all recent form types." },
    outputOverrides: { name: { type: "string or null" }, ticker: { type: "string or null" }, tickers: { type: "array" }, exchanges: { type: "array" }, entity_type: { type: "string or null" }, sic_code: { type: "string or null" }, sic_description: { type: "string or null" }, state_of_incorporation: { type: "string or null" }, fiscal_year_end: { type: "string or null" }, filer_category: { type: "string or null" }, business_address: { type: "object or null" }, form_filter: { type: "string or null" }, recent_filings_available: { type: "number" } },
    guide: { href: "/guides/sec-edgar-filings-api", label: "Find SEC filings by ticker or CIK" },
  },
  "vat-validate": {
    title: "VAT Validation API — check EU VAT numbers with VIES",
    description: "Check EU VAT registration through VIES with Strale’s API. See a consistent request and response, available company details, caching and error handling.",
    intro: "Check an EU VAT number against VIES and get its registration result and available company details as JSON. Strale’s VAT validation API can use a cached result, so read the cache fields when freshness matters. A format check alone does not confirm VAT registration.",
    example: {
      input: { vat_number: "SE556703748501" },
      output: { valid: true, vat_number: "SE556703748501", country_code: "SE", company_name: "Spotify AB", company_address: "REGERINGSGATAN 19\n111 53 STOCKHOLM" },
      selected: true,
      note: "Illustrative response for the same Swedish VAT number used in every call below. Selected fields are shown; this is not a live registration check. Company details depend on what the provider supplies.",
    },
    uses: [
      "Check a supplier’s VAT registration before passing an invoice or onboarding record to the next step.",
      "Compare the returned company name and address with your records when those details are available.",
      "Use VAT Format Validation for an offline format check, then this tool when you need a registry response.",
    ],
    results: [
      { label: "valid", explanation: "Read this as the provider’s registration result for the number. An unavailable service or failed request is not an invalid registration. Handle errors separately and retry when the service becomes available." },
      { label: "company_name and company_address", explanation: "These fields can be empty strings even when valid is true. The VIES adapter returns an empty string when a detail is missing or supplied as a placeholder; the Swiss public lookup also returns empty company details." },
      { label: "Cached results", explanation: "A cached answer includes cache_hit, cached_at and cache_age_hours. Results can be reused for 48 hours. If a provider fails and an older cached answer is available, stale: true identifies that fallback. Decide whether its age is acceptable before relying on it." },
      { label: "Country coverage", explanation: "EU and XI numbers use VIES; Norway and Switzerland/Liechtenstein use other registry services. GB checks depend on configured HMRC access and can return a credentials-pending error. The guide explains the routes and their limits." },
    ],
    inputDescriptions: { vat_number: "VAT number including its country prefix, such as SE556703748501. Country support and available details vary; see the limitations." },
    outputOverrides: { company_name: { appears: "Present as a string; may be empty even for a valid number" }, company_address: { appears: "Present as a string; may be empty even for a valid number" } },
    guide: { href: "/guides/vat-number-validation-api", label: "Check VAT numbers and handle cached or missing details" },
    nextTools: [{ slug: "vat-format-validate", label: "Check VAT-number format without a registry lookup" }, { slug: "eori-validate", label: "Check an EORI number for customs workflows" }],
  },
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
    inputDescriptions: { include_links: "Keep link destinations in the Markdown (default: true).", include_images: "Keep image references in the Markdown (default: true)." },
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
    inputDescriptions: { country: "ISO country code echoed in the response; does not filter the sanctions search." },
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
