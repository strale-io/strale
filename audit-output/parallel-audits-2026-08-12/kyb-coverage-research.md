# KYB coverage from FREE, commercially-usable sources — research report

**Date:** 2026-08-12
**Directive:** Founder question — how good a KYB offering can Strale build from free, commercially-usable sources? Ground in the historical corpus first, fresh research second.
**Mode:** READ-ONLY. No repo edits, no DB writes, no Notion writes, no signups.

---

## 0. The answer in one paragraph

Strale can build a genuinely good **Identity + Bindability** KYB product (Evidence Tier 1 + Tier 2:
existence, status, registry ID, address, legal form, officers/directors) from free, properly-licensed
sources across roughly **12–15 countries**, and pair it with sanctions/PEP/adverse media (Dilisense,
already live and cheap) and VAT/LEI validation (already free and live). What it **cannot** build from
free sources is **UBO** — and that is a legal gate, not a budget gate. Post-CJEU C-37/20 (Nov 2022)
every EU beneficial-ownership register except a handful closed to the public; AMLD6 restores access
only for "legitimate interest" (journalists, CSOs) and obliged entities, and Strale is neither.
Free UBO exists in exactly two places — **UK PSC** and **DK's public BO register** — plus GLEIF L2
as a partial, non-AML proxy. The consequence is strategic, not tactical: a free-sourced KYB offering
can serve **Use-case Tier 1 (Continuity)** and **Tier 2 (Onboarding)** well, and **structurally
cannot serve Tier 3 (EDD)** — which is precisely what AML-obliged buyers need. Any pitch to a
regulated buyer therefore requires a paid UBO vendor or a different customer segment.

The single biggest *new* unlock found: **Austria's Firmenbuch High-Value-Dataset API**, live since
January 2025, free, CC BY 4.0, official, covering company data + officers + documents/financials.
Austria was in the "deactivated pending aggregator" bucket. That is now wrong.

---

## 1. STEP 1 — What we already know (synthesis of the existing corpus)

Sources read: `audit-output/registry-source-research-2026-05-18.md`;
`audit-output/exhaustive-enumeration-*.md` (SE/DK, PL/LT, HR/EE/BE, MT/CY/HU/LU);
`audit-output/ubo-activation-uk-dk-2026-05-18.md`; `audit-output/labeling-sweep-summary-2026-05-18.md`;
`docs/strategy/2026-08-05-direction-plan.md` §4; `apps/api/src/capabilities/auto-register.ts` DEACTIVATED map;
`apps/api/coverage-matrix/*.yaml` (47 rows); handoff `2026-08-09-usage-analysis-capability-buildout.md`.

Notion pages cited (read-only):
- **DEC-20260518-E** — Exhaustive Source Enumeration (8-path rubric) — `36467c87-082c-817d-b910-d00b828a2bf3`
- **DEC-20260518-F** — Data sourcing principles, clarification of DEC-20260428-A — `36467c87-082c-8135-bc61-f631193c9da5`
- **DEC-20260518-G** — Platform-fee probe mandatory for RFQ-only Tier-2 aggregators — `36467c87-082c-8112-9f04-e07d01a93045`
- **Counterparty Assurance — Tier frameworks** (Evidence Tier + Use-case Tier) — `36367c87-082c-8146-870e-ee51af40d886`
- **DEC-20260518-B** (Use-case tiers) — `36467c87-082c-8183-8cda-c890814e2089`; **DEC-20260518-C** — `36467c87-082c-8186-a795-e4b7dbe8c742`; **DEC-20260518-D** (`ubo_availability` semantics) — `36467c87-082c-818a-914d-ddd0e74544dc`
- Session logs: registry source research `36467c87-082c-81d8-975e-e06e171abbca`; SE+DK enumeration `36467c87-082c-813e-ac5c-ea38fcc58dae`; UBO activation UK+DK `36467c87-082c-8188-ad3d-e7e394354785`; labeling sweep `36467c87-082c-8105-af3c-e899c4ffd4a3`
- Active Vendor Stack — `35367c87-082c-812e-88d1-dc6bdbfbd4f5`; AT WiEReG resale restriction — `35867c87-082c-8141-b933-e0dd6d5938e5`; UBO self-host to-do — `35067c87-082c-81af-b093-d7dc8e9c06ca`; Gap-8 SI/SK/MT/RO spike — `35967c87-082c-8112-b7fb-c472c9aa4490`

### 1.1 The doctrine, as it actually stands

| Decision | Effect | Still valid? |
|---|---|---|
| DEC-20260428-A | Tier 1: Strale never operates scrapers (absolute). Tier 2: vendor-mediated public records with redistribution rights + provenance. Tier 3: prefer licensed bulk. | Active |
| **DEC-20260518-F** | **Clarifies** A. Permits **targeted per-call HTML/PDF parsing of statutorily-public registry pages** under four constraints: (a) statutorily public, (b) registry ToS permits per-call automated access, (c) per-entity/per-customer-request — never bulk crawl, (d) attribution + provenance preserved. Explicitly still forbids bulk crawling, ToS-prohibited access, robots.txt evasion, CAPTCHA solving, proxy rotation, login-wall circumvention. | Active — **and materially under-exploited (see §4 flag F1)** |
| DEC-20260518-E | 8-path enumeration required before declaring a country "blocked"/"paid-only". | Active |
| DEC-20260518-G | Mandatory platform-fee probe for RFQ-gated vendors (setup, monthly minimum, annual floor, termination). Introduced after Topograph's "no minimum commitments" concealed a €1,500/mo platform fee. | Active |
| DEC-20260518-A/B/C/D | Evidence Tier 1/2/3 (Identity / Bindability / Ownership); Use-case Tier 1/2/3 (Continuity / Onboarding / EDD); `ubo_availability` = capability state, not jurisdictional state. | Active |

**Three distinct Tier 1/2/3 systems exist** (Evidence, Use-case, Data-Sourcing). This report always qualifies.

### 1.2 What we already know — per country / per leg

Verdicts below are the corpus's, with a "still valid?" column reflecting this session's fresh checks.

| Country | Identity (Ev. T1) | Officers (Ev. T2) — free? | UBO (Ev. T3) — free? | Insolvency | Corpus verdict | Still valid 2026-08? |
|---|---|---|---|---|---|---|
| **NO** | Live 7/7 | **YES** — Brreg free, no auth, "gold standard" | No | `no-bankruptcy-check` Live | Tier 1, ship-ready | Yes. Officers **not yet extracted** by handler |
| **SE** | Live 7/7 | **No** — free HVD API has no officer fields; Företagsinformation API v4 = paid subscription | No | — | Tier 1 identity, officers paid | Yes. Fresh check: the free downloadable `företrädare` file appears to be **aggregate statistics** (age/gender), not named individuals; site CAPTCHA-blocks automated verification |
| **DK** | Live 6/7 | **Free after credential** — CVR S2S (`distribution.virk.dk`), free, ~3-week email approval | **YES** — public BO register, but **no integration exists** | Statstidende gazette only | Tier 1; S2S is the path | Yes. Prod completion **0/13 calls** |
| **FI** | Live 6/7 | **No** — free PRH v3 has no person nodes; officers only via paid Virre (~€10–30/extract) | No (explicitly carved out) | — | Tier 3 / near-Class-C | Yes. Prod 17% |
| **UK** | Live 7/7 | **YES** — Companies House free API, 600 req/5min | **YES** — PSC register, free, **Live** | `insolvency-check` Live | Best in class | Yes. Officers API exists but **handler doesn't extract it** |
| **FR** | Live 7/7 | **YES** — INPI RNE free w/ auth; directors shipped 5/5 | No — RBE requires admin-only API Entreprise | `fr-bodacc-lookup` Committed | Tier 1 | Yes |
| **DE** | Live 7/7, `tier_2_available: true` | Via **OpenRegister free tier only** | No — Transparenzregister restricted (GwG §23) | insolvenzbekanntmachungen.de, no API | Tier 2, PDF-only officially | Yes — **and the free tier is ~50 lookups/mo. Not a primary.** |
| **BE** | Live 6/7 | **No free** — cheapest is KBO SOAP **€0.025/call** (€50 prepaid / 2,000 calls) | **No** — register non-public since Feb 2023 | — | Tier 1 identity | Yes. Prod 33% |
| **NL** | Committed (Openapi WW-Top, **no directors**) | **No** | No — Wwft post-CJEU | — | Tier 3, paid | Yes. **HVD "open dataset" is anonymized statistics** (see §2) |
| **AT** | Committed (Openapi WW-Top, **no directors**) | Corpus said: **paid only** (~€3–10 extract via Verrechnungsstellen) | No — WiEReG AML-obliged only (tightened Oct 2025) | Ediktsdatei | Tier 3, paid | **NO — SUPERSEDED. See §2.1** |
| **IT** | Committed (Openapi IT-Advanced) | Openapi **IT-Stakeholders** €0.095–0.20/call is the only mediated directors SKU | No | Field inside register | Tier 3, paid | Yes — no free path found |
| **ES** | Committed (Openapi ES-Advanced) | Corpus: paid, no API | No | Registro Público Concursal, no API | Tier 3, paid | **Partly superseded — see §2.2** |
| **PT** | Committed | Certidão Permanente €25–100, no API | No — **RCBE access further restricted by DL 115/2025, eff. 1 Nov 2025** | Citius, no API | Tier 3, paid | Yes, and worsening |
| **EE** | Live 6/7, 5/5 | **YES** — RIK open data, CC BY 4.0, daily, 45MB, no auth | Not pursued | — | Best-in-class free | Yes. Personal ID codes redacted since Nov 2024 |
| **CY** | Live 6/7, 5/5 | **YES** — data.gov.cy DRCOR bulk CSV, CC BY 4.0, **1,168,824 officer rows**, monthly | **No** — closed to public 2023-01-03 | — | "Strongest Phase 6 finding" | Probably — **could not re-verify this session (§4 flag V1)** |
| **CZ** | Live 7/7, 5/5 | **YES** — ARES v3 free REST | No | — | Tier 1 | Yes |
| **SK** | Live 6/7 | **YES** — RPO free REST + weekly dumps | No | — | Tier 1 | Yes |
| **PL** | Live **4/7** (address + reg date null) | **No — names masked by law** in free KRS JSON; Oct 2025 amendment added criminal penalty (up to 2 yrs) for unauthorised full-KRS access | No (CRBR HTML-only) | — | Hardest country in series | Yes |
| **LT** | Live 6/7 | **No** — Spinta free feed has binary flags + dates, **no names**; extract €6.37 | No (JANGIS restricted) | — | No free officer path | Yes |
| **LV** | Live 6/7 | **Partial** — free CKAN bulk, personal codes redacted post-2022 | No | — | Tier 1 | Yes |
| **HR** | Live 6/7 | **No** — Sudreg officer endpoints walled to "državno tijelo" tier | **No** — FINA RSV needs Croatian NIAS e-ID | — | No free path at all | Yes |
| **IE** | Live 6/7 | **Unverified** — CRO CKAN docs don't enumerate a directors field | No | — | "Could not verify" | Still unverified |
| **GR** | Live 6/7, `tier_2_available: true` | **Free by statute** (Greek law mandates free access/download/reproduction) but **HTML only, no API** | No | — | Tier 2, DEC-20260428-A tension | Yes — **the sharpest open Path-4 question** |
| **MT** | Committed | **No free** — MBR API has confirmed subscription fee; data.gov.mt 0/30 open-licence score | No — RBO €5/req, legitimate-interest gate | — | Paid only | Yes |
| **HU** | Committed | **No free** — "HU has not built the EE-pattern" | No (restricted) | — | Paid only | Yes |
| **LU** | Committed | **No free** — data.public.lu bulk dataset **removed Aug 2025**, "neither for free nor for sale"; LBR portal added **CAPTCHA Aug 2025** | No — RBE restricted (Law 25 Jan 2025) | — | Paid only | Yes |
| **SI** | Live **2/7** (name + reg# only) | Contract-gated extended PRS | No | — | Weakest live row | Yes |
| **BG/RO** | Committed | Paid (BRRA SOAP subscription / ONRC ~8 RON) | No | — | Paid | Yes |
| **CH** | Live 7/7 | **YES** — Zefix free REST + LINDAS SPARQL, "most open in Western Europe" | n/a — no register exists | — | Tier 1 | Yes. **Prod 0/5 calls** |
| **SG** | Live 7/7 | **No** — free ACRA open data is name-blind per Companies Act s.12(2A); names need paid BizFile (S$5.50) | No | — | Bifurcated | Yes |
| **US** | Committed (Cobalt, paid $0.50–2.00) | State-variable, ~28/50 states | No — FinCEN BOI not accessible | — | Paid | Yes. Prod 36% |

### 1.3 Cross-cutting things the corpus already settled

- **BRIS is not a data source.** Identity fields only (name, legal form, seat, registration number, EUID); legal representatives only "to the extent the originating national register provides them free of charge"; **no public API — web portal only**. Useful for EUID cross-referencing, nothing else.
- **OpenCorporates is not a free path.** Free tier is share-alike-only (incompatible with a proprietary commercial API); paid starts **£2,250/yr for 500 calls/month** (~£4.50/call) — three orders of magnitude off Strale's price point.
- **13 handlers were flagged for a "legal_representatives extraction" sweep** — registries that expose director data upstream where the handler simply doesn't extract it: BE, CZ, EE, FI, FR, HR, IE, LT, LV, NO, PL, SE, SK, plus UK separately. **This is the highest-ROI item in the entire report** — no new source, no new vendor, no new cost. (Caveat: this session's evidence shows only a subset genuinely have free officer data — see §3.2.)
- **Only 3 of 31 handlers** currently set `tier_2_available: true` (DE, GR, US-Cobalt). Only 2 of 31 set `ubo_availability: available` (UK, and DK which was subsequently corrected to `unavailable_no_registry`).
- **Cost discipline (Petter's rule, applied throughout the corpus):** per-call passthrough OK; fixed/subscription/monthly-minimum NOT OK for v1. This rule alone disqualified Creditsafe, Northdata, Dato Capital, InfoVeriti, WellData, companyapi.hu, OpenCorporates.
- **Demand evidence:** "company" is the **#1 website search term (37×)**, while EU registry capabilities are the **worst-performing group in the catalogue** (danish 0/11, swiss 0/5, estonian 0/2, finnish 2/9). Shopped-for and undeliverable. Direction plan §2 confirms: Danish 0%, Swiss 0%, Finnish 17%, Belgian 33%, US 36%, UK 47%, French 53%, German 67%.
- **Direction plan §4.2 readiness:** "EU30 director/UBO coverage: 2–5 of 30 countries binding-ready. T3 EDD: 0 of 30. The compliance product is roughly 25% done, and the 25% that exists is the least reliable part of the platform."

---

## 2. STEP 2 — Fresh research on the gaps

Rubric applied per source: licence · commercial use + redistribution · rate limits (a tier too small to
serve real traffic is disqualified as a primary, per the founder's explicit exclusion of the
OpenRegister 50/mo shape) · API vs bulk vs scrape · freshness · effort.

### 2.1 AUSTRIA — the headline unlock ★

**Firmenbuch High-Value-Dataset API** — https://www.data.gv.at/katalog/dataset/high-value-datasets-hvd-des-firmenbuchs · https://justizonline.gv.at/jop/web/iwg

- **Live since January 2025**, published by the Federal Ministry of Justice (BMJ) under **Commission
  Implementing Regulation (EU) 2023/138, Annex 5** ("companies and company ownership" HVD category).
- **Covers:** entity existence/status, registry ID (FN), address, legal form, **officers / managing
  directors / involved persons**, branch offices, registration acts, change history
  (`VERAENDERUNGENFIRMAREQUEST`), and **source documents including annual accounts** (`URKUNDEREQUEST`).
- **Access:** SOAP 1.1/1.2 — `SUCHEFIRMAREQUEST` (search), `AUSZUGREQUEST` (extract), `URKUNDEREQUEST`
  (documents). WSDL at `justizonline.gv.at/jop/api/at.gv.justiz.fbw/ws/fbw.wsdl`.
- **Licence: CC BY 4.0** (confirmed against data.gv.at listing + BMJ/JustizOnline IWG terms).
  Austria's IWG explicitly extends reuse to legal entities **for commercial and non-commercial purposes**.
- **Cost: free.** Auth: **free API key** self-retrieved in JustizOnline. No paid contract.
- **Rate limits: NOT PUBLISHED.** The API documentation explicitly says to contact the Firmenbuch
  integration team for production keys and rate limits. **This is the one open risk.**
- **Freshness:** real-time (queries the live Firmenbuch).
- **Effort:** medium — SOAP rather than REST, and obtaining a production key involves contacting BMJ.
- **Verdict: USABLE AS PRIMARY.** This supersedes the corpus's "AT = Tier 3, paid only" verdict and the
  DEACTIVATED-map note that AT is served by Openapi WW-Top (which returns **no directors**).
  It is free, official, licensed for commercial reuse, and carries the officer leg Openapi cannot.

**AT insolvency — Ediktsdatei** (`edikte.justiz.gv.at`): **free JSON API with pagination** exists under
the same IWG framework; requires ID-Austria registration + a **manual reuse-approval application**.
Free, real-time, official. Usable, but not zero-friction.

**AT UBO — WiEReG:** restricted. Access requires demonstrated legitimate interest or AML-obliged status;
€3–10 per extract; tightened again Oct 2025. **Not usable, at any price, for redistribution.**

### 2.2 SPAIN — a real, cheap unlock (with a dependency caveat)

**OpenMercantil** — https://openmercantil.es/para-desarrolladores
- Third-party normalised database built by accumulating the official BORME gazette.
- **Covers:** entity existence/status, registry/tax ID, legal form, capital, CNAE, LEI, **officers
  (969k individuals)**, and 7.1M registry acts (constitutions, appointments, capital changes,
  bankruptcies, mergers) over 2.8M companies.
- **Licence: CC BY 4.0**, explicitly named, with a required attribution string.
- **Cost: free tier 200 req/day, no auth.** Professional €57/mo (5,000/day), MAX €197/mo (50,000/day).
- **Access:** REST API (JSON) + bulk CSV/Parquet. **Effort: low.**
- **Caveats — material:** (a) self-declared **"not an official source"**; (b) it is a small
  single-operator project — durability of both the service and the CC BY 4.0 commitment is a real
  dependency risk for a paid product; (c) update cadence not independently verified.
- **Verdict: USABLE AS PRIMARY with an explicit second-source strategy.**

**Official BOE / BORME Open Data API** — https://www.boe.es/datosabiertos/api/api.php
- REST, **XML + JSON**, OpenAPI 3.1.0 spec, XSD schemas, historical coverage **from January 2009**, free,
  no key observed, daily publication.
- **This is a GAZETTE, not a register.** It answers "what happened" not "what is true now". Serving
  current status requires ingesting the full daily feed since 2009 and building your own current-state
  DB — a real pipeline, not an integration.
- **Licence: UNCLEAR.** Users must accept BOE's "condiciones de reutilización"; the exact licence
  name/version was not resolved. **Must be read directly before any build.**
- **Verdict: USABLE AS PRIMARY (authoritative fallback / cross-check), medium-high effort.**

**ES insolvency (Registro Público Concursal):** free to search, **no API**, no reuse licence published,
and resolutions carry personal-data erasure obligations. **NOT USABLE.**

### 2.3 GERMANY — no free path exists. Confirmed.

- **handelsregister.de** — free to retrieve since the Aug 2022 DiRUG reform, but: **no official API**,
  **60 queries/hour cap**, and the operating court (AG Hagen) states it provides "neither an API for
  automated queries nor a complete download of the register". No open licence; no commercial
  redistribution grant. **NOT USABLE AS PRIMARY.**
- **Unternehmensregister / Bundesanzeiger** — no open retrieval API for third parties; ~€1/document.
  **NOT USABLE AS PRIMARY.**
- **OffeneRegister.de** — correct licence (**CC BY 4.0**, commercial use permitted) but the data is
  **stale to roughly end-2018/Feb-2019** and refresh is not automated (corroborated by OpenSanctions'
  own ingestion of the same dump). ~7 years out of date. **NOT USABLE except as historical cross-reference.**
- **govdata.de / bund.dev / bundesAPI** — **no official German government API for company register data
  exists.** The `bundesAPI/handelsregister` repo is a community scraper of the portal, subject to the
  same terms and cap.
- **insolvenzbekanntmachungen.de** — web portal only, no official API, no redistribution grant.
- **OpenRegister (api.openregister.de)** — commercial vendor. Free tier = **500 credits/month**, and a
  company lookup costs 10 credits (20 with `realtime=true`) → **~50 lookups/month**. Pro 5,000
  credits/mo, Business 30,000 credits/mo, €0.01/credit overage. Redistribution rights **not confirmed** —
  proprietary ToS, needs direct legal confirmation.
- **Verdict: Germany has no free primary. The existing 50-lookups/month posture means DE is not
  sellable at volume.** This is a paid-vendor decision, not a research gap.

### 2.4 NETHERLANDS — the HVD is a decoy

**KVK Business Register Open Data Set (Basic Company Information)** — free, **CC BY 4.0**, commercial
reuse and redistribution permitted, updated every working day, bulk ZIP/CSV + free API (no key).

But the fields are: start date, active flag, insolvency indicator, legal structure, **first two digits
of the postcode only**, SBI activity codes, member state. **Explicitly excluded: company names, full
addresses, KVK numbers, director information, trade names.** The API rate limit is **1 request per
minute per IP** (100 per 5 min across all users), and the terms state: *"It is not permitted to enrich
this HVDS in such a way that the data can be traced back to an individual person."*

**Verdict: NOT USABLE for KYB.** This is a statistical dataset, not a register. NL's HVD compliance
does not deliver entity lookup. Paid KVK Basisprofiel remains the only path; a KVK **UBO API is
signposted for 2026** but access will be obliged-entity gated.

**Generalisable lesson: HVD compliance is wildly uneven.** Sweden published a real free API (but without
officers), Austria published a real free API **with** officers, the Netherlands published anonymised
statistics. "The EU HVD regime will fix coverage" is false as a general claim — it must be checked
country by country, at the field level.

### 2.5 ITALY / PORTUGAL — no free path

- **IT:** Registro Imprese / InfoCamere is the authoritative source and is a **paid, ToS-gated
  commercial contract**; redistribution rights unpublished. Open data (dati.gov.it, regional CCIAA
  portals) is CC-BY/CC0/IODL-licensed but **aggregate statistics only** — wrong shape. Insolvency is a
  field inside the paid register, not a separate feed. *(`portalecreditori.it` is a private Fallco
  product, not public data — do not treat it as a source.)* **Confirms deactivated posture.**
- **PT:** Every open/CC-licensed dataset on dados.gov.pt is aggregate counts (registry *activity
  volume*), not records. `publicacoes.mj.pt` is a gazette with **no API**, a **10-day maximum search
  window**, and **no stated reuse licence**. Certidão Permanente is €25–100 per certificate, manual.
  Citius (insolvency) is web-only, no licence. **RCBE (UBO) had public access removed by Decree-Law
  115/2025, effective 1 Nov 2025** — actively closing, not opening.
  **PT is the weakest country examined. No free path.**

### 2.6 UBO EU-wide, post-CJEU — the structural ceiling

- **CJEU C-37/20 (Nov 2022)** invalidated the AMLD5 general-public access provision. Registers closed
  across the EU: BE (Feb 2023), CY (Jan 2023), LU, NL, DE, AT, HR, HU, MT, PT, IT.
- **AMLD6 (Directive (EU) 2024/1640)** restores access for **persons with legitimate interest** —
  framed around journalists and civil-society organisations — plus obliged entities. Comprehensive
  legitimate-interest access was due **10 July 2025**; further register provisions **10 July 2026**;
  general transposition **10 July 2027**, with some access provisions phased to **2029**. Several
  member states have already missed deadlines and are in infringement proceedings.
  **AMLR (Regulation (EU) 2024/1624)** applies directly from **10 July 2027**. AMLA has been operational
  in Frankfurt since 1 July 2025.
- **Strale is neither an obliged entity nor a journalist/CSO.** There is no route by which a commercial
  data reseller acquires legitimate-interest access to closed UBO registers. This is settled law, not a
  sourcing problem, and **no workaround should be proposed.**
- **Free UBO therefore exists in exactly:**
  - **UK — Companies House PSC register.** Public, free, already **Live** in `beneficial-ownership-lookup.ts`.
  - **DK — public BO register (reelle ejere).** Public and free; **Strale has no integration**. Reachable
    via the same CVR S2S credential that unlocks DK officers.
  - **Partial proxy — GLEIF Level 2 "who owns whom".** Free, open, CC0-equivalent, bulk + API
    (Golden Copy / Concatenated files + REST). **But it is accounting-consolidation parentage
    (direct + ultimate accounting consolidating parent), not AML beneficial ownership**, and it only
    covers entities where both child and parent hold LEIs. Honest framing required: it is a corporate-
    structure signal, not a UBO answer, and must never be labelled `ubo_availability: available`.
- **OpenOwnership Register CLOSED on 29 November 2024.** Only republished datasets survive at
  `bods-data.openownership.org` — and those are **just two**: GLEIF, and UK PSC + Overseas Entities.
  Both **CC0 1.0**, commercial use permitted, but **last updated 2025-03-11** and self-described as
  "a work in progress… treated with caution". **This invalidates the direction plan §4 vendor-stack
  line "UBO: Nordic registers + OpenOwnership — Partially built."** OpenOwnership is no longer a
  Nordic UBO path; it adds nothing Strale can't get directly from GLEIF and Companies House.

### 2.7 Insolvency — per-country reality

- **EU Insolvency Registers Interconnection (IRI)**, `webgate.ec.europa.eu/iri` — free, harmonised
  mandatory information under Art. 25 of Regulation (EU) 2015/848. But: **web search interface only, no
  API**, Denmark excluded by treaty, and **not all member states are connected** (built with AT, CZ, EE,
  DE, NL, RO, SI). **Not usable as a programmatic source.**
- **Free and usable today:** FR **BODACC** (open data — `fr-bodacc-lookup` already Committed, needs
  finishing), UK (`insolvency-check` Live), NO (`no-bankruptcy-check` Live), AT **Ediktsdatei** (free
  JSON, manual IWG approval), NL (insolvency indicator present even in the anonymised HVD, so it is
  carried in the paid Basisprofiel too).
- **No usable free source:** DE (no API), ES (no API + erasure obligations), PT (no API), IT (field
  inside a paid register), DK (gazette only), SE (PoIT gazette, no read API).

### 2.8 United States

No free national registry exists. **SEC EDGAR** is free, no auth, ~10 req/s — but covers only ~13k
filers. All 50 state Secretary-of-State portals offer free browser search; bulk/API availability varies
by state and most are paid or authorised-requester-only. Aggregators (Cobalt $0.50–2.00/lookup,
GovFiles free tier 1,000 rows/mo) are commercial. **FinCEN BOI (UBO) is not accessible to Strale.**
US remains structurally the weakest major market for a free-sourced KYB product.

---

## 3. STEP 3 — The KYB-replacement scorecard

Legs scored: (1) entity existence, (2) status, (3) registry ID, (4) address, (5) legal form,
(6) officers, (7) UBO, (8) sanctions/PEP, (9) adverse media, (10) VAT/LEI validation.

Legs 8–10 are **already solved everywhere**: Dilisense (sanctions/PEP/adverse media, live, cheap,
global) + VIES/GLEIF (free, live). So the per-market variable is legs 1–7. Scores below count the full 10.

### 3.1 Scorecard

| Market | Today | After building the free sources found | Remains vendor-only / impossible |
|---|---|---|---|
| **UK** | **9/10** — identity, officers (API exists), UBO via PSC, insolvency, all free | **10/10** — extract officers in handler | — (structurally the best free KYB market in the world) |
| **FR** | **8.5/10** — 7/7 identity, 5/5 directors, BODACC insolvency committed | **9/10** — finish BODACC | UBO (RBE admin-only) |
| **Nordics (NO/DK/SE/FI)** | **~6/10** — identity live; officers only NO (unextracted); DK 0% and FI 17% in prod | **~8/10** — NO+DK officers, DK UBO, via free CVR S2S credential | **SE officers** (paid subscription), **FI officers** (paid Virre), SE/FI/NO UBO |
| **DE** | **~5.5/10** — identity + officers, but capped at **~50 lookups/month** | **~5.5/10 — no free improvement available** | Everything at volume. Paid vendor or nothing. UBO restricted (GwG §23) |
| **AT** | **~4/10** — Openapi identity, **no directors** | **~8/10 ★** — Firmenbuch HVD API adds officers + financials + change history, free, CC BY 4.0; Ediktsdatei adds insolvency | UBO (WiEReG, AML-obliged only) |
| **BENELUX** | **BE ~6/10** (identity live, 33% prod); **NL ~4/10**; **LU ~4/10** | **BE ~7/10** (officers at €0.025/call — effectively free at Strale's price point); **NL/LU: no free improvement** | BE/NL/LU UBO all closed post-CJEU. NL + LU officers vendor-only |
| **S-EU** | **ES ~4/10; IT ~4/10; PT ~4/10; GR ~5/10; CY ~6/10; MT ~4/10** | **ES ~7.5/10 ★** (OpenMercantil officers + acts); **CY ~7/10 ★** (bulk officers, re-verify); **GR ~6/10** only if Path-4 is authorised; **IT/PT/MT: no free improvement** | IT/PT/MT officers vendor-only. UBO closed in all six |
| **US** | **~3.5/10** — SEC EDGAR only (~13k filers); 36% prod completion | **~3.5/10 — no free improvement** | Private-company identity, officers, UBO — all vendor-only or legally closed |

### 3.2 The honest ceiling, stated plainly

1. **UBO is a legal gate, not a budget gate.** Free UBO reaches exactly **UK and DK**, plus GLEIF L2 as
   an explicitly-labelled non-AML corporate-structure proxy. Every other EU register is closed to Strale
   by CJEU C-37/20 and will remain so under AMLD6 unless Strale becomes an obliged entity. There is no
   workaround and none should be built. **Therefore a free-sourced KYB product cannot serve Use-case
   Tier 3 (EDD) — the exact tier AML-obliged buyers require.**
2. **Officers are free in roughly 9 countries, not 30.** Genuinely free named-officer data exists in:
   **NO, CZ, EE, SK, UK, FR, CY, AT (new), LV (partial, codes redacted)**, plus **DK** after a free
   3-week credential and **ES** via a third-party CC BY 4.0 database. Explicitly **not free**: SE, FI,
   PL (masked by law + criminal penalty), LT, HR, MT, HU, LU, IT, PT, NL, DE-at-volume.
3. **Germany cannot be fixed for free.** The largest EU economy has no free machine-readable
   commercially-licensed source. This is the single most commercially significant hard "no".
4. **Insolvency is free in 4–5 countries** (UK, NO, FR, AT, partially NL) and unavailable free elsewhere.
   The EU IRI does not close this — no API.
5. **Financial statements / credit risk are proprietary everywhere.** Already settled by
   DEC-20260421-SE-B, DEC-20260405-B, DEC-20260422-SE-D.
6. **The reliability problem is not a sourcing problem.** Direction plan §2 and the 90-day usage analysis
   both say the registry layer is the *worst-performing* part of the platform in production — Danish
   0/13, Swiss 0/5, Estonian 0/2, Finnish 2/9 — while "company" is the **#1 website search term**.
   Adding free sources to a substrate that fails 0–17% of the time makes the problem bigger, not smaller.
   **Fixing what is already live outranks adding countries.**

---

## 4. Prioritised build list

Ranked by demand evidence × effort × licence safety. All items are free or effectively free.

### P0 — Fix and harvest what is already paid for (highest ROI, zero new sources, zero new cost)

| # | Item | Why | Effort |
|---|---|---|---|
| **1** | **Repair the 0%/low-completion live registries** — danish 0/13, swiss 0/5, estonian 0/2, finnish 2/9, belgian 33%, uk 47%, us 36% | #1 shopped category is undeliverable today. Nothing else on this list matters if the substrate fails. | Medium |
| **2** | **Officer-extraction sweep on registries that already expose officers free** — **NO, CZ, EE, SK, UK, LV(partial)** (+ FR already done) | The upstream data is already free and already being fetched. This is pure extraction work. Moves 6 countries from Evidence Tier 1 → Tier 2. Only 3 of 31 handlers currently set `tier_2_available: true`. | Low–Medium |
| **3** | **Send the DK CVR S2S credential application** (`cvrselvbetjening@erst.dk`) | Free, ~3-week lead time, unlocks **both** DK officers **and** DK UBO — the only free UBO outside the UK. A code comment suggests an application may already be pending; verify before re-sending. Do this first because the clock is the constraint. | Trivial (an email) |

### P1 — New free sources with clean licences

| # | Item | Licence | Why | Effort |
|---|---|---|---|---|
| **4** | **AT Firmenbuch HVD API** ★ | **CC BY 4.0**, commercial reuse explicit | Biggest single unlock. Free, official, real-time, adds officers + financials + change history that the current Openapi WW-Top path cannot return. Reclassifies AT out of "paid only". | Medium (SOAP; production key needs a BMJ contact) |
| **5** | **CY DRCOR bulk officers** | **CC BY 4.0** | 1.17M officer rows, monthly, free, no auth. **Re-verify liveness first (§4 V1).** | Low |
| **6** | **Finish `gleif-l2-ubo-lookup` + `gleif-l2-children-lookup`** (both already `Committed`) | CC0-equivalent, free | Corporate-structure signal, global, zero cost. **Must be labelled as accounting-consolidation parentage, NOT `ubo_availability: available`** — LEI-bearing entities only. | Low |
| **7** | **Finish `fr-bodacc-lookup`** (already `Committed`) | French open data | Free FR insolvency; completes the strongest EU market after UK. | Low |
| **8** | **ES via OpenMercantil** | **CC BY 4.0** + attribution string | Officers + acts for 2.8M companies; free 200/day, €57/mo at scale. **Requires a documented second-source/fallback plan** given single-operator risk. | Low |
| **9** | **AT Ediktsdatei insolvency** | IWG (same framework as #4) | Free JSON, real-time. Gated behind a manual ID-Austria + reuse-approval application — start it alongside #4. | Medium |

### P2 — Blocked on a decision, not on research

| # | Item | Blocker |
|---|---|---|
| 10 | **DE at volume** | No free path exists. Either buy OpenRegister Business (and get redistribution rights confirmed in writing), or accept DE is not sellable. **Petter decision.** |
| 11 | **GR, and possibly MT/HU/CY-realtime** | Free-by-statute HTML with no API. Buildable *only* if DEC-20260518-F Path 4 is authorised for these registries. **Petter decision — see F1.** |
| 12 | **NL, IT, PT, LU, MT** | Vendor-only. Openapi is integrated but returns no directors outside Italy. No free path found. |
| 13 | **US private companies** | No free national source. Vendor-only. |

---

## 5. Flags requiring a DEC or a Petter decision

**F1 — Live doctrine tension: DEC-20260428-A vs DEC-20260518-F.**
DEC-20260518-F is **active** and explicitly permits targeted per-call HTML/PDF parsing of
statutorily-public registry pages under four constraints. But the DEACTIVATED map in
`auto-register.ts` was written under the earlier absolutist reading of DEC-20260428-A ("a self-operated
scraper against a government UI is still a self-operated scraper… the doctrine is absolute"), and the
enumeration sessions recorded that **every country was blocked on Path 6 regardless**, because the
Tier-1 absolute overrode the Path-4 permission. These two positions cannot both be operative.
Resolving this one way or the other changes the answer for **GR (free by statute), MT, HU, CY-realtime,
and the BE Moniteur Belge historical officer trail** — the enumeration explicitly called BE's Moniteur
"the sharpest open Tier-1 scope question in this whole series."
**Needs an explicit ruling. Do not build on Path 4 until it lands.**

**F2 — Direction plan §4 vendor stack is stale on UBO.**
It lists *"UBO — Nordic registers + OpenOwnership — Partially built."* **The OpenOwnership Register
closed 29 November 2024.** The surviving republished datasets are only GLEIF and UK PSC, last updated
2025-03-11, self-flagged as work-in-progress. OpenOwnership is not a Nordic UBO path and never will be.
The correct free-UBO statement is: **UK PSC (live) + DK public register (unbuilt) + GLEIF L2 as a
labelled non-AML proxy.** Needs a correction where that vendor stack is canonical.

**F3 — Austria's classification is wrong in code and in the corpus.**
AT is currently served by Openapi WW-Top (Tier 3 vendor, `OPENAPI_ENABLED`-gated, no directors), and the
corpus records AT as "Tier 3, paid only." A free official CC BY 4.0 API with officers has existed since
January 2025. Whether this warrants a DEC or just a re-classification is Petter's call, but the
`austrian-company-data` coverage-matrix row and the vendor-stack narrative are both currently inaccurate.

**F4 — The strategic consequence of the UBO ceiling.**
Free sources support **Use-case Tier 1 (Continuity)** and **Tier 2 (Onboarding)** across ~12–15
countries. They **cannot** support **Tier 3 (EDD)**. Since Tier 3 is what AML-obliged buyers need, a
free-sourced KYB offering is structurally a **non-obliged-buyer product** — procurement, marketplace
onboarding, vendor management, invoice/payee verification — not a bank/EMI/VASP product. This is a
positioning decision that follows directly from the sourcing reality, and it aligns with direction plan
§4.3's wedge (b) "Payee/invoice fraud prevention for finance teams." Worth making explicit before any
compliance-brand work resumes.

**F5 — Direction plan §4.5 gating still applies.**
This report is sourcing research, not a launch recommendation. §4.5 requires a committed design partner,
organic inbound demand growth, or a sales hire before the compliance business starts. Items P0-1 through
P0-3 are worth doing **regardless**, because they fix live capabilities that real customers are already
calling and failing on — but P1/P2 country expansion should stay gated.

**V1 — Verification debt (must clear before building on these).**
- **CY** `data.gov.cy` DRCOR officer CSVs — live-probed HTTP 200 on 2026-05-18; **could not re-confirm
  this session** (portal URLs 404'd, search inconclusive). Direct probe required before committing.
- **AT** Firmenbuch HVD **rate limits are unpublished** — must be obtained from the BMJ integration team.
  If they are restrictive, the AT unlock shrinks.
- **BOE/BORME** exact reuse-licence text — unresolved; read `condiciones de reutilización` directly.
- **SE** free `företrädare` downloadable — strong indication it is **aggregate statistics** (age/gender),
  not named individuals; Bolagsverket CAPTCHA-blocks automated verification. Resolve manually before
  anyone re-proposes it as a free SE officer path.
- **IE** CRO CKAN directors field — still "could not verify", unchanged since May.
- **OpenRegister** redistribution rights — proprietary ToS, never confirmed. Confirm before any DE spend.

---

## 6. Sources

Repo: `audit-output/registry-source-research-2026-05-18.md`, `audit-output/exhaustive-enumeration-{se-dk,pl-lt,hr-ee-be,phase-6-mt-cy-hu-lu}-2026-05-18.md`, `audit-output/ubo-activation-uk-dk-2026-05-18.md`, `audit-output/labeling-sweep-summary-2026-05-18.md`, `docs/strategy/2026-08-05-direction-plan.md`, `apps/api/src/capabilities/auto-register.ts`, `apps/api/coverage-matrix/*.yaml`, `handoff/_general/from-code/2026-08-09-usage-analysis-capability-buildout.md`

Notion page IDs as listed in §1.

Web:
- https://eur-lex.europa.eu/eli/reg_impl/2023/138/oj/eng
- https://data.europa.eu/en/news-events/news/high-value-datasets-what-has-changed-and-what-will-come-next
- https://www.data.gv.at/katalog/dataset/high-value-datasets-hvd-des-firmenbuchs
- https://justizonline.gv.at/jop/web/iwg — https://justizonline.gv.at/jop/web/iwg/terms
- https://github.com/Open-Justiz-Online/companyregister-api-documentation
- https://www.justiz.gv.at/service/digitale-justiz/ediktsdatei-und-kundmachungen-der-justiz.96a.de.html
- https://www.bmf.gv.at (WiEReG FAQs)
- https://www.kvk.nl/en/ordering-products/kvk-business-register-open-data-set/
- https://developers.kvk.nl/documentation/open-dataset-basis-bedrijfsgegevens-api
- https://openmercantil.es/para-desarrolladores
- https://www.boe.es/datosabiertos/api/api.php — https://www.boe.es/datosabiertos/faq/borme.php
- https://offeneregister.de/ — https://www.opensanctions.org/datasets/de_offeneregister/
- https://openregister.de/en/pricing — https://docs.openregister.de/pricing
- https://www.unternehmensregister.de/de — https://www.handelsregister.de
- https://www.registroimprese.it/ — https://www.dati.gov.it/sviluppatori/faq
- https://publicacoes.mj.pt/ — https://dados.gov.pt/pages/datasets/insolvencia — https://rcbe.justica.gov.pt/
- https://www.citius.mj.pt/ — https://www.publicidadconcursal.es/
- https://www.gleif.org/en/lei-data/access-and-use-lei-data/level-2-data-who-owns-whom
- https://www.openownership.org/en/news/structured-bulk-data-now-available-from-the-open-ownership-register/ — https://bods-data.openownership.org/
- https://opencorporates.com/pricing/ — https://api.opencorporates.com/
- https://e-justice.europa.eu/topics/registers-business-insolvency-land/bankruptcy-and-insolvency-registers_en — https://webgate.ec.europa.eu/iri/index.html
- https://www.europarl.europa.eu/legislative-train/theme-an-economy-that-works-for-people/file-6th-directive-on-amlcft-(amld6) — https://www.step.org/industry-news/several-eu-member-states-miss-deadline-public-access-beneficial-ownership-registers
- https://bolagsverket.se/apierochoppnadata/hamtaforetagsinformation/nedladdningsbarafiler.2517.html
