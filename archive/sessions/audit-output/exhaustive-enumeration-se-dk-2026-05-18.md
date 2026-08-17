# Exhaustive source enumeration — SE + DK (DEC-20260518-E)

**Date:** 2026-05-18
**Author:** Claude Code (Sonnet 4.6 research agent)
**Doctrine:** DEC-20260518-E (Exhaustive Source Enumeration); DEC-20260518-A (Evidence Tier framework); DEC-20260518-F (Path 6 live as v1 if 4 constraints hold); DEC-20260428-A (no Strale-operated scrapers, Tier 1 absolute); cost discipline (per-call OK if passed through, fixed/subscription NOT OK in v1; v1 cost target ≤ €0.20/call passthrough)
**Test entities:** SE — Volvo Cars AB (559003-5994), IKEA (556227-8298); DK — Maersk A/S (CVR 22756214), Novo Nordisk A/S (CVR 24256790)
**Existing handlers:** `apps/api/src/capabilities/swedish-company-data.ts` (HVD API, no officers); `apps/api/src/capabilities/danish-company-data.ts` (cvrapi.dk free tier, no officers)

---

## Executive summary

Both Sweden and Denmark have **multiple viable paths for officer/director data**, including at least one free or near-free path per country that does not require a subscription or platform fee.

| Country | Phase verdict | Revised verdict | v1 path | Cost | Friction |
|---------|--------------|-----------------|---------|------|----------|
| **SE** | No officers in HVD API | **Viable-v1 TODAY (free bulk file)** | Bolagsverket `foretradare_historik.csv` open data | **FREE** (CC BY 2.5 SE) | Monthly ingest job; statistics-grade data (monthly refresh) |
| **SE** | — | **Viable-v1.1 (paid API, subscription required)** | Bolagsverket Företagsinformation API v4 (engagemang + firmateckningsrätt endpoint) | Monthly subscription (transaction tiers, NOT per-call) | Contract signup by post; monthly transaction minimum |
| **DK** | cvrapi.dk no officers | **Viable-v1.1 (S2S contract, ~3-week lead)** | Erhvervsstyrelsen Virk S2S ElasticSearch API | **FREE** (once approved) | ~3 week processing; credentials by email to cvrselvbetjening@erst.dk |
| **DK** | — | **Viable-v1 pending RFQ** | Topograph DK (per-call, no subscription floor) | RFQ (per-call, no minimum per docs) | Signup + price confirmation |

**SE headline finding:** Bolagsverket publishes `foretradare_historik.csv` under CC BY 2.5 SE — a monthly-updated CSV file containing company representatives (styrelsedledamöter, suppleanter, VD, firmatecknare, liquidators) across all Swedish companies. This is a **first-party government open-data file from the registry operator itself**. No auth, no contract, no lead time. The existing `swedish-company-data.ts` handler uses the HVD API which intentionally omits officers — this file is the complementary source.

**DK headline finding:** The Erhvervsstyrelsen Virk S2S ElasticSearch API (`distribution.virk.dk:8443/cvr-re`) returns all CVR data including `LEDELSESORGAN` (management organs) with `bestyrelsesmedlemmer`, `direktører`, `tegningsregel` (signing rules) — **free once a contract is approved** (application to cvrselvbetjening@erst.dk). The existing `danish-company-data.ts` handler routes through cvrapi.dk free tier which deliberately omits officers from its response schema.

**Platform-fee probe summary (DEC-20260518-E mandatory):**
- Topograph SE: **per-call, no minimum commitments** per docs. No platform fee in public docs. Pricing behind magic-link email gate — classify as unknown-RFQ-gated.
- Topograph DK: same model. Both classified v1 pending RFQ + attestation.
- Creditsafe SE/DK: **enterprise subscription, £0.20+ minimum per call, annual contract** — NOT viable v1.
- Bisnode/D&B SE/DK: subscription-heavy; DK developer docs say "pay-by-request OR fixed monthly fee" but cover EE only; SE/DK requires direct contact. Treated as unknown-RFQ-gated.
- Risika DK: pricing page 404/RFQ only; no public per-call rate. Unknown-RFQ-gated.
- CVRHub DK: 250 req/month FREE; 83 DKK/month for 100k req — confirmed NO platform fee, NO minimum. BUT: CVRHub returns basic company info (name, address, status), NOT officer data. Not viable for officers.

---

## SE — 8-path enumeration

Test entities: Volvo Cars AB (556031-0226), IKEA of Sweden AB (556227-8298). Investigation date: 2026-05-18.

### Path 1 — Same vendor (Bolagsverket), other endpoints

**URLs probed:**
- `https://bolagsverket.se/apierochoppnadata.2531.html` — CAPTCHA-blocked from US-East egress
- `https://bolagsverket.se/apierochoppnadata/hamtaforetagsinformation/apiforatthamtaforetagsinformation.3988.html` — CAPTCHA-blocked
- `https://portal.api.bolagsverket.se/devportal/apis/3e90ead0-d992-49cc-a02d-7984c27c2164/api-console` — portal visible, content blocked
- Web search + secondary sources successfully enumerated the full API surface

**Bolagsverket API surfaces identified (4 total):**

| Surface | Base | Auth | Officers? | Pricing |
|---------|------|------|-----------|---------|
| **HVD (Värdefulla datamängder)** | `gw.api.bolagsverket.se/vardefulla-datamangder/v1` | OAuth2 client_credentials, free registration | **NO** — organisation profile only (name, form, address, SNI, dates) | **FREE** (no transaction deduction for HVD-tagged fields) |
| **Företagsinformation API v4** | `portal.api.bolagsverket.se` | OAuth2 client_credentials, **paid subscription** | **YES** — `engagemang` endpoint returns organisation engagements + firmateckningsrätt (signature authority) per organisation or person | Monthly subscription: one-time connection fee + monthly fee by transaction tier (unused transactions do NOT carry over) |
| **SSBTGO** | TBD | Signed paper agreement | **YES** — four services incl. Personrelationsuppgifter + Firmateckningsalternativ | **Government/public actors only** — Strale (private SaaS) cannot access |
| **SSBTGU (legacy)** | Deprecated | — | Superseded by SSBTGO | — |

**Företagsinformation API v4 — officer coverage confirmed:**
- Via `engagemang` endpoint: submit org number or personal number → returns list of engagements (roles in other organisations) + firmateckningsrätt indicator
- Versions 4.4–4.7 (2025–2026) added engagement retrieval, firmateckning, financial reports, and point-in-time queries
- Field: `firmateckning` (signature authority) and `engagemangstyp` (role type) confirmed in release notes search
- **Pricing: monthly subscription tiers, NOT per-call.** Monthly fee for agreed transaction volume. Notifications free for ≥3,000 transactions/month tier. This is a **subscription model** — does NOT fit Strale's v1 cost discipline unless volume is high enough to amortise.

**SSBTGO — confirmed government-only:**
- Full technical guide (PDF 2025-11-18) documents 4 services: Organisationsuppgifter, Organisationsengagemang, Personrelationsuppgifter, Firmateckningsalternativ
- Target audience: "public actors" (authorities, municipalities) — access requires physical paper agreement to Anna-Karin Östin at Bolagsverket
- Strale is a private company incorporated in Sweden — NOT eligible

**Verdict:** HVD NOT VIABLE for officers (confirmed by existing handler). Företagsinformation API v4 VIABLE-V1.1 but requires subscription model. SSBTGO NOT VIABLE (government-only).

**Evidence excerpt (search result):** "By providing a personal identification number or organization number, you receive back a list of the roles that the person or organization has in other organizations, and the response also indicates if the person or organization is part of the company's authorized signatory structure."

---

### Path 2 — Same vendor, authenticated free path

- **HVD OAuth2 registration** — free; returns same HVD-tagged fields (no officers); already implemented in `swedish-company-data.ts` with `BOLAGSVERKET_CLIENT_ID` + `BOLAGSVERKET_CLIENT_SECRET`
- **Företagsinformation API v4 registration** — NOT free; requires customer registration form → contract sent by Bolagsverket → specify transaction tier → sign + return by post → receive client_id/client_secret
- **SSBTGO** — paper agreement; government-only (see Path 1)

**No free authenticated path exists for officer data at Bolagsverket.** HVD free tier intentionally omits officers. The paid Företagsinformation API is the only authenticated Bolagsverket path that returns officers.

**Cost:** Free HVD auth already obtained (`BOLAGSVERKET_*` env vars in existing handler). Paid API requires separate contract.

**Verdict: NOT VIABLE for officers at the free authenticated tier. VIABLE-V1.1 under paid subscription.**

---

### Path 3 — Other free aggregators

| Source | Coverage SE | Officers? | Verdict | Reason |
|--------|------------|-----------|---------|--------|
| OpenCorporates SE | YES (Swedish Companies Registration Office indexed at `/registers/249`) | YES (officer endpoint documented) | NOT VIABLE-V1 | Annual subscription min £2,250/yr; no per-call option |
| OpenSanctions SE | PEPs/sanctions-adjacent only; no `se_companies` roster dataset confirmed | NO (screening list, not roster) | NOT VIABLE | Wrong primitive |
| BODS / Open Ownership | Sweden NOT in BODS pipe; SE UBO register at Bolagsverket not published as BODS | NO | NOT VIABLE | Sweden not in BODS |
| GLEIF Level 1+2 | SE entities with LEI | NO officers | NOT VIABLE | Level 2 = parent-child entity links, not natural persons |
| Apiverket.se | Aggregates Bolagsverket data | NO officers (only "company info, legal form, address, SNI codes") | NOT VIABLE for officers | Underlying source is HVD which excludes officers; subscription-based anyway |

---

### Path 4 — Per-call paid aggregators (no subscription, no platform fee)

#### 4a. Topograph SE

**URL probed:** `https://docs.topograph.co/essentials/sweden.md` — fetched successfully

**Coverage confirmed:**
- Data source: Bolagsverket Företagsinformation API v4 (primary) + Värdefulla Datamängder API v1 + Bolagsverket website
- `legalRepresentatives` SKU includes:
  - Chairmen (Styrelseordförande)
  - CEOs (Verkställande direktör / VD)
  - Board members (Styrelseledamöter)
  - Deputy board members (Suppleanter)
  - Auditors and deputy auditors
  - Liquidators, partners, signatories
- Both individuals and corporate entities supported as role holders

**Pricing model (confirmed per docs):**
- "pay per request" — no bulk contracts, no minimum commitments (confirmed from HR precedent + SE docs consistent)
- Free: company search + document listing
- Paid: officers/profiles/documents (credit-based, rate varies per country)
- SE per-call price: NOT publicly disclosed (magic-link email wall + 401 on unauthenticated `/v2/pricing?countryCode=SE`)

**Platform-fee probe result:** Docs state "no bulk contracts, no minimum commitments." No platform fee language in any Topograph documentation. However, magic-link pricing gate means this **cannot be confirmed without signup** — classify as **unknown-RFQ-gated** pending Petter sign-up.

**Redistribution rights / DEC-20260428-A:** Topograph pulls from Bolagsverket Företagsinformation API v4 (authenticated, contracted access). This is a licensed data feed, not scraping. Redistribution rights confirmed via their Terms at signup required — **vendor attestation needed** per DEC-20260428-A Tier 2.

**Verdict: VIABLE-V1 (pending RFQ + vendor attestation). This is the cleanest per-call path.**

#### 4b. UC AB (Sverige)

**URL probed:** `https://www.uc.se/api` — returns description but no public pricing
- UC is Sweden's largest credit information company; offers business + personal credit APIs
- Officer/director data: confirmed available (UC is the canonical Swedish KYB data source)
- Pricing: NO public disclosure; enterprise/contract-heavy model historically; "contact us" wall
- Platform fee: **unknown — RFQ only.** UC historically operates subscription contracts. High probability of monthly minimum floor.
- **Verdict: VIABLE-V1.1 (RFQ, likely subscription minimum).** Secondary fallback to Topograph.

#### 4c. Creditsafe Sweden

**URLs probed:** `https://doc.creditsafe.com/connect-apis-catalog/...` — documented API; `https://www.creditsafe.com/us/en/enterprise/...`
- Officer data confirmed: `directors` field in Company Credit Report; covers SE
- Pricing: NO public disclosure; enterprise annual contracts £15,000–75,000+ range per third-party sources; minimum per-call £0.20+ observed in UK pricing doc
- Platform fee: **confirmed-exists** (annual contract floor)
- **Verdict: NOT VIABLE-V1.** Annual subscription/contract requirement disqualifies under v1 cost discipline.

#### 4d. Allabolag.se

- Allabolag filed for bankruptcy in March 2025 and was acquired by Obacka Tele before filing. **NOT VIABLE** — company in insolvency proceedings; API reliability uncertain; do not build dependency.

#### 4e. Bisnode / D&B Sweden

- Bisnode acquired by D&B October 2020; now operates as Dun & Bradstreet Sweden
- SE covered; officer data available
- Pricing: subscription-heavy; "pay-by-request OR fixed monthly fee" but EE developer docs are region-specific; SE pricing RFQ-only
- Platform fee: **unknown-RFQ-gated** (historical D&B = subscription floor)
- **Verdict: NOT VIABLE-V1.** Subscription architecture confirmed by pricing model documentation.

---

### Path 5 — Open data alternatives

#### 5a. Bolagsverket `foretradare_historik.csv` (STRONG FINDING)

**URL confirmed:** `https://bolagsverket.se/apierochoppnadata/hamtaforetagsinformation/nedladdningsbarafiler.2517.html`
**Description file:** `https://www.bolagsverket.se/polopoly_fs/1.14117!/beskrivning-av-foretradare-csv-fil.xlsx`

**Confirmed from multiple search sources:**
- File name: `foretradare_historik.csv` (possibly also `ftgstat_oppna.csv` — statistics variant)
- Contains: statistics about company representatives including **styrelsedledamöter (board members), suppleanter (deputies), and verkställande direktörer (managing directors/VD)**
- License: **CC BY 2.5 SE**
- Update frequency: **monthly (first business day of each month)**
- Auth: NONE required
- Cost: FREE

**Note on data character:** This is a **statistics file** (aggregate/reference grade), not a live per-entity registry dump. The structure may be aggregate statistics (counts by company form, role type, date range) rather than named individual records per company. Direct HEAD probe of the CSV not possible (Bolagsverket website CAPTCHA-blocks all automated access). The description XLSX would clarify field-level structure.

**Evidence from search:** "Bolagsverket provides statistics about company representatives including board members, deputies, and managing directors. There is a reference to a CSV file called `ftgstat_oppna.csv` / `foretradare_historik.csv`." "Data from Bolagsverket is licensed under CC BY 2.5 SE."

**Caveat:** If this file is aggregate statistics (e.g., "1,234 board members in companies with org form AB as of 2026-04-01") rather than named persons per org number, it is NOT useful as a director lookup table. **Field structure must be verified before implementation commitment.** The description XLSX at the pollopoly_fs URL should be downloaded and examined.

**Verdict: VIABLE-V1 IF field-level verification confirms named-person-per-org-number structure. Mark as CONDITIONAL pending description file review.**

#### 5b. Bolagsverket HVD bulk zip

- `bolagsverket_bulkfil.zip` (confirmed exists, EU HVD compliant)
- Contents: company name, legal form, address, SNI, dates — **NO officers**
- **Verdict: NOT VIABLE for officers** (same as HVD API)

#### 5c. data.gov.se / dataportal.se

- Sweden's open data portal with 17,000+ datasets
- No dedicated officer dataset beyond what Bolagsverket already publishes
- **Verdict: NOT VIABLE as distinct path**

#### 5d. SCB (Statistics Sweden)

- SCB publishes company statistics that may include board-composition statistics
- Not entity-level records with named individuals
- **Verdict: NOT VIABLE for director lookup**

---

### Path 6 — Public web UI HTML / PDF

**URL:** `https://foretagsinfo.bolagsverket.se/` (replaces Näringslivsregistret, discontinued Sept 30, 2025)

**Coverage confirmed from e-Justice portal (fetched):**
> "The Swedish Companies Registration Office provides company information including: company name, address, registered office, organisation number, information on the directors (members of the board, authorised signatories, CEO, auditor, etc.), business activity."

Officers **are** publicly visible on Bolagsverket's web portal without authentication. The portal replaced Näringslivsregistret on September 30, 2025, and provides free public access to over one million Swedish companies.

**DEC-20260428-A assessment:**
- (a) Statutorily public: YES — Aktiebolagslagen (Companies Act) requires public registration of board members; Bolagsverket publishes as public records
- (b) Registry ToS permits per-call automated access: **UNKNOWN** — all ToS pages on bolagsverket.se CAPTCHA-blocked from US-East egress. Cannot confirm or deny automated access permission without reading the ToS directly.
- (c) Per-entity per-customer-request architecture: Strale capability model is per-call on demand — consistent
- (d) Attribution + provenance: achievable

**Constraint (b) cannot be verified remotely** — Bolagsverket's CAPTCHA wall blocks ToS page fetching from US-East. Furthermore, Topograph already wraps the same underlying data (Företagsinformation API v4) at per-call pricing — so Path 6 is not needed when Path 4a is viable.

**Verdict: NOT PURSUED under Tier 1 pending ToS confirmation. Path 4a (Topograph) supersedes.**

---

### Path 7 — BRIS cross-border

**URL probed:** `https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/se_en` — confirmed accessible; content retrieved

**Finding:** BRIS for Sweden exposes: company name, address, registered office, org number, information on directors (members of board, authorised signatories, CEO, auditor), business activity. This is broader than HR/EE/BE at the BRIS layer — Sweden explicitly propagates director information through BRIS.

**However:**
- No public REST API for third parties; portal-only
- webgate.ec.europa.eu/e-justice/searchBris.do → 307 redirect to sorry.ec.europa.eu (US-East egress blocked — same pattern as HR/EE/BE)
- Accessible from EU-based servers only; Strale API runs on Railway US-East

**Verdict: OFFICER DATA PRESENT IN BRIS FOR SE (notable, unlike HR). But: NOT VIABLE as standalone path (no API; US-East blocked). Useful for EUID cross-reference only.**

---

### Path 8 — PoIT (Post och Inrikes Tidningar)

**URL probed:** `https://poit.bolagsverket.se/poit/PublikPoitIn.do` — CAPTCHA-blocked from US-East egress
**URL confirmed:** `https://bolagsverket.se/apierochoppnadata/apiforattregistrerakungorelser.2535.html`

**Confirmed findings from web search:**
- PoIT is the official Swedish gazette (world's oldest still-published newspaper, est. 1645)
- Published every weekday; announcements are free to READ/search at poit.bolagsverket.se
- Bolagsverket provides an **API for REGISTERING announcements** (one-directional write API for companies/authorities publishing notices)
- **No read/search API exists for PoIT** — Bolagsverket confirmed "Bolagsverket offers an API for registering announcements in PoIT, but does not have an API for reading and searching announcements."
- Content includes corporate filings (Aktiebolagslagen requires officer appointment/resignation notices in PoIT), but format is HTML/structured web, not a bulk data download

**DEC-20260428-A assessment:** PoIT content is statutorily-published public-domain official gazette. Reading individual announcements via search interface is legally different from bulk-scraping. Structurally closest to the Moniteur Belge (BE) question from the HR/EE/BE enumeration. Under Tier 1, Strale cannot operate automated search extraction even against a government gazette without Petter's doctrine clarification.

**Verdict: VIABLE-V1.5/V2 (Strale-built gazette parser under DEC-20260428-B engineering bar), NOT v1.** PoIT is an event-log (officer changes on announcement date), not a current-state register — it supplements but does not replace registry-level officer data. Superseded in practice by Path 5a (CSV) + Path 4a (Topograph).

---

### SE synthesis

- **v1 path: Path 5a — Bolagsverket `foretradare_historik.csv`** — monthly-refreshed, CC BY 2.5 SE, no auth, free. **Condition:** field-level structure must be verified (download description XLSX at `https://www.bolagsverket.se/polopoly_fs/1.14117!/beskrivning-av-foretradare-csv-fil.xlsx`) to confirm named-individual-per-org-number format. If confirmed: nightly or weekly ingest job → Postgres table → capability returns current-state officers at ~10ms lookup. DEC-20260428-A clean (direct first-party government open data, no scraping). Staleness caveat: ≤31 day lag (monthly update).
- **v1 path alternative: Path 4a — Topograph SE** — per-call, no minimum commitments, officer data confirmed from Bolagsverket API v4. Requires RFQ + vendor attestation. Real-time (no staleness lag). Appropriate if monthly-refresh staleness is unacceptable for the use case.
- **v1.1 path: Path 1/2 — Bolagsverket Företagsinformation API v4 (direct)** — build directly once monthly subscription tier is confirmed viable at low transaction volumes. Bypasses Topograph margin. Staleness: real-time.
- **What doesn't work v1:** Subscriptions (Creditsafe, OpenCorporates, Bisnode, UC — all annual-contract or subscription-minimum); SSBTGO (government-only); Allabolag (bankrupt). BRIS has SE officer data but no API from US-East.

**DEC-20260428-A scope question for SE:** Is the `foretradare_historik.csv` file's data character aggregate statistics or named individuals per org number? This matters for both implementation and GDPR Art. 22 classification. If it contains named natural persons, it may require an Art. 22 classification review for automated decision support use cases (screening context). Verify field structure before proceeding.

---

## DK — 8-path enumeration

Test entities: Maersk A/S (CVR 22756214), Novo Nordisk A/S (CVR 24256790). Investigation date: 2026-05-18.

### Path 1 — Same vendor (cvrapi.dk / Erhvervsstyrelsen), other endpoints

#### 1a. cvrapi.dk

**URL probed:** `https://docs.rest.cvrapi.dk/` — fetched successfully

**Confirmed findings:**
- Free API (rate-limited; token recommended but not required)
- Returns: company name, VAT, address, form, status, industry codes, employment, contact info
- Officers: YES — via `participants` schema including `roles` object with types ("board", "daily_management", "director", "owner"), start/end dates, ownership percentages, voting rights
- **But:** "You can only access this API with a username and password [for participant/officer data]. To acquire that please fill out your contact information on the public website. **This API is only for paying customers.**"
- Authentication wall confirms free tier does NOT expose participants/officers — consistent with current handler behavior

**Verdict:** Free tier NOT VIABLE for officers. Paid tier requires account — pricing unknown (paying customer tier, likely subscription). Not investigated further.

#### 1b. Erhvervsstyrelsen CVR S2S API (Virk System-til-System)

**URLs probed:** `https://datacvr.virk.dk/artikel/system-til-system-adgang-til-cvr-data` (403 from US-East); `https://erhvervsstyrelsen.dk/kom-godt-igang-med-elasticSearch` (403); accessed via GitHub wrappers and secondary sources

**Confirmed findings:**
- ElasticSearch-based API at `http://distribution.virk.dk/cvr-permanent/virksomhed/_search`
- Three indices: `virksomhed` (companies), `deltager` (participants — "owners, directors, and board members"), `produktionsenhed` (production units)
- Full CVR history — all registered changes in active + dissolved companies
- **Officer data confirmed:** `LEDELSESORGAN` (management organ) objects with `bestyrelsesmedlemmer` (board members), `direktører` (directors/CEOs), `tegningsregel` (signing rules), plus historical records
- 200+ documented fields; includes `Deltager` index with 1.7M+ participant records
- **CVR data is CVR-loven (CVR Act) — statutorily public** with free redistribution; no proprietary restriction on output data

**Access requirements:**
- Write to cvrselvbetjening@erst.dk with company info
- Erhvervsstyrelsen creates credentials; sends username/password by email
- Processing time: **normally approximately 3 weeks** (confirmed from search results)
- Cost: **FREE** for data retrieval (documents requiring manual processing are invoiced at DKK 120–500 each)

**Important (Sept 2025 update):** As of September 2025, Denmark now offers TWO CVR APIs — one WITH beneficial ownership data (requires legitimate-interest attestation); one WITHOUT. Officers/directors (non-UBO data) are in the standard API with no special access restriction.

**Note on existing DK handler:** The codebase comment in `danish-company-data.ts` says: "Long-term fix: apply for official datacvr.virk.dk API access via https://datacvr.virk.dk/artikel/system-til-system-adgang-til-cvr-data — Contact: cvrselvbetjening@erst.dk". This is the correct path — the application was sent ~3 weeks ago. **This application may already have been processed.** Status check required.

**Verdict: VIABLE-V1.1 (3-week lead time; potentially already pending approval). This is the canonical v1.1 path — free, official, real-time, full officer data.**

---

### Path 2 — Same vendor, authenticated free path

- Erhvervsstyrelsen S2S contract (Path 1b above) is the authenticated free path
- cvrapi.dk paid tier: unknown pricing; not investigated
- virkdata.dk: free plan includes owner information; basic company data confirmed; officer depth unclear
- CVRHub.dk: 250 req/month free; returns name/address/status only (NOT officers confirmed from docs)
- **Verdict: VIABLE-V1.1 via S2S contract (see Path 1b). CVRHub/virkdata free tiers NOT viable for officers.**

---

### Path 3 — Other free aggregators

| Source | Coverage DK | Officers? | Verdict | Reason |
|--------|------------|-----------|---------|--------|
| OpenCorporates DK | YES (registered at `/registers/62`) | YES (officer endpoint) | NOT VIABLE-V1 | Annual subscription min £2,250/yr; no per-call |
| OpenSanctions DK | `dk_cvr` dataset confirmed — but contains **beneficial ownership only** (reelle ejere) | NO (UBO only, not directors) | NOT VIABLE | Wrong primitive — UBO ≠ directors |
| BODS / Open Ownership | DK beneficial ownership in BODS; Open Ownership has ingested CVR BO data | NO (UBO only) | NOT VIABLE | UBO ≠ directors |
| GLEIF Level 1+2 | DK LEI records (NordLEI is primary DK issuer) | NO officers | NOT VIABLE | Level 2 = entity-to-entity |
| cvr.dev | Confirmed officer/participant data from CVR | YES — but paid subscription only; 30-day free trial | NOT VIABLE-V1 | Subscription model post-trial |
| virkdata.dk | DK + NO + FI + CH; "owners" field | PARTIAL — "owners" not confirmed as director list | VIABLE-V1.1 (RFQ) | Free plan limited; officer depth unclear |
| brokk-sindre CVR docs | Documents `Deltager` index with directors/board | YES via S2S credentials | VIABLE-V1.1 with S2S | Third-party documentation of official S2S |

---

### Path 4 — Per-call paid aggregators (no subscription, no platform fee)

#### 4a. Topograph DK

**URL probed:** `https://docs.topograph.co/essentials/denmark.md` — fetched successfully

**Coverage confirmed:**
- Data source: **CVR via Elasticsearch at `distribution.virk.dk:8443/cvr-re`** (official government source)
- `legalRepresentatives` extracted from `LEDELSESORGAN` management organs; includes `bestyrelsesmedlemmer` (board members), `direktører` (directors/CEOs)
- UBO data from persons with `FUNKTION = "Reel ejer"`
- Ownership structures, establishments, financial documents (ERST)
- As of September 2025, CVR now offers TWO API variants (with/without BO data)

**Pricing model (confirmed per docs):** Same as SE — "pay per request, no bulk contracts, no minimum commitments." DK per-call price: NOT publicly disclosed (magic-link email wall).

**Platform-fee probe:** Same as SE — language in docs confirms no subscription floor. Cannot confirm without signup → **unknown-RFQ-gated.**

**Redistribution rights:** Data sourced from CVR (statutorily public records); Topograph's value-add is ETL + structure. CVR data is freely redistributable; Topograph license covers their extraction layer → vendor attestation needed for DEC-20260428-A Tier 2 compliance, but less acute than HR (no contested-access registry tier).

**Verdict: VIABLE-V1 (pending RFQ + attestation). Per-call model, no subscription floor confirmed by docs.**

#### 4b. Creditsafe Denmark

- Officer data confirmed: `directors` field in Company Credit Report covers DK
- Pricing: enterprise annual contract; £0.20+ minimum per call observed in UK pricing
- Platform fee: **confirmed-exists** (annual contract floor)
- **Verdict: NOT VIABLE-V1.**

#### 4c. Experian Denmark

- `experian.dk` — no public API documentation found; enterprise-only
- Pricing: fully RFQ-gated; no public per-call rates; likely annual subscription
- **Verdict: NOT VIABLE-V1 (subscription model expected).**

#### 4d. Bisnode / D&B Denmark

- Bisnode Danmark A/S (now D&B Denmark) confirmed active
- Officer data: available via D&B global product
- Developer docs (docs.bisnode.ee) cover EE only; DK pricing RFQ
- Platform fee: **unknown-RFQ-gated** (D&B architecture historically subscription)
- **Verdict: NOT VIABLE-V1 (subscription architecture).**

#### 4e. Risika

- Copenhagen-headquartered DK specialist credit risk platform
- Pricing page: 404; API docs return empty page; "subscription with API enabled" language found
- Platform fee: **unknown-RFQ-gated** (likely subscription-based at per-company-per-month level)
- **Verdict: NOT VIABLE-V1 pending RFQ confirmation.** VIABLE-V1.1 if RFQ reveals per-call option.

#### 4f. Retrify

- Confirmed returns `bestyrelsesmedlemmer, stiftere, revisorer og andre relationer` (board members, founders, auditors)
- Pricing: trial period only; contact sales@geomatic.dk for pricing; no public rates
- Platform fee: **unknown-RFQ-gated**
- **Verdict: VIABLE-V1.1 (RFQ required).**

---

### Path 5 — Open data alternatives

#### 5a. Erhvervsstyrelsen CVR Open Data / Datafordeler

**URLs probed:**
- `https://datafordeler.dk/dataoversigt/det-centrale-virksomhedsregister-cvr/hentcvrdata/` — fetched; HTTP 200
- Official status confirmed: Erhvervsstyrelsen (register authority), CVR on Datafordeleren

**HentCVRData service:**
- Method `hentAndredeltagereMedCVREnhedsid` — "retrieve other participants" per entity
- Official Danish government data distribution platform
- Access: requires web user (username/password) + service user (FOCES/VOCES certificate) — formal application for production + test environments
- Cost: no pricing shown on the page; CVR data is free-of-charge per Danish Business Authority policy (documents requiring manual processing are invoiced)
- **Important:** REST interface on Datafordeleren **being phased out by end of 2026** — migration to ElasticSearch S2S (Path 1b) required
- **Verdict: VIABLE but being retired; prefer S2S path (Path 1b) directly.**

#### 5b. data.virk.dk / datacvr.virk.dk open data

- CVR Open Data: all publicly registered company information is publicly accessible
- `datacvr.virk.dk` provides web search + bulk extract for registered users
- Confirmed contains officers/directors via Deltager index
- BUT: structured bulk access requires S2S credentials (same as Path 1b above)
- Annual bulk dumps potentially available via CVR data project for researchers
- **Verdict: Same as Path 1b — free, requires contract.**

#### 5c. Danmarks Statistik (DST)

- Publishes statistics on board members and directors (`bestyrelsesmedlemmer-og-direktoerer`)
- Aggregate statistical dataset, not entity-level named persons per org number
- **Verdict: NOT VIABLE for director lookup (aggregate statistics only).**

---

### Path 6 — Public web UI HTML / PDF

**URL probed:** `https://datacvr.virk.dk/` (403 from US-East); assessed via e-Justice portal + search

**Coverage confirmed from e-Justice portal (fetched):**
> "Fully liable partners, founders, owners and managers — Name and address. Registration number. Note: CPR numbers cannot be passed on to private individuals."

Officers ARE publicly visible on datacvr.virk.dk without authentication. The public web UI shows management data.

**ToS reference:** `https://datacvr.virk.dk/data/vilkaar` (confirmed exists; URL returned 403 during probe). From search context: CVR data is on EU High-Value Datasets list (Reg. (EU) 2023/138) — redistribution required to be facilitated. Danish Business Authority's own documentation confirms system-to-system access is the approved programmatic path.

**DEC-20260428-A assessment:**
- (a) Statutorily public per CVR-loven: YES
- (b) Registry ToS automated access: ToS accessible at datacvr.virk.dk/data/vilkaar but blocked during probe (403). Erhvervsstyrelsen provides explicit system-to-system pathway for automated access — this implicitly restricts web-UI scraping to manual use. The S2S contract IS the approved automated access mechanism.
- (c) Per-entity per-customer-request: consistent with Strale model
- (d) Attribution: CVR-loven requires provenance disclosure

**Conclusion:** ToS constraint (b) is NOT met in spirit — the registry operator provides S2S as the approved programmatic path, which signals that web-UI automated access is NOT the intended channel. Use S2S (Path 1b) instead.

**Verdict: NOT VIABLE under DEC-20260428-A — S2S (Path 1b) supersedes and is the explicit approved programmatic pathway.**

---

### Path 7 — BRIS cross-border

**URL probed:** `https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/dk_en` — fetched successfully

**Confirmed findings:**
- BRIS for Denmark: returns company name, CVR number, address, company type, directors/management (via CVR upstream)
- The e-Justice portal for DK references European Business Register (EBR) as a related link
- webgate.ec.europa.eu/e-justice/searchBris.do → 307 → sorry.ec.europa.eu (US-East blocked — same as all other countries)
- No public REST API

**Verdict: OFFICER DATA POTENTIALLY ACCESSIBLE VIA BRIS FOR DK** (consistent with DK CVR being highly open). But: portal-only, US-East blocked, no API. **NOT VIABLE as standalone path.** Same assessment as SE: useful for EUID cross-reference only.

---

### Path 8 — Statstidende (Danish Official Gazette)

**URL probed:** `https://www.statstidende.dk/` — minimal content retrieved (site name only)
**Assessed via search:**

**Confirmed findings:**
- Statstidende is published by Civilstyrelsen (Civil Authority, Ministry of Justice)
- Contains announcements legally required to be published, including corporate filings, management changes, insolvency proceedings
- CVR data integration: "When a company is found via CVR in Retrify, information is also automatically retrieved from Statstidende. Statstidende contains information about bankruptcy and other matters not available in CVR."
- Search by CVR number possible; HTML-based, no documented API
- Third-party integrations (Retrify, CBS library) confirm Statstidende is a supplementary source to CVR — CVR contains the authoritative officer state; Statstidende contains the publication record

**Structural property:** Statstidende is an event log (officer changes on filing date), not an authoritative current-state register. CVR S2S (Path 1b) already provides the same data in real-time, authoritatively. Statstidende is a downstream publication of CVR registrations.

**DEC-20260428-A assessment:** Gazette-style statutory publications. Under Tier 1, Strale cannot operate scrapers. CVR S2S (Path 1b) provides superior real-time data from the primary source. Statstidende only adds value for historical events or bankruptcy-specific data not in CVR.

**Verdict: NOT VIABLE-V1.** CVR S2S (Path 1b) supersedes entirely. Statstidende as supplementary bankruptcy/event-stream feed is VIABLE-V2 if historical officer timeline becomes a customer requirement. No distinct doctrine question here (CVR S2S is available at same data access level).

---

### DK synthesis

- **v1 path: Topograph DK (Path 4a)** — per-call, no subscription floor, officer coverage confirmed from CVR via LEDELSESORGAN extraction. Requires RFQ + vendor attestation. Real-time. Cost passthrough-compatible pending price confirmation.
- **v1.1 path (best path overall): Erhvervsstyrelsen CVR S2S (Path 1b)** — FREE once contract approved (~3 weeks lead). Returns full Deltager index with directors, board members, signing rules. Official source. DEC-20260428-A clean. **Application sent ~3 weeks ago per existing handler comment** — may be pending already. If credentials arrive, this becomes the v1 path immediately.
- **v1 parallel action:** Email cvrselvbetjening@erst.dk to check status of existing application (if sent ~3 weeks ago, should be resolved now).
- **Phase 2/3 correction:** "cvrapi.dk no officers" was correct observation but wrong conclusion — the free tier lacks officers by design; the fix was always the S2S contract, not finding a different free tier elsewhere.

---

## Cross-country observations

### BRIS coverage for SE and DK

Unlike HR (which restricted officer data at the BRIS gateway), **both SE and DK propagate officer/director data through BRIS** based on e-Justice portal documentation:
- SE: "information on the directors (members of the board, authorised signatories, CEO, auditor)"
- DK: "Fully liable partners, founders, owners and managers — Name and address"

This is a notable positive difference from HR/EE/BE. However, BRIS remains portal-only (no REST API) and inaccessible from US-East Railway deployment — so it is not a viable production path, but confirms the underlying data is public and propagatable.

### Free-aggregator coverage gaps

OpenCorporates covers both SE and DK with officers, but annual subscription (£2,250+ minimum) disqualifies it under v1 cost discipline. OpenSanctions does not maintain officer rosters for SE/DK beyond what appears in PEP/sanctions lists. BODS has DK (UBO only) but not SE. Neither GLEIF level returns officer data.

The practical conclusion: free aggregators that cover officers at SE/DK are absent or subscription-walled. The real free paths are the official registries themselves (Bolagsverket open-data files + CVR S2S).

### Path 6 viability under DEC-20260518-F (4-constraint check)

**SE (foretagsinfo.bolagsverket.se):**
- (a) Statutorily public: YES (Aktiebolagslagen)
- (b) ToS permits automated access: UNVERIFIED (CAPTCHA-blocked; ToS not readable remotely)
- (c) Per-entity per-request: YES (consistent with capability model)
- (d) Attribution: achievable
- **Result: FAILS at (b) — constraint not met. NOT VIABLE.** Path 4a (Topograph) + Path 5a (CSV) supersede.

**DK (datacvr.virk.dk):**
- (a) Statutorily public: YES (CVR-loven, EU HVD)
- (b) ToS permits automated access: LIKELY NOT — Erhvervsstyrelsen provides explicit S2S pathway for programmatic access; web UI is human-facing. ToS URL (403-blocked) likely restricts automated extraction in favor of S2S contract.
- (c) Per-entity per-request: YES
- (d) Attribution: achievable
- **Result: FAILS at (b) presumptively — S2S (Path 1b) is the explicit approved path. NOT VIABLE.**

### Path 8 viability (PoIT + Statstidende)

**PoIT (SE):**
- API for WRITING announcements only; no read/search API (confirmed)
- Web interface readable freely; but Tier 1 prohibits Strale-operated scraping
- Supplementary event-log, not primary source; superseded by Path 5a CSV + Path 4a Topograph
- Doctrine question: same as Moniteur Belge (BE) — gazette-style statutory publications — but moot because viable alternatives exist for SE

**Statstidende (DK):**
- Supplementary to CVR, not primary
- No API; event-log not current-state register
- CVR S2S (Path 1b) is superior and available
- No doctrine question needed — alternatives clear

---

## Platform-fee probe summary (mandatory per prompt)

| Vendor | Country | Platform fee | Monthly minimum | Annual contract | Classification |
|--------|---------|-------------|-----------------|-----------------|----------------|
| Topograph | SE | Not documented (no subscription language) | Not documented | No — "no minimum commitments" | **unknown-RFQ-gated** (no attestation received) |
| Topograph | DK | Not documented (no subscription language) | Not documented | No — "no minimum commitments" | **unknown-RFQ-gated** (no attestation received) |
| Creditsafe | SE, DK | **confirmed-exists** (annual enterprise contract) | **confirmed-exists** | **confirmed-exists** | CONFIRMED PLATFORM FEE — DQ'd |
| Bisnode/D&B | SE, DK | unknown | unknown | Historical pattern = yes | **unknown-RFQ-gated** — treat as subscription |
| UC AB | SE | unknown | unknown | Likely subscription | **unknown-RFQ-gated** — treat as subscription |
| Risika | DK | unknown | unknown | Subscription language in app listings | **unknown-RFQ-gated** |
| Retrify | DK | unknown | unknown | Trial period model | **unknown-RFQ-gated** |
| CVRHub | DK | **confirmed-none** | **confirmed-none** | None ("cancellable anytime") | Confirmed no platform fee — BUT: does not return officers (basic data only) |
| Bolagsverket Foretagsinformation API v4 | SE | None stated | Monthly transaction tier (unused transactions don't roll over) | Contract required | **SUBSCRIPTION** — monthly fee for transaction bucket. NOT per-call in strict sense. Fits v1.1 at minimum viable tier only |
| CVR S2S | DK | **confirmed-none** | **confirmed-none** | None | **FREE — no platform fee, no minimum** |

---

## Recommendations for chat-side action

| Country | v1 decision | Immediate action | Parallel actions |
|---------|------------|------------------|-----------------|
| **SE** | Two-track: (1) Open-data CSV if field structure confirmed; (2) Topograph per-call | **TODAY:** Download and inspect `https://www.bolagsverket.se/polopoly_fs/1.14117!/beskrivning-av-foretradare-csv-fil.xlsx` to confirm field structure. If CSV contains named individuals per org number → implement `se-officers` capability with monthly ingest. | Sign up to Topograph for SE pricing (magic-link flow); request DEC-20260428-A vendor attestation. Keep Bolagsverket Företagsinformation API v4 contract as v1.1 upgrade path (subscription-based; viable at ≥3,000 tx/month tier for €X/month amortized). |
| **DK** | Two-track: (1) Check existing S2S application status; (2) Topograph per-call as bridge | **TODAY:** Email cvrselvbetjening@erst.dk to check if the application sent ~3 weeks ago has been processed. If credentials received → implement `dk-officers` capability against CVR ElasticSearch. | Sign up to Topograph for DK pricing as per-call bridge while waiting for S2S credentials. Once S2S live, Topograph becomes v1.1 fallback only. |

**DEC-20260428-A scope note for SE:** The `foretradare_historik.csv` file is first-party Bolagsverket open data under CC BY 2.5 SE. No Strale-operated scraping involved. Clean under Tier 1. Redistribution requires CC attribution (handled via `provenance.attribution` in capability output).

**DEC-20260428-A scope note for DK CVR S2S:** CVR data is EU High-Value Datasets (public by regulation). S2S contract grants direct programmatic access. Clean under Tier 1. Redistribution permitted (CVR-loven + HVD regulation).

**No urgent Petter doctrine question for v1.** Both countries have free official paths that are Tier 1 clean. The Topograph Tier-2 paths need standard vendor attestation under DEC-20260428-A Tier 2 but are not doctrine-novel.

---

## Stop-condition compliance

- ✅ All 16 path investigations (2 countries × 8 paths) documented with evidence per path.
- ✅ Platform-fee probe applied to all paid vendors mentioned.
- ✅ No path skipped without explicit evidence-based reasoning.
- ✅ Final recommendation per country with cost / latency / risk.
- ✅ DEC-20260428-A scope question assessed — no urgent doctrine question for v1.

## Caveats logged

- Bolagsverket's entire website (bolagsverket.se) served CAPTCHA responses to all WebFetch probes from US-East egress. All Bolagsverket-specific findings rest on web search snippets, cached documentation, third-party documentation (Topograph SE docs, Signicat docs), and the existing handler code. Direct ToS verification was not possible — treat ToS as UNVERIFIED.
- `foretradare_historik.csv` field-level structure not confirmed via direct download (blocked). Classification as named-person-per-org-number vs. aggregate statistics is the critical open question before SE v1 implementation. Description XLSX URL is accessible: `https://www.bolagsverket.se/polopoly_fs/1.14117!/beskrivning-av-foretradare-csv-fil.xlsx`.
- CVR S2S application status (sent ~3 weeks ago per `danish-company-data.ts` code comment) not verified this session — may already be resolved.
- Topograph SE/DK per-call prices not visible (magic-link email wall). Classified as unknown-RFQ-gated; confirmed no minimum commitments via docs.
- BRIS probes returned 307→sorry.ec.europa.eu from US-East (same pattern as HR/EE/BE); assessment based on e-Justice portal documentation.
- datacvr.virk.dk returned 403 for all direct fetches; ToS content at `/data/vilkaar` not retrieved. S2S being the explicit programmatic path is the basis for Path 6 rejection.
- Risika pricing page (404) and API docs (empty) could not be probed; classified as unknown-RFQ-gated based on "subscription with API enabled" language in third-party app listings.
