---
doc_type: research
type: competitor
topic: delegate-competitive-analysis
question: What does Delegate (dlgt.io) offer, build and say that Strale should add, copy or deliberately avoid, across capabilities, product and go-to-market?
date: "2026-10-23"
status: current
sources:
  - https://dlgt.io/
  - https://dlgt.io/catalog
  - https://github.com/Dlgt-io/dlgt
  - https://raw.githubusercontent.com/Dlgt-io/dlgt/main/README.md
  - https://raw.githubusercontent.com/Dlgt-io/dlgt/main/python/README.md
  - https://www.npmjs.com/package/@dlgt-io/sdk
  - https://www.npmjs.com/package/@dlgt-io/cli
  - https://pypi.org/project/dlgt-io/
  - https://nubela.co/blog/goodbye-proxycurl/
  - https://www.socialmediatoday.com/news/linkedin-wins-legal-case-data-scrapers-proxycurl/756101/
  - manifests/job-board-search.yaml
  - manifests/image-to-text.yaml
  - manifests/price-compare.yaml
  - manifests/google-search.yaml
  - apps/api/src/capabilities/auto-register.ts
  - apps/api/src/capabilities/social-profile-check.ts
  - apps/api/src/capabilities/youtube-summarize.ts
  - apps/api/src/capabilities/job-board-search.ts
  - apps/api/src/routes/do.ts
  - apps/api/src/db/schema.ts
  - packages/mcp-server/src/tools.ts
  - packages/skill/SKILL.md
  - docs/company/claims.yaml
  - archive/sessions/2026-09-05-decision-collision-resolution-DEC-20260420-H.md
---

# Delegate (dlgt.io): competitive analysis

This is research for the founder and for the parallel positioning session. It is evidence, not a decision. It changes no positioning document, decision record or code. Times are Swedish local time (CEST on 23 October 2026).

Delegate is a Strale customer. This analysis used public material only. It used no Strale transaction or telemetry data about Delegate, involved no account, sign-up, payment or contact, and includes no outreach.

## Evidence limits (read first)

**The session could not open Delegate's website.** This environment's network policy refused `dlgt.io` and `app.dlgt.io` (proxy `connect_rejected`, about 14:20 CEST on 23 October 2026). The web-fetch tool also failed to resolve both hosts. As a result, this session did **not** read these directly: the homepage, `/catalog`, `https://dlgt.io/SKILL.md`, `llms.txt`, `/docs`, the pricing page or `app.dlgt.io/api/docs`. `api.strale.io` was blocked too, so Strale's live `/v1/capabilities` and `/v1/solutions` could not be read. The Strale side uses the 350 manifests in `manifests/` at `origin/main` `f402d3d`, with the `DEACTIVATED` list in [auto-register.ts](../../apps/api/src/capabilities/auto-register.ts) applied.

What was read, and how far each source can be trusted:

| Evidence | How obtained | Trust level |
|---|---|---|
| `@dlgt-io/sdk` 0.1.1 and `@dlgt-io/cli` 0.1.1: README, type declarations, compiled JS | npm registry tarballs, downloaded 14:21 CEST on 23 October | **Observed.** Delegate's own published code. First published 6 October 2026; 0.1.1 is from 10 October 2026 (CEST). |
| `dlgt-io` 0.1.1 (Python): metadata and README | PyPI JSON API and GitHub raw, 14:22 CEST | **Observed.** (Note: the PyPI package `dlgt` is an unrelated AGPL project.) |
| `github.com/Dlgt-io/dlgt` README | raw.githubusercontent.com, 14:23 CEST | **Observed.** A mirror of Delegate's main codebase, MIT licence. |
| dlgt.io homepage and catalogue text | search-engine snippets (WebSearch tool), 14:25–14:40 CEST | **Indirect.** An index snapshot of unknown date. Its headline ("The autonomous marketplace for the machine economy", "private beta") differs from the commissioning session's reading, so it is probably an **older homepage version**. The catalogue snippet showed "Couldn't load the catalog", so no service list was indexed. |
| Homepage as of 23 October 2026: "Give your agent superpowers", 778 services, KYB, synthetic-job benchmarks, no paid placement, per-result pricing, eight role use cases | the commissioning session's own reading, passed on in this session's brief | **Observed by that session, not by this one.** Cited as such. |

The MCP tool names `search_services()` → `get_quote()` → `submit_order()` come from the brief. This session could not verify them, because `SKILL.md` was not reachable. The SDK confirms the same flow over REST (see below). Its only MCP call is `rate_services`.

**Consequence for question 1:** individual Delegate prices and the full 778-service list were **not observed**. The capability-gap table therefore ranks the named sources and categories that Delegate shows publicly, and marks the price column "not observed" wherever that is true. A re-run with `dlgt.io` and `app.dlgt.io` allowed in the environment's network settings would fill that column. It would also confirm the `SKILL.md` tool names.

## Executive summary

- **Delegate is a broker; Strale is the source.** Delegate is a marketplace of third-party "AI services". An agent searches it, gets a quote, hires a provider with a hard price cap and collects the result. The job runs asynchronously (`running`, `needs_input`, `delivered` or `failed` with a refund). Payment comes from one prepaid USD balance, and the agent rates the work afterwards. Strale sells its own capabilities at fixed prices, mostly over sub-second synchronous calls, and lets agents pay without an account via x402.
- **The visible catalogue overlap is narrow.** Delegate's catalogue emphasis is social and platform data: TikTok, Instagram, X, Threads, Facebook, YouTube, Reddit, LinkedIn, Telegram, Meta Ads, Google Maps, Google Trends, Trustpilot, eBay, Indeed and Baidu. Its other categories are web search, research, scraping, company data, jobs, audio, transcription/OCR and B2B prospecting. Most of the social and platform sources are **out of bounds for Strale to operate** (DEC-20260813-A, social-platform and Google rules), and Strale already removed its own Trustpilot, Glassdoor and Google scrapers for this reason. The clean, high-value gaps are **audio transcription, bulk OCR, local-business/places data, a cited web-research tool and wider job search**.
- **The product ideas are the more valuable part.** In order: per-key spending limits and multiple keys; a `SKILL.md` served at a stable URL so an agent sets itself up from one link; an agent-safe CLI; error messages that name the fix; optional post-call ratings; batch and async jobs for longer tools.
- **For go-to-market, borrow the structure, not the claims.** Use cases by role, a concrete worked agent session on the homepage, per-client one-line setup, and READMEs with diagrams all transfer well. "Benchmarked", "verified by independent check" and service-count headlines do not transfer without evidence and the claims register.
- **Do not copy the open marketplace model or the signup-first funnel.** Strale's paid usage comes mostly from keyless per-call payment. A marketplace of third-party scrapers would contradict the sourcing doctrine and add KYB, payout and dispute work that Strale has no need for today.

## What Delegate is: observed facts

| # | Fact | Source, access time |
|---|---|---|
| F1 | "Delegate is a marketplace of AI services your agents can hire: data lookups, research, scraping, media and more. Every service has a clear price, and everything is paid from one prepaid balance." | GitHub README, 14:23 CEST |
| F2 | Five access surfaces: TypeScript SDK, Python SDK, CLI, REST API (`https://app.dlgt.io/api`) and MCP server (`https://app.dlgt.io/api/mcp`, HTTP transport, one-line `claude mcp add --transport http delegate …`). One `dlg_` key works on all five. | GitHub README |
| F3 | Onboarding: sign up → create an API key at `app.dlgt.io/keys` → add funds at `app.dlgt.io/wallet`. "Some services are free, so you can try the flow first." The quickstart example (`noaa-us-point-forecast`) is free. | GitHub README, SDK README |
| F4 | Flow: `search(query, {limit, budgetUsd, tags})` → `service(idOrKey)` (input schema, offers, price, ratings) → `quote(service, {input})` (exact price, nothing reserved) → `hire(service, {input, maxPriceUsd})` → `result(id, {timeout})` → `rate(id, {quality, value})`. `budgetUsd` *ranks* cheaper services higher; it does not filter. | SDK `index.d.ts`, README |
| F5 | REST routes used by the SDK: `POST /v1/services/search`, `GET /v1/services/{id}`, `POST /v1/offers/{offer_version_id}/pricing-preview`, `POST /v1/orders`, `GET /v1/conversations/{id}`, `GET /v1/files/{id}`, `GET /v1/wallet/balance`. Rating exists only as the MCP tool `rate_services`. | SDK `dist/index.js` |
| F6 | Hiring "reserves the quoted price from your balance; nothing is ordered if the quote is above your cap, and a job that fails is refunded." Balances are in micros (1 USD = 1,000,000). | GitHub README, SDK README |
| F7 | A service has one or more **offers**: per-task or batch (`items` with `customId`), with a commercial `scope` derived from the input, and a `funding` kind such as `buyer_cap` with minimum and maximum caps. "Entitlement offers" (subscriptions) are not yet supported in the SDK. | SDK `dist/index.js` |
| F8 | Job states: `running`, `needs_input` (the provider asked a question, answered in the dashboard at `app.dlgt.io/activity/<id>`), `delivered` (content plus file artifacts via `delegate-file://`) and `failed` (with refund). Order status can be `awaiting_approval`. | SDK types, README |
| F9 | Error codes, each with a message saying what to do: `price_above_max`, `insufficient_escrow` (402), `api_key_budget_exceeded` (403, the key's spending limit is reached), `missing_scope`, `offer_selection`, `missing_api_key`. The SDK honours one `Retry-After` on 429. | SDK README |
| F10 | CLI built for coding agents: JSON output when piped, errors as JSON on stderr with exit code 1, `hire` always requires `--max-price`, no interactive prompts, key read from an env var or stdin. | CLI README |
| F11 | Zero runtime dependencies (TS SDK and Python SDK). All packages share one version. The README has an SVG "how it works" diagram and a job-state diagram. | npm metadata, READMEs |
| F12 | Homepage, index snapshot: 16 named sources, "every source is served by a benchmarked provider in the catalog; your agent picks one at run time and pays per job": TikTok, Instagram, X, Threads, Facebook (pages and groups), YouTube (video and search), Reddit, LinkedIn, Telegram, Meta Ads (ad research), Google Maps (local business), Google Trends (time series), Trustpilot, eBay (product search), Indeed (job search), Baidu (news). Works from "Claude, ChatGPT, Cursor, Codex" over MCP. | dlgt.io via search index |
| F13 | Homepage, index snapshot: a worked B2B prospecting session with a $30 budget, two providers quoted at **$0.35 and $0.28 per lead** (top one "92% verified emails"), "drafts held for your review, nothing sent", "verified by independent check · $17.50 paid on delivery". Transcription and OCR: "hours of audio or thousands of scanned pages … on GPU infrastructure with completeness guarantees". "Every provider passes KYC before it can list"; "rank is earned, never bought". | dlgt.io via search index |
| F14 | Catalogue categories: "social data, web search, research, scraping, company data, jobs, audio, and more". | dlgt.io/catalog via search index |
| F15 | Homepage on 23 October 2026: "Give your agent superpowers", 778 services behind one connection, picks the best service per job, provider KYB, synthetic-job benchmarks, no paid placement, per-result pricing, use cases for sales, founders, investors, marketing, recruiters, e-commerce, product and researchers. The SDK README banner alt text, published 10 October, already reads "Delegate: give your agent superpowers". | commissioning session's reading; SDK README |

**Inferred:** Delegate repositioned between the indexed snapshot ("autonomous marketplace for the machine economy", private beta, "any payment rail") and October 2026 ("superpowers", developer tools). Its rails today are a prepaid card-funded balance. No x402 or USDC path appears in the SDK or CLI.

## Q1: capability gaps, ranked

Ranking weighs (a) fit with Strale's actual demand pattern (agents paying per call, mostly via x402, for everyday utility tools), (b) doctrine status and (c) effort. "Strale today" comes from `manifests/` with deactivations applied. Vendor names in the route column are **candidates whose resale terms this session did not verify**. Under DEC-20260428-A and the 2026-09 vendor-terms audits recorded in `auto-register.ts`, each needs a terms check before any executor is written.

| Rank | Service (Delegate) | Delegate price | Demand rationale | Strale today | Strale route and feasibility | Doctrine status |
|---|---|---|---|---|---|---|
| 1 | **Audio transcription** (speech-to-text) | not observed | Generic utility that agents call all the time (meetings, podcasts, voice notes, video). Fits the x402 everyday-tool pattern. Delegate leads with it (F13). | None. `image-to-text` and `youtube-summarize` only. | Licensed STT API (candidates: Deepgram, AssemblyAI, a hosted Whisper endpoint) or self-hosted open-weights Whisper. Needs the async path (DEC-22) for long files and a file-input convention. Effort: low to medium. | **Clear.** The customer supplies the content; nothing is collected. |
| 2 | **Bulk OCR** (scanned PDFs, many pages) | not observed | Same buyers as `invoice-extract` and `pdf-extract`. Agents hit scanned documents constantly. | `image-to-text` and `pdf-extract` (Claude, per document, €0.05–€0.30). No cheap high-volume OCR. | Dedicated OCR model or API (candidates: an open-source OCR engine, a cloud document-OCR API). Price per page, possibly as a batch offer (see product idea 6). Effort: low to medium. | **Clear.** |
| 3 | **Local business / places search** (Google Maps) | not observed | Sales prospecting, e-commerce and local-SEO agents. A frequent agent request with no Strale answer. | None. `address-geocode` (Nominatim) only. | Ingest an open places dataset (candidates: Overture Maps Places, Foursquare Open Source Places; licences to verify) or use a Tier-2 SERP vendor's places endpoint (same class as the current Serper capabilities, see the caveat below). Effort: medium (ingest) or low (vendor). | Open-data route **clear**. Strale-operated Google Maps scraping **prohibited** (DEC-20260813-A, Google). |
| 4 | **Cited web research** ("answer this question from the web, with sources") | not observed | "Research" is a Delegate category and a top agent job. Strale has the parts but not the product. | `google-search`, `google-news-search`, `serp-analyze`, `url-to-markdown`, `summarize`. No single research tool. | Compose a solution from existing parts (search → fetch → Claude synthesis with per-claim citation), or resell a licensed answer/search API (candidates: Exa, Tavily, Perplexity Sonar; resale terms to check). Effort: low (solution) to medium. | **Clear.** The DEC-20260428-B AI-synthesis rules apply: per-claim source, no assertions beyond the sources. |
| 5 | **Job search** (Indeed) | not observed | Recruiters are one of Delegate's eight roles. Strale's coverage is three countries. | `job-board-search`: SE (JobTech), FR (France Travail), US (USAJOBS), all public employment services. | Add more public employment-service APIs (other EU national services) or a licensed job aggregator (candidate: Adzuna; terms to check). Effort: low per country. | Public APIs **clear**. Strale-operated Indeed scraping **prohibited**. |
| 6 | **B2B prospecting / lead lists with verified emails** | **$0.28–$0.35 per lead** (F13, older homepage) | Sales comes first on Delegate's role list. Highest price point observed. | `email-validate`, `email-pattern-discover`, `domain-contact-extract`. `email-finder` shelved 2026-08-09 for lack of a lawful evidence corpus. | Licensed person-data vendor only. This is personal data about named people: GDPR Art. 14 notice duties and legitimate-interest analysis apply to a Swedish company reselling it. Effort: medium plus legal. | **Needs founder decision.** DEC-20260428-A Tier 2 allows vendor data only when the underlying data is public record by statute, which contact databases are not. |
| 7 | **Review data** (Trustpilot) | not observed | E-commerce and vendor-diligence agents. | `trustpilot-score` deactivated (DEC-20260427-H-2: ToS forbids automated access). | Trustpilot's own licensed API only (licence scope to check). Effort: low once licensed. | Scraping **prohibited**. Licensed route **open, founder-gated** (a vendor contract binds Moonlighter AB). |
| 8 | **YouTube video and search** | not observed | Marketing and research agents. | `youtube-summarize` (transcript plus Claude). | YouTube Data API v3 for search and metadata (official; the API terms on storage and resale need checking). Effort: low. See side observation S2. | Official API **likely clear**, terms check required. |
| 9 | **Ad research** (Meta Ads) | not observed | Marketing agents (competitor ad monitoring). | None. | Meta Ad Library API (official; needs a verified Meta developer identity; EU-delivered ads are in scope under the DSA). Effort: low to medium. | Official API **likely clear**. Account creation is **founder-gated** (it binds Moonlighter AB). |
| 10 | **Product search** (eBay) | not observed | E-commerce agents. | `price-compare` (PriceRunner). `product-search` deactivated (Google Shopping scrape, DEC-20260427-H-4). | eBay Browse API (official; licence restrictions on resale to check). Effort: low. | Official API **likely clear**, terms check required. |
| 11 | **Search-trend time series** (Google Trends) | not observed | SEO, product and marketing agents. Strale's former largest earner was `keyword-suggest` (477 calls, deactivated as a Google ToS violation). | None. | Only a licensed or official Trends data source. Availability not verified this session. Effort: unknown. | Strale-operated Google access **prohibited**. Open only via a licensed source. |
| 12 | **Social data**: TikTok, Instagram, X, Threads, Facebook, Reddit, LinkedIn, Telegram | not observed | Delegate's headline category; marketing, sales and research agents. | `social-profile-check` (existence probe only, see S1). | **Do not build** on scraping, whether Strale-operated or Tier-2 vendor. Official routes are narrow: paid X API, Reddit Data API under a commercial agreement, Meta Graph APIs only for accounts the user controls, TikTok's research API (non-commercial). LinkedIn has none: LinkedIn sued Proxycurl in January 2025 and it shut down in July 2025 ([nubela.co](https://nubela.co/blog/goodbye-proxycurl/)). | **Prohibited** (DEC-20260813-A; social-platform rule). Tier-2 vendors also fail DEC-20260428-A: posts are not statutory public records. Per-platform official APIs are **founder-gated** contracts. |
| — | Company data, web search, scraping (generic), weather | Weather (NOAA) is free (F3) | Delegate lists them. | Strale is at parity or ahead: 30 company-data, 21 compliance and 9 web-scraping manifests, plus `weather-lookup` (Open-Meteo). | Nothing to add. Strale's first-party registry depth is the differentiator. | — |
| — | Baidu news | not observed | Low fit with Strale demand. | None. | Not recommended. | Not assessed. |

**Doctrine caveat on SERP-vendor routes.** Strale already resells Google results through Serper (`google-search`, `google-news-search`, `serp-related-questions`, `keyword-rank-check`, `serp-analyze`, `brand-mention-search`). DEC-20260428-A Tier 2, as summarised in CLAUDE.md, allows vendor-scraped data only when the underlying data is public record by statute. Search results are not. This session did not resolve whether the existing Serper use rests on a separate ruling. Any new Tier-2 SERP-vendor capability (places, trends) should wait for that answer rather than treat the existing capabilities as precedent. Separately, the operative social-platform rule is the DEC-20260813-A text. The [collision resolution](../../archive/sessions/2026-09-05-decision-collision-resolution-DEC-20260420-H.md) found that neither historical `DEC-20260420-H` row states it, so the rule's attribution is untidy, but its force under DEC-20260813-A is not in doubt.

## Q2: product ideas to borrow, ranked

Effort assumes the current monorepo. "Impact" is expected effect on agent activation and paid calls. It is an estimate, not a measurement.

| Rank | Idea | What Delegate does | Strale today | Effort | Expected impact | Why |
|---|---|---|---|---|---|---|
| 1 | **Serve `SKILL.md` at a stable public URL** and keep it generated from live facts | "Any agent that can read a URL configures itself" from `https://dlgt.io/SKILL.md` (homepage, per the brief and the index). | [`packages/skill/SKILL.md`](../../packages/skill/SKILL.md) exists, but it is installed by copying a file. It is not served by the API. It still says "250+ quality-scored" capabilities and lists "patent search", which is deactivated. `/llms.txt` and `/llms-full.txt` are served. | Low | High | One URL that a human pastes into any agent removes the install step. It is also a distribution surface. A stale skill file sells retired claims (claims register: SQS-style quality scores). |
| 2 | **Per-key spending limits and multiple keys per account** | `api_key_budget_exceeded` (403): each key has its own spending limit. Keys are managed at `app.dlgt.io/keys`. | One key per user (`users.api_key_hash`) and an hourly cap (`max_spend_per_hour_cents`, default €100/h). Per-call cap via `max_price_cents` (absolute €20). | Medium | High for keyed accounts | Handing an agent a key with a hard lifetime or monthly budget is what makes a human comfortable letting it spend. Does not affect x402, where every call is paid individually. |
| 3 | **Agent-safe CLI** (`strale search / price / run`) | JSON when piped, JSON errors on stderr, mandatory `--max-price`, no prompts, key from env or stdin (F10). | No CLI. SDKs and MCP only. | Low to medium (thin wrapper on `@strale/sdk`) | Medium | Coding agents (Claude Code, Codex) use shell tools natively. The design rules in F10 are worth copying wholesale. |
| 4 | **Error messages that name the fix**, plus a link to it | Every code has a message "that says what to do"; the 402 points to the top-up URL. | Stable `error_code` enum (DEC-19). Message quality varies by route. | Low | Medium | Agents act on the message text. A wrong next step costs a failed call and often an abandoned integration. |
| 5 | **Quote that returns an expiry, and a refuse-above-cap order in one call** | `quote` (nothing reserved) and `hire` (refuses above cap); each quote has `expiresAt`. | Fixed prices are listed in search results; `dry_run` and `max_price_cents` cover most of this. | Low | Low to medium | Mostly parity already. Worth naming the flow "search → price → run" in docs so agents and humans see Strale has the same safety. Escrow is not needed for fixed prices. |
| 6 | **Batch offers** (many inputs, one order) | `items[{customId, input}]` with a batch offer and count-based scope (F7). | One input per call. | Medium | Medium | Bulk validation (1,000 VAT numbers or IBANs) is a natural utility job. One order, one payment and one result file suit x402 better than 1,000 payments. |
| 7 | **Async jobs with `needs_input`, file outputs and a dashboard link** | `running` / `needs_input` / `delivered` / `failed + refund`; `delegate-file://` artifacts (F8). | Hybrid sync/async (DEC-22). No `needs_input`, no file artifacts. | Medium | Medium, and a prerequisite for gaps 1–2 | Transcription and bulk OCR need long-running jobs and file output. |
| 8 | **Optional post-call rating** (quality and value, 1–5) | `rate_services`; ratings shown in `service()` details. | None. DEC-11 removed the rating endpoint from the MVP. | Low | Low now, higher later | Gives an outcome signal Strale's tests cannot. **Conflict to note:** this would reopen DEC-11, so it needs a founder decision, not a session's. |
| 9 | **Human approval above a threshold** | Order status `awaiting_approval` (F8); "drafts held for your review" (F13). | None. | Medium | Low to medium | Relevant for team accounts and larger spends; less so for x402 micro-calls. |
| 10 | **Budget-aware ranking in search** | `budgetUsd` boosts cheaper services without filtering (F4). | `strale_search` returns price in EUR cents per result. | Low | Low | Matters only where several Strale tools overlap. |
| 11 | **Public ranking criteria and provider KYB** | KYB before listing; "rank is earned, never bought". | Not applicable: Strale is first-party for nearly all tools. | n/a | n/a until Strale has third-party providers | Revisit only if Strale opens to third-party providers. |

## Q3: go-to-market ideas to borrow, ranked

| Rank | Idea | Effort | Expected impact | Why, and the guardrail |
|---|---|---|---|---|
| 1 | **Use cases by role** on the new website, mapped to tools Strale actually has: sales and KYB (company registries, VAT, sanctions), finance ops (IBAN, invoice extraction, FX), e-commerce (price comparison, returns policy, HS codes), developers (the developer-tools set), researchers (OpenAlex, PubMed, arXiv, clinical trials) | Low to medium | High | A never-marketed site needs visitors to recognise their own job quickly. This fits DEC-20260905-A's "useful recurring agent work first". **Guardrail:** each role shows tools that exist and work today. No roles Strale cannot serve (social-media marketing). |
| 2 | **A worked agent session on the homepage**: task, tool picked, price, result, paid | Medium | High | Delegate's prospecting example (F13) makes the abstract concrete. This fits DEC-20260905-A's "customer-visible execution evidence". **Guardrail:** use a real, reproducible call and keep evidence next to the claim (DEC-20260303-G rationale); see the invoice-demo research. |
| 3 | **"Works with" row plus one-line setup per client** (Claude Code `claude mcp add --transport http …`, Cursor, Codex, ChatGPT) | Low | Medium to high | Delegate's README makes setup feel like one paste. Strale already serves remote MCP at `/mcp`. |
| 4 | **Developer READMEs with two diagrams** ("how it works", "what a call goes through") and zero-dependency SDKs | Low | Medium | npm, PyPI and GitHub READMEs are where agent builders actually land. Delegate's are short, diagrammed and consistent across three packages that share one version. |
| 5 | **A short benefit-first line** in the style of "Give your agent superpowers" | Low | Medium | Plain promise first, mechanism second. Matches DEC-20260905-A. **Guardrail:** the wording stays inside `claims.yaml` and VOICE.md, with no "most popular" or "trusted by N". |
| 6 | **Treat agent marketplaces and brokers as a distribution channel** | Low (analysis), founder-gated (action) | Unknown | Delegate is a broker that lists services, and is a Strale customer. Brokers can carry Strale tools to agents Strale never reaches directly. Any listing or contact is vendor contact, so it is Petter's decision (DEC-20260815-A). |
| 7 | **Catalogue size as a headline number** | Low | Low | Only if the number is served from `/v1/platform/facts` (drift-prevention rule). Strale's honest framing is depth of first-party sources, not count. |

## What not to copy

1. **Social-platform and Google data through scrapers.** Neither Strale-operated nor through Tier-2 vendors. It is prohibited for Strale (DEC-20260813-A) and fails DEC-20260428-A Tier 2. The Proxycurl shutdown shows the legal tail risk. Strale already paid the cost of removing such tools (Trustpilot, Glassdoor, Google Shopping, Google Autocomplete).
2. **The open third-party marketplace model, for now.** Provider KYB, payouts, disputes, refunds on someone else's failure and benchmark infrastructure are a second company. Strale's differentiators (first-party registry sources, provenance, fixed prices) would get diluted by unvetted providers, many of whom would be scrapers.
3. **A signup-and-prepay-first funnel as the only path.** Delegate requires an account, an API key and funds before a paid call (F3). Most of Strale's paid usage is keyless x402. The website and SDK docs should keep keyless payment at least as prominent as the key route.
4. **Claims Strale cannot evidence.** "Benchmarked", "verified by independent check", "completeness guarantees" and "picks the best service" are marketing claims. Strale's claims register already forbids close relatives ("every tool … tested", quality scores). Copy the structure, not the adjectives.
5. **Escrow, quote expiry and offer/scope machinery for fixed-price instant tools.** It is needed for variable-price human or GPU jobs, not for €0.02–€1.00 synchronous calls. Add it only when a tool's price really varies with input (transcription minutes, OCR pages).
6. **USD-only pricing in micros.** Not a reason to change Strale's EUR cents and USDC x402 pricing. Show both currencies where agents see prices, if anything.

## Side observations (outside the brief, for follow-up)

- **S1.** [social-profile-check.ts](../../apps/api/src/capabilities/social-profile-check.ts) still sends GET probes to TikTok, Reddit, YouTube and Pinterest profile URLs. LinkedIn, X, Instagram and Facebook were removed under the social-platform rule. Whether the remaining platforms' terms permit automated access was not checked here. It deserves the same vendor-terms check as the 2026-09 audit batches.
- **S2.** [youtube-summarize.ts](../../apps/api/src/capabilities/youtube-summarize.ts) fetches `youtube.com` watch pages directly (lines 102–109) as well as the oEmbed endpoint. YouTube's terms restrict automated access outside its official APIs. Same recommendation: run a vendor-terms check.
- **S3.** The Serper-based Google capabilities and the Tier-2 "public record by statute" condition (see the caveat under Q1). Whoever owns sourcing doctrine should confirm the basis these capabilities rest on.

## Follow-ups this research suggests (not done here)

- Re-run the catalogue half of this analysis with `dlgt.io` and `app.dlgt.io` allowed in the environment's network policy. That would record per-service prices, confirm the `SKILL.md` MCP tool names and read the docs and pricing pages.
- Read Strale's live `/v1/capabilities` (blocked here) to confirm that manifest-based "Strale today" entries match production `is_active` and `x402_enabled`.
- Ideas the founder wants pursued should be moved to `docs/company/IDEAS.md` or turned into decisions by the founder or the positioning session. This file does not do that.
