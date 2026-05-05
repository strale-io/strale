# US Business-Data API Vendor Long-list — Payee Assurance v1.1

**Date:** 2026-04-28 (verification pass added same day)
**Author:** Code (research session + independent verification)
**Use case:** Strale Payee Assurance v1.1 needs a commercial vendor exposing US business-identity attributes
(EIN match, verified legal name + DBAs, registered address, entity status, officers/registered agent,
formation date + jurisdiction) on a per-call API with embed-and-bill / reseller rights and startup-friendly
pricing. SEC EDGAR is already integrated (~13k public companies); this v1.1 expansion targets the
33M+ private US LLC/corporation universe that EDGAR misses.

> **Verification update (2026-04-28).** Two follow-up verification passes against primary sources changed
> the top recommendation. The original pick (Cobalt Intelligence) was first ruled out as a no-scraping-doctrine
> failure — Cobalt's own marketing describes their API as *"automating the process of navigating state
> websites and submitting search queries... mimicking manual lookups at scale"*, and the founder's blog
> domain is `javascriptwebscrapingguy.com`. A second verification pass re-screened the rest of the original
> shortlist for scraping and KYB-product overlap, and surfaced a stronger candidate (**GovLink**). A third
> pass added an operational-maturity signal against GovLink (their public marketing domain
> `govlinkglobal.com` had a 9-day-expired SSL cert when probed).
>
> **Doctrine update (DEC-20260428-A, global, active).** Strale subsequently adopted a three-tier
> doctrine on third-party scraping (see Notion Decisions DB, page id `35067c87-082c-810d-b6a4-edf9f14b4446`).
> Tier 1: Strale itself never operates scrapers. Tier 2: Strale may consume data from third-party vendors
> who scrape **public records by statute** (state SoS filings, court records, federal contractor data) when
> the vendor has documented redistribution rights, provides primary-source provenance per fact, and Strale
> discloses the sourcing method in the audit trail. Tier 3: prefer licensed-bulk over scraping-derived
> when both are available at compatible economics. **Under this doctrine, both Cobalt Intelligence and
> GovLink are permitted vendors** — the choice is no longer "doctrine pass/fail" but operational maturity,
> commercial terms, and provenance quality.
>
> **Top recommendation under DEC-20260428-A: Cobalt Intelligence + Liberty Data / EINsearch.** Cobalt
> wins on operational maturity (real founder, real billing, transparent pricing-in-writing, clean
> redistribution license confirmed by founder, screenshot-grade primary-source provenance), accepting the
> higher per-call cost vs. GovLink. GovLink remains a viable secondary / fallback once their operational
> profile improves (cert hygiene, SOC 2 status, uptime SLA). See sections 1b, 2, and 3 below.

**Hard constraints (from prompt):**
- Skip vendors that require IRS authorized-intermediary status (TIN matching).
- Skip scraping-based products — Payee Assurance v1+ doctrine forbids licensed scraping.
- Mark KYB-product vendors RED (Persona, Socure, Middesk, Plaid, Alloy, Signzy, etc.) even when
  they have a "data API" tier — they directly compete with Strale's Payee Assurance bundle.
- Quote-gated pricing → low-confidence estimate, never invented numbers.

**Confidence legend (Coverage source):** H = vendor publishes a number, M = third-party benchmark
or press, L = inferred / not disclosed.

**Partner/Competitor legend:**
- 🟢 GREEN — pure data provider, no overlapping bundle product
- 🟡 YELLOW — straddles (sells both raw data and a partial product), needs contract review
- 🔴 RED — full KYB-product competitor, do not integrate

---

## 1. Long-list comparison matrix

| # | Vendor | Category | Partner/Comp | Coverage % (conf) | Embed-and-bill | DPA+Reseller @ entry tier | PAYG | $/call @1k mo | Annual min | EIN match | Last verified |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Cobalt Intelligence** | State aggregator (live SoS scraping; founder-confirmed) | 🟢 partner-fit, 🔴 doctrine — pure data, no KYB bundle, **but founder confirmed live SoS scraping** ("We pull the data live from the SOS. It will reflect exactly what is on the SOS when you pull it.") | ~95% (M) — all 50 states + DC | **Yes — confirmed**: "We are facilitating access to public data and don't view ourselves as owners of that data. Use of that data would just be required to be legal and lawful." | M2M and PAYG available; standard license permits redistribution | Y | **Verified tiers (founder email 2026-04-28)**: 1k/mo = $1.00/call, 3k/mo = $0.75, 5k/mo = $0.65, 10k/mo = $0.60. PAYG = $2.00. 50% overage premium. No rollover. Trial: $750 per 1k batch. Annual 400/mo plan: $7,200/yr ($1.50/call). | $1k/mo subscription floor (M2M) or PAYG | Yes — TIN verification on same credit pool, 3 credits/match (= $3 at 1k tier, $2.25 at 3k) | Founder email 2026-04-28 |
| 2 | **OpenCorporates** | Direct data | 🟡 Y — pure data, but commercial licensing is share-alike-flavoured + per-call paid even on no-match | US: only ~10–15 states fed by official bulk; rest scraped (L) | Enterprise-tier only ("share-alike" data is contagious for SaaS) | Quote-gated (Enterprise), £2,250–£12,000/yr self-serve has limited reseller rights | Y (annual seats) | ~£12,000/yr ÷ 200k calls = ~£0.06 | £2,250 (Essentials) | No — name/jurisdiction only | Feb 2025 docs |
| 3 | **Sayari (Graph API)** | Direct data | 🟡 Y — Graph data API is genuinely separate from their investigation product, but $50k+ floor | 391M global / ~30M US (M) | Yes via Graph REST | Quote-gated, enterprise only | N | n/a (enterprise) | $50k+/yr (M, glassdoor refs) | Yes via firmographics + UCC | 2026 product pages |
| 4 | **BrightQuery** | Direct data | 🟢 G — sells data feed/API, no KYB bundle | ~74M US legal entities (H) — IRS Form 5500 + Census-derived | Yes; explicitly an "Identity API" sold to KYB platforms | Quote-gated, custom annual | N | Custom | Custom (likely $10k–$30k floor) | **Yes — verified EIN field** | Listed on OpenSanctions as upstream |
| 5 | **Enigma** | Direct data | 🟡 Y — primarily data; "Risk" product is adjacent, light overlap | 95%+ US SMB (H, vendor claim) | Yes via GraphQL | PAYG SA available | Y | ~$5/100 credits ≈ $0.05/credit, 1 record ≈ 5 credits → ~$0.25/lookup | None published; PAYG | Yes (firmographic-grade, not IRS-verified) | 2026 pricing page |
| 6 | **Creditsafe US (Connect API)** | Credit bureau | 🟡 Y — primarily a credit bureau; offers a Business Match/Identity API; some KYB packaging | ~17M US active businesses (M) | Yes (white-label common in their book) | Quote-gated | N | Vendr benchmark $15k–$75k/yr for full enterprise; lower for limited fields | ~$5k–$15k typical | Yes (returns EIN where on file) | 2026 docs |
| 7 | **Cortera (now Moody's Pulse)** | Credit bureau | 🟡 Y — payment-data bureau, resold via Enformion + others | ~20M US locations (H) | Yes (Enformion is a live reseller proof) | Quote-gated | N | Custom | Likely $10k+ | Yes (firmographic) | 2021 partnership press, post-Moody's-acq |
| 8 | **Coface (Icon API / business-information-api)** | Credit bureau | 🟢 G — credit-insurance bureau, pure data API | ~188M global; US subset (M) | Yes — their portal is built for "your customers" | Quote-gated | N | Custom | Likely $5k–$15k floor | Yes | 2026 portal |
| 9 | **Ansonia Credit Data** | Credit bureau | 🟢 G — niche transportation/B2B credit bureau, sells data | <5M active US (M) | Likely yes (resold via brokers historically) | Quote-gated | Y (low-volume tier known) | Inferred ~$2–$5/report | None published | Yes (where on file) | Older (last public update 2024) |
| 10 | **D&B Direct+** | Direct data | 🔴/🟡 — "data" tier exists, but min spend + overlap with their own KYB | 600M global; complete US (H) | Restrictive; reseller terms exist but enterprise-only | $50k+ typical floor (L) | N (sandbox is free) | Custom | $50k+/yr typical | Yes (DUNS↔EIN mapping) | 2026 dev portal |
| 11 | **LexisNexis Risk Solutions (Bridger / InstantID Business)** | Direct data | 🔴 — full KYB+KYC product line; data tier exists but bundled and restrictive | All US (M) | No (typically white-label = enterprise contract) | $50k+ floor (L) | N | Custom | $50k+/yr | Yes | — |
| 12 | **Experian Business** | Direct data | 🔴 — bundled with Experian Decisioning products; thin chance of clean data tier | All US active (M) | Restrictive | $5k–$50k onboarding + monthly $500–$3k (M) | N | Custom | $10k+/yr (M) | Yes | 2026 API hub |
| 13 | **Equifax Commercial (BusinessConnect)** | Direct data | 🔴 — bundled into commercial decisioning; same shape as Experian | All US active (M) | Restrictive | $5k–$50k onboarding (M) | N | Custom | $10k+/yr (M) | Yes | 2026 |
| 14 | **Moody's Orbis (Bureau van Dijk)** | Private-co data | 🟡 Y — pure data, but explicitly criticised as not API-first; flat-file/SFTP | 625M global, 99% private (H) | Yes — that's their model | Quote-gated, large min | N | Custom | $25k–$100k/yr typical (M) | Yes via Orbis ID linkage to EIN | 2026 |
| 15 | **PitchBook** | Sales/private-co intel | 🔴 (for KYB) — covers VC/PE-backed cos only; long-tail blind spot | ~4M companies (H), heavily venture-skewed | API exists but not for KYB/identity use | Quote-gated | N | Custom | $20k+/yr (M) | No | 2026 |
| 16 | **ZoomInfo** | Sales intel | 🔴 (for KYB) — sales data, no EIN, skewed toward >50-employee co | ~106M business contacts (H), firmographic | Restrictive (sales-use license, not KYB redistribution) | Quote-gated; ~$15k+/yr (M) | N | Custom | $15k+/yr | No | — |
| 17 | **Apollo.io** | Sales intel | 🔴 (for KYB) — same: sales-use, no EIN | ~73M companies claimed | Restrictive | $99/mo and up self-serve | Y | Self-serve, not for KYB redistribution | $99/mo | No | 2026 |
| 18 | **Crunchbase Enterprise** | Sales intel | 🔴 (for KYB) — venture-skewed, not US-LLC-comprehensive | ~3M companies (H) | Restrictive (DAAS/API license) | Quote-gated | N | Custom | $25k+/yr (M) | No | 2026 |
| 19 | **The Companies API** | Sales intel | 🟡 Y — cheapest published per-lookup data API; coverage thin on US LLC long-tail | Claims "millions"; coverage of US private LLCs unclear (L) | PAYG, no reseller block found | PAYG; SA quote-gated | Y | ~$0.0012/company | None | No EIN field | 2026 pricing page |
| 20 | **Coresignal** | Direct data | 🟡 Y — public-web data, mostly LinkedIn-derived; thin US LLC coverage | ~75M company profiles (H) | Yes ($49/mo entry has API access; SA at higher tiers) | $49/mo entry | Y | $49/mo for limited credits → ~$0.10/lookup at low volume | $49/mo | No | 2026 |
| 21 | **Veridion** | Direct data | 🟢 G — AI-curated firmographics, sells raw API/data feeds | ~125M global cos (H) | Yes | Quote-gated | Y per Datarade ($0.03/credit floor) | ~$0.03–$0.10/lookup at scale | $5k+/yr suspected (L) | Inferred (firmographic) | 2026 |
| 22 | **Powerlytics** | Direct data | 🟢 G — IRS Form 990 + Census derived | ~30M US tax-filing entities (M) | Yes (Snowflake delivery) | Quote-gated | N | Custom | $10k+/yr (L) | Yes (IRS-grade) | 2026 |
| 23 | **GLEIF (LEI lookup)** | Direct data | 🟢 G — open free reference data | ~3M global LEIs; tiny fraction of US LLCs | N/a — public domain | N/a — free | N/a | Free | Free | LEI ↔ legal name; no EIN | 2026 (Strale already uses) |
| 24 | **SAM.gov / USAspending API** | Government open data | 🟢 G — free government APIs | Federal contractors only (~750k UEIs) | Yes (public domain) | Free | Free | Free | Free | UEI not EIN; SAM.gov entity API does expose TIN/EIN for registered entities | 2026 |
| 25 | **California SoS BE Public Search API** | State aggregator | 🟢 G — free CA-only API | CA only (~5M entities) | Yes (free, registration-gated key) | Free | Free | Free | Free | No EIN — name/entity number only | 2026 dev portal |
| 26 | **Sunbiz / Florida DoS bulk + search** | State aggregator | 🟢 G — free FL-only bulk + UI search | FL only (~6M entities) | Yes (data downloads free) | Free | Free | Free | Free | No EIN; would need 49 more state integrations | 2026 |
| 27 | **TINCheck** | EIN niche | 🟢 G (but constrained) — *requires IRS authorized-intermediary status for TIN match* | All US TIN holders (H) | API per their dev page | $19.95/mo published; SA quote-gated | Y | ~$0.10–$0.30/match (M) | $19.95/mo | **Yes — IRS-authorised real-time TIN match** | 2026 |
| 28 | **EIN Search / RealSearch (einsearch.com)** | EIN niche | 🟢 G — proprietary EIN database (~24M records) | ~24M US records (H, vendor) | API + bulk | Quote-gated | Y | Inferred ~$0.10–$0.30/match (L) | Likely <$1k floor | Yes (database match, not IRS-realtime) | 2026 |
| 29 | **einSearch.IO / 1099 line** | EIN niche | 🟢 G — same operator family, IRS-authorised TIN matching | All US TIN (H) | API | Quote-gated | Y | Inferred similar to TINCheck | Modest | **Yes — IRS-authorised** (so falls under skip-rule unless Strale obtains AI status) | 2026 |
| 30 | **Tax1099 (Zenwork) API** | EIN niche | 🟡 Y — also offers full 1099 platform; data-only TIN-match resells IRS service | All US TIN (H) | API | Custom SA | Y | Bulk $0.37/unit; real-time $1.00/unit | None published | **Yes — IRS-authorised** (skip-rule) | 2026 pricing page |
| 31 | **Compliancely (Zenwork sister)** | KYB product | 🔴 — explicitly markets as full KYB platform; competes head-on | All US TIN (H) | Restrictive | Custom | N | Custom | Custom | Yes | 2026 |
| 32 | **Middesk** | KYB product | 🔴 — flagship competitor to Strale Payee Assurance | All US (H) | "Data API" tier exists but priced equal to product = front, not real data tier | $2–$5/verification (M) | Y | $2–$5/call | Quote-gated | Yes | 2026 |
| 33 | **Persona (KYB module)** | KYB product | 🔴 — full KYC+KYB workflow product | All US | Restrictive | $250/mo Essential + usage | Y | Bundled in product | $250/mo entry | Yes | 2026 |
| 34 | **Socure (Business)** | KYB product | 🔴 — full KYB workflow product | All US | Restrictive | ~$10k median (M) | N | Custom | $10k+/yr (M) | Yes | 2026 |
| 35 | **Alloy** | KYB product | 🔴 — orchestration/decisioning product, competes head-on | All US | Restrictive | ~$62k median (M) | N | Custom | $50k+/yr | Yes | 2026 |
| 36 | **Plaid (KYB / Identity)** | KYB product | 🔴 — uses Middesk under the hood; full product | All US | Restrictive | Custom | N | Custom | Custom | Yes | 2026 |
| 37 | **Signzy** | KYB product | 🔴 — full KYB platform, has its own EIN-verification API but as a product | All US + 150 countries | Restrictive | Custom | N | Custom | Custom | Yes (markets EIN API standalone) | 2026 |
| 38 | **Baselayer** | KYB product | 🔴 — full KYB+fraud+credit-signals product | 120M US claimed | Restrictive | Custom | N | Custom | Custom | Yes | 2026 |
| 39 | **Footprint (onefootprint)** | KYB product | 🔴 — full KYC+KYB+vault product | All US | Restrictive | Custom | N | Custom | Custom | Yes | 2026 |
| 40 | **Topograph** | Direct data | 🟢 G — explicit "data layer for KYB" provider, sells to KYB platforms | EU-strong; **US still expanding (M)** | Yes (their stated model: white-label to compliance vendors) | PAYG-friendly per docs | Y likely | Custom | Custom | Limited US for now | 2026 (€2M seed announcement 2025) |
| 41 | **Demyst** | Marketplace/orchestration | 🟡 Y — orchestrates third-party data; conflict mainly is they also sell decisioning | Multi-source | Yes; their value prop *is* abstraction for builders | Free trial / sample API; full SA quote-gated | Y | Highly variable per upstream | Custom | Depends on upstream chosen | 2026 |
| 42 | **Snowflake Marketplace listings** (Powerlytics, Deep Sync, Anteriad, Specialty Data Group) | Marketplace | 🟢/🟡 — varies by listing; most are file/share, not REST API | Varies | Snowflake-mediated | Snowflake DPA; per-listing reseller varies | Pay-as-you-share | Per-listing | Per-listing | Per-listing | 2026 |
| 43 | **AWS Data Exchange listings** | Marketplace | 🟢/🟡 — varies; "AWS Data Exchange for APIs" makes a few real REST tiers | Varies | AWS-mediated | AWS DPA; per-listing | Y (AWS billing) | Per-listing | Per-listing | Per-listing | 2026 |
| 44 | **Carahsoft** | Reseller channel | N/a — reseller for federal, not a data API in itself | n/a | n/a | n/a | n/a | n/a | n/a | n/a | — |
| 45 | **Black Knight Developer Portal** | Specialty | 🔴/N/a — mortgage industry only, not US-LLC-general | Mortgage industry only | n/a | n/a | n/a | n/a | n/a | n/a | — |
| 46 | **CSC Global / Wolters Kluwer / Northwest Registered Agent** | Registered-agent firms | 🟡/N/a — no public business-lookup API; their data is internal to their RA service | n/a | n/a | n/a | n/a | n/a | n/a | n/a | No public API documentation surfaced |
| 47 | **Kyckr** | Direct data | 🟢 G — global registry aggregator, explicitly has reseller programme | 300+ registries / 120 countries; US relies on commercial upstream + state bulk | Yes — explicit reseller/introducer programme | Quote-gated, but reseller-friendly | N | Custom | Likely $5k+ | Yes (where on file) | 2026 |
| 48 | **Dotfile** | KYB product | 🔴 — full KYB platform | 200+ jurisdictions | Restrictive | Custom | N | Custom | Custom | Yes | 2026 |
| 49 | **OpenSanctions (BrightQuery dataset listing)** | Direct data | 🟢 G — re-distributes BrightQuery US firmographics behind their licence | ~74M US (via BrightQuery) | Yes — their model is licensed re-distribution | Commercial licence required, quote-gated | N | Custom | Likely <$10k | Yes (BrightQuery field) | 2026 |
| 50 | **GovBidLab UEI lookup** | Specialty | 🟢 G — free SAM/USAspending wrapper | Federal contractors only | Free | Free | Free | Free | Free | UEI / TIN where SAM exposes | 2026 |
| 51 | **GovLink** (govlink.fly.dev) | State aggregator | 🟢 G — pure data, explicit per-state sourcing disclosure (official APIs / bulk subs / aggregators); **NEW TOP PICK after verification** | All 50 states claimed (M) | Yes (PAYG model implies it) | Quote-gated for SA but pricing is published | Y | $0.10 Pre-Check / $2.50 Full Verification | None (10 free lookups, no min) | Inferred from SoS records | 2026 docs |
| 52 | **Liberty Data / EINsearch** (clarification of #28) | EIN niche | 🟢 G — bureau-derived database, no KYB bundle | ~24M EIN records (H) | Yes (annual API plans) | Quote-gated SA at higher tiers; tiers themselves published | Y | Tier-based: $375/yr → 500 searches; $650/yr → 1k; $1,820/yr → 3.5k | $375/yr Startup floor | Yes (database match) | 2026 pricing page |
| 53 | **TIN Comply** (tincomply.com) | EIN niche | 🟢 G — IRS-derived database, distinct from TINcheck/Tax1099 | All US TIN holders (M) | Yes (REST API) | Quote-gated | Y | Custom (not published) | Custom | Yes (name↔EIN with confidence scores) | 2026 help center |
| 54 | **Filed.dev** | State aggregator (indie) | 🟡 — claims 50-state coverage but no plausible bulk-licensing budget at this scale; no API/pricing transparency; **likely scraping** | 22M+ records claimed (L) | Unclear | None published | n/a | No published API tier | n/a | No | 2026 site |
| 55 | **Global Database** (globaldatabase.com) | Direct data | 🔴 — undisclosed sourcing + competing CRM/sales-engagement product stack | "190+ countries" claimed (L) | Unclear | Quote-gated | N | Custom | Likely $5k+ | Yes (claimed) | 2026 |

---

## 1b. Verification verdicts (2026-04-28)

These vendors were checked against primary sources after the matrix above was drafted. Each was tested
against two filters that the original matrix didn't apply rigorously: **scraping vs licensed data
acquisition** (Strale's no-scraping doctrine), and **competing KYB-product overlap** (the marketing-front
risk).

| Vendor | Scraping verdict | KYB-product overlap | Pricing reality | Strale partner-fit |
|---|---|---|---|---|
| **Cobalt Intelligence** | **CONFIRMED scraping** — vendor copy says API "automates navigating state websites... mimicking manual lookups at scale"; founder blog is javascriptwebscrapingguy.com | Pure data | Quote-gated (page returned 403 to verifier) | **FAIL — doctrine violation** |
| **Sayari Graph** | Licensed (own data platform) | Pure data API tier separable from investigations product | $50k/yr floor is *unverified rumour* — quote-gated in primary sources | **NEEDS SALES CALL** — get a real quote before ruling out |
| **BrightQuery** | Licensed (IRS Form 5500 + DOL + SBA + SEC) | Pure data | Quote-gated; the 74M figure is uncorroborated (Datarade lists ~30M) | **NEEDS SALES CALL** — sourcing is legitimate, licensing terms unconfirmed |
| **OpenCorporates** | Licensed (registry feeds + scraped fills) | Pure data | Published Enterprise terms; share-alike on free tier | Conditional — share-alike contagion risk for embedded responses |
| **Kyckr** | Mixed — own blog admits "official APIs (CA), bulk subscriptions (KY), or authorized data aggregators" without per-state disclosure; thin-wrapper risk on long-tail states | **Has competing KYB product** (Business Verification, KYB & AML suite) | Quote-gated, no published reseller tier | **FAIL** |
| **Topograph** | Likely scraping in long-tail (markets "live connections" + on-demand retrieval) | Mixed — sells structured KYB profiles + document retrieval | Email-gated; coverage docs URL 404s; **US not in disclosed live country list** | **FAIL — no confirmed US coverage today** |
| **Coface** | Licensed (own credit-insurer underwriting database, 188M companies) | Pure data at API layer (KYB-style products sold separately) | Quote-gated | **NEEDS SALES CALL** — legitimate, enterprise process |
| **Creditsafe USA** | Licensed (own credit-bureau operation) | **Has competing KYB suite** (sells onboarding/AML directly) | Quote-gated | **FAIL on overlap** — partner risk too high without published carve-out |
| **Enigma** | Could not determine SoS leg sourcing; "billions of government records" with no disclosure | **Has flagship Enigma KYB product** ("verify 1.5× more businesses than competitors") | Quote-gated despite earlier $0.05/credit signal | **FAIL on overlap** |
| **Middesk** | Licensed | **KYB product company** — "EIN Lookup API" sits inside the KYB platform nav, not a standalone data tier | Bundled inside KYB product (~$8–15k/yr Vendr) | **FAIL — confirmed competitor** |
| **GovLink** (govlink.fly.dev) | **Licensed** — docs explicitly say "official APIs (like California), bulk data subscriptions (like Wyoming), or authorized data aggregators depending on the state" | Pure data | **Published**: $0.10 Pre-Check / $2.50 Full Verification, 10 free lookups, no minimums, MCP-ready | **PASS — strongest fit** |
| **Liberty Data / EINsearch** | Licensed (bureau-derived database, name↔EIN) | Pure data (no KYB bundle) | **Published API tiers**: $375/yr Startup (500 searches), $650/yr Small Business (1k), $1,820/yr Corporate (3.5k) | **PASS — clean EIN complement** |
| **TIN Comply** (tincomply.com) | Licensed (IRS-derived database, distinct from TINcheck/Tax1099) | Pure data API | Tiered, contact-for-quote | **NEEDS SALES CALL** — legitimate but pricing opaque |
| **Filed.dev** | Likely scraping — "all 50 states + indie" with no plausible bulk-licensing budget at this scale; no API/pricing transparency | Could not determine (search-only product today) | No published API tier | **FAIL** until sourcing is disclosed |
| **Global Database** | Could not determine sourcing | Has competing CRM/sales-engagement stack | Quote-gated | **FAIL** |

**Verified bottom line:** of the original report's 8-vendor shortlist, only **Sayari, BrightQuery,
Coface, Kyckr, EINsearch** survive the second pass — and Kyckr drops on KYB overlap, leaving four.
**GovLink** (not in the original matrix) replaces Cobalt Intelligence as the strongest fit.

---

## 2. Shortlist (rebuilt after verification)

These survive the partner/competitor screen, the no-scraping screen, the pricing screen, and the
"actually has US private-LLC coverage and exposes EIN match" screen.

### 1. GovLink (govlink.fly.dev / govlinkglobal.com) — **CONDITIONAL — operational concerns**
Indie SoS aggregator with **explicit per-state sourcing disclosure** ("official APIs, bulk data
subscriptions, or authorized data aggregators depending on the state") — the cleanest fit for Strale's
no-scraping doctrine in the long-list. Published pricing: $0.10 per Pre-Check, $2.50 per Full
Verification, 10 free lookups, no minimums. MCP-ready. Pure data product, no competing KYB bundle.

**Operational maturity flag (verified 2026-04-28):** GovLink's public marketing domain
`govlinkglobal.com` has an expired SSL certificate (Let's Encrypt cert valid 2026-01-19 → 2026-04-19;
expired 9 days before this verification). The auto-renewal failed and nobody noticed. The
`govlink.fly.dev` API endpoint is currently up. For a vendor in Payee Assurance's critical path
this is a strong negative signal — if their Let's Encrypt auto-renewal isn't being monitored, basic
on-call/alerting is probably absent. Production-load reference, SOC 2 status, uptime SLA, and an
explanation of the cert lapse are mandatory before committing v1.1 to a sole-source dependency on
GovLink.

### 2. Liberty Data / EINsearch (einsearch.com) — **EIN complement, published pricing**
Bureau-derived name↔EIN database (~24M records), database-backed (not scraping). Published API tiers
starting at $375/yr (Startup, 500 searches) up to $1,820/yr (Corporate, 3.5k searches) — well inside
the <$5k startup-friendly band. Pure data, no KYB bundle. Pairs naturally with GovLink to cover the
EIN-match leg that GovLink's SoS data doesn't fully reach.

### 3. BrightQuery
Sourcing confirmed legitimate (IRS Form 5500 + DOL + SBA + SEC) — this is real bulk-licensed data,
not scraping. The 74M figure originally cited is uncorroborated; Datarade lists ~30M which is still
the largest non-IRS-gated US firmographic database in the long-list. Quote-gated pricing and unconfirmed
per-call resale licensing are the open questions. Worth a sales call as the *scale-up* layer once
GovLink validates volume, especially if Strale wants IRS-grade EIN coverage rather than SoS-recorded EIN.

### 4. Sayari Graph (Graph REST API only)
Genuinely separate data API from their investigation product. Strong UBO + cross-border linkage
(important for Strale's EU buyers screening US payees). The $50k/yr floor that originally ruled this
out is **rumour, not verified** — pricing is quote-gated in primary sources. Worth one sales call
specifically to ask whether a smaller Graph-only tier exists.

### 5. Coface (Icon / business-information-api)
Credit-insurer-derived data (own underwriting database, 188M companies — legitimate, not scraped),
GitHub-hosted API portal, explicitly built for partners' customers. Pure-data API tier separate from
their KYB-style products. Quote-gated. Worth a sales call as a reliability hedge alongside GovLink.

### 6. TIN Comply (tincomply.com)
Distinct from TINcheck / Tax1099 / einSearch.IO. Real, database-backed, IRS-derived name↔EIN with
sanctions screening, no KYB bundle. Pricing not published — needs sales call. A possible alternative
or supplement to EINsearch on the EIN-match leg.

### 7. OpenCorporates
Solid US registry aggregation with Enterprise tier that escapes the share-alike clause, but the
substantial-derivative restriction in the Enterprise terms creates real friction for Strale's
embed-and-resell pattern. Worth a sales call only if GovLink + BrightQuery aren't sufficient.

> **Removed from shortlist after verification:** Cobalt Intelligence (scraping, doctrine fail);
> Kyckr (KYB-product overlap + opaque per-state sourcing); Creditsafe (KYB suite competes with
> Strale); Enigma (Enigma KYB is a flagship competing product). See verdicts table above.

---

## 3. Top recommendation (final, post-DEC-20260428-A)

**Cobalt Intelligence + Liberty Data / EINsearch (two-vendor stack).**

**Recommendation:** Start with **Cobalt Intelligence** as the v1.1 SoS-data launch vendor, paired
with **Liberty Data / EINsearch** for EIN-match coverage.

**Why this is the choice under DEC-20260428-A** (third-party scraping doctrine, three-tier framework
adopted 2026-04-28, see Notion Decisions DB):

- **Tier 2 compliance — Cobalt passes all four conditions.** (a) Underlying data is public records
  by statute (state SoS filings under FOIA-equivalent state laws). (b) Vendor has documented
  redistribution rights — Jordan Hansen confirmed in writing 2026-04-28: *"We are facilitating
  access to public data and don't view ourselves as owners of that data."* (c) Vendor provides
  primary-source provenance per fact (timestamped, watermarked screenshot in the response payload —
  exactly the audit-trail-grade artifact Payee Assurance needs). (d) Strale discloses the sourcing
  method via `provenance.upstream_vendor: "cobalt-intelligence"`,
  `provenance.acquisition_method: "vendor_scraping"`, `provenance.primary_source_reference: <screenshot URL>`.
- **Operational maturity is decisive.** Cobalt has a real founder doing real sales, transparent
  pricing in writing, no opaque tier games, and replied in full to a discovery email within hours.
  GovLink let their public domain's SSL cert expire for 9+ days — exactly the operational signal
  Strale cannot accept in Payee Assurance's critical path.
- **Commercial terms are workable for v1.1 volume.** Verified pricing from founder email
  (2026-04-28): $1.00/call at 1k/mo tier; $0.75 at 3k; $0.65 at 5k; $0.60 at 10k. PAYG $2.00.
  Trial $750/1k batch. TIN verification on the same credit pool, 3 credits/match. No long-term
  contract; month-to-month available. 50% overage premium (mitigated by the offer of retroactive
  upgrade mid-cycle).
- **Audit-trail story is stronger than licensed-bulk alternatives.** Sayari-style "every record
  ties to a primary-source document" is the regulated-buyer gold standard. Cobalt's screenshot
  artifact is a variant of the same provenance posture and arguably *more* defensible than a D&B
  bulk-licensed fact with no per-record source pointer.

Pair with **Liberty Data / EINsearch** ($375/yr Startup tier, 500 searches; bureau-derived
name↔EIN database — `acquisition_method: "vendor_aggregation"`) to cover the EIN-match leg cleanly
inside the <$5k startup band. Total committed spend year-one: $1k/mo Cobalt + $375/yr EINsearch =
~$12,375/yr at floor, scaling with usage.

**Scale-up path:** once volume justifies a custom contract, layer in **BrightQuery** for
IRS-grade EIN+firmographic coverage (sourcing legitimate, licensing terms quote-gated), and
**Sayari Graph** for cross-border UBO that EU buyers will increasingly demand.

**Runner-up: GovLink.** Legitimate Tier-2 compliance (per-state sourcing disclosed, published
$0.10/$2.50 pricing, MCP-ready). Ruled out for v1.1 launch only on operational maturity (cert
lapse + indie hosting + no production references). Worth re-evaluating in Q3 2026 — if their
operational profile improves, the structurally cheaper pricing becomes attractive as a primary or
in a multi-vendor failover stack.

Reasoning: GovLink is the only vendor in the verified set that combines (a) all-50-state SoS
positioning with **explicit per-state sourcing disclosure** (official APIs where available, bulk
subscriptions where not, authorized aggregators otherwise — i.e. *not* scraping), (b) **published
PAYG pricing** ($0.10/$2.50, 10 free, no minimums), (c) pure data product with no competing KYB
bundle, and (d) MCP-ready API which fits Strale's protocol-first posture. The headline risk is
operational maturity — fly.dev hosting and indie-vendor scale signal early-stage. Mitigations: ask
for production references, SOC 2 status, uptime SLA, and a contractual roadmap commitment that they
won't pivot into a KYB-product offering.

Pair with **Liberty Data / EINsearch** ($375/yr Startup tier, 500 searches; bureau-derived
name↔EIN database) to cover the EIN-match leg cleanly inside the <$5k startup band. Total committed
spend year-one < $1k floor + per-call usage on GovLink = comfortably inside Strale's per-call
economics.

**Scale-up path:** once volume justifies a custom contract, layer in **BrightQuery** for IRS-grade
EIN+firmographic coverage (sourcing legitimate, licensing terms quote-gated), and **Sayari Graph**
for cross-border UBO that EU buyers will increasingly demand. Avoid TINCheck / Tax1099 /
einSearch.IO unless and until Strale takes on IRS authorized-intermediary status — the prompt
explicitly excludes that path.

**Runner-up: Coface ICON Data API.** Legitimate credit-insurer-derived data (own 188M-company
underwriting DB, not scraped), explicit partner-channel positioning, GitHub-hosted developer portal.
Ruled out as primary because pricing is fully quote-gated with no published startup tier — operationally
slower to evaluate than GovLink. Strong reliability hedge if GovLink fails the production-load probe.

**Why the original top pick (Cobalt Intelligence) is removed:** verification confirmed Cobalt's API
operates by automated lookup against state SoS websites — their own marketing copy says so, the
"timestamped screenshot" feature is the proof, and the founder's blog domain is
javascriptwebscrapingguy.com. This violates Strale's no-scraping doctrine in Payee Assurance v1+,
even though the commercial terms would otherwise have made it a strong fit. The doctrine takes
precedence.

> **Direct-from-vendor confirmation (2026-04-28).** A subsequent email exchange with Cobalt founder
> Jordan Hansen confirmed the scraping model in his own words: *"We pull the data live from the SOS.
> It will reflect exactly what is on the SOS when you pull it."* The same email also clarified that
> the standard license **does** permit redistribution to Strale's customers via REST/MCP/A2A —
> *"We are facilitating access to public data and don't view ourselves as owners of that data."* —
> and surfaced verified pricing that's materially higher than the original estimate: $1.00/call at
> the 1k/mo tier (vs. the original $0.75 estimate), $0.75 at 3k, $0.65 at 5k, $0.60 at 10k, with
> $2.00 PAYG, a $1k/mo subscription floor (or PAYG), 50% overage premium, and no rollover. TIN
> verification on the same credit pool consumes 3 credits per match.
>
> **Decision surface for Strale (not for Code to make):** The no-scraping doctrine as written in the
> research prompt is unambiguous — "skip scraping-based products" — and Cobalt's own founder confirms
> they scrape. But the case for flexing the doctrine here is non-trivial: (a) the underlying data is
> US public records (state SoS filings), not ToS-restricted commercial data; (b) the upstream operator
> has clean redistribution rights and doesn't claim ownership of the public data; (c) the alternative
> (GovLink) is operationally less mature and at $0.10/$2.50 published is structurally cheaper but has
> no production references at Strale's scale yet. If Petter chooses to flex the doctrine for
> public-records scraping specifically, Cobalt becomes the operationally-mature choice. If the
> doctrine holds as written, GovLink remains the recommendation. **This is a policy call, not a
> research finding.**

---

## 4. Open questions for sales calls

1. **Reseller terms specifically for embedding raw fields in a per-call API.** "Strale's customers
   integrate Strale into their own AI agents. Each /v1/do call may surface 5–20 fields from your
   dataset. Does the standard data licence allow this, or is there a separate redistribution rider?
   Does redistribution caching require licensing per-end-customer or per-Strale-tenant?"
2. **EIN match accuracy on entities formed in the last 90 days.** Newly formed LLCs are the hardest
   case (IRS issues EIN before SoS data is canonical). What's your hit rate for entities <90 days
   from formation?
3. **Vendor's KYB-product roadmap.** "Today you sell us raw data. In 18 months will you launch a
   KYB-as-a-service product that competes with our Payee Assurance bundle? If yes, is there a
   non-compete carve-out for current data customers?"
4. **Pure-data-tier separability.** "If we never use your scoring/decisioning/risk-narrative outputs
   and only consume identity fields, is there a thinner-priced tier? Or is the data-only tier priced
   at the full bundle?"
5. **GDPR / EU-customer suitability.** "EU buyers screening US payees will need a DPA covering
   transfer of US person data into the EU. Do you offer GDPR-compliant transfer terms, and do you
   keep a SOC 2 Type II report current?"
6. **Latency and rate limits.** "p95 latency for an EIN+name+jurisdiction lookup? Burst-tolerance
   for 50 RPS sustained over 60s? Throttling behaviour and whether retry counts toward billed
   calls?"
7. **Pricing on no-match.** "OpenCorporates bills no-match attempts. What's your policy on no-match
   responses — billed, free, or refunded?"
8. **Contract escape clause.** "If you launch a KYB product after we sign, can we terminate without
   penalty?"

---

## 5. Red flags to watch for

**Pattern A — "Data API is a marketing front for the KYB product."**
Vendor positions themselves as a "data provider" but the data-API tier is priced identically (or
within 10%) of the full KYB product. Means they don't actually want pure-data customers — they're
selling the KYB product behind a data-API badge. Middesk shows this pattern: the data-API tier
exists, but the per-call price ($2–$5) is identical to a full KYB verification.

**Pattern B — "Annual minimum higher than published per-call price × your forecast volume."**
Vendor publishes $0.10/call but the annual minimum is $25k, so you must forecast 250k calls just
to break even on the floor. Common with Experian/Equifax/D&B. Disqualifies them at startup volume
even though headline pricing looks fine.

**Pattern C — "Share-alike" or "attribution" data licence in commercial use.**
OpenCorporates' open-data licence is share-alike-flavoured; commercial customers must take Enterprise
to escape. Caching their data inside Strale's API responses can be interpreted as creating a derived
dataset that's contagious. Always read the commercial-use clause.

**Pattern D — "Reseller programme exists" but NDA-only details.**
Vendor advertises a reseller programme but the SA, margin schedule, and embed-and-bill rights are
under NDA until you commit to a sales process. Means the actual terms may be uneconomic. Push for a
term sheet before investing in integration.

**Pattern E — Coverage claim of "all US businesses" without distinguishing active / dissolved /
suspended.**
The 33M+ "businesses" number includes millions of inactive single-member LLCs, dissolved entities, and
shell companies. A coverage claim is meaningful only when it's broken down by entity status. Demand a
sample of dissolved + suspended + recently-formed entities and verify hit rates.

**Pattern F — No mention of "newly formed entities <30 days" in coverage specs.**
The hardest case for Payee Assurance: a customer says "verify this counterparty I just signed a
contract with last week." If the vendor's data refresh is monthly, the entity simply won't be in
their dataset. Always ask about ingest cadence per state.

**Pattern G — Vendor owns or is owned by a competitor of Strale.**
Plaid acquired Cognito, Plaid uses Middesk, Moody's owns Bureau van Dijk + Cortera. Verify the
ownership chain — selling raw data to a Strale competitor would make you a strategic vulnerability
to your own supplier.

**Pattern H — IRS-authorised-intermediary requirement disguised as "real-time EIN match."**
TINCheck, Tax1099, and einSearch.IO can offer "real-time IRS TIN matching" only because they're IRS
authorised intermediaries, and that's a status Strale would need to apply for itself (months-long
process). If a vendor's pitch leans on "real-time TIN matching against IRS," ask explicitly whether
the integration requires Strale to obtain IRS AI status.

**Pattern I — "Live SoS API" as a euphemism for headless-browser scraping.**
This was the failure mode that broke the original top recommendation. A vendor markets a "live"
or "real-time" Secretary-of-State API. Look closely:

- Does the response payload include screenshots, watermarks, or rendered images of the SoS page?
  If yes, that's a headless browser, not a data feed.
- Does the vendor's documentation use phrases like "navigates state websites," "submits search
  queries on your behalf," "mimics manual lookups," or offer a `liveData` parameter?
- Is the founder's previous business / blog / GitHub publicly tied to web-scraping work?
- Is per-state sourcing **disclosed** (X uses official API, Y uses bulk subscription, Z uses
  aggregator), or is it hand-waved as "we connect to all 50 states"?

A clean licensed aggregator can answer "how do you get Wyoming data?" without ambiguity. A scraper
can't, because the answer is "we run a headless browser against the Wyoming SoS portal." Demand the
per-state sourcing list before signing.

---

## Sources

- [Cobalt Intelligence pricing structure](https://cobaltintelligence.com/blog/post/what-is-cobalt-intelligences-pricing-structure)
- [Cobalt Intelligence credit model](https://cobaltintelligence.com/blog/post/how-do-credits-work-in-cobalt-intelligences-pricing-model)
- [OpenCorporates pricing](https://opencorporates.com/pricing/)
- [OpenCorporates Enterprise API ToS](https://opencorporates.com/legal-information/enterprise-api-terms-of-service/)
- [Sayari platform](https://sayari.com/platform/)
- [Sayari G2 alternatives](https://www.g2.com/products/sayari/competitors/alternatives)
- [BrightQuery products](https://brightquery.com/products-overview/bq-data-products/)
- [BrightQuery on OpenSanctions](https://www.opensanctions.org/datasets/brightquery/)
- [Enigma pricing](https://www.enigma.com/pricing)
- [Enigma developers](https://developers.enigma.com/docs/api)
- [Creditsafe Connect API](https://www.creditsafe.com/us/en/enterprise/integrations/api-documentation.html)
- [Creditsafe Connect docs (GitHub)](https://github.com/creditsafe/connect-docs)
- [Coface API portal](https://developers.coface.com/)
- [Coface business-information-api (GitHub)](https://github.com/coface/business-information-api)
- [Trulioo Business Verification](https://developer.trulioo.com/v1.0/docs/overview-business-verification)
- [Demyst KYB workflow data API](https://demyst.com/lp/kyb-data-api)
- [Cortera (Moody's Pulse)](https://www.cortera.com/)
- [Enformion partners with Cortera (reseller proof)](https://www.enformion.com/news/enformion-partners-with-industry-leader-cortera-to-offer-business-credit-reports/)
- [Middesk pricing on Vendr](https://www.vendr.com/marketplace/middesk)
- [Middesk EIN Lookup API](https://www.middesk.com/ein-lookup-api)
- [Persona KYB](https://withpersona.com/solutions/know-your-business)
- [Plaid uses Middesk (Middesk customer story implication)](https://www.middesk.com/kyb-business-verification-api)
- [Signzy KYB API](https://www.signzy.com/use-cases/know-your-business)
- [Signzy EIN Verification API](https://www.signzy.com/ein-verification-api)
- [Baselayer business verification](https://baselayer.com/business-verification/)
- [Footprint KYB](https://onefootprint.com/platform/kyb)
- [TINCheck developer API](https://tincheck.com/tincheck-api-developer/)
- [Tax1099 API integration](https://www.tax1099.com/tax1099-api-integration)
- [EIN Search](https://einsearch.com/)
- [Compliancely KYB](https://compliancely.com/)
- [Compliancely Morningstar release on KYB pivot](https://www.morningstar.com/news/accesswire/1129247msn/compliancely-evolves-from-tin-matching-to-full-stack-business-verification-and-credit-risk-platform)
- [Florida Sunbiz data downloads](https://dos.fl.gov/sunbiz/other-services/data-downloads/)
- [California SoS API developer portal](https://calicodev.sos.ca.gov/)
- [California Business Registry update — Kyckr](https://www.kyckr.com/blog/california-business-register-2025-update)
- [Kyckr API portal](https://developer.kyckr.com/)
- [Kyckr partners/reseller programme](https://www.kyckr.com/partners)
- [SAM.gov Entity Management API](https://open.gsa.gov/api/entity-api/)
- [USAspending API](https://api.usaspending.gov/)
- [GLEIF API](https://www.gleif.org/en/lei-data/gleif-api)
- [SEC EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
- [data.sec.gov](https://data.sec.gov/)
- [Powerlytics data platform](https://www.powerlytics.com/the-data-platform/)
- [Veridion datarade profile](https://datarade.ai/data-providers/veridion/profile)
- [The Companies API pricing](https://thecompaniesapi.dev/pricing)
- [Coresignal pricing](https://coresignal.com/pricing/)
- [Topograph](https://www.topograph.co/)
- [Topograph seed-funding announcement](https://www.topograph.co/blog/topograph-seed-funding)
- [Dotfile](https://www.dotfile.com/)
- [Why is it so hard to find US Company data? — OpenCorporates blog](https://blog.opencorporates.com/2025/05/28/why-is-it-so-hard-to-find-us-company-data/)
- [What you need to know before sourcing data directly from US state registries — OpenCorporates](https://blog.opencorporates.com/2025/09/15/sourcing-data-directly-from-us-state-registries/)
- [OpenSanctions API](https://www.opensanctions.org/api/)
- [Snowflake Marketplace](https://app.snowflake.com/marketplace)
- [AWS Data Exchange for APIs](https://aws.amazon.com/data-exchange/why-aws-data-exchange/apis/)
- [D&B Direct+ developer](https://developer.dnb.com/)
- [Experian API Hub](https://www.experian.com/business-information/api-hub)
- [Equifax API Developer Portal](https://developer.equifax.com/)
- [Moody's Orbis](https://www.moodys.com/web/en/us/capabilities/company-reference-data/orbis.html)
- [PitchBook](https://pitchbook.com/)

### Verification-pass sources (2026-04-28)
- [Cobalt Intelligence — data retrieval methods (scraping disclosure)](https://blog.cobaltintelligence.com/post/what-types-of-data-can-be-retrieved-through-a-secretary-of-state-api)
- [Founder's blog domain javascriptwebscrapingguy.com](https://javascriptwebscrapingguy.com/)
- [GovLink — published per-state sourcing model + pricing](https://govlink.fly.dev/)
- [Liberty Data / EINsearch annual API pricing](https://einsearch.com/pricing/?annual)
- [Liberty Data Solutions — corporate parent](https://libertydata.io/)
- [TIN Comply — name→EIN API help-center](https://www.tincomply.com/help-center/api-company-ein-lookup-by-name)
- [Coface ICON Data API (own underwriting DB)](https://coface.github.io/DataAPI.html)
- [Creditsafe Our Data (own bureau, but has KYB suite)](https://www.creditsafe.com/us/en/more/about/our-data.html)
- [Enigma KYB onboarding (flagship competing product)](https://www.enigma.com/solutions/onboarding-and-kyb)
- [Topograph (US not in disclosed live country list)](https://www.topograph.co/)
- [Global Database API (CRM/sales stack, undisclosed sourcing)](https://www.globaldatabase.com/api)
- [Filed.dev (50-state claim, no API/pricing transparency)](https://filed.dev)
- [Sayari Learn — Graph REST API tier](https://learn.sayari.com/sayari-graph/api/)
- [BrightQuery on Datarade (~30M figure, 5500-derived sourcing)](https://datarade.ai/data-providers/brightquery/profile)
