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
portfolio, market it, then judge tools on what sells.

**Authority.** The charter lists new capabilities as `approval_required`.
**Petter's approval of this plan is the approval for the capabilities listed
in it.** Items that also need a separate decision from him are marked
**needs Petter** and collected at the end. These are items that:
- bind the company (accounts, terms, contracts);
- spend beyond the weekly envelope or add a recurring cost;
- price outside the €0.02–€1.00 band;
- are regulator-readable claims;
- are DEC-20260428-B-grade builds;
- deactivate a revenue earner.

Everything else is Claude's to carry out.

## How the tools were chosen

Strale's own demand signal is too thin to steer by, so every addition here
is backed by at least one signal from outside Strale's traffic:

- **Agent marketplaces.** Paid calls in Coinbase's x402 Bazaar: Turnkey's
  top-100 analysis (2026-09-17) and an independent crawl of all 31,620
  listings (2026-10-13). Also Apify Store usage, MCP server downloads, and
  Delegate's public catalogue.
- **Agent use cases.** What production agents are built to do (LangChain,
  Menlo, McKinsey and Gartner reports 2025–26; funded vertical agents such as
  AP, KYB and procurement agents), and the external tools each one calls.
- **The Delegate comparison** (PR #705), for capability and product gaps.
- **Coverage gaps** in Strale's flagship category, checked against the
  official sources that exist worldwide.

Three filters apply to every candidate:
1. **Not native to the model platforms.** Anthropic and OpenAI ship web
   search, web fetch, PDF reading, code execution and vision OCR.
2. **Lawful under the sourcing rules in force today:** DEC-20260428-A and
   DEC-20260813-A. Items that become possible only if DQ-35 is adopted are
   marked as conditional.
3. **Shippable by a small team with agents maintaining the connections.**

The market and positioning research is in the private context archive
(`archive/sessions/2026-10-23-positioning/`). Public sources are listed under
[Sources](#sources).

## What the market signals say, in short

- **Web search and content retrieval are the largest paid category.** They
  took 42% of calls among the top 100 Bazaar listings (Turnkey). They are
  bundled by the model labs and typically priced around $0.01 or less, near
  or below Strale's €0.02 floor. That is volume without margin.
- **Crypto market data and trading signals are second (23%).** Turnkey
  attributes this to a few operators running high-frequency loops, and many
  listings are entertainment-grade signals. Left out of this plan, except the
  on-chain reads below.
- **People and company enrichment is 11%.** Turnkey does not split it, but
  its top services are mostly person enrichment and email finding, which is
  out of bounds. The lawful company slice has no funded agent-native seller.
- **On-chain reads (balances, ENS, transactions, gas) have the most distinct
  payers per listing** in the full-Bazaar crawl. That is the broadest real
  buyer base.
- **Production agents need deterministic, auditable checks.** AP, KYB,
  procurement and supplier-onboarding agents are among the most-funded agent
  categories. They need company verification, tax-ID checks, bank checks,
  sanctions and FX: Strale's flagship.
- **Coding agents are the largest single segment of departmental AI spend**
  (Menlo). They call package metadata, vulnerability lookups and library
  documentation.
- **Most x402 listings have one or two payers** (77% in the crawl). Being
  listed does not create demand, which is why the marketing step matters.

## Phase 0: repair what is broken (week 1)

Live defects, fixed first because marketing would send buyers straight into
them.

1. **The Danish bundles.** `kyb-essentials-dk`, `kyb-complete-dk`,
   `invoice-verify-dk` and `kyc-denmark` are active, and `kyc-denmark` is
   sold over x402. Each has `danish-company-data` as its first step. That
   lookup has been quarantined (hidden) since 2026-08-12. Over the last 90
   days it completed none of its calls; every call it received failed.
   None of the four bundles had an external customer call in that window, so
   none is a revenue earner.
   - *The fix:* delist the four bundles until Denmark is restored (item 1.1).
   - *Authority:* this follows the quality-floor policy (DEC-20260812-A),
     which delists on failure, and the charter's delegated authority to
     delist non-earners.
2. **Public claims that over-promise.** Narrow the copy where a capability
   claims more than it serves. Narrowing is Claude's authority; stronger
   replacement claims are not.
   - *Wallet and gas tools:* `wallet-balance-lookup`,
     `wallet-transactions-lookup`, `wallet-age-check` and `gas-price-check`
     describe chains beyond Ethereum. The connected Alchemy app serves only
     Ethereum mainnet today.
   - *Job search:* `job-board-search` lists France and the US. Verify on
     Railway whether their keys are set; if not, narrow it to what is served.
3. **The sanctions source claim.** `sanctions-check` and related methodology
   copy still name "UK OFSI". The OFSI Consolidated List closed on
   2026-01-28; the FCDO UK Sanctions List replaced it. The affected surfaces:
   - the `sanctions-check` manifest;
   - `web3-assurance` methodology and explanation;
   - `seed-limitations.ts`;
   - `dilisense-sources.ts`.

   Claude drafts the correction from Dilisense's public source list.
   **Needs Petter:** compliance and methodology claims are his to publish.
4. **`kyb-complete-se`** is inactive because it includes the deactivated
   `credit-report-summary`. Remove that step and reactivate the bundle, and
   make sure its x402 flag matches its state.
5. **Live tools and bundles not sold over x402.** The AT, GR, HR, IE and SG
   bundles, plus `cz-unreliable-vat-payer`, `no-bankruptcy-check` and
   `fr-bodacc-lookup`, are live but not on x402. Switch x402 on where nothing
   blocks it.
6. **State drift.** `website-to-company`, `officer-search` and
   `us-court-search` are inactive but missing from the deactivated list. Make
   code, manifests and the database agree.

## Phase 1: the flagship, official-source company and compliance data worldwide (weeks 1–6)

### 1A. Coverage

| # | Addition | Source | Effort | Notes |
|---|---|---|---|---|
| 1.1 | **Restore Denmark** | Official CVR system-to-system feed | S | Free; about 3 weeks to approve. **Needs Petter:** application and signed declaration. |
| 1.2 | **Nine EU countries at once:** NL, IT, PT, HU, BG, RO, MT, LU, CY | Openapi.com (licensed aggregator) | S once signed | **Needs Petter:** countersign the resale addendum (Openapi case 151296). |
| 1.3 | **Netherlands, official** | KVK API | S/M | €6.40/month plus €0.02/query. **Not yet established as a route:** KVK partner status is closed to foreign EU entities (DEC-20260512-A), so whether a plain subscription permits resale must be confirmed first. **Needs Petter:** the account. |
| 1.4 | **India** | data.gov.in MCA company master data | S | 3.6M companies, no officers. **Needs Petter:** register the key. |
| 1.5 | **United States, all 50 states** | Cobalt Intelligence (integrated, not live) | M | Today the US lookup covers SEC filers only. **Needs Petter:** Cobalt is a subscription with no key set (DQ-30 left activation to him), and its 200-cent price is outside the band. |
| 1.6 | **Lithuania** | Official daily bulk extracts | M | The live portal rejects our production host. Ingesting the bulk makes Strale responsible for the data: a DEC-20260428-B-grade build. **Needs Petter.** |
| 1.7 | **Korea, Taiwan, Israel, New Zealand** | Official APIs: NTS business status, GCIS, data.gov.il, NZBN | S each | **Needs Petter:** service keys for data.go.kr and NZBN. |
| 1.8 | **Belgium and Brazil from the official source** | KBO open bulk; Receita CNPJ bulk | L each | Replaces third-party wrappers. Bulk ingest is a DEC-20260428-B-grade build. **Needs Petter.** |
| 1.9 | **Romania, Bulgaria, Cyprus from open data** | data.gov.ro, data.egov.bg, DRCOR | M–L each | Licences to confirm. Bulk ingest is a DEC-20260428-B-grade build. **Needs Petter.** |
| 1.10 | **Saudi Arabia** | Wathq (paid per call) | M | **Needs Petter:** account and per-call cost. |

### 1B. Identity, tax and status checks

These are the checks AP, KYB and procurement agents call on every
counterparty.

| # | Addition | Source | Effort |
|---|---|---|---|
| 1.11 | UK VAT number check | HMRC VAT API v2 (VIES has not covered GB since 2021) | S/M. **Needs Petter:** HMRC developer app |
| 1.12 | Swiss UID / VAT check | Federal UID web service | S |
| 1.13 | Japan qualified-invoice-issuer (T-number) check; move the Japanese company lookup off its current browser-driven route to the official corporate-number API | NTA Web-API | S/M. **Needs Petter:** NTA application ID |
| 1.14 | Korea business status and tax type | data.go.kr NTS API | S (key under 1.7) |
| 1.15 | Extend `eori-validate` to GB EORI numbers | HMRC EORI API | S (HMRC app under 1.11) |
| 1.16 | Mexico fake-invoice list (SAT 69-B) check by RFC | Official SAT list, which includes natural persons | M. Holding a regulatory list is a DEC-20260428-B-grade build. **Needs Petter** |
| 1.17 | Cross-border entity resolution: any identifier to the canonical entity | GLEIF LEI-to-register mapping, BIC/ISIN, registries, VIES | S/M |
| 1.18 | Insolvency status: promote `uk-gazette-notice-search`; put `no-bankruptcy-check` and `fr-bodacc-lookup` on x402 (Phase 0) | UK Gazette, BODACC, Brønnøysund | S |
| 1.19 | Debarment check | SAM.gov exclusions, World Bank list | L. Holding these lists is a DEC-20260428-B-grade build. **Needs Petter:** the build, and a SAM.gov account |
| 1.20 | Beneficial ownership beyond the UK | Estonia and Latvia open owner data (Estonia's status to confirm) | M–L. If ingested, a DEC-20260428-B-grade build. **Needs Petter** |

### 1C. Outcome products

1. **"Is this company still alive?"** (€0.05–0.10). Registry status across 30+
   registries plus insolvency notices. A data lookup, not a compliance
   product. Inside the band; Claude's to build.
2. **"Resolve this entity across borders"** (about €0.15). Any identifier in,
   the canonical entity with all its identifiers out. A data lookup; Claude's.
3. **"Invoice counterparty check"** (about €0.75). Tax ID valid, company
   active in its registry, and screening checks found (or not found) against
   the sanctions lists.
   - *Output:* the evidence per check. It returns no pass, review or fail
     verdict, under DEC-20260428-B's "screening checks found" framing.
   - *Why it is not a compliance-only product:* it serves AP and invoicing
     agents, the library's general buyers, as the existing `invoice-verify`
     family already does.
   - *Verdict wording:* adding a verdict would be a GDPR Art. 22
     `risk_synthesis` output and a regulator-readable claim. **Needs Petter.**
4. **"Supplier onboarding check"** (about €2.00). Registry identity, status
   and officers; ownership where the law allows; LEI; sanctions, PEP and
   debarment screening; insolvency notices.
   - *The compliance gate:* this one is aimed at procurement and compliance
     buyers, so DEC-20261023-B's gate applies. It needs customer discovery
     first.
   - *Price:* €2.00 is above the band.
   - **Needs Petter:** both.

### 1D. Later: Strale-built sanctions screening on the official lists

The lists: OFAC, EU, UN, FCDO, SECO, Canada and DFAT. This gives per-list
provenance and ends the single-vendor dependency on Dilisense, which
reverses the single-vendor choice of DEC-20260429-A. It is a full
DEC-20260428-B build. **Needs Petter.** It covers wallet-address screening
(formerly 2.2) too: an address screen against the sanctions lists' address
fields is part of the same build.

## Phase 2: breadth where agents pay and labs do not (weeks 3–10)

Strale already has many of the obvious utilities:
- ENS, gas prices and wallet balances;
- CVE and OSV vulnerability lookups, package licences, npm and PyPI metadata;
- holidays, time zones, FX and VAT rates;
- World Bank indicators;
- phone and address validation, PII redaction;
- image-to-text, PDF extraction and structured extraction.

The additions below are real gaps.

| # | Addition | Signal | Route | Effort |
|---|---|---|---|---|
| 2.1 | **Multi-chain on-chain reads:** transaction by hash, contract classification, and the existing wallet and gas tools on more chains | Broadest payer base on x402 | Enable more networks on the existing Alchemy app; the chain code exists. **Needs Petter:** the account change | S once enabled |
| 2.3 | **Audio transcription** | Delegate's lead capability gap | Licensed speech-to-text API whose terms allow resale. **Needs Petter:** vendor account. Transcripts are personal data under 90-day persistence, so its PII classification is `approval_required` | S/M, needs async (2.11) |
| 2.4 | **Bulk OCR for many-page scanned documents** | Delegate gap; same buyers as invoice extraction | A dedicated OCR engine priced per page. Differs from `image-to-text`, which is one image through a vision model at per-call cost; this is volume at per-page cost. **Needs Petter:** vendor account if not self-hosted | S/M |
| 2.5 | **Places / local business search** | Local-business data is among the most used scraping tasks in public marketplaces | Open places datasets (Overture Maps, Foursquare open places), licences to confirm. Never Google Maps scraping | M |
| 2.6 | **Cited web research** (answer from the web with a source per claim) | "Research" is a top agent job | **Conditional on DQ-35:** the existing search and fetch tools it would compose do not meet DEC-20260428-A as written | S once DQ-35 is decided |
| 2.7 | **Library documentation from package registries** | Coding agents are the largest segment | npm and PyPI registry APIs only (README, versions, docs links). Reading documentation sites is conditional on DQ-35 | S |
| 2.9 | **More public job-search APIs** | Recruiting and research agents | National public employment services. **Needs Petter:** keys where required | S each |
| 2.10 | **Eurostat and national statistics offices** | Government-statistics tools are a recurring MCP category | Official open APIs, alongside the existing World Bank indicators | S |
| 2.11 | **Async jobs with file output** | Needed for 2.3 and 2.4 | Platform work | M |
| 2.12 | **Secure randomness** | Small paid demand on x402 | Computed | S |

(2.2 merged into 1D; 2.8 dropped because `cve-lookup` and the package tools
already cover it.)

**Price floor (needs Petter).** Commodity categories (web search, page
fetch, on-chain reads) often sell at a cent or less, below Strale's €0.02
floor. Keep the existing tools, but don't invest in competing on them unless
Petter allows a sub-€0.02 commodity tier.

## Phase 3: product features that make the library usable

These come from the Delegate analysis (PR #705) and fit Strale's
keyless-first model.

1. **Serve `SKILL.md` at a stable public URL**, generated from live facts. The
   current file is stale: it still says "250+ quality-scored" and lists a
   deactivated tool.
2. **Several API keys per account, each with its own spending limit.**
3. **An agent-safe CLI:** JSON output, errors as JSON, a mandatory price cap,
   no prompts.
4. **Error messages that name the fix.**
5. **Batch calls** (many inputs, one order and one payment).

## What not to build

| Category | Reason |
|---|---|
| Social-platform search and data (X, Reddit, TikTok, Instagram, Facebook, LinkedIn, YouTube content) | Out of bounds under the current rule and DQ-35. |
| People enrichment, email finding, contact data | Personal-data harvesting; GDPR exposure. |
| Google Maps, Google Trends, Amazon, Zillow, Indeed scraping | Only through an official API or a vendor with resale rights. |
| Crypto trading signals and token "verdicts" | High-frequency demand from a few operators; entertainment-grade. |
| Translation, inference resale, browser automation | Native in the model platforms. |
| A third-party provider marketplace | A second company. Revisit only if wholesale demand appears. |

## Sequence

| Weeks | Work |
|---|---|
| 1 | Phase 0, with the sanctions correction drafted for Petter. Petter's account and contract actions started. |
| 1–6 | Claude-authority Phase 1 items (1.12, 1.17, 1.18, outcome products 1 and 2), then the Petter-gated items as each is approved. Japanese bundles only after 1.13. |
| 3–10 | Phase 2 items as approvals land; Phase 3 features 1–5. |
| Then | Marketing launch on the new site. After it, judge tools on distinct payers, repeat use and revenue against upkeep, and drop what doesn't earn it. |

Each new capability goes through the onboarding pipeline (DEC-20260320-B),
with a vendor-terms check recorded before any executor is written.

## Needs Petter

| Decision | Items |
|---|---|
| Approve this plan (approval for the capabilities in it) | All |
| Publish the corrected sanctions-source copy | 0.3 |
| Countersign the Openapi.com resale addendum | 1.2 |
| Apply for the Danish CVR feed | 1.1 |
| Accounts and keys: KVK (after resale terms are confirmed), data.gov.in, data.go.kr, NZBN, HMRC (VAT and EORI), NTA, Wathq, SAM.gov, the Alchemy network switch-on, speech-to-text and OCR vendors, national job APIs | 1.3, 1.4, 1.7, 1.10, 1.11, 1.13, 1.15, 1.19, 2.1, 2.3, 2.4, 2.9 |
| Cobalt subscription and its above-band price | 1.5 |
| DEC-20260428-B-grade builds: bulk registry ingests, the SAT 69-B list, debarment lists, ownership ingests, own sanctions screening | 1.6, 1.8, 1.9, 1.16, 1.19, 1.20, 1D |
| Supplier onboarding check: customer discovery first, and its €2.00 price | 1C.4 |
| Any verdict wording in the invoice check | 1C.3 |
| PII classification for audio transcripts | 2.3 |
| KYB bundle prices for the new BR, JP, CZ, SK, SI, EE and LV bundles (€1.50 and €2.50, as for the existing families), unless the existing family pricing already covers them | 0.5 (bundles) |
| A sub-€0.02 commodity tier | Phase 2 |
| DQ-35, the data-access rule | 2.6, 2.7 (documentation sites) |

## Sources

All accessed 2026-10-23.
- **x402 Bazaar:**
  - [Turnkey, top-100 Bazaar listings, 2026-09-17](https://www.turnkey.com/blog/agents-buying-coinbases-x402-bazaar-discovery-layer)
  - [Low Key Builds, crawl of 31,620 listings, 2026-10-13](https://dev.to/lowkeybuilds/i-crawled-all-31620-x402-bazaar-listings-most-have-one-payer-and-boring-chain-reads-win-5c73)
- **Agent use cases:**
  - [LangChain State of Agent Engineering](https://langchain.com/state-of-agent-engineering)
  - [Menlo Ventures, 2025](https://menlovc.com/perspective/2025-the-state-of-generative-ai-in-the-enterprise/)
  - [McKinsey State of AI 2025](https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai-2025)
- **Model-platform built-in tools:**
  - [Anthropic tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)
  - [OpenAI tools](https://developers.openai.com/api/docs/guides/tools.md)
- **Official sources:**
  - [UK Sanctions List (FCDO)](https://www.gov.uk/government/publications/the-uk-sanctions-list)
  - [OFAC Sanctions List Service](https://ofac.treasury.gov/sanctions-list-service)
  - [KVK API](https://developers.kvk.nl/support/faq)
  - [Korea NTS business status API](https://www.data.go.kr/data/15081808/openapi.do)
  - [GLEIF data terms](https://www.gleif.org/en/meta/lei-data-terms-of-use)
- **Competitor gaps:** the Delegate analysis, PR #705.
- **Strale's current state:** production database (read-only) and the public
  API, 2026-10-23.
