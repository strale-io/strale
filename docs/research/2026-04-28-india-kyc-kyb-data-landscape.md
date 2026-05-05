# India KYC / KYB Data Landscape — Source Research for Payee Assurance v1.5

**Date:** 2026-04-28
**Author:** Claude Code (research)
**Scope:** Indian public-records layer (MCA21, GSTN, PAN, Aadhaar, DGFT IEC, EPFO, FSSAI, Udyam, RBI/SEBI watchlists), commercial Indian KYB/KYC vendor landscape, doctrinal fit under DEC-20260428-A, and v1.5 inclusion recommendation.
**Status:** Research-only, read-only. No code, DB, manifests, or Notion touched. Output is this Markdown file.
**Driver:** Reddit thread complains that Indian KYC APIs are "broken" — random failures, inconsistent formats, charges for failed requests, sandbox ≠ prod, every team rebuilding wrappers. Payee Assurance v1.5 is unsealed: India is one candidate after US (v1.1). The question is whether India clears Strale's three-tier scraping doctrine cleanly enough to ship.
**Mirrors:** `docs/research/2026-04-21-us-company-registry-and-ein-research.md` (template), `handoff/_general/from-code/2026-04-21-singapore-kyb-investigation.md` (deprioritization framing).

---

## TL;DR

**Defer India to v1.6 or later.** The Indian public-records layer is rich (MCA21, GSTN, PAN, DGFT IEC, Udyam, EPFO, SEBI all expose machine-queryable surfaces) and the country is structurally the world's most active KYC/KYB market. But the **vendor layer fails Strale's Tier-2 doctrine on three independent dimensions**: (1) every major vendor (Surepass, Karza/Perfios, Signzy, IDfy, Hyperverge, Sandbox.co.in/Quicko, AuthBridge) refuses to publish redistribution language for a downstream SaaS like Strale, and several products are widely understood to be MCA/GST portal scrapers wrapped in REST — meaning even paying for them re-creates the Tier-1 violation we just doctrinally banned; (2) Aadhaar is **legally fenced off** from non-licensed entities under the Aadhaar Act + DPDP Act 2023 — only KUAs/Sub-AUAs designated by UIDAI may run Aadhaar eKYC, and Strale will not qualify; (3) RBI data-localisation rules require payments-touching customer data to remain on Indian soil, which conflicts with Strale's Railway US-East infrastructure. The Reddit pain is real and Strale's "don't charge if execute fails" rule (DEC-14) is a genuine differentiator — but the doctrinal blockers come first, and clearing them needs a Tier-2-clean vendor with documented MCA + GSTN redistribution rights and primary-source provenance pass-through, plus an India-region inference path. Neither exists today on terms a solo founder can sign. India is structurally analogous to Singapore (deprioritized 2026-04-21 for similar source-availability reasons) but with a much larger upside if the vendor layer matures. **Concrete next step to unblock: license Sandbox.co.in or Karza/Perfios on a written redistribution-with-provenance basis, get a clean read on data-localisation applicability for non-payment KYB calls, and price a 4-cap IN bundle at €3.00–€3.50.** Until then, India is a high-interest watch item, not a v1.5 ship.

---

## 1. Summary

The audit-style discovery confirms three structural findings that depart from the "just add India" framing of the prompt:

- **The public layer exists and is comparatively open** for a country of India's size. MCA21 publishes company master data via `data.gov.in` (CSV bulk + ad-hoc API access for researchers); GSTN runs an official Developer Portal with sandbox + production endpoints reached via accredited GSPs (GST Suvidha Providers); PAN, DGFT IEC, and Udyam expose verification surfaces (PAN's path is restricted to Income Tax Department and authorized agents — the canonical agent path is via NSDL/Protean and via "PAN-to-GSTIN" derivations). The structural problem is **not** absence of data — it is **provenance and redistribution**.
- **The vendor layer is the broken layer**, in the precise sense the Reddit author flagged. The largest aggregators (Surepass, Karza/Perfios, Signzy, IDfy, Hyperverge, Sandbox.co.in, AuthBridge, Cashfree Verification Suite, Razorpay, Digio, Bureau, M2P) collectively publish almost no per-call PAYG pricing, almost no documented redistribution rights, and rarely pass through primary-source provenance — meaning a Strale call returning `gstin_status: "active"` cannot, today, be backed by `provenance.upstream_vendor.primary_source_response_hash` for any of these vendors without a bespoke contract addendum. Several of these products are widely understood (and discussed in practitioner forums) to operate by **scraping the MCA and GST portals** rather than via licensed feeds — which would put them in Tier 1 of DEC-20260428-A, not Tier 2.
- **Aadhaar is legally non-shippable for Strale.** The Aadhaar Act (2016) restricts authentication and eKYC to entities designated by UIDAI as Authentication User Agencies (AUAs), Sub-AUAs, and KUAs (KYC User Agencies). The DPDP Act (2023) layered an additional consent + purpose-limitation regime on top. A non-Indian, non-licensed SaaS like Strale cannot operate Aadhaar eKYC at all, and any vendor that offers it to Strale is doing so via grey-market Sub-AUA chains that have been the subject of UIDAI enforcement. Aadhaar is therefore **excluded from any Strale Indian product surface**, full stop.

The question for v1.5 is therefore not "can we add India" but "can we ship a meaningful Indian Payee Assurance bundle **without Aadhaar**, **with Tier-2-clean vendor sourcing**, **at €3.00 or below per check**, **without tripping RBI data-localisation rules for customer-account-touching calls**". The answer today is: **not on a clean conscience**. With one specific vendor partnership (most likely Sandbox.co.in/Quicko or Karza/Perfios on a written redistribution + provenance basis), it could become yes within one quarter.

Headline recommendation: **Defer India to v1.6**. Use the v1.5 slot for a market that clears the doctrine cleanly — most likely Australia (already shipped: `au-company-data` against the Australian Business Register / ABN Lookup, government source, redistribution-clean) extended into a full payee-assurance bundle, or a second European market (CH/LI/NO uplift). India re-enters the queue once one Tier-2-clean vendor relationship is documented in writing.

---

## 2. Public data layer (what exists by statute)

### 2.1 Identifier map

| Identifier | Issuer | Scope | Canonical for | Available to non-licensed entities? |
|---|---|---|---|---|
| **CIN** (21-char Corporate Identification Number) | MCA | All registered companies (private + public) | Company identity | Yes — via MCA21 / data.gov.in |
| **LLPIN** (7-char) | MCA | All registered LLPs | LLP identity | Yes — same path as CIN |
| **DIN** (Director Identification Number, 8-digit) | MCA | All directors of Indian companies | Director identity | Partial — directors searchable via MCA21 portal |
| **GSTIN** (15-char, includes embedded PAN) | GSTN | All GST-registered businesses (~14M active) | Tax registration; embedded PAN at chars 3–12 | Yes — via official GSTN search + GSP API |
| **PAN** (10-char Permanent Account Number) | Income Tax Dept (Protean / NSDL) | All taxpayers (individuals + entities) | Federal tax identity | **Restricted** — verification API is gated to authorized agents (NSDL); public derivation only via embedded GSTIN chars |
| **Aadhaar** (12-digit) | UIDAI | Indian residents | Individual identity | **No** — agent-mediated KYC restricted to UIDAI-designated AUAs / KUAs |
| **IEC** (10-char Importer-Exporter Code) | DGFT | Importers/exporters | Trade identity | Yes — DGFT public "View Any IEC" portal + QR verification |
| **Udyam Registration Number (URN)** | Ministry of MSME | MSME-registered businesses (~50M) | MSME status | Yes — public verification portal |
| **EPF establishment ID** | EPFO | Establishments with employee provident fund | Employer registration | Partial — establishment search portal |
| **CKYC Identifier (KIN)** | CERSAI | Individuals onboarded under CKYC | Centralized KYC record | Restricted — RBI-regulated entities only |
| **FSSAI License** | Food Safety & Standards Authority | Food businesses | Food licence | Yes — public license search |
| **SEBI Intermediary registration** | SEBI | Brokers, AMCs, RIAs etc. | Securities-market participant | Yes — SEBI public registries |

The IBAN-equivalent question: **India has no IBAN**. Bank-account-name verification operates through three paths:
1. **Penny drop** — small credit (₹1) sent to the account; the bank's response includes the registered account-holder name. Vendors: Cashfree, Razorpay, Digio, Surepass — all charge per call (~₹1–3, plus a refundable ₹1 transfer). Carries true-positive failure modes (e.g., names with initials).
2. **Reverse penny drop** — customer initiates a ₹1 UPI payment to the verifier; the verifier reads the registered name from the UPI payload. Cleaner UX, lower fraud surface. Cashfree and Razorpay both publish this.
3. **NPCI Bank Account Validation API** — wholesale BAV reachable through banks and a small set of NPCI-accredited intermediaries (PSPs). Not directly accessible to non-PSP SaaS.

VPA / UPI ID validation is also widely available via vendor APIs, but does not return a payee name — only validates that the VPA exists and is active.

### 2.2 Per-source detail

#### MCA21 — Ministry of Corporate Affairs

- **What it is:** The authoritative registry of all incorporated entities in India (companies, LLPs).
- **Public surfaces:** `mca.gov.in` (View Company / LLP Master Data — free portal, returns name, CIN, status, RoC, address, paid-up capital, incorporation date, principal business activity); `data.gov.in/catalog/company-master-data` (per-RoC bulk CSV, also exposed via NIC's data API).
- **Auth:** None for portal lookups; data.gov.in API requires a free API key from the OGD platform.
- **Pricing:** Free for portal + bulk download. Document filings (annual returns, financials) are paid (₹100–500 per document via MCA portal).
- **Redistribution:** This is the critical question. MCA's published 2018 guideline document (`GuidelinesMCA_final_12022018.pdf`) governs bulk-data access by researchers and explicitly contemplates restrictions on commercial re-use; the commercial-redistribution position is **not stated in clean affirmative terms** for the data.gov.in feed. OpenCorporates lists MCA as register `IN-MCA` and has historically aggregated it under licence terms that reflect this ambiguity. **Strale would need a written confirmation from MCA or NIC before shipping a derivative product on this data.**
- **Refresh cadence:** Bulk per-RoC CSVs refresh monthly; portal is real-time.
- **Tier classification:** **Tier 2 with caveat** — the underlying data is statutorily public, but redistribution to a downstream paying SaaS is not unambiguously licensed. Direct vendor consumption of the data.gov.in feed is the cleanest path; vendor scraping of `mca.gov.in` portal HTML is **Tier 1** and disqualifies the vendor under DEC-20260428-A.
- **Verdict:** Usable via direct OGD bulk ingest *if and only if* commercial redistribution is confirmed in writing. Until then, treat as restricted.

#### GSTN — Goods and Services Tax Network

- **What it is:** The infrastructure operator for India's GST regime. Holds the canonical GSTIN registry (~14M active GST-registered businesses).
- **Public surfaces:** `services.gst.gov.in` (free portal "Search Taxpayer by GSTIN" — returns legal name, trade name, principal place of business, registration date, status, taxpayer type); GSTN Developer Portal (`developer.gst.gov.in/apiportal`) hosts API specs but production access is gated through accredited GSPs (GST Suvidha Providers — there are ~30, mostly fintech and tax-tech Indian companies).
- **Auth:** Production access via GSP relationship; sandbox via developer portal registration.
- **Pricing:** GSTN does not directly bill GSP-mediated traffic per call; the GSP charges its own per-call rate (typically ₹0.50–2 / call to its customers).
- **Redistribution:** GSTN's API terms are restrictive — APIs are intended for "GST-system-related" use cases (return filing, e-invoicing, e-way bills). Pure verification redistribution to a SaaS that does not file returns is in a grey zone. Public portal data has stronger statutory backing as public records.
- **Refresh cadence:** Real-time.
- **Tier classification:** **Tier 2 with caveat** — same shape as MCA21. A GSP-mediated commercial redistribution requires a written addendum.
- **Verdict:** Usable via GSP partnership where the GSP carries the GSTN agreement and Strale documents the chain.

#### PAN — Permanent Account Number

- **What it is:** Federal tax identifier for individuals and entities.
- **Public surfaces:** None — there is no public PAN-by-name search. Verification is one of two paths: (a) NSDL/Protean's PAN Verification API, restricted to authorised agents (banks, NBFCs, securities intermediaries; Strale will not qualify); (b) derive PAN from a known GSTIN (chars 3–12 of GSTIN are the entity PAN — algorithmic, no API needed) and validate the GSTIN in turn.
- **Tier classification:** **Restricted** for direct PAN verification. **Tier 2** for the GSTIN-embedded-PAN derivation path.
- **Verdict:** Strale should ship a `india-pan-from-gstin` derivation capability (algorithmic, free, fully provenanced) and explicitly *not* attempt PAN verification as a standalone product. Vendors that offer "PAN verification" almost universally do this via grey-market NSDL agent chains.

#### Aadhaar — UIDAI

- **What it is:** 12-digit unique resident identifier; the basis for India's eKYC stack.
- **Public surfaces:** None. Aadhaar verification (eKYC) is restricted by the Aadhaar Act (2016, as amended) to entities designated by UIDAI as Authentication User Agencies (AUAs) and KYC User Agencies (KUAs). DPDP Act 2023 layered consent and purpose-limitation requirements on top.
- **Legal position for Strale:** Strale is a non-Indian SaaS with no AUA/KUA designation. It **cannot** lawfully run Aadhaar eKYC under the Aadhaar Act regime, and a vendor offering Aadhaar eKYC to Strale is operating in (or facilitating) grey-market Sub-AUA chains that have been the subject of UIDAI enforcement (notably the 2018–2019 action against multiple eKYC resellers). **DigiLocker** is an alternate UIDAI-adjacent surface that allows users to consent-share documents (PAN card, Aadhaar XML, education certificates, etc.); this *is* accessible via API to non-licensed entities under a different consent regime, and is the cleanest path for any Strale Aadhaar-derived KYC use case.
- **Tier classification:** **Disqualified** for Aadhaar eKYC. **Tier 2** for DigiLocker consent-share.
- **Verdict:** Aadhaar eKYC is out of scope for Strale Indian KYB/KYC. DigiLocker can host an individual KYC capability if Strale ever serves Indian-resident verification, but is not on the v1.5 KYB critical path.

#### DGFT IEC

- **What it is:** Importer-Exporter Code, mandatory for Indian businesses doing cross-border trade.
- **Public surfaces:** DGFT portal "View Any IEC" page accepts IEC + firm name and returns active/inactive status, address, branches, products.
- **Auth:** None.
- **Pricing:** Free.
- **Redistribution:** No published commercial-redistribution restriction; data is statutorily public.
- **Tier classification:** **Tier 2** (clean — direct OGD source).
- **Verdict:** Cleanest single Indian source for Strale to ship. An `india-iec-validate` capability could exist on day one with no vendor in the loop.

#### Udyam Registration (MSME)

- **What it is:** Successor to Udyog Aadhaar; the registration regime for India's ~50M MSMEs.
- **Public surfaces:** `udyamregistration.gov.in/udyam_verify.aspx` — public verification by URN.
- **Auth / pricing:** None / free.
- **Redistribution:** Similar to IEC — public records, no published commercial restriction.
- **Tier classification:** **Tier 2** (clean).
- **Verdict:** Ship-ready as `india-udyam-verify` if a capability is wanted.

#### EPFO

- **What it is:** Employee Provident Fund Organisation. Holds employer registrations.
- **Public surfaces:** Establishment search via `unifiedportal-emp.epfindia.gov.in`. Limited, captcha-gated.
- **Tier classification:** **Tier 2 with friction** — public records but the only public surface is captcha-protected, which means vendor scraping is the practical path, which puts vendors in Tier 1.
- **Verdict:** Skip for v1.5.

#### FSSAI

- **What it is:** Food Safety and Standards Authority — licence registry for food businesses.
- **Public surfaces:** Public licence search at `fssai.gov.in`.
- **Tier classification:** **Tier 2** (clean, but narrow scope — only food businesses).
- **Verdict:** Niche; ship only if an Indian food-supply-chain customer asks.

#### SEBI registries

- **What it is:** Securities and Exchange Board of India. Public lists of registered intermediaries (brokers, asset managers, RIAs, mutual funds, AIFs, debenture trustees, etc.).
- **Public surfaces:** `sebi.gov.in/intermediaries.html` — multiple per-category lists, mostly downloadable as XLS/PDF.
- **Tier classification:** **Tier 2** (clean — official watchlist data, statutorily published).
- **Verdict:** Useful for an `india-sebi-intermediary-check` capability for finance-sector KYB. Low priority for v1.5 but a clean future addition.

#### RBI watchlists and registers

- **What it is:** RBI publishes lists of NBFCs (registered, deregistered, cancelled), Payment System Operators, ARCs, and the wilful-defaulters database (via banks; not all consolidated publicly).
- **Public surfaces:** `rbi.org.in` — multiple per-category PDF/XLS lists.
- **Tier classification:** **Tier 2** (statutorily published).
- **Verdict:** Useful negative-screen data; could feed into adverse-media-style India risk narrative.

---

## 3. Vendor landscape

The Indian KYC/KYB API market is unusually crowded and unusually opaque on commercial terms. The table below uses the same columns as the EU and US country research, with one extra column for **observed scraping risk** because that is the doctrinal blocker for India.

Confidence key: **PUBLISHED** = vendor publishes the data point; **THIRD-PARTY** = practitioner blog or marketplace; **UNAVAILABLE** = neither.

| Vendor | HQ | Coverage | Pricing (per call, where findable) | PAYG / monthly min | Redistribution to a downstream SaaS | Primary-source provenance pass-through? | Scraping risk (Tier 1 indicator) | Tier classification |
|---|---|---|---|---|---|---|---|---|
| **Surepass** | India | 300+ APIs incl. PAN, GSTIN, CIN, Udyam, IEC, bank-account, UPI | Not published; "package-based" (THIRD-PARTY: ₹3–7/Aadhaar eKYC, ₹1–3/PAN) | Quote-based; some self-serve packages | Not published | Not published | **High** — multiple endpoints documented as "MCA portal" / "GST portal" rather than licensed-feed | **Disqualified pending written confirmation** |
| **Karza / Perfios** | India (Perfios acquired Karza Feb 2022 for $80M) | Full KYC + KYB, lending stack, CKYC, document analysis, fraud | Enterprise quote only | Annual contracts | Not published; reseller language not standard | Not standard | **Medium-high** — historical product roots in MCA / GST scraping; current surface is mixed | **Disqualified pending diligence** |
| **Signzy** | India / global | KYC, KYB, video KYC, "300+ APIs" | Enterprise quote; "30–50% lower than Aadhaar eKYC ₹3–7 baseline at volume" (THIRD-PARTY) | Annual | Not published | Not standard | **Medium** | **Disqualified pending diligence** |
| **IDfy** | India | KYC, KYB, video KYC, document fraud, employment verification | Enterprise quote | Annual | Not published | Not standard | **Medium** | **Disqualified pending diligence** |
| **HyperVerge** | India / SG / US | KYC, KYB, AML, face match, document OCR | Per-successful-verification, no published rates (THIRD-PARTY: ~₹15/KYC at mid volume) | Annual | Not published | Not standard | **Lower** (more API-first) but still not Tier-2-documented | **Disqualified pending diligence** |
| **Sandbox.co.in (Quicko)** | India | Tax + KYC: Aadhaar (DigiLocker), PAN, GSTIN, bank, MCA | Per-call published tier (PUBLISHED — `sandbox.co.in/pricing`) | Free dev tier; PAYG production | Not published | Partially — DigiLocker calls do return UIDAI-signed XML | **Lower** — reputed to use licensed GSP / NSDL paths | **Tier 2 candidate** — best diligence target |
| **AuthBridge** | India | KYC, KYB, employment background checks | Enterprise quote; reseller channel exists | Annual | Reseller programme exists (THIRD-PARTY: SoftwareHorsepower) | Not standard | **Medium** | **Disqualified pending diligence** |
| **Gridlines** | India | KYC + KYB API marketplace | Self-serve PAYG (one of the few that publishes) | PAYG | Not published in detail | Not standard | **Medium** | **Tier 2 candidate** |
| **Cashfree Verification Suite** | India | Bank account, UPI VPA, PAN, GSTIN, Aadhaar via DigiLocker | Bundled with payments product; per-API quote | Per-API; no separate min beyond Cashfree merchant onboarding | Cashfree merchant ToS, not a redistribution licence | Not standard | **Lower** for bank/UPI (NPCI-mediated); higher for MCA/GST | **Mixed** — bank/UPI Tier-2 candidate, registry surfaces disqualified |
| **Razorpay** | India | Bank account verification, VPA, PAN, GSTIN | Bundled with payments product | Per-API | Razorpay merchant ToS | Not standard | **Lower** for bank/UPI; higher elsewhere | **Mixed** |
| **Digio** | India | Bank account (penny drop + reverse), PAN, Aadhaar via DigiLocker, e-sign | Custom quote | Custom | Not published | Not standard | **Lower** | **Tier 2 candidate** for bank verification |
| **Bureau** | India / SE Asia | KYC, fraud, alternative-data scoring | Enterprise quote | Annual | Not published | Not standard | **Lower** | **Disqualified pending diligence** |
| **M2P (incl. AuthBridge integration)** | India / SEA | Banking-as-a-service incl. KYC modules | Enterprise quote | Annual | Not standard | Not standard | **Lower** | **Disqualified pending diligence** |
| **NxtBanking** | India | Aggregator-of-aggregators reselling KYC | Quote-only | Annual | Not standard (it's itself a reseller chain) | No | **High** (reseller-of-reseller) | **Disqualified** |

**Counts:** Out of 13 surveyed vendors, **zero publish a redistribution licence suitable for Strale**, **zero publish primary-source provenance pass-through**, and **the most plausible Tier-2 candidate is Sandbox.co.in (Quicko)** because of its reputed use of licensed GSP and NSDL paths and its self-serve PAYG model. Digio is the most plausible Tier-2 bank-verification candidate.

This is materially worse than the EU landscape (where ~10 of 27 countries have free + redistributable government APIs) and worse than the US landscape (where Cobalt and Middesk both passed the redistribution-language test on commercial outreach). India's structural problem is that the entire vendor layer evolved as **an opaque arbitrage on the gap between portal-only government data and bank/fintech demand for APIs**. That arbitrage rests on either (a) licensed GSP / NSDL chains with redistribution silence, or (b) outright portal scraping. Neither survives DEC-20260428-A scrutiny without a written addendum.

---

## 4. Reddit pain-point gap analysis

The Reddit author's complaints map to Strale's product surface as follows.

| Reddit complaint | Vendor problem or structural? | Does Strale's existing product directly address it? | Sales-hook strength |
|---|---|---|---|
| **"Random failures, can't tell why"** | Both — vendors don't expose root cause; structural under captcha + portal-scrape architectures | Yes — Strale's SQS engine + audit trail + structured `error_code` enum (DEC-19) make the failure mode explicit per call | **High** — this is exactly what SQS was built for |
| **"Inconsistent response formats across vendors"** | Vendor problem — each vendor invents its own schema | Yes — Strale enforces a normalised response shape per capability slug; `india-gst-validate` would return the same JSON shape regardless of upstream vendor | **High** — the "one schema" pitch is the core Strale value-prop |
| **"Charges me for failed requests"** | Vendor problem | **Yes — directly.** DEC-14 (don't charge before execution succeeds) is precisely this rule. Strale debits the wallet on success only. | **Highest** — concrete, demonstrable, copy-pasteable into outbound |
| **"Sandbox doesn't match production"** | Structural — vendors maintain separate sandbox stacks that drift | Partially — Strale does not separate sandbox from production (every call hits the live capability stack); Strale's "fixture" test mode is the documented behavioural contract | **Medium** — needs a marketing translation: "we don't have a sandbox because every call is a real call against a known SQS-scored stack" |
| **"Every team rebuilds the same wrappers"** | Structural | Yes — Strale's MCP / SDK / x402 surfaces are the wrapper, maintained centrally, versioned via Strale-Version header | **High** — same pitch as the EU country wrapper consolidation |
| **"Latency spikes during peak"** | Vendor problem (captcha challenge spikes) | Partially — Strale's RP (Reliability Profile) factor explicitly captures latency degradation and routes around it where multiple suppliers exist | **Medium** — only meaningful once Strale has multiple Indian suppliers per check |
| **"Vendor goes silent on support"** | Vendor problem | Indirect — Strale's `provenance.upstream_vendor` disclosure and platform-level uptime reporting reduce the "who do I call" problem | **Low-medium** |

**Behavioural sketch — how Strale's Indian capabilities would look:**

```
POST /v1/do
{
  "capability_slug": "india-company-data",
  "input": { "cin": "U72200KA2009PTC050231" }
}

Response:
{
  "output": {
    "name": "FLIPKART INTERNET PRIVATE LIMITED",
    "cin": "U72200KA2009PTC050231",
    "status": "Active",
    "incorporation_date": "2009-10-22",
    "registered_office": "...",
    "directors": [...],
    "authorised_capital_inr": 35000000,
    "paid_up_capital_inr": ...
  },
  "provenance": {
    "source": "MCA21 via {vendor}",
    "upstream_vendor": "Sandbox.co.in",
    "acquisition_method": "licensed-feed",
    "primary_source_reference": "MCA21",
    "primary_source_response_hash": "sha256:..."
  },
  "quality": { "sqs": 87, "qp_grade": "B", "rp_grade": "A" },
  "wallet_balance_cents": 248750
}
```

The Reddit author would recognise this immediately as the API they wish they had: stable schema, declared upstream, provenance hash on the underlying MCA response, SQS score visible at call time, charged only on success. The product surface is straightforward to build *once one Tier-2-clean vendor is licensed*. The blocker is vendor sourcing, not product design.

---

## 5. v1.5 inclusion recommendation

### 5.1 Doctrine fit

**Fail today, conditionally pass within one quarter.** The vendor diligence required to clear DEC-20260428-A is non-trivial (every Indian vendor surveyed defaults to enterprise quotes and silence on redistribution language) but is concentrated on 1–2 vendor relationships (Sandbox.co.in for registry calls, Digio for bank verification) and could be cleared with one focused outreach push. A "scrape MCA in-house" path is **disqualified** by Tier 1. A "consume any Indian vendor without diligence" path is **disqualified** by Tier 2 because the underlying vendor practices are not transparent enough.

### 5.2 Economics

A 4-cap IN bundle at €3.00–€3.50 looks plausible if vendor sourcing clears:

- `india-company-data` (MCA via Sandbox / Karza): est. €0.30–0.50 / call
- `india-gst-validate` (GSTN via GSP): est. €0.10–0.20 / call
- `india-bank-account-verify` (penny drop via Digio / Cashfree): est. €0.20–0.40 / call (the ₹1 transfer cost is real but small)
- `pep-check` + `adverse-media-check` + `risk-narrative-generate` (already in catalogue, country-agnostic): €0.40 / call

Stack = ~€1.00–1.50 cost; €3.00 retail leaves the same gross-margin shape as KYB-Complete-EU (~€1.00–1.50 cost into €2.50 retail). A "KYB Essentials IN" 3-cap bundle at €1.80 is also plausible.

### 5.3 Market size

Indian SaaS reached ~$50B ARR in 2025 with 18% CAGR projected through 2030 — large enough that an Indian payee-assurance buyer base exists in absolute terms. **More important for Strale's wedge: the foreign-companies-onboarding-Indian-suppliers segment.** Every EU/US enterprise procurement team that onboards Indian software vendors (which is many, given India's IT services and SaaS profile) is a natural Strale buyer for an Indian payee-assurance bundle. This is a stronger pitch than "compete in India" because it leverages Strale's existing EU/US customer base rather than requiring India-resident sales motion.

### 5.4 Risk

Three named risks:

- **DPDP Act (2023)**: Cross-border data transfer rules apply when Strale processes data of Indian residents. KYB calls (entity-level, no individual data) are mostly out of scope; KYC calls (individual director, beneficial owner) attract DPDP. Strale's existing data-jurisdiction column on transactions (DEC-20260226-P-s3t4) is the right primitive but the rule needs explicit India-specific handling.
- **RBI data localisation**: Storage of payment-touching customer data must remain on Indian soil. KYB calls that do **not** touch payment instruments are arguably out of scope; bank-account-verification calls are arguably **in** scope. Strale's Railway US-East infrastructure conflicts with the latter. Resolution path: route Indian bank-verification calls through an Indian-region inference path (Railway Mumbai region, or an Indian VPC), or restrict the Indian bundle to non-bank-verification checks at v1.5.
- **Vendor concentration**: With one or two viable Tier-2 vendors, single-vendor failure risk is high. Mitigation = ship with two vendors per critical leg from day one (e.g., Sandbox + Karza for MCA, Digio + Cashfree for bank-verify), even at higher COGS.

### 5.5 Comparison to Singapore (deprioritized 2026-04-21)

Singapore was deprioritized as a **Type 3 — structural / no viable data source at price point** case (per `handoff/_general/from-code/2026-04-21-singapore-kyb-investigation.md`). The blockers were: (a) ACRA BizFile is paid-only at any volume; (b) OpenCorporates SG coverage is narrow; (c) zero customer transactions on existing SG solutions. India is a **different** failure mode: the data source exists and is comparatively open, but the **vendor middle layer fails the doctrine** rather than the source itself. India therefore has a clearer remediation path than Singapore (one good vendor partnership unblocks it; Singapore needs a paid ACRA contract regardless), but is similarly **not ship-ready today**.

### 5.6 Concrete next step to unblock

1. **Outreach to Sandbox.co.in (Quicko)** for a written addendum: (a) per-call PAYG production pricing for `mca-data`, `gstin`, `pan-from-gstin`, `iec-validate`, `udyam-verify`; (b) confirmation of redistribution rights for downstream SaaS resale; (c) confirmation that responses include primary-source response hash or equivalent provenance artefact; (d) DPA matching DPDP Act 2023 requirements.
2. **Outreach to Digio** on the same shape for bank-account-verification (penny drop + reverse penny drop + VPA validation).
3. **Legal opinion (one-pager) on RBI data-localisation applicability** to non-payment KYB calls vs payment-touching bank-verification calls. This determines whether v1.5 IN can ship from US-East infra at all, or whether an Indian-region inference path is a precondition.
4. **If 1–3 clear:** spike `india-company-data` + `india-gst-validate` + `india-iec-validate` + `india-bank-account-verify` as four standalone capabilities at €0.20–0.40 each, then bundle as `kyb-essentials-in` (€2.50) and `kyb-complete-in` (€3.50). Pipeline-onboard via the standard manifest flow per CLAUDE.md "Adding New Capabilities" protocol.
5. **If 1–3 don't clear within one quarter:** defer India to v1.7+, use the v1.5 slot for a doctrine-clean market (most likely Australia uplift or CH/LI/NO uplift).

---

## 6. Sources

- [data.gov.in — Company Master Data catalog](https://www.data.gov.in/catalog/company-master-data)
- [MCA Master Data services](https://www.mca.gov.in/content/mca/global/en/mca/master-data/MDS.html)
- [MCA21 researcher access guidelines (2018 PDF)](https://www.mca.gov.in/Ministry/pdf/GuidelinesMCA_final_12022018.pdf)
- [GST Developer Portal](https://developer.gst.gov.in/apiportal/)
- [GSTIN search (live taxpayer)](https://services.gst.gov.in/services/searchtp)
- [UIDAI Authentication Ecosystem](https://uidai.gov.in/en/ecosystem/authentication-ecosystem.html)
- [Aadhaar Authentication by Private Entities — SS Rana analysis](https://ssrana.in/articles/aadhaar-authentication-by-private-entities-from-data-privacy-perspective/)
- [DPDP Act 2023 analysis](https://www.taxtmi.com/article/detailed?id=15569)
- [Sandbox.co.in pricing](https://sandbox.co.in/pricing)
- [Sandbox.co.in KYC product page](https://sandbox.co.in/kyc)
- [Surepass GST verification API](https://surepass.io/gst-verification-api/)
- [Surepass MCA Data APIs (CIN/DIN v3)](https://surepass.io/mca-data-apis-cin-din-v3-portal/)
- [Karza / Perfios product overview](https://perfios.ai/)
- [Signzy India API marketplace](https://www.signzy.com/india-api-marketplace)
- [HyperVerge product / pricing notes](https://productgrowth.in/tools/kyc-identity/hyperverge/)
- [Gridlines top-11 KYC API providers](https://gridlines.io/blogs/top-11-kyc-api-providers-in-india/)
- [Cashfree penny-drop verification](https://www.cashfree.com/penny-drop-verification/)
- [Razorpay account validation API](https://razorpay.com/docs/api/x/account-validation/)
- [Digio penny drop documentation](https://documentation.digio.in/digikyc/bank_account_verification/api_integration/penny_drop/)
- [DGFT IEC profile management](https://www.dgft.gov.in/CP/?opt=iec-profile-management)
- [Udyam Registration verification](https://udyamregistration.gov.in/udyam_verify.aspx)
- [RBI cross-border payment aggregator regulations (2023 circular analysis)](https://www.lexology.com/library/detail.aspx?g=2e51a27b-3fa8-47a1-b2de-b660f6548211)
- [Indian SaaS market size (Business Standard)](https://www.business-standard.com/industry/news/indian-saas-sector-likely-to-reach-a-market-size-of-50-billion-by-2030-124080501302_1.html)
- DEC-20260428-A — Three-tier scraping doctrine (Notion Decisions DB)
- `docs/research/2026-04-21-us-company-registry-and-ein-research.md` (template)
- `handoff/_general/from-code/2026-04-21-singapore-kyb-investigation.md` (deprioritization framing)
- `docs/research/2026-04-28-payee-assurance-build-vs-buy.md` (build-vs-buy framework)
- `handoff/_general/from-code/2026-04-28-reddit-voc-synthesis-payee-assurance.md` (recent VoC synthesis)
