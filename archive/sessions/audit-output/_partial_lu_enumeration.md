# LU — 8-path source enumeration (DEC-20260518-E)

**Investigation date:** 2026-05-18
**Doctrine:** DEC-20260518-E (Exhaustive Source Enumeration); DEC-20260518-F (statutorily-public per-entity HTML/PDF); DEC-20260518-G (mandatory platform-fee probe on Tier-2 vendors); DEC-20260428-A (no Strale-operated scrapers); Petter cost rule (per-call passthrough OK, fixed monthly NOT OK in v1)
**Test entities:** RTL Group (LU18513414), Aperam, BGL BNP Paribas, Cargolux, BCEE, SES — all 6/7 Tier-1 fields confirmed via Openapi WW-Top; ArcelorMittal SA (LU18804375 VAT / B82454 RCS) — confirmed Openapi index-hole.
**ArcelorMittal ID resolution:** LU18804375 is the VAT number. Canonical RCS number is **B82454** (confirmed via: corporate.arcelormittal.com articles of association explicitly state "R.C.S. Luxembourg, section B numéro 82 454"; Northdata entry `/ArcelorMittal+SA,+Luxembourg/B82454`). Openapi's LU-prefix VAT route returns data for the 6 known good entities but fails for LU18804375 — B82454 exists in the LBR register but the VAT↔RCS cross-link is broken in Openapi's index.

---

## Path 1 — Same vendor (Openapi WW-Top), other endpoints or LU-specific product

**URL probed:** `https://openapi.com/products?api=company` (full product catalog), `https://console.openapi.com/apis/company/documentation`, `https://openapi.com/products/company-start-world-wide`, `https://openapi.com/products/company-advanced-world-wide`

**Findings:**

The Openapi product catalog lists no LU-specific product. Country-specific products exist for AT, BE, CH, DE, ES, FR, GB, IT, PL, PT — Luxembourg is absent from the dedicated product tier. The WW-Start and WW-Advanced worldwide products cover Luxembourg as part of "all countries" but do not document LU-specific field availability.

**WW-Top** appears in monitoring frequency documentation ("every 30 days for WW-Start, WW-Advanced, WW-Top") but its product page content does not enumerate a `directors` or `legalRepresentatives` field. There is a separate "Current Company Representatives Report" SKU listed in the Openapi product catalog at **€2.30/call** for "active representatives including all individuals holding positions on boards of directors, management boards, supervisory boards, general directors, and auditing committees" — but country coverage for this SKU is not explicitly documented for LU.

**Identifier limitations confirmed:** Openapi's LU endpoint accepts LU-prefix VAT numbers for routing. B-prefix RCS numbers produce HTTP 406 (confirmed from Phase 4 audit briefing). The Openapi docs show WW-Start endpoint format: `GET /WW-start/{country}/{vatCode_companyNumber_taxCode_or_id}`. No documented fallback from VAT→RCS for entities where Openapi's VAT index is incomplete.

**Index-hole (LU18804375 / ArcelorMittal B82454):** The VAT number LU18804375 is not indexed in Openapi's LU lookup. The entity exists in LBR as B82454 with full director data (board chair Lakshmi N. Mittal, multiple administrators confirmed via Northdata). Openapi has no B-prefix route, so this entity is structurally unreachable via any Openapi endpoint.

**Directors/representatives:** Not confirmed as present in the WW-Top response for LU. The Topograph docs explicitly state that their LU `legalRepresentatives` extraction works by AI-parsing of the certified Extrait du RCS PDF — implying that Openapi's WW-Top LU slice does NOT return structured directors (consistent with the current state in the Phase 4 briefing: Tier 1, 6/7 fields, no legal_form, no directors).

**Verdict:** NOT VIABLE for directors. No new Openapi endpoint surfaces directors for LU. Index-hole is structural (VAT↔RCS gap) and not resolved.

**Cost class:** Current Openapi commitment €0.1586/call — irrelevant for this path since it doesn't return directors.

---

## Path 2 — Direct registry API (LBR RCS) — professional/commercial tier

**URLs probed:** `https://www.lbr.lu/` (main portal, redirects to `/mjrcs-web-front/`; JS-rendered, WebFetch returns only title string), `https://lbrcontent.public.lu/en/informations/faq.html` (403), `https://www.lbr.lu/mjrcs-web-front/jsp/webapp/static/mjrcs/en/mjrcs/professionalaccess.html` (returns only title), `https://www.lbr.lu/mjrcs/jsp/webapp/static/mjrcs/en/mjrcs/pdf/tarifs.pdf` (PDF binary, unreadable), `https://www.i-hub.com/b2b/wp-content/uploads/sites/3/2022/10/LBR-API-i-Hub-PR-October-2022-EN.pdf` (read in full — see below)

**Key evidence — i-Hub/ABBL press release (October 2022, read verbatim):**

LBR launched a new API platform in summer 2022. Confirmed facts from the press release:
- "LBR offers a new platform specifically dedicated to the implementation of Application Programming Interfaces (APIs), providing automated access to professionals with significant information needs."
- Covers: "consultation of the Trade and Companies Register (RCS) and the purchase of company profiles"
- Scope: RCS data (directors, company profiles) — NOT the RBE (UBO register), which was noted as a hoped-for future extension by ABBL
- First production client: i-Hub S.A. (subsidiary of POST Luxembourg, CSSF-regulated)
- i-Hub "modified its search engine for European registers" using LBR APIs for "updating information on Luxembourg legal entities"

**What is NOT in the press release:**
- Pricing
- Eligibility criteria for non-LU-based entities
- Specific fields returned (named as "company profiles" and "legal entities" without field enumeration)
- Whether `directors / dirigeants` are returned as structured JSON or only as document links

**Additional evidence from kyckr.com and businesswestern.co.uk guides:**
- LBR API described as "available to large enterprise clients," "paid model (unlike Companies House)," "for high-volume usage"
- "Public documentation is limited" — no public API docs site found in any search

**DEC-20260518-G platform-fee probe:**

The following fee dimensions were probed across all accessible sources (search engines, tarifs.pdf which was binary, LBR FAQ which returned 403, multiple third-party guides):

| Fee dimension | Finding | Evidence |
|---|---|---|
| Platform / setup fee | Unknown — not publicly disclosed | No public docs; tarifs.pdf binary |
| Monthly minimum | Unknown — likely yes ("large enterprise clients" framing) | Kyckr guide, businesswestern.co.uk |
| Annual floor / term commitment | Unknown | No public disclosure |
| Volume floor | Unknown | No public disclosure |
| Per-call unit cost | Unknown | Tarifs.pdf binary; not in any guide |
| Termination fee | Unknown | Not publicly disclosed |
| Eligibility for non-LU entities | Unclear — i-Hub is LU-based CSSF-regulated; no evidence foreign entities can sign | Press release + ABBL framing targets LU financial sector |

**LBR professional API — critical eligibility note:** The AML/CFT professional access tier for the RBE register explicitly requires a LuxTrust certificate (LU national digital ID), a signed convention with LBR, and an LBR-registered account. These requirements are documented for the RBE; the RCS API tier from 2022 has not published equivalent eligibility criteria, but the i-Hub press release context (CSSF-regulated LU-based entity) strongly implies LBR designed the API for LU-domiciled professionals. Foreign entities may be blocked at eligibility stage regardless of willingness to pay.

**Data fields:** LBR API reportedly returns "company profiles" for RCS entities. Based on the i-Hub use case (KYC file review, periodic reviews), directors are almost certainly included — the primary use case for KYC is exactly name/role of representatives. However, this is inferred; not confirmed from spec documentation.

**ArcelorMittal index-hole:** LBR API uses its own internal RCS number (B82454). No VAT-based routing limitation since the LBR API is a direct registry connection. B82454 IS in the LBR database (confirmed via multiple sources including RESA publications and Northdata). The index-hole is Openapi-specific; the LBR API would cover B82454.

**Verdict:** STRUCTURALLY PROMISING but NOT VIABLE-V1 due to: (1) undisclosed pricing with strong signals of enterprise-tier subscription model incompatible with v1 cost discipline; (2) likely eligibility barrier for non-LU-domiciled foreign entities; (3) no public documentation or signup path. **Requires RFQ + eligibility verification before any commitment.** Could be viable for v1.1 if pricing is per-call and foreign eligibility is confirmed.

**Cost class:** Unknown — RFQ required. Structural signals point to subscription, not per-call passthrough.

---

## Path 3 — Direct registry, free/open tier (data.public.lu Open Data Portal)

**URLs probed:** `https://data.public.lu/en/datasets/?q=RCS+registre` (JS-rendered, no dataset listings visible), `https://data.public.lu/en/datasets/?q=entreprise+soci%C3%A9t%C3%A9+registre` (same JS issue — portal reports 2,573 datasets but requires JavaScript to render listings), `https://data.europa.eu/data/datasets/extrait-du-registre-de-commerce-et-des-societes-luxembourg-rcsl` (404 from European Data Portal)

**Evidence from web search:**

A dataset titled **"Extrait du Registre de Commerce et des Sociétés Luxembourg (RCSL)"** was indexed by both data.public.lu and data.europa.eu as of 2025 searches. However:

1. The direct data.public.lu URL returned a 404 (dataset may have been removed or URL changed with the August 2025 portal redesign)
2. The Open Knowledge Global Open Data Index (2015) rated Luxembourg company register as "not available in bulk — neither for free nor for sale" — this predates the RCSL→LBR transition
3. Multiple 2025 sources confirm: "the dataset isn't available in bulk" for the RCS

The RESA platform (Recueil Electronique des Sociétés et Associations) replaced the Mémorial C in 2016 and is accessible free of charge without authentication for reading publications. Publications include director appointments (RESA automates publication when RCS filings are submitted). However, RESA is a publication browser, not a structured data API — no JSON/XML export confirmed.

**GitHub/opendatalu:** The opendatalu GitHub organization contains only portal infrastructure (udata2, harvesters, MCP server for data.public.lu) — no company registry datasets are hosted in GitHub directly.

**DEC-518-G probe:** No platform fee — open data portal is free access. But: no bulk structured data with directors confirmed. The portal requires JavaScript to browse; even if a dataset exists, it may be document-PDFs rather than structured fields.

**ArcelorMittal index-hole:** RESA covers all RCS entities including B82454 (confirmed — RESA publishes all RCS filings automatically). But RESA is a document browser with per-entity PDFs, not a queryable API.

**Verdict:** NOT VIABLE as a programmatic data source. The RESA platform is a web UI (publications browser) with no confirmed structured API or bulk download. The data.public.lu dataset URL was broken (404). No CC-licensed bulk CSV/JSON of company data with directors confirmed to exist for LU, unlike EE (which has a 45 MB CC BY 4.0 JSON dump). This is the key structural difference from EE.

**Cost class:** Free, but no usable programmatic path confirmed.

---

## Path 4 — Tier-2 paid per-call aggregators (DEC-518-G full probe)

### 4a. Topograph

**URLs probed:** `https://docs.topograph.co/essentials/luxembourg` (HTTP 200, content read), `https://topograph.co/pricing/lu` (HTTP 200 but only header rendered — "Topograph - data and documents for KYB"), `https://www.topograph.co/guides/business-registers-in-luxembourg` (read), `https://www.topograph.co/guides/business-registers-in-luxembourg/extrait-rcs-luxembourg` (read)

**Data fields confirmed:**
- Company name, legal form, status, registration and incorporation dates, registered address, capital, NACE codes
- **`legalRepresentatives` confirmed** — AI parsing of the certified Extrait du RCS document. Roles extracted: Gérant (Manager), Gérant unique (Sole manager), Administrateur (Director), Président, and other executive positions. Both individual and corporate representatives supported. Role codes mapped to ISO 5009.
- Shareholders confirmed

**Identifiers confirmed:**
- B-prefix RCS: confirmed ("B246607" used as example in docs). The B-prefix is the canonical commercial company identifier.
- LU-prefix VAT: confirmed ("LU32326416" format, also accepts 8-digit form without country prefix)
- EUID: not mentioned in docs

**Cost per call confirmed (partial):** The docs reference a pricing page at `topograph.co/pricing/lu` but that page only rendered its title. One pricing datum from the integration guide: "Extrait du RCS … price: 13.50" (EUR) — this appears to be the cost Topograph pays LBR per certified extract, passed through as part of the per-call price. The live pricing page is the source of truth; live per-call price for structured data is undisclosed in public docs.

**DEC-20260518-G platform-fee probe:**

| Fee dimension | Finding | Evidence |
|---|---|---|
| Platform / setup fee | Not mentioned in docs | No public pricing page rendered |
| Monthly minimum | Not mentioned; docs explicitly say "pay-per-request, no bulk contracts, no minimum commitments" for HR — same model claimed for all countries | Topograph HR docs + general model description |
| Annual floor | Not mentioned | No public disclosure |
| Volume floor | Not mentioned | No public disclosure |
| Per-call unit cost | LU undisclosed on pricing page; Extrait-passthrough component ~€13.50; full per-call price RFQ-gated | docs.topograph.co/essentials/luxembourg |
| Termination fee | Not mentioned | No public disclosure |

**Data source:** LBR / Luxembourg Business Registers (RCS). AI parsing of certified Extrait du RCS documents — Topograph orders the extract from LBR (at €13.50 pass-through) and parses it. This means Topograph is licensed to retrieve certified extracts; redistribution rights follow from LBR's licensed-bulk/professional API arrangement.

**DEC-20260428-A:** Topograph sources from LBR directly (licensed professional access) not from scraping. The LBR certified extract is a commercial product with documented redistribution via Topograph's platform. Vendor attestation of redistribution rights should be sought at onboarding — this is consistent with the HR/EE/BE pattern in the Phase 3 audit.

**ArcelorMittal index-hole:** Topograph supports B82454 (B-prefix RCS lookup confirmed). ArcelorMittal SA B82454 is in the LBR/RCS; Topograph would retrieve its certified extract and parse directors. The index-hole is Openapi-specific and does NOT affect Topograph. **This is the key finding: Topograph resolves the index-hole.**

**Verdict: VIABLE-V1 (pending pricing confirmation and DEC-20260428-A vendor attestation).** Model is per-call, no confirmed subscription floor. Extrait-passthrough cost (~€13.50) will make the per-call price substantially higher than the current Openapi WW-Top at €0.1586 — this is a cost-tier step-up, not a blocker. B-prefix support covers the index-hole. Directors confirmed.

---

### 4b. Kyckr

**URLs probed:** `https://help.kyckr.com/hc/en-ie/articles/13937262500893-Changes-to-profile-and-document-pricing` (403), `https://developer.kyckr.com/guides/company-v1/getting-started/` (not fetched), `https://www.trustradius.com/products/kyckr/pricing` (no plans listed)

**Evidence from web search:** Kyckr makes real-time requests to the local company register for Luxembourg. "Kyckr provides data to verify both company information and representatives, including directors, company officials and shareholders — available as machine-readable data and contained within original registry documents." Pricing: not publicly disclosed ("Kyckr does not currently have any pricing plans listed"). RFQ required.

**DEC-20260518-G:** No public pricing; all fee dimensions unknown. Book-a-demo wall.

**Verdict:** VIABLE-V1.1 (directors confirmed, per-call real-time model consistent with Kyckr's general offering, but fully RFQ-gated). Deprioritize vs Topograph which has public docs confirming B-prefix + legalRepresentatives.

---

### 4c. Kompany (acquired by Moody's)

**Evidence from kompany.com developer news:** Kompany announced an "upgraded connection to Luxembourg Business Registers (LBR), which improves both the data depth and document coverage" via their KYC API V1 & V2. Director/officer data confirmed: names and roles including "Administrator - Manager", "Commissioner." Real-time LBR connection. Pricing model: credit-based (RFQ), no public per-call schedule.

**DEC-20260518-G:** No public pricing. All fee dimensions unknown.

**Verdict:** VIABLE-V1.1. Directors confirmed for LU. Model appears per-lookup but pricing undisclosed.

---

### 4d. Northdata

**URLs probed:** `https://www.northdata.com/_data` (read), `https://northdata.github.io/doc/api/` (read)

**Pricing confirmed:**
- Monthly subscription: €500–€1,500/month depending on tier (M through XXL)
- Per-request tiering: €0.10 (5k–20k), €0.07 (20k–50k), €0.05 (50k+) above 5,000 free/month
- Minimum contract: 12 months
- Directors/representatives: available at L-tier and above (monthly fee applies)
- Luxembourg coverage: confirmed ("Tax Havens" data including Luxembourg is available)

**DEC-20260518-G:**

| Fee dimension | Finding |
|---|---|
| Platform / monthly fee | €500–€1,500/month |
| Annual floor | 12-month minimum |
| Per-call | Tiered above 5k free/month |
| Setup fee | Not mentioned |
| Termination | Not mentioned |

**Verdict: NOT VIABLE-V1.** Monthly subscription (€500+/month, 12-month commit) violates Petter's fixed-monthly-NOT-OK-in-v1 cost rule. Directors confirmed for LU but the pricing model is wrong.

---

### 4e. Dato Capital

**URLs probed:** `https://www.datocapital.lu/` (read), `https://en.datocapital.com/pricing.html` (read)

**Pricing confirmed:**
- Basic: free (5% discount on reports)
- PRO: ~5,499 kr/month (~€470/month) — 8 monthly reports included
- CORPORATE: ~38,488 kr/month (~€3,300/month) — 60 monthly reports
- Individual report pricing varies by country; no per-call PAYG option

**DEC-20260518-G:**

| Fee dimension | Finding |
|---|---|
| Platform / monthly fee | Required (PRO ~€470/month) |
| Annual floor | Monthly renewal; no annual commitment mentioned |
| Per-call PAYG | NOT available |
| Directors | Confirmed — 466,568 directors in LU database |

**Verdict: NOT VIABLE-V1.** Subscription-only model with no per-call PAYG. Directors confirmed, but pricing model wrong.

---

### 4f. Pappers LU (pappers.lu / pappers.in)

**URLs probed:** `https://www.pappers.lu/en` (403), `https://www.pappers.nl/en/api` (404), `https://www.pappers.in/api/documentation` (only nav elements rendered)

**Evidence from web search:** pappers.lu covers Luxembourg companies with "filing history, financial reports, and director profiles." The platform extends from the French Pappers.fr base with additional European coverage. Pappers.fr API pricing: 100 free monthly requests, then scalable paid plans. However, pappers.lu's API pricing (if any) was not discoverable. Pappers.in API documentation did not render field-level content.

**DEC-20260518-G:** No public pricing for pappers.lu confirmed. Pappers.fr has tiered subscription-style plans.

**Verdict:** POSSIBLE-V1.1 if per-call option exists; directors appear to be included but API pricing unknown. WebFetch blocked (403). Lower priority than Topograph.

---

### 4g. TransactionLink

**URL probed:** `https://www.transactionlink.io/integrations/registre-de-commerce-et-des-societes-rcs-luxembourg` (read)

**Data confirmed:** "company names, legal forms, registration numbers, addresses, ownership details, financial reports, and information about directors and shareholders." Directors confirmed.

**DEC-20260518-G:** No pricing disclosed on the integration page. "Book a call" wall. Pricing model unknown.

**Verdict:** VIABLE-V1.1 (directors confirmed, but pricing entirely RFQ-gated). Lower priority than Topograph.

---

## Path 5 — Statutorily-public web UI (LBR / RESA public portal) — DEC-518-F assessment

**URLs probed:**
- `https://www.lbr.lu/mjrcs-resa/jsp/DisplaySearchDepositOrPublicationActionNotSecured.action` (HTTP 429 Too Many Requests — rate-limited)
- `https://easybiz.lu/en/blog/how-to-check-a-registered-company-in-luxembourg` (read — describes portal use)
- `https://www.synta-iq.com/luxembourg/guide/rcs-luxembourg` (read)
- Various third-party descriptions of the LBR public portal

**What the portal exposes (from multiple consistent third-party descriptions):**

The LBR public portal at `lbr.lu` allows free search by company name or RCS number. The portal redesign completed August 2025 reorganized into four sections: register, file, consult, order. Key findings:

1. **Directors visible in free public view:** Multiple independent sources confirm: "current administrators and managers (with their mandates)" are visible on company profiles at no cost. The SYNTA-IQ guide states: "current administrators and managers (with their mandates)" are displayed on the public company page.

2. **No login required for basic company view:** "Public searches are done by registration number or by name of the entity concerned." Documents filed with RCS are available free of charge. For downloading filed documents (PDFs), an account is needed "with or without creating a personal account."

3. **CAPTCHA implemented:** The August 2025 portal redesign explicitly implemented an "anti-robot verification (Captcha) system" — confirmed in the Paperjam article about the new portal. This directly affects automated access.

4. **Language:** French/German (FR and DE are both official languages; LU Luxembourgish for smaller forms). English navigation exists. Company data is primarily in FR/DE.

5. **Certified extraits cost:** €13.50 per certified extrait (Topograph pass-through pricing indicates this). Uncertified free view is available on the portal but the structured extrait PDF requires purchase.

**DEC-20260518-F four-constraint assessment:**

| Constraint | Status | Evidence |
|---|---|---|
| (a) Statutorily public | YES — RCS is statutory public register under LU Code de Commerce; RESA publications are free by statute | Multiple sources confirm free public access |
| (b) ToS permits per-call automated access | BLOCKED — CAPTCHA implemented August 2025 | Paperjam portal redesign article |
| (c) Per-entity (not bulk) | YES — search is per entity | Portal structure |
| (d) Attribution | YES — LBR as source is trivially attributable | |

**Constraint (b) fails.** The August 2025 portal redesign explicitly added CAPTCHA anti-robot verification. Even if the underlying data is statutorily public and ToS may not explicitly prohibit automated access, the technical CAPTCHA implementation signals LBR's intent to gate automated access behind their professional API channel (Path 2). DEC-20260428-A Tier 1 applies: Strale never operates scrapers regardless of statutory basis.

**ArcelorMittal index-hole:** B82454 is in the LBR portal (confirmed via search results showing public company page exists). The index-hole is Openapi-specific. LBR's own portal covers all RCS entities.

**Verdict:** NOT VIABLE (Path 5 direct). CAPTCHA blocks automated retrieval; Tier 1 scraping prohibition applies. **However, this confirms directors ARE present on the statutorily-public portal**, which is the basis for Topograph's licensed extraction being Tier-2 legitimate (Topograph accesses via LBR's professional API or licensed extract purchasing — not scraping the CAPTCHA-gated UI).

---

## Path 6 — Open data bulk download

**URLs probed:** `https://data.public.lu/en/datasets/extrait-du-registre-de-commerce-et-des-societes-luxembourg-rcsl/` (404), `https://github.com/opendatalu` (infrastructure only, no registry datasets), `https://data.europa.eu/data/datasets/extrait-du-registre-de-commerce-et-des-societes-luxembourg-rcsl` (European Data Portal — only title rendered)

**Findings:**

Unlike Estonia (45 MB daily CC BY 4.0 JSON dump), Luxembourg has no confirmed bulk open data download of company registry data with directors:

1. The data.public.lu dataset URL for "Extrait du RCS" returned a 404 — the dataset either was removed or the URL changed after the August 2025 LBR portal redesign.
2. Multiple 2025 sources explicitly state: "the dataset isn't available in bulk — neither for free nor for sale" (Open Company Data Index, corroborated by modern guides).
3. The RESA platform is a publication browser (per-entity per-document access), not a bulk export system. No XML/RSS/JSON API for RESA publications was found.
4. The opendatalu GitHub organization contains only portal infrastructure tools (udata2, harvesters), not actual registry data.

**RESA as gazette-equivalent:** RESA replaced the Mémorial C in June 2016. Director appointment notices are published automatically in RESA when filed with RCS. RESA is freely accessible without authentication. However, RESA is structured as per-company publication lists (HTML pages with document PDFs), not as a machine-readable data feed. No RSS or structured notification API was found.

**Verdict: NOT VIABLE** for bulk programmatic director extraction. Luxembourg does not publish the equivalent of Estonia's CC BY 4.0 daily JSON dump. Open data access is limited to document-level (PDF extraits), not field-level structured data.

**Cost class:** Free in principle, but no usable path. The 404 on data.public.lu suggests even the document-level dataset was removed.

---

## Path 7 — Tier-2 commercial bulk licensing under DEC-20260428-A

**Findings:**

Three potential commercial bulk licensees were identified from the aggregator landscape:

**Northdata:** Confirmed LU coverage, directors included at L-tier and above. Sources from LBR and other official registries. However, Northdata's pricing is a subscription model (€500–€1,500/month, 12-month minimum). Commercial bulk licensing for redistribution at Strale's per-call model would require a separate arrangement beyond their consumer API. **NOT VIABLE-V1** under cost rule.

**Dun & Bradstreet / Bisnode:** Historical subscription-heavy provider for European registry data. No LU per-call model found. **NOT VIABLE-V1.**

**LBR direct bulk licensing:** The i-Hub press release (2022) describes LBR's commercial API as available to "professionals with significant information needs." LBR manages RCS, RBE, and RESA. A bulk licensing arrangement directly with LBR for Strale's redistribution use case would require: (1) eligibility as non-LU-domiciled entity; (2) a commercial agreement with LBR; (3) unknown pricing. This is the cleanest Tier-2 path under DEC-20260428-A (primary source, statutory data, no intermediary scraping), but the commercial structure is unknown and likely requires subscription.

**DEC-20260428-A assessment:** Topograph (Path 4a) is the most favorable Tier-2 candidate because: (a) it accesses LBR via the professional API / certified extract purchase — not scraping; (b) it provides structured JSON with `legalRepresentatives`; (c) it has documented redistribution via its platform; (d) per-call pricing model (no confirmed subscription floor). The vendor attestation requirement under DEC-20260428-A should be: confirm Topograph's LBR data redistribution rights cover commercial API resale.

**Verdict:** Topograph is the leading Tier-2 bulk+per-call candidate. Full commercial bulk licensing direct from LBR is viable only as v1.1 if the eligibility and pricing barriers can be cleared.

---

## Path 8 — Gazette / RESA historical officer publications

**RESA overview (confirmed from multiple sources):**

RESA (Recueil Electronique des Sociétés et Associations) replaced the Mémorial C on 1 June 2016 and is operated by LBR at `lbr.lu/mjrcs-resa/`. RESA is Luxembourg's equivalent of the Belgian Moniteur Belge for mandatory company publications.

**Publication types confirmed:**
- Statutory amendments (articles of association changes)
- Share transfers
- **Director appointments and resignations** — confirmed: "For the appointment of a new board member, it is sufficient to complete a form on the RCS platform, and publication in RESA will occur automatically without the need to file any further documents."
- Capital increases and reductions
- Mergers, liquidation notices
- Annual accounts (for entities required to file)

**Access model:**
- Free of charge without authentication for consultation
- URL structure: `https://www.lbr.lu/mjrcs-resa/jsp/DisplaySearchDepositOrPublicationActionNotSecured.action`
- Rate-limited (HTTP 429 received during investigation), confirming rate controls exist
- Documents in PDF format (not structured XML/JSON)
- Languages: French and German primarily

**Mémorial C archives:** Pre-June 2016 publications remain accessible via a dedicated archive page on the LBR website. These are PDF documents.

**RESA as a director-extraction path — assessment:**

RESA publishes director appointment notices in a browsable format. Each notice is a PDF containing the statutory language of the filing, typically including: new director's name, role, appointment date, and effective date. However:

1. No structured API or RSS feed for RESA publications confirmed
2. Rate limiting (429 during probe) indicates automated access is technically restricted even on the "unsecured" (no-auth) URL
3. PDF parsing would be required for each publication — narrative legal text, not structured fields
4. Entity resolution (publication → company → current director roster) requires cross-referencing with RCS data
5. RESA is useful for CHANGES (appointments/resignations) but not for a point-in-time current director roster — the latter requires the RCS extrait

**DEC-20260518-F four-constraint re-assessment for RESA:**

| Constraint | Status | Evidence |
|---|---|---|
| (a) Statutorily public | YES — RESA is the official legal gazette | LU Law of 19 Dec 2002 as amended |
| (b) ToS per-call automated | PARTIAL — no explicit ToS prohibition; but rate limiting (429) signals automation is disfavored | Probe result; no public ToS found |
| (c) Per-entity | YES — per-filing publications | Structure |
| (d) Attribution | YES — LBR/RESA source is trivially citable | |

**Constraint (b) is borderline** — less clear-cut than the main portal CAPTCHA. RESA was designed as a publication-of-record system and may tolerate per-entity automated queries under a reasonable access pattern. However, without explicit ToS permission, and with 429 rate-limiting observed, this path is not a reliable production source for Strale.

**Verdict:** NOT VIABLE as primary director source. RESA contains director appointment data but only as PDF publications, with rate-limiting, no structured API, and without a current-roster view. Could serve as a historical supplement (e.g., confirming appointment dates) once a primary structured source (Path 4a Topograph) is established. No commercial cost, but engineering cost is high (PDF parsing + entity resolution).

---

## Path 9 — Other LU-specific surfaces

### 9a. BRIS (Business Registers Interconnection System)

BRIS at `webgate.ec.europa.eu/e-justice/searchBris.do` redirects to sorry.ec.europa.eu from US-East egress (Railway region). Assessment based on BRIS documentation: LU contributes basic entity data (name, legal form, reg number, status, address) to BRIS. Director data — LU restricts the officer field at the BRIS gateway (consistent with HR behavior). No public REST API for third-party consumption.

**Verdict: NOT VIABLE.**

### 9b. LuxTrust authentication requirement

Multiple LBR service tiers (especially RBE) require LuxTrust S.A. digital certificates (LU national PKI). The LBR API professional access and the AML/CFT professional tier for RBE both require LuxTrust or eIDAS-equivalent. Strale (Sweden-based, Railway US-East) would need to assess whether its incorporation enables LuxTrust registration or whether eIDAS certificate suffices. This is a prerequisite question for Path 2, not a separate data path.

**Verdict: Eligibility question for Path 2; not a separate data path.**

### 9c. RBE (Registre des Bénéficiaires Effectifs — UBO Register)

LBR has managed the RBE since the Law of 13 January 2019. Following the CJEU C-37/20 ruling, the Law of 25 January 2025 (in force 1 February 2025) restricted public RBE access to: (1) national authorities, (2) AML/CFT professionals with LuxTrust + signed LBR convention, (3) entities demonstrating legitimate interest on a case-by-case basis.

**RBE is out of scope for directors:** The RBE contains beneficial owners (≥25% shareholders or effective controllers), which overlaps with but is distinct from the RCS directors/representatives data. The current audit targets legal representatives (directors, managers, authorized signatories) who appear in the RCS, not necessarily in the RBE.

**Verdict: Out of scope (UBO ≠ directors), and access is now restricted post-CJEU ruling.**

### 9d. E-Justice Portal

`https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/lu_en` — confirmed to exist but redirects to sorry.ec.europa.eu from Railway US-East egress. Assessment: e-Justice LU page documents that LBR is connected to BRIS, links to lbr.lu for direct access, and notes that basic company data is available online. No structured API; gateway to Path 5 (portal) and Path 2 (LBR API).

**Verdict: NOT VIABLE as an independent data source.**

### 9e. Open Company Data Index / OpenCorporates

OpenCorporates `opencorporates.com/companies/lu/B82454` returns CAPTCHA block (HAProxy verification). OpenCorporates LU coverage is rated as "not fully open" in the Open Company Data Index. OpenCorporates API requires authentication; commercial tier pricing is subscription-based for KYB use cases.

**Verdict: NOT VIABLE-V1** (subscription model, CAPTCHA block, pricing incompatible).

### 9f. Multi-lingual note

Luxembourg has three official languages: French, German, Luxembourgish. The RCS registry and RESA operate primarily in French and German. Company filings are in whichever language the company chose at incorporation. Third-party aggregators (Topograph, Kyckr, Kompany) document serving FR/DE content for LU. Director name matching across FR/DE variants is a data-quality consideration at implementation time, not a source-selection blocker.

---

## Overall Verdict

**Verdict: VIABLE-V1 (pending Topograph RFQ + DEC-20260428-A attestation)**

**Confidence: Moderate** — Topograph is confirmed to expose `legalRepresentatives` for LU with B-prefix RCS support, resolving both the director gap and the Openapi index-hole. Cost is per-call (no confirmed subscription floor) but absolute price undisclosed; the €13.50 extrait pass-through indicates a substantially higher per-call cost than current Openapi WW-Top (€0.1586). This is a cost tier change, not a cost model violation.

**v1 path:** Topograph per-call API, LU-country endpoint, `legalRepresentatives` field, B-prefix RCS identifier. Source: LBR/RCS via certified Extrait du RCS (AI-parsed). DEC-20260428-A: Topograph licensed from LBR professional API — vendor attestation of redistribution rights required at onboarding.

**v1.1 path:** LBR direct API (Path 2) — if eligibility for non-LU entities is confirmed and pricing proves per-call compatible. Would eliminate the ~€13.50 extrait pass-through cost. Requires: RFQ with LBR, eligibility determination for SE-domiciled Strale entity (or Railway US-East entity), pricing negotiation.

---

## Per-Path findings table

| Path | Viable? | Directors in scope? | Index-hole (LU18804375) | Cost class |
|------|---------|--------------------|-----------------------|------------|
| 1. Openapi, other endpoints | NO | NOT confirmed | NOT resolved | €0.1586/call (no directors) |
| 2. LBR direct API | PENDING (RFQ + eligibility) | INFERRED yes | Resolved (B82454 in LBR) | Unknown; likely subscription |
| 3. data.public.lu open data | NO (404, no bulk) | NO structured data | N/A | Free (no usable path) |
| 4a. Topograph | **YES — V1** | **CONFIRMED** | **RESOLVED** | Per-call, price RFQ; ~€13.50+ passthrough |
| 4b. Kyckr | YES — V1.1 | Confirmed | Likely resolved (B-prefix) | RFQ-gated |
| 4c. Kompany | YES — V1.1 | Confirmed | Likely resolved (LBR direct) | RFQ-gated |
| 4d. Northdata | NO (subscription) | Confirmed | Resolved | €500+/month, 12-month min |
| 4e. Dato Capital | NO (subscription) | Confirmed | Unknown | ~€470/month min |
| 4f. Pappers LU | POSSIBLE V1.1 | Indicated | Unknown | Unknown |
| 4g. TransactionLink | YES — V1.1 | Confirmed | Unknown | RFQ-gated |
| 5. LBR public portal (CAPTCHA) | NO (Tier-1 block) | CONFIRMED present | Resolved in portal | Free (blocked by DEC-20260428-A) |
| 6. Open data bulk | NO (no bulk confirmed) | NO | N/A | Free (no path) |
| 7. Tier-2 commercial bulk | Topograph is best | Via Topograph | Via Topograph | See 4a |
| 8. RESA gazette | NO (primary) | PDF only | Covered in RESA | Free (PDF parsing impractical) |

---

## Index-hole resolution

**LU18804375 / ArcelorMittal SA / B82454:**

- **Openapi WW-Top:** NOT resolved. LU18804375 VAT fails Openapi's LU index. B-prefix route does not exist on Openapi. Structural gap.
- **Topograph (Path 4a):** RESOLVED. Topograph explicitly supports B-prefix RCS lookup (`B246607` as example). B82454 is a valid RCS number registered with LBR. Topograph would retrieve the certified extrait for B82454 and parse directors. No VAT dependency.
- **LBR direct API (Path 2):** Would resolve (LBR's own registry; B82454 is a primary-source record). But access barriers may apply.
- **RESA (Path 8):** Covered — RESA publishes all RCS filings including B82454 changes. But no structured API.

**Conclusion:** Topograph is the v1 resolution for the Openapi index-hole. The index-hole is Openapi-specific and does not affect any LBR-connected path.

---

## Doctrine compliance log

| Decision | Status | Notes |
|---|---|---|
| DEC-20260518-E | COMPLIED | All 9 sub-paths documented with evidence |
| DEC-20260518-F | COMPLIED | 4-constraint assessment applied to both portal (Path 5) and RESA (Path 8). CAPTCHA blocks Path 5; Path 8 borderline but not viable as primary source |
| DEC-20260518-G | COMPLIED | All Tier-2 vendors probed on 6 fee dimensions. Northdata: €500+/month subscription — NOT VIABLE. Dato Capital: subscription-only — NOT VIABLE. Topograph: per-call, no subscription floor confirmed, but price RFQ-gated. Kyckr/Kompany/TransactionLink: RFQ-gated (all fee dimensions unknown). LBR direct: all fee dimensions unknown, likely subscription |
| DEC-20260428-A | COMPLIED | Strale-operated scrapers blocked (Tier 1). Path 5 (CAPTCHA portal) and Path 8 (RESA rate-limited) both confirmed as Tier-1 blocked. Topograph (Path 4a) is Tier-2 legitimate: LBR-licensed certified extract source, not scraping. Vendor attestation required at onboarding |
| Petter cost rule | COMPLIED | Northdata, Dato Capital eliminated for subscription model. Topograph flagged as per-call (acceptable if passthrough) but extrait cost (~€13.50) will yield a substantially higher Strale selling price than the current Openapi tier. Petter's awareness required at pricing |
| EU 2023/138 CAVEAT | COMPLIED | §5.1 not cited as rep-content mandate anywhere in this enumeration |

---

## Caveats

1. **Topograph price unknown.** The €13.50 figure is the LBR certified extrait cost passed through — this is the floor, not the total per-call price. Topograph's margin + parsing cost is additive. The live pricing page did not render content. A pricing call with Topograph is required before v1 commit.

2. **LBR API eligibility for foreign entities unconfirmed.** The i-Hub press release (Oct 2022) describes the LBR professional API in the context of Luxembourg's financial sector (CSSF-regulated entities, LuxTrust certificates). Whether Strale (SE-domiciled, Railway US-East egress) can access the LBR API directly requires direct LBR inquiry. LuxTrust is a LU national PKI; eIDAS-equivalent certificates may suffice but this was not confirmed.

3. **ArcelorMittal B82454 RCS ↔ VAT LU18804375 mapping.** Multiple sources reference B82454 as the RCS number; the corporate articles of association explicitly state "R.C.S. Luxembourg, section B numéro 82 454." The VAT mapping (LU18804375 → B82454) is inferred from context and confirmed by the fact that Openapi fails on LU18804375 while B82454 is present in LBR. The mapping should be verified via LBR's public search before treating it as confirmed.

4. **RESA rate-limiting.** The 429 response during investigation was transient and may reflect high probe frequency rather than a strict 1-request-per-hour policy. RESA's ToS was not accessible during investigation (static HTML pages returned 404). Full ToS review required before treating RESA as blocked.

5. **Pappers LU API.** The pappers.lu and pappers.in websites were blocked (403/404) and the API docs page did not render content. Pappers LU may offer a per-call API — it is worth a direct inquiry as it extends from Pappers.fr's per-call model. Not enough evidence to rule in or out.

6. **LNIN requirement for individuals (Nov 2024).** Since 12 November 2024, all natural persons connected to RCS entities must register a Luxembourg National Identification Number (LNIN). LBR has been conducting automated quality checks to enforce this. Directors who have not registered their LNIN may appear with incomplete data or may be flagged in RCS outputs. Topograph's AI parsing should handle this gracefully (name + role still present even if LNIN not surfaced), but data quality for recently-onboarded directors may be degraded during the transition period.
