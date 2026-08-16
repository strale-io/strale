# Compass HF Data + Manz AT vendor diligence

**Date:** 2026-05-06
**Author:** CC (research session)
**Branch:** `research/compass-manz-at-2026-05-06`
**Scope:** Public diligence on the two named AT primary candidates (Compass HF Data, Manz) plus identification of additional BMJ-licensed Verrechnungsstellen for AT Counterparty Assurance v1. Email re-poke draft was dropped from this session's scope per Petter direction (Notion Brand & voice page was auth-gated; Rule 10 stop condition triggered).
**Voice check:** N/A. The email draft was dropped; the report itself is internal documentation, not public-facing content. Voice doctrine applies to outbound correspondence and was not exercised here.

---

## 1. Summary

- **Primary recommendation: send the Compass re-poke AND open parallel outreach to auszug.at (Wiener Zeitung Digitale Publikationen) as a real third candidate.** Hold Manz as backup with the SOAP-only onboarding tax flagged. Hold firmafind pending license-chain diligence (NOT on BMJ Verrechnungsstelle list).
- Compass HF Data has a stronger public profile than expected — fully published per-call pricing, REST API with bearer-token auth, named business-development contact (Klaus Heidenreich), nine API families covering Firmenbuch, WiEReG UBO, and compliance. The silence is not because the offering is opaque; it is because Compass is sales-gated incumbent with ERP-customer DNA and no published startup or pre-revenue track. The re-poke can be made meaningfully more targeted using the public material.
- Manz is BMJ-licensed but commercially much darker. Its technical interface is SOAP, pricing is published only as a non-extractable PDF, no public customer logos, no API docs portal. Onboarding tax is real if it ever becomes the primary path.
- The official BMJ list of Verrechnungsstellen contains ten entities. Beyond Compass and Manz, exactly one is API-positioned with publicly transparent commercial terms: auszug.at (Wiener Zeitung Digitale Publikationen GmbH) — official Verrechnungsstelle since 2015, IWG-compliant standardized webservice, 100% transparent pricing per the public marketing.
- One non-VST aggregator (firmafind.at) advertises a startup-friendly REST API at €16.66/month flat-rate, but is NOT on the BMJ list and almost certainly sources via another VST. Tier 2 doctrine (DEC-20260428-A) requires license-chain + redistribution-rights diligence before any commercial use.

---

## 2. Compass HF Data findings

### 2.1 Corporate structure and licensing

- HF Data Datenverarbeitungsgesellschaft m.b.H. is a wholly-owned subsidiary of Compass-Verlag GmbH.
- Compass Group founded 1867 in Vienna as an address-book publisher; ~90 employees today.
- HF Data is described in BMJ public materials and Compass's own marketing as "the largest Austrian clearing office" (Verrechnungsstelle) for queries to the Republic of Austria's official databases: Firmenbuch, Grundbuch, GISA, ZMR.
- BMJ Verrechnungsstelle status confirmed by the official list at justiz.gv.at: HF Data is listed with `https://www.firmenbuchgrundbuch.at` and `https://www.austrian-registers.com` as entry points. Subcontractor: DataScience Service GmbH.
- CEO/Managing Director: Hermann Futter (30+ years tenure).

### 2.2 API surface

- Product: Wirtschafts-Compass API at `api.wirtschaftscompass.at`.
- Authentication: bearer token (per-user unique). Sales-gated issuance.
- Default response: JSON. XML and PDF also supported.
- Nine API families published: Business, Persons, Land Register, Register of Residents, Insolvencies, Changelists (daily diffs), Compliance (sanctions + PEP), Archive, Additional Services (VAT verification, contractor liability).
- WiEReG UBO is delivered through the Business API (beneficial-owners-register excerpts).
- No published rate limits.
- No published SLA, uptime number, or sandbox environment.
- No self-serve signup. Onboarding routes through sales contact form, sales@compass.at, or +43 1 981 16-400.

### 2.3 Pricing (fully public)

Per `api.wirtschaftscompass.at/en/prices` — pay-per-use, no minimum commitment stated:

| Product | Per-call price |
|---|---|
| Personal data (basic) | €0.45 |
| Personal data (historic) | €0.10 |
| Personal data (complete with history) | €0.49 |
| Land register basic | €0.45 |
| Land register complete | €0.89 |
| Cadastral data | €0.25–€0.49 |
| Sanction lists | €0.49 |
| PEP checker (search free, detailed) | €2.00 |
| Compliance screening | €8.50 |
| Organigram | €18.00 |
| District courts list | €1.00 |
| Business register excerpt (official fee passthrough) | €4.63–€7.80 + €0.49 service charge |
| Land register excerpt (official fee passthrough) | €4.63 + €0.49 service charge |

Free services advertised: business/person searches, sanction searches, resolver service, document archive retrieval, AGH search, VAT verification.

Marketing language: "Invoicing based on actual use" with "individually compiled services" available for business partners. No standard subscription tier or minimum spend visible.

### 2.4 Customer evidence and positioning

Customer logos surfaced on the Wirtschafts-Compass API homepage:
- BMD Business Software
- Generali Bank
- Oesterreichische Kontrollbank (OeKB)
- 3 Banken IT GmbH
- Winter Versicherungsmakler GmbH
- Multidata Software International
- ARAG SE

Stated integration target: SAP, Microsoft Dynamics, BMD, Mesonic. Heavy ERP/CRM positioning. The customer profile skews to mid-market enterprise compliance/finance teams, not API-first developer platforms.

### 2.5 Reseller, redistribution, embed-and-bill language

**No public language found** anywhere on compass.at, api.wirtschaftscompass.at, or related Compass Group properties addressing API redistribution, reseller agreements, or embed-and-bill arrangements. This is the key open question for Strale's Tier 2 doctrine alignment and is the natural focus of the re-poke.

### 2.6 Named contacts surfaced

- **Klaus Heidenreich** — explicitly named as dedicated contact for custom solutions in the Wirtschafts-Compass API marketing copy.
- **Hermann Futter** — CEO/MD (escalation contact, not BD).
- **office@compass.at** — general office.
- **sales@compass.at** — sales channel.
- **+43 1 981 16-400** — phone line, Mondays–Thursdays 7:30–17:00, Fridays 7:30–15:00.

The 2026-05-04 re-poke should redirect at minimum to Klaus Heidenreich; the original outreach went to a generic channel.

### 2.7 Pre-revenue / startup program

**None published.** No mention of startup pricing, free pre-revenue tier, or partner program for early-stage companies. Strale's pre-revenue framing is unlikely to fit a published Compass program; it has to be negotiated bilaterally.

---

## 3. Manz findings

### 3.1 Corporate structure and licensing

- Legal entity: MANZ'sche Verlags- u Universitätsbuchhandlung GmbH, Johannesgasse 23, 1010 Wien.
- Technical/integration arm: MANZ Solutions GmbH (separate GmbH, same group).
- BMJ Verrechnungsstelle status confirmed by the justiz.gv.at official list: entry point `https://dienste.manz.at/vst/`.
- Long-established Austrian legal/business publishing house; primary customer base is law firms and corporate legal departments.

### 3.2 API surface

- Product: "MANZ Webservice Schnittstelle" on **SOAP** basis (per MANZ Solutions site). No REST API surfaced anywhere public.
- No API documentation portal visible to non-customers.
- Available registers per public materials: Firmenbuch, Grundbuch, Melderegister (ZMR), WiEReG UBO referenced as a service.
- Access portal `dienste.manz.at/vst/` is auth-gated (CAS login).
- Onboarding flow: contact form + sales channel only. No self-serve.

### 3.3 Pricing

- Tariffs published only as a non-extractable PDF: `manz-infodienste-entgeltbestimmungen.pdf`. The PDF body is image-based or compressed-stream, not text-extractable via WebFetch.
- Public marketing describes the model as: court fee passthrough (BMJ schedule) + MANZ processing fee per query.
- No subscription pricing, minimum commitment, or volume discount visible publicly.

### 3.4 Customer evidence and positioning

- No customer logos on Manz Solutions or manz.at firmenbuch product pages.
- Target customer profile: lawyers, in-house legal counsel, corporate legal departments. Not developer-platform-shaped.

### 3.5 Reseller, redistribution, embed-and-bill language

**None published.** Same gap as Compass. Cannot be assessed from public material.

### 3.6 Named contacts surfaced

- **vertrieb@manz.at** — sales.
- **+43 1 531 61-6550** — sales phone.
- **hotline@manz.at** — support.
- **+43 1 531 61-11** — hotline phone.
- **info@manz.at** — Manz Solutions general inbox.
- No named individual surfaced publicly.

### 3.7 Onboarding tax assessment

If Manz becomes the primary path, expected friction is materially higher than Compass on three axes:
1. SOAP integration vs Compass's REST/JSON — non-trivial implementation and operational delta for a Node + Hono stack.
2. No public API docs — every integration question routes through sales/support, slow loop.
3. PDF-only pricing — pricing comparison and forecasting requires a sales conversation per scenario.

---

## 4. Other licensed AT vendor candidates

The official BMJ list at justiz.gv.at names ten Verrechnungsstellen. Beyond Compass HF Data and Manz, the following are the candidates relevant to Strale's KYB-API redistribution use case.

### 4.1 auszug.at — Wiener Zeitung Digitale Publikationen GmbH (real third candidate)

- **BMJ Verrechnungsstelle status:** confirmed. Listed as "Wiener Zeitung Digitale Publikationen GmbH" with entry `https://www.auszug.at`. Marketing material at `api.auszug.at` states "offizielle Verrechnungsstelle der Republik Österreich" since 2015.
- **Scope:** Firmenbuch, Grundbuch, WiEReG. (GISA and ZMR not visible on the API marketing page.)
- **API technology:** "standardisierte Webservice-Schnittstelle (IWG-konform)". REST vs SOAP not explicitly stated; IWG compliance suggests a structured SOAP-shaped envelope, but this needs confirmation.
- **Pricing transparency:** advertised as "100% transparente Preisgestaltung" with "Monatliche Lizenzgebühren & faire Einzelpreise" aligned to the official BMJ court-fee schedule. Specific numbers not on the marketing page; sales contact required for the rate sheet.
- **Onboarding flow:** three-step — license application with the BMJ, technical integration support, automated retrieval. Sales-gated but published.
- **Contact:** support@auszug.at + general phone +43 1 206 99 500. No named individual surfaced.
- **Customer logos / startup program:** none published.
- **Reseller / redistribution language:** none published.

This is the strongest "third option" if Compass and Manz both stall. The transparency posture (advertised pricing transparency, public BMJ-licensed status, modern marketing site) suggests they are more likely than Manz to engage with a developer-platform pitch. The technology stack question (REST vs SOAP) is the one substantive unknown.

### 4.2 firmafind.at — flat-rate REST API, NOT on BMJ list

- **BMJ Verrechnungsstelle status:** **NOT** on the official justiz.gv.at list. Marketing claims "data originates from the Austrian Ministry of Justice register" but does not name a license chain.
- **API technology:** REST/JSON. Public tier: 30 requests/day unauthenticated. Authenticated tier: full data + documents.
- **Pricing:** €16.66/month or €200/year (Pro) for unlimited requests + commercial use rights + email support; Enterprise tier custom. 7-day free trial, email-only signup, no card up-front.
- **Onboarding flow:** fully self-serve. Cleanest startup fit by a wide margin.
- **Sourcing legitimacy:** unclear. Most likely sources via another VST (possibly api.auszug.at given the "100% transparent pricing" overlap, or HF Data, or scraping a VST's output). Strale's Tier 2 doctrine (DEC-20260428-A) requires the upstream chain to terminate at a licensed primary source with clean redistribution rights and per-fact provenance.
- **Verdict:** **DO NOT use until license chain is verified.** A 60-second outreach asking firmafind which VST or BMJ license they operate under will resolve this. Until resolved, firmafind is not a viable option under DEC-20260428-A regardless of how attractive the pricing is.

### 4.3 Other Verrechnungsstellen — not Strale-shaped

The remaining seven entries on the BMJ list are licensed but oriented at customer profiles that do not match Strale's KYB-API redistribution use case:

- **lexunited (lexunited GmbH)** — Vienna-based register portal, no public API offering, partner is IMMOunited (real-estate vertical). Login-portal product, not a developer API.
- **UVST Datendienste GmbH (Graz)** — webERV transmission + register query, sales-gated, PDF application form, "geeignete Software" required (i.e., probably designed for customer's pre-existing legal/court software).
- **ADVOKAT (ADVOKAT Unternehmensberatung Greiter & Greiter GmbH)** — legal practice management software for law firms and corporate legal departments. Register access is bundled into the product, not exposed as a standalone API.
- **stp.one Austria GmbH** — `bundesdienste.at` / `went.at` entry points; legal-software bundling profile similar to ADVOKAT.
- **ÖGIZIN GmbH** — `verrechnungsstelle.at`; "kammer@notar.or.at" contact suggests the notary chamber. Almost certainly intra-notary use, not a redistributable API.
- **Vendaro m-commerce Dienstleistungen GmbH (`registerauszug.at`)** — single-extract consumer flow, not a programmatic API platform.
- **Moody's Analytics Austria GmbH (`kompany.at`)** — Moody's-owned KYB platform. Strale competitor at the platform layer, not a vendor candidate. Skip.

### 4.4 Summary of candidates

| Vendor | BMJ-licensed | API tech | Pricing transparency | Self-serve | Strale-shaped |
|---|---|---|---|---|---|
| Compass HF Data | yes | REST/JSON | full public price list | no, sales-gated | yes (current primary) |
| Manz | yes | SOAP | PDF-only | no, sales-gated | conditional (backup) |
| auszug.at (Wiener Zeitung) | yes | webservice (IWG) | partial — advertised, not numeric | no, sales-gated | yes (third candidate) |
| firmafind.at | NOT on list | REST/JSON | full public price list | yes | blocked pending license-chain diligence |
| lexunited / UVST / ADVOKAT / stp.one / ÖGIZIN / Vendaro | yes | n/a public | n/a public | no | no — wrong customer shape |
| Moody's / kompany.at | yes | competitor platform | n/a | no | no — competitor |

---

## 5. Recommendation: AT primary path forward

**Send Compass re-poke (handled by chat session, separately) AND open parallel outreach to auszug.at as third candidate. Hold Manz as backup — SOAP-only onboarding tax flagged. Hold firmafind pending license-chain diligence (NOT on BMJ Verrechnungsstelle list).**

Rationale:

- Compass remains the right primary on data quality, REST API maturity, and transparent per-call pricing. The 2026-05-04 silence is informative — Compass is a sales-gated incumbent without a startup track — but the public material is rich enough to refine the re-poke and route to a named contact (Klaus Heidenreich) instead of a generic channel.
- auszug.at is the only other BMJ-licensed VST with a public developer-API positioning and advertised pricing transparency. Opening a parallel thread now is cheap insurance against Compass continuing to be silent and against Manz turning out to be SOAP-only with no path to REST.
- Manz remains backup because the BMJ license is real and the Strale doctrine accepts SOAP-shaped tier-2 vendors when the data quality justifies it, but the SOAP integration tax + opaque pricing means it should not be primary unless both Compass and auszug.at fail.
- firmafind cannot be considered until its license chain is established. Tier 2 doctrine is non-negotiable on this point.

---

## 6. Open questions

1. **Compass redistribution rights.** Does Compass HF Data permit embed-and-bill / API redistribution to Strale's customers? No public answer. This is the single most important unknown and should be question 1 in the re-poke.
2. **Compass startup pricing.** No published pre-revenue track. Is bilateral negotiation possible, or is the published price list firm? Question 2 in the re-poke.
3. **Manz API technology.** Is SOAP the only option, or is there a REST roadmap? Worth asking if Manz becomes the active path.
4. **auszug.at API technology.** IWG-compliant webservice — REST or SOAP? First question in any auszug.at outreach.
5. **auszug.at pricing.** Advertised transparency but no numbers public. Need the rate sheet to compare to Compass.
6. **firmafind license chain.** Which VST or BMJ license does firmafind operate under? One-question outreach resolves this.
7. **Compass WiEReG completeness.** The Business API marketing mentions "beneficial owners register excerpts" — is this full WiEReG history (all UBO changes over time) or only current state? Affects whether we need a separate WiEReG-only vendor.

---

## 7. Sources

- BMJ Verrechnungsstelle list — https://www.justiz.gv.at/service/datenbanken/verrechnungsstellen.795.de.html
- Wirtschafts-Compass API pricing — https://api.wirtschaftscompass.at/en/prices
- Wirtschafts-Compass API documentation — https://api.wirtschaftscompass.at/en/documentation
- Wirtschafts-Compass API contact — https://api.wirtschaftscompass.at/en/contact
- Wirtschafts-Compass API homepage — https://api.wirtschaftscompass.at/en
- Compass Group "About" — https://compass.at/en/about-compass
- Compass API marketing — https://compass.at/en/wirtschafts-compass/wirtschafts-compass-api
- MANZ Firmenbuch — https://www.manz.at/produkte/firmenbuch
- MANZ Solutions GmbH — https://www.manz-solutions.at/
- MANZ infoDienste pricing PDF (non-extractable) — https://www.manz.at/fileadmin/media/agb/manz-infodienste-entgeltbestimmungen.pdf
- auszug.at API marketing — https://api.auszug.at/
- lexunited — https://www.lexunited.com
- UVST Datendienste — https://uvst.at
- ADVOKAT — https://www.advokat.at
- firmafind — https://firmafind.at
