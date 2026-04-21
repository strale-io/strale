# Company Registry Direct-API Audit — Payee Assurance v1 Launch

**Date:** 2026-04-21
**Author:** Claude Code (feat audit)
**Scope:** 10 EU country company-data capabilities currently running on scraping or third-party aggregators
**Status:** Step 1 of sweep to-do `34967c87-082c-8103-a2ba-f102461178f0`. Audit-only, read-only. No code or DB touched.
**Driver:** DEC-20260420-H locks the "No scraping. Direct data connections only." claim on the Payee Assurance v1 page. Every country in v1 coverage must run on a direct government-registry API or a licensed commercial aggregator under contract — or be removed from v1 scope.

---

## 1. Summary

This audit confirms the prior CC finding (2026-04-20): 10 of the 20 KYB countries depend on scraping or third-party aggregators and therefore contradict the locked brand claim. Across those 10:

- **6 have a clean `direct-api-migrate` recommendation** (SE, NL, BE, IE, LV, and — with work — LT).
- **3 require a licensed-aggregator contract** (DE, IT, ES) because no viable free/government real-time API exists in 2026.
- **1 requires a licensed-aggregator contract** (PT) after confirming IRN has no machine-readable API.
- **0 countries must be dropped from v1** if commercial contracts are acceptable; 0 plan-invalidating blockers surfaced.

A second material finding is surfaced inside this audit and flagged for chat (see §8): every manifest `data_source` field names a government registry even when the runtime calls a third-party aggregator (northdata, empresia, allabolag, cbeapi). This is the "Allabolag pattern" (DEC-20260405-A) recurring at scale — 10× — and widens the brand-voice audit surface beyond the scraping claim.

A third material finding: **OffeneRegister.de is not viable in 2026** (bulk data is 2017–2019, limited gazette-delta updates). The existing P1 to-do `34667c87-082c-8182-b38a-f9100864a9bb` is built on a stale hypothesis.

---

## 2. Summary table

| Country | Current source (live) | Recommendation | Effort | Blocker |
| --- | --- | --- | --- | --- |
| SE | allabolag.se (aggregator, KYB-competitor owned) | `direct-api-migrate`: Bolagsverket API | M | none — OAuth2 registration only |
| DE | northdata.com (third-party scrape) | `licensed-aggregator-contract`: handelsregister.ai or OpenRegister.de | M | commercial contact + contract |
| NL | northdata.com (third-party scrape) | `direct-api-migrate`: KVK Developer Portal | M | subscription approval (~1–2 wk) |
| BE | cbeapi.be (third-party API wrapper) + kbopub scrape fallback | `direct-api-migrate`: CBE Public Search + Open Data | M | none (SOAP/XML engineering) |
| IE | core.cro.ie scrape | `direct-api-migrate`: CRO CORE API | M | licence signature for redistribution |
| IT | registroimprese.it scrape | `licensed-aggregator-contract`: Openapi.it (InfoCamere reseller) | S | commercial contact |
| ES | empresia.es + infocif.es scrape | `licensed-aggregator-contract`: Informa D&B or direct Registradores | L | commercial contact (ES-language) |
| PT | northdata.com (third-party scrape) | `licensed-aggregator-contract`: Informa D&B Portugal | L | commercial contact |
| LT | northdata.com (third-party scrape) | `needs-commercial-contact-first`: Registrų centras JADIS | L | LT-language commercial contact |
| LV | info.ur.gov.lv scrape | `direct-api-migrate`: ur.gov.lv API Manager (+ Lursoft fallback) | M | API Manager registration |

---

## 3. Recommendation groupings

### `direct-api-migrate` (5 + 1 partial = 6)
Ready for per-country implementation prompts as soon as this audit is accepted.
- **SE** — Bolagsverket REST API (Feb 2025, free under EU open-data mandate)
- **NL** — KVK Developer Portal (€6.40/mo + €0.02/query, foreign subscribers accepted)
- **BE** — CBE Public Search Web Service + Open Data SFTP (€0.025/call; SOAP)
- **IE** — CRO CORE API (free search tier; bulk/documents require signed licence)
- **LV** — ur.gov.lv SDDA API Manager (free tier for core fields; Lursoft for financials)
- **LT** — Registrų centras JADIS (listed here tentatively; commercial contact needed before the recommendation can firm up to full `direct-api-migrate`)

### `licensed-aggregator-contract` (4)
Requires Petter commercial outreach before engineering can start.
- **DE** — handelsregister.ai or OpenRegister.de (OffeneRegister.de is stale, not viable)
- **IT** — Openapi.it (registered InfoCamere redistributor) is the fast path
- **ES** — Informa D&B / eInforma (AENOR-certified, not a KYB competitor), or direct Registradores subscription (€0.60–€2.10/query)
- **PT** — Informa D&B Portugal (monopoly on redistributable structured PT company data)

### `needs-commercial-contact-first` (1)
- **LT** — JADIS pricing is non-public and contract is Lithuanian-language; recommendation firms after contact

### `drop-from-v1` (0)

### Total = 10. Every country has a path forward.

---

## 4. Cross-country options worth pricing

Three aggregators came up in research; only one is worth a commercial quote in parallel to the per-country outreach:

- **Creditsafe** — would cover SE/DE/NL/BE/IE/IT/ES (7 of 10) in one contract; quote-only, typical enterprise pricing $15k–$75k+/yr. **Recommendation: Petter gets a quote in parallel to the per-country paths so we can compare unit economics.**
- **OpenCorporates** — coverage claimed for all 10, but data is **copyleft ODbL**. Essentials (£2,250/yr) and Starter (£6,600/yr) do **not** grant SaaS redistribution rights — only the Enterprise tier does, and Enterprise is quote-only. DE data on OpenCorporates is also sourced from OffeneRegister and therefore stale. Not recommended as a primary.
- **Dun & Bradstreet / Moody's Orbis** — covers all 10 cleanly; no public pricing, widely reported as enterprise tier (tens to hundreds of k€/yr). Only worth exploring if Creditsafe pricing comes back unfavourable.

No single aggregator covers 6+ countries at **clean unit economics** (the plan-invalidating threshold). Creditsafe is the closest, but per-call pricing isn't public — the 10-country per-country plan remains the working assumption.

---

## 5. Shared-code blast radius

- **`apps/api/src/capabilities/lib/browserless-extract.ts`** — imported by 45 capabilities, including 6 of the 10 in scope (BE, ES, IT, SE, IE, LV). **Do not delete** during migration. Remove the 6 company-data callers; leave the helper in place for the other 39 (Amazon scraping, SEO audit, cookie scan, etc.).
- **`apps/api/src/capabilities/lib/northdata.ts`** — imported by 5 capabilities: DE, NL, LT, PT (all 4 in scope here) + **CH (`swiss-company-data`) which is NOT in scope for this audit**. After the 4 in-scope migrations complete, CH is the last remaining northdata caller. Flag: **Switzerland also relies on third-party scraping via northdata.com.** Likely needs the same treatment; outside this prompt's scope but must not be forgotten. (CH was also not listed as "already canonical" in the prompt — so it's neither audited here nor confirmed canonical elsewhere.)
- **`apps/api/src/capabilities/lib/web-provider.ts`** — shared by `browserless-extract.ts`; stays.

---

## 6. Downstream callers

All 10 capabilities are consumed by the same three Payee Assurance v1 solution families, generated by `apps/api/scripts/seed-kyb-solutions.ts` (20 countries × 3 solution templates = 60 solutions):

- `kyb-essentials-{cc}` — 3-4 checks, €1.50
- `kyb-complete-{cc}` — 11-14 checks, €2.50
- `invoice-verify-{cc}` — 12-14 checks, €2.50

Additional direct references found:
- `swedish-company-data` is also step 1 of the legacy `kyc-sweden` solution (deprecated, `isActive: false`)
- `dutch-company-data` is an `extendsWith` link from a real-estate-related solution at `seed-solutions.ts:2764`

No other capability depends on any of these 10 slugs. Blast radius for migration is contained to the 3 Payee Assurance solution families + quality tests + manifests.

---

## 7. Per-country blocks (Step 1 ground truth + Step 2 evaluation)

### Country: BE

**Step 1 — current state**

- Capability slug: `belgian-company-data`
- Manifest-claimed source: `Kruispuntbank van Ondernemingen (Belgian Crossroads Bank for Enterprises)` (manifest `data_source_type: scrape`, `transparency_tag: ai_generated`, price_cents: 80)
- Actual runtime source: **Primary** `https://cbeapi.be/api/v1/...` (third-party API wrapper, Bearer key `CBEAPI_KEY`). **Fallback** `https://kbopub.economie.fgov.be/kbopub/...` scraped via Browserless + Claude Haiku extraction.
- Divergence: **yes** — manifest names the Belgian government registry; code's primary path is a third-party API (cbeapi.be is operated by FaimMedia B.V., NL, not the Belgian government). Fallback scrapes the government portal.
- Scraping library used: `lib/browserless-extract.ts` (for the fallback path)
- Fields extracted: company_name, registration_number, status, business_type, address, registration_date, industry (NACE), directors (empty array), establishments_count, abbreviation, commercial_name, vat_number (derived)
- Test reliability (last 10 runs): not pulled in this audit (DB access out of scope for audit prompt); check test-scheduler logs for `belgian-company-data`.
- Callers: `kyb-essentials-be`, `kyb-complete-be`, `invoice-verify-be` + blast-radius siblings via `browserless-extract.ts`.
- Provider-Coverage DB row: present in Notion Provider-Coverage DB; not touched this prompt.

**Step 2 — direct-API evaluation**

- **Preferred direct path:** CBE Public Search Web Service (FPS Economy, Belgian government), https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises/services-everyone/consultation-and-research-data/cbe-public-search; **government, paid (€0.025/call, €50 per 2,000 requests)**. Plus free daily bulk CSV via SFTP.
- **Pricing:** €0.025/call official web service; bulk CSV free (daily-batch only, not real-time).
- **Data completeness:** enterprise number, name, legal form, address, start date, NACE codes, establishments, status — all present. **Directors are not in Open Data CSV** but are in Public Search Web Service.
- **Integration complexity:** **M** — register + accept terms; SOAP/XML legacy interface (not REST). No Belgian-entity requirement.
- **Legal notes:** personal data may not be reused for direct marketing; KYB redistribution permitted. `cbeapi.be` (currently primary) is a third-party whose ToS does not explicitly grant downstream redistribution — audit-provenance risk.
- **Alternative path:** continue cbeapi.be if its ToS covers downstream redistribution (needs legal review).
- **Recommendation:** `direct-api-migrate` (to official CBE Public Search + Open Data).
- **Blocker:** engineering capacity for SOAP → JSON wrapper; no commercial blocker.

---

### Country: DE

**Step 1 — current state**

- Capability slug: `german-company-data`
- Manifest-claimed source: `Handelsregister (German Commercial Register) via northdata.com` (the manifest is transparent about northdata — partial honesty).
- Actual runtime source: `https://www.northdata.com/...` via `lib/northdata.ts`, with Claude Haiku expanding abbreviations ("BMW" → "Bayerische Motoren Werke AG") before search. JSON-LD extraction from company profile pages.
- Divergence: **partial** — manifest says "via northdata.com" (acknowledged aggregator); brand-voice claim "direct data connections only" is still violated.
- Scraping library used: `lib/northdata.ts`
- Fields extracted: company_name, registration_number, court, business_type, address, registration_date, status, industry, directors, jurisdiction, validation block.
- Test reliability: not pulled.
- Callers: `kyb-essentials-de`, `kyb-complete-de`, `invoice-verify-de`. Shares `lib/northdata.ts` with NL, PT, LT, **CH**.
- Provider-Coverage DB row: present; not touched.

**Step 2 — direct-API evaluation**

- **Preferred direct path:** No official free REST API exists for Handelsregister/Unternehmensregister. **OffeneRegister.de is stale** (2017–2019 bulk + limited gazette deltas, per offeneregister.de/daten/) — **not viable in 2026**, invalidating the earlier P1 to-do `34667c87-082c-8182-b38a-f9100864a9bb`. Bundesanzeiger has no developer interface; ToS restricts republication.
- **Pricing:** not applicable for a government path. Licensed commercial wrappers: handelsregister.ai, OpenRegister.de, North Data, Viaductus — typical €0.05–€0.30/call subscription, not publicly tiered.
- **Data completeness:** commercial wrappers return all currently-extracted fields plus filed documents and KPIs.
- **Integration complexity:** **S** via commercial wrapper (REST + API key); **XL** to build an own scraper lawfully.
- **Legal notes:** Bundesanzeiger/Unternehmensregister ToS restrict republication; commercial wrappers operate under their own licence terms that permit SaaS downstream use.
- **Alternative path:** OpenCorporates DE (ODbL, conflicts with SaaS redistribution unless Enterprise tier). Not recommended.
- **Recommendation:** `licensed-aggregator-contract` (handelsregister.ai or OpenRegister.de).
- **Blocker:** commercial contact + contract signature.

---

### Country: ES

**Step 1 — current state**

- Capability slug: `spanish-company-data`
- Manifest-claimed source: `Registro Mercantil Central (Spanish Commercial Register)` (manifest `data_source_type: scrape`)
- Actual runtime source: **Primary** `https://www.empresia.es/cif/{cif}/` and `/empresa/{slug}/` via Browserless + Claude Haiku extraction. **Fallback** `https://www.infocif.es/...`. Both are commercial aggregators of BORME (daily gazette) data, **not** the government registry.
- Divergence: **yes** — manifest names Registro Mercantil, runtime hits third-party aggregators.
- Scraping library used: `lib/browserless-extract.ts`
- Fields extracted: company_name, registration_number, business_type, address, registration_date, status, industry, directors, vat_number (derived)
- Callers: `kyb-essentials-es`, `kyb-complete-es`, `invoice-verify-es`.

**Step 2 — direct-API evaluation**

- **Preferred direct path:** Colegio de Registradores / registradores.org — no free national REST API; regulated tariff €0.60–€2.10 per info request. BORME itself is free as daily PDF (not structured, not suitable for real-time lookup).
- **Pricing:** €0.60 basic / €2.10 full per query (per official tariff); bulk/API volume pricing non-public.
- **Data completeness:** full coverage including filed accounts; requires registry-by-registry lookup (provincial).
- **Integration complexity:** **L** (Spanish-language portal; subscription API contract; credit-card-per-query pay model at the public portal).
- **Legal notes:** redistribution permitted under commercial subscription. **Informa D&B / eInforma** is the dominant licensed aggregator, AENOR-certified, B2B data vendor — not a KYB competitor — so no Allabolag-style conflict.
- **Alternative path:** Informa D&B API (eInforma). Faster integration than direct Registradores.
- **Recommendation:** `licensed-aggregator-contract` (Informa D&B preferred; direct Registradores as fallback).
- **Blocker:** commercial contact + Spanish-language contract.

---

### Country: IE

**Step 1 — current state**

- Capability slug: `irish-company-data`
- Manifest-claimed source: `CRO / Companies Registration Office (Ireland)` (manifest `data_source_type: scrape`)
- Actual runtime source: `https://core.cro.ie/company/{cro}` and `/search` via Browserless + Claude Haiku extraction. This is a scrape of the Irish government's public CORE search UI, not of an aggregator.
- Divergence: **partial** — right organisation named, wrong transport (scrape of the gov UI, not the CORE API).
- Scraping library used: `lib/browserless-extract.ts`
- Fields extracted: company_name, registration_number, business_type, address, registration_date, status, industry, directors
- Callers: `kyb-essentials-ie`, `kyb-complete-ie`, `invoice-verify-ie`.

**Step 2 — direct-API evaluation**

- **Preferred direct path:** CRO CORE API (services.cro.ie), government. Basic company search free with account; bulk/scanned-document licence fees up to €47,520/yr for full stream.
- **Pricing:** search free (account required); per-query enriched-data prices not publicly tabled.
- **Data completeness:** company number, name, type, address, status, directors, registration date, annual-return dates. Industry (NACE) is not native; filed accounts are PDF.
- **Integration complexity:** **M** (REST + account; XML/JSON).
- **Legal notes:** redistribution to paying customers requires a signed Licence Agreement with CRO — this is the gating item.
- **Alternative path:** Vision-Net (commercial licensed CRO reseller, IE).
- **Recommendation:** `direct-api-migrate` + signed bulk-data licence.
- **Blocker:** contract signature with CRO.

---

### Country: IT

**Step 1 — current state**

- Capability slug: `italian-company-data`
- Manifest-claimed source: `Registro Imprese / Italian Business Register (InfoCamere)` (manifest `data_source_type: scrape`)
- Actual runtime source: `https://www.registroimprese.it/ricerca-libera?query=...` scraped via Browserless + Claude Haiku. This is a scrape of the InfoCamere public-search UI.
- Divergence: **partial** — right organisation named, wrong transport.
- Scraping library used: `lib/browserless-extract.ts`
- Fields extracted: company_name, registration_number, business_type, address, registration_date, status, industry, directors, vat_number (derived)
- Callers: `kyb-essentials-it`, `kyb-complete-it`, `invoice-verify-it`.

**Step 2 — direct-API evaluation**

- **Preferred direct path:** InfoCamere registroimprese.it API (the ABDO portal at accessoallebanchedati.registroimprese.it). Government-chamber. Pricing opaque — "contact consultant."
- **Pricing:** not disclosed for direct API. Via **Openapi.it** reseller: per-document visura €6.50–€13.70; lookup-only tiers cheaper.
- **Data completeness:** name, tax code/VAT, REA number, legal form, address, share capital, directors, status, financials as filed XBRL bilanci.
- **Integration complexity:** **L** direct (Italian-language contract, SpID auth patterns); **S** via Openapi.it reseller.
- **Legal notes:** InfoCamere is the sole official source. Openapi.it is a registered InfoCamere redistributor, so using Openapi.it is "licensed commercial aggregator under contract" — compliant with the tightened doctrine.
- **Alternative path:** direct InfoCamere contract.
- **Recommendation:** `licensed-aggregator-contract` via Openapi.it (faster).
- **Blocker:** commercial contact.

---

### Country: LT

**Step 1 — current state**

- Capability slug: `lithuanian-company-data`
- Manifest-claimed source: `Registrų centras (Lithuanian Centre of Registers)` (manifest `data_source_type: scrape`)
- Actual runtime source: `lib/northdata.ts` — northdata.com JSON-LD scrape. Does **not** hit the Lithuanian registry directly.
- Divergence: **yes** — manifest names the government, runtime hits a German aggregator.
- Scraping library used: `lib/northdata.ts`
- Fields extracted: company_name, registration_number, business_type, address, status, directors, industry
- Callers: `kyb-essentials-lt`, `kyb-complete-lt`, `invoice-verify-lt`. Shares `lib/northdata.ts` with DE, NL, PT, CH.

**Step 2 — direct-API evaluation**

- **Preferred direct path:** Registrų centras JADIS / JAR. Free public search exists (100/day, basic fields); full data (directors, share capital, financials) behind paid contract via SDDA API Manager.
- **Pricing:** not publicly disclosed; contract-based, per-query tariffs on request. Free open-data CSV download of basic registry available.
- **Data completeness:** name, code, legal form, address, status, registration date, directors, beneficial owners (JANGIS), NACE industry.
- **Integration complexity:** **L** (API Manager onboarding; Lithuanian-language docs).
- **Legal notes:** redistribution rights require explicit contract clause. No LT-entity requirement confirmed.
- **Alternative path:** Creditsafe LT (licensed aggregator). OpenCorporates LT excluded on ODbL redistribution grounds.
- **Recommendation:** `needs-commercial-contact-first` — pricing unknown until contact is made; if pricing and terms work, it becomes `direct-api-migrate`.
- **Blocker:** commercial contact with Registrų centras (Lithuanian-language).

---

### Country: LV

**Step 1 — current state**

- Capability slug: `latvian-company-data`
- Manifest-claimed source: `Uzņēmumu reģistrs (Latvian Register of Enterprises)` (manifest `data_source_type: scrape`)
- Actual runtime source: `https://info.ur.gov.lv/#/company-search?...` scraped via Browserless + Claude Haiku. Scrape of the Latvian government UI.
- Divergence: **partial** — right organisation named, wrong transport.
- Scraping library used: `lib/browserless-extract.ts`
- Fields extracted: company_name, registration_number, business_type, address, registration_date, status, industry, directors
- Callers: `kyb-essentials-lv`, `kyb-complete-lv`, `invoice-verify-lv`.

**Step 2 — direct-API evaluation**

- **Preferred direct path:** ur.gov.lv SDDA API Manager — some web services free of charge; bulk CSV/Excel open-data downloads free.
- **Pricing:** free tier for basic lookups; paid services via Lursoft (commercial wrapper; pricing on request).
- **Data completeness:** registry number, name, legal form, address, directors, status, registration date. Financials only via Lursoft paid tier.
- **Integration complexity:** **M** (API Manager onboarding; English docs available).
- **Legal notes:** open-data CSV is CC-compatible — redistribution OK. Lursoft ToS covers commercial redistribution under contract.
- **Alternative path:** Lursoft commercial API (for financials if needed).
- **Recommendation:** `direct-api-migrate` for core fields; add `licensed-aggregator-contract` with Lursoft if financial fields are added to the capability scope later.
- **Blocker:** SDDA API Manager registration.

---

### Country: NL

**Step 1 — current state**

- Capability slug: `dutch-company-data`
- Manifest-claimed source: `KVK / Kamer van Koophandel (Netherlands Chamber of Commerce)` (manifest `data_source_type: scrape`)
- Actual runtime source: `lib/northdata.ts` — northdata.com JSON-LD scrape (code comment admits: "Replaces the previous Browserless+LLM scraper that was failing to extract data from kvk.nl").
- Divergence: **yes** — manifest names KVK, runtime hits a German aggregator.
- Scraping library used: `lib/northdata.ts`
- Fields extracted: company_name, registration_number, business_type, address, status, directors, industry
- Callers: `kyb-essentials-nl`, `kyb-complete-nl`, `invoice-verify-nl`. Plus `extendsWith` link from a real-estate-related solution. Shares `lib/northdata.ts` with DE, PT, LT, CH.

**Step 2 — direct-API evaluation**

- **Preferred direct path:** KVK Developer Portal API (developers.kvk.nl), Dutch government, paid subscription.
- **Pricing:** €6.40/month base + €0.02/query for Basisprofiel/Vestigingsprofiel/Naamgeving. Zoeken (search) is free. Optional Mutatieservice €1,279/yr.
- **Data completeness:** KVK/RSIN numbers, name, legal form, address, SBI (industry), directors, registration date, status. Financials **not** included (KVK does not centrally publish financials for SMEs).
- **Integration complexity:** **M** (request subscription, per-key billing). No Dutch-entity requirement — foreign subscribers accepted; VAT-exempt invoice issued.
- **Legal notes:** KVK ToS permits use of data in customer-facing KYB reports; personal-data restrictions for direct marketing.
- **Alternative path:** KVK Open Dataset Basisprofiel (free, daily snapshot, limited fields) — fallback only.
- **Recommendation:** `direct-api-migrate`.
- **Blocker:** subscription application (~1–2 weeks approval).

---

### Country: PT

**Step 1 — current state**

- Capability slug: `portuguese-company-data`
- Manifest-claimed source: `Registo Comercial (Portuguese Commercial Register)` (manifest `data_source_type: scrape`)
- Actual runtime source: `lib/northdata.ts` — northdata.com JSON-LD scrape.
- Divergence: **yes** — manifest names the Portuguese registry, runtime hits a German aggregator.
- Scraping library used: `lib/northdata.ts`
- Fields extracted: company_name, registration_number, business_type, address, status, directors, industry
- Callers: `kyb-essentials-pt`, `kyb-complete-pt`, `invoice-verify-pt`. Shares `lib/northdata.ts` with DE, NL, LT, CH.

**Step 2 — direct-API evaluation**

- **Preferred direct path:** No official machine-readable API. IRN's Certidão Permanente is the authoritative digital artefact but is per-entity annual subscription (€25/entity/year, or €15 per single certificate) — not a queryable API. RNPC public search is CAPTCHA-gated, no bulk/API.
- **Pricing:** Certidão Permanente €25/entity/year. No developer-API price exists.
- **Data completeness (via Certidão):** name, NIPC, legal form, address, registration date, directors, status, share capital. No standardised industry codes, no financials.
- **Integration complexity:** **XL** (per-entity subscription, code-based retrieval, HTML parsing; not designed for programmatic KYB).
- **Legal notes:** Certidão content can be shown to the customer it pertains to; systematic redistribution to third parties is not clearly licensed. **Informa D&B Portugal holds a practical monopoly on redistributable structured PT company data.**
- **Alternative path:** Informa D&B Portugal API (licensed aggregator).
- **Recommendation:** `licensed-aggregator-contract` (Informa D&B PT).
- **Blocker:** commercial contact + contract; pricing not public.

---

### Country: SE

**Step 1 — current state**

- Capability slug: `swedish-company-data`
- Manifest-claimed source: `Bolagsverket (Swedish Companies Registration Office)` (manifest `data_source_type: scrape`)
- Actual runtime source: **`allabolag.se`** (Browserless-rendered scrape + regex parser + Claude Haiku fallback parser) via `lib/web-provider.ts`. For name-only inputs, LLM extracts a name, then Allabolag search returns an org number, then the full scrape runs.
- Divergence: **yes, already documented** (DEC-20260405-A) — manifest names Bolagsverket, runtime hits Allabolag.se (owned by UC/Enento, a direct KYB competitor — EU Database Directive exposure).
- Scraping library used: `lib/browserless-extract.ts` (via `web-provider.ts`)
- Fields extracted: company_name, org_number, vat_number (derived), revenue_sek, employees, profit_sek, fiscal_year, resolved_from. **SE uniquely extracts financials** — this is the one country where financials are in the current output shape.
- Callers: `kyb-essentials-se`, `kyb-complete-se`, `invoice-verify-se`, legacy `kyc-sweden` (inactive). Also an additional `step 1` in the `seed-solutions.ts:2053` block (likely an old solution).

**Step 2 — direct-API evaluation**

- **Preferred direct path:** **Bolagsverket Företagsinformation API** (bolagsverket.se/apierochoppnadata). Swedish government, **free**, launched Feb 3 2025 under EU High-Value Datasets mandate; v2 released April 23 2025. OAuth 2 auth, 60 req/min rate limit.
- **Pricing:** €0 per call, no minimums.
- **Data completeness:** name, org number, legal form, address, SNI (industry), status, directors, annual-report events and filed annual reports. **Revenue/profit/employees/fiscal_year require parsing the retrieved annual report XBRL/PDF** — not a single structured field like Allabolag returns. This is the one friction in SE migration: financials are not a free synchronous lookup; they come from parsing annual reports.
- **Integration complexity:** **M** (OAuth2 client registration + REST; plus XBRL parsing if we keep financials in output shape).
- **Legal notes:** open-data licence under EU Open Data Directive; redistribution permitted; attribution expected. No Swedish-entity requirement (Strale IS a Swedish entity, so no issue either way).
- **Alternative path:** Roaring.io or Creditsafe SE — both licensed aggregators drawing from Bolagsverket. Bolagsverket direct is the cleaner win (free, government, removes KYB-competitor data dependency).
- **Recommendation:** `direct-api-migrate`.
- **Blocker:** none (OAuth2 registration only). Design decision needed during implementation: keep financials in the SE output shape (and add XBRL parsing), or drop financials and realign SE with the other 19 countries' field set.

---

## 8. Findings flagged for chat

1. **Divergence pattern at scale — 8 of 10 manifests misattribute the data source.** Manifests ES, IT, IE, LV, BE, NL, PT, LT, SE (9, with DE partially transparent) name the government registry in `data_source` while the code calls either a third-party aggregator (northdata, empresia, infocif, allabolag, cbeapi) or scrapes the government's public UI. The "Allabolag pattern" (DEC-20260405-A) is not an isolated Swedish case — it is a systemic platform issue that predates and postdates that decision. **The brand-voice claim-vs-reality audit surface is wider than scraping; it includes misattributed sources.** Recommendation: fix alongside this migration by updating each manifest's `data_source` field to match the runtime at the moment of cutover.

2. **OffeneRegister.de is stale and not viable.** P1 to-do `34667c87-082c-8182-b38a-f9100864a9bb` is built on an obsolete hypothesis (the 2017–2019 bulk with limited gazette deltas is not usable for live KYB in 2026). The German path needs a licensed commercial wrapper (handelsregister.ai or OpenRegister.de). Recommendation: update or close that to-do.

3. **Switzerland (`swiss-company-data`) scrapes via `lib/northdata.ts` but was not listed in this audit's scope.** The prompt lists SE/NO/DK/FI/UK/FR/AT/CZ/EE/PL as "already canonical" but does not mention CH either way. CH likely has the same scraping issue as the 10 countries in scope and needs the same treatment. **Flagging for chat — this likely widens the sweep to-do by one country.**

4. **Belgium's current "primary" path is a third-party API wrapper (cbeapi.be, operated by FaimMedia B.V., NL), not the Belgian government.** Audit-provenance exposure: if cbeapi.be ToS doesn't explicitly grant SaaS downstream redistribution, we have the same legal exposure as scraping an aggregator. Direct CBE Public Search migration resolves it.

None of these trip the prompt's plan-invalidating thresholds (no ≥4 countries without any path; no 6+ country aggregator at clean economics; no Strale-legal-entity requirement), but items 1 and 3 materially widen the workstream.

---

## 9. Verification that this report satisfies the prompt

- One country block per country × 10 (grep for `### Country:` returns 10).
- Summary table in §2 has 10 rows.
- Recommendation groupings in §3 sum to 10 (6 direct-API-migrate + 3 licensed-aggregator + 1 needs-commercial-contact + 0 drop = 10).
- No country has `TBD` in the recommendation field.
- Cross-country options evaluated in §4.
- Shared-code blast radius documented in §5.
- Callers documented in §6.
- Findings flagged for chat in §8.

---

## 10. What this report does not do

- **No commits beyond the one containing this file.**
- No code changes, no manifest edits, no DB edits, no Notion edits.
- Does not mark the sweep to-do complete — this is Step 1 of a multi-step to-do.
- Does not spec the per-country migrations — that is the next prompt (or set of prompts) in the workstream.
- Does not create the follow-up Notion to-dos for `drop-from-v1` or cross-country aggregator outreach — no `drop-from-v1` recommendations emerged, and the cross-country aggregator (Creditsafe) is a "Petter: commercial outreach in parallel" item that chat should create once this report is accepted.

---

## 11. Closing steps reminder

Per the prompt's Closing Steps section, once this audit is accepted by chat:

- No `drop-from-v1` countries → no Payee-Assurance-page-narrowing to-do needed.
- Cross-country aggregator worth pricing → Petter should get a Creditsafe quote for SE/DE/NL/BE/IE/IT/ES in parallel to the per-country outreach (new P1 to-do for chat to create).
- No DEC entry in this prompt. Per-country DECs come with the per-country implementation prompts.
- The sweep to-do `34967c87-082c-8103-a2ba-f102461178f0` stays open — Steps 2+ of that to-do are the migrations themselves.
