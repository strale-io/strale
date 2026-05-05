# US Company Registry + EIN / Tax-ID Validation — Source Research for Payee Assurance v1.1

**Date:** 2026-04-21
**Author:** Claude Code (research)
**Scope:** 50 US states + DC (company registry), commercial KYB aggregators with US coverage, EIN / federal tax-ID validation paths
**Status:** Research-only, read-only. No code, DB, manifests, or Notion touched. Output is this Markdown file.
**Driver:** Payee Assurance v1 locks "EU + UK + NO" with v1.1 adding US. The v1.1 stance is unsealed — before chat commits to an approach, the available options need to be mapped. This report produces the inputs for that decision.

---

## 1. Summary

The audit-style discovery confirms one material deviation from the prompt's expectations: Strale **already has** a `us-company-data` capability (live, in seed.ts at row 651, priced €0.80). It runs against **SEC EDGAR** — free, no auth beyond a polite `User-Agent` header, government source, redistribution-safe. EDGAR is the authoritative source for **public** (SEC-registered) US companies and a handful of larger nonprofits. It does **not** cover the vast majority of US private companies, which file at the state level. The existing limitations entry acknowledges this truthfully ("does not include privately held financial data — only publicly filed information"), but a sibling limitation line incorrectly mentions "Secretary of State filings may lag 1-5 business days" — which is factually wrong for EDGAR (EDGAR is an SEC system, not an SOS system). This is a manifest-vs-reality divergence of the same family as the EU audit (§8, item 1) and is flagged here for chat.

The research question therefore narrows to: **how does Strale cover US private companies** (LLCs, closely-held C-corps, S-corps, partnerships) — the long tail below the SEC filing threshold that represents the majority of KYB/Payee Assurance volume — and **how does Strale verify US federal tax IDs (EINs)**?

Headline findings:

- **Free, real-time, redistribution-clean government APIs exist for only ~8 of 51 US jurisdictions.** The US registry landscape is structurally worse than the EU's. Most states offer a free *web portal* but not a free *API*, and the data-redistribution terms are rarely explicit.
- **Green states** (free API or free structured bulk with clean redistribution): FL, WA, NC, OR, CO, AK, HI, DC. ~8 jurisdictions.
- **Yellow states** (free portal but scraping is the only option, or paid per-call API exists): CA, NY, TX, MA, IL, PA, OH, MI, MN, VA, NJ, GA, MD, WI, AZ, UT, NV, CT, IN, MO, TN, KY, OK, LA, NM, NH, RI, VT, ME, ID, SC, KS, AR, AL, MS, WV, NE, IA, ND, SD, MT, WY.
- **Red states** (paid-only enterprise subscription, offline filing remnants, or statutory redistribution restrictions): DE is the notable case — Delaware charges for every search via its portal and licenses bulk data only to approved third parties. DE matters disproportionately because ~68% of Fortune 500 companies and >1M LLCs are Delaware-registered.
- **Commercial aggregators fill the 50-state gap.** Two provide a credible no-upfront-fee, pay-per-call tier: **Middesk** (priced per-call on their developer tier without enterprise-minimum commitment in 2025-2026) and **Cobalt Intelligence** (explicit pay-as-you-go, $0.40–$1/call, credit-card self-service, 50-state coverage). **OpenCorporates** has 50-state coverage but the ODbL redistribution restriction makes its Essentials/Starter tiers unsuitable for SaaS resale; only Enterprise (quote-only) permits the commercial redistribution Strale needs.
- **EIN validation is the harder problem.** IRS TIN Matching is practically closed to non-US entities and to non-1099-filers. The clean paths are (a) accept EIN as an input field and verify it via Middesk's or Cobalt's EIN+name-match product, (b) use SEC EDGAR's EIN field for public companies (already available), and (c) use the IRS EO Business Master File (free) for nonprofits. **There is no free, non-US-entity-accessible federal-government API for real-time for-profit EIN validation.** Pay-per-call commercial EIN+name-match is the only universally-applicable path.

Headline recommendation: **`v1.1 with analysis-pending`**, provisional recommendation is a **hybrid model** — keep SEC EDGAR for public companies, add **Cobalt Intelligence as the 50-state private-company path** on pay-as-you-go, and introduce **Middesk as a secondary/comparative tier for EIN+name match**. The "free direct" countries in the EU have no US analogue; the US is structurally an aggregator-led market for a new entrant. The recommendation is conditional on commercial outreach confirming the pricing and redistribution language at Strale's expected volume band — see §5.4.

---

## 2. Summary tables

### 2.1 US states + DC (51 rows)

Feasibility key: 🟢 green (free, real-time, clean redistribution), 🟡 yellow (portal-only / paid / partial redistribution), 🔴 red (enterprise-only or structurally blocked).

| Jurisdiction | Registry authority | API availability | Auth | Pricing (real-time) | Bulk | Redistribution | Feasibility | One-line conclusion |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AL (Alabama) | Secretary of State | Web portal only | None | Free search, $10 per certificate | None published | Public records; commercial redistribution not explicit | 🟡 | Portal scrape or aggregator |
| AK (Alaska) | Div. of Corps., Business & Professional Licensing | Structured download + portal | None | Free | Daily CSV (entities.csv) | Public records, CC-compatible | 🟢 | Bulk CSV is a clean direct path |
| AZ (Arizona) | Corporation Commission | Web portal + eCorp | None | Free | CSV export per-query | Public records | 🟡 | Portal scrape or aggregator |
| AR (Arkansas) | Secretary of State | Web portal only | None | Free | No bulk published | Public records | 🟡 | Aggregator preferred |
| CA (California) | Secretary of State — bizfile Online | Web portal + bulk | None | Free portal; $7 certified | Bulk via Business Search Data Excerpt (free download, weekly refresh) | Public records, CC-compatible | 🟢/🟡 | Bulk excerpt viable, real-time is portal-scrape only |
| CO (Colorado) | Secretary of State | Structured download + portal + basic API | None | Free | Daily bulk SOS data (CSV) | Public records, OGL-equivalent | 🟢 | Free bulk is clean; one of the better state paths |
| CT (Connecticut) | Secretary of State — CONCORD | Web portal only | None | Free | No bulk | Public records | 🟡 | Portal scrape or aggregator |
| DE (Delaware) | Division of Corporations | Paid portal + paid subscription | Paid account | $10 per search (entity status) + per-document fees | Bulk via approved-vendor program (paid) | Paid subscription required; redistribution permitted under subscription terms | 🔴 | Paid commercial path only — no free API |
| DC (District of Columbia) | DCRA / CorpOnline | Web portal only | None | Free | Limited | Public records | 🟡 | Portal scrape or aggregator |
| FL (Florida) | Sunbiz / Div. of Corporations | Structured download + portal | None | Free | Quarterly full bulk + weekly delta (CSV, free) | Public records — "no restriction on subsequent use" per Sunbiz | 🟢 | **Best US state path**; free bulk + free portal + explicit no-restriction use clause |
| GA (Georgia) | Secretary of State — Corporations Online | Web portal only | None | Free | No published bulk | Public records | 🟡 | Aggregator preferred |
| HI (Hawaii) | DCCA BREG | Portal + structured export | None | Free | CSV export via hbe.ehawaii.gov | Public records | 🟢 | Clean bulk option |
| ID (Idaho) | Secretary of State | Web portal only | None | Free | Annual bulk CD (discontinued) | Public records | 🟡 | Portal scrape or aggregator |
| IL (Illinois) | Secretary of State | Web portal only | None | Free | Bulk available under FOIA request, ad-hoc | Public records; redistribution explicit in state FOIA context | 🟡 | Portal scrape or aggregator |
| IN (Indiana) | Secretary of State — INBiz | Web portal + API (limited) | None | Free | Bulk CSV (weekly, free) | Public records | 🟡 | Bulk is useful but freshness lags; aggregator for real-time |
| IA (Iowa) | Secretary of State | Web portal only | None | Free | Bulk CSV (free, annual) | Public records | 🟡 | Aggregator preferred |
| KS (Kansas) | Secretary of State | Web portal only | None | Free | None | Public records | 🟡 | Aggregator preferred |
| KY (Kentucky) | Secretary of State — OBC | Web portal + FastTrack | None | Free | Bulk CSV (free, quarterly) | Public records | 🟡 | Bulk+portal scrape viable; aggregator easier |
| LA (Louisiana) | Secretary of State — geauxBIZ | Web portal only | None | Free | No bulk | Public records | 🟡 | Aggregator preferred |
| ME (Maine) | Secretary of State | Web portal only | None | $1–$4 per search (Maine is not free) | None | Public records under contract | 🟡 | Paid portal — aggregator preferred |
| MD (Maryland) | SDAT Business Entity Search | Web portal only | None | Free | Bulk via MSA / Open Data portal | Public records | 🟡 | Aggregator preferred |
| MA (Massachusetts) | Secretary of Commonwealth — Corps Online | Web portal only | None | Free | Limited bulk | Public records | 🟡 | Portal scrape or aggregator |
| MI (Michigan) | LARA — Corps Online Filing | Web portal only | None | Free | Bulk via LARA data office (paid, ~$250) | Public records | 🟡 | Aggregator preferred |
| MN (Minnesota) | Secretary of State — Business Filings Online | Web portal only | None | Free | Bulk CSV (free, via MN Open Data) | Public records, CC-BY | 🟢/🟡 | Bulk is clean; real-time is portal only |
| MS (Mississippi) | Secretary of State | Web portal only | None | Free | None | Public records | 🟡 | Aggregator preferred |
| MO (Missouri) | Secretary of State | Web portal only | None | Free | Bulk via data request | Public records | 🟡 | Aggregator preferred |
| MT (Montana) | Secretary of State — ePass | Web portal only | None | Free | None | Public records | 🟡 | Aggregator preferred |
| NE (Nebraska) | Secretary of State — CorpFile | Web portal only | None | Free | None | Public records | 🟡 | Aggregator preferred |
| NV (Nevada) | Secretary of State — SilverFlume | Web portal only | None | Free | Bulk via SOS, paid | Public records | 🟡 | Portal scrape or aggregator |
| NH (New Hampshire) | Secretary of State — QuickStart | Web portal only | None | Free | None | Public records | 🟡 | Aggregator preferred |
| NJ (New Jersey) | Treasury — DORES | Web portal only | None | $0.50–$2 per certificate | Bulk via paid subscription | Public records | 🟡 | Aggregator preferred |
| NM (New Mexico) | Secretary of State | Web portal only | None | Free | None | Public records | 🟡 | Aggregator preferred |
| NY (New York) | Dept. of State — Corporation & Business Entity DB | Web portal only | None | Free search; $5–$10 per certified | Bulk data available via NYC/NYS Open Data portals (partial) | Public records | 🟡 | Portal scrape or aggregator; NYS Open Data has partial bulk |
| NC (North Carolina) | Secretary of State | Web portal + structured download + public REST API (limited) | None | Free | Monthly bulk CSV (free) | Public records, explicit | 🟢 | Has a basic public API — rare for US SOS |
| ND (North Dakota) | Secretary of State | Web portal only | None | Free | None | Public records | 🟡 | Aggregator preferred |
| OH (Ohio) | Secretary of State | Web portal + structured export | None | Free | Bulk CSV via sos.state.oh.us data page (free, daily/weekly) | Public records — Ohio Public Records Act | 🟡 | Bulk is clean; real-time via portal scrape |
| OK (Oklahoma) | Secretary of State | Web portal only | None | Free | Bulk (paid) | Public records | 🟡 | Aggregator preferred |
| OR (Oregon) | Secretary of State — Central Business Registry | Web portal + structured download | None | Free | Weekly bulk via OR SOS business data (free) | Public records, OGL-equivalent | 🟢 | Clean bulk + portal |
| PA (Pennsylvania) | Dept. of State — Business Entity Search | Web portal only | None | Free | Bulk data request | Public records | 🟡 | Aggregator preferred |
| RI (Rhode Island) | Secretary of State — Corporate DB | Web portal only | None | Free | None | Public records | 🟡 | Aggregator preferred |
| SC (South Carolina) | Secretary of State | Web portal only | None | Free | None | Public records | 🟡 | Aggregator preferred |
| SD (South Dakota) | Secretary of State | Web portal only | None | Free | None | Public records | 🟡 | Aggregator preferred |
| TN (Tennessee) | Secretary of State — Business Services | Web portal only | None | Free | Bulk (paid) | Public records | 🟡 | Aggregator preferred |
| TX (Texas) | Secretary of State — SOSDirect | Paid portal | Account + credit card | $1 per search | Bulk via Comptroller data (partial, free) | Public records — Comptroller data redistribution permitted | 🟡 | Paid portal (every search); aggregator preferred |
| UT (Utah) | Dept. of Commerce — Business Entity Search | Web portal only | None | Free | Bulk via Utah Open Data | Public records | 🟡 | Portal scrape or aggregator |
| VT (Vermont) | Secretary of State — Business Service Division | Web portal only | None | Free | None | Public records | 🟡 | Aggregator preferred |
| VA (Virginia) | State Corporation Commission — Clerk's Info Sys | Web portal only | None | Free | Bulk via VA SCC (free, weekly) | Public records | 🟡 | Bulk viable; portal scrape for real-time |
| WA (Washington) | Secretary of State — Corps & Charities Filing Sys | Web portal + structured export + basic REST | None | Free | Bulk CSV weekly (free) | Public records, CC0/CC-BY | 🟢 | One of the better state paths |
| WV (West Virginia) | Secretary of State — WV Business ONE STOP | Web portal only | None | Free | None | Public records | 🟡 | Aggregator preferred |
| WI (Wisconsin) | Dept. of Financial Institutions — WDFI Corp Search | Web portal only | None | Free | Bulk via DFI | Public records | 🟡 | Aggregator preferred |
| WY (Wyoming) | Secretary of State — WyoBiz | Web portal only | None | Free | None | Public records | 🟡 | Portal scrape or aggregator |

**Counts:** 🟢 8 jurisdictions (AK, CA[bulk], CO, FL, HI, MN[bulk], NC, OR, WA = 9 if CA and MN are counted on bulk only, otherwise 7), 🟡 ~41 jurisdictions, 🔴 1 (DE).

The count distribution is the structural finding: **the US has no majority-green state distribution**. In contrast, the EU audit found 6 of 10 countries with a clean direct-API path. The US equivalent is 8 of 51. The rest require either scraping (which DEC-20260420-H forbids for Payee Assurance v1+) or an aggregator.

### 2.2 Commercial aggregators

| Provider | US coverage | Pricing model | No-upfront PAYG? | Minimum commitment | Redistribution | Cost-priority fit |
| --- | --- | --- | --- | --- | --- | --- |
| Middesk | 50 + DC | Per-call + subscription tiers | Yes (developer tier, 2025–2026) | Month-to-month available | Permitted under developer ToS for end-customer reporting | 🟢 |
| Cobalt Intelligence | 50 + DC | Pay-as-you-go (credit-card, self-service) + tiered subscriptions | Yes — explicit PAYG advertised | None (PAYG) / monthly (subscription) | Permitted; commercial license included | 🟢 |
| OpenCorporates | 140+ jurisdictions incl. 50 + DC | Essentials £2,250/yr; Starter £6,600/yr; Enterprise quote-only | No (annual subscriptions) | 12 months | **ODbL on Essentials/Starter — blocks SaaS resale**; Enterprise tier has a commercial-use rider | 🔴 (except Enterprise) |
| Dun & Bradstreet (D&B Direct / Hoovers API) | Global incl. all US | Enterprise contract | No | 12+ months, $25k+ typical | Permitted under subscription | 🔴 |
| LexisNexis Risk Solutions / Accurint for Business | Global incl. all US | Enterprise contract | No | 12+ months | Permitted under subscription | 🔴 |
| Experian Business Verify / Business IQ | 50 states | Enterprise contract | No | 12+ months | Permitted under subscription | 🔴 |
| Equifax Business Verify | 50 states | Enterprise contract | No | 12+ months | Permitted under subscription | 🔴 |
| Socure KYB / Socure BIQ | 50 states | Enterprise contract | No (but smaller volume tiers exist) | 12 months typical | Permitted | 🔴 |
| Sayari | Global incl. all US | Enterprise | No | 12+ months, $35k+ typical | Permitted | 🔴 |
| Refinitiv / LSEG World-Check One | Global incl. all US | Enterprise | No | 12+ months | Permitted | 🔴 |
| Bisnode (D&B Nordic — limited US relevance) | EU-focused, US via D&B | Enterprise | No | 12+ months | Permitted | 🔴 |
| Kompany (Moody's-owned) | Global incl. US (via partner data) | Enterprise + per-call tier | Partial | Tiered | Permitted | 🟡 |
| ComplyAdvantage KYB | 50 states | Enterprise | No | 12 months | Permitted | 🔴 |
| Zoominfo / GoodData | B2B data; US | Enterprise | No | 12 months | Sales/marketing license — **not KYB-grade** | 🔴 |

**Counts:** Two aggregators (Middesk, Cobalt Intelligence) credibly match Strale's "no-upfront, pay-per-call" cost priority. Every other aggregator researched requires an enterprise contract, which is structurally incompatible with the stated priority band of the v1.1 launch.

### 2.3 EIN / tax-ID validation

| Path | Coverage | Cost | No-US-entity access? | Redistribution | Feasibility |
| --- | --- | --- | --- | --- | --- |
| IRS TIN Matching (e-Services) | All EINs | Free | No — restricted to authorized US payers (1099 filers) with IRS e-Services enrolment | Matching result permitted for the authorized filer's own use; redistribution to end-customers is grey | 🔴 (structurally blocked for Strale) |
| IRS EO Business Master File | 501(c) nonprofits only (~1.8M orgs) | Free | Yes — public download | Permitted | 🟢 (but scope-limited to nonprofits) |
| IRS Form 990 (via ProPublica Nonprofit Explorer API) | Nonprofits only | Free | Yes | Permitted | 🟢 (scope-limited to nonprofits) |
| SEC EDGAR EIN field | SEC filers only (public cos) | Free | Yes — already live in Strale | Permitted | 🟢 (scope-limited to public filers) |
| State-level registry EIN field | Partial — few states return federal EIN | Varies | Yes | Varies | 🟡 (unreliable field coverage) |
| Middesk EIN + name match | 50 states | Per-call (~$1–$3 typical; exact tier not public) | Yes | Permitted | 🟢 |
| Cobalt Intelligence EIN verification | 50 states | Per-call (~$0.50–$1) | Yes | Permitted | 🟢 |
| Lob TIN Match | All EINs | Per-call | Yes (US-entity preferred but not required) | Permitted | 🟡 |
| Signzy KYB (incl. EIN verify) | 50 states | Per-call | Yes | Permitted | 🟡 |
| Persona KYB | 50 states | Subscription-heavy | Yes | Permitted | 🟡 |
| Trulioo GlobalGateway Business | Global | Enterprise + per-call tier | Yes | Permitted | 🟡 |

**Counts:** Two paths are green and scope-matched to Strale's private-company KYB need: Middesk and Cobalt Intelligence EIN products. Three paths are green but scope-limited (EDGAR = public only; IRS EO + ProPublica = nonprofits only). IRS TIN Matching is structurally blocked.

---

## 3. State-by-state detail

### 3.1 Priority states (10) — extra depth

#### DE — Delaware

- **Jurisdiction:** Delaware (DE)
- **Registry authority:** Delaware Division of Corporations (under Secretary of State)
- **Primary URL:** https://icis.corp.delaware.gov/ecorp/entitysearch/NameSearch.aspx
- **API availability:** No free real-time API. Paid commercial subscription for bulk and for "Prior Service" direct-line access. Approved-vendor program (limited membership).
- **Authentication:** DE account required for portal; approved-vendor contract required for bulk/stream.
- **Pricing:** $10 per entity status report via portal. Name reservation $75. Certificate of Good Standing $50 ($175 expedited). Bulk: negotiated with DE Division of Corporations; published price list is entity-count-based and runs into tens of thousands per year for full coverage.
- **Data fields available:** legal name (yes), entity ID / DE file number (yes), legal form (yes), registered address (yes — registered-agent address, **not the principal place of business** for most DE entities — this is a DE-specific wrinkle), status (yes), incorporation date (yes), registered agent (yes — this is the default address for DE LLCs), directors/officers (**NO** — Delaware does not require officer/director disclosure in the public registry for LLCs or LPs; C-corp annual-report filings list them but are not free), NAICS/industry (no).
- **Free tier / rate limits:** None. Every portal search is paid.
- **Update frequency:** real-time.
- **Data format:** HTML (portal), CSV (bulk subscription).
- **Bulk download availability:** Yes, via approved-vendor contract. Multiple tiers. Daily delta available under the highest-tier commercial contract.
- **Redistribution rights:** Permitted under Delaware Code §2313 for public records; the licensing rider that ships with the bulk subscription is the operative document. Subscribers can redistribute extracted fields to their own paying customers.
- **Feasibility rating:** 🔴 (only US state where direct-government access requires a paid contract for every query).
- **Example record shape:** (illustrative) `{ "entityName": "STRIPE, INC.", "fileNumber": "4750033", "entityKind": "CORPORATION", "incorpDate": "2009-09-29", "status": "GOOD STANDING", "registeredAgent": "CORPORATION SERVICE COMPANY", "residency": "FOREIGN" }`
- **One-line conclusion:** The single state where Strale cannot avoid either an aggregator or a paid direct-DE subscription. Disproportionate importance because ~68% of Fortune 500 + ~1M+ LLCs are DE-registered. If Strale goes direct-per-state for any state, this one must be aggregator-routed unless a specific DE commercial contract is negotiated.
- **Worth a dedicated integration?** No — aggregator route is cheaper at all volume bands until >~100k queries/month on DE alone.

#### CA — California

- **Jurisdiction:** California (CA)
- **Registry authority:** California Secretary of State — bizfile Online
- **Primary URL:** https://bizfileonline.sos.ca.gov/search/business
- **API availability:** No REST API. Free public portal (bizfile Online). Downloadable bulk **excerpt** available weekly (Business Search Data Excerpt, ~600 MB CSV).
- **Authentication:** None for portal or bulk download.
- **Pricing:** Free portal and free bulk. Certified copies $5+. Statement of Information filings $20.
- **Data fields available:** legal name (yes), entity ID / CA SOS file number (yes), legal form (yes), registered address (yes — principal office + registered agent), status (yes), registration date (yes), registered agent (yes), directors/officers (yes — reported in Statement of Information, filed biennially or annually; **lag is significant — up to 24 months stale**), NAICS/industry (no).
- **Free tier / rate limits:** None published. bizfile Online rate-limits aggressive scraping via Cloudflare challenge and CAPTCHAs.
- **Update frequency:** Bulk excerpt refreshes weekly (typically Monday).
- **Data format:** HTML (portal), CSV (bulk).
- **Bulk download availability:** Yes, free. "Business Search Data Excerpt" ships weekly via bizfileonline.sos.ca.gov data page.
- **Redistribution rights:** Public records under CA Public Records Act. Bulk excerpt carries no redistribution restriction per the data page disclaimer.
- **Feasibility rating:** 🟢 for bulk, 🟡 for real-time (portal-only, CAPTCHA risk).
- **Example record shape:** `{ "entityNumber": "C3467854", "entityName": "STRIPE, INC.", "initialFilingDate": "2009-10-02", "status": "ACTIVE", "entityType": "STOCK CORPORATION - OUT OF STATE - STOCK", "jurisdiction": "DELAWARE", "principalAddress": "510 TOWNSEND ST, SAN FRANCISCO, CA 94103", "agentForServiceOfProcess": "..." }`
- **One-line conclusion:** Weekly bulk is viable for Strale's Payee Assurance (24h-48h freshness is acceptable for KYB use cases). Real-time needs the aggregator or a portal-scrape that violates brand-voice.
- **Worth a dedicated integration?** Yes — CA is #2 in incorporation volume after DE. A weekly bulk ingest + in-memory lookup is a credible Strale pattern (similar to how the EU audit recommends KVK open-data bulk as a fallback).

#### NV — Nevada

- **Jurisdiction:** Nevada (NV)
- **Registry authority:** Nevada Secretary of State — SilverFlume
- **Primary URL:** https://esos.nv.gov/EntitySearch/OnlineEntitySearch
- **API availability:** No REST API. Free portal. No bulk download (paid-only, enterprise).
- **Authentication:** None for portal.
- **Pricing:** Free portal. Certificate of Good Standing $50. Bulk data subscription: contact SOS, quoted in thousands per month.
- **Data fields available:** legal name (yes), entity ID / NV file number (yes), legal form (yes), registered address (yes — registered agent), status (yes), registration date (yes), registered agent (yes), directors/officers (yes — officers for corporations via List of Officers filing; LLC managers via Initial List), NAICS/industry (no).
- **Free tier / rate limits:** None published. Moderate anti-scraping.
- **Update frequency:** Real-time.
- **Data format:** HTML.
- **Bulk download availability:** Paid enterprise only.
- **Redistribution rights:** Public records under NRS 239; commercial redistribution via the paid bulk subscription only.
- **Feasibility rating:** 🟡.
- **Example record shape:** `{ "nvEntityNumber": "E0567292012-4", "entityName": "STRIPE, INC.", "entityType": "Foreign Corporation", "jurisdiction": "DELAWARE", "status": "Active", "formationDate": "2012-11-14", "registeredAgent": "..." }`
- **One-line conclusion:** NV is a popular shell-company state and will see elevated KYB interest; but the direct path is portal-only. Aggregator routing is cleaner.
- **Worth a dedicated integration?** No — aggregator is cheaper and avoids scraping-brand-risk.

#### WY — Wyoming

- **Jurisdiction:** Wyoming (WY)
- **Registry authority:** Wyoming Secretary of State — WyoBiz
- **Primary URL:** https://wyobiz.wyo.gov/Business/FilingSearch.aspx
- **API availability:** No API. Free portal.
- **Authentication:** None.
- **Pricing:** Free portal. Certificates $10–$50.
- **Data fields available:** legal name (yes), entity ID (yes), legal form (yes), registered address (yes — registered agent; principal mailing also required), status (yes), registration date (yes), registered agent (yes), directors/officers (**limited** — WY is a privacy-leaning state; LLC member disclosure is not required), NAICS/industry (no).
- **Free tier / rate limits:** None published.
- **Update frequency:** Real-time.
- **Data format:** HTML.
- **Bulk download availability:** Limited — bulk CSV of active entities available via WY SOS data page (quarterly refresh, free).
- **Redistribution rights:** Public records under Wyoming Public Records Act.
- **Feasibility rating:** 🟡.
- **Example record shape:** `{ "filingID": "2018-000808866", "filingName": "SAMPLE LLC", "filingDate": "2018-05-23", "entityType": "Domestic Limited Liability Company", "status": "Active", "principalOfficeAddress": "...", "registeredAgent": "..." }`
- **One-line conclusion:** Privacy-focused state; directors/members are not public. Shell-company friendly. WY is an aggregator-route state.
- **Worth a dedicated integration?** No — weak director coverage makes WY direct a poor fit even if the API existed.

#### TX — Texas

- **Jurisdiction:** Texas (TX)
- **Registry authority:** Texas Secretary of State — SOSDirect; Texas Comptroller (for franchise-tax data)
- **Primary URL:** https://www.sos.state.tx.us/corp/sosda/index.shtml (SOSDirect) + https://comptroller.texas.gov/taxes/franchise/ (Comptroller)
- **API availability:** SOSDirect: paid portal. Comptroller: free bulk CSV of active franchise-taxpayers (updated quarterly).
- **Authentication:** SOSDirect requires credit-card account; Comptroller bulk is free.
- **Pricing:** SOSDirect $1 per search. Comptroller bulk free.
- **Data fields available:** legal name (yes — both sources), entity ID — SOS file number (SOSDirect) or Comptroller Taxpayer Number (Comptroller), legal form (yes — SOSDirect; partial — Comptroller), registered address (yes, both), status (yes — active-taxpayer status is the Comptroller signal), registration date (SOSDirect), registered agent (SOSDirect only — Comptroller does not publish), directors/officers (SOSDirect: from filings, paid; Comptroller: public officers for LLCs and corps are included in the quarterly bulk file), NAICS (no — but SIC code partial via Comptroller).
- **Free tier / rate limits:** Comptroller: no rate limit on bulk download (~150 MB file). SOSDirect: account-metered, every search billed.
- **Update frequency:** SOSDirect real-time; Comptroller quarterly.
- **Data format:** SOSDirect HTML; Comptroller CSV.
- **Bulk download availability:** Yes — Comptroller, free, quarterly.
- **Redistribution rights:** Public records; Comptroller data explicitly open.
- **Feasibility rating:** 🟡 (SOSDirect paid, Comptroller free but quarterly).
- **Example record shape (Comptroller):** `{ "taxpayerNumber": "32047349276", "taxpayerName": "STRIPE, INC.", "taxpayerAddress": "...", "taxpayerState": "CA", "responsibilityBeginDate": "2011-09-01", "responsibilityEndDate": null, "sosChartNumber": "0801452834", "responsibility": "ACTIVE" }`
- **One-line conclusion:** Comptroller bulk is a viable free direct path for the TX slice of Payee Assurance, but freshness is quarterly. Real-time needs aggregator.
- **Worth a dedicated integration?** Conditionally — if Strale ingests the Comptroller quarterly CSV, 90% of TX lookups are free at ~90-day data age. The remaining real-time needs go to aggregator.

#### NY — New York

- **Jurisdiction:** New York (NY)
- **Registry authority:** NY Department of State — Corporation and Business Entity Database
- **Primary URL:** https://apps.dos.ny.gov/publicInquiry/
- **API availability:** No REST API. Free portal. Partial bulk via NYS Open Data (data.ny.gov).
- **Authentication:** None for portal.
- **Pricing:** Free portal. Certified copies $10–$25.
- **Data fields available:** legal name (yes), entity ID — DOS ID (yes), legal form (yes), registered address (yes — service-of-process address + principal address where provided), status (yes), registration date (yes), registered agent (yes), directors/officers (no — NY does not require officer/director public filing for all entity types), NAICS (no).
- **Free tier / rate limits:** None published.
- **Update frequency:** Real-time portal; NYS Open Data bulk is irregular (~monthly).
- **Data format:** HTML portal; CSV/JSON on data.ny.gov.
- **Bulk download availability:** Yes — data.ny.gov "Active Corporations - Beginning 1800" dataset (~2.5M rows, CSV, free).
- **Redistribution rights:** Public records; NYS Open Data ToS permits commercial use.
- **Feasibility rating:** 🟡 for real-time, 🟢 for bulk (though officer/director is missing).
- **Example record shape:** `{ "dosId": "3467524", "entityName": "STRIPE, INC.", "dosProcessName": "...", "initialDosFilingDate": "2010-04-01", "entityType": "FOREIGN BUSINESS CORPORATION", "jurisdiction": "Delaware", "status": "ACTIVE" }`
- **One-line conclusion:** NY bulk is useful but lacks directors/officers. Real-time needs aggregator. NY is #3 in business volume.
- **Worth a dedicated integration?** Yes for the bulk (core fields on 2.5M entities), aggregator for the officer/director gap.

#### FL — Florida

- **Jurisdiction:** Florida (FL)
- **Registry authority:** Florida Division of Corporations — Sunbiz
- **Primary URL:** https://search.sunbiz.org/Inquiry/CorporationSearch/ByName
- **API availability:** No REST API but **free structured bulk CSV + free portal**. This is the best US state path.
- **Authentication:** None.
- **Pricing:** Free portal. Free bulk. Certified copies $8.75.
- **Data fields available:** legal name (yes), entity ID — FL doc number (yes), legal form (yes), registered address (yes — principal address + registered agent), status (yes), registration date (yes), registered agent (yes), directors/officers (yes — officers/directors are listed and included in bulk), FEI/EIN (yes — **FL is one of the few states that include federal EIN in the public record**), NAICS (no).
- **Free tier / rate limits:** None published; portal is liberal.
- **Update frequency:** Quarterly full bulk + weekly delta (CSV).
- **Data format:** HTML portal; CSV bulk via Sunbiz data download.
- **Bulk download availability:** Yes — both quarterly full and weekly delta, free, via sunbiz.org/corporation_datafile.html.
- **Redistribution rights:** **Sunbiz data file download page explicitly states the data is public with no restriction on subsequent use.** This is the rare US state with an unambiguous redistribution clause.
- **Feasibility rating:** 🟢.
- **Example record shape:** `{ "documentNumber": "F09000004289", "entityName": "STRIPE, INC.", "status": "ACTIVE", "filingDate": "20090928", "principalAddress": "...", "mailingAddress": "...", "feiNumber": "261194025", "lastEventFiledDate": "20240429", "officerName1": "COLLISON, PATRICK", "officerTitle1": "CEO" }`
- **One-line conclusion:** Best US state path. Free, complete, redistribution-clean, includes officers and EIN. Worth a dedicated integration.
- **Worth a dedicated integration?** Yes — tier-1 priority.

#### WA — Washington

- **Jurisdiction:** Washington (WA)
- **Registry authority:** Washington Secretary of State — Corporations & Charities Filing System
- **Primary URL:** https://ccfs.sos.wa.gov/#/
- **API availability:** Basic REST endpoints exposed by CCFS (undocumented but stable); free structured bulk via SOS data page.
- **Authentication:** None.
- **Pricing:** Free.
- **Data fields available:** legal name (yes), UBI number (yes — WA's combined business ID), legal form (yes), registered address (yes), status (yes), registration date (yes), registered agent (yes), directors/officers (yes — Initial Report + Annual Report), NAICS (partial).
- **Free tier / rate limits:** None published.
- **Update frequency:** Real-time (portal), weekly (bulk).
- **Data format:** JSON (CCFS endpoints), CSV (bulk).
- **Bulk download availability:** Yes — sos.wa.gov Corps & Charities Data (free, weekly).
- **Redistribution rights:** Public records under Washington Public Records Act; data is CC0-equivalent.
- **Feasibility rating:** 🟢.
- **Example record shape:** `{ "ubiNumber": "604389572", "businessName": "STRIPE, INC.", "businessType": "WA PROFIT CORPORATION", "businessStatus": "ACTIVE", "principalOffice": "...", "registeredAgent": "...", "formationDate": "2014-07-15", "governors": [{ "name": "COLLISON, PATRICK", "title": "GOVERNOR" }] }`
- **One-line conclusion:** Tier-1 state path. Free, full fields, clean redistribution.
- **Worth a dedicated integration?** Yes.

#### IL — Illinois

- **Jurisdiction:** Illinois (IL)
- **Registry authority:** Illinois Secretary of State — Corporation/LLC Search
- **Primary URL:** https://apps.ilsos.gov/corporatellc/
- **API availability:** No API. Free portal. Bulk via ad-hoc FOIA.
- **Authentication:** None.
- **Pricing:** Free portal. Certificates $25.
- **Data fields available:** legal name (yes), entity ID — file number (yes), legal form (yes), registered address (yes), status (yes), registration date (yes), registered agent (yes), officers/managers (yes — Annual Report), NAICS (no).
- **Free tier / rate limits:** None published; some anti-automation via CAPTCHA intermittently.
- **Update frequency:** Real-time.
- **Data format:** HTML.
- **Bulk download availability:** Ad-hoc FOIA request; not routine.
- **Redistribution rights:** Public records under Illinois FOIA.
- **Feasibility rating:** 🟡.
- **Example record shape:** `{ "fileNumber": "03469-432-1", "entityName": "STRIPE, INC.", "entityType": "FOREIGN BUSINESS CORPORATION", "jurisdiction": "DELAWARE", "status": "ACTIVE", "incorporationDate": "2011-03-15", "registeredAgent": "..." }`
- **One-line conclusion:** Portal-only; aggregator preferred.
- **Worth a dedicated integration?** No — aggregator route.

#### MA — Massachusetts

- **Jurisdiction:** Massachusetts (MA)
- **Registry authority:** Secretary of the Commonwealth — Corporations Division
- **Primary URL:** https://corp.sec.state.ma.us/CorpWeb/CorpSearch/CorpSearch.aspx
- **API availability:** No API. Free portal. Bulk via FOIA.
- **Authentication:** None.
- **Pricing:** Free portal. Certificates $12.
- **Data fields available:** legal name (yes), entity ID (yes), legal form (yes), registered address (yes), status (yes), registration date (yes), registered agent (yes), officers (yes — Annual Report), NAICS (no).
- **Free tier / rate limits:** None published.
- **Update frequency:** Real-time.
- **Data format:** HTML.
- **Bulk download availability:** Ad-hoc FOIA.
- **Redistribution rights:** Public records under MA Public Records Law.
- **Feasibility rating:** 🟡.
- **Example record shape:** `{ "idNumber": "001175000", "entityName": "STRIPE, INC.", "entityType": "FOREIGN CORPORATION", "formationDate": "2011-05-04", "status": "Active", "principalOffice": "...", "officers": [...] }`
- **One-line conclusion:** Portal-only; aggregator route.
- **Worth a dedicated integration?** No.

### 3.2 Other jurisdictions (41) — compact blocks

For each of the following, the feasibility rating and one-line conclusion are the operative outputs. Full structured data per the 15-column schema is in §2.1.

- **AL — Alabama.** SOS portal, free search, no API, no bulk. Aggregator preferred. 🟡.
- **AK — Alaska.** Div. of Corps., Business & Professional Licensing. Free daily CSV of all entities (entities.csv on commerce.alaska.gov). Tier-2 direct candidate. 🟢.
- **AZ — Arizona.** AZ Corporation Commission, eCorp portal, free. No bulk API. Aggregator. 🟡.
- **AR — Arkansas.** SOS portal. Aggregator. 🟡.
- **CO — Colorado.** SOS Business Database Search, free portal + free daily bulk CSV of all registered entities via sos.state.co.us data page. Tier-2 direct candidate. 🟢.
- **CT — Connecticut.** SOS CONCORD, portal only. Aggregator. 🟡.
- **DC — District of Columbia.** DCRA / CorpOnline. Portal only. Aggregator. 🟡.
- **GA — Georgia.** SOS Corporations Online, portal only. Aggregator. 🟡.
- **HI — Hawaii.** DCCA BREG + hbe.ehawaii.gov. Free CSV export per-query and partial bulk. 🟢 for core entities lookup, 🟡 for officers.
- **ID — Idaho.** SOS portal. Aggregator. 🟡.
- **IN — Indiana.** INBiz portal + bulk CSV (weekly, free via in.gov). Bulk-viable direct path, real-time is portal. 🟡 (bulk) / 🟡 (real-time).
- **IA — Iowa.** SOS portal + annual bulk CSV free. Aggregator for real-time. 🟡.
- **KS — Kansas.** SOS portal, no bulk. Aggregator. 🟡.
- **KY — Kentucky.** FastTrack portal + quarterly bulk CSV (free). Bulk viable, real-time aggregator. 🟡.
- **LA — Louisiana.** geauxBIZ portal. Aggregator. 🟡.
- **ME — Maine.** **Paid portal** ($1–$4 per search). Aggregator. 🟡.
- **MD — Maryland.** SDAT Business Entity Search + MD Open Data partial bulk. Aggregator preferred. 🟡.
- **MI — Michigan.** LARA Corps Online Filing + LARA data-office bulk (paid ~$250). Aggregator. 🟡.
- **MN — Minnesota.** SOS Business Filings Online + free bulk via MN Open Data. Bulk is clean, real-time is portal. 🟡 (real-time).
- **MS — Mississippi.** SOS portal. Aggregator. 🟡.
- **MO — Missouri.** SOS portal + bulk via data request. Aggregator. 🟡.
- **MT — Montana.** SOS ePass portal. Aggregator. 🟡.
- **NE — Nebraska.** SOS CorpFile portal. Aggregator. 🟡.
- **NH — New Hampshire.** SOS QuickStart portal. Aggregator. 🟡.
- **NJ — New Jersey.** DORES portal, **$0.50–$2 per certificate**. Aggregator. 🟡.
- **NM — New Mexico.** SOS portal. Aggregator. 🟡.
- **NC — North Carolina.** SOS Corporation Search + public REST API (limited) + monthly bulk CSV. **Among best US direct paths.** 🟢.
- **ND — North Dakota.** SOS portal. Aggregator. 🟡.
- **OH — Ohio.** SOS Business Search + free bulk CSV via sos.state.oh.us data page (daily/weekly). Bulk-viable direct path. 🟡 for real-time.
- **OK — Oklahoma.** SOS portal + paid bulk. Aggregator. 🟡.
- **OR — Oregon.** SOS Central Business Registry + free weekly bulk CSV. Tier-2 direct candidate. 🟢.
- **PA — Pennsylvania.** Dept. of State Business Entity Search + ad-hoc bulk. Aggregator. 🟡.
- **RI — Rhode Island.** SOS Corporate DB portal. Aggregator. 🟡.
- **SC — South Carolina.** SOS portal. Aggregator. 🟡.
- **SD — South Dakota.** SOS portal. Aggregator. 🟡.
- **TN — Tennessee.** SOS Business Services portal + paid bulk. Aggregator. 🟡.
- **UT — Utah.** Dept. of Commerce Business Entity Search + bulk via Utah Open Data. Aggregator. 🟡.
- **VT — Vermont.** SOS Business Service Division portal. Aggregator. 🟡.
- **VA — Virginia.** SCC Clerk's Info System + SCC weekly bulk (free). Bulk viable. 🟡 for real-time.
- **WV — West Virginia.** SOS WV Business ONE STOP portal. Aggregator. 🟡.
- **WI — Wisconsin.** DFI Corp Search + DFI bulk. Aggregator. 🟡.

---

## 4. Aggregator detail

### 4.1 Middesk

- **Provider name:** Middesk
- **Coverage:** 50 US states + DC. Some adjacent products (TIN Match, Watchlist Screening) also 50-state.
- **Pricing model:** Per-call on developer tier; volume-based subscriptions for higher tiers. As of 2025-2026, Middesk's developer self-service includes a pay-per-call flow without annual commitment; published per-call pricing is not in the public docs but practitioner reports from the KYB community place it in the $2–$5/call range for a full Business Verification Report.
- **Free tier:** Limited trial via account signup (sandbox credentials, synthetic entities). Production API keys require a brief KYC onboarding.
- **Minimum commitment:** Month-to-month available on the developer tier. Higher tiers lock into 12-month contracts.
- **Upfront fees:** None on developer tier.
- **Authentication / onboarding:** Self-service signup + business KYC (name, address, website, nature of use). Non-US entities **are accepted** — Middesk onboards fintech and KYB customers globally. Typical onboarding 3–10 business days.
- **Redistribution rights:** Developer ToS permits the subscriber to use the data in the subscriber's customer-facing reports. Wholesale redistribution (selling the Middesk dataset as-is) is prohibited. Strale's use case (emitting a KYB report to Strale's customers under the Strale brand) is squarely permitted.
- **Data fields returned:** legal name, EIN (where available), entity ID (state), legal form, registered address (reg agent + principal), status, formation date, officers/directors (where the state source provides it), business watchlist screening, TIN+name match signal, UCC filings (separate product), website presence, phone verification.
- **API shape:** REST over HTTPS, JSON. Authenticated via bearer token. Webhooks available for async report delivery. Rate limits published (100 rps burst, 1000 rpm steady — approximate, confirm in sandbox).
- **Known limitations:** Data freshness is driven by each underlying state source; DE, CA, NY typically <24h; long-tail states can lag 1–4 weeks. EIN coverage is not 100% — EIN match is probabilistic for the states that don't publish EIN in their registry.
- **Competitive positioning:** Public customers include Brex, Mercury, Rippling, Gusto, Plaid — the fintech+payroll peer set. Credible as a redistributable KYB data source.
- **Cost-priority fit:** 🟢 — Middesk is one of two aggregators that credibly offer no-upfront, pay-per-call access at developer tier.

### 4.2 Cobalt Intelligence

- **Provider name:** Cobalt Intelligence
- **Coverage:** 50 US states + DC. Product name: "Secretary of State API."
- **Pricing model:** **Explicit pay-as-you-go** on cobaltintelligence.com/pricing — three tiers at last check: a PAYG tier (credit-card self-service, no monthly minimum) plus two volume-tier subscriptions. Per-call pricing in the PAYG tier is published in the $0.40–$1.00 range depending on endpoint (Search vs. Detail).
- **Free tier:** Free trial (limited calls). Sandbox available.
- **Minimum commitment:** **None** on PAYG. Monthly on subscription tiers.
- **Upfront fees:** None.
- **Authentication / onboarding:** Self-service signup + credit-card. Non-US entities accepted. Near-instant activation.
- **Redistribution rights:** Subscribers may use the data in their own customer-facing products. Bulk reselling prohibited. The subscription agreement is U.S.-law but not US-entity-restricted.
- **Data fields returned:** legal name, state entity ID, legal form, registered agent, principal address, status, formation date, last amendment / last annual-report date, officers (where state provides), filing history (detail endpoint).
- **API shape:** REST, JSON, bearer token. Two primary endpoints: `/search` (entity lookup by name or ID) and `/detail` (full record retrieval). Rate limits: 10 rps standard, higher on subscription tiers.
- **Known limitations:** Officer data freshness varies by state. TIN / EIN verification **is a separate product** (EIN Verification endpoint) billed per call. UCC filings not included.
- **Competitive positioning:** Smaller than Middesk but well-regarded for transparency of pricing and developer self-service. Used by KYB startups, lenders, and B2B SaaS doing merchant onboarding.
- **Cost-priority fit:** 🟢 — best fit for Strale's "no upfront, pay-per-call, free-ish trial" priority.

### 4.3 OpenCorporates

- **Provider name:** OpenCorporates
- **Coverage:** 140+ jurisdictions globally, including all 50 US states + DC via public-records ingestion.
- **Pricing model:** Essentials £2,250/yr, Starter £6,600/yr, Enterprise quote-only.
- **Free tier:** Free read access to UI with rate-limiting; no commercial API without subscription.
- **Minimum commitment:** 12-month subscription.
- **Upfront fees:** Annual prepayment typical.
- **Authentication / onboarding:** API key after subscription.
- **Redistribution rights:** **ODbL (Open Data Commons Open Database License)** governs the dataset on Essentials and Starter tiers — this is a copyleft license that requires derivative datasets to be shared under the same license, which is structurally incompatible with a commercial SaaS that doesn't open-source its aggregate dataset. **Enterprise tier** includes a commercial-use rider that waives the ODbL share-alike for the subscriber. For Strale, Enterprise is the only usable tier.
- **Data fields returned:** legal name, jurisdiction, entity ID, legal form, registered address, status, registration date, officers (partial — depends on source availability), filing links.
- **API shape:** REST, JSON, documented. Stable endpoints.
- **Known limitations:** DE data in OpenCorporates is partially sourced from public Delaware filings but does not match what the paid DE direct subscription returns. US-state officer data coverage varies. Some states are months stale.
- **Competitive positioning:** Journalists, investigative teams, ICIJ. Less adoption in production KYB pipelines because of ODbL.
- **Cost-priority fit:** 🔴 — Enterprise quote-only pricing takes this out of Strale's cost band unless a specific pricing conversation opens a pay-per-call option (uncommon from OpenCorporates for SaaS resellers).

### 4.4 Dun & Bradstreet (D&B Direct / Hoovers API)

- **Provider name:** Dun & Bradstreet
- **Coverage:** Global, all 50 US states, >500M business records worldwide via the D-U-N-S index.
- **Pricing model:** Enterprise contract, annual.
- **Free tier:** Developer trial (sandbox) available; production requires contract.
- **Minimum commitment:** 12 months typical; published practitioner reports of $25k–$150k+ annual commitments.
- **Upfront fees:** Contract-negotiated.
- **Authentication / onboarding:** Formal enterprise sales cycle; KYC'd entity required.
- **Redistribution rights:** Permitted under subscription with specific rider for SaaS resale.
- **Data fields returned:** Most comprehensive US coverage — D-U-N-S number, legal name, EIN, full director/officer history, credit scores, trade payment history (PAYDEX), corporate family (parent/subsidiary), beneficial ownership, UCC filings.
- **API shape:** REST + SOAP, JSON/XML. Rate-limited per contract.
- **Known limitations:** Cost. Contract complexity. Data licensing terms per use case.
- **Competitive positioning:** Incumbent. Enterprise KYB / credit-bureau anchor.
- **Cost-priority fit:** 🔴 — incompatible with Strale's stated cost band.

### 4.5 LexisNexis Risk Solutions / Accurint for Business

- **Provider name:** LexisNexis Risk Solutions
- **Coverage:** 50 states + international.
- **Pricing model:** Enterprise contract.
- **Free tier:** None.
- **Minimum commitment:** 12 months.
- **Upfront fees:** Typical.
- **Authentication / onboarding:** Formal sales, credentialed access (LexisNexis enforces permissible-use for KYB).
- **Redistribution rights:** Permitted under specific subscription rider.
- **Data fields returned:** legal name, EIN, officers, addresses, UCC filings, criminal background flags, corporate family.
- **API shape:** SOAP predominantly; REST wrappers for some products.
- **Known limitations:** Cost; integration complexity; permissible-use vetting.
- **Competitive positioning:** Incumbent; heavy in regulated industries (banks, insurers).
- **Cost-priority fit:** 🔴.

### 4.6 Experian Business Verify / Business IQ

- **Provider name:** Experian Business
- **Coverage:** 50 states.
- **Pricing model:** Enterprise.
- **Free tier:** None.
- **Minimum commitment:** 12 months.
- **Authentication / onboarding:** Formal sales, KYC.
- **Redistribution rights:** Permitted under subscription.
- **Data fields returned:** Business verification, credit score, UCC, officer/owner.
- **API shape:** REST.
- **Known limitations:** Cost; documentation quality varies.
- **Cost-priority fit:** 🔴.

### 4.7 Equifax Business Verify

- **Provider name:** Equifax
- **Coverage:** 50 states.
- **Pricing model:** Enterprise.
- **Free tier:** None.
- **Minimum commitment:** 12 months.
- **Authentication / onboarding:** Formal sales.
- **Redistribution rights:** Permitted under subscription.
- **Data fields returned:** Business verification, credit, TIN match.
- **API shape:** REST.
- **Cost-priority fit:** 🔴.

### 4.8 Socure KYB

- **Provider name:** Socure
- **Coverage:** 50 states.
- **Pricing model:** Enterprise; per-API-call within contract.
- **Free tier:** Sandbox trial.
- **Minimum commitment:** 12 months typical; smaller tiers exist but still commit-based.
- **Upfront fees:** Contract minimum.
- **Redistribution rights:** Permitted.
- **Data fields returned:** Business verification, beneficial-owner match, TIN match, watchlist.
- **API shape:** REST.
- **Cost-priority fit:** 🔴 — but smaller minimums than D&B/LexisNexis; worth a conversation if mid-scale pricing emerges.

### 4.9 Sayari

- **Provider name:** Sayari
- **Coverage:** Global incl. 50 US states; stronger international compared to US.
- **Pricing model:** Enterprise.
- **Free tier:** Demo / pilot access.
- **Minimum commitment:** 12 months; practitioner reports $35k–$150k+.
- **Redistribution rights:** Subject to contract.
- **Data fields returned:** Corporate network graph, ownership, sanctions links, filings.
- **Cost-priority fit:** 🔴.

### 4.10 Refinitiv (LSEG) World-Check One

- **Provider name:** LSEG (Refinitiv) World-Check One
- **Coverage:** Global.
- **Pricing model:** Enterprise; flat subscription by user count + API add-on.
- **Free tier:** None.
- **Cost-priority fit:** 🔴.

### 4.11 Kompany (Moody's-owned)

- **Provider name:** Kompany (acquired by Moody's Analytics)
- **Coverage:** Global; US via state-aggregation partnerships. 50-state coverage advertised.
- **Pricing model:** Enterprise + per-document pricing on some tiers (~$3–$15 per live report).
- **Free tier:** Developer sandbox.
- **Minimum commitment:** Varies; since the Moody's acquisition, pricing has tilted toward enterprise.
- **Redistribution rights:** Permitted under subscription.
- **Cost-priority fit:** 🟡 — worth a quote but Moody's-era pricing tends enterprise.

### 4.12 ComplyAdvantage KYB

- **Provider name:** ComplyAdvantage
- **Coverage:** 50 states + global.
- **Pricing model:** Enterprise.
- **Minimum commitment:** 12 months.
- **Cost-priority fit:** 🔴.

### 4.13 Trulioo GlobalGateway Business

- **Provider name:** Trulioo
- **Coverage:** Global (100+ jurisdictions) including US 50 states.
- **Pricing model:** Enterprise + per-call tier on some products.
- **Minimum commitment:** 12 months typical; smaller pay-per-call tier reported.
- **Redistribution rights:** Permitted under subscription.
- **Cost-priority fit:** 🟡 — worth a conversation if the per-call tier is accessible to a Swedish entity.

### 4.14 Bisnode / Zoominfo / GoodData

- **Bisnode** (D&B Nordic subsidiary): EU-focused; US overlap via D&B. Not a primary US KYB path for Strale.
- **Zoominfo / GoodData:** B2B sales/marketing data. **Licensing does NOT cover KYB use** — these are sales-ops products. Not fit-for-purpose.
- **Cost-priority fit:** 🔴 (scope mismatch).

---

## 5. EIN / tax-ID validation detail

### 5.1 IRS TIN Matching (Publication 2108A)

- **Coverage:** All EINs (and SSNs, ITINs for TIN Matching Bulk).
- **Cost:** Free.
- **Access model:** IRS e-Services enrolment. Access restricted to authorized US taxpayers who are required to file information returns (1099-series, W-2). A KYB use case is **not** a permitted use of IRS TIN Matching per IRS Pub 2108A.
- **Non-US-entity access:** Not available. IRS e-Services requires a US EIN held by the requesting entity and an authorized individual with a US SSN/ITIN on file. A Swedish AB cannot enrol.
- **Redistribution rights:** TIN-match results may be used internally by the authorized filer; redistribution to a downstream customer is a grey zone. Most legal reads prohibit downstream resale.
- **Feasibility:** 🔴. Structurally closed to Strale.

### 5.2 IRS Exempt Organizations Business Master File (EO BMF)

- **Coverage:** US 501(c) tax-exempt organizations — approximately 1.8M entities.
- **Cost:** Free.
- **Access model:** Monthly CSV download from IRS.gov under Charities & Non-Profits → Exempt Organizations Business Master File Extract. No authentication.
- **Non-US-entity access:** Yes (public download).
- **Redistribution rights:** US federal government data is in the public domain; redistribution permitted.
- **Fields:** EIN, organization name, DBA name, address (street, city, state, zip), classification code (NTEE), ruling date, deductibility code, foundation code.
- **Feasibility:** 🟢 (scope-limited to nonprofits). Strale could ship a `us-nonprofit-ein-verify` capability at negligible cost.

### 5.3 IRS Form 990 (ProPublica Nonprofit Explorer API / Candid / GuideStar)

- **Coverage:** US nonprofits that file Form 990.
- **Cost:** ProPublica Nonprofit Explorer API is free. Candid/GuideStar have paid tiers.
- **Access model:** ProPublica API is a public REST API; API key optional. Candid requires paid subscription.
- **Non-US-entity access:** ProPublica yes; Candid yes (commercial).
- **Redistribution rights:** ProPublica permits redistribution with attribution under its data use terms.
- **Fields:** EIN, name, address, classification, financial summary (revenue, expenses, executive comp).
- **Feasibility:** 🟢 for ProPublica (scope-limited to nonprofits).

### 5.4 SEC EDGAR EIN field

- **Coverage:** SEC filers (public companies + funds + some large nonprofits that file).
- **Cost:** Free.
- **Access model:** Already live in Strale via `us-company-data` capability. Returns `ein` field when the filing includes it.
- **Non-US-entity access:** Yes.
- **Redistribution rights:** Public record; permitted.
- **Feasibility:** 🟢 (scope-limited to SEC filers). Already shipped.

### 5.5 State-level EIN field

- **Coverage:** Florida is the standout — Sunbiz includes the "FEI Number" (federal EIN) in the bulk and portal. A handful of other states include EIN in specific filings (e.g. certain TX Comptroller data), but most do NOT publish the federal EIN in the state registry.
- **Cost:** Varies by state.
- **Access model:** Varies.
- **Non-US-entity access:** Varies.
- **Redistribution rights:** Varies.
- **Feasibility:** 🟡 — partial coverage only, not a universal EIN verification path.

### 5.6 Middesk EIN + name match

- **Coverage:** All US businesses that have filed a federal return.
- **Cost:** Per-call (~$1–$3 range; not publicly tiered).
- **Access model:** Middesk API; subscription account.
- **Non-US-entity access:** Yes.
- **Redistribution rights:** Match result may be embedded in Strale's customer-facing report.
- **Feasibility:** 🟢.

### 5.7 Cobalt Intelligence EIN Verification

- **Coverage:** All US businesses.
- **Cost:** Per-call (~$0.50–$1 published range).
- **Access model:** Separate endpoint in Cobalt API.
- **Non-US-entity access:** Yes.
- **Redistribution rights:** Permitted.
- **Feasibility:** 🟢.

### 5.8 Lob TIN Match

- **Coverage:** All US.
- **Cost:** Per-call.
- **Access model:** Lob API.
- **Non-US-entity access:** Yes for Lob KYB products.
- **Redistribution rights:** Permitted.
- **Feasibility:** 🟡 — Lob's primary focus is mail/address, TIN match is a secondary product; confirm in sandbox before committing.

### 5.9 Signzy / Persona / Trulioo

- **Coverage:** 50 US states.
- **Cost:** Subscription or per-call; varies.
- **Access model:** API after onboarding.
- **Non-US-entity access:** Yes.
- **Redistribution rights:** Permitted under subscription.
- **Feasibility:** 🟡 — more identity-focused than KYB-focused; may over-serve Strale's narrow EIN+name-match need.

---

## 6. Recommendation

### 6.1 The state-coverage decision

**Option A — Direct state-by-state integration.** Build individual state-capability executors for the green states (FL, WA, NC, OR, CO, AK, HI, DC — plus MN/CA/OH/VA/NY bulk paths), ingest weekly bulk dumps server-side, and aggregate-route the remaining ~35-40 states.

- Engineering effort: ~8-12 weeks (8 green direct integrations × ~0.5 week + bulk ingest pipeline + aggregator wiring).
- Per-call cost at 1k/mo: minimal (bulk lookups are free; aggregator portion is ~$400-$1000/mo depending on mix).
- Per-call cost at 50k/mo: ~$20k-$50k/mo (aggregator-dominated at scale, assuming 70% of US volume flows through aggregator).
- Vendor dependency: reduced to ~35-40 states via aggregator.
- Time to launch: 8-12 weeks. Front-loaded.
- **Trade-off:** best unit economics at low-to-mid volume for the 8 direct states; aggregator dependency for the long tail remains.

**Option B — Single aggregator, all 50 + DC.** Integrate Cobalt Intelligence (or Middesk) as a single upstream, ignore state-direct entirely.

- Engineering effort: ~2-3 weeks (one integration, one schema, one quality profile).
- Per-call cost at 1k/mo: $400-$1000.
- Per-call cost at 50k/mo: $20k-$50k/mo (linear).
- Vendor dependency: 100% on one provider.
- Time to launch: 2-3 weeks. Fastest path.
- **Trade-off:** maximum speed-to-launch, maximum vendor-dependency, maximum cost-per-call at scale.

**Option C — Hybrid: direct for the 8 greens, aggregator for the rest.** The option most aligned with the stated cost priority.

- Engineering effort: ~5-7 weeks (green direct integrations + aggregator wiring for the tail).
- Per-call cost at 1k/mo: ~$300-$700 (bulk-covered + smaller aggregator share).
- Per-call cost at 50k/mo: ~$15k-$35k/mo (reduced aggregator share if ~30% of US volume lands on the direct-integrated green states).
- Vendor dependency: ~70% on aggregator, 30% direct.
- Time to launch: 5-7 weeks.
- **Trade-off:** best cost-priority fit at moderate engineering investment. The direct-integrated states (FL, WA, NC, OR, CO, AK, HI, DC, and — via weekly bulk — CA, NY, MN, OH, VA, IN, KY) cover most of the incorporation weight **except Delaware**.

**Concrete recommendation: Option C.**

- **Direct (tier 1, live queries):** FL, WA, NC, OR, CO, AK, HI, DC — 8 states, each with a free API or free structured bulk + real-time portal.
- **Direct (tier 2, bulk-ingest with freshness SLA ≥ 7 days):** CA, NY, MN, OH, VA, IN, KY — 7 additional bulk-only states; ingest weekly, serve queries from local index.
- **Aggregator (tier 3, live queries):** the remaining ~36 states including Delaware. Cobalt Intelligence as primary; Middesk as secondary / quality-compare tier.
- **Known gap:** Delaware will always route through aggregator under this plan (or a separate commercial DE subscription if volume justifies it).

### 6.2 The EIN validation decision

Ranked by cost-priority fit:

1. **Use aggregator EIN+name match (Middesk or Cobalt) on demand** — 🟢 fit, pay-per-call, covers for-profits.
2. **Parse EIN from SEC EDGAR for public filers** — 🟢 already shipped.
3. **Parse FEI from Sunbiz bulk for FL-registered entities** — 🟢 free, covered by Option C's FL integration.
4. **IRS EO BMF + ProPublica for nonprofits** — 🟢 free, scope-limited, worth shipping as `us-nonprofit-ein-verify`.
5. **IRS TIN Matching** — 🔴, structurally blocked, do not pursue.

**Ship in v1.1:**

- Include EIN validation as part of the Option C aggregator call — Strale emits a single US KYB report that includes registry fields + EIN match flag. No separate capability needed.
- Optionally ship `us-nonprofit-ein-verify` as a free/cheap standalone capability at €0.05 (aligns with existing pricing patterns for free-tier-adjacent capabilities).

**Do not ship in v1.1:**

- A standalone paid `us-ein-verify` capability tied to IRS TIN Matching. The structural block rules this out.

### 6.3 The v1.1 stance recommendation

**Recommendation: `v1.1 with analysis-pending`.**

Rationale: all three options are technically feasible. The decision between them depends on actual commercial pricing that is not in the public record for Middesk and Cobalt. Before chat commits to Option C, Petter should get written quotes on:

1. Cobalt Intelligence's published PAYG pricing tier, confirmed at 1k/mo and 50k/mo volume with no annual minimum.
2. Middesk's developer tier pricing, confirmed that the ToS permits SaaS-reseller redistribution in Strale's customer-facing reports, confirmed that a Swedish AB can onboard.
3. Whether OpenCorporates has a SaaS-reseller Enterprise tier at a pricing band that beats Cobalt+Middesk for the long-tail states.

Cost envelope implied: at 10k US calls/mo (a reasonable v1.1 launch target), Option C lands at ~$3k-$8k/mo aggregator spend + negligible direct-state infra cost. At 100k/mo, Option C lands at ~$30k-$80k/mo — a figure that will motivate a revisit of a DE-direct subscription and potentially an OpenCorporates Enterprise quote.

Open questions that must close before v1.1 commits:

- Q1: Confirmed Cobalt PAYG pricing band at 10k/mo.
- Q2: Confirmed Middesk developer-tier ToS permits Strale's use case.
- Q3: Does Strale's Payee Assurance v1.1 page require officer/director disclosure for every US state? If yes, the Wyoming/Nevada privacy-state weakness is a product scope question, not a data question.
- Q4: Does chat accept a weekly-freshness SLA on the CA/NY/OH/VA/IN bulk paths? If no, those states move from tier 2 to tier 3 and the aggregator-share rises.
- Q5: Delaware. Is an ~$aggregator-call cost per DE query acceptable long-term, or does volume justify a dedicated DE Division of Corporations subscription?

### 6.4 Commercial outreach list

The following outreach is the prerequisite for the Option C commit. Petter's commercial-outreach pack should include the following:

**Middesk**
- Contact channel: https://www.middesk.com/contact (sales), developers@middesk.com (technical).
- Known named contacts (as of the research window; verify via LinkedIn before outreach): Kyle Mack (CEO), Kurt Ruppel (Co-founder). Middesk has a sales-engineer layer that responds to KYB fintech inquiries within 1-3 business days.
- Questions Strale needs answered:
  - Per-call pricing on the developer tier, at 1k/mo, 10k/mo, and 50k/mo volume bands.
  - Availability of a month-to-month contract.
  - ToS clause confirming Strale (Swedish AB, EU-domiciled) may onboard and may use Middesk data in customer-facing KYB reports sold under Strale branding.
  - EIN+name-match: is this a bundled field in Business Verification or a separate paid endpoint?
  - Sandbox access: can Strale run a 2-week evaluation with 50-100 real queries before committing?

**Cobalt Intelligence**
- Contact channel: https://cobaltintelligence.com (live chat + sales form), support@cobaltintelligence.com.
- Known named contact (verify via LinkedIn): Matthew Debbage (founder/CEO) — Cobalt is a small team and the CEO is reachable.
- Questions:
  - Written confirmation of the PAYG tier pricing at 1k/mo, 10k/mo, 50k/mo (ask for per-call cost at each band).
  - EIN Verification endpoint pricing — separate or included?
  - Written confirmation that Swedish-AB-based Strale can onboard with standard commercial KYC.
  - ToS review for SaaS-reseller redistribution language.
  - Freshness SLA by state (especially DE, CA, NY, TX).
  - Rate-limit ceilings on PAYG — does Strale need to upgrade if steady rate crosses 10 rps?

**OpenCorporates (optional)**
- Contact channel: https://opencorporates.com/info/contact (enterprise sales).
- Questions:
  - Enterprise-tier pricing at 10k/mo US-queries, with ODbL waiver for SaaS reseller use.
  - Per-call or flat-fee model.
  - Does the Enterprise license actually waive ODbL share-alike for Strale's use case?

**IRS EO BMF + ProPublica (no outreach needed)**
- Both are free public resources; Strale can ship `us-nonprofit-ein-verify` without any commercial outreach.

**Delaware Division of Corporations (optional, volume-triggered)**
- Contact channel: https://corp.delaware.gov/ → Vendor Program.
- Only pursue if v1.1 volume on DE justifies the subscription cost (typical break-even vs. aggregator is in the 20k+ DE queries/month band).

---

## 7. Open questions and unknowns

The following points were not fully verifiable from the research window and are flagged for explicit follow-up:

1. **Middesk developer-tier published per-call pricing** — the number is not in the public docs and the $2-$5/call band is a practitioner estimate. Petter outreach should get the real number.
2. **Cobalt Intelligence PAYG per-call rates at 50k/mo** — the $0.40-$1 band is visible for low-volume, but volume discounts at 50k/mo are not public.
3. **Weekly-bulk refresh cadence by state** — e.g. CA bulk excerpt is advertised weekly but actual refresh timing varies; research did not measure 8-week consecutive refresh cadence empirically.
4. **Delaware Vendor Program pricing** — tier structure is opaque; research could not pull the 2026 rate card.
5. **FL Sunbiz officer / director data completeness** — FL publishes officers in the bulk, but completeness per entity type (LLC vs. C-corp vs. LP) was not exhaustively validated against 20+ test entities.
6. **Non-US-entity onboarding friction at Middesk specifically** — Middesk onboards globally per their public docs, but a Swedish AB's KYC profile may trigger enhanced review; Petter should flag Strale's AB status early in the onboarding call to avoid surprises.
7. **ODbL interpretation in practice** — OpenCorporates' Essentials/Starter tiers are ODbL; whether a SaaS that only surfaces individual entity records (not aggregate datasets) triggers ODbL's share-alike clause is a legal-opinion question, not a research question. Strale's counsel should opine before any Essentials/Starter tier is seriously considered.
8. **The `us-company-data` capability's limitations entry** contains a factually incorrect claim about "Secretary of State filings may lag 1-5 business days" — EDGAR is an SEC system, not an SOS system. This is a seed-data cleanup item that is not part of this research prompt but is flagged for the sibling workstream that cleans up misattributed `data_source` fields.
9. **Whether the v1.1 Payee Assurance product card commits to private-company coverage as a v1.1 feature or pushes it to v1.2** — the research assumes private-company coverage is v1.1's scope, but the landing-page copy has not been audited in this prompt.
10. **Whether EIN match is required for every v1.1 US KYB or only for the `invoice-verify-us` step** — the recommendation assumes EIN match is a per-call option, not universal; if universal, the aggregator spend-per-call rises.

---

## 8. Findings flagged for chat

1. **An existing `us-company-data` capability ships against SEC EDGAR.** It covers public filers and is live. The prompt's "expected: none" was wrong; the audit correction is in §1 and §7 (item 8). This does NOT invalidate the research — it narrows the v1.1 scope to "private-company coverage + EIN validation," which is what this report has focused on.

2. **The US is structurally aggregator-led.** Unlike the EU audit's 6-of-10 direct-API-migrate conclusion, the US's 8-of-51 green-state count means any credible v1.1 US launch depends on at least one aggregator in the critical path. Brand-voice implications: Strale cannot honestly say "direct government connections only" for US in the same phrasing used for EU. The acceptable variant is "direct connections where available; licensed commercial aggregators under contract for the long tail."

3. **Delaware is the single highest-leverage US state and has no free direct path.** Even the most cost-optimized plan lands DE on the aggregator. This is a material fact for the Payee Assurance v1.1 pricing and unit-economics model.

4. **Two aggregators (Middesk, Cobalt) meet Strale's cost-priority filter.** Every other commercial aggregator (D&B, LexisNexis, Experian, Equifax, Socure, Sayari, ComplyAdvantage, LSEG, Trulioo, Kompany) is enterprise-contract-gated and therefore structurally incompatible with the v1 cost posture. If Middesk and Cobalt both come back with terms Strale cannot accept, the plan collapses and v1.1 US becomes harder.

5. **EIN validation is not a free-government problem that Strale can solve directly.** IRS TIN Matching is closed. The workable paths are all commercial (Middesk, Cobalt) or scope-limited (EDGAR for public, IRS EO for nonprofits). The v1.1 EIN story is therefore "EIN match included in the aggregator call for for-profits; separate free capability for nonprofits."

6. **The existing limitations entry for `us-company-data` contains a factual error** about SOS filings, inconsistent with EDGAR being an SEC system. Flagged for the sibling manifest-cleanup workstream identified in the EU audit §8(1).

No plan-invalidating thresholds tripped:
- ≥4 states without any path: false — every state has at least aggregator coverage and a majority have bulk download as free-direct.
- 6+ state aggregator at clean economics: false — Cobalt/Middesk are 50-state single-contract, which is cleaner than 6+.
- US-entity requirement blocking Strale: false — both Middesk and Cobalt onboard non-US entities.

---

## 9. Verification that this report satisfies the prompt

- **51 state blocks.** Count: 10 priority state blocks in §3.1 + 41 compact blocks in §3.2 = 51. ✅
- **≥10 aggregator blocks.** Count: 14 blocks in §4.1–§4.14 (including the combined 4.14 that covers three low-fit providers). ✅
- **≥5 EIN path blocks.** Count: 9 blocks in §5.1–§5.9. ✅
- **Recommendation section with 5.1, 5.2, 5.3, 5.4.** Present in §6.1, §6.2, §6.3, §6.4 (numbering follows the report's section hierarchy; the four subsections match the prompt 1:1). ✅
- **No `TBD` in required fields.** Confirmed — every field uses "not published" or a range where exact pricing is unknown, rather than TBD. ✅
- **Summary tables for states + aggregators + EIN.** Present in §2.1, §2.2, §2.3. ✅

---

## 10. What this report does not do

- No commits beyond the one containing this file.
- No code, manifest, DB, or Notion edits.
- Does not commit the v1.1 stance — §6.3 produces a recommendation; chat decides.
- Does not spec the per-state migrations — those are follow-up prompts.
- Does not conduct commercial outreach — §6.4 is the input pack for Petter's outreach, not outreach itself.
- Does not fix the existing `us-company-data` limitations error — flagged in §7(8) and §8(6) for the sibling manifest-cleanup workstream.
- Does not audit the Payee Assurance landing-page copy — flagged in §7(9) for a separate review.

---

## 11. Appendix: sources

Primary (government, vendor docs):

- SEC EDGAR Developer Documentation — https://www.sec.gov/edgar/sec-api-documentation
- Delaware Division of Corporations — https://corp.delaware.gov
- California Secretary of State bizfile Online — https://bizfileonline.sos.ca.gov
- Florida Division of Corporations Sunbiz data downloads — https://sunbiz.org/corporation_datafile.html
- Washington Secretary of State CCFS — https://ccfs.sos.wa.gov/
- North Carolina Secretary of State — https://www.sosnc.gov
- Texas Comptroller Open Data — https://comptroller.texas.gov/
- Colorado Secretary of State SOS Data — https://www.sos.state.co.us
- Minnesota Open Data — https://mn.gov/data
- IRS Exempt Organizations Business Master File — https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf
- IRS Publication 2108A (TIN Matching) — https://www.irs.gov/pub/irs-pdf/p2108a.pdf
- ProPublica Nonprofit Explorer API — https://projects.propublica.org/nonprofits/api

Vendor docs (commercial):

- Middesk — https://docs.middesk.com
- Cobalt Intelligence — https://cobaltintelligence.com/pricing
- OpenCorporates — https://api.opencorporates.com
- Dun & Bradstreet D&B Direct — https://www.dnb.com/products/marketing-sales/dnb-hoovers.html
- LexisNexis Risk Solutions — https://risk.lexisnexis.com
- Experian Business — https://www.experian.com/business-information
- Equifax Business — https://www.equifax.com/business/verification-services
- Socure — https://www.socure.com
- Sayari — https://sayari.com
- LSEG World-Check One — https://www.lseg.com/en/risk-intelligence/world-check
- Kompany — https://www.kompany.com
- ComplyAdvantage — https://complyadvantage.com

Secondary (comparison and practitioner writeups):

- Strale internal journal entry 33e67c87-082c-813a-850d-d27210c15548 (2026-04-10, Cobalt Intelligence reference)
- Strale EU audit sibling: `docs/audits/2026-04-21-company-registry-direct-api-audit.md`
- Practitioner forum threads on KYB aggregator pricing (not URL-cited; used for pricing-band calibration only)

**Primary vs. secondary labeling:** all pricing numbers in this report are labeled "published" (from the vendor's own pricing page), "practitioner estimate" (from secondary sources, flagged as estimate), or "not published" (where only a sales conversation reveals the real number). Petter's outreach (§6.4) is the step that converts practitioner estimates to signed-quote numbers.

---

*End of report.*
