---
doc_type: plan
authority_scope: none
decision: DEC-20261023-B
date: 2026-10-23
status: proposed
---

# Portfolio plan: what to add, fix and leave out before marketing

Proposed plan for Petter's review. It carries out
[DEC-20261023-B](2026-10-23-positioning-adoption.md): build an attractive
portfolio, market it, then judge tools on what sells. This plan is Claude's
operating approach under the charter; the items marked **needs Petter** are
the ones that bind the company or spend beyond the envelope.

## How the tools were chosen

Strale's own demand signal is too thin to steer by, so every addition here
is backed by at least one signal from outside Strale's traffic:

- **Agent marketplaces.** Paid calls in Coinbase's x402 Bazaar: Turnkey's
  top-100 analysis (2026-09-17) and independent crawls of 31–35k listings in
  October 2026. Also the Apify Store's most-used Actors, MCP server downloads,
  and Delegate's catalogue (dlgt.io).
- **Agent use cases.** What production agents are built to do (LangChain,
  Menlo, McKinsey and Gartner 2025–26 reports; funded vertical agents such as
  AP, KYB and procurement agents), and the external tools each one calls.
- **The Delegate comparison** (PR #705), for capability and product gaps.
- **Coverage gaps** in Strale's own flagship category, checked against the
  official sources that exist worldwide.

Three filters apply to every candidate:
1. **Not native to the model platforms.** Anthropic and OpenAI ship web
   search, web fetch, PDF reading, code execution and vision OCR, so selling
   these per call is weak.
2. **Lawful under the sourcing rules in force.** This means DEC-20260428-A and
   DEC-20260813-A today, or DQ-35's replacement if adopted. Social-platform
   data and people-profile data are out under either.
3. **Shippable by a small team with agents maintaining the connections.**

The market and positioning research is in the private context archive
(`archive/sessions/2026-10-23-positioning/`). The public sources this plan
leans on most are listed under [Sources](#sources).

## What the market signals say, in short

- **Web search and page-to-text are the biggest paid categories.** They took
  about 42% of calls among the top 100 Bazaar listings. They are also bundled
  by the model labs and sold at $0.001–0.01 a call, below Strale's €0.02
  floor. Volume, but no margin.
- **On-chain reads have the broadest real buyer base on x402.** Balances,
  ENS, transaction lookups and gas prices have the most distinct payers per
  listing, at $0.001–0.008 a call.
- **Company data is valuable but mostly sold as people data.** The
  "enrichment" category (11% of top-100 calls) is mostly people data, which
  is out of bounds. The lawful company slice has no funded agent-native
  seller.
- **Production agents need deterministic, auditable checks.** AP, KYB,
  procurement and supplier-onboarding agents are among the most-funded agent
  categories in 2025–26. They need company verification, tax-ID checks, bank
  checks, sanctions and FX: exactly Strale's flagship.
- **Coding agents are the largest single segment of agent spend.** They call
  package metadata, vulnerability lookups and versioned library
  documentation.
- **Most x402 listings have one or two payers.** Being listed does not create
  demand. That is why the marketing step matters.

## Phase 0: repair what is broken (week 1, Claude)

These are live defects. They come first because marketing would send buyers
straight into them.

1. **Danish bundles that always fail.** `kyb-essentials-dk`,
   `kyb-complete-dk`, `invoice-verify-dk` and `kyc-denmark` are active, but
   their first step, `danish-company-data`, has been quarantined since
   2026-08-12. Delist the four bundles until Denmark is restored (item 1.1).
   Delisting where policy already determines the answer is within delegated
   authority.
2. **A stale public sanctions-source claim.** `sanctions-check` still names
   "UK OFSI". The OFSI Consolidated List closed on 2026-01-28; the FCDO UK
   Sanctions List replaced it. Confirm what Dilisense uses now and correct the
   manifest and any public copy.
3. **`kyb-complete-se`.** Inactive, because it includes the deactivated
   `credit-report-summary`, yet still flagged for x402. Remove the step,
   reactivate the bundle and fix the flag.
4. **Live bundles not sold over x402.** The AT, GR, HR, IE and SG bundles are
   active but not on x402, and neither is `cz-unreliable-vat-payer`. Switch
   x402 on where nothing blocks it.
5. **Registry lookups with no bundle.** BR, JP, CZ, SK, SI, EE and LV have
   working registry lookups but no KYB bundle. Add the bundles.
6. **State drift.** `website-to-company`, `officer-search` and
   `us-court-search` are inactive in the database but missing from the
   deactivated list. Several manifest prices differ from the database. Make
   code, manifests and database agree.

## Phase 1: the flagship, official-source company and compliance data worldwide (weeks 1–6)

### 1A. Coverage

| # | Addition | Source | Effort | Notes |
|---|---|---|---|---|
| 1.1 | **Restore Denmark** | Official CVR system-to-system feed | S | Free. Application and signed declaration, about 3 weeks. **Needs Petter:** the application binds Moonlighter AB. |
| 1.2 | **Nine EU countries at once:** NL, IT, PT, HU, BG, RO, MT, LU, CY | Openapi.com (licensed aggregator) | S once signed | Blocked on the resale addendum (Openapi case 151296). **Needs Petter:** countersign. |
| 1.3 | **Netherlands, official** | KVK API | S/M | €6.40/month plus €0.02/query. Official source, independent of 1.2. **Needs Petter:** the account. |
| 1.4 | **India** | data.gov.in MCA company master data | S | 3.6M companies, no officers. **Needs Petter:** register the free key. |
| 1.5 | **United States, all 50 states** | Cobalt Intelligence (already integrated) | M | Today the US lookup covers SEC filers only. Finish validation and promote it. |
| 1.6 | **Lithuania** | Official daily bulk extracts | S/M | The live portal rejects our production host; ingest the bulk instead. |
| 1.7 | **Korea, Taiwan, Israel, New Zealand** | Official free APIs (NTS business status, GCIS, data.gov.il, NZBN) | S each | Cheap global breadth. |
| 1.8 | **Belgium and Brazil from the official source** | KBO open bulk; Receita CNPJ bulk | M each | Replaces third-party wrappers with the official source. |
| 1.9 | **Romania, Bulgaria, Cyprus from open data** | data.gov.ro, data.egov.bg, DRCOR | M each | Reduces dependence on Openapi. Licences to be confirmed. |
| 1.10 | **Saudi Arabia** | Wathq (paid per call) | M | A G20 economy with no open alternative. Inside the €50/week envelope at low volume. **Needs Petter:** the account. |

### 1B. Identity, tax and status checks

These are the checks AP, KYB and procurement agents call on every
counterparty.

| # | Addition | Source | Effort |
|---|---|---|---|
| 1.11 | UK VAT number check | HMRC VAT API v2 (VIES has not covered GB since 2021) | S/M. **Needs Petter:** HMRC developer app approval |
| 1.12 | Swiss UID / VAT check | Federal UID web service | S |
| 1.13 | Japan qualified-invoice-issuer (T-number) check; move the Japanese lookup to the official corporate-number API | NTA Web-API | S/M |
| 1.14 | Korea business status (active, suspended, closed) and tax type | data.go.kr NTS API | S |
| 1.15 | UK EORI check | HMRC EORI API | S |
| 1.16 | Mexico fake-invoice list (SAT 69-B) check by RFC | Official SAT CSV, with a freshness guard | S |
| 1.17 | Cross-border entity resolution: any identifier to the canonical entity | GLEIF LEI-to-register mapping, BIC/ISIN, registries, VIES | S/M |
| 1.18 | Insolvency status: promote `uk-gazette-notice-search`; put `no-bankruptcy-check` and `fr-bodacc-lookup` on x402 | UK Gazette, BODACC, Brønnøysund | S |
| 1.19 | Debarment check by identifier | SAM.gov exclusions extract, World Bank list | M. Name matching triggers the DEC-20260428-B bar; exact identifiers do not |
| 1.20 | Beneficial ownership beyond the UK | Estonia and Latvia open owner data (Estonia's status to confirm) | M |

### 1C. Outcome products

Per-outcome prices, inside the €0.02–€1.00 band for single checks. Bundles
above €1.00 follow the existing solution pricing, as KYB Complete does.

1. **"Can I pay this invoice?"** (about €0.75). Tax ID valid (VIES, HMRC,
   UID, T-number, NTS), not on the 69-B list, company active in the registry,
   payee name matches the bank where a confirmation-of-payee check exists,
   sanctions clear. Returns pass, review or fail, with evidence per check.
2. **"Supplier onboarding pass"** (about €2.00). Registry identity, status and
   officers; ownership where the law allows; LEI; sanctions, PEP and
   debarment; insolvency notices.
3. **"Is this company still alive?"** (€0.05–0.10). Status across 30+
   registries plus insolvency notices. Later also sold as monitoring.
4. **"Resolve this entity across borders"** (about €0.15). Any identifier in,
   the canonical entity with all its identifiers out.

### 1D. Later

**Strale-built sanctions screening on the official lists** (OFAC, EU, UN,
FCDO, SECO, Canada, DFAT). It gives per-list provenance and ends the
single-vendor dependency on Dilisense. It is large work and triggers the full
DEC-20260428-B engineering bar, so it starts only after Phase 1 coverage is
in place.

## Phase 2: breadth where agents pay and labs do not (weeks 3–10)

Strale already has many of the obvious utilities: ENS, gas prices, wallet
balances, CVE lookup, npm and PyPI metadata, holidays, time zones, FX, VAT
rates, phone and address validation, PII redaction, PDF extraction and
structured extraction. The additions below are real gaps.

| # | Addition | Signal | Route | Effort |
|---|---|---|---|---|
| 2.1 | **Multi-chain on-chain reads:** transaction by hash, contract classification, balances beyond Ethereum | Broadest payer base on x402 | Enable more networks on the existing Alchemy app (only Ethereum mainnet today), or a node vendor whose terms allow resale | S/M |
| 2.2 | **Wallet sanctions screen** (address on OFAC and other official lists) | Supply exists on x402; native in Coinbase's wallets | Official list address fields; versioned like 1D | M |
| 2.3 | **Audio transcription** | Delegate's lead gap; media is a top x402 earner | Licensed speech-to-text API whose terms allow resale | S/M, needs async (2.11) |
| 2.4 | **Bulk OCR for scanned documents** | Delegate gap; same buyers as invoice extraction | Dedicated OCR engine, priced per page | S/M |
| 2.5 | **Places / local business search** | Google Maps Scraper is Apify's #1 Actor | Open places datasets (Overture Maps, Foursquare open places), licences to confirm. Never Google Maps scraping | M |
| 2.6 | **Cited web research** (answer a question from the web, with a source per claim) | "Research" is a top agent job and a Delegate category | Composed from existing search, fetch and summarise tools, under the DEC-20260428-B rules for AI synthesis | S |
| 2.7 | **Versioned library documentation lookup** | Coding agents are the largest agent segment; Context7 has 2.6M npm downloads a month | Official package registries and documentation sites, per their terms | M |
| 2.8 | **Package vulnerability and licence lookup via OSV** | Coding agents | OSV.dev (free, open) | S |
| 2.9 | **More public job-search APIs** | Recruiting and research agents | More national public employment services | S each |
| 2.10 | **Macro statistics** (Eurostat, World Bank, national statistics offices) | Government-statistics MCP servers are among the most used on Smithery | Official open APIs | S |
| 2.11 | **Async jobs with file output** | Needed for 2.3 and 2.4 | Platform work | M |
| 2.12 | **Secure randomness** | Small paid demand on x402 | Computed | S |

**Price floor (needs Petter).** Commodity categories (web search, page
fetch) sell at $0.001–0.01 a call, below Strale's €0.02 floor. Keep the
existing tools; don't invest in competing on them unless Petter lowers the
floor for a commodity tier. Pricing outside the band is his call. A
sub-€0.02 tier would also suit on-chain reads (2.1), where working prices
cluster at $0.001–0.008.

## Phase 3: product features that make the library usable (in parallel)

These come from the Delegate analysis (PR #705) and fit Strale's
keyless-first model.

1. **Serve `SKILL.md` at a stable public URL**, generated from live facts. The
   current file is stale: it still says "250+ quality-scored" and lists a
   deactivated tool. One link lets any agent configure itself.
2. **Several API keys per account, each with its own spending limit.** This
   makes a human comfortable handing an agent a key.
3. **An agent-safe CLI:** JSON output, errors as JSON, a mandatory price cap,
   no prompts.
4. **Error messages that name the fix.**
5. **Batch calls** (many inputs, one order and one payment), e.g. 1,000 VAT
   numbers.

## What not to build

| Category | Reason |
|---|---|
| Social-platform search and data (X, Reddit, TikTok, Instagram, Facebook, LinkedIn, YouTube content) | Out of bounds under both the current rule and DQ-35. It is 7.5% of top-100 x402 calls and most of Delegate's headline catalogue. |
| People enrichment, email finding, contact data | Personal-data harvesting; GDPR exposure for a Swedish company. |
| Google Maps, Google Trends, Amazon, Zillow, Indeed scraping | Only through an official API or a vendor with resale rights. |
| Translation, inference resale, generic OCR of single images, browser automation | Native in the model platforms; weak to sell per call. |
| A third-party provider marketplace | A second company (provider KYB, payouts, disputes). Revisit only if wholesale demand appears. |

## Sequence and size

| Weeks | Work |
|---|---|
| 1 | Phase 0 repairs. Petter actions started: the DK CVR application, the Openapi addendum, accounts. |
| 1–6 | Phase 1A and 1B, about 25 capabilities. Then the four outcome products. |
| 3–10 | Phase 2, about 12 additions. Phase 3 features 1–4. |
| Then | Marketing launch on the new site. After it, judge tools on distinct payers, repeat use and revenue against maintenance cost. Drop what doesn't earn its upkeep. |

Each new capability goes through the onboarding pipeline (DEC-20260320-B), a
vendor-terms check recorded before any executor is written, and the quality
gates in force.

## Needs Petter

| Decision | Why it is his |
|---|---|
| Countersign the Openapi.com resale addendum | A contract binding Moonlighter AB. Unlocks nine EU countries. |
| Apply for the Danish CVR system-to-system feed | Signed declaration. |
| Accounts with KVK (NL), HMRC (UK VAT and EORI), Wathq (SA), data.gov.in (IN) | Accounts and terms binding the company. Small spend: KVK €6.40/month plus €0.02/query, Wathq per call. |
| Whether to allow a sub-€0.02 commodity tier | Pricing outside the band. |
| DQ-35, the data-access rule | Decides 2.5 routes and the page-reading tools. |

## Sources

All accessed 2026-10-23.
- **x402 Bazaar paid calls by category, top 100 listings:**
  [Turnkey, 2026-09-17](https://www.turnkey.com/blog/agents-buying-coinbases-x402-bazaar-discovery-layer).
  Payers per listing across the whole Bazaar:
  [Low Key Builds crawl, 2026-10-13](https://dev.to/lowkeybuilds/i-crawled-all-31620-x402-bazaar-listings-most-have-one-payer-and-boring-chain-reads-win-5c73).
- **Agent use cases in production:**
  - [LangChain State of Agent Engineering](https://langchain.com/state-of-agent-engineering)
  - [Menlo Ventures, 2025](https://menlovc.com/perspective/2025-the-state-of-generative-ai-in-the-enterprise/)
  - [McKinsey State of AI 2025](https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai-2025)
- **Model-platform built-in tools:**
  [Anthropic tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview),
  [OpenAI tools](https://developers.openai.com/api/docs/guides/tools.md).
- **Official sources:**
  - [UK Sanctions List (FCDO), replacing OFSI's list from 2026-01-28](https://www.gov.uk/government/publications/the-uk-sanctions-list)
  - [OFAC Sanctions List Service](https://ofac.treasury.gov/sanctions-list-service)
  - [KVK API pricing](https://developers.kvk.nl/support/faq)
  - [Korea NTS business status API](https://www.data.go.kr/data/15081808/openapi.do)
  - [GLEIF data terms](https://www.gleif.org/en/meta/lei-data-terms-of-use)
- **Competitor gaps:** the Delegate analysis, PR #705.
- **Strale's current coverage:** production database (read-only) and
  `GET /v1/platform/facts`, 2026-10-23.
