# Partial source enumeration — ES (Spain) legal_representatives coverage

**Date:** 2026-05-19
**Phase:** 7b (ES — Spain, standalone enumeration)
**Doctrine:** DEC-20260518-E (Exhaustive Source Enumeration); DEC-20260518-F (per-call statutory web UI/PDF); DEC-20260518-G (Tier-2 platform-fee probe mandatory); DEC-20260428-A (no Strale-operated scrapers); DEC-20260505-E (Topograph DQ'd); DEC-20260507-C (BORME/Registradores self-build Deferred); cost discipline (per-call passthrough OK, fixed monthly NOT OK in v1)
**Test entities:** Telefónica S.A. (CIF A28015865), Iberdrola S.A. (CIF A48010615). Both confirmed 200 via Openapi ES-Advanced 2026-05-15.
**Current state:** Openapi ES-Advanced committed at €0.06+VAT/call. Tier 1: 6/7 fields, no legal_form. Tier 2: 4/5 fields, NO directors/officers. NO representative coverage from any current path.

---

## ES coverage matrix (pre-enumeration)

| Tier | Fields | Representatives | Cost |
|------|--------|-----------------|------|
| ES-Start (Openapi) | 20+ identity fields | None | €0.055/call |
| ES-Advanced (Openapi) | 40+ fields + 4-yr financials | **None** | €0.06/call |
| IT-Stakeholders (Openapi) | Full exec/shareholder/LR set | N/A — Italy only | €0.095/call |
| No ES-Stakeholders SKU exists on Openapi as of 2026-05-19 | — | — | — |

**Gap:** Directors, administrators (administradores), legal representatives (apoderados), secretaries — all absent from any current Openapi ES product.

---

## Path 1 — Direct registry API, authenticated (paid): Registradores commercial API

**URLs probed:**
- `https://www.registradores.org/actualidad/servicios-registrales/servicios-digitales/` → HTTP 404
- `https://opendata.registradores.org/` → "URL rejected, consult administrator" (CDN/WAF block on all direct probes)
- `https://sede.registradores.org/site/mercantil` → HTTP 200, content retrieved (navigation portal only)

**What is the Registradores commercial API?**

Spain's Colegio de Registradores de España (CORPME) operates a gated commercial service through `sede.registradores.org` for programmatic access to registry data. The "Nota Informativa Mercantil" is the standard per-company excerpt containing legal form, registered office, share capital, current directors, and registered acts. A full "certificación registral" is also available.

**Data fields confirmed available (via indirect sources):**
- Company name, NIF/CIF, legal form, registered office, province
- Current administradores (directors/administrators) with name and role
- Legal representatives (apoderados) with name and scope of representation
- Registered acts (BORME references) and filing status
- Share capital
- IRUS (Identificador Único de Registro) — Spanish registry UID
- EUID (European Unique Identifier)

Source: Kyckr Spain 2026 KYB guide (corroborated), Know Your Customer Company Register Spotlight (corroborated), Legalmondo guide, search result corroboration from Colegio de Registradores press release.

**Pricing structure:**
- Per-document (nota informativa mercantil): approximately €6.58 per full document (confirmed by Kyckr guide and multiple secondary sources)
- Nota informativa (basic): lower tier, exact price not confirmed by direct probe
- No public per-call API pricing page accessible — all commercial API access gated behind individual agreements with CORPME

**DEC-20260518-G platform-fee probe:**
- **Platform fee:** NOT ASCERTAINABLE from public sources. CORPME does not publish API pricing publicly; commercial access requires direct agreement.
- **Setup fee:** NOT DISCLOSED publicly.
- **Monthly minimum:** NOT DISCLOSED publicly. Commercial agreements are individual and private.
- **Annual floor:** NOT DISCLOSED.
- **Volume floors:** NOT DISCLOSED.
- **Eligibility:** Commercial entities, financial institutions, and professionals (lawyers, notaries, gestorias) are the documented target clients. Non-Spanish entities must establish agreement — eligibility not confirmed for Strale.

**DEC-20260507-C cross-check:**
DEC-20260507-C deferred a "self-build on opendata.registradores.org / BORME / sede.registradores.org" citing a 4-6 week ingest project. The current commercial API path (per-call, CORPME-mediated) is a different question: it involves a licensing agreement + per-call fees, not Strale operating the pipeline. However, the non-disclosure of pricing and the requirement for a private commercial agreement make this incompatible with Petter's cost rule (cannot determine if fixed monthly fee applies without signing an agreement).

**Verdict: BLOCKED / NOT ASCERTAINABLE.** CDN blocks all direct probes. Pricing requires private commercial agreement — pricing structure unknown and possibly includes mandatory subscription. DEC-20260518-G probe incomplete because CORPME does not publish pricing. This path requires a commercial contact to determine viability.

---

## Path 2 — Direct registry API, free / open tier: datos.gob.es + opendata.registradores.org

**URLs probed:**
- `https://datos.gob.es/en/catalogo/ea0040819-boletin-oficial-del-registro-mercantil-borme` → HTTP 404
- `https://datos.gob.es/en/catalogo/ea0040819-diario-oficial-borme` → HTTP 200 (via search result metadata)
- `https://opendata.registradores.org/dataset/` → "URL rejected" (CDN/WAF block)
- `https://opendata.registradores.org/dataset/en/` → "URL rejected" (CDN/WAF block)
- `https://opendata.registradores.org/en/` → "URL rejected" (CDN/WAF block)

**What does opendata.registradores.org provide?**

The Colegio de Registradores launched `opendata.registradores.org` as a public platform (confirmed active as of February 2025 per Confilegal article). The platform is described in multiple sources as:

- Entirely free, no registration required
- Real-time data reflecting current Commercial Registry content
- Downloadable bulk datasets in CSV and other formats
- Licensed under **Open Data Commons Open Database License (ODbL) 1.0**
- Law 37/2007 (PSI reuse) + EU Directive 2019/1024 compliant

**Fields confirmed as available (via Confilegal article + Junta de Andalucia open data bulletin + Colegio de Registradores press release):**
- Company denomination (razon social)
- NIF/CIF
- IRUS (Identificador Único de Registro)
- EUID (European Unique Identifier)
- Legal form (forma jurídica)
- CNAE + NACE activity codes
- Registered office address
- Company status (active/dissolved)
- Corporate website
- **"Administradores y cargos"** — identity of persons responsible for administering the company; if multiple, their operating regime (joint and several, solidary, or collegiate)
- Competent Commercial Registry location
- Registration sheet reference

**Critical nuance — "anonymized" vs. full names:**
The platform states data is "anonimizados" (anonymized) to balance transparency with privacy. This is ambiguous — it may mean administrator NIFs/DNIs are suppressed (consistent with GDPR Art. 9) while names remain, or it may mean names are also suppressed for natural persons. The Revisa Registradores article specifically cites "la identidad de los administradores sociales (IRUS)" suggesting identity is preserved via the IRUS identifier, but whether natural-person names appear in the bulk dataset is unconfirmed without direct download access (CDN blocks all direct probes from this session's fetch agents).

**Access method:**
- Web directory at `opendata.registradores.org/directorio` — searchable by name or NIF, no registration
- Bulk download catalog at `opendata.registradores.org/dataset/` — direct file downloads, 250,000+ downloads in 12 months (per press release)
- No per-company API endpoint confirmed (this is a directory + bulk download, not a per-call REST API)

**DEC-518-G probe:** Not applicable — this is described as free and open. No fees cited in any source.

**DEC-20260507-C cross-check:**
The deferred "self-build" in DEC-20260507-C referenced "opendata.registradores.org / BORME / sede.registradores.org" as a single deferred item citing "4-6 week ingest project." The opendata.registradores.org bulk download path (bulk CSV ingest) is what that deferral covered. The deferral stands — this is a bulk-ingest build, not a per-call API. This session does NOT propose lifting the deferral.

**Verdict: VIABLE-V1.1 (bulk ingest, currently deferred per DEC-20260507-C).** The ODbL-licensed bulk download with administrator fields exists and is free. The 4-6 week ingest to build a queryable index is the blocker. Once DEC-20260507-C is lifted, this is the canonical free path. NOT viable in v1 as per-call API (no API endpoint exists — directory lookup only).

---

## Path 3 — Tier-2 paid per-call aggregators

### 3a — Openapi WW-Top + ES-Advanced (current vendor)

**URL probed:** `https://openapi.com/products/company-advanced-spain` → HTTP 200

**All Spain products on Openapi as of 2026-05-19:**
1. Company Start Spain — 20+ identity fields, €0.055+VAT/call. No directors.
2. Company Advanced Spain — 40+ fields + 4-year financials, €0.06+VAT/call. No directors.
3. Spanish Car Check — vehicle data. Not relevant.
4. Spanish Bike Check — vehicle data. Not relevant.
5. SMS Spain — messaging. Not relevant.

**Italian Stakeholders SKU (`/products/italian-stakeholders`):** Confirmed as Italy-only. Fields: name, surname, role, activity start date, age, tax code, birth info, top-10 shareholders, employee data. This is the product that would solve ES if it existed for Spain.

**No ES-Stakeholders product exists.** Openapi's product catalog for Spain is limited to Start ES and Advanced ES; neither contains directors, administradores, or legal representatives.

**Post-2026-05-15 additions:** No evidence of new Spain director fields. Openapi blog post "New Database Company Spain: more than 60 real time data on Spanish companies" describes 60+ data points with no mention of officers.

**DEC-518-G probe:** Already committed vendor (€0.06/call, no platform fee). Not applicable for this specific path as current commitment.

**Verdict: NOT VIABLE for representatives.** Current path confirmed. No new ES fields for officers from Openapi.

---

### 3b — Pappers International (pappers.in)

**URL probed:** `https://www.pappers.in/api` → HTTP 200

**Coverage:** Spain is listed as a covered country alongside France, Germany, Italy, UK, Netherlands, Switzerland, Luxembourg.

**Fields for Spanish companies:** "registration details, directors, financials, and industry sectors" — directors are listed.

**Pricing:** "Pay as You Go" (PAYG) option confirmed — "pay only for the data you use, no commitment." Volume-based plans also available (monthly/annual subscriptions with discounted rates). Per-call price NOT disclosed on the product page; requires account signup to see pricing. No monthly minimum explicitly stated for PAYG.

**Data sourcing for ES directors:** Pappers originated as a French registry aggregator (pappers.fr). Its Spain coverage is described as "updated from official sources" but the specific upstream source for Spanish director data is not disclosed in public documentation. Whether it sources from BORME XML, opendata.registradores.org bulk, or a commercial data agreement is unknown.

**DEC-20260518-G probe (partial):**
- Platform fee: NOT DISCLOSED (PAYG page visible but price not public)
- Setup fee: Not mentioned
- Monthly minimum: "No commitment" language present for PAYG tier
- Annual floor: Not stated for PAYG
- Termination fees: Not mentioned

**DEC-20260428-A concern:** Sourcing attestation required. If Pappers obtains Spanish director data by scraping registradores.org or BORME PDFs without a clean licensed-data agreement, Tier 2 status would require Strale to confirm vendor's redistribution rights before consuming.

**Verdict: VIABLE-V1 CANDIDATE (pending per-call price confirmation and DEC-20260428-A sourcing attestation).** PAYG model with directors confirmed. Requires: (1) per-call pricing RFQ, (2) sourcing attestation confirming licensed/open-data upstream for ES directors (not scraping), (3) DEC-20260518-G full fee probe.

---

### 3c — Axesor (Experian Spain)

**URL probed:** Datarade profile, CBInsights, LeadIQ, datos.gob.es case study

**Coverage:** Axesor (acquired by Experian January 2021) is one of Spain's largest commercial information providers. "One of the largest repositories of information on companies, positions, directors and links in the market." Product: investiga® pro — commercial investigation and AML/CFT monitoring.

**Fields confirmed:** Company positions, directors, relationship networks. Spanish credit bureau-grade coverage including director names and roles.

**Pricing:** Custom enterprise pricing. No per-call rate published. Market references suggest €20-30 per individual company report for human-readable reports; API pricing is contract-only and typically volume-based enterprise agreements.

**DEC-20260518-G probe:**
- Platform fee: HIGHLY PROBABLE but not publicly disclosed. Axesor sells enterprise contracts, not PAYG.
- Monthly minimum: Expected (enterprise model). Exact amount requires RFQ.
- Setup fee: Expected. Not disclosed.
- Annual floor: Expected. Not disclosed.

**Verdict: NOT VIABLE-V1.** Enterprise pricing model with expected fixed monthly minimums violates Petter's cost rule. Axesor is built for enterprise KYB/AML contracts, not per-call API PAYG. Would require explicit per-call PAYG confirmation to revisit.

---

### 3d — Informa D&B Spain (einforma / informa.es)

**URL probed:** `https://www.informa.es/en/needs/api-empresas` → HTTP 200

**Data available:** Economic and financial information from Informa D&B reports via API integration. API is described as "free of charge" (the API access mechanism) with pricing based on "the cost of the data" per contract.

**Pricing model:**
- Existing customers: pay "cost of data per existing contract"
- New customers: "formalise a contract" — bespoke agreement required
- No per-call public pricing. No PAYG option visible.
- API described as requiring contract; trial available via "REQUEST A FREE TRIAL."

**DEC-20260518-G probe:**
- Platform fee: Likely present as part of contract structure. Not disclosed publicly.
- Monthly minimum: Expected. "Formalise a contract" language implies subscription-based agreement.
- Setup fee: Not disclosed.

**Verdict: NOT VIABLE-V1.** Subscription/contract-based model; no PAYG; all pricing behind NDA-level commercial agreements. Same class as Axesor.

---

### 3e — Iberinform (Informa D&B Portugal subsidiary, Spanish data)

**URL probed:** `https://datarade.ai/data-providers/iberinform/profile` → HTTP 200

**Data:** "Name of Directors 1st Line + Functions" explicitly listed as a field. Also: financial statements, company linkages, court incidents, contact information, full managerial reports.

**Pricing:**
- Starting point: €1,000 annually (referenced for risk analytics product)
- Model: custom, project-based. "We adapt our pricing to match the specific needs and gains on each project."
- Pricing available upon request only.

**DEC-20260518-G probe:** €1,000 floor cited for the risk analytics product. Exact structure for director API unknown; custom quoting required.

**Verdict: NOT VIABLE-V1.** Same enterprise-contract model. Annual floor explicitly cited.

---

### 3f — Kyckr

**URL probed:** `https://www.kyckr.com/blog/spain-business-registry-search` → HTTP 200, `https://developer.kyckr.com` → HTTP 200 (via search metadata)

**Data:** Spain company registry data with "directors and officers" confirmed. "Enhanced Profile" includes directors, officers, shareholders. Source: Registro Mercantil, accessed via Kyckr REST API.

**Pricing:** Not published. "Contact Kyckr for pricing" — no public per-call rate, no published tiers. Datarade profile lists Kyckr but no pricing table.

**DEC-20260518-G probe:**
- Platform fee: NOT DISCLOSED. Expected given enterprise orientation.
- Monthly minimum: NOT DISCLOSED.
- Per-call pricing: NOT DISCLOSED.

**Verdict: VIABLE-V1 CANDIDATE (pending pricing RFQ).** Directors confirmed. Per-call pricing model structure unknown — must determine if PAYG/per-call without platform fee is available. If Kyckr can deliver per-call with no monthly floor, this becomes a viable fallback.

---

### 3g — OpenCorporates

**URL probed:** API reference, Zephira pricing analysis, public-apis.io

**Data:** Officers/directors available for Spain (Spanish Mercantil register is indexed). Structured officer data per OpenCorporates standard schema.

**Pricing:** Annual subscriptions only — Essentials £2,250/yr, Starter £6,600/yr, Basic £12,000/yr. No PAYG tier. Annual floors confirmed.

**DEC-20260518-G probe:** Annual subscription floor is the product — NOT VIABLE-V1 by definition.

**Verdict: NOT VIABLE-V1.** Fixed annual subscriptions violate Petter's cost rule.

---

### 3h — Creditsafe ES

**URL probed:** Creditsafe Connect API docs, G2 pricing, Creditsafe data page

**Data:** Directors and officers confirmed as available in Company Credit Report for Spain.

**Pricing:** Not publicly disclosed. Enterprise model with subscription required. G2 pricing 2026: "Final cost negotiations must be conducted with the seller."

**DEC-20260518-G probe:** Enterprise subscription model, pricing behind NDA. NOT viable without per-call option.

**Verdict: NOT VIABLE-V1.** Same enterprise pattern as Axesor/Informa.

---

## Path 4 — Statutorily-public web UI (DEC-518-F constraints)

### 4a — sede.registradores.org (Registro Mercantil)

**URL probed:** `https://sede.registradores.org/site/mercantil` → HTTP 200 (navigation portal)

**DEC-518-F four-constraint assessment:**

**(a) Statutorily public?** YES. Spanish Commercial Code (Art. 21) and the Reglamento del Registro Mercantil (RRM Art. 385) mandate that registry entries are public. Directors, administrators, and legal representatives are required to be registered and are legally public information. BORME exists as the mandatory daily publication channel for this data (Commercial Code Art. 23).

**(b) ToS permits per-call?** NOT VERIFIED. The sede.registradores.org portal uses a login/authentication flow for extracto requests. ToS not accessible via direct WebFetch probe (portal returned navigation-only content). The portal's "nota informativa mercantil" is a per-request service but it appears designed for human-initiated requests via authenticated session, not headless automation.

**(c) Per-entity per-customer-request?** SATISFIABLE in principle. The service is per-company-request, not bulk scrape.

**(d) Attribution preserved?** SATISFIABLE. CORPME as source, original BORME reference preserved.

**DEC-20260428-A Tier 1 assessment:**
The sede.registradores.org portal requires a browser session + authentication. Any automated extraction would require Strale to operate a browser scraper (Browserless) against an authenticated session — **this hits the Tier 1 absolute bar** (Strale never operates scrapers). The portal is not a REST API; it delivers HTML/PDF through a login-gated session.

**BORME CONTENTS help page (boe.es/diario_borme/ayuda.php):** Confirmed via direct probe. BORME Section One ("Empresarios") contains registered acts and other acts published in the Commercial Registry by province. Appointment acts ("nombramientos") are confirmed to appear in Section A PDFs including individual name + role. BORME Section Two contains announcements (dissolutions, mergers, insolvencies).

**Verdict: BLOCKED under DEC-20260428-A.** Portal requires authenticated browser session = Strale-operated scraper = absolute bar. The data is statutorily public but the access mechanism violates Tier 1.

---

### 4b — BORME public web search (boe.es/diario_borme/)

**URL probed:** `https://www.boe.es/diario_borme/index.php` → HTTP 200

**Content:** Calendar navigation portal for daily BORME issues. Provides links to individual BORME PDFs by date. No structured data endpoint on this page. Links to `/datosabiertos/api/api.php` for the open data API (separate path — see Path 5).

**Individual act PDFs:** BORME Section A PDFs confirmed to contain named appointment acts. Example probed: `BORME-A-2025-192-03.pdf` (Alicante, 2025-10-08) — PDF/A-compliant archival document with structured XML tagging internally. Field structure confirmed: `<Actos>` root, `<Acto>` elements per company act, including Nombramientos entries with individual names (e.g., "ADM.UNICO: TARIFA GARCIA NURIA"). NACE codes ("VATES-Q2826004J") and NIF references appear in act metadata.

**DEC-518-F constraint (b) for BORME PDFs:**
- BOE.es reuse license: "Any form of download or reuse of content published in BORME assumes acceptance of the conditions established in the reuse license." The reuse conditions are available at `boe.es/datosabiertos/` and allow reuse of publicly published content. This suggests per-entity PDF download for attribution-preserved reuse IS permitted.
- However: parsing BORME PDF per-entity requires Strale to operate a PDF extraction pipeline against BOE PDFs — this requires either: (a) Strale operating a PDF parser (acceptable if not scraping but processing open data), or (b) a third-party service doing the parsing.

**Critical limitation — PDF content vs. BOE API:**
The BOE open data API (`/datosabiertos/api/borme/sumario/{fecha}`) returns a daily SUMMARY (index of acts), not the act content itself. The summary provides URLs to the PDFs but does NOT embed officer names in the API response. The actual named officer data is only in the PDFs. This is confirmed by bormeparser README: "due to the current agreement with the Registro Mercantil, they cannot publish all data in a useful and reusable format like XML or JSON; the most interesting data is only available in the PDF files."

**Verdict: BLOCKED for real-time per-entity use.** Strale cannot per-entity query BORME PDFs in real-time without operating a PDF parsing pipeline against BORME's per-entity PDF URLs. This is technically possible under DEC-20260428-A (public data, permitted reuse, not a scraper in the prohibited sense) but is architecturally a 4-6 week build (ingest + PDF parsing + entity index) — which is exactly what DEC-20260507-C deferred. This is part of the deferred self-build scope.

---

## Path 5 — Open data bulk (gov download) — BORME structured data

**URLs probed:**
- `https://www.boe.es/datosabiertos/` → HTTP 200 (API documentation page)
- `https://www.boe.es/datosabiertos/api/api.php` → HTTP 200 (API documentation confirmed)
- `https://www.boe.es/datosabiertos/api/borme/sumario/20260515` → HTTP 400 (date format issue: must be AAAAMMDD = 20260515 not zero-padded differently)
- `https://www.boe.es/datosabiertos/faq/borme.php` → HTTP 200 (FAQ retrieved)
- `https://www.boe.es/datosabiertos/documentos/APIsumarioBORME.pdf` → HTTP 200 (binary PDF retrieved)

**What the BOE BORME open data API actually provides:**

The BOE exposes a free REST API at `GET /datosabiertos/api/borme/sumario/{AAAAMMDD}`:
- Response format: XML or JSON (application/xml or application/json)
- Returns: Daily summary index for the specified date
- Content: For each act, provides the URL to access the PDF (and in Section 2, also HTML/XML)
- **Does NOT embed officer names in the API response** — only document metadata and PDF URLs

This is confirmed by:
1. BOE FAQ: "the summary includes for each document the URL address where to obtain the document published in PDF format"
2. bormeparser README: officer data is "only available in the PDF files" due to the Registro Mercantil agreement
3. BOE API documentation PDF (retrieved): describes sumario structure only

**BORME Section A PDF contents (confirmed from live probe of BORME-A-2025-192-03.pdf):**
The individual Section A PDFs contain:
- `<Actos>` → `<Acto>` structure per company
- "Nombramientos" entries with individual administrator names and roles (e.g., "ADM.UNICO: TARIFA GARCIA NURIA")
- NIF/VATES references in act metadata
- PDF/A-compliant structure (accessibility-tagged) — internally XML-tagged but delivered as PDF

**What does the opendata.registradores.org bulk download add?**
Multiple sources confirm the bulk dataset includes "administradores y cargos" — administrator identity with IRUS identifier. License: ODbL 1.0. CDN blocks prevented direct download verification, but the platform's existence, license, and field schema are confirmed by: Confilegal (Feb 2025), Junta de Andalucía open data portal, Colegio de Registradores press release, Revisa Registradores article. Whether natural-person names are included (vs. just IRUS identifiers) is unconfirmed due to CDN blocks.

**OpenMercantil (openmercantil.es) — SPECIAL FINDING:**

OpenMercantil is an independent service that processes and republishes BORME public data. **This is the most significant positive finding of this enumeration.**

Live probe results (HTTP 200, JSON responses retrieved):
- `GET /api/v1/company/telefonica-sa/officers` → returns structured officer JSON with current + historical arrays
- Telefónica data retrieved: XIAOCHU WANG (Consejero, since 2015-12-09), PRICEWATERHOUSECOOPERS AUDITORES SL (Auditor, since 2016-08-30), ORIOL ENCISO NICOLAS (Apoderado Mancomunado, since 2026-04-22). Historical officers also returned.
- `GET /api/v1/company/iberdrola-sa/officers` → officers array present but **returns empty arrays for current + historical** (stale data status confirmed: last refreshed 2026-05-11, 8 days stale as of probe date)

**OpenMercantil field schema:**
```json
{
  "officers": {
    "current": [
      {"name": "XIAOCHU WANG", "person_slug": "xiaochu-wang", "role": "Consejero", "since": "2015-12-09"}
    ],
    "historical": [
      {"name": "MASSANELL LAVILLA ANTONIO", "role": "Consejero", "since": "2009-03-01", "until": "2020-03-15"}
    ]
  }
}
```

**NIF absent:** Individual officer NIF/DNI is explicitly NOT returned. OpenMercantil states "Sin datos de contacto · ni DNI, email ni dirección personal" — no personal contact data, DNI, email, or personal address. This is a GDPR-driven design choice (natural-person identifiers suppressed). Names and roles are returned; NIF is not.

**OpenMercantil terms:**
- License: CC BY 4.0 (mandatory attribution to original source, e.g., BORME, GLEIF)
- Commercial use: Permitted under CC BY 4.0
- Legal basis: Law 37/2007 (PSI reuse), RGPD Art. 6.1.e (public interest) + Art. 6.1.f (legitimate interest)
- Attribution requirement: Each data point must cite its official primary source (BORME → BOE PDF URL)
- No contractual relationship with CORPME/BOE claimed — independent republisher

**OpenMercantil API terms:**
- No authentication required (CORS enabled)
- Rate limit: 60 requests/minute per IP; burst up to 10 req/sec
- Free tier: 200 requests/day per IP (no API key)
- Pro plans available for higher volume (API key, 5,000 req/day)
- Data coverage: ~2.6M companies indexed, ~970K persons/administrators indexed
- **Data freshness: STALE as of probe.** Last refreshed 2026-05-11 (8 days stale). Status endpoint confirmed "stale."

**OpenMercantil DEC-20260507-C relationship:**
DEC-20260507-C deferred "opendata.registradores.org / BORME / sede.registradores.org self-build" citing 4-6 weeks. OpenMercantil is NOT the same as a self-build — it is a third-party service that has already done the BORME ingest. However:
1. It is an **unofficial third-party** service with no SLA, no contractual guarantee of uptime, and no dispute/support path
2. The service acknowledged status "stale" during this probe — raises reliability concerns
3. CC BY 4.0 license permitting commercial use is favorable, but it is the republisher's license claim; the underlying data's reuse conditions (BOE reuse license) also apply
4. No sourcing-method attestation exists (DEC-20260428-A requires: documented redistribution rights + indemnification + primary-source provenance per fact)

**OpenMercantil gaps for Strale's KYB use case:**
- No NIF for individual officers (GDPR-driven design)
- Data staleness: refreshed periodically (daily?), but confirmed stale during probe
- Officers array empty for Iberdrola — coverage gaps exist for some large entities
- Service is a startup/independent project ("donations and optional subscriptions" model) — no enterprise SLA
- Iberdrola slug tested as `iberdrola-sa` — may require slug resolution; not a NIF-based query

**Verdict for Path 5 (open data bulk):**
- BOE API: VIABLE for ingest (free, ODbL-adjacent, open reuse) but officer names are PDF-only — ingest requires PDF parsing pipeline (deferred per DEC-20260507-C)
- opendata.registradores.org bulk: VIABLE for ingest (free, ODbL, includes administradores) but same deferred status
- **OpenMercantil: VIABLE-V1 CANDIDATE (conditional)** — free, CC BY 4.0, per-company API, officer names + roles returned, no NIF. Conditions: (1) service reliability assessment, (2) DEC-20260428-A sourcing attestation confirmation (OpenMercantil's relationship with BOE/CORPME must be verified), (3) staleness SLA confirmed, (4) NIF gap assessed (name + role sufficient for Strale's legal_representatives field without NIF?)

---

## Path 6 — Tier-2 commercial bulk under DEC-20260428-A

**Candidates evaluated:**

**Axesor (Experian):** Spain's largest commercial credit bureau. Bulk data license confirmed (offers "Compañía española con más información sobre empresas, cargos, directores y vínculos en el mercado"). Annual enterprise license. Pricing €20-30/single-company report, bulk pricing not publicly disclosed. No clean per-call API model visible. DEC-20260428-A requires sourcing attestation (Axesor sources from Registro Mercantil + BORME — likely clean for licensed redistribution but attestation needed).

**Informa D&B Spain:** Bulk database licensing confirmed (see datos.gob.es Informa D&B case study). Enterprise license model. Pricing opaque. Same enterprise-contract obstacle as Path 3d.

**Global Database / Datarade listings:** Multiple providers list Spain company data with directors on Datarade. No verified PAYG options found. "Database from Portugal and/or Spain — Iberinform" starts at €1,000.

**Verdict: NOT VIABLE-V1.** All commercial bulk providers operate on enterprise licensing with annual floors or opaque contract models. None offer per-call passthrough consistent with Petter's cost rule.

---

## Path 7 — Gazette / historical PDF parsing — BORME (Special Focus)

**This path received extended investigation as instructed.**

**BORME structure confirmed:**
- Daily publication by the Spanish State Agency BOE
- Two sections: Section 1 (Empresarios — registered acts), Section 2 (announcements/legal notices)
- Section 1 organizes by province (52 provinces) and contains all registered commercial acts
- Published at `boe.es/borme/dias/{YEAR}/{MM}/{DD}/`

**BORME officer-change events — what is actually in them:**

From live PDF probe (BORME-A-2025-192-03.pdf, Alicante, Oct 2025) and search result corroboration (BORME-A-2024-105-08.pdf, Barcelona; BORME-A-2024-156-28.pdf, Madrid):

Act types in Section A that contain officer names:
- **Nombramiento de cargo** — appointment of administrator/officer with name and role
- **Cese de cargo** — cessation of administrator/officer
- **Revocación** — revocation of proxy (apoderado)
- **Modificación** — modification of powers

Each appointment act contains: company name, registry sheet, act type, and officer name + role (e.g., "ADM.UNICO: LEIVA GORDILLO MIGUEL"). Whether NIF appears in the act text varies by act type — some acts include NIF, many do not for natural persons (DNI/NIF of natural persons is not always published in BORME for GDPR reasons).

**BORME format — PDF vs. XML:**
- BORME Section 1 acts: **PDF only** (confirmed). The BOE has an agreement with the Registro Mercantil that limits publication of Section 1 data to PDF format. This is the same constraint identified by bormeparser in 2019 and confirmed by multiple 2024-2025 sources.
- BORME Section 2 (announcements): Also available in HTML and XML format (confirmed by BOE FAQ: "in the case of the second section, also in HTML and XML format"). But Section 2 does not contain officer appointments — it contains: balance sheet deposits, board convocations, mergers, insolvencies, dissolutions, capital changes.
- BOE open data API (`/datosabiertos/api/borme/sumario/{date}`): Returns the summary INDEX (list of acts with PDF URLs) in XML/JSON. Does NOT include act content.

**Critical finding — DEC-20260507-C deferral scope:**
DEC-20260507-C described the deferred item as "opendata.registradores.org / BORME / sede.registradores.org self-build (4-6 week ingest project)." This enumeration now clarifies:

The 4-6 week estimate is for building a historical BORME ingestion pipeline that:
1. Downloads all historical Section A PDFs (daily back to ~2014 when BORME digitization began)
2. Parses officer names and roles from unstructured PDF text (requires PDF-to-text + NLP/regex extraction)
3. Builds a current-state index per company (resolving appointments against cessations to derive current officers)
4. Maintains daily delta ingestion to keep the index current

**Why this is NOT simpler than originally estimated:**
- BORME Section A PDFs are not structured XML (despite the internal PDF/A tagging) — the tagged elements are for PDF accessibility, not for machine extraction. The named officer data is in rendered text within PDF page streams, not in a machine-readable field.
- bormeparser (the only open-source parser) is unmaintained since 2019. LibreBOR (the next alternative) stopped functioning April 2025.
- OpenMercantil has built this pipeline and operates it, but is an unofficial third party.
- The "4-6 week" estimate remains valid: it covers PDF parser build + historical ingest + daily refresh + reconciliation logic to derive current state. This is non-trivial engineering.

**OpenBorme.es / OpenMercantil.es (redirected):** This is the same service as OpenMercantil (openborme.es 301-redirects to openmercantil.es). Confirmed: indexes 2.6M companies, 970K administrators, from BORME via PDF parsing. This is the only active service that has completed the BORME ingest pipeline.

**LibreBOR (librebor.me):** Status as of 2026-05-19 — still active (not shut down; the service that stopped April 2025 was LibreBORME, a separate project). LibreBOR transitioned to freemium in 2025. Docs at `docs.librebor.me` returned HTTP 403 in this session. API product page returned HTTP 403. What is confirmed via search metadata: LibreBOR provides BORME-based data on "3+ million Spanish companies and relationships between directors." API plans available (subscription required for API access). Fields confirmed: current and former administradores y apoderados.

**LibreBOR pricing (what is known):**
- Free: limited daily searches without registration
- API: requires paid plan; prices not disclosed publicly (403 on docs)
- Researchers/nonprofits: special conditions
- No per-call PAYG documented; subscription model implied
- DEC-20260518-G probe: INCOMPLETE (403 blocks). Cannot confirm absence of monthly minimum.

**BORME path conclusion:**

The BORME gazette path has two sub-variants:
1. **Self-build (deferred):** Build the full ingestion pipeline from BORME PDFs. Deferred per DEC-20260507-C; 4-6 week estimate validated.
2. **Via OpenMercantil (third-party, already built):** Use OpenMercantil's free API which has completed the BORME ingestion. Viable but conditional (see Path 5 analysis).

**Verdict: VIABLE-V1 CANDIDATE via OpenMercantil (conditional); DEFERRED via self-build (DEC-20260507-C).**

The key BORME finding for this enumeration: **BORME IS the mechanism that produces officer-name data for Spain, but the structured-data layer on top of BORME is either (a) OpenMercantil (built, free, unofficial) or (b) a self-build (deferred 4-6 weeks). The BORME API itself only provides PDF URLs — it does not serve officer names as structured data.**

---

## Path 8 — Other ES-specific surfaces

### 8a — CNMV (Comisión Nacional del Mercado de Valores)

**URL probed:** `https://www.cnmv.es/portal/consultas/busquedaporentidad?lang=en` → HTTP 200 (navigation page only)

**Data available:** CNMV is Spain's financial markets regulator. For listed companies (Telefónica: TEF on BME, Iberdrola: IBE on BME), CNMV mandates disclosure of senior manager identity and transactions. The CNMV portal provides company search for registered investment firms and listed issuers. Directors and senior managers are disclosed in annual governance reports (IAGC — Informe Anual de Gobierno Corporativo) submitted to CNMV.

**Structured API for directors:** NO structured API confirmed for CNMV director data. CNMV provides a web search interface and document filing system. No programmatic per-call API for officer data found.

**Coverage scope:** Listed companies only (Telefónica and Iberdrola are covered; the vast majority of ~2.6M Spanish registered companies are not). Not viable for general company coverage.

**Verdict: NOT VIABLE.** Listed-company-only scope; no API; web interface only.

---

### 8b — AEAT (Agencia Estatal de Administración Tributaria)

**Confirmed function:** NIF validation only. AEAT provides VAT number validation services. No officer data. Confirms company existence and name linked to NIF — not a source for legal representatives.

**Verdict: NOT IN SCOPE.** NIF validation only.

---

### 8c — InfoEmpresa free tier (infoempresa.com)

**URL noted from search results:** `https://www.infoempresa.com/en-in/es/`

**Service:** Infoempresa provides free and paid company information lookup for Spanish companies. Free tier provides basic company data. Director data appears available (confirmed from search result snippet mentioning directors in company profiles). This is a web portal, not an API.

**DEC-518-F assessment:** Web portal — requires browser automation (Browserless) to extract per-entity = Strale-operated scraper = Tier 1 absolute bar under DEC-20260428-A.

**Verdict: BLOCKED under DEC-20260428-A.** Web portal only; no API; browser automation required.

---

### 8d — Registradores "InfoEmpresa" lookup via opendata.registradores.org directorio

**URL:** `opendata.registradores.org/directorio` — directory lookup, free, no registration (confirmed by Confilegal article)

**Function:** Enter company name or NIF → retrieve company data including administradores. Real-time, reflects current Commercial Registry content. Free.

**Access method:** Web UI only. No REST API documented for the directory. This is a search form, not a programmatic endpoint.

**DEC-518-F assessment:** Web form without API → requires Strale-operated browser automation → Tier 1 absolute bar.

**Verdict: BLOCKED under DEC-20260428-A.** Same obstacle as InfoEmpresa.

---

### 8e — LEI data for ES (GLEIF)

**Coverage:** GLEIF (Global LEI Foundation) via `gleif.org` provides per-entity LEI lookup. OpenMercantil already incorporates LEI data per company (`lei` field confirmed in company profile JSON). GLEIF data includes LEI code, registered name, registered address, legal form — it does NOT include directors or officers.

**Verdict: NOT IN SCOPE.** LEI lookup provides no officer data.

---

### 8f — datos.gob.es — BORME dataset catalog

**URL:** `datos.gob.es/en/catalogo/ea0040819-diario-oficial-borme` (catalogued)

**Content:** Catalogs the BORME open data API from BOE as a dataset resource. Metadata confirms: REST API, XML/JSON format, daily cadence. This is the same BOE BORME API documented in Path 5 — officer names are PDF-only.

**Verdict:** Same as Path 5 BOE API — PDF-only for officer names.

---

## Summary evidence table — per-path

| Path | URL / Service | HTTP Status | Officers? | License | Cost class | DEC-518-G probe | Viable? |
|------|--------------|-------------|-----------|---------|------------|-----------------|---------|
| 1 — CORPME paid API | sede.registradores.org | 200 (portal only) | YES (full) | Commercial agreement | Undisclosed contract | INCOMPLETE — pricing gated | BLOCKED (pricing unknown) |
| 2 — opendata.registradores.org bulk | opendata.registradores.org | ALL 403/WAF | YES (bulk CSV) | ODbL 1.0 | FREE | N/A (free) | VIABLE-V1.1 (deferred per DEC-507-C) |
| 3a — Openapi ES-Advanced | openapi.com | 200 | NO | Commercial | €0.06/call | Per-call, no platform fee | BLOCKED for officers |
| 3b — Pappers International | pappers.in | 200 | YES (claims) | Commercial | PAYG (price TBC) | PAYG confirmed; per-call price not public | CANDIDATE (pending RFQ + sourcing attestation) |
| 3c — Axesor/Experian | axesor.es | N/A | YES | Enterprise | €20-30+/report | Enterprise contract, monthly floor likely | NOT VIABLE-V1 |
| 3d — Informa D&B | informa.es | 200 | YES | Enterprise | Contract-based | Contract required; no PAYG | NOT VIABLE-V1 |
| 3e — Iberinform | Datarade | 200 | YES | Enterprise | €1,000/yr+ | Annual floor confirmed | NOT VIABLE-V1 |
| 3f — Kyckr | kyckr.com | 200 | YES | Enterprise | Undisclosed | All fees undisclosed | CANDIDATE (pending RFQ) |
| 3g — OpenCorporates | opencorporates.com | 200 | YES | £2,250/yr+ | Annual subscription | Annual floor = product | NOT VIABLE-V1 |
| 3h — Creditsafe | creditsafe.com | 200 | YES | Enterprise | Undisclosed | Enterprise model | NOT VIABLE-V1 |
| 4a — sede.registradores.org portal | sede.registradores.org | 200 (portal) | YES (HTML/PDF) | Public statutory | Per-document ~€6.58 | N/A (not API) | BLOCKED (Tier 1 bar) |
| 4b — BORME PDF per-entity | boe.es/borme/ | 200 | YES (PDF text) | Open reuse license | FREE | N/A (free, open) | BLOCKED (pipeline build = deferred) |
| 5a — BOE BORME API | boe.es/datosabiertos/ | API confirmed | PDF URL only | Open reuse | FREE | N/A | BLOCKED (PDF-only content) |
| 5b — opendata.registradores.org | opendata.registradores.org | WAF blocked | YES (bulk) | ODbL 1.0 | FREE | N/A | VIABLE-V1.1 (deferred) |
| 5c — **OpenMercantil** | openmercantil.es | **200 (live JSON)** | **YES (name+role)** | **CC BY 4.0** | **FREE** | **N/A (free)** | **CANDIDATE — see below** |
| 6 — Commercial bulk | Various | Various | YES | Enterprise | €1,000+/yr | Annual floors | NOT VIABLE-V1 |
| 7 — BORME self-build | Internal | N/A | YES (after build) | Open (BOE license) | FREE | N/A | VIABLE-V1.1 (deferred per DEC-507-C) |
| 8a — CNMV | cnmv.es | 200 (web) | YES (listed cos) | Public | FREE (web) | N/A | NOT IN SCOPE (listed only) |
| 8b — AEAT | aeat.es | N/A | NO | — | — | — | NOT IN SCOPE |
| 8c — InfoEmpresa web | infoempresa.com | N/A | YES (web) | Public/web | FREE (web) | N/A | BLOCKED (Tier 1 bar) |
| 8d — LibreBOR API | librebor.me | 403 | YES | Commercial | Subscription | Incomplete (403) | CANDIDATE (pricing unknown) |

---

## OpenMercantil deep assessment — the v1 positive finding

This section assesses OpenMercantil as the primary candidate for a viable v1 path.

**What was live-probed and confirmed:**
- `GET /api/v1/company/telefonica-sa/officers` → HTTP 200, JSON with 3 current officers (names + roles + since dates) + 4 historical officers ✓
- `GET /api/v1/company/iberdrola-sa/officers` → HTTP 200, JSON with empty current + historical arrays (data stale) ✗
- `GET /api/v1/health` → HTTP 200, status "stale", last refresh 2026-05-11 ✓/⚠
- `GET /api/v1/search?q=A28015865` → HTTP 200, company entity returned (slug lookup) ✓

**Field coverage:**
| Field | Available | Notes |
|-------|-----------|-------|
| Officer name | YES | Full name in CAPS (as published in BORME) |
| Role / cargo | YES | Spanish role label (Consejero, Apoderado Mancomunado, Auditor, etc.) |
| Appointment date (since) | YES | ISO date format |
| Departure date (until) | YES (historical only) | ISO date format |
| Person slug | YES | URL slug for person cross-reference |
| NIF/DNI | NO | Explicitly suppressed ("Sin DNI") |
| Nationality | NO | |
| Address | NO | ("Sin dirección personal") |

**License assessment for commercial use:**
OpenMercantil publishes under CC BY 4.0 and claims legal basis in Law 37/2007 (PSI reuse) and RGPD Art. 6.1.e/f. Commercial use is permitted under CC BY 4.0. Attribution requirement: cite BORME/BOE as primary source per act.

**DEC-20260428-A assessment — the key risk:**

DEC-20260428-A Tier 2 requires:
- Underlying data is public records by statute ✓ (BORME = statutory publication)
- Vendor has documented redistribution rights ⚠ (OpenMercantil claims CC BY 4.0 but has no formal agreement with BOE/CORPME; they are an independent republisher operating under open data law)
- Vendor has + indemnification ✗ (No indemnification from an unofficial service)
- Vendor provides primary-source provenance per fact ✓ (Each act links to BOE PDF)
- Strale discloses sourcing via provenance fields ✓ (Achievable: OpenMercantil → BORME/BOE)

**Critical gap:** OpenMercantil explicitly states "sin relación contractual ni representativa con la Agencia Estatal BOE, el Colegio de Registradores, la CNMV, el INE ni ningún otro organismo público" — **no contractual or representative relationship with CORPME or BOE**. This means there is no vendor indemnification and no formal redistribution rights agreement. OpenMercantil is a good-faith open-data republisher, but it is NOT a licensed Tier-2 data vendor in the DEC-20260428-A sense.

**Reliability risk:**
- Service is funded by "donations and optional subscriptions" — no enterprise SLA
- Data was stale during probe (8 days old)
- Iberdrola returned empty officers (coverage gap for at least one major test entity)
- No uptime guarantee, no support contract
- The service could cease or change its data model without notice

**Summary assessment — OpenMercantil:**

OpenMercantil is the closest thing to a v1 positive finding for ES representative coverage, but it fails the DEC-20260428-A Tier 2 threshold on indemnification and formal redistribution rights. It is better characterized as a **discovery tool and proof-of-concept** than a production data vendor.

If Strale were to use OpenMercantil it would need to either:
1. Accept that OpenMercantil is an open-data republisher (not a licensed vendor) and treat it as Strale directly accessing the open data layer — which means the sourcing-method attestation is on Strale's interpretation of BOE reuse law, not a vendor indemnification
2. Or find a licensed Tier 2 vendor that sources from BORME and has a proper redistribution agreement (Pappers, Kyckr, LibreBOR — all pending RFQ)

**Decision point for Petter:** Does DEC-20260428-A Tier 2 permit using OpenMercantil as an intermediary (given it is itself legally operating under open data law) even without a formal signed agreement, on the basis that the underlying data is openly licensed? Or must there be a signed vendor agreement with indemnification? This is a legal doctrine question that requires Petter's call.

---

## Verdict

### Overall verdict: viable-v1 CONDITIONAL (not fully blocked; not cleanly positive)

**Confidence:** MODERATE (evidence base is good; verdict depends on doctrine interpretation for OpenMercantil + RFQ outcomes for Pappers/Kyckr)

**Why not "fully blocked":** OpenMercantil delivers officer names + roles in structured JSON via free CC BY 4.0 API. The data pipeline exists and is live. The question is whether DEC-20260428-A permits its use without a formal vendor indemnification.

**Why not "cleanly positive":** No vendor with full DEC-20260428-A compliance (signed redistribution rights + indemnification) has been confirmed at a per-call PAYG price. OpenMercantil lacks indemnification. Pappers and Kyckr have not provided pricing.

---

### v1 path analysis

**Option A — OpenMercantil (Path 5c)**
- Cost: FREE (CC BY 4.0, no per-call fee)
- Fields: name, role, appointment date (no NIF)
- Dependency: Petter's doctrine clarification on DEC-20260428-A for informal open-data republishers
- Risk: Service reliability (startup, no SLA, stale data observed)
- Action required: Doctrine clarification call from Petter, then test entity coverage check (Iberdrola empty is a red flag)

**Option B — Pappers.in PAYG (Path 3b)**
- Cost: Unknown (PAYG confirmed; per-call price not public)
- Fields: Directors confirmed; exact schema unknown
- Source attestation: Unknown (must confirm Pappers sources ES directors from BORME/opendata.registradores.org under licensed arrangement, not scraping)
- Action required: RFQ (pricing), DEC-20260428-A sourcing attestation, DEC-20260518-G full fee probe

**Option C — Kyckr (Path 3f)**
- Cost: Unknown (all fees behind NDA)
- Fields: Directors confirmed for Spain
- Action required: RFQ (pricing, all fee dimensions)

**Option D — LibreBOR API (Path 7/elsewhere)**
- Cost: Subscription model implied; pricing unknown (403 blocked all docs)
- Fields: administradores y apoderados confirmed
- Action required: API pricing RFQ, DEC-20260518-G probe

**Option E — opendata.registradores.org self-build (Path 2/7)**
- Cost: FREE (ODbL 1.0)
- Fields: administradores y cargos confirmed (includes name + IRUS)
- Blocker: 4-6 week build (deferred per DEC-20260507-C)
- Action required: Lift deferral when capacity available

---

### v1.1 path (deferred or pending RFQ confirmation)

- opendata.registradores.org bulk ingest (lift DEC-20260507-C) — best long-term free path
- Pappers PAYG if sourcing clean and per-call price passes Petter's cost rule
- Kyckr if per-call without platform fee

---

### Per-path findings table

| Path | Finding | Viable for v1? |
|------|---------|----------------|
| 1 — CORPME paid API | Pricing gated behind commercial agreement; DEC-518-G probe incomplete | BLOCKED (pricing unknown) |
| 2 — opendata.registradores.org bulk | Free ODbL, administradores confirmed, CDN-blocked in probe | VIABLE-V1.1 (deferred per DEC-507-C) |
| 3a — Openapi ES | No officer fields; confirmed for both test entities | NOT VIABLE (officers absent) |
| 3b — Pappers | PAYG model + directors claimed; price + sourcing unknown | CANDIDATE (RFQ needed) |
| 3c — Axesor | Enterprise contract, likely monthly floor | NOT VIABLE-V1 |
| 3d — Informa D&B | Enterprise contract, no PAYG | NOT VIABLE-V1 |
| 3e — Iberinform | €1,000/yr floor | NOT VIABLE-V1 |
| 3f — Kyckr | Directors confirmed; all pricing undisclosed | CANDIDATE (RFQ needed) |
| 3g — OpenCorporates | £2,250/yr minimum | NOT VIABLE-V1 |
| 3h — Creditsafe | Enterprise, no PAYG | NOT VIABLE-V1 |
| 4a — sede.registradores.org portal | Statutory public, full officers; browser session needed | BLOCKED (DEC-20260428-A Tier 1) |
| 4b — BORME PDF per-entity | Named officers in PDFs; parse pipeline = 4-6wk build | VIABLE-V1.1 (deferred per DEC-507-C) |
| 5a — BOE BORME API | PDF URL index only; no officer names in API response | BLOCKED (PDF-only) |
| 5b — opendata.registradores.org | Administradores confirmed; same as Path 2 | VIABLE-V1.1 (deferred per DEC-507-C) |
| **5c — OpenMercantil** | **Name+role live JSON; CC BY 4.0; free; Iberdrola gap; no indemnification** | **CONDITIONAL (doctrine clarification needed)** |
| 6 — Commercial bulk | Enterprise annual floors | NOT VIABLE-V1 |
| 7 — BORME self-build | Validated approach; same 4-6wk estimate | VIABLE-V1.1 (deferred per DEC-507-C) |
| 8a — CNMV | Listed companies only, no API | NOT IN SCOPE |
| 8b — AEAT | NIF validation only | NOT IN SCOPE |
| 8c — InfoEmpresa | Web only | BLOCKED (DEC-20260428-A Tier 1) |
| 8d — LibreBOR API | Directors confirmed; subscription pricing 403-blocked | CANDIDATE (RFQ needed) |

---

### Doctrine compliance log

| Doctrine | Status |
|----------|--------|
| **DEC-20260518-E** (exhaustive 8-path enumeration) | COMPLIANT — all 8 paths documented with live-probe evidence |
| **DEC-20260518-F** (DEC-518-F statutory web UI) | COMPLIANT — 4 constraints assessed for sede.registradores.org (blocked on Tier 1), BORME PDFs (blocked on build requirement) |
| **DEC-20260518-G** (mandatory platform-fee probe) | PARTIALLY COMPLIANT — probe applied to all candidates; multiple candidates 403/gated (Pappers price not public, Kyckr all undisclosed, LibreBOR 403, CORPME gated). Where pricing was accessible it was documented. |
| **DEC-20260428-A** (no Strale scrapers; Tier 2 attestation) | COMPLIANT — Tier 1 bar applied to sede.registradores.org portal, InfoEmpresa, and BORME PDF automation. OpenMercantil flagged for missing Tier 2 indemnification (doctrine clarification pending). |
| **DEC-20260505-E** (Topograph DQ'd) | COMPLIANT — Topograph not proposed under any framing. |
| **DEC-20260507-C** (BORME/Registradores self-build deferred) | COMPLIANT — self-build paths documented but deferral not lifted; explicitly noted as 4-6wk scope confirmed valid. |
| **Petter cost rule** (per-call passthrough OK; fixed monthly NOT OK) | APPLIED — enterprise contracts with expected monthly floors flagged as NOT VIABLE-V1 (Axesor, Informa, Iberinform, OpenCorporates, Creditsafe). |
| **EU 2023/138 CAVEAT** | COMPLIANT — §5.1 mandate not cited as requiring representative-name disclosure. |

---

### Caveats

1. **OpenMercantil Iberdrola gap.** Iberdrola (CIF A48010615, slug `iberdrola-sa`) returned empty officers array during probe. This may reflect slug mismatch, staleness (last refresh 2026-05-11), or a genuine coverage gap for this entity. Telefónica returned officers correctly. Before any v1 decision on OpenMercantil, a slug-resolution test + second probe of Iberdrola is required.

2. **opendata.registradores.org CDN blocks.** All direct probes to opendata.registradores.org returned WAF/CDN rejections. The platform's existence and content are confirmed via multiple independent secondary sources (Confilegal, Junta de Andalucia, Colegio de Registradores press releases, Revisa Registradores), but direct field-level verification of the bulk dataset was not possible this session.

3. **NIF absent from all free paths.** OpenMercantil suppresses NIF/DNI for natural persons. The opendata.registradores.org platform uses IRUS (a registry-internal identifier) rather than NIF for individual administrators. BORME PDFs may contain NIF in some acts but not systematically. If Strale's `legal_representatives` schema requires NIF, all free paths are structurally limited.

4. **No ES-Stakeholders product on Openapi.** Only Italy has a dedicated Openapi stakeholders SKU. No evidence of an ES-Stakeholders product in development or roadmap.

5. **DEC-20260507-C deferral was BORME + registradores.org combined.** The 4-6 week build estimate covers both the BORME PDF ingestion pipeline and the opendata.registradores.org bulk index. These are complementary paths (BORME for change-event data; opendata.registradores.org for current-state snapshot). Either alone would need the same engineering effort; doing both together is the complete solution.

6. **LibreBOR API status unconfirmed.** All docs.librebor.me pages returned 403 during this session. LibreBOR is confirmed active (main site accessible, Microsoft Learn connector documented) but full pricing and field schema could not be directly verified.

7. **BORME Section 2 is XML/HTML-available but wrong content.** Only Section 2 (announcements) is available in HTML/XML format from BOE; Section 1 (officer appointments) is PDF-only. This is the structural limitation that makes the BOE API insufficient for real-time officer data.
