// Frozen data for block 0124. Exact old_description values were read from
// GET https://api.strale.io/v1/capabilities on 2026-10-27, never from manifests.
// A changed production value is left alone. This file is hashed through migration-data.
// Snapshot body SHA-256: 6337fecff3a0d268f7ec0546c062b42f4febc23311f79cfe7c544c4266d800fe

export interface PublicDescriptionRow {
  slug: string;
  old_description: string;
  description: string;
}

export const PUBLIC_DESCRIPTIONS_0124: readonly PublicDescriptionRow[] = [
  {
    "slug": "academic-paper-search",
    "old_description": "Search 250M+ scholarly works in OpenAlex: title, DOI, authors, venue, citations, open-access PDF and abstract. Filter by year and open access.",
    "description": "Search scholarly works by keyword, year and open-access status. Returns titles, authors, citations, abstracts and available publication links."
  },
  {
    "slug": "address-parse",
    "old_description": "Split a free-text address from anywhere in the world into street, city, postal code, region and country.",
    "description": "Split a free-text postal address into street, city, postal code, region and country, with a formatted address and confidence estimate."
  },
  {
    "slug": "address-validate",
    "old_description": "Validate and standardise a postal address in 200+ countries. Returns structured components, a confidence level and suggested corrections, from OpenStreetMap.",
    "description": "Match a postal address to map records and suggest a standardised form. Returns address components, coordinates and a confidence estimate."
  },
  {
    "slug": "adverse-media-check",
    "old_description": "Screen a person or company for adverse news across 235,000+ sources. Returns a risk level with its thresholds, FATF-aligned category counts, and the top headlines with source links and dates.",
    "description": "Search adverse news about a person or company. Returns a risk level, category counts and linked headlines for review."
  },
  {
    "slug": "agent-trace-analyze",
    "old_description": "Analyse an AI agent's run trace from LangChain, CrewAI or AutoGen: where it failed, why, wasted tokens, and suggested fixes.",
    "description": "Analyse an AI agent's run trace for potential failures and token waste. Returns findings, likely causes and suggested fixes."
  },
  {
    "slug": "backlink-check",
    "old_description": "Find backlinks to a domain from Common Crawl and Google search: linking domains, anchor text, and follow and nofollow counts.",
    "description": "Find possible backlinks to a domain from search results and web archives. Returns linking pages and available link details."
  },
  {
    "slug": "barcode-lookup",
    "old_description": "Look up a product by UPC or EAN barcode: name, brand, nutrition and images, from Open Food Facts and UPC ItemDB.",
    "description": "Look up a product by UPC or EAN barcode. Returns the product name, brand and available nutrition details and images."
  },
  {
    "slug": "belgian-company-data",
    "old_description": "Look up a Belgian company in the Crossroads Bank for Enterprises (KBO/BCE) by enterprise number, VAT number or name. Returns name, status, legal form, address, registration date, establishments and VAT number.",
    "description": "Look up a Belgian company by enterprise number, VAT number or name. Returns identity, status, address and registration details."
  },
  {
    "slug": "beneficial-ownership-lookup",
    "old_description": "Find the people with significant control of a UK company, from Companies House: who ultimately owns or controls it, their share, and the ownership chain. UK companies only.",
    "description": "Look up a UK company's reported persons of significant control in Companies House, including ownership and control details."
  },
  {
    "slug": "breach-exposure-check",
    "old_description": "Find known data breaches of a company's own domain: when, how many accounts, which kinds of data leaked, and whether passwords were among them. Takes a domain only.",
    "description": "Find reported breaches of a company's own domain, with dates, affected-account counts and exposed data categories."
  },
  {
    "slug": "charity-lookup-uk",
    "old_description": "Look up a charity in England and Wales or Scotland by registration number, or search by name, from Find that Charity. A number lookup returns status, registration dates, income, spending and description.",
    "description": "Look up charity registration records by number or name, including status, registration dates and reported income and spending."
  },
  {
    "slug": "company-id-detect",
    "old_description": "Work out the type and country of a company registration number: Swedish organisation numbers, Finnish business IDs, German HRB numbers, LEIs, DUNS and 20+ other formats.",
    "description": "Identify possible countries and identifier types from a company registration number's format. Returns candidate matches and confidence levels."
  },
  {
    "slug": "company-name-match",
    "old_description": "Tell whether two company names are the same company, allowing for Ltd and Limited, AB and Aktiebolag, Inc, GmbH and the like. Returns a match confidence.",
    "description": "Compare two company names, allowing for common legal suffixes and spelling differences. Returns similarity scores and normalised names."
  },
  {
    "slug": "company-news",
    "old_description": "Search news about a company in 100+ languages, updated every 15 minutes. Returns recent articles with source, date and sentiment.",
    "description": "Search news about a company. Returns matching articles with headlines, sources, dates and sentiment estimates."
  },
  {
    "slug": "container-track",
    "old_description": "Track a shipping container by its ISO 6346 number: check the number, identify the carrier and get the tracking status.",
    "description": "Check a container number, identify its carrier and try to read tracking details. Returns available status information and tracking links."
  },
  {
    "slug": "country-tax-rates",
    "old_description": "Get corporate tax, VAT, personal income tax, capital gains and social security rates for 45+ countries.",
    "description": "Look up reference tax rates for a supported country, including corporate, VAT and personal income tax, with available notes."
  },
  {
    "slug": "credit-score-band",
    "old_description": "Translate a FICO, VantageScore, Experian or Equifax score into a common risk band with an estimated percentile.",
    "description": "Map a supplied credit score to a risk band using supported scoring systems. Returns the band, estimated percentile and interpretation."
  },
  {
    "slug": "cve-details",
    "old_description": "Look up one CVE in the NIST National Vulnerability Database: description, CVSS score and vector, CWE ids, whether CISA lists it as exploited, affected products and references.",
    "description": "Look up a CVE in NIST's vulnerability database, including severity, affected products and references where available."
  },
  {
    "slug": "cve-lookup",
    "old_description": "Find known vulnerabilities for a package version on npm, PyPI, Maven, Go, Cargo or NuGet, from OSV. Returns CVEs with severity and the version that fixes each.",
    "description": "Find reported vulnerabilities for a package version in OSV. Returns vulnerability identifiers, available severity and affected or fixed versions."
  },
  {
    "slug": "cz-unreliable-vat-payer",
    "old_description": "Check whether a Czech VAT number (DIČ) is flagged as an unreliable VAT payer, and get the bank accounts the payer has published. Protects against joint VAT liability.",
    "description": "Check a Czech VAT number's unreliable-payer flag and published bank accounts in the Ministry of Finance records."
  },
  {
    "slug": "dangerous-goods-classify",
    "old_description": "Classify dangerous goods by UN number or substance name: hazard class, packing group, labels and marine pollutant status, for 200+ substances.",
    "description": "Look up dangerous-goods reference data by UN number or substance name. Returns hazard class, packing group and required labels where available."
  },
  {
    "slug": "diff-review",
    "old_description": "Review a git diff for bugs, security issues, missing error handling, test gaps and code quality. Returns findings with severity and file, and whether to approve.",
    "description": "Review a git diff for potential bugs, security issues, error handling and test gaps. Returns findings with severity and file references."
  },
  {
    "slug": "domain-contact-extract",
    "old_description": "Find a company's public contact details on its own website: role email addresses such as info@ and sales@, phone numbers, postal address, contact page and social links. Company contacts only, never a named person's.",
    "description": "Read published company contact channels from a website: role email addresses, phone numbers, postal address and social links."
  },
  {
    "slug": "email-draft",
    "old_description": "Draft a professional email for a purpose and tone you give, such as a cold introduction, follow-up or apology. Returns subject options, the body and key phrases.",
    "description": "Draft an email for a purpose, tone and context you supply, with subject options, body text and key phrases."
  },
  {
    "slug": "email-validate",
    "old_description": "Check an email address: syntax, mail servers, disposable and role addresses, free providers and likely typos such as gmial.com. Returns a deliverability verdict with each check. No email is sent.",
    "description": "Check email syntax, mail-server records, disposable domains, role addresses and likely typos. Returns checks without confirming a mailbox exists."
  },
  {
    "slug": "fear-greed-index",
    "old_description": "Get the Crypto Fear and Greed Index, a market sentiment score from 0 (extreme fear) to 100 (extreme greed), with up to 30 days of history. From Alternative.me.",
    "description": "Read the Crypto Fear and Greed Index from 0 to 100, with its sentiment label, update time and up to 30 days of history."
  },
  {
    "slug": "financial-year-dates",
    "old_description": "Get a country's financial year, tax filing deadlines and VAT filing frequency, for 42+ countries.",
    "description": "Look up reference financial-year dates, tax filing deadlines and VAT filing frequency for a supported country."
  },
  {
    "slug": "fr-bodacc-lookup",
    "old_description": "Get a French company's announcements in BODACC, the official commercial gazette, by SIREN: insolvency proceedings, changes, sales, strike-offs and incorporations.",
    "description": "Read a French company's BODACC announcements by SIREN, including insolvency proceedings, sales and registration changes."
  },
  {
    "slug": "french-insolvency-check",
    "old_description": "Check a French company for insolvency proceedings (redressement or liquidation judiciaire) in BODACC, the official legal gazette, by SIREN or name. Returns judgment dates, court and type.",
    "description": "Search BODACC for a French company's collective insolvency proceedings by SIREN or name, with court, date and proceeding type."
  },
  {
    "slug": "german-company-data",
    "old_description": "Look up a company in the German commercial register (Handelsregister). Returns name, register number, court, legal form, status, address, directors, capital, LEI, and incorporation and closure dates.",
    "description": "Look up German company identity and registration details, including court, legal form, status, address and directors where available."
  },
  {
    "slug": "gleif-l2-children-lookup",
    "old_description": "List the direct and ultimate subsidiaries of an entity from GLEIF ownership data, to see whether it is a holding company and what it owns.",
    "description": "List reported direct and ultimate child entities for an LEI in GLEIF, returning names, LEIs and available relationship details."
  },
  {
    "slug": "gleif-l2-ubo-lookup",
    "old_description": "Find the direct and ultimate parent companies of any entity with an LEI, from GLEIF ownership data, with the stated reason when a parent is not reported. Fills ownership gaps that national registers leave.",
    "description": "Find reported direct and ultimate parent companies for an LEI in GLEIF, including reporting exceptions where a parent is not named."
  },
  {
    "slug": "greek-company-data",
    "old_description": "Look up a Greek company in GEMI, the General Commercial Registry, by GEMI number or 9-digit tax ID (AFM). Returns name, legal form, address, status, main activity, directors and VAT number.",
    "description": "Look up a Greek company in GEMI by registry number or tax ID, including identity, status, address and directors where available."
  },
  {
    "slug": "holiday-calendar",
    "old_description": "Get a country's public holidays for a year, for 200+ countries: names, dates, type (public, bank or optional) and whether each is fixed or moves.",
    "description": "List public holidays for a supported country and year. Returns dates, names, holiday types and available regional details."
  },
  {
    "slug": "id-number-validate",
    "old_description": "Check the format and checksum of national ID numbers: Swedish personnummer, Finnish henkilötunnus, Norwegian fødselsnummer, Danish CPR, UK National Insurance, US SSN and German Steuer-ID. Does not verify identity.",
    "description": "Check national ID formats and available checksums for seven supported countries. Returns validation details without confirming identity."
  },
  {
    "slug": "image-to-text",
    "old_description": "Read the text in any image with AI vision: screenshots, photos of documents and handwriting. Returns the text with a confidence level.",
    "description": "Read text from an image, including screenshots and document photos. Returns extracted text, a confidence estimate and detected language."
  },
  {
    "slug": "irish-company-data",
    "old_description": "Look up an Irish company at the Companies Registration Office by CRO number or name. Returns name, status, type, address, registration date, annual return dates, NACE code and Eircode.",
    "description": "Look up an Irish company at the CRO by number or name, with status, address, registration dates and filing details where available."
  },
  {
    "slug": "keyword-rank-check",
    "old_description": "Find where a domain ranks on Google for a keyword: position, page, the matching result, and the competitors ranking above it. Scans the top 10 results by default (up to 100), so a domain not found may still rank lower.",
    "description": "Find a domain in the top Google results for a keyword, scanning 10 results by default and up to 100. Lower-ranked domains can be missed."
  },
  {
    "slug": "language-detect",
    "old_description": "Detect the language of a text among 170+ languages, with a confidence score and the next most likely languages.",
    "description": "Identify the likely language of supplied text. Returns the detected language, confidence and alternative language candidates."
  },
  {
    "slug": "latvian-company-data",
    "old_description": "Look up a Latvian company in the Enterprise Register by its 11-digit registration number or name. Returns name, status, type, address, registration date, SEPA creditor ID and administrative code.",
    "description": "Look up a Latvian company by number or name, returning identity, status, address, registration date and current officers where available."
  },
  {
    "slug": "link-extract",
    "old_description": "List every link on a page with its anchor text and rel attributes, internal or external.",
    "description": "List links found in a page's initial HTML, with anchor text and rel attributes. Links added by JavaScript can be missed."
  },
  {
    "slug": "llm-cost-calculate",
    "old_description": "Work out what a prompt and its answer cost across 14 models, with cheaper options and how much each saves.",
    "description": "Estimate prompt and completion costs using reference prices for supported models. Returns token estimates, costs and cheaper options."
  },
  {
    "slug": "llm-output-validate",
    "old_description": "Check an LLM's output against a schema and repair common mistakes, without calling another model.",
    "description": "Parse AI output as JSON, repair common syntax mistakes and check supported schema rules. Returns parsed output and validation errors."
  },
  {
    "slug": "name-parse",
    "old_description": "Split a full name into title, first, middle and last names, suffix and nickname. Gets 'Dr. Karl-Johan von Lindström III' right.",
    "description": "Split a full name into title, first, middle and last names, suffix and nickname. Returns the parsed name components."
  },
  {
    "slug": "no-bankruptcy-check",
    "old_description": "Check a Norwegian company for bankruptcy and dissolution in the Brønnøysund registers: any bankruptcy filing and its date, voluntary or forced dissolution, and the register's notes.",
    "description": "Read Norwegian registry bankruptcy and dissolution flags, available dates and registry annotations for a company."
  },
  {
    "slug": "page-exists",
    "old_description": "Check whether a URL still exists. Catches hard 404s, soft 404 pages, dead links and removed listings that still answer with HTTP 200.",
    "description": "Assess whether a URL returns page content or missing-page signals. Returns an existence result, confidence and supporting checks."
  },
  {
    "slug": "paid-api-preflight",
    "old_description": "Check a paid API before your agent spends money on it: reachability, SSL, response time and the payment handshake (L402, x402, MPP). Returns proceed, caution or avoid, with the payment details.",
    "description": "Check an API's reachability, HTTPS use and HTTP 402 payment response for L402, x402 or MPP. Returns payment details and a proceed, caution or avoid result."
  },
  {
    "slug": "password-strength",
    "old_description": "Analyze password strength: entropy, crack time estimate, character class diversity, common password check, keyboard pattern detection. Password is NOT stored. Algorithmic.",
    "description": "Estimate password strength from entropy and common patterns. Returns a score, estimated crack time, issues and suggestions."
  },
  {
    "slug": "pdf-extract",
    "old_description": "Pull structured data out of any PDF, from a URL or a file. Works on contracts, reports and forms, and returns JSON shaped by your instructions.",
    "description": "Extract structured data from a PDF supplied as a URL or file. Returns JSON fields shaped by your instructions."
  },
  {
    "slug": "pep-check",
    "old_description": "Screen a person against politically exposed persons in 230+ territories, aligned with the EU PEP function list and including relatives and close associates. Returns matches with positions held, jurisdictions and sources.",
    "description": "Screen a person for potential politically exposed person matches, returning positions, countries and record sources where available."
  },
  {
    "slug": "phone-type-detect",
    "old_description": "Tell whether a phone number is mobile, landline, VoIP, toll-free or premium rate, before you send an SMS or route a call.",
    "description": "Infer a phone number's line type from numbering-plan data. Returns line-type flags, SMS capability and country where available."
  },
  {
    "slug": "phone-validate",
    "old_description": "Validate a phone number in 200+ countries. Returns the E.164 form, country, and whether it is mobile, landline or VoIP.",
    "description": "Check a phone number's format and numbering-plan rules. Returns its E.164 form, country and available line type without confirming activity."
  },
  {
    "slug": "pii-redact",
    "old_description": "Find and remove personal data in text: names, email addresses, phone numbers, national ID numbers such as Swedish personnummer, addresses and more.",
    "description": "Redact personal details from supplied text. Returns redacted text, detected data types and counts; the submitted input is retained for 90 days."
  },
  {
    "slug": "price-compare",
    "old_description": "Compare a product's price across shops on PriceRunner in Sweden, Norway, Denmark and Finland. Returns the lowest, highest and average price.",
    "description": "Compare product prices found on public comparison pages in Sweden and Denmark. Returns offers and price statistics."
  },
  {
    "slug": "product-reviews-extract",
    "old_description": "Read the reviews on a product or review page: rating distribution, pros and cons, and sentiment. Trustpilot is not supported, as its terms forbid automated access.",
    "description": "Read visible reviews from a supported public product or review page, including ratings, themes and sentiment."
  },
  {
    "slug": "prompt-compress",
    "old_description": "Shorten a prompt by 10 to 70 percent while keeping its meaning.",
    "description": "Shorten a prompt towards a requested reduction while aiming to preserve its meaning. Returns the shorter text and estimated savings."
  },
  {
    "slug": "prompt-optimize",
    "old_description": "Improve a prompt and see what changed and why, with a before-and-after clarity score and the techniques used.",
    "description": "Suggest improvements to a prompt for a chosen goal. Returns revised text, an explanation of changes and estimated clarity scores."
  },
  {
    "slug": "protocol-fees-lookup",
    "old_description": "Get fees and revenue for a DeFi protocol over 24 hours, 7 days, 30 days and all time. Covers 7,000+ protocols, from DeFi Llama.",
    "description": "Look up a DeFi protocol's reported fees and revenue over 24 hours, 7 days, 30 days and all time, with available breakdowns."
  },
  {
    "slug": "protocol-tvl-lookup",
    "old_description": "Get a DeFi protocol's total value locked, its split across chains, category and audit status. Covers 7,000+ protocols on 500+ chains, from DeFi Llama.",
    "description": "Look up a DeFi protocol's reported total value locked, chain breakdown, category, audit information and recent changes."
  },
  {
    "slug": "public-holiday-lookup",
    "old_description": "Get a country's public holidays for a year, for 200+ countries, with the next one coming up.",
    "description": "Look up public holidays for a supported country and year. Returns holiday names and dates, with the next upcoming holiday."
  },
  {
    "slug": "sanctions-check",
    "old_description": "Check a person or company against sanctions lists: EU, US OFAC, UN, UK, Swiss SECO, BIS, World Bank, EBRD, ADB and 125 national lists. Returns each match with the list and country it comes from.",
    "description": "Screen a person or company against published sanctions lists, returning potential name matches with their source lists and countries."
  },
  {
    "slug": "slovak-company-data",
    "old_description": "Look up a Slovak company in RPO, the Statistical Office's register of legal persons. Returns name, address, legal form, registration details and statutory representatives.",
    "description": "Look up a Slovak company in RPO, including name, address, legal form, registration details and representatives where available."
  },
  {
    "slug": "social-profile-check",
    "old_description": "Check username availability across 7 platforms: GitHub, YouTube, TikTok, Reddit, Pinterest, npm, PyPI.",
    "description": "Check whether a name is taken as an npm package, a PyPI project or a GitHub organisation, via each registry's official API."
  },
  {
    "slug": "spanish-company-data",
    "old_description": "Look up a Spanish company by CIF/NIF or name in the BORME-based register. Returns identity, status, legal form, current officers and BORME history, across 2.8M+ companies.",
    "description": "Look up a Spanish company by CIF, NIF or name in BORME-derived records, returning identity, status, current officers and recent publication acts."
  },
  {
    "slug": "stablecoin-flow-check",
    "old_description": "Get stablecoin supply and flows by chain, by stablecoin (such as USDC's market cap and circulation) or for the whole market, from DeFi Llama.",
    "description": "Look up reported stablecoin supply by chain, asset or market. Returns circulation figures, changes and available breakdowns."
  },
  {
    "slug": "startup-domain-check",
    "old_description": "Check whether a startup name is free as a .com, .io, .ai, .co or .dev domain, as a GitHub account name, and as an npm or PyPI package name.",
    "description": "Check a startup name for domain DNS records and public account or package name signals. Returns candidate names; DNS absence does not prove availability."
  },
  {
    "slug": "stock-quote",
    "old_description": "Get a live quote for a listed company by ticker, such as AAPL or VOLV-B.ST: price, change, volume and market status.",
    "description": "Look up a stock ticker's latest reported price, change, volume and available market status."
  },
  {
    "slug": "swedish-company-data",
    "old_description": "Look up a Swedish company at Bolagsverket: name, legal form, status, registered address, SNI industry codes, registration date and any insolvency or liquidation proceedings.",
    "description": "Look up a Swedish company at Bolagsverket by organisation number, including identity, status, address and recorded proceedings."
  },
  {
    "slug": "tax-id-validate",
    "old_description": "Check tax identification number formats for 40+ countries, including checksums where they exist. Does not check with the tax authority.",
    "description": "Check tax identification number formats for supported countries. Returns pattern results and normalised input without checking registration or check digits."
  },
  {
    "slug": "token-count",
    "old_description": "Estimate the token count and cost of a text for GPT-4o, Claude, Gemini, Mistral and Llama models, without calling any model.",
    "description": "Estimate text token counts and costs for supported AI models using character-based rules, without calling a model."
  },
  {
    "slug": "tool-call-validate",
    "old_description": "Check an LLM's tool call against its JSON Schema and fix type mismatches, such as the string '42' where a number belongs.",
    "description": "Check supported schema rules for a tool call and repair common type mismatches. Returns validation errors and corrected input."
  },
  {
    "slug": "uk-cop-check",
    "old_description": "Check that a UK sort code and account number belong to the name you expect, through the Pay.UK Confirmation of Payee scheme. Returns the match result, the bank, and the registered name when it is a close match.",
    "description": "Compare a UK bank account's recorded name with the name supplied through Confirmation of Payee. Returns the match result and available bank details."
  },
  {
    "slug": "vat-format-validate",
    "old_description": "Check a European VAT number's format against each country's rules, for the 27 EU countries plus the UK, Switzerland and Norway. Format only: use EU VAT Validation to check it in VIES.",
    "description": "Check European VAT number formats against country patterns. Returns the country and format result without checking registration or check digits."
  },
  {
    "slug": "vat-validate",
    "old_description": "Check a European VAT number in VIES and get the registered company name, address and validity. Repeat lookups within 48 hours come from cache, and cached data is served while VIES is down.",
    "description": "Check supported VAT numbers against registry services, returning validity and available company details, with cache information when used."
  },
  {
    "slug": "web-extract",
    "old_description": "Pull structured data from a web page, rendering JavaScript first, so single-page apps and dynamic content work.",
    "description": "Read a supported public web page and map its content to requested fields. Returns structured data; blocked pages return an access error."
  },
  {
    "slug": "workflow-security-audit",
    "old_description": "Audit a GitHub Actions workflow for supply-chain risks: unpinned actions, broad permissions, exposed secrets, trusted publishing and risky triggers such as pull_request_target.",
    "description": "Check a GitHub Actions workflow for potential supply-chain risks. Returns findings, severity counts and a risk level."
  }
];

// Copy fixtures only: these tools were absent from the public snapshot. They
// are never passed to the migration; no production old value is guessed.
export const UNLISTED_DESCRIPTIONS_0124: readonly Pick<PublicDescriptionRow, "slug" | "description">[] = [
  {
    "slug": "annual-report-extract",
    "description": "Currently unavailable. Extract available financial figures and key ratios from a Swedish annual report."
  },
  {
    "slug": "approval-security-check",
    "description": "Currently unavailable. Check wallet token approvals for unlimited spending allowances and reported risks."
  },
  {
    "slug": "australian-company-data",
    "description": "Currently unavailable. Look up Australian business details by ABN, ACN or name, returning registration information."
  },
  {
    "slug": "bulgarian-company-data",
    "description": "Look up Bulgarian company identity and registration details by UIC or EIK. Director details are not included."
  },
  {
    "slug": "business-license-check-se",
    "description": "Currently unavailable. Look up Swedish company registration, industry codes and reported tax-registration flags."
  },
  {
    "slug": "cert-transparency-search",
    "description": "Search public Certificate Transparency logs for certificates and hostnames associated with a domain."
  },
  {
    "slug": "company-fundamentals",
    "description": "Read available annual financial metrics from a US domestic company's SEC 10-K filings, with source concepts and filing references."
  },
  {
    "slug": "contract-verify-check",
    "description": "Check whether a smart contract has a published source-code match, with compiler settings and proxy status where available."
  },
  {
    "slug": "credit-report-summary",
    "description": "Currently unavailable. Swedish company credit summaries are not served."
  },
  {
    "slug": "crypto-price",
    "description": "Currently unavailable. Look up cryptocurrency price, market capitalisation and price changes in a chosen currency."
  },
  {
    "slug": "cypriot-company-data",
    "description": "Look up a Cypriot company by VAT or company number. Director details from DRCOR are available only for C-prefix company numbers."
  },
  {
    "slug": "docker-hub-info",
    "description": "Currently unavailable. Look up container image metadata, including tags, pull counts and supported architectures."
  },
  {
    "slug": "dutch-company-data",
    "description": "Look up Dutch company identity and registration details by NL-format VAT number. KvK registration numbers are not accepted."
  },
  {
    "slug": "ecb-interest-rates",
    "description": "Currently unavailable. Read ECB refinancing, deposit facility and marginal lending rates with an effective date."
  },
  {
    "slug": "email-finder",
    "description": "Currently unavailable. Suggest possible work email addresses from a person's name and company domain, with confidence estimates."
  },
  {
    "slug": "email-pattern-discover",
    "description": "Suggest likely company email formats from domain-level mail settings and published address patterns. Does not confirm individual mailboxes."
  },
  {
    "slug": "employer-review-summary",
    "description": "Currently unavailable. Summarise employer reviews, returning ratings, compensation scores and review themes."
  },
  {
    "slug": "eu-court-case-search",
    "description": "Currently unavailable. Search CURIA or HUDOC court records, returning case numbers, titles, dates and summaries."
  },
  {
    "slug": "fda-safety-search",
    "description": "Search FDA recall reports for drugs, medical devices and food, with classification, recall reason, firm, distribution and dates."
  },
  {
    "slug": "flight-status",
    "description": "Currently unavailable. Look up a flight number's reported status, departure and arrival times, delays and gates."
  },
  {
    "slug": "github-user-profile",
    "description": "Currently unavailable. Look up a public developer profile, repository counts and recent repositories."
  },
  {
    "slug": "google-news-search",
    "description": "Search Google News results by query, country, language and time range. Returns headlines, sources, snippets and relative publication times."
  },
  {
    "slug": "host-exposure-lookup",
    "description": "Currently unavailable. Look up recorded ports, software, vulnerabilities and hostnames for an IP address or hostname."
  },
  {
    "slug": "hungarian-company-data",
    "description": "Look up Hungarian company identity and registration details by HU-format VAT number. Hyphenated company numbers are not accepted."
  },
  {
    "slug": "ip-geolocation",
    "description": "Currently unavailable. Look up an IP address's reported location, network and provider."
  },
  {
    "slug": "ip-risk-score",
    "description": "Currently unavailable. Assess an IP address using reported proxy, VPN and hosting indicators, returning a risk score."
  },
  {
    "slug": "italian-company-data",
    "description": "Look up Italian company details by tax or VAT number, including financial and shareholder information where available. Directors are not included."
  },
  {
    "slug": "keyword-suggest",
    "description": "Currently unavailable. Find keyword suggestions, questions and related search phrases for a query."
  },
  {
    "slug": "linkedin-url-validate",
    "description": "Currently unavailable. Check a professional-network URL's format and accessibility, returning its type and normalised form."
  },
  {
    "slug": "lithuanian-company-data",
    "description": "Currently unavailable. Look up Lithuanian company identity, legal form, status and registration dates by code or name."
  },
  {
    "slug": "luxembourgish-company-data",
    "description": "Look up Luxembourgish company identity and registration details by LU-format VAT number. RCS company numbers are not accepted."
  },
  {
    "slug": "maltese-company-data",
    "description": "Look up Maltese company details by MT-format VAT number. Some registered companies are missing; C-prefix company numbers are not accepted."
  },
  {
    "slug": "officer-search",
    "description": "Currently unavailable. Find company officers in UK Companies House and US SEC records, with names, roles and available dates."
  },
  {
    "slug": "patent-search",
    "description": "Currently unavailable. Search patent records, returning titles, inventors, assignees and available filing details."
  },
  {
    "slug": "phishing-site-check",
    "description": "Currently unavailable. Check a URL against reported Web3 phishing records, returning a flag and confidence estimate."
  },
  {
    "slug": "portuguese-company-data",
    "description": "Look up a Portuguese company by NIPC, returning identity, status, address, industry code and latest filing date where available."
  },
  {
    "slug": "product-search",
    "description": "Currently unavailable. Search product listings, returning titles, prices, merchants and available ratings."
  },
  {
    "slug": "romanian-company-data",
    "description": "Look up Romanian company details using supported VAT or CUI formats. Seven-digit CUI identifiers are not accepted."
  },
  {
    "slug": "salary-benchmark",
    "description": "Currently unavailable. Look up salary estimates for a job title, returning a median, percentiles and comparable roles."
  },
  {
    "slug": "serp-related-questions",
    "description": "Find related questions and searches for a query. Returns question text, available answer snippets and source links."
  },
  {
    "slug": "token-security-check",
    "description": "Currently unavailable. Check a token contract for reported honeypot flags, trading taxes and ownership risks."
  },
  {
    "slug": "trustpilot-score",
    "description": "Currently unavailable. Read a domain's published review score, rating distribution and recent reviews."
  },
  {
    "slug": "uk-gazette-notice-search",
    "description": "Search official UK Gazette insolvency notices by name, returning notice summaries, dates and links to the published record."
  },
  {
    "slug": "us-company-data-cobalt",
    "description": "Look up a US company in one state's Secretary of State records by company ID or name, with registration, officer and filing details where available."
  },
  {
    "slug": "us-court-search",
    "description": "Currently unavailable. Search US federal RECAP dockets by party name, returning courts, filing dates and case links."
  },
  {
    "slug": "us-ein-match",
    "description": "Look up a US business by EIN or search by name, returning address, formation state and candidate match scores where available."
  },
  {
    "slug": "us-sec-filings-extended",
    "description": "Search SEC filings by CIK or company name, with optional filing type and date filters. Returns matching filing records and source links."
  },
  {
    "slug": "wallet-risk-score",
    "description": "Currently unavailable. Check a wallet address for reported malicious-activity labels and a risk level."
  },
  {
    "slug": "website-to-company",
    "description": "Currently unavailable. Infer a company name from website metadata and try a registry lookup using its domain's country."
  }
];
