# Catalogue buildout strategy — what demand actually says, and what to build next

**Date:** 2026-08-12
**Mode:** READ-ONLY analysis. Production DB queried read-only via temporary scripts (deleted after use); no repo writes other than this file; no Notion writes.
**Question:** How should Strale build out the capability catalogue with *meaningful* capabilities — ones real agent traffic wants — instead of speculative breadth?
**Inputs:** production `transactions` / `failed_requests` / `suggest_log` / `capabilities`; `handoff/_general/from-code/2026-08-09-usage-analysis-capability-buildout.md`; `audit-output/parallel-audits-2026-08-12/kyb-coverage-research.md` §5–6; `docs/strategy/2026-08-05-direction-plan.md`; `docs/strategy/2026-08-12-platform-readiness-program.md`.

---

## 0. The answer in one paragraph

The demand data does not support building more capabilities — it supports **fixing the ones a paying customer is already calling and failing on**, and then building a small number of tight neighbours around a single, clearly-identifiable revenue cluster. Over the last 90 days external revenue was **€249.37**, of which **53.3% came from one x402 wallet** (and **91% of the last 30 days**). That wallet's spend profile is unambiguous: SEO, SERP, lead/email verification, and company/web intelligence. Meanwhile **€42.36 of demand was destroyed by failures on capabilities that already exist** — a ~17% revenue uplift available with zero new source risk, zero new licence questions, and zero new maintenance surface. Against that, the entire April–May country-registry and compliance buildout — **32 of the 52 never-sold active capabilities** — has earned **€0.00** in external revenue in 90+ days. The catalogue does not have a supply problem. It has a reliability problem, a merchandising problem, and a single-customer concentration risk.

---

## 1. What the demand data actually says

### 1.1 Headline numbers (90 days to 2026-08-12, internal accounts excluded)

| Measure | Value |
|---|---|
| External calls (excl. health probes) | 3,973 |
| Failed | 506 (**12.7%**) |
| External revenue | **€249.37** (x402 €246.04 / wallet €3.33) |
| x402 share of revenue | **98.7%** |
| Distinct paying x402 wallets | **36** |
| Top wallet share of x402 revenue (90d) | **53.3%** (€131.08) |
| Top wallet share of x402 revenue (30d) | **≈91%** (€101.64 of €112) |
| Active capabilities | 298 (256 x402-enabled + visible) |
| Active capabilities that have **never** earned an external cent | **52** |

Monthly external revenue: May €115.17 · Jun €107.57 · Jul €68.30 · Aug (12 days) €61.14.
Revenue is **flat-to-declining**, with an August recovery driven almost entirely by one wallet. This is not a growth curve.

### 1.2 `failed_requests` is not currently a usable demand signal — and here is exactly why

This is the most important structural finding in the whole analysis, because the brief assumed this table is the demand funnel.

- **77 rows total, all time.** 44 external `no_match`, 12 `missing_fields`, 6 `input_misplaced`.
- **The x402 gateway never writes to it.** Grep of the write sites: `failedRequests` is inserted only from `apps/api/src/routes/do.ts` (lines 644, 872, 912, 960). `x402-gateway-v2.ts` returns bare 404s (lines 876, 1066) with no logging. Since **92%+ of paid traffic and 98.7% of revenue arrives over x402**, the demand-sensing channel is instrumented on the rail almost nobody uses.
- **What is in there is overwhelmingly not demand.** Of the 44 external `no_match` rows: ~13 are Arbor-hive / agentdex.dev / Hyperspell agent-marketplace liveness probes and roundtable prompts (`"Read-only Arbor smoke check…"`, `"Automated liveness probe from agentdex.dev"`, `"ping (capability probe; no action needed)"`); 4 are deliberate negative tests (`zzz-no-such-cap`, `totally-fake-slug-xyz`, `nonexistent-cap-xyz`); ~15 are free-text *reasoning/writing* tasks routed at `/v1/do` (write a paragraph contrasting two protocols; summarise payment-API integration considerations) that no data capability could ever serve.
- **`max_price_cents` is a bid ceiling, not willingness to pay.** All 44 rows carry a price; the mean is 171¢ and the mode is 200¢ — but that is the marketplace harness's default per-task budget, not a buyer signalling €2.00 for a lookup. Do not use this number for pricing.

**Genuine signal extractable from the whole table: about five data points.**

| Signal | n | Read |
|---|---|---|
| Flight options PVG→ICN, comparison + sources | 3 | Real task. We have `flight-status`, not flight *search*. Source-blocked (see §2, Declined). |
| USD→CHF conversion + written note | ~5 | We **have** `exchange-rate` and `currency-convert`. This is a *routing* miss, not a capability gap. |
| Slug guesses: `lead-enrich`, `contact-verify`, `company-lookup`, `solutions/lead-enrich` | 4 | Agents guess plausible slugs. `lead-enrich` exists as a solution — so 2 of 4 are naming/aliasing misses. |
| "Find and purchase the cheapest tiered skirt…" | 1 | Agentic commerce. Out of scope. |

**Conclusion: `failed_requests` cannot rank a build list today.** Fixing that instrumentation is step 0 of the intake loop (§4).

### 1.3 The real demand signal is the transactions table — and it names one customer

Wallet-level clustering (from `audit_trail->>'payer_address'`), 90 days:

| Wallet | Calls | Distinct caps | Revenue | Active days | Shape |
|---|---|---|---|---|---|
| `0x9D3d…D837` | 2,111 | 101 | **€131.08** | 51 | **The business.** Runs continuously, May 9 → Aug 12 |
| `0x9CC42f…b176` | 705 | 251 | €54.27 | 11 (Jun 3–22) | Catalogue enumeration sweep — paid, but not demand |
| `0x15C3cD…bC2B` | 320 | 1 | €32.00 | 10 | True embed: `google-search` only |
| `0x7e571E…2F09` | 327 | 64 | €6.18 | 24 | Explorer, cheap capabilities |
| `0x035a45…2A55` | 109 | 1 | €5.40 | 1 | Batch embed: `image-to-text` |
| `0x3803A1…101b` | 58 | 9 | €3.01 | 15 | SEO recipe: serp/keyword/screenshot/reviews |
| remaining 30 wallets | — | — | ≈€17 combined | — | long tail, mostly 1–3 calls |

**What the top wallet buys** (90d, its own spend, ranked):

`google-search` €23.50 · `serp-analyze` €13.50 · `email-validate` €13.35 · `brand-mention-search` €6.90 · `email-deliverability-check` €6.75 · `tech-stack-detect` €5.13 · `invoice-extract` €5.00 · `keyword-suggest` €4.26 · `pricing-page-extract` €3.90 · `backlink-check` €3.45 · `seo-audit` €2.70 · `company-enrich` €2.50 · `startup-domain-check` €2.15 · `company-industry-classify` €2.05 · `company-tech-stack` €1.50 · `url-to-markdown` €1.45 · `screenshot-url` €1.40 · `barcode-lookup` €1.40 · `product-reviews-extract` €1.25 · `uk-company-data` €1.10

That is a **B2B lead-generation / SEO / competitive-intelligence pipeline**, with an email-verification leg. It is not a compliance buyer, not a KYB buyer, and not a Web3 buyer.

The hour-by-hour trace shows it is *not* one tight recipe — it runs many small task clusters around the clock across 91 distinct capabilities in 30 days. **Breadth is itself what this buyer pays for.** That refines the direction plan's "breadth is how the embed gets found": for the single customer that matters, breadth *is* the product — but breadth **within its cluster**, not across 300 unrelated verticals.

### 1.4 Category economics, 90 days

| Category | Calls | Distinct caps | Completion | Revenue |
|---|---|---|---|---|
| data-extraction | 933 | 71 | 80% | €75.68 |
| web-scraping | 620 | 7 | 85% | €36.38 |
| validation | 799 | 33 | 98% | €25.01 |
| competitive-intelligence | 71 | 4 | 97% | **€20.70** |
| file-conversion | 259 | 4 | 85% | €9.67 |
| developer-tools | 172 | **43** | 77% | €8.32 |
| compliance | 58 | 9 | **100%** | €6.32 |
| web-intelligence | 277 | 4 | 81% | €6.28 |
| **company-data** | 65 | 5 | 66% | **€2.15** |
| web3 | 123 | 17 | 94% | €2.32 |

Read this as revenue-per-capability. `competitive-intelligence` earns **€5.18 per capability**; `developer-tools` earns **€0.19 per capability across 43 of them**; `company-data` earns €0.43 across 5 (and 16 more registry capabilities earned nothing at all). The catalogue's shape and the catalogue's revenue point in opposite directions.

### 1.5 Failures are destroying more money than any new capability could earn

Lost revenue = failed external calls × list price, 90 days. Top offenders:

| Slug | Fails/calls | Lost | Earned | Dominant error |
|---|---|---|---|---|
| `product-reviews-extract` | 42/51 | **€10.50** | €2.25 | 36× HTTP 403 site block |
| `invoice-extract` | 7/19 | €3.50 | €6.00 | 5× source URL 404 |
| `url-to-markdown` | 56/202 | €2.80 | €1.60 | 27× npmjs.com block, 6× "URL returns JSON" |
| `gdpr-fine-lookup` | 8/11 | €1.60 | €0.60 | 8× missing input |
| `price-compare` | 8/13 | €1.60 | €1.00 | 429 rate-limit |
| `pdf-extract` | 5/5 | €1.50 | €0.00 | 5× source 404 |
| `terms-of-service-extract` | 5/5 | €1.50 | €0.00 | — |
| `tech-stack-detect` | 47/222 | €1.41 | €5.25 | 21× 403, 16× missing input |
| `image-to-text` | 27/201 | €1.35 | €8.70 | 17× Claude "unable to download the file" |
| `screenshot-url` | 26/58 | €1.30 | €1.60 | 24× **our own bug** (below) |
| **Top-30 total** | — | **≈€42.36** | — | — |

€42.36 against €249.37 earned = **a ~17% revenue uplift sitting in already-built capabilities.** For comparison, the median capability added in the last 120 days has earned **€0.00**.

**`screenshot-url` is a platform defect, not an upstream problem.** 24 of its 26 failures are `External web service screenshot returned HTTP 400: [{"message":"\"waitForSelector\" is not allowed"...}]`. That is consistent with the documented Browserless **v1-in-prod / v2-locally** split (`project_browserless_v1_v2_split.md`) — a request field valid in v2 being sent to a v1 endpoint. It has been silently 400-ing the biggest paying customer. Verify in prod, per the standing rule.

### 1.6 Roughly half the "failure rate" is the platform correctly refusing bad input

Of the 40 most common external error strings, about half are the platform saying *"'x' is required"* — `danish-company-data` 8×, `us-company-data` 9×, `weather-lookup` 8×, `charity-lookup-uk` 7×, `tech-stack-detect` 16×, `lei-lookup` 5×, `uk-company-data` 5×, `french-company-data` 5×, `belgian-company-data` 5×, and ~13 more. These are **correct 4xx refusals of empty or malformed input**, and per DEC-14 nobody was charged.

**This matters for the adopted quality floor (DEC-20260812-A).** If quarantine-at-<70% runs on raw completion rate, it will quarantine capabilities that are behaving correctly and refusing junk — `danish-company-data` at 0/11 is 8 empty-input refusals plus a vendor quota problem, not a broken capability. The floor needs a failure classifier in front of it (WS3 L1 already specifies one; this is the concrete reason it must land *before* the floor, not after).

### 1.7 The compliance/registry buildout has not sold

Of the **52 active capabilities that have never earned an external cent**:

- **16** country registries and company-data (`danish`, `swiss`, `estonian`, `croatian`, `cz-company-data`, `greek`, `irish`, `latvian`, `lithuanian`, `singapore`, `slovak`, `slovenian`, `sec-filing-events`, `uk-filing-events`, `us-company-data-cobalt`, `company-news`)
- **7** compliance (`cz-unreliable-vat-payer`, `fr-bodacc-lookup`, `no-bankruptcy-check`, `uk-cop-check`, `us-court-search`, `us-ein-match`, `us-sec-filings-extended`)
- **4** Czech identifier validators, **5** NL open-data (`nl-bag-address`, `nl-energy-label`, `nl-housing-*`, `nl-woz-value`)
- **6** crypto address validators, **11** LLM/dev/scraping utilities, **3** capabilities shipped 2026-08-08

**32 of 52 (61%) are the compliance/registry wedge.** That wedge consumed most of 2026's engineering effort and has produced zero external revenue in 90+ days, while `competitive-intelligence` — four capabilities nobody planned as a product — earns €20.70.

This corroborates the KYB research §5 F4 conclusion from the opposite direction: F4 argued the free-source ceiling makes a KYB offering structurally a *non-obliged-buyer* product. The revenue data says something blunter — **there is currently no buyer at all**, obliged or otherwise. Note that this is evidence about *demand*, not about the research: the AT Firmenbuch HVD unlock (§2.1/F3) remains correct and useful, just not as a revenue play.

### 1.8 `suggest_log` is a different population and should be weighted low

2,249 queries; only 121 zero-result, and the top zero-result terms are `oauth` (4), `expensive problems` (4), `singstat` (3), `czech` (3) — n ≤ 4, mostly April, mostly humans browsing the website. Top *non-zero* queries (`email validation` 81, `iban validate` 58, `dns lookup` 50, `company` 37, `sanctions screening` 17) describe what **website visitors** shop for. Website visitors have generated €0 in 90 days. Use `suggest_log` for SEO page targeting (WS5), not for capability prioritisation.

---

## 2. Ranked build list

### Rank 0 — before any new capability: five fixes worth more than the whole list below

Not new capabilities, but they must sit at the top of the same queue because their expected value dominates.

| # | Action | Evidence | Effort |
|---|---|---|---|
| 0.1 | **`screenshot-url`** — remove/relocate `waitForSelector` for the v1 prod endpoint | 24 of 26 failures; hits the top-revenue wallet | Small, prod-verify required |
| 0.2 | **`url-to-markdown`** — auto-route npmjs.com to `npm-package-info` instead of erroring; return JSON URLs as success | 33 of 56 failures; 202 calls, highest-volume web capability | Small |
| 0.3 | **`image-to-text`** — fetch bytes server-side and pass base64 rather than handing Claude a URL | 17 of 27 failures are "unable to download the file" | Small |
| 0.4 | **`product-reviews-extract` / `return-policy-extract` / `price-compare`** — restrict declared inputs to domains we may lawfully read, refuse the rest fast (do **not** scrape harder — Tier 1) | 42/51, 5/5, 8/13; €14.10 combined | Medium — a listing-honesty decision |
| 0.5 | **`related_capabilities` hint in successful responses** — e.g. `email-validate` → `email-validate-bulk` / `email-deliverability-check` | `email-validate` 505 calls; `email-validate-bulk` shipped 08-08 with **0 external calls** | Small; WS4 item 4 |

### Rank 1–14 — capability ideas, with demand evidence and source feasibility

Source rule applied throughout: free/official sources, or a vendor already paid for and live in prod. Anything else is flagged.

| # | Capability | Demand evidence (measured) | Source & feasibility | Maint. class | Price |
|---|---|---|---|---|---|
| **1** | **`google-news-search`** | `google-search` is the #1 earner (324 calls, 100%, €32.30); `brand-mention-search` 30 calls, 100%, €9.00 at €0.30 — the highest per-call SEO earner | Serper.dev `/news`. **Already paid, key live in prod**, same client as `google-search` | near-zero | €0.10 |
| **2** | **`serp-related-questions`** (People Also Ask) | `keyword-suggest` 189 calls / 100% and `serp-analyze` 95 calls / 100% are the two cleanest SEO earners; PAA is the third leg of every content brief | Serper.dev `/search` (`peopleAlsoAsk` block) — no new vendor | near-zero | €0.05 |
| **3** | **`local-pack-search`** (Maps/Places) | The four-wallet local-SEO recipe already recorded in the readiness program §WS4; `address-geocode` 48 calls / 100%; `seo-audit` €4.50 | Serper.dev `/places` — no new vendor | near-zero | €0.10 |
| **4** | **`company-domain-find`** (legal name → official website) | Agents arrive holding a **name**, not an identifier: `us-company-data` 9, `uk-companies-house-officers` 6, `french` 5, `belgian` 5, `lei-lookup` 5, `charity-lookup-uk` 7 failures all literally "company_name / identifier required". Plus `company-enrich` has the best unit economics in the catalogue (€0.50, 93% completion) | Serper + DNS verification. Organisation-level only — **no personal data, no email inference** (the `email-finder` GDPR line stays) | near-zero | €0.05 |
| **5** | **`domain-email-provider-detect`** (MX → Google Workspace / M365 / Proofpoint / self-hosted) | The email cluster is the only month-over-month grower: `email-validate` 505 calls (#1 by volume, 100%), `email-deliverability-check` 139 / 100% / €6.95, `lead-email-verify` the #1 solution at €11.00 | DNS only, via our existing `mx-lookup` primitive. Zero external cost | **zero** | €0.03 |
| **6** | **`email-auth-check`** (SPF + DKIM + DMARC posture) | Same cluster; also neighbours `header-security-check`, `gdpr-website-check`, `domain-reputation` (24 calls, 100%) | DNS only. Zero external cost. Pure computation over TXT records | **zero** | €0.03 |
| **7** | **`sec-edgar-full-text-search`** (search filings by company name) | `us-company-data` 26 calls at **35%** completion, 9 failures are exactly "'cik' or 'company_name' is required" — we are refusing demand we could serve. US is the weakest identity leg (direction plan §4.2) | `efts.sec.gov/LATEST/search-index?q=` — free, official, no auth, documented fair-access limits (declared User-Agent + ≤10 req/s). Public domain | low | €0.05 |
| **8** | **`wayback-snapshot-lookup`** (page as of date / change detection) | `pricing-page-extract` 18 calls, 89%, **€4.80** — the highest-margin competitive-intel capability; `competitor-compare`, `domain-age-check`, `whois-lookup` all in the same wallet's basket. "What did this pricing page say last quarter" is the obvious extension | Internet Archive Availability API + CDX — free, no auth, documented | low | €0.05 |
| **9** | **`package-download-stats`** (npm + PyPI trend) | Direct from the error log: a caller repeatedly fetched `pepy.tech` through `url-to-markdown` and 404'd (4×). Neighbours `npm-package-info` 10, `pypi-package-info` 10, `docker-hub-info` | npm registry downloads API + pypistats.org — both free, no auth, documented | near-zero | €0.03 |
| **10** | **`rss-feed-discover-parse`** | Complements #1 and `brand-mention-search`; neighbours `sitemap-parse` (17 calls), `meta-extract`, `link-extract` | HTTP + XML parse. No vendor. Qualifies for factory dark-launch (zero-maintenance class per DEC-20260812-A) | **zero** | €0.02 |
| **11** | **`us-federal-register-search`** | `compliance` is the **only 100%-completion category** (58/58 calls, €6.32); `eu-regulation-search` 5 calls / 100% / €1.50 at €0.30 — a €0.30 price point that clears | federalregister.gov API — free, official, no auth, US-government public domain | low | €0.10 |
| **12** | **`hn-search`** (Hacker News mentions) | `brand-mention-search` €9.00 at 100% completion is the strongest per-call signal in the catalogue; a second free mention source widens it without a vendor | HN Algolia API — free, no auth, documented. **Not Reddit** — Reddit is a confirmed dead end (`project_idealab_reddit_dead_end.md`) | near-zero | €0.03 |
| **13** | **`wikidata-entity-lookup`** | ⚠️ **Inferential, not direct.** `wikipedia` appears twice as a zero-result suggest query (weak). The real argument is the top wallet's breadth (91 capabilities in 30 days) — generic entity resolution is a universal agent primitive | Wikidata REST API / SPARQL — free, CC0, no auth | **zero** | €0.02 |
| **14** | **`austrian-company-data`** (Firmenbuch HVD) | ⚠️ **Not a revenue play.** `company-data` earns €2.15 across 5 capabilities and 16 registry capabilities have never sold. The case is **cost**: AT is currently served by a paid Tier-3 vendor with no directors, and a free official source with officers exists | Firmenbuch High-Value-Dataset API, live since Jan 2025, free, CC BY 4.0, official (KYB research §2.1, flag F3). **Verification debt: rate limits unpublished** (§5 V1) — resolve before building | low | €0.05 |

**Ranking logic:** 1–6 are direct neighbours of the traffic that pays today, cost nothing new to source, and carry near-zero maintenance. 7–12 are free official sources with a measurable-but-thinner hook. 13–14 are honest fillers with their weakness stated. Nothing on this list requires a new vendor relationship, a new licence decision, or a Browserless/LLM-extraction dependency — which is the factory guardrail from direction plan §3.5, applied.

### Explicitly declined, with recorded reasons (so they are not re-proposed)

| Idea | Requests | Decline reason |
|---|---|---|
| **Flight options / schedule search** | 3 real (PVG→ICN, comparison + sources) | **Source-blocked.** No free official source: Amadeus/Duffel are contracted-paid, OpenSky is aircraft positions not schedules. Revisit only if a vendor decision is opened |
| **Buy a physical product** ("cheapest white tiered skirt, ≤$2") | 1 | **Out of scope.** Agentic commerce, not a data capability |
| **`email-finder` / address discovery** | recurring temptation | **Permanently declined.** GDPR purpose limitation; our own transaction corpus may never be the source (CNIL/Kaspr €240k). Already in the `DEACTIVATED` map |
| **`keyword-metrics`** (volume/difficulty) | carried from 08-09 | Paid vendor (DataForSEO class). Needs a Tier-2 doctrine check + economics decision first — human call |
| **`us-trademark-search`** | carried from 08-09 | Blocked: the ODP key unlocks TSDR status-by-serial only; no public name-search API. Park |
| **`oauth`, `wikipedia`, `visa`, `airport`, `earthquake`, `battery`, `esg`…** | n = 1–4 each, zero-result suggest | **Bot/human browse noise.** Website-visitor population with €0 lifetime revenue. Not demand |
| **Arbor / agentdex / Hyperspell task prompts** | ~13 of 44 `no_match` rows | **Marketplace liveness probes and free-text reasoning tasks.** Never a capability gap. Filter these out of the intake loop by user-agent + task shape |

---

## 3. What to STOP maintaining

Applying the adopted quality floor (DEC-20260812-A: quarantine <70%, deactivate <30%, ≥10 real calls). **Caveat: measured over 90 days, not the specified 30-day window**, and — per §1.6 — the classifier that separates *upstream broken* from *correct input refusal* does not exist yet. Treat as a review list, not an execution list.

### 3a. Deactivate review (<30% completion, ≥10 external calls / 90d)

| Slug | 90d | Diagnosis |
|---|---|---|
| `danish-company-data` | **0/11** | 8 empty-input refusals + exhausted cvrapi.dk free quota. **Vendor problem.** Blocked on `datacvr.virk.dk` access (Petter's action) |
| `product-reviews-extract` | 18% (51) | 36× HTTP 403 — sites we may not read. **Delist or restrict inputs** |
| `charity-lookup-uk` | 20% (10) | 7× missing-input refusal. Likely fine; needs the classifier |
| `gdpr-fine-lookup` | 27% (11) | 8× missing-input + Browserless scrape |
| `image-resize` | 27% (11) | 3× missing `target_width`/`target_height` |

### 3b. Quarantine review (30–70%, ≥5 external calls / 90d)

`us-company-data` 35% · `price-compare` 38% · `ssl-certificate-chain` 40% · `receipt-categorize` 40% · `uk-companies-house-officers` 33% · `belgian-company-data` 44% · `lei-lookup` 44% · `french-company-data` 50% · `og-image-check` 50% · `job-posting-analyze` 54% · `prompt-optimize` 54% · `screenshot-url` 55% · `sitemap-parse` 59% · `url-to-text` 60% · `brazilian-company-data` 61% · `web-extract` 62% · **`invoice-extract` 63%** · `exchange-rate` 67%

Two of these are earners and must **not** be reflexively quarantined: `invoice-extract` (€6.00) and `screenshot-url` — the latter is Rank 0.1, a fix not a delisting.

### 3c. Total-failure capabilities (0% on 5 calls — below the threshold, above suspicion)

`pdf-extract` 0/5 · `swiss-company-data` 0/5 · `readme-generate` 0/5 · `schema-infer` 0/5 · `return-policy-extract` 0/5 · `terms-of-service-extract` 0/5

`pdf-extract` is a flagship extraction capability at 0/5 and has been on the "next session" list since 2026-08-09. Either fix it or delist it — a 0% flagship in the catalogue is exactly the "a catalog entry is a promise" violation the readiness program names.

### 3d. Never-sold, high-maintenance → delisting candidates

Never sold **and** `capability_type` in (`scraping`, `ai_assisted`) — these carry real maintenance cost against zero revenue:

`readme-generate` · `return-policy-extract` · `terms-of-service-extract` · `landing-page-roast` · `html-to-pdf` · `estonian-company-data` · `danish-company-data` · `diff-review`

### 3e. Never-sold, zero-maintenance → keep listed, stop investing

The 6 crypto address validators, the 4 Czech identifier validators, `schema-infer`, `workflow-security-audit`, `page-exists`, `c2pa-inspect`, and the 5 NL open-data capabilities cost nothing to keep listed and contribute to the breadth the top wallet demonstrably values. **But they are not free** — they consume test-scheduler budget against the 170:1 test-to-traffic ratio. Move them to the lowest test tier rather than delisting them.

### 3f. The uncomfortable one

The **16 country registries + 7 compliance capabilities** on the never-sold list are individually cheap to keep and expensive to have built. Recommendation: **keep them listed, stop expanding the set, and do not add country #21 without a named buyer.** Direction plan §4.5's trigger conditions already say this; the revenue data now says it with numbers. Note the one live counter-signal: `sanctions-check` (7 calls, 100%, €1.40) and `beneficial-ownership-lookup` (4 calls, 100%, €1.00) *are* being bought by agents — inside the library, at library prices, exactly as §4.5 predicted.

---

## 4. The weekly 15-minute demand-driven intake loop

### Step 0 — one-time prerequisite (without this, the loop is blind)

**Log x402 misses.** `x402-gateway-v2.ts` returns bare 404s at lines 876 and 1066 for unknown slugs. Add a `failedRequests` insert with `failure_type: 'x402_unknown_slug'` carrying the requested slug and the payer address if present. Also log x402 input-validation rejections. Until this ships, 92% of paid traffic produces no demand signal at all, and the loop below runs on the 8% that does.

Second prerequisite: **a noise filter**. Marketplace probes are identifiable by user-agent and task shape (`node` UA with `"Task type: reasoning"`, `agentdex.dev`, `Arbor`, `ping (capability probe`, and the `zzz-`/`totally-fake-`/`nonexistent-` negative-test family). Encode the filter once, in code, not in the operator's head.

### The loop — one command, five sections, ≤15 minutes

Ship `apps/api/scripts/demand-intake.ts --days 7`, printing exactly five blocks:

1. **New unmatched demand** — `failed_requests` (incl. new x402 misses), noise-filtered, normalised, grouped, with distinct-caller counts. *Only rows with ≥2 distinct callers appear.*
2. **Lost revenue leaderboard** — failed external calls × price, per capability, week over week, split `caller_input` / `upstream_blocked` / `our_bug` (the WS3 L1 classifier). *Anything with >€1.00 lost is an automatic Rank-0 candidate.*
3. **Floor movers** — capabilities that crossed 70% or 30% in either direction this week.
4. **New-capability adoption** — every capability added in the last 30 days with its external call count. *Zero after 14 days is a merchandising failure, not a demand failure — the fix is a `related_capabilities` hint, not a new build.*
5. **Wallet concentration** — top-3 wallet revenue share, and any wallet that went silent for >14 days. *This is the risk line, not the demand line.*

### The triage rubric — every item exits with a recorded decision

| Decision | Criterion |
|---|---|
| **FIX** | A capability we already list failed on real input. Beats every BUILD on expected value unless the lost-revenue figure is < €0.50 |
| **BUILD** | ≥2 distinct paying callers **and** a free/official or already-paid source **and** zero-maintenance class. Otherwise → ESCALATE |
| **MERCHANDISE** | The capability exists and the caller could not find it or named it wrong. Fix = alias, `related_capabilities` hint, or error-envelope example. Cheapest outcome available; check for it before BUILD |
| **ESCALATE** | Needs a new vendor, a licence judgement, spend above the €25 cap, a pricing change, or is DEC-20260428-B-grade. Petter only, per the escalation contract |
| **DECLINE** | Records one of: `no-free-source` · `tos-tier1-blocked` · `paid-vendor-uneconomic` · `duplicate-of-existing` · `bot-noise` · `out-of-scope` |

### Where decisions live

Append-only ledger at `docs/demand/intake-log.md`, one line per decision:

```
2026-08-19 | flight-options-search | DECLINE:no-free-source | 3 reqs, Amadeus/Duffel contracted-paid, OpenSky is positions only
2026-08-19 | google-news-search    | BUILD                  | serper /news, key live, near-zero maint
2026-08-19 | screenshot-url        | FIX                    | waitForSelector v1/v2 split, 24 fails, €1.30/90d
```

Greppable, diffable, and it makes re-proposals cheap to refuse — which is the actual failure mode this loop exists to prevent. Weekly Notion Journal entry stays as-is; the ledger is the working artifact.

### What makes it 15 minutes

The operator reads five short blocks and types one line per item. Everything upstream — noise filtering, normalisation, classification, thresholding — is code. If the loop ever takes 30 minutes, the filter is too loose, not the operator too slow.

---

## 5. Honest caveats — where the data is too thin to conclude

1. **Single-customer concentration is the dominant risk and it dwarfs every catalogue question.** One wallet is 53% of 90-day and ~91% of 30-day x402 revenue. If it stops, revenue falls to roughly **€10/month**. Every recommendation in §2 is a bet on that customer's cluster. That is the right bet on the evidence available, and it is a bet on **n = 1**.

2. **Wallet identity is unverified.** `0x9D3d…D837` calls 91–101 distinct capabilities continuously, 24/7, for 51 days. That is consistent with a production agent — and also with an evaluation harness, a competitor's benchmark, or an agent-marketplace crawler that happens to pay. Nothing in our data distinguishes these. Before building three capabilities for this customer, it is worth trying to find out who it is (the payer address is on-chain and public).

3. **`failed_requests` cannot rank anything today.** 77 rows, ~5 genuine signals, and the 92%-of-traffic rail doesn't write to it. Every conclusion in §1.2 is drawn from a sample too small to be statistically anything. The build list is therefore grounded in *purchase* data, not *miss* data — which is a weaker form of demand evidence (it shows what people buy, not what they wanted and couldn't get).

4. **The 90-day window contains a paid enumeration sweep.** Wallet `0x9CC42f…b176` bought 705 calls across 251 capabilities in 11 days (June 3–22) — €54.27, **22% of 90-day revenue**, and it has not returned since. Any per-capability ranking that includes June 3–22 overstates the long tail. The 30-day figures in this document are clean of it.

5. **The completion-rate metric conflates three different things** (§1.6) — upstream breakage, our bugs, and correct refusal of bad input. Every quality-floor number in §3 inherits that ambiguity. The classifier must land before the floor is trusted to deactivate anything.

6. **Production data-integrity issue found in passing — flagging, not diagnosing.** Several analytical queries over `transactions.audit_trail` across the 90-day window failed with `missing chunk number 0 for toast value 32384 in pg_toast_16411` (parent relation confirmed: `transactions`), reproducibly under parallel plans and not under `max_parallel_workers_per_gather = 0`. `audit_trail` is the EU AI Act compliance artifact and participates in the integrity-hash chain. This is out of scope here but should not be lost.

7. **The three capabilities shipped on 2026-08-08 have €0 external revenue** (`email-validate-bulk`, `domain-contact-extract`, `keyword-rank-check`). Four days is far too short to conclude anything — but it does mean the last demand-driven buildout cycle has not yet produced evidence that demand-driven buildout works. Note the base rate this sets: for a new capability to beat Rank 0.1 (`screenshot-url`, €1.30/90d recovered for a small fix), it must out-earn the median new capability by a wide margin.

8. **Nothing here measures cost.** Run cost is still unmeasured (readiness §5), the test-to-traffic ratio is ~170:1, and €249/90d is well under any plausible infrastructure bill. "Which capabilities are profitable" is a question this analysis cannot answer, and it may reorder §3 substantially when it can be.

---

## 6. Recommendation, stated so it can be argued with

**Stop treating the catalogue as the growth lever.** For two quarters the implicit theory has been *more capabilities → more discovery → more revenue*. The data does not support it: 255+ capabilities have been touched, 52 have never earned, the compliance wedge has earned nothing, and revenue is flat-to-declining while concentrating into one wallet.

The three things that actually move the number, in order:

1. **Fix what the paying customer already calls** (Rank 0). ~17% revenue uplift, no new sources, no new licences, no new maintenance.
2. **Build 6–8 tight neighbours of the SEO / lead-gen / company-intelligence cluster** (Rank 1–6, plus 7–9 if they still look good next month). Every one uses a source already paid for or free and official. This is `catalogue metabolism`, not growth — exactly as direction plan §3.5 frames it.
3. **Find out who `0x9D3d…D837` is.** One customer is the business. A single conversation with them is worth more than the entire build list above, and is the closest thing to customer discovery available on the library side.

Everything else — country #21, the next compliance module, the next zero-maintenance filler — should wait for the intake loop to name a buyer.
