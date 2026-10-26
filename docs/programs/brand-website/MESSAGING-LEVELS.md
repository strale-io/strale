---
doc_type: creative-brief
authority_scope: none
program: brand-website
status: adopted
date: 2026-10-23
---

# Three-level messaging — proposed

> **Adopted 2026-10-24 by Petter (DEC-20261024-B).** Where the text below says "proposed", read it as the historical review status.

**Status: proposed, not adopted.** These are the benefit, what-it-does and feature lines for the new site, written in the three-level model Petter uses for Cinver:

- Level 1 goes in the hero and the first section below it.
- Level 2 goes partly on the home page.
- Level 3 goes on the product pages.

Page references point to [SITE-STRUCTURE.md](SITE-STRUCTURE.md). Nothing here is approved for publication. [claims.yaml](../../company/claims.yaml) governs every public claim, and the proof gaps at the end must close before the lines that depend on them ship.

## Positioning and reader

**DEC-20261023-B** (Petter, 23 October; recorded in a separate PR) sets the story:

- **Lead:** Strale is a broad, global library of tools that AI agents use and pay for per call. One connection replaces an account with each provider, and agents pay with an API key or a wallet (x402, no signup).
- **Flagship:** official-source company and compliance data, worldwide, not Europe-only. This is the premium part of the library, with outcome pricing for bundled checks, but not the headline.
- **Growth:** the catalogue is shaped into a portfolio from market signals. The copy sells breadth and usefulness and never claims what is currently popular.

**The reader** is a developer or technical founder building an agent that has to act in the world: find information, read a document, check a detail, look up a company, then decide what to do next. Each of those jobs normally means another provider, another account, another key and another bill. Second readers are marketplace and router operators deciding whether to list Strale's tools.

**Words.** Each line names a job or a mechanism. Some words are avoided:

- "Verified", "trusted", "compliant": adjective or regulator-facing claims.
- "Receipt": the name of an internal record customers cannot retrieve ([LAUNCH-PROOF.md](LAUNCH-PROOF.md)). Public copy says "record".
- "Popular", "most used": the claim is forbidden (`most-popular-tools`), and Petter ruled out leaning on it.
- Counts: the library and country counts are rendered from `/v1/platform/facts`, never typed.

## Level 1 — what the agent builder gains

1. **Give your agent a new tool without opening another provider account.**
2. **Add tools as your agent's work grows, through the connection you already have.**
3. **Pay per call, with no subscription or contract.**
4. **Let your agent pay its own way: on eligible tools, an x402 wallet pays per request and nobody signs up.**

**Hero:** line 1 is the headline. Line 2 is the supporting line, followed directly by the catalogue search box, so the reader sees the breadth at once. Lines 3 and 4 open the benefits section (Home §2), each next to a concrete example:

- Line 3: one call and its price.
- Line 4: an x402 request and its 402 price quote.

## Level 2 — what it does

Breadth comes first (Home §3), then the flagship (Home §5).

1. **Searches and reads the web:** Google results, search-result analysis, any page as clean text for the model.
2. **Reads documents:** text from images, and the fields from invoices, receipts and PDFs.
3. **Checks details before your agent acts on them:** email addresses, phone numbers, IBAN format, EU VAT numbers.
4. **Handles the other jobs around an agent**, in five groups (revised 2026-10-26, when the single web-and-developer group had grown to 125 tools):
   - **Writes and analyses text:** translation, summaries, classification, sentiment and language detection, and drafts of emails, posts and outlines.
   - **Checks domains, websites and security:** DNS, WHOIS, SSL and mail-server checks, uptime and redirects, tech stack, SEO and page speed, and security checks for headers, secrets, packages and known vulnerabilities.
   - **Works with code:** generates config, docs, tests and SQL, explains errors and regular expressions, converts code, looks up packages and repositories, and counts and trims prompts.
   - **Cleans and converts data:** CSV, JSON and XML conversion, repair and validation, de-duplication and data-quality checks, parsing names, addresses, dates and phone numbers, PII redaction and unit conversion.
   - **Looks up crypto wallets and networks:** wallet address checks, balances, age and transactions, ENS names, gas prices, protocol data and VASP licence checks.
5. **Looks up companies in official records in 25 countries across Europe, the Americas and Asia-Pacific:** name and registration number, plus status, address and directors where the source provides them.
6. **Screens companies and people:** sanctions and politically exposed person lists, adverse media, and ownership where it is published.
7. **Runs a whole company check or invoice-issuer check in one call, at one price:** it returns each step's result and a summary for a person to review.

Use-case pages each take the line that matches their job. The company and compliance hub carries lines 5–7 in full.

## Level 3 — features

1. One API key and one balance for every tool.
2. Or no account at all: pay in USDC per request over x402, for eligible tools.
3. A single tool is charged only when the call succeeds; a bundled check is refunded only if every step fails.
4. Connect over MCP, the REST API, the TypeScript and Python SDKs, or the LangChain, CrewAI, Semantic Kernel and Composio packages.
5. Every tool has a page with its inputs, output fields, price, limitations and source.
6. Set a price cap on each API call; Strale refuses the call if the tool costs more.
7. Each answer names its source.
8. A record of each API call (input, answer, source and price) can be retrieved by transaction ID for 90 days.
9. Free tools to try without signing up.
10. Live coverage by country for company data, with the source, price and last test date for each register.

**Where they go:**

- All ten are summarised on Pricing and Docs.
- Lines 1, 2, 4 and 9 appear as one line at the top of the catalogue (Tools §1).
- Lines 5–7 appear on every tool page.
- Line 10 goes on the company-data hub.

The Security page carries two more supporting facts, which are not marketing lines: you can ask for a person to review a result, and call content is cleared after 90 days.

## Where each line appears, and what supports it

| Line | Page and section | Evidence | Claim status |
| --- | --- | --- | --- |
| L1.1 | Home §1 headline; About | Strale holds the vendor relationships, so the customer has no account with Dilisense, Serper, Browserless and the rest (facts `static.vendors`); one `/v1/do` route dispatches every tool | Plain description. Do not say "no accounts at all": the API-key route needs a Strale account. |
| L1.2 | Home §1 supporting line | Same key, wallet and MCP connection reach every visible tool (`/v1/capabilities`); new tools appear in the catalogue without client changes | Plain description. Each tool still has its own inputs: never say "identical schema" or "no code changes". |
| L1.3 | Home §2; Pricing §1 | Pay-per-call wallet and x402 model; no subscription product exists | Plain description. Not "no minimum": a wallet top-up is at least €10 (`MIN_TOPUP_CENTS`, `apps/api/src/routes/wallet.ts:11`). |
| L1.4 | Home §2; Docs x402 | `apps/api/src/lib/x402-gateway.ts`; `/x402/catalog`; `/.well-known/x402.json` | `no-account-required-x402` is **needs_evidence**: true on x402 only. "Eligible tools" must sit next to it, because `all-x402-coverage` is **forbidden** (272 of 298 tools and 74 of 99 bundles today). |
| L2.1 | Home §3; use case "research agents" | `google-search` (via Serper), `serp-analyze`, `url-to-markdown` | Plain description. Never "we scrape" (`strale-operates-scrapers`): the search tools use a licensed search API, and page-to-text fetches one page per call. |
| L2.2 | Home §3; use case "reading documents" | `image-to-text`, `invoice-extract`, `receipt-categorize`, `pdf-extract` | Plain description. Fields vary by document. Keep the invoice example labelled until [PROOF-QUALIFICATION.md](PROOF-QUALIFICATION.md) closes. |
| L2.3 | Home §3; use case "checking data" | `email-validate`, `phone-validate`, `iban-validate`, `vat-validate` | `iban-proves-account-active` is **forbidden**, so say "IBAN format", never "account exists". Name VIES only where `vat-validate` runs (`full-vies-verification-implied` is forbidden). |
| L2.4 | Home §3 (the text, domain and code groups; data and crypto on Tools and Pricing); use case "SEO and web agents" | Text: `translate`, `summarize`, `sentiment-analyze`. Domains: `dns-lookup`, `ssl-check`, `whois-lookup`, `domain-reputation`, `company-tech-stack`, `seo-audit`. Code: `json-to-typescript`, `sql-generate`, `regex-explain`. Data: `csv-to-json`, `json-repair`, `deduplicate`. Crypto: `wallet-balance-lookup`, `ens-resolve`, `eth-address-validate` | Plain description. Name only tools visible at build time; the editorial file is checked against `/v1/capabilities`. |
| L2.5 | Home §5; hub §2; country pages | `/v1/capabilities` output schemas; facts `countries.company_data_active` (25: 19 in Europe, plus AU, BR, CA, JP, SG, US) | Count rendered live. Fields vary by country: AU returns state and postcode, not an address; SI has no status; directors appear for AT, CZ, DE, EE, ES, FR, GR, LV, NO, SK and UK. "Official records", not "national register": US is SEC filers (EDGAR), and ES, DE, BE and BR come through vendors that wrap the register. Country pages name the actual source. Name lookup works only in some countries. |
| L2.6 | Home §5; hub §3–4; use case "onboarding" | `sanctions-check`, `pep-check` (Dilisense; PEP coverage 230+ territories), `adverse-media-check` (Dilisense, Serper fallback); `beneficial-ownership-lookup` (UK), `gleif-l2-ubo-lookup`, `gleif-l2-children-lookup` | Plain description. "Where it is published" is required: ownership is the UK register plus LEI parent and subsidiary links, not general beneficial-owner access. Show the manifest limitations (for example, fuzzy name matches). Never "every list" or "complete". |
| L2.7 | Home §5; hub §5; `kyb-*` and `invoice-verify-*` pages | `/v1/solutions` steps; `risk-narrative-generate` is `ai_generated` | Label the summary AI-generated and "for a person to review" (DEC-20260428-B; Terms, human review). Never "decides", "approves" or "compliant". Avoid the invoice bundle's own "fraud detection" wording. Denmark bundles are blocked (proof gap 3). |
| L3.1 | Pricing §4; Tools §1 | `/v1/do` takes any `capability_slug` with one key; wallet ledger | Plain description. |
| L3.2 | Pricing §4; Tools §1; Docs x402 | as L1.4 | as L1.4 |
| L3.3 | Pricing §3 | Single tools: `apps/api/src/routes/x402-gateway-v2.settlement-order.test.ts`, DEC-14. Bundles: `apps/api/src/routes/solution-execute.ts` ("Full failure refunds the wallet. Partial success does NOT refund.") | `pay-per-successful-call` is **allowed** for single tools only; never use it unqualified next to bundled checks. |
| L3.4 | Tools §1; Docs §1 | `packages/mcp-server`, `sdk-typescript`, `sdk-python`; `node apps/api/scripts/check-framework-packages.mjs` passed for those four on 2026-10-23 | `framework-native-integration` is **needs_evidence**: list only packages that pass. Never pydantic-ai, google-adk or openai-agents. |
| L3.5 | Tool pages | `/v1/capabilities/:slug`; `/v1/public/ops/limitations/capabilities/:slug` (all 350 manifests carry `limitations`) | Plain description. |
| L3.6 | Tool pages; Docs §5 | `max_price_cents` is required on `/v1/do` with an API key (`do.ts`), and the call is refused above it (`lib/matching.ts`); hard limit €20 per request | Scoped to API calls: the cap is optional on the bundle route, and x402 has only the quoted price. |
| L3.7 | Tool pages; Home §4 | `provenance.source` and `fetched_at` from executors | `provenance-included` is **allowed, qualified**: only where the route returns it (proof gap 2). The source may be a vendor rather than the register (see L2.5). |
| L3.8 | Docs §6; Home §4 sample | `GET /v1/transactions/:id`; content cleared at 90 days (`CUSTOMER_CONTENT_COLUMNS`, `lib/customer-content.ts`) | **Proof gap 1.** API-key calls only: x402 responses carry no transaction ID. |
| L3.9 | Home §8; Tools filter; Pricing §5 | facts `free_tier_slugs`; IP limit in `do.ts` | Plain description; the free count is rendered live. |
| L3.10 | Company data hub §2 | `/v1/public/ops/trust/capabilities/batch` (`tested`, `last_tested_at`, `pass_rate`) is the only source for test status | `/v1/capabilities` also has a `last_tested_at`, which disagrees: for example, CZ, EE, FI and NO show 2026-08-12 there but "not tested" in the trust batch. Never mix the two on one page. Show untested registers as untested. On 2026-10-23, six of 25 had no recorded test (CZ, EE, FI, FR, NO, US), and three were below 100% (DE 83, LV 83, SK 60). Never a badge or a score; never "every tool tested" (forbidden). |
| Security: review | Security §7 | `POST /v1/transactions/:id/dispute`, a GDPR Art. 22(3) intake reviewed by a person | Promise review, not correction or a response time. API-key calls only. |
| Security: retention | Security §2 | facts `pii_retention_days` (90); `CUSTOMER_CONTENT_COLUMNS` clears input, output, error and audit body | Value rendered live. Before publishing, confirm in production that the older backlog noted in `apps/api/src/lib/data-retention.ts` has drained. |

## Proof gaps to close before the dependent lines ship

1. **Record retrieval (L3.8).** Complete the bounded authenticated call and own-record retrieval described in [PROOF-QUALIFICATION.md](PROOF-QUALIFICATION.md). Until then, Home §4 shows a labelled example and L3.8 is not published.
2. **Source on every route (L3.7).** Fresh x402 tool responses carry provenance in `_meta`. Cached x402 replays and the bundle paths do not establish the same. Either close the gap or scope the line to API calls.
3. **Denmark bundles (L2.7, hub).** `kyb-essentials-dk` and its siblings claim to confirm the company "in the official registry", but they have no registry step. Correct the descriptions before the hub lists them (proposed as a separate task).
4. **"Official records" wording (L2.5).** Add a `needs_evidence` row to `claims.yaml` for "official records" and "official-source", with each country's `data_source` as evidence.

## Lines deliberately not used

- "Trust layer", "verified data", "independently tested": the retired framing, contradicted by actual test coverage.
- "Every tool continuously tested": forbidden.
- "Most popular" and "what agents buy most": forbidden, and ruled out by DEC-20261023-B.
- Customer counts and "trusted by": forbidden.
- Speed figures: forbidden.
- "Compliant", "AMLR-ready": regulator-facing, Petter's call.
- "Europe's …", or any framing that limits the flagship to one region: ruled out by DEC-20261023-B.
