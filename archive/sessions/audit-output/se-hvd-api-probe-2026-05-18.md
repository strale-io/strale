# SE HVD API Probe — Bolagsverket Representatives Coverage
**Date:** 2026-05-18
**Branch:** chore/pii-fixture-audit-legal-representatives
**Purpose:** Verify whether Bolagsverket's free HVD API exposes legal representatives (firmatecknare / styrelseledamöter), and determine the v1 SE path for `legal_representatives[]` extraction.

---

## Section 1 — Verdict

| Dimension | Finding |
|---|---|
| HVD API representatives exposure | **NO** |
| v1 SE path recommendation | **Defer v1.1 — paid Företagsinformation API required; cost model disqualified** |
| Confidence | **High** — based on (a) archived Swagger spec exhaustive schema enumeration, (b) SCB canonical dataset page field enumeration, (c) EUR-Lex EU 2023/138 mandate text, (d) Kyckr KYB guide distinguishing free vs. paid, (e) Signicat confirming "Roles / Authorisation" is a distinct product tier |

### Summary verdict

The Bolagsverket HVD API (`POST /vardefulla-datamangder/v1/organisationer`) **does not expose legal representatives**. The `Organisation` schema (confirmed in the archived Swagger at `docs/research/bolagsverket-hvd-swagger.json`) has exactly 14 properties. None map to any representative concept:

```
organisationsidentitet, namnskyddslopnummer, organisationsnamn, registreringsland,
reklamsparr, organisationsform, avregistreradOrganisation, avregistreringsorsak,
pagaendeAvvecklingsEllerOmstruktureringsforfarande, juridiskForm, verksamOrganisation,
organisationsdatum, verksamhetsbeskrivning, naringsgrenOrganisation, postadressOrganisation
```

The words `företrädare`, `representant`, `firmatecknare`, `styrelseledamot`, `befattningshavare`, `board`, `officer`, `authorised` appear zero times in the entire Swagger spec.

Representative data (`firmatecknare`, `befattningshavare`, `styrelseledamöter`) is available only via the **paid** "API för att hämta företagsinformation" (current version: 4.7 as of April 28, 2026) — which requires a subscription contract with a SEK 6,250 upfront fee plus per-transaction charges, minimum 3,000 transactions/month. This cost model is disqualified per Petter's directive (no fixed monthly fees).

### The EU mandate gap

EU Implementing Regulation 2023/138 Annex, section 5.1 "Basic company information" mandates: name, status, address, legal form, registration number, registration date, NACE activity codes. **The prompt's assumption that the HVD mandate includes "names of the persons authorised to represent the legal entity" is incorrect for the 2023/138 Basic company information category.** That language appears in other EU directives (BRIS/EU Company Law Directive) but is not in the HVD Implementing Regulation's mandatory minimum for the "Companies and company ownership" HVD category. Bolagsverket's implementation is fully HVD-compliant without exposing any representative data.

---

## Section 2 — Evidence

### 2.1 Archived Swagger spec (primary source)

File: `docs/research/bolagsverket-hvd-swagger.json`

- OpenAPI version: 3.0.3
- Server: `https://gw.api.bolagsverket.se/vardefulla-datamangder/v1`
- Endpoints defined: `/isalive` (GET, ping scope), `/organisationer` (POST, read scope), `/dokumentlista` (POST, document list)
- `Organisation` schema properties enumerated above — 14 fields, zero representative fields
- No additional schemas contain person/representative data
- Grep of entire file for representative-concept terms: zero matches

This spec appears to be current to the HVD launch (February 3, 2025) and has not been updated to include representative data. The Swagger file was captured at DEC-20260405-A Phase 2 (when Allabolag scraping was replaced with the direct API).

### 2.2 SCB canonical dataset page

Source: `https://www.scb.se/vara-tjanster/bestall-data-och-statistik/foretagsregistret/vardefulla-datamangder--grundlaggande-foretagsinformation/`

The SCB page for "Värdefulla datamängder — grundläggande företagsinformation" enumerates exactly 14 data elements:
- Organization name, organization form, advertising block (reklamspärr), de-registered organization status, de-registration reason, ongoing liquidation/restructuring procedures, active organization status, all organization names, legal form, postal address, registration date, SNI codes, business description, identity identifier, digitally submitted annual reports

No mention of representatives, firmatecknare, styrelseledamöter, or board members anywhere on this page. The reference to EU 2023/138 confirms this list is the complete HVD scope for this category.

### 2.3 EU 2023/138 Annex mandate — what it actually says

Source: `https://eur-lex.europa.eu/eli/reg_impl/2023/138/oj/eng`

Section 5.1 "Basic company information" mandated fields:
- Name of the company (full version; alternative names when applicable)
- Company status (such as when it is closed, struck off the register, wound up, dissolved)
- Registration date
- Registered office address
- Legal form
- Registration number
- Member State where registered
- Activity/activities that are the object of the company, such as the NACE code

**"Names of the persons authorised to represent the legal entity" is NOT in this list.** It appears in the Company Law Directive (EU) 2017/1132 and the BRIS interconnection regulation (EU 2021/1042) but was not ported into the HVD Implementing Regulation's mandatory minimum. Bolagsverket is fully compliant with 2023/138 without representative data.

### 2.4 Paid API (Företagsinformation) — firmatecknare confirmed present, cost model disqualified

Source: Multiple Bolagsverket release notes pages (CAPTCHA-walled, content via search snippet extraction)

The paid "API för att hämta företagsinformation" (current version 4.7, April 28, 2026) explicitly provides:
- firmatecknare (authorized signatories) — the person who can sign on behalf of the company
- befattningshavare / styrelseledamöter (board members and company officers)
- Historical data at specific dates (new in v4.5, April 2025)

Cost model: minimum contract tier = 3,000 transactions/month; SEK 6,250 upfront setup fee. Monthly subscription. Per Petter's directive, fixed monthly fees are disqualified.

### 2.5 SSBTGO — public-sector-only, not applicable

The Sammansatta bastjänsten för grunddata om organisationer (SSBTGO) is a data-sharing service for **Swedish public-sector organisations only**. Parties listed are government agencies. Sign-up requires submitting a connection agreement to Bolagsverket with your agency credentials. Private companies cannot use SSBTGO. The engagemang (engagement) endpoint that returns firmatecknare per org number is SSBTGO-only, not accessible to commercial integrators.

### 2.6 Kyckr KYB guide — independent corroboration

Source: `https://www.kyckr.com/blog/sweden-company-registry-kyb-guide`

> "Free Open Data (HVD): Basic statistics via Statistics Sweden's machine-readable datasets. Limited company profiles (name, registration number, address, status)"
> "What's NOT Available from Free HVD: Detailed officer/director names and roles"
> "Paid Sources: Certificate of Registration (SEK 125) — includes officials and signatory power. API access (SEK 6,250 upfront fee + usage charges)"

This independently confirms the free/paid split.

### 2.7 Signicat — representative data is a distinct product tier

Source: `https://developer.signicat.com/docs/data-verification/data-sources/organisations/bolagsverket-sweden/`

Signicat's Bolagsverket integration offers separately-tiered query categories: Basic, Ownership, UBOs, Roles, Authorisation and signatory rights. "Roles" and "Authorisation" are distinct from "Basic" — confirming that representative data requires a higher-tier API call (backed by the paid Företagsinformation API).

### 2.8 Existing handler state

Current handler: `apps/api/src/capabilities/swedish-company-data.ts`

The handler uses the HVD API with OAuth2 client_credentials (`BOLAGSVERKET_CLIENT_ID` / `BOLAGSVERKET_CLIENT_SECRET` already in production). It correctly flags:
```typescript
tier_2_available: false,
tier_2_available_reason: "handler does not currently extract legal representatives from upstream registry; follow-up extraction task tracked",
```

This is accurate. The note "follow-up extraction task tracked" anticipated Phase 4 investigation. This probe is that investigation; the finding is that there is no free path.

---

## Section 3 — Implementation Hints for Chat-Side

### 3.1 HVD API (current — no representatives)

- **Auth:** OAuth2 client_credentials. Token URL: `https://portal.api.bolagsverket.se/oauth2/token`. Scope: `vardefulla-datamangder:read`. Credentials: `BOLAGSVERKET_CLIENT_ID` + `BOLAGSVERKET_CLIENT_SECRET`. Already live in production.
- **Endpoint:** `POST https://gw.api.bolagsverket.se/vardefulla-datamangder/v1/organisationer`
- **Request body:** `{ "identitetsbeteckning": "5567037485" }` (10-digit org number, no hyphen)
- **Rate limit:** 60 requests/minute per client (confirmed in coverage matrix)
- **Response:** 14-field `Organisation` object. Zero representative fields. Cannot be extended to expose representatives without Bolagsverket adding them to the HVD schema (no evidence they plan to).
- **Latency:** ~200–400ms (direct registry API)
- **GDPR:** No PII in HVD response for company lookups. All fields are company-level public registry data. GDPR Art. 22 classification: `data_lookup`.

### 3.2 Paid Företagsinformation API (has representatives — disqualified by cost model)

- **Auth:** Separate OAuth2 credentials (not the same as HVD). Requires signing a contract with Bolagsverket.
- **Cost:** SEK 6,250 setup fee + per-transaction subscription (minimum 3,000 tx/month). **Disqualified by fixed monthly fee directive.**
- **What it provides:** firmatecknare (authorized signatories with signing scope), styrelseledamöter (board members with function codes and appointment dates), befattningshavare (officers), historical data at specific date. Full KYB-grade representative coverage.
- **Field mapping to canonical `legal_representatives[]`:** `firmatecknare[]` → role = "authorized_signatory"; `styrelseledamöter[]` → role = "board_member"; each entry includes: full name, personnummer (personal identity number), function code/klartext, appointment date, possibly cessation date.
- **GDPR note:** Contains personnummer (Swedish national ID) — PII category, requires GDPR-compliant processing. Attribution: "Källa: Bolagsverket". Redistribution of personnummer in API responses requires data processing agreement (DPA) with Bolagsverket, not just the HVD license.

### 3.3 What to try for a v1.1 path

If the cost directive is ever relaxed or a per-call option emerges:

1. The paid API has been updated as recently as April 28, 2026 (v4.7). Contact: `bolagsverket.se/apierochoppnadata/driftochsupport/kontaktaossomapierochoppnadata.3996.html`. Ask specifically about a pay-per-call tier — the current documentation describes minimum monthly volumes but this may not be the only option.

2. Third-party aggregators (Signicat, Topograph, Kyckr, Checkbiz) wrap the paid API and may offer per-call pricing. Topograph appears to be Bolagsverket's preferred aggregator partner for non-Swedish-resident access. This may align better with Strale's economics.

3. SE company web UI (`foretagsinfo.bolagsverket.se`) — CAPTCHA-walled, not viable per DEC-20260428-A Tier 1.

### 3.4 Live test result

No live test was possible:
- HVD API is live and functional for the 14 existing fields (confirmed by production traffic)
- HVD `/organisationer` endpoint provably does not return representative data (schema evidence = high confidence, equivalent to a live test)
- Paid API requires a contract to call — no test possible without signup

---

## Section 4 — DEC-20260428-A / DEC-20260518-F Doctrine Compliance

### 4.1 HVD API (Path recommended for existing fields)

- **Source type:** First-party government open data. Bolagsverket is the authoritative registry operator by statute (Aktiebolagslagen, Handelsregisterlagen).
- **License:** CC BY 4.0 (or equivalent), confirmed in coverage matrix. Commercial use and redistribution explicitly permitted per Bolagsverket's own statement: "Du får använda dessa data fritt för kommersiella och icke-kommersiella syften, exempelvis för att skapa nya tjänster eller produkter."
- **Mandate:** EU Commission Implementing Regulation (EU) 2023/138 and Swedish Öppna datalagen.
- **DEC-20260428-A verdict:** Clean. HVD data is Tier 0 (first-party statutory registry), not even Tier 2 (vendor-scraped). No scraping involved. Primary-source provenance per call.

### 4.2 Paid Företagsinformation API (if ever pursued)

- **Source type:** First-party government API. Same authoritative source as HVD — just a paid tier.
- **License:** Separate contract; commercial redistribution requires DPA covering personnummer.
- **DEC-20260428-A verdict:** Would be clean (direct government API, not scraping), but DPA with Bolagsverket required before shipping representative fields in production responses.
- **DEC-20260518-F verdict:** Preferred sourcing pattern (licensed-bulk or direct-API preferred over scraping-derived). Cost model is the only blocker.

### 4.3 Path 6 (web UI scraping) — explicitly not pursued

The web UI at `foretagsinfo.bolagsverket.se` is CAPTCHA-gated. This is Bolagsverket's explicit technical signal that automated access to the web UI is not permitted. Not pursued per DEC-20260428-A Tier 1 (absolute no-scraping rule applies to Strale's own operations).

---

## Appendix: Bolagsverket API Landscape (2026-05-18 snapshot)

| API | Free? | Representatives? | Auth | Notes |
|---|---|---|---|---|
| HVD API v1 (`vardefulla-datamangder`) | YES | NO | OAuth2 client_credentials | 14 fields, no PII |
| Företagsinformation API v4.7 | NO | YES | OAuth2 (separate contract) | SEK 6,250 setup + per-tx monthly |
| SSBTGO | Public sector only | YES | Connection agreement | Swedish gov agencies only |
| Web UI (`foretagsinfo.bolagsverket.se`) | YES | YES | None (CAPTCHA) | Not viable — CAPTCHA-gated |

## Correction to Phase 4 Enumeration

The Phase 4 SE/DK enumeration (`audit-output/exhaustive-enumeration-se-dk-2026-05-18.md`) listed two erroneous SE paths:

- **Path 5a (foretradare_historik.csv):** Misclassified as "v1 candidate." Correct: This file is aggregate statistics (age/gender breakdowns for representatives by company type), not named individuals per org number. Useless for officer lookup. Status: **Dead end.**
- **Path HVD API:** Listed without confirming representative field presence. Correct: HVD API is confirmed live for 14 company fields and confirmed absent for representative fields. Status: **Partial — v1 for company fields, not for representatives.**

The canonical SE status as of this probe is:
- Company fields (name, address, status, etc.): **Live via HVD API**
- Legal representatives: **Unavailable via free paths; paid API disqualified by cost model; defer to v1.1**
