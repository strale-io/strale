---
doc_type: creative-brief
authority_scope: none
program: brand-website
status: adopted
date: 2026-10-23
---

# Website structure — proposed

> **Adopted 2026-10-24 by Petter (DEC-20261024-B).** Where the text below says "proposed", read it as the historical review status.

**Status: proposed, not adopted.** This is the page set, navigation and per-page plan for the `apps/web` site (DEC-20260902-A), written for Petter's review. It approves no copy, design or public claim; [claims.yaml](../../company/claims.yaml) keeps that authority. L1, L2 and L3 refer to the lines in [MESSAGING-LEVELS.md](MESSAGING-LEVELS.md). Visual design is out of scope: the design system is being built in a separate session.

**Positioning basis: DEC-20261023-B** (Petter, 23 October; recorded in a separate PR):

- **The lead:** Strale is a broad, global library of tools that AI agents use and pay for per call. One connection replaces an account with each provider, and agents pay with an API key or a wallet (x402, no signup).
- **The flagship category:** official-source company and compliance data, worldwide and not Europe-only. It covers company registries, sanctions, PEP and adverse-media screening, and ownership, with outcome pricing for bundled checks. This is the premium, differentiated part of the library, not the headline.
- **How the catalogue grows:** it is shaped into a portfolio chosen from market signals, so the site sells breadth and usefulness and never claims what is currently popular.

**Sources.** Facts were read on 2026-10-23 from production (`GET /v1/platform/facts`, `/v1/capabilities`, `/v1/solutions`, `/x402/catalog`, `/v1/public/ops/trust/capabilities/batch`), from `manifests/*.yaml`, and from `strale-frontend` (`origin/main` `8e01fbc`, 4 September). Numbers in this file size the work. The site never hardcodes them.

## What the site has to do

Buyers find Strale through agent-payment catalogues, MCP directories and marketplaces, not through the website, which had about 58 visitors in three months (positioning report, 23 October). So the site is where a human checks Strale before wiring it in, and where agents read accurate machine descriptions. Its jobs, in order:

1. **Verification destination.** The developer or marketplace operator who found Strale elsewhere sees what the library does, how to pay, the flagship company and compliance data with live coverage by country, a sample record, and the methods and limits.
2. **Machine-readable surface.** `llms.txt`, the catalogue as JSON, x402 discovery and MCP configuration all say the same thing as the human pages.
3. **First working call in under a minute.** A free tool, an x402 snippet or an MCP config, with no form to fill in.
4. **The whole library, shown honestly.** Every tool is searchable, with its price and limits.

## Recommended page set

| # | Page | URL | Kind | Header nav |
| --- | --- | --- | --- | --- |
| 1 | Home | `/` | hand-written | logo |
| 2 | Tools (catalogue) | `/tools` | generated | **Tools** |
| 3 | Tool detail (×~298) | `/tools/:slug` | generated | — |
| 4 | Bundled check detail (×~99) | `/solutions/:slug` | generated | — |
| 5 | Company and compliance data (hub, coverage matrix) | `/company-data` | hand-written + live matrix | **Company data** |
| 6 | Country page (one per live registry country, 25 today) | `/company-data/:country` | generated + short editorial intro | — |
| 7 | Use cases | `/use-cases` | hand-written index | **Use cases** |
| 8 | Use-case detail (6 at launch) | `/use-cases/:slug` | hand-written + live tool lists | — |
| 9 | Pricing | `/pricing` | hand-written + live figures | **Pricing** |
| 10 | Docs: connect and first call | `/docs`, `/docs/mcp`, `/docs/api`, `/docs/x402`, `/docs/sdks` | hand-written + generated reference | **Docs** |
| 11 | Guides | `/guides/:slug` | hand-written | footer, from Docs |
| 12 | Security and data | `/security` | hand-written + live facts | footer |
| 13 | About | `/about` | hand-written | footer |
| 14 | For platforms | `/platforms` | hand-written | footer — **held, see page 14** |
| 15 | Sign up, top up | `/signup`, `/topup` | functional | button **Get an API key** |
| 16 | Execution record | `/audit/:transactionId` | functional | — (linked from API responses) |
| 17 | Terms, Privacy | `/terms`, `/privacy` | legal | footer |

**Header:** Tools · Company data · Use cases · Pricing · Docs, then one button: **Get an API key**. Tools come first because the library is the story. Company data has its own item because it is the flagship category and the deepest proof.

- No "Sign in", because there is no login product (claims.yaml `sign-in-no-login-product`).
- Keyless x402 use is reached from Docs and from every eligible tool page, not from a second header button. Two equal buttons would make a visitor pick a payment rail before seeing a tool.

**Footer:**

- *Product:* Tools, Bundled checks, Company data, Use cases, Pricing.
- *Developers:* Docs, MCP, API reference (`/openapi.json`), x402, SDKs, Guides, `llms.txt`.
- *Company:* About, Security and data, For platforms (once released), Terms, Privacy, Top up wallet, contact.

### What Petter's list was missing

Petter's starting list was: landing page, catalogue, use cases, About, and maybe Security. This proposal adds the following.

1. **Pricing.** Paying per call with no provider accounts is the core of the story, so it needs one plain page: the pay-per-call model, the free tools, and the choice between an API key and an x402 wallet.
2. **Docs / connect.** There are four ways in (MCP, REST API, SDKs, x402), and the first call is where interest turns into revenue.
3. **Generated tool pages.** These are where search engines and agents arrive: 290 of today's 454 sitemap URLs are tool detail pages.
4. **A company and compliance data hub with a live coverage matrix, and one page per country.** This is the flagship category's proof. It lists which registers are live in which countries, what each returns, where the data comes from, the price and the last test. Country pages ("How an agent checks a Japanese company") are also what search engines and LLM search land on for that job.
5. **Bundled checks** (today's "solutions"). These are the outcome-priced checks, such as a company check or an invoice-issuer check. They appear in the catalogue, the hub and the use cases, without a header item of their own.
6. **For platforms.** Agent marketplaces and routers are where buyers find Strale today, so this page matters more than it first appears. It is held because the current Terms forbid it as written (page 14).
7. **Machine-readable surfaces,** treated as part of the site (see below).

Security is a firm yes. It absorbs today's `/trust` methodology page, so "what happens to my data" and "how are tools checked" live in one place.

## Page specifications

Each page answers one reader question and has one primary call to action (CTA).

### 1. Home `/`

- **Purpose:** in one screen, say what Strale gives an agent builder, then prove it with a working call. Send the visitor to the catalogue or Docs.
- **Reader:** a developer building an agent, often one who found Strale in a catalogue, MCP directory or marketplace and is checking it before wiring it in. Sometimes a marketplace operator.
- **Question:** *Can my agent get the tools it needs here, without an account with every provider, and how do I pay?*
- **Sections, in order:**
  1. **Hero:** the L1 headline and one supporting line, plus the catalogue search box. CTA **Browse tools**; secondary link **Read the docs**.
  2. **Benefits:** the remaining L1 lines, each paired with one concrete job as proof.
  3. **What agents use it for:** the breadth L2 lines (search and read the web, read documents, check data before acting, developer and web checks). Each links to a filtered catalogue view or a use case. Example tools are chosen editorially for the job, never labelled "popular" (`most-popular-tools` is forbidden).
  4. **One call, start to finish:** request, structured result, source and price, using a free tool so the reader can repeat it without signing up. Labelled as an example.
  5. **Company and compliance data:** the flagship L2 lines, with a compact live coverage strip (countries live and what each returns) and links to `/company-data` and the bundled checks. This is the deepest proof on the page; it sits below the breadth, not in the hero.
  6. **Two ways to pay:** an API key with a prepaid balance, or an x402 wallet per request with no signup, for eligible tools.
  7. **Ways in:** MCP · REST API · SDKs · x402, one line each.
  8. **Start:** CTA **Get an API key**; secondary **Try a free tool**.
- **Primary CTA:** Browse tools.
- **Level:** L1 in sections 1–2; L2 in sections 3 and 5; L3 in sections 6–7.
- **Data:** the library count from facts (`capability_counts.active_visible`), rendered and never typed; example tools from `/v1/capabilities/:slug`; coverage strip from `/v1/platform/facts` (`countries.company_data_active`) and `/v1/capabilities`; free tools from facts `free_tier_slugs`; x402 eligibility from `/x402/catalog`.

### 2. Tools catalogue `/tools`

- **Purpose:** let anyone find a tool for a job in under 30 seconds.
- **Question:** *Is there a tool for the thing I need?*
- **Sections:** (1) a typeahead search box and one line of L3 features; (2) filters by job group (the L2 vocabulary, not the 23 internal category names), plus *Free to try*, *Keyless (x402)* and *Country*; (3) compact rows showing name, one-line job, price and route badges; (4) bundled checks as their own group; (5) "Can't find it?" leading to contact. Failed searches are already logged as demand.
- **Primary CTA:** open a tool.
- **Level:** L3, with L2 as the filter vocabulary.
- **Data:** `/v1/capabilities` (visible tools only), `/v1/solutions`, `/v1/suggest/typeahead`, `/x402/catalog`. Group mapping: an editorial file mapping `category` to job group, checked at build time so every visible tool lands in some group. Tools labelled Unverified are listed with the label, not hidden (DEC-20260904-C).

### 3. Tool detail `/tools/:slug`

- **Purpose:** everything needed to make the first call to this tool.
- **Question:** *Will this tool do my job, what does it cost, and how do I call it?*
- **Sections:**
  1. Name and the one-line job it does.
  2. Example input and output. A live **Try it** only for free tools (10 calls a day per IP); every other tool shows the labelled manifest example.
  3. Inputs.
  4. Output fields and how reliably each appears.
  5. Price in EUR, plus the USD price on x402 where the tool is eligible.
  6. How to call it: tabs for API, MCP, SDK and x402, each with a copyable snippet.
  7. **Limitations**, shown as written.
  8. Source and method: `data_source` and `transparency_tag`.
  9. Last test date and mode where one exists.
  10. Bundled checks that include it; related tools.
- **Primary CTA:** copy the call.
- **Level:** L3, specific to this tool.
- **Data:** `/v1/capabilities/:slug`; `/v1/public/ops/limitations/capabilities/:slug`; `/x402/catalog`; trust batch endpoint; `manifests/:slug.yaml` for field reliability. Pre-render at build; refresh price and eligibility at runtime.
- **Never:** a quality score (`sqs-quality-score-trust-layer`), or a "tested" claim without its mode and date (`every-tool-continuously-tested`).
- **URL:** move from `/capabilities/:slug` to `/tools/:slug`, with permanent (301) redirects, to match the marketing noun (VOICE.md). API identifiers stay `capabilities`.

### 4. Bundled check detail `/solutions/:slug`

Same shape as a tool page, plus the steps it runs and what the bundle adds (for example, a written risk summary, which is AI-generated and labelled so). URLs stay unchanged; 98 are in the sitemap today. Data: `/v1/solutions/:slug`, `/v1/public/ops/limitations/solutions/:slug`, `/x402/catalog`, `/v1/public/ops/trust/solutions/batch`. CTA: copy the call.

### 5. Company and compliance data hub `/company-data`

- **Purpose:** show exactly which company facts an agent can get, for which countries, from which source, at what price.
- **Reader:** a developer building agents for onboarding, procurement, invoicing or screening; a marketplace operator looking for company data it does not have.
- **Question:** *Which countries can my agent check, and what comes back for each?*
- **Sections:**
  1. One-paragraph framing from the flagship L2 lines. The countries are grouped by region (Europe, the Americas, Asia-Pacific) so the page never reads as Europe-only.
  2. **Live coverage matrix.** One row per country, with columns for register (source name), identifiers accepted, what it returns (core record, officers, ownership where exposed), price, routes (API/MCP/x402), last test date and result, and a link to the country page. A country without a scheduled test shows "not scheduled". It is never hidden and never shows a badge it has not earned.
  3. **Screening:** sanctions, PEP and adverse media, with the source named.
  4. **Ownership:** what exists today (UK persons with significant control, GLEIF parent and child relationships) and what does not.
  5. **Bundled checks:** company check, full check and invoice-issuer check per country, listing the steps in each.
  6. **Limits:** coverage gaps, AI-assisted steps (from `transparency_tag`), vendor-wrapped sources.
- **Primary CTA:** open a country page.
- **Level:** L2 with the full L3 detail.
- **Data:** `/v1/platform/facts` (`countries`); `/v1/capabilities` (category `company-data` plus the screening and ownership slugs; `data_source`, `price_cents`, `transparency_tag`); `/v1/solutions` (`capabilities` per bundle); `/v1/public/ops/trust/capabilities/batch` (`tested`, `last_tested_at`, `pass_rate`, under the wire-shape rule); `/x402/catalog` (route eligibility). The country-to-slug map is a small editorial file, checked at build time against the catalogue.
- **Known data issue to fix before launch:** the Denmark bundles (`kyb-essentials-dk` and its siblings) describe confirming the company "in the official registry", but they contain no registry step, because the Danish registry tool is not active. A matrix built from the bundle steps will show this. The bundle descriptions need correcting (follow-up).

### 6. Country page `/company-data/:country`

- **Purpose:** be the best page on the web for "how does an agent check a [Swedish] company".
- **Question:** *Can my agent check a company in this country, with what input, and what comes back?*
- **Sections:** the register and what it is (one editorial paragraph); accepted input (organisation number, name, VAT number); fields returned and how reliably each appears; a sample answer, labelled; price per call and per bundled check; how to call it on each route; last test date and result; limitations; related screening tools.
- **Primary CTA:** copy the call.
- **Level:** L2 headline, L3 body.
- **Data:** the same sources as the hub, filtered to one country, plus `manifests/<slug>.yaml` for field reliability. Launch with every live registry country, 25 today: 19 in Europe, plus Australia, Brazil, Canada, Japan, Singapore and the US. New countries appear as registries go live.

### 7. Use cases `/use-cases`

One card per job, each with a one-line description and the tools it uses. Level L2. Data: an editorial file whose tool slugs are checked against the catalogue at build time.

### 8. Use-case detail `/use-cases/:slug`

- **Question:** *Which tools would my agent use for this, in what order, and what would one run cost?*
- **Sections:** (1) the job, in the reader's terms; (2) the two to five tools or the bundled check involved, each linked; (3) one worked example, labelled illustrative; (4) cost per run, computed from live prices; (5) a code sketch for one route; (6) where the human stays in the loop, for checks that feed a decision about a person or company (Terms; GDPR Art. 22 classification).
- **Primary CTA:** open the first tool. **Level:** L2 headline, L1 benefit, L3 tool list.
- **Launch set:** chosen for what agents are built to do, not for what is selling now. Six pages:
  - research agents (web search, SERP, page to markdown, academic search);
  - reading documents (image to text, invoice, receipt and PDF extraction);
  - checking data before acting (email, phone, IBAN format, VAT);
  - onboarding a supplier or customer (registry lookup, screening, bundled company check);
  - checking who issued an invoice (bundled invoice-issuer check);
  - SEO and web agents (SEO audit, SERP, tech stack, DNS and SSL checks).
- **Growth:** new use cases follow the catalogue as it is shaped from market signals (DEC-20261023-B). The editorial file makes adding one a content change, not a code change.

### 9. Pricing `/pricing`

- **Question:** *What will this cost me, and how do I pay?*
- **Sections:**
  1. Pay per call, with no subscription.
  2. Live price ranges for tools and for bundled checks.
  3. A single tool is charged only when the call succeeds (claims.yaml `pay-per-successful-call`, allowed). A bundled check is refunded only if every step fails (`solution-execute.ts`), and the page says so.
  4. Two ways to pay: a prepaid EUR wallet with an API key (card top-up via Stripe), or USDC per request over x402 for eligible items, with no account.
  5. Free tools.
  6. Trial credit, shown only as read from configuration.
  7. A price cap on each API call (`max_price_cents`; €20 hard limit per request). It is optional on bundles, and x402 has no cap, only the quoted price.
  8. FAQ.
- **Primary CTA:** Get an API key. **Level:** L3.
- **Data:** ranges computed from `/v1/capabilities` and `/x402/catalog`; free tools from facts.
- **Trial amount:** comes from `TRIAL_CREDITS_CENTS` (`apps/api/src/lib/trial-eligibility.ts`, 200 today). Exposing it through `/v1/platform/facts` is a small backend task, so the page never types the figure (`trial-credit-amount` is `needs_evidence`).
- **Never:** "all tools support x402" (`all-x402-coverage`, forbidden). Eligibility is a live subset: 272 of 298 tools and 74 of 99 bundles today.

### 10. Docs `/docs`

- **Purpose:** from zero to one successful call on the visitor's chosen route.
- **Sections:**
  1. Choose a route: MCP (Claude, Cursor and other MCP clients), REST API, SDKs (TypeScript `@strale/sdk`, Python `straleio`, framework packages), or x402 (keyless, pay per request).
  2. The first call on that route, using a free tool.
  3. Request and response shape (`inputs`, `max_price_cents`, the `result` / `error_code` envelope).
  4. Errors and retries.
  5. Idempotency and spend caps.
  6. Retrieving a past call by transaction ID.
  7. API reference generated from `/openapi.json`.
- **Primary CTA:** run the first call. **Level:** L3.
- **Framework packages** are listed only when `check-framework-packages.mjs` passes. Today that is langchain, crewai, semantic-kernel and composio. The deprecated pydantic-ai, google-adk and openai-agents packages are not listed (DEC-20260422-A).

### 11. Guides `/guides/:slug`

- Merge today's 49 `/learn` and 6 `/guides` articles under `/guides`, with redirects.
- Remove or rewrite the six that name deprecated packages (`iban-validation-pydantic-ai`, `sanctions-check-pydantic-ai`, `google-adk-strale-agent`, `vat-validation-openai-agents`, `company-data-openai-agents`, `strale-openai-agents-sdk`) and `web-scraping-agent-anti-bot`, whose framing conflicts with the scraping doctrine.
- Existing country-lookup guides fold into the country pages.
- Level L3.

### 12. Security and data `/security`

- **Question:** *What happens to the data my agent sends, and how do you know a tool works?*
- **Sections:**
  1. Where processing happens (facts `processing_jurisdiction`, US today).
  2. What is kept and for how long: call content (input, output, error and audit body) is cleared at 90 days, and the remaining record is kept for the default retention period. Both are read from facts. Before publishing, confirm in production that the older backlog has drained.
  3. Keys and payments: keys stored hashed, cards via Stripe, x402 via the facilitator.
  4. Sub-processors (facts `static.vendors`).
  5. Where data comes from: official registers and APIs, licensed vendors, and direct per-call access to public registers. No bulk crawling and no getting around logins or CAPTCHAs (DEC-20260428-A, DEC-20260813-A). Avoid a flat "never scrapes" sentence: the catalogue fetches web pages per call (for example, page to markdown), and claims.yaml has no row for it.
  6. How tools are checked, by mode and route, and what that does and does not establish. This absorbs `/trust/methodology`.
  7. Disputing a result (`POST /v1/transactions/:id/dispute`) and the GDPR Art. 22 classification per tool.
  8. Contact.
- **Level:** L3 as proof.
- **Never:** SOC 2, SLA, uptime percentages, "enterprise-ready" or average latency (all forbidden).

### 13. About `/about`

- **Question:** *Who runs this, and will it still be here next year?*
- **Sections:** what Strale is for (L1); the company (Moonlighter AB, Sweden); how the catalogue grows (from what agents ask for and fail to find); sourcing principles; contact.
- **Founder choice:** whether to name Petter.

### 14. For platforms `/platforms` (held)

- **For:** routers and marketplaces (Delegate is one) that want to offer Strale's tools, including the company and compliance data, to their own users.
- **Question:** *Can I supply these tools inside my product, and on what terms?*
- **Why held:** the live Terms forbid using the Service to "resell the Service as your own or build a competing product whose primary purpose is to mirror Strale's capability catalog" (strale.dev `/terms`). A page inviting resale would contradict them. A Terms change binds Moonlighter AB, so it is Petter's decision (CHARTER). Marketplaces are where buyers find Strale today, so the Terms question sits on the main channel.
- **Sections, once released:**
  1. Integration paths that already exist: one account calling on behalf of your users, or x402 from your own wallet.
  2. Catalogue sync through `/v1/capabilities` and `/x402/catalog`.
  3. The provenance you can pass through to your users.
  4. Wholesale terms and contact.
- **CTA:** contact.

### 15–17. Functional and legal pages

`/signup`, `/topup` and `/audit/:transactionId` keep their behaviour and take the visual system, with no marketing copy. `/terms` and `/privacy` carry over unchanged in content, apart from any Terms change Petter makes for page 14.

## Machine-readable surfaces

Agents and registries read these instead of the human pages. They must agree with the site and come from the same sources.

| Surface | Where | Source | Must change |
| --- | --- | --- | --- |
| `llms.txt` (dynamic) | `api.strale.io/llms.txt` (`apps/api/src/routes/llms-txt.ts`) | live DB | Opens "One API call. Verified data your agent can trust. 298+ independently tested…": retired trust framing plus a baked-in count. Its web3 section also names `wallet-risk-score` and `token-security-check`, which are not in the live catalogue. Rewrite it to lead with the L1 line and the job groups, with company and compliance data as its own section linking the coverage matrix. |
| `llms.txt` (static) | `strale.dev/llms.txt` | hand-written | Says "the trust layer of the agent economy" and "All capabilities are available via x402", which is false (272 of 298 tools today). Replace it with a short pointer to the dynamic file, or generate both from one source. |
| Agent card | `strale.dev/.well-known/agent.json` (static); `api.strale.io/.well-known/agent-card.json` | hand-written / route | Static description is "The trust layer for AI agents — independently tested". Align with L1. |
| MCP server card | `/.well-known/mcp.json` | route + static | Same alignment. |
| x402 discovery | `/.well-known/x402.json`, `/x402/catalog` | live DB | Already authoritative for eligibility and USD price. The site reads it and never restates it. |
| OpenAPI | `/openapi.json` | route | Source of the Docs API reference. |
| Registry manifests | repo root `server.json`, `smithery.yaml`, `glama.json`, `context7.json` | hand-written | Take the adopted one-liner. Separate, job-named listings (for example, company and compliance data alongside the general library) are a decision for the channel batch, not for the website. |
| Package READMEs and metadata | `packages/*`, npm/PyPI | hand-written | Same one-liner; `claims:check` already scans them. |
| `sitemap.xml`, `robots.txt` | `apps/web` | generated | Generated from the catalogue and the country list. |

**Rule:** keep one positioning sentence and one short description as data (in `apps/web`, or in `platform-facts.ts`, the existing source for shared facts). Every surface above reads them from there. Extend `claims:check`, which today reads the sibling frontend's `llms.txt`, to cover `apps/web` output and the dynamic `llms.txt` route.

## Today's site (strale.dev) → new site

| Today | Fate | Why |
| --- | --- | --- |
| `/` hero "One API call. Verified data your agent can trust." + "The trust layer of the agent economy"; Problem, Quality scoring, Audit trail sections; "Three steps to production" | **Dies.** | Abstract trust adjectives; the report finds a router competitor already claims "trust". The quality-scoring section describes a deleted engine (DEC-20260503-B). The audit-trail idea survives as a concrete sample record. |
| `/capabilities`, `/capabilities/:slug` (290 detail pages in the sitemap) | **Carries over** as `/tools`, with 301 redirects. | Marketing noun is "tools". |
| `/solutions`, `/solutions/:slug` (98 in the sitemap) | **Carries over**; URLs unchanged. | Indexed; these are the outcome-priced products. |
| `/pricing` | **Carries over**, rewritten. | Static figures removed. |
| `/docs`, `/integrations` | **Merge** into `/docs`. | Integrations is one choice within "connect". |
| `/learn/*` (49), `/guides/*` (6) | **Merge** into `/guides/*`; prune seven; country guides fold into country pages. | Search value; some name deprecated packages. |
| `/trust`, `/trust/methodology` | **Merge** into `/security` (301). | One page for data and checking. |
| `/security`, `/privacy`, `/terms`, `/signup`, `/topup`, `/audit/:id` | **Carry over.** | — |
| `/design-system`, `/logo-explorations` | **Die.** | Internal pages. |
| — | **New:** `/company-data`, `/company-data/:country`, `/use-cases`, `/use-cases/:slug`, `/about`, `/platforms` (held). | — |

## Decisions this needs from Petter

1. **Approve the page set and header.** Positioning is settled by DEC-20261023-B.
2. **About:** name the founder, or present the company only.
3. **For platforms:** change the Terms so platforms may supply Strale's tools to their users? Until then the page stays unpublished, and marketplace outreach runs against Terms that forbid what it offers.

Technical choices (URL scheme, build-time generation, redirects, where the shared description lives) belong to T6 and are recorded here as recommendations.
