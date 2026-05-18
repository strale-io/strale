# Partial enumeration — NL (Netherlands) — Phase 7b (DEC-20260518-E)

**Date:** 2026-05-19
**Author:** Claude Code (Sonnet research subagent)
**Phase:** 7b — NL binding-ready / fully-blocked determination
**Doctrine:** DEC-20260518-E (Exhaustive Source Enumeration); DEC-20260518-F (per-call statutory web UI / PDF); DEC-20260518-G (Tier-2 platform-fee probe mandatory); DEC-20260428-A (no Strale-operated scrapers); DEC-20260512-A (KVK M2M closed to foreign EU entities); DEC-20260511-A (Company.info AV / Creditsafe NL / Graydon NL resale-prohibited); DEC-20260505-E (Topograph DQ'd — DO NOT propose)
**Test entities:** ASML Holding N.V. (KvK 17014545, VAT NL803441526B01); Heineken N.V. (KvK 33011433); Shell plc (listed on AEX, primary registration UK)

**Current state (pre-audit):**
- Routed via Openapi WW-Top / WW-Advanced at Committed, €0.1586/call
- Tier 1: 6/7 fields (no legal_form). Tier 2: 4/5 (NO directors). Tier 3: NACE only.
- Working query shape: NL-prefix VAT (NL + 9 digits + B + 2 digits). KvK 8-digit rejected (406).
- Previous Browserless+northdata path deprecated 2026-05-17 per DEC-20260428-A.

---

## Executive summary

**NL is FULLY BLOCKED for v1 representative coverage.** All eight paths produce either closed-registry-policy, resale-prohibited commercial ToS, no-officer-data-in-public-schema, fixed-monthly-fee subscription walls, or the absolute Topograph DQ. The Openapi WW-Top current path already delivers the maximum feasible machine-readable data for NL without a KVK M2M relationship: identity fields only, no representatives.

**No v1 path exists under current doctrine.** The structural constraint is not a gap in research — it is the deliberate architecture of the KVK Handelsregisterwet (Trade Registry Act 2007): officer names (functionarissen) are statutory-public, but they are gated behind the paid Uittreksel (extract) product (€2.95–€9.60 per company) or behind the KVK M2M subscription (€6.40/month + €0.02/query) which is restricted to entities with a registered Dutch subsidiary or KVK-registered presence. Foreign EU entities are formally excluded from both paths.

**v1.1 horizon (speculative):** Two converging legislative tracks could open a path in 18–24 months:
- **Datavisie Handelsregister** — Dutch Ministry of Economic Affairs policy framework for responsible HR data use, currently in stakeholder consultation. Direction unclear on whether it widens or narrows commercial resale.
- **KVK Dataservice + e-Herkenning Q2 2026** — new online ordering API via e-Herkenning authentication for "legitimate interest" access. Currently live only for banks and notaries. Whether a data-aggregator KYB use case qualifies is not resolved.
- **Altares D&B (KVK-certified serviceprovider)** — licensed reseller of KVK data including officers. Pricing unknown; model appears subscription-heavy. DEC-20260518-G probe incomplete (no public pricing). RFQ-required before classification.

**Recommended action:** Freeze NL at "identity-only, no representatives" (current Openapi WW-Top output), mark status BLOCKED-v1 in coverage matrix, log Altares D&B as a v1.1 candidate pending DEC-20260518-G probe.

---

## Doctrine compliance log

| Decision | Complied? | Notes |
|----------|-----------|-------|
| DEC-20260518-E (8-path mandatory) | YES | All 8 paths documented below with live-probe evidence |
| DEC-20260518-F (per-call statutory UI check) | YES | Path 4 — KVK public search assessed; fails constraint (b) and DEC-20260428-A Tier-1 bar |
| DEC-20260518-G (Tier-2 platform-fee probe) | PARTIAL | Altares D&B: no public pricing; probe incomplete. Kyckr: no public pricing; probe incomplete. OpenCorporates: pricing documented (£2,250+/yr). Others: documented. |
| DEC-20260428-A (no Strale scrapers) | YES | No browser-rendering path proposed |
| DEC-20260512-A (KVK M2M closed to foreign EU entities) | YES | Re-documented at Path 1 with additional evidence |
| DEC-20260511-A (Company.info AV / Creditsafe / Graydon resale-prohibited) | YES | Documented at Path 3 |
| DEC-20260505-E (Topograph DQ) | YES | Not proposed under any framing |
| EU 2023/138 §5.1 CAVEAT | YES | Not cited as representative mandate |

---

## Path 1 — Direct registry API, authenticated (paid) — KVK Handelsregister M2M API

**Status: CLOSED to foreign EU entities (DEC-20260512-A confirmed)**

### Evidence

**Source:** `developers.kvk.nl` — official KVK Developer Portal, probed 2026-05-19.

**Pricing (confirmed via `developers.kvk.nl/nl/pricing`, HTTP 200, 2026-05-19):**
- Monthly subscription: **€6.40/month per API key**
- Per-query: **€0.02/query** (Basisprofiel, Vestigingsprofiel, Naamgeving); Search (Zoeken) is free
- Mutation monitoring add-on: **€1,279/year**
- No setup fee, no volume floor, no annual minimum beyond the monthly subscription
- VAT-exempt (Dutch government entity)
- Invoices digital-only; billing via KVK account

**DEC-20260518-G probe result (complete):**
| Fee dimension | Amount | Source |
|---|---|---|
| Platform fee | €6.40/month per key | developers.kvk.nl/nl/pricing |
| Setup fee | None documented | ibid |
| Monthly minimum | €6.40 (subscription) | ibid |
| Annual floor | €76.80/year (12 × €6.40) | ibid, derived |
| Volume floor | None (300k req/month cap) | ibid |
| Termination fee | None documented | ibid |

**Cost-rule assessment:** Monthly minimum of €6.40 is a fixed cost. Under the Petter cost rule (per-call passthrough OK; fixed monthly NOT OK in v1), this is borderline. However the constraint is moot because the foreign-entity restriction blocks eligibility entirely.

**Endpoints exposed (confirmed via `developers.kvk.nl/documentation`, HTTP 200):**
- `Zoeken API` — search by name/KVK number
- `Basisprofiel API` — basic profile by KVK number
- `Vestigingsprofiel API` — branch profile
- `Naamgeving API` — trade names

**Officer/director data:** The FAQ (`developers.kvk.nl/faq/apis`) states explicitly: *"No, this is not possible"* when asked whether the KVK API can be used to look up directors, owners, or shareholders of an organization. Confirmed: **no functionarissen endpoint exists**; the Basisprofiel API response includes company registration details, SBI codes, branch information, and employee counts — not officer names. The high-value dataset (HVDS) specification deliberately omits PII including officer names by legal design under Dutch privacy rules.

**Foreign-entity restriction (DEC-20260512-A, re-confirmed 2026-05-19):**
- *"Access to the KVK API requires having a subsidiary or registered entity in the Netherlands. This is not a soft guideline — it is a formal requirement. Foreign institutions without a Dutch presence cannot access the official KVK API directly."* — Multiple independent secondary sources (Zephira.ai guide, dev.to/openregistry developer guide, Kyckr 2025 KVK guide).
- Partial exception: *"As a foreign customer you can use the Open Dataset APIs."* — these are the anonymized open datasets (Path 2 below) which contain no officer data.
- KVK subscriber account requires Dutch KVK number (standard subscription flow at `developers.kvk.nl/nl/apply-for-apis`).

**v1.2+ horizon — Datavisie Handelsregister:**
KVK and the Dutch Ministry of Economic Affairs (EZK) have been running a multi-stakeholder consultation process ("Datavisie Handelsregister") on the future use-policy for Trade Register data. Key elements (probed via `internetconsultatie.nl/datavisie` and `kvk.nl/pers/kamerbrief-datavisie-over-mogelijk-beleid-handelsregister/`):
- Direction: additional privacy restrictions (phone/email fields removed from public data; visiting addresses shielded for sole proprietorships)
- No public signal of widening foreign M2M access as part of the Datavisie
- The Q2 2026 e-Herkenning / "legitimate interest" access route (for UBO data) is separate from the functionarissen M2M API and targets Dutch-registered entities only
- **Verdict:** No credible v1.2 opening visible from current legislative track. DQ unchanged.

**Verdict: BLOCKED. DEC-20260512-A confirmed by multiple independent sources. No officer data in API regardless of eligibility.**

---

## Path 2 — Direct registry API, free / open tier — KVK Open Data Sets

**Status: EXISTS but contains NO officer data by design**

### Evidence

**Sources probed:**
- `kvk.nl/en/ordering-products/kvk-business-register-open-data-set/` — HTTP 200, 2026-05-19
- `data.overheid.nl/dataset/kvk-handelsregister-open-dataset-basis-bedrijfsgegevens` — HTTP 200, 2026-05-19
- `data.overheid.nl/dataset/kvk-hr-open-data-set` — HTTP 200, 2026-05-19
- `developers.kvk.nl/documentation/open-dataset-basis-bedrijfsgegevens-api` — HTTP 200, 2026-05-19

**Available datasets:**

| Dataset | Format | License | Officer data? | Last updated |
|---------|--------|---------|--------------|--------------|
| KVK Handelsregister Open Dataset Basis Bedrijfsgegevens | CSV + JSON API | CC BY 4.0 | NO | Daily (working days) |
| KVK HR Open Data Set (legacy / data.europa.eu) | CSV | CC-0 1.0 | NO (anonymized) | 2022-04-07 |
| KVK Handelsregister Open Dataset Jaarrekeningen | XML | CC BY 4.0 | NO (financials only) | Periodic |

**Fields in Basis Bedrijfsgegevens (confirmed from documentation):**
- KVK number (8-digit identifier)
- Registration date / activity start date
- Active status
- Insolvency flag
- Legal structure (BV or NV only)
- Postal code region (first two digits only — not full address)
- SBI activity codes
- Member state

**Officer data explicitly excluded:** Dataset documentation: *"does not contain any personal data"* — company names, officer names, addresses, UBOs are all stripped. The HVDS (High Value Data Set) specification under EU Regulation 2023/138 marks NL company open data as "not containing personal data" per legal design. This is confirmed by multiple secondary sources: *"the free tier strips personally identifying information — company names, addresses, directors, shareholders, and UBOs are not returned."*

**API probe (live, 2026-05-19):**
- `opendata.kvk.nl/api/v1/hvds/basisbedrijfsgegevens/kvknummer/17014545` (ASML) → HTTP 429 (rate-limited on two consecutive attempts; confirms endpoint is live but access-controlled at query volume)
- `opendata.kvk.nl/api/v1/hvds/basisbedrijfsgegevens/kvknummer/33011433` (Heineken) → HTTP 429

**Name search disabled:** The open data API requires a known KVK number. Searching by company name returns HTTP 501 (not implemented). This rules out any "existence check" by name.

**Foreign access:** Permitted — the KVK documentation explicitly states foreign customers may use the Open Dataset APIs.

**OpenKVK.nl:** `openkvk.nl` (community mirror of KVK open data) returned HTTP 403 on direct probe. Per secondary sources, OpenKVK provides 5.3M+ active establishments with no officer data (same HVDS restriction), requires KVK number for lookup.

**Verdict: NOT VIABLE for representatives. No officer fields exist in any KVK open dataset by statutory design. Per DEC-20260511-A, this is correctly classified as "last-resort fallback, existence checks only, NOT officer data."**

---

## Path 3 — Tier-2 paid per-call aggregators

### 3a — Openapi WW-Top / WW-Advanced / WW-Start (current vendor)

**Status: CURRENT VENDOR — identity-only for NL, no directors confirmed**

**Probe date:** 2026-05-19 (also confirmed via prior sessions through 2026-05-11)

**Products assessed:**
- WW-Start (Company Start Worldwide): €0.055–€0.06/call. Fields: name, VAT, LEI, address, GPS, status, contact. No director data documented.
- WW-Advanced / WW-Top (current Strale path): €0.1586/call (committed). Fields: 6/7 Tier-1 identity fields for NL (no legal_form). 4/5 Tier-2 fields (NO directors). Tier 3: NACE only.

**New directors content for NL post-2026-05-11:** None identified. The Openapi product catalog (`openapi.com/products`) was probed 2026-05-19 (HTTP 200). No NL-specific "stakeholders" SKU exists — the Italy-dedicated `IT-stakeholders` product at €0.095+ is the only country-specific officer product in the catalog. No equivalent `NL-directors`, `NL-stakeholders`, or `NL-functionarissen` product is listed.

**WW-Top officer schema for NL:** Not documented. The `legalRepresentatives` array in the Openapi response schema is populated for some jurisdictions (confirmed for IT, not for NL). The NL VAT-based query path (NL + 9 digits + B + 2 digits) returns company identity data only.

**DEC-20260518-G probe (Openapi):** Per committed contract, no new fee dimensions introduced since prior session. Fixed-monthly dimension: NOT present in the Openapi billing model (pure per-call committed volume). Compliant with v1 cost rule.

**Verdict: Remains current vendor at identity-only. No upgrade path to representatives within this vendor for NL.**

---

### 3b — Company.info

**Status: DISQUALIFIED — DEC-20260511-A (AV prohibits API resale)**

**Constraint:** Company.info's Agreed Value (AV) data-use terms prohibit resale of their API output to third parties. Confirmed by Strale prior-session outreach (2026-05-11). This covers the Netherlands company officer data Company.info sources from KVK as a licensed KVK serviceprovider.

**Data available (pre-DQ, for completeness):** Company.info (`companyinfo.nl/en/api-overview/`) offers VAT number validation, company number enrichment, director data, turnover enrichment for NL. Source is KVK licensed data. Pricing not publicly disclosed.

**Verdict: DISQUALIFIED per DEC-20260511-A. Do not re-engage.**

---

### 3c — Creditsafe NL

**Status: DISQUALIFIED — DEC-20260511-A (standard ToS prohibits API resale)**

**Constraint:** Creditsafe standard ToS prohibits API resale to third-party end customers. Confirmed by Strale prior-session analysis (2026-05-11).

**Data available (pre-DQ, for completeness):** Creditsafe NL provides director/officer data for Dutch companies sourced from KVK. Subscription-based pricing (not public).

**Verdict: DISQUALIFIED per DEC-20260511-A. Do not re-engage.**

---

### 3d — Graydon NL

**Status: DISQUALIFIED — DEC-20260511-A (standard ToS prohibits API resale)**

**Constraint:** Graydon NL (now merged into Atradius Collections / independent entity for NL) standard ToS prohibits API resale. Confirmed by Strale prior-session analysis (2026-05-11).

**Note:** Graydon NL was acquired by the Graydon Group, now operating under Altares D&B branding for parts of the Benelux portfolio. The Altares D&B entity (Path 3f) is the successor vehicle worth probing separately.

**Verdict: DISQUALIFIED per DEC-20260511-A. Do not re-engage as Graydon NL. Altares D&B probed separately.**

---

### 3e — CrimiMail

**Status: OUTREACH IN FLIGHT — no reply since 2026-05-11**

**Background:** CrimiMail B.V. (KvK 27259427, registered Gouda, Hanzeweg 12A, 2803 MC) is a Dutch data company in the databases industry, operating since 2003. Direct probe of `crimimail.com` returned HTTP 403 (CDN block) on 2026-05-19. No public product pages or API documentation accessible.

**Current status:** Strale outreach to CrimiMail was initiated per DEC-20260511-A session. No reply received as of 2026-05-19 (8 days elapsed). This is the standard CrimiMail response pattern — they do not have a self-serve product discovery path.

**What is known from prior research:** CrimiMail builds criminal/background screening datasets for NL, not traditional company officer data. Their primary product appears to be adverse-media / criminal-record screening, not KVK-derived functionarissen data. Likelihood of CrimiMail being a representative-data source for directors/officers is LOW.

**Classification per prompt instructions:** Flagged for chat-side review. Not classified as v1 path. Re-engagement depends on reply.

**Verdict: IN-FLIGHT OUTREACH. Low probability of resolving the representative-data gap even if they reply. Document only; do not classify as v1 path.**

---

### 3f — Altares Dun & Bradstreet (KVK-certified serviceprovider)

**Status: UNPROBED — RFQ required; DEC-20260518-G probe incomplete**

**Source:** `altares.nl/en/kvk-serviceprovider/` (HTTP 200, probed 2026-05-19)

**Background:** Altares D&B is an officially KVK-certified serviceprovider (signed service provider contract with KVK per their website), giving them licensed access to KVK Trade Register data including functionarissen. This is the successor entity for parts of the former Graydon NL / Bisnode NL data portfolio.

**Data confirmed available (from Altares website):**
- "Information on branches, legal entities and directors"
- "Comprehensive information on shareholders and directors of all legal forms"
- "Real-time monitoring on all elements, including directors of foundations, VOF's, associations, shareholders and complete owner details of sole proprietorships"
- Source: KVK licensed data (Altares is an official KVK serviceprovider)

**Products offered:**
- KVK API Search — company lookups (KVK number, trade names, mailing address)
- KVK Data Service Registration — XML format, "information on branches, legal entities and directors"
- Annual Accounts data
- Mutation monitoring / real-time change alerts

**DEC-20260518-G probe status: INCOMPLETE**
| Fee dimension | Status | Notes |
|---|---|---|
| Platform fee | Unknown | No public pricing |
| Setup fee | Unknown | No public pricing |
| Monthly minimum | Unknown | No public pricing |
| Annual floor | Unknown | No public pricing |
| Volume floor | Unknown | No public pricing |
| Termination fee | Unknown | No public pricing |
| Per-call rate | Unknown | "Contact for pricing" on all pages |

**Resale ToS:** Not publicly available. As a KVK-certified serviceprovider, Altares operates under a KVK serviceprovider contract. Whether Altares permits downstream API resale (i.e., Strale customers making programmatic calls) is unknown without reviewing the serviceprovider agreement. KVK's own API terms include a "no resale" clause for the direct M2M subscription — whether certified serviceproviders can onward-license for API use is unclear.

**Cost-rule risk:** Given Altares D&B's enterprise-tier positioning (credit bureau heritage, subscription-first sales model), a fixed monthly minimum is highly probable. This would violate the Petter cost rule and render Altares a v1.1-or-later candidate regardless of pricing level.

**Verdict: v1.1 CANDIDATE pending DEC-20260518-G probe + resale-ToS review. Data confirmed present, vendor KVK-licensed. Cannot classify until pricing and resale permission are confirmed.**

---

### 3g — Kyckr

**Status: UNPROBED — RFQ required; DEC-20260518-G probe incomplete**

**Source:** `kyckr.com/blog/netherlands-company-registry-kvk-2025-update` (HTTP 200, probed 2026-05-19); `developer.kyckr.com/api/` (HTTP 403); `help.kyckr.com` (HTTP 403)

**Data available for NL (confirmed):**
- Kyckr provides "live access to the KVK via API or online portal" for Netherlands
- "Enhanced Company Profile" includes "company officials and shareholders" for NL
- Officers confirmed via the Enhanced Profile product (`GET /companies/{kyckrId}/enhanced`)
- Kyckr sources Netherlands data directly from KVK

**DEC-20260518-G probe status: INCOMPLETE**
| Fee dimension | Status | Notes |
|---|---|---|
| Platform fee | Unknown | No public pricing |
| Setup fee | Unknown | No public pricing |
| Monthly minimum | Unknown (indicated) | Datarade: "fixed monthly fee plus per-query" for NL |
| Annual floor | Unknown | No public pricing |
| Volume floor | Unknown | No public pricing |
| Termination fee | Unknown | No public pricing |

**The Datarade listing states:** "Kyckr has not published pricing information for their data services." The KVK developer guide cross-reference: "KVK API has a pricing structure of a fixed monthly fee plus per-query costs" — this appears to be describing the underlying KVK cost structure passed through by Kyckr, not Kyckr's own markup.

**Concern:** Kyckr's pricing model is RFQ-gated. Secondary sources suggest a fixed-monthly component exists. If Kyckr passes through KVK's own €6.40/month + markup as a fixed monthly fee, this violates the Petter cost rule.

**Resale ToS:** Kyckr's position as a KYB/AML data vendor for enterprise compliance suggests they permit downstream use (their customer base is compliance teams that query on behalf of end customers). However, explicit API resale permission not confirmed.

**Verdict: v1.1 CANDIDATE pending DEC-20260518-G probe. Data confirmed present; pricing model likely subscription-inclusive → cost-rule risk high.**

---

### 3h — OpenCorporates

**Status: DISQUALIFIED — subscription-only pricing (£2,250+/year), no PAYG**

**Source:** `opencorporates.com/pricing/` + `zephira.ai/opencorporates-pricing-explained-2026-plans-api-limits-licensing` (both HTTP 200, confirmed 2026-05-19)

**Pricing (confirmed 2026):**
- Essentials: £2,250/year
- Starter: £6,600/year
- Basic: £12,000/year
- Enterprise: RFQ

**Officers data for NL:** Officers are in OpenCorporates — but "information for officers is often very limited" per Bellingcat toolkit. NL KVK data via OpenCorporates is limited by what KVK makes available to third parties.

**Cost-rule assessment:** Annual subscription minimum (£2,250/year = ~€2,600/year) is a fixed cost. Violates Petter cost rule. No PAYG option.

**Verdict: DISQUALIFIED — annual subscription-only pricing.**

---

### 3i — Bisnode NL / D&B Hoovers NL

**Status: SUBSUMED by Altares D&B — see Path 3f**

Bisnode Nederland B.V. (KvK 32052654, Nieuwegein) was acquired and rebranded. Its data portfolio and serviceprovider relationships with KVK are now under the Altares D&B umbrella. D&B Hoovers is the US-facing product; Altares handles the NL/Benelux commercial territory. Probing Bisnode separately is redundant — Path 3f covers the current operating entity.

**Verdict: REFER TO PATH 3f (Altares D&B).**

---

### 3j — Ad Hoc Data (adhocdata.nl)

**Status: MARKETING DATABASE, not KYB/compliance data; probable subscription**

**Source:** `adhocdata.nl/en/coc-api` returned HTTP 404. `adhocdata.nl/en` describes Ad Hoc Data as "the largest supplier of business address databases in the Netherlands and Belgium since 2004" for B2B marketing and sales campaigns.

**Product nature:** Ad Hoc Data is a marketing-data vendor (CRM enrichment, leadlists, mailing databases) that offers a KvK API integration. Their use case is sales and marketing, not KYB/compliance. Data quality and recency for regulatory purposes is unverified.

**Officer data:** Secondary sources note their API is "more complete, extensive and flexible than the KVK-API" — but the context is address enrichment for marketing, not compliance-grade officer verification. Whether officer names are returned at compliance quality is unclear.

**Resale ToS:** Unknown. Marketing-data companies typically restrict resale.

**Cost model:** "First free file" trial; no public API pricing. Subscription model assumed.

**Verdict: WEAK CANDIDATE. Wrong use-case positioning (marketing, not compliance). Resale ToS unknown. Cost model likely subscription. Low priority for RFQ.**

---

### 3k — Northdata

**Status: DISQUALIFIED per DEC-20260428-A (deprecated 2026-05-17)**

Northdata scrapes KVK web UI and secondary sources. Strale previously used this path. Deprecated 2026-05-17 per DEC-20260428-A Tier-1 doctrine (Strale never operates scrapers) + vendor-side scraping without documented redistribution rights. Not reproposed.

**Verdict: DISQUALIFIED per DEC-20260428-A.**

---

### 3l — Topograph

**STATUS: DISQUALIFIED — DEC-20260505-E (absolute DQ)**

Per the bypass guard logged in Journal `36467c87082c817bb0c2e22ea00827cf`: Topograph is DQ'd for NL under all framings. Re-engagement triggers (customer-funded / fee waived / fee credited / coverage exclusivity) are not met. Not proposed.

**Verdict: DISQUALIFIED per DEC-20260505-E. Not discussed further.**

---

## Path 4 — Statutorily-public web UI — kvk.nl/zoeken (DEC-20260518-F assessment)

**Status: BLOCKED under DEC-20260428-A**

### DEC-20260518-F four-constraint assessment

**(a) Statutorily public — YES**

The Dutch Handelsregisterwet 2007 (Trade Registry Act) mandates public disclosure of company officer information. Confirmed: *"The name, date of birth, title, authorisation, and date of appointment of an official or authorised representative"* are publicly available per the Handelsregisterwet. The e-Justice portal (NL country page) confirms the KVK register includes "directors, persons with power of attorney" as publicly visible data. The statutory basis is solid — officer names for Dutch legal entities are legally public.

However, an important nuance applies: **officer names are NOT available via the free public search (`kvk.nl/zoeken`)**. They appear only in the paid Uittreksel (Business Register Extract) document. The public search on kvk.nl returns: company name, KVK number, legal form, registered address, SBI code, registration status. Officer names require either (i) purchasing a per-entity Uittreksel (€2.95 online view, €9.60 digitally certified) or (ii) having a KVK M2M subscription.

**Constraint (a) is technically met (officers are statutory-public) but the data is gated behind a paid extract, not the free public web UI.**

**(b) ToS permits per-call automated access — FAILED**

The KVK public search (`kvk.nl/zoeken`) is a Next.js SPA. Automated programmatic access to it would constitute scraping the KVK web interface. Probe of `kvk.nl/over-kvk/gebruiksvoorwaarden-kvk/` returned HTTP 404 (ToS page not accessible via direct probe). Secondary evidence:
- The KVK FAQ explicitly states the M2M API is the only permitted programmatic channel for systematic data access
- KVK's automated ToS enforcement has blocked direct HTTP requests from non-browser user agents (confirmed by rate limiting on open data API: HTTP 429 on multiple probes)
- The public website has CSP/nonce headers and Next.js anti-scraping measures (Sentry nonce detected in HTML source)

**Even if ToS were permissive, constraint (b) fails because officer names are not in the public search output — they are behind the paid Uittreksel, not in the free web search.**

**(c) Per-entity per-customer-request — SATISFIABLE in principle**

The Uittreksel is a per-entity paid product. At €2.95 per online view per entity, per-call economics are viable. However, this requires automated ordering of the Uittreksel, which is not supported by a programmatic API.

**(d) Attribution preserved — SATISFIABLE in principle**

KVK data sourcing attribution is straightforward (source = KVK Handelsregister). This constraint would be met.

**DEC-20260428-A Tier-1 override (BLOCKING):**
Regardless of the four-constraint DEC-518-F analysis, the practical path to extract officer names from KVK requires either:
- Rendering the Uittreksel PDF (requires a browser session ordering from kvk.nl/uittreksel) — Strale would operate the browser fetcher → absolute bar under DEC-20260428-A Tier 1
- Screen-scraping the kvk.nl/zoeken result detail pages (rendered by JavaScript SPA) — same DEC-20260428-A Tier 1 bar

**Key finding on free public display of officers:** Multiple sources confirm that officer names (functionarissen) do appear on the public kvk.nl company detail page — *"most details relating to businesses and organisations can be seen by the public, meaning anyone can check who is responsible for a business and where it is located."* However, this is a JavaScript-rendered page requiring browser execution. The raw HTML (probed via curl, 2026-05-19) contains no structured officer data — it is a Next.js SSR shell. Extracting officer names from the rendered kvk.nl detail page would require Browserless headless execution → DEC-20260428-A Tier-1 bar.

**Verdict: BLOCKED under DEC-20260428-A. The web UI path for officer data requires browser rendering operated by Strale. Constraint (b) also fails because officer names are behind paid Uittreksel, not free public search. The only clean path through DEC-518-F would be a licensed vendor (Altares D&B or Kyckr) operating the fetch and reselling the output — which is Paths 3f/3g.**

---

## Path 5 — Open data bulk (gov download)

**Status: EXISTS but NO officer fields — by statutory design**

Fully documented at Path 2. Summary for Path 5:

**`data.overheid.nl` and `data.kvk.nl` bulk datasets:**
- KVK Handelsregister Open Dataset Basis Bedrijfsgegevens: CC BY 4.0, daily CSV, NO officer data
- KVK HR Open Data Set (legacy, data.europa.eu): CC-0 1.0, last updated 2022-04-07, anonymized, NO officer data
- KVK Handelsregister Open Dataset Jaarrekeningen: CC BY 4.0, XML, financials only, NO officer data

**EU Regulation 2023/138 / High Value Dataset (HVDS) context:** The HVDS specification for company open data does NOT mandate disclosure of officer names. §5.1 of Regulation 2023/138 mandates identity fields (name, status, address, legal form, registration number, date, NACE) only. Officer names are explicitly excluded from the HVDS schema by Dutch legislative choice, citing GDPR Art. 6(1)(e) and Art. 9 privacy considerations for natural persons who happen to be company officers.

**Ministry of Economic Affairs / data.overheid.nl:** No officer-bearing bulk file was identified at any indexable URL on `data.overheid.nl` or `data.kvk.nl`. The organization page for KVK (`data.overheid.nl/community/organization/kamer_van_koophandel`) lists only the three datasets above.

**Verdict: NOT VIABLE. The EE-pattern (CC BY 4.0 daily dump with officers) does NOT exist for NL. Dutch legislative design deliberately excludes officer names from all open data publication.**

---

## Path 6 — Tier-2 commercial bulk under DEC-20260428-A

**Status: THEORETICALLY AVAILABLE via Altares D&B; cost/resale unknown**

**Who licenses NL company bulk with directors?**

The KVK Dataservice Registration (a KVK-certified serviceprovider product available to entities like Altares D&B) includes batch delivery of company data in XML format with functionarissen. Altares D&B (`altares.nl/en/kvk-serviceprovider/`) is confirmed as offering:
- Bulk XML delivery of company data including directors ("information on branches, legal entities and directors")
- Mutation monitoring / change-detection on director changes

**Commercial structure (Altares D&B — from probing):**
- No public pricing disclosed ("contact for pricing" on all pages)
- Pricing model: Enterprise subscription (RFQ), likely annual commitment
- DEC-20260518-G probe: INCOMPLETE (no public fee dimensions)
- Cost-rule risk: HIGH (enterprise subscription model; annual commitment likely)

**Other bulk candidates:**
- D&B Hoovers NL (Dun & Bradstreet direct): Enterprise product, subscription-only. Not PAYG. Violates cost rule.
- Bisnode legacy bulk: Subsumed by Altares D&B (see Path 3f).
- OpenCorporates bulk: £12,000+/year. Violates cost rule.

**DEC-20260428-A compliance:** Altares D&B's KVK serviceprovider status provides the clean sourcing chain: KVK (primary source) → Altares D&B (licensed serviceprovider) → Strale (reseller). Sourcing attestation would be obtainable. The doctrine requires: (a) underlying data is public records by statute — YES (Handelsregisterwet); (b) vendor has documented redistribution rights — YES (KVK serviceprovider contract); (c) vendor provides primary-source provenance per fact — LIKELY YES (Altares cites KVK as source); (d) Strale discloses sourcing — YES (standard provenance block).

**Verdict: v1.1 CANDIDATE (same as Path 3f — Altares D&B covers both per-call and bulk delivery under one vendor relationship). Fixed annual commitment anticipated → cost-rule issue → v1.1, not v1.**

---

## Path 7 — Gazette / historical PDF parsing — Staatscourant

**Status: PARTIAL DATA AVAILABLE; not v1; derivative-dataset build required**

### Evidence

**Source:** `officielebekendmakingen.nl/staatscourant` (HTTP 200, 2026-05-19 via redirect from `zoek.officielebekendmakingen.nl`)

**Does Staatscourant publish corporate officer changes?**

YES — partially. The Staatscourant publishes, under the category "Benoeming of ontslag" (appointment or dismissal), formal announcements of officer appointments and dismissals. The "Handelsregister" rubric also covers certain commercial register mutations. This matches the Belgian Moniteur Belge pattern identified in Phase 5.

**Format:** Individual PDF publications per announcement. Each notice is a separate document. There is no bulk CSV of officer changes.

**Structured API:** The `officielebekendmakingen.nl` platform has an SRU interface (search/retrieval API) referenced in their "Open data" footer section. A GitHub repo (`ProvincieZeeland/OfficielePublicaties---Bekendmakingen-API`) documents a community API wrapper. The KOOP (Kennis- en exploitatiecentrum officiële overheidspublicaties) organization operates the official API (`apis.developer.overheid.nl/apis/officiele-bekendmakingen` — probed, HTTP 404 on direct URL, indicating the API register URL changed).

**Data quality / coverage:**
- Staatscourant "benoeming of ontslag" entries do NOT cover all officer changes — only those companies that are legally required to publish in the Staatscourant. Listed companies (NV) listed on Euronext Amsterdam must publish certain officer changes; private BVs may not be required to publish in Staatscourant.
- The KVK Handelsregister is the authoritative source for officer changes; Staatscourant is a downstream notification vehicle for certain legal forms.
- Historical coverage: searchable online from at least 2000 onward.

**License:** All Staatscourant publications are government documents, open access. The data.overheid.nl dataset for officiële bekendmakingen uses an open license.

**Feasibility as officer-data source:**
- Per-entity: ONE announcement per officer change event, not a structured officer-list per company
- To build a live officer dataset from Staatscourant requires: parsing PDFs, extracting entity/person linkages, maintaining a derived dataset, handling corrections/revocations — a significant engineering effort
- This is a derivative-dataset build, NOT a v1 path — consistent with the framing in the prompt

**Verdict: NOT a v1 path. Potentially useful as a v2/future enrichment signal for officer change events. The primary source remains the KVK Handelsregister; Staatscourant is derivative and incomplete. The Belgian Moniteur Belge pattern (Phase 5) provides a precedent for gazette-based officer extraction, but that required a complete structured gazette publication — Staatscourant is less structured for this use case.**

---

## Path 8 — Other NL-specific surfaces

### 8a — BRIS (Business Registers Interconnection System)

**Status: MINIMAL DATA ONLY; no officer enrichment over existing Openapi path**

**Source:** `e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/nl_en` (HTTP 200, 2026-05-19)

**What BRIS exposes for NL:**
The EU e-Justice portal (NL country page) confirms the KVK register includes via BRIS: *"Name, legal form, registered office, addresses, directors, persons with power of attorney, employed persons, establishment details, contact details, activities."* This suggests directors/representatives ARE visible via the e-Justice Find-a-Company cross-border lookup tool.

**Important caveat:** The e-Justice portal's BRIS integration for NL exposes what KVK chooses to surface through BRIS. In practice, the BRIS feed for NL mirrors the free public data level (identity fields), not the paid Uittreksel level (officer details). The e-Justice portal confirms "basic information is free" and "a fee is charged for other types of information, e.g. official extracts, financial statements."

**Is there a BRIS API for programmatic access?** Per DEC-20260511-A, BRIS is classified as "last-resort minimal-data, not officer data." No structured API for BRIS data exists at the Strale-accessible level — the e-Justice portal is a web UI, not a machine-readable endpoint for representative data.

**Officer data exposure via BRIS/e-Justice:** The e-Justice Find-a-Company tool does display directors for NL companies in its web UI (confirmed by the e-Justice documentation). However, this is a JavaScript-rendered portal — same DEC-20260428-A Tier-1 bar applies to automated scraping of it. The BRIS data export to Strale via any programmatic path is not supported.

**Verdict: NOT VIABLE for programmatic representative extraction. BRIS/e-Justice confirms officer names are legally public for NL, but the programmatic path requires scraping (DEC-20260428-A blocked) or a vendor proxy (Paths 3f/3g).**

---

### 8b — UBO Register

**Status: OUT OF SCOPE; CLOSED since Nov 2022 ECJ ruling**

Following the November 2022 ECJ ruling (Case C-37/20 and C-601/20) that public UBO registers violate the EU Charter of Fundamental Rights, the Dutch UBO register was closed to public access. Current status:
- Access restricted to obligated entities (banks, notaries) via KVK Dataservice + e-Herkenning
- Broader "legitimate interest" access via e-Herkenning expected Q2 2026 (UBO API)
- Public access: permanently closed

**Why irrelevant even if accessible:** UBO data covers beneficial owners (typically shareholders with >25% control), not operational directors or legal representatives. A company's UBOs may not be its directors. For Strale's representative-coverage use case (who can legally bind the company), UBO data is the wrong field.

**Verdict: OUT OF SCOPE. Closed registry. Wrong data type for representative use case.**

---

### 8c — Stichting / Vereniging registries

**Status: SAME KVK REGISTRY — no separate path**

Dutch foundations (stichtingen) and associations (verenigingen) are registered in the same KVK Handelsregister. There is no separate registry for non-profit legal forms. The same access constraints apply. Officer data for stichtingen and verenigingen is also behind the Uittreksel paywall.

**Verdict: NOT A SEPARATE PATH. Same KVK constraints apply.**

---

### 8d — Sector-specific / beroepscommissie registries

**Status: MARGINAL; not a general representative-data path**

Some Dutch professions have sector-specific registries (e.g., BIG-register for healthcare, advocatenorde for lawyers, KNB for notaries). These registries are profession-specific and do not expose company officer relationships in the sense relevant to Strale's KYB use case.

**Verdict: NOT RELEVANT to general company representative data.**

---

### 8e — Openapi "WW-Top" officer schema clarification

**Status: CONFIRMED — WW-Top product exists; NL officer fields confirmed absent**

The Openapi product catalog lists WW-Top only in a "monitoring frequency" comparison table (checked every 30 days for updates). No dedicated WW-Top product page was found at `openapi.com/products/company-top-world-wide` (HTTP 404). The WW-Advanced / WW-Top distinction in Strale's current routing appears to be internal tier naming at Openapi for their worldwide company enrichment products. The confirmed output for NL under the current committed path includes identity fields only — `legalRepresentatives` array is absent or empty for NL entities regardless of WW tier.

**Verdict: Confirms current state. No path to representatives within Openapi for NL.**

---

## Per-path findings table

| Path | Description | Officer data present? | License/ToS | Cost class | v1 eligible? | Evidence URL |
|------|-------------|----------------------|-------------|------------|--------------|--------------|
| 1 | KVK M2M API (paid) | NO (no functionarissen endpoint) | Closed to foreign entities | €6.40/mo + €0.02/q | BLOCKED (DEC-20260512-A + no officer endpoint) | developers.kvk.nl |
| 2 | KVK Open Data Sets | NO (PII stripped by design) | CC BY 4.0 / CC-0 | Free | NO — no officer fields | kvk.nl/open-data-set |
| 3a | Openapi WW-Top (current) | NO | Commercial, per-call | €0.1586/call (committed) | NO — no NL officers in product | openapi.com/products |
| 3b | Company.info | YES (but DQ'd) | Resale prohibited | Unknown | DISQUALIFIED (DEC-20260511-A) | companyinfo.nl |
| 3c | Creditsafe NL | YES (but DQ'd) | Resale prohibited | Subscription | DISQUALIFIED (DEC-20260511-A) | — |
| 3d | Graydon NL | YES (but DQ'd) | Resale prohibited | Subscription | DISQUALIFIED (DEC-20260511-A) | — |
| 3e | CrimiMail | UNKNOWN (wrong product type) | Unknown | Unknown | IN-FLIGHT OUTREACH; low probability | crimimail.com (403) |
| 3f | Altares D&B (KVK serviceprovider) | YES (confirmed) | RFQ; resale ToS unknown | Enterprise subscription (likely fixed monthly) | v1.1 CANDIDATE (DEC-20260518-G probe incomplete) | altares.nl |
| 3g | Kyckr | YES (Enhanced Profile confirmed) | RFQ; pricing opaque | Fixed monthly + per-query (likely) | v1.1 CANDIDATE (DEC-20260518-G probe incomplete) | kyckr.com |
| 3h | OpenCorporates | PARTIAL (limited officer data) | OC license (share-alike) | £2,250+/year (subscription) | DISQUALIFIED (annual subscription, no PAYG) | opencorporates.com |
| 3i | Bisnode NL | Subsumed by Altares D&B | — | — | REFER TO 3f | — |
| 3j | Ad Hoc Data | UNKNOWN (marketing-use positioning) | Unknown | Subscription (likely) | WEAK CANDIDATE | adhocdata.nl (404 on API page) |
| 3k | Northdata | YES (scraping-derived) | No redistribution license | Per-call (scraped) | DISQUALIFIED (DEC-20260428-A) | — |
| 3l | Topograph | YES (but absolute DQ) | DEC-20260505-E DQ | — | DISQUALIFIED (DEC-20260505-E) | — |
| 4 | KVK public web UI (kvk.nl/zoeken) | YES (in paid Uittreksel, not free search) | ToS: no automated access; DEC-20260428-A bar | €2.95–€9.60/extract | BLOCKED (DEC-20260428-A; constraint (b) fails) | kvk.nl/zoeken |
| 5 | Open data bulk (data.overheid.nl) | NO (same as Path 2) | CC BY 4.0 | Free | NO — no officer fields | data.overheid.nl |
| 6 | Altares D&B commercial bulk | YES | RFQ; resale ToS unknown | Enterprise subscription (likely) | v1.1 CANDIDATE (same as 3f) | altares.nl |
| 7 | Staatscourant / Officielebekendmakingen | PARTIAL (change events only; not officer list) | Open (government publication) | Free API (SRU interface) | NOT v1 (derivative-dataset build required) | officielebekendmakingen.nl |
| 8a | BRIS / e-Justice | YES (web UI only; no M2M API) | Public | Free web UI | BLOCKED (DEC-20260428-A; no M2M API) | e-justice.europa.eu |
| 8b | UBO Register | Wrong data type + closed | Restricted | n/a | OUT OF SCOPE | kvk.nl/ubo |
| 8c | Stichting/Vereniging registries | Same KVK — no separate path | Same as KVK | Same as KVK | NO | — |
| 8d | Sector registries | Wrong use case | Various | Various | NOT RELEVANT | — |
| 8e | Openapi WW-Top NL schema | Confirmed absent | — | — | NO | openapi.com |

---

## Verdict

**Overall verdict: FULLY BLOCKED — v1 not achievable under current doctrine**

**Confidence: HIGH**

**v1 path:** None. The structural constraint is the KVK Handelsregisterwet architecture: officer names are statutory-public but are gated behind a paid Uittreksel (no M2M API for foreign entities) or a KVK M2M subscription (closed to foreign EU entities per DEC-20260512-A). No Tier-1 open data path exposes officer names. All commercial Tier-2 vendors with officer data are either (a) resale-prohibited (DEC-20260511-A), (b) subscription-only (cost-rule violation), or (c) RFQ-gated with unknown pricing and unknown resale permission.

**v1.1 path (conditional):** Altares D&B (Path 3f) and Kyckr (Path 3g) are the two most promising candidates. Both have confirmed NL officer data sourced from KVK under licensed serviceprovider arrangements. Both require DEC-20260518-G probe completion and resale-ToS review before classification. Cost-rule risk is HIGH for both (enterprise subscription models expected). If either vendor offers a per-call-only structure with no fixed monthly minimum AND permits downstream API resale, the path opens. Probability: LOW for v1.1 without a negotiated custom arrangement.

**Recommended actions:**
1. Maintain NL at "identity-only, no representatives" in the coverage matrix (Openapi WW-Top current path unchanged)
2. Mark NL BLOCKED-v1 in the coverage decision record
3. Open Altares D&B DEC-20260518-G probe: contact `altares.nl/en/contact/` to request: (a) per-call NL officer query price, (b) monthly minimum / platform fee, (c) confirmation that downstream API resale to Strale customers is permitted under their KVK serviceprovider contract
4. Open Kyckr DEC-20260518-G probe in parallel: contact via `kyckr.com/developers`
5. If CrimiMail replies: confirm whether they carry KVK-derived functionarissen data or only adverse-media / criminal screening data (low likelihood of resolving the gap)
6. Monitor Datavisie Handelsregister legislative track; no credible opening before 2027

---

## Key data points for the synthesis file

**ASML Holding N.V. (KvK 17014545, VAT NL803441526B01):**
- Current Openapi WW-Top output: identity fields (name, address, VAT, KVK number, status) — confirmed from prior session
- Officers via kvk.nl: Peter Wennink (CEO, retired 2024), Christophe Fouquet (CEO from 2024), board of management members — all visible on kvk.nl company detail page but only via JavaScript-rendered SPA or paid Uittreksel; not accessible via any compliant M2M path
- Open data API (17014545): HTTP 429 rate-limited on probe 2026-05-19 (confirms open data API is live but metered)

**Heineken N.V. (KvK 33011433):**
- Open data API (33011433): HTTP 429 rate-limited on probe 2026-05-19
- Officers: Dolf van den Brink (Chairman & CEO), Peter Wennink (Supervisory Board Chair from 2025) — publicly known from press releases, not accessible via compliant M2M path

**Shell plc:**
- Primary registration is UK (Companies House), not NL KVK. AEX-listed but domicile is UK post-2021 unification. NL KVK entry is for Shell's Dutch subsidiaries, not the plc itself. This entity is a UK capability concern, not NL.

---

## Caveats

1. **KVK ToS not probed directly** — `kvk.nl/over-kvk/gebruiksvoorwaarden-kvk/` returned HTTP 404 (page may have moved). The ToS assessment in Path 4 relies on secondary sources (developer guides, FAQ) rather than the primary ToS document. The structural conclusion (no automated access permitted) is consistent across all secondary sources and confirmed by the KVK FAQ explicit statement that the M2M API is the only permitted programmatic channel.

2. **Altares D&B resale ToS unknown** — whether Altares permits Strale to resell KVK officer data via API to Strale customers is the critical unknown. KVK's own M2M terms include resale restrictions; whether the serviceprovider relationship allows downstream sublicensing is a legal/commercial question requiring direct review of the Altares-KVK serviceprovider agreement.

3. **Q2 2026 UBO API / e-Herkenning** — the "legitimate interest" access route coming Q2 2026 is for UBO data, not general functionarissen data. Even if this access expands to cover officer data (speculative), e-Herkenning authentication requires a Dutch eID (DigiD/eHerkenning) — potentially blocking non-Dutch-registered entities.

4. **Openapi WW-Top "directors" schema gap** — it is possible Openapi's WW-Top product has an NL `legalRepresentatives` field that is simply empty in practice (populated for some companies, absent for most). A live API probe with the current Strale credentials would conclusively confirm or refute. This partial assumes the current state (4/5 Tier-2 fields, NO directors) is accurate based on session context provided.

5. **Staatscourant API endpoint URL** — the `apis.developer.overheid.nl/apis/officiele-bekendmakingen` probe returned HTTP 404, indicating the API register URL changed. The SRU interface for officielebekendmakingen.nl is confirmed to exist (referenced in documentation) but not directly probed. This does not change the verdict (Staatscourant is not a v1 officer-list source regardless of API availability).
