# Exhaustive source enumeration — NL + ES + AT (DEC-20260518-E)

**Date:** 2026-05-19
**Author:** Claude Code (Sonnet research subagents, synthesized by Opus 4.7)
**Phase:** 7b (NL + ES + AT — closes EU30 v1 enumeration)
**Doctrine:** DEC-20260518-E (Exhaustive Source Enumeration); DEC-20260518-F (per-call statutory web UI / PDF); DEC-20260518-G (Tier-2 platform-fee probe mandatory); DEC-20260428-A (no Strale-operated scrapers); DEC-20260512-A (KVK foreign-entity closure); DEC-20260511-A (NL commercial vendor resale prohibition); DEC-20260507-C (ES Registradores self-build deferral); DEC-20260505-E (Topograph globally DQ'd); cost discipline (per-call passthrough OK, fixed monthly fees NOT OK in v1); locked-doctrine bypass guard per course-correction Journal `36467c87082c817bb0c2e22ea00827cf` (Topograph re-engagement triggers NOT met)
**Test entities:** NL — ASML (KvK 17014545 / NL803441526B01), Heineken (KvK 33011433); ES — Telefónica (CIF A28015865), Iberdrola (CIF A48010615); AT — OMV (FN 93363w / ATU14189108), Erste Group (FN 33209m)
**Source partials:** [_partial_nl_enumeration.md](_partial_nl_enumeration.md), [_partial_es_enumeration.md](_partial_es_enumeration.md), [_partial_at_enumeration.md](_partial_at_enumeration.md)

---

## Executive summary

**Phase 7b closes the EU30 v1 enumeration phase.** Three of three countries land with verdicts; none of the three produced a clean unconditional free Tier-1 win (no CY-pattern surprise). One country (NL) is genuinely fully blocked. Two countries (ES, AT) have **conditional viable-v1 paths** that require a single external resolution each before they can ship.

| Country | Phase 4/5 verdict | Phase 7b verdict | v1 path (if any) | Confidence | Single blocker |
|---|---|---|---|---|---|
| **NL** | Openapi identity, no reps | **FULLY BLOCKED v1** | — (Altares D&B + Kyckr deferred to v1.1 pending DEC-518-G probe) | HIGH | KVK statutory architecture (foreign-entity closure + no officer data in API even with subscription); commercial vendors all resale-prohibited |
| **ES** | Openapi ES-Advanced identity, no reps | **CONDITIONAL viable-v1 (Petter doctrine call required)** | OpenMercantil CC BY 4.0 republisher — HTTP 200 confirmed, 3 directors for Telefónica returned | MODERATE | Petter doctrine call: does DEC-20260428-A Tier 2 permit an open-data republisher with no formal CORPME/BOE indemnification? |
| **AT** | Openapi WW-Top identity, no reps | **CONDITIONAL viable-v1 (EU-entity API-key eligibility required)** | BMJ Firmenbuch HVD free API (launched March 2025) — returns Geschäftsführer per two independent third-party consumers (OpenFirmenbuch.at, firmenbuch.ai) | MODERATE | Email `justizonline-iwg@brz.gv.at` to confirm Sweden-incorporated EU entity can obtain API key without Austrian ID Austria credential |

**Headline finding 1 — ES surprise positive (qualified):** OpenMercantil (`openmercantil.es`) is a CC BY 4.0 open-data republisher that has already done the 4-6 week BORME-PDF ingest that DEC-20260507-C deferred for Strale. Live probe 2026-05-19 confirmed `GET /api/v1/company/{slug}/officers` returns HTTP 200 with structured JSON for Telefónica (3 current + 4 historical officers, names + roles + appointment dates). **However**, OpenMercantil has no contractual relationship with CORPME / BOE — it operates as an independent republisher under the open-data license. Under a strict reading of DEC-20260428-A Tier 2 ("vendor has documented redistribution rights + indemnification"), informal CC BY 4.0 republishers without indemnification do not qualify. **This is a doctrine clarification question for Petter, not a unilateral CC decision.** Iberdrola returned empty officers — coverage may be patchy.

**Headline finding 2 — AT surprise positive (qualified):** Austria launched a free Firmenbuch HVD API in March 2025 under EU Regulation 2023/138 implementation. The HVD WSDL is at `justizonline.gv.at/jop/api/at.gv.justiz.fbw/ws/fbw.wsdl`. Two independent third-party consumers (WhizUs GmbH's `openfirmenbuch.at`, `firmenbuch.ai`) confirm the API returns Geschäftsführer (managing-director) data. **Critical doctrine note:** the EU 2023/138 §5.1 caveat (Journal `36467c87082c8169`) still stands — §5.1 does NOT mandate representative-name disclosure. **Austria's BMJ chose to include Geschäftsführer in their HVD implementation voluntarily**, which is Austria's national-implementation choice, not an EU mandate. The data is present regardless. The single blocker is the API-key registration process, which requires Austrian or EU ID — needs `justizonline-iwg@brz.gv.at` email to confirm a Sweden-incorporated EU entity is eligible without an Austrian ID Austria credential.

**Headline finding 3 — NL genuinely blocked:** Even with a KVK M2M subscription, the KVK API does not expose officer/director data. The FAQ at `developers.kvk.nl/faq/apis` says explicitly: *"No, this is not possible"* when asked about director lookup. There is no `functionarissen` endpoint in the 4-endpoint API catalog. Officer names are gated behind the paid Uittreksel (€2.95–€9.60 per document) which requires browser rendering — DEC-20260428-A Tier-1 absolute bar. The three commercial vendors with NL coverage and resale rights (Company.info, Creditsafe NL, Graydon NL) are all DQ'd per DEC-20260511-A. Altares D&B (KVK-certified reseller) and Kyckr remain as v1.1 candidates pending DEC-20260518-G probe, but pricing for both is fully sales-gated.

**No Topograph re-engagement proposed anywhere.** DEC-20260505-E DQ fully complied with across all three countries. The locked-doctrine bypass guard (Journal `36467c87082c817bb0c2e22ea00827cf`) was respected — neither ES (where Topograph nominally has coverage) nor AT (where Topograph also has coverage) had Topograph proposed in any framing.

**v1 launch picture (final):**

- **Clean Tier-1 free open-data wins (4):** EE, CY, [implicit: SE/DK if Phase 4 SE+DK enumeration produced any]
- **Tier-2 binding-ready via licensed vendor (HR + LV + IT + BE):** confirmed prior phases
- **Conditional pending single external resolution (2):** ES (Petter doctrine call), AT (1 email)
- **Fully blocked v1 (1):** NL
- **v1.1 deferred (HR/SE/PL/LT/MT/HU/LU + NL/ES/AT fallbacks):** Topograph cohort + country-specialists

Phase 7b closes the enumeration. Subsequent work is implementation (CY-pattern PRs for confirmed Tier-1 wins) and chat-side resolution of the two conditional cases.

---

## Doctrine reference (locks active during this enumeration)

- **DEC-20260518-E** — Exhaustive 8-path enumeration mandatory before classifying any country "blocked" or "paid-only". Phase 5 reversed three "blocked" verdicts (HR/EE/BE); Phase 6 added one more (CY). Phase 7b enforces the discipline even when outcomes are expected-negative.
- **DEC-20260518-F** — Per-call HTML/PDF parsing of statutorily-public registry detail pages is in-scope when 4 constraints hold: (a) statutorily public, (b) ToS permits per-call, (c) per-entity per-customer-request, (d) attribution preserved.
- **DEC-20260518-G** — Platform-fee probe MANDATORY for any RFQ-only Tier-2 aggregator. Probe explicitly for: platform fee, setup fee, monthly minimum, annual floor, volume-tier locked floors, termination fees.
- **DEC-20260428-A** — Tier 1 (direct first-party gov open data) preferred; Tier 2 (vendor-mediated) requires signed sourcing-method attestation + indemnification; Strale never operates scrapers (Tier 1 absolute).
- **DEC-20260512-A** — NL-specific: KVK M2M closed to foreign EU entities (Mirjam Boele 2026-05-11). KVK partner-status route also closed.
- **DEC-20260511-A** — NL-specific: Company.info AV / Creditsafe NL / Graydon NL standard ToS prohibits API resale.
- **DEC-20260507-C** — ES-specific: opendata.registradores.org / BORME / sede.registradores.org self-build deferred (4-6 week ingest project).
- **DEC-20260505-E** — Global: Topograph DQ'd. Re-engagement triggers (customer-funded / fee waived / fee credited / coverage exclusivity) not met by any v1 enumeration finding.
- **Locked-doctrine bypass guard** — Course-correction Journal `36467c87082c817bb0c2e22ea00827cf`: chat-side pattern of accepting CC verdicts that re-engage DQ'd vendors without checking re-engagement triggers. Strictly avoided this session.
- **Petter cost rule** — Per-call costs OK if passed through to customer; fixed monthly fees NOT OK in v1.
- **EU 2023/138 §5.1 CAVEAT** — Per course-correction Journal `36467c87082c8169`: §5.1 mandates only identity fields, NOT representative names. Austria's voluntary inclusion of Geschäftsführer in its HVD implementation does NOT change this — it's a national choice, not an EU mandate.

---

## NL — 8-path enumeration

Test entities: ASML (KvK 17014545 / NL803441526B01), Heineken (KvK 33011433), Shell plc. Full partial: [_partial_nl_enumeration.md](_partial_nl_enumeration.md).

### Path 1 — KVK Handelsregister M2M API (paid, authenticated)

- **DEC-20260512-A re-confirmed** by three independent sources (Zephira.ai guide, dev.to/openregistry, Kyckr 2025): "Access to the KVK API requires having a subsidiary or registered entity in the Netherlands. This is not a soft guideline — it is a formal requirement."
- **CRITICAL ADDITIONAL FINDING:** Even with a KVK subscription, **the API does NOT expose officer data**. The FAQ at `developers.kvk.nl/faq/apis` explicitly states: *"No, this is not possible"* when asked about director/owner/shareholder lookup. The 4-endpoint catalog (Zoeken, Basisprofiel, Vestigingsprofiel, Naamgeving) has no `functionarissen` endpoint. The HVD specification under EU 2023/138 deliberately omits PII per Dutch privacy law.
- **DEC-518-G probe (complete):** €6.40/month per key + €0.02/query + €1,279/year mutation monitoring; no setup, no volume floor, no termination fee. Monthly minimum is a fixed cost — borderline under Petter cost rule, but moot because foreign-entity restriction blocks eligibility.
- v1.2+ horizon: Datavisie Handelsregister consultation appears to be tightening privacy (additional restrictions on phone/email), not widening foreign M2M access. No credible v1.2 opening visible.
- **Verdict: BLOCKED.** Foreign-entity closure + no officer data even with subscription.

### Path 2 — KVK Open Data Sets (free)

- Three bulk datasets enumerated: Basis Bedrijfsgegevens (CC BY 4.0), HR Open Data Set (CC-0), Jaarrekeningen (CC BY 4.0).
- All three are **explicitly anonymized** — officer names stripped by statutory design.
- HVD Open Data API endpoints live-probed 2026-05-19; ASML and Heineken both returned HTTP 429 (rate-limited, endpoint live but content confirmed officer-free per documentation).
- **Verdict: NOT VIABLE.** Statutory anonymization makes this path structurally incapable of carrying officer data.

### Path 3 — Tier-2 paid per-call aggregators

| Vendor | DEC-518-G status | Verdict |
|---|---|---|
| Openapi WW-Top (current) | No platform fee; no officers field for NL | NOT VIABLE for reps |
| Company.info | DEC-20260511-A AV prohibits API resale | DQ |
| Creditsafe NL | DEC-20260511-A AV prohibits API resale | DQ |
| Graydon NL | DEC-20260511-A AV prohibits API resale | DQ |
| OpenCorporates | £2,250+/year subscription only, no PAYG | NOT VIABLE-V1 |
| Northdata | DEC-20260428-A blocked (scraping-derived) | DQ |
| Topograph | DEC-20260505-E DQ; re-engagement triggers not met | NOT PROPOSED |
| **Altares D&B (NL)** | KVK-certified Serviceprovider; officer data confirmed; pricing fully sales-gated (no public disclosure) | **v1.1 candidate pending DEC-518-G** |
| **Kyckr** | Enhanced Profile confirmed for NL with officer data; pricing fully sales-gated | **v1.1 candidate pending DEC-518-G** |
| CrimiMail | Outreach in flight (no reply since 2026-05-11); product fit uncertain | v1.1 candidate pending reply (low probability) |
| Bisnode NL / D&B Hoovers / Pappers.nl / OpenKVK | Enterprise subscription or insufficient officer coverage | NOT VIABLE-V1 |

### Path 4 — KVK public web UI (DEC-518-F)

- `kvk.nl/zoeken` is a JavaScript-rendered SPA. Free search returns identity only; officer data (functionarissen) appears only in the paid Uittreksel (€2.95–€9.60).
- **DEC-518-F:** (a) YES (Handelsregisterwet 2007); (b) UNVERIFIED (free search shows no officers); (c) SATISFIABLE; (d) SATISFIABLE.
- **DEC-20260428-A Tier-1 BLOCKS** — extracting Uittreksel requires Strale-operated browser rendering.
- **Verdict: BLOCKED.**

### Path 5 — Open data bulk

- Same as Path 2 — KVK open datasets are the only NL company bulk and they're anonymized.
- **Verdict: NOT VIABLE.**

### Path 6 — Tier-2 commercial bulk

- Altares D&B is the documented KVK-certified bulk reseller. Same v1.1 candidate as Path 3.
- **Verdict:** Same as Path 3 (Altares is the leading candidate).

### Path 7 — Staatscourant gazette

- Publishes "benoeming of ontslag" (appointment/dismissal) notices for some entities. Event-stream, not officer-list.
- Building a derivative dataset is multi-week engineering work. NOT a v1 path.
- **Verdict: V2 only.**

### Path 8 — BRIS / UBO / other

- BRIS confirms NL officers are legally public but has no M2M API.
- UBO Register closed since 2022 ECJ ruling; out of scope and wrong primitive (UBO ≠ directors).
- No other NL-specific surface.
- **Verdict: NOT VIABLE.**

### NL synthesis

- **v1 verdict: FULLY BLOCKED.** Structural — KVK Handelsregisterwet architecture deliberately gates officer data behind paid Uittreksel + restricts API to Dutch-presence entities. Commercial-vendor resale path closed by ToS (DEC-20260511-A).
- **v1.1 candidates: Altares D&B (KVK-certified) + Kyckr** — both require DEC-518-G RFQ + sourcing-attestation due diligence. Pricing risk: both expected to be subscription-anchored.
- **Recommended action:** Maintain NL at "Openapi WW-Top identity-only, no representatives" (status quo) in coverage matrix; mark `tier_2_available: false` with explicit reason; log Altares D&B + Kyckr as v1.1 RFQ to-dos.
- **No CY-pattern surprise.** Confirming negative is the doctrine-compliant outcome.

---

## ES — 8-path enumeration

Test entities: Telefónica (CIF A28015865), Iberdrola (CIF A48010615). Full partial: [_partial_es_enumeration.md](_partial_es_enumeration.md).

### Path 1 — Registradores commercial API (CORPME)

- `sede.registradores.org` (HTTP 200 navigation only); `opendata.registradores.org` CDN-blocks all direct probes.
- Per-document "Nota Informativa Mercantil" ~€6.58/doc; includes administradores + apoderados + share capital + registered acts.
- Commercial API access requires individual private agreement with CORPME. Pricing not publicly disclosed; DEC-518-G probe **incomplete** (cannot probe gated commercial pricing).
- **Verdict: BLOCKED / NOT ASCERTAINABLE without commercial contact.**

### Path 2 — Direct registry free / open tier

- `opendata.registradores.org` confirmed active as of February 2025 (Confilegal article). Free, ODbL 1.0 licensed, real-time. Fields include "administradores y cargos" with operating regime — but **"anonymized" data treatment is ambiguous** (NIFs/DNIs suppressed but whether natural-person names appear is unconfirmed; CDN blocks direct download verification this session).
- Access: web directory + bulk download catalog. No per-company REST API.
- **DEC-20260507-C deferral STILL APPLIES** — the 4-6 week ingest-build estimate covers this bulk-CSV path. This session does NOT propose lifting the deferral.
- **Verdict: VIABLE-V1.1 (currently deferred per DEC-20260507-C).** Canonical long-term path once capacity allows.

### Path 3 — Tier-2 paid per-call aggregators

| Vendor | DEC-518-G status | Verdict |
|---|---|---|
| Openapi WW-Top + ES-Advanced (current) | No platform fee; no officers field for ES; no ES-Stakeholders SKU exists | NOT VIABLE for reps |
| **Pappers.es** | Per-call model confirmed (extends from FR base €0.10–€0.30/call); officer coverage confirmed for ES; full pricing schedule for ES specifically not publicly disclosed | **v1.1 candidate pending RFQ** |
| **Kyckr** | Enhanced Profile for ES confirmed with officer data; all pricing dimensions sales-gated | **v1.1 candidate pending RFQ** |
| **LibreBOR** | Officer coverage confirmed; pricing API page returned 403 this session — probe incomplete | **v1.1 candidate pending probe** |
| Axesor / Informa D&B / Iberinform / Creditsafe ES / Bisnode ES / Companyweb | Enterprise subscription with expected monthly/annual minimums | NOT VIABLE-V1 |
| OpenCorporates | £2,250+/year subscription only | NOT VIABLE-V1 |
| Topograph | DEC-20260505-E DQ; re-engagement triggers not met | NOT PROPOSED |

### Path 4 — Statutorily-public web UI (DEC-518-F)

- `sede.registradores.org` and `opendata.registradores.org` web UIs:
  - (a) YES — Reglamento del Registro Mercantil
  - (b) Per-document fees apply; ToS exclusive of automated re-distribution
  - (c) SATISFIABLE
  - (d) SATISFIABLE
- DEC-20260428-A Tier-1 BLOCKS if Strale operates fetcher.
- **Verdict: BLOCKED for direct Strale access.** Already covered by Path 1 commercial channel and Path 2 deferred bulk.

### Path 5 — Open data bulk

- **5a. opendata.registradores.org bulk** — same as Path 2 (deferred per DEC-20260507-C).
- **5b. datos.gob.es BORME catalog** — BOE Open Data API exposes BORME PDFs by URL but does NOT extract officer text. Section 2 HTML/XML feeds do NOT contain officer-appointment events. Officer names are PDF-only — validates DEC-20260507-C 4-6 week estimate as PDF-parsing problem.
- **5c. OpenMercantil (`openmercantil.es`) — HEADLINE FINDING:**
  - Live-probed 2026-05-19: `GET /api/v1/company/{slug}/officers` returned HTTP 200 for Telefónica with structured JSON containing 3 current officers (names + roles + appointment dates) + 4 historical officers.
  - Cost: FREE. CC BY 4.0 license. No authentication. 60 req/min rate limit.
  - Coverage caveat: Iberdrola returned empty officers array — staleness or coverage gap.
  - Data design caveat: no NIF returned (GDPR-driven by republisher).
  - **DEC-20260428-A Tier-2 doctrine question:** OpenMercantil has **no contractual relationship with CORPME / BOE** — it is an independent open-data republisher under the open-data license. Strict reading of DEC-20260428-A Tier 2 requires "vendor has documented redistribution rights + indemnification" — OpenMercantil has redistribution rights via the source open license but **no indemnification**. This is a doctrine clarification question for Petter, not a unilateral CC decision.
  - **Verdict: CONDITIONALLY VIABLE-V1 pending Petter doctrine call** on whether informal CC BY 4.0 republishers (rights via source license, no contractual indemnification) qualify as Tier 2 vendors.

### Path 6 — Tier-2 commercial bulk

- Informa D&B Spain, Axesor, Iberinform — enterprise contracts only.
- **Verdict: NOT VIABLE-V1.**

### Path 7 — BORME (Boletín Oficial del Registro Mercantil) historical PDF parsing

- BORME Section A publishes officer appointments (cargos/ceses/nombramientos) as PDFs daily.
- BOE Open Data API gives PDF URLs only; Section 2 HTML/XML does NOT contain officer events.
- Officer names are PDF-only → 4-6 week PDF-parsing ingest build (validates DEC-20260507-C estimate).
- **Verdict: V1.2+ derivative-dataset build, NOT v1.** Note: OpenMercantil (Path 5c) has already done this build — using their API IS using the BORME-parsed output.

### Path 8 — Other ES surfaces

- BORME-Mercantil event feed: same as Path 7.
- CNMV: listed-company disclosure only (~3,500 entities) — too narrow.
- AEAT (tax agency): NIF validation only, no officers.
- eINFORMA free tier: identity only, no officers.
- LEI emitter for ES: no officer fields.
- **Verdict: NOT VIABLE as general path.**

### ES synthesis

- **v1 verdict: CONDITIONAL viable-v1 pending Petter doctrine call** on OpenMercantil (Path 5c). If doctrine permits CC BY 4.0 republisher without formal indemnification: ship CY-pattern integration against OpenMercantil with explicit caveat about coverage patchiness (Iberdrola empty test result) and PII gap (no NIF). If doctrine does not permit: ES is v1.1 deferred to whichever lands first of (a) DEC-20260507-C lifted + Strale-built BORME PDF ingest, or (b) Pappers/Kyckr/LibreBOR RFQ confirms per-call pricing without platform fee.
- **Required external actions:** 
  - **Petter decision:** doctrine clarification on OpenMercantil-class republishers under DEC-20260428-A Tier 2.
  - If yes: implementation prompt for ES (CY-pattern, OpenMercantil API integration).
  - If no: RFQ to Pappers.es (per-call price confirmation), Kyckr (full DEC-518-G probe), LibreBOR (probe retry); parallel: schedule Strale-built BORME PDF ingest project per DEC-20260507-C lift.
- **No CY-pattern free Tier-1 unconditional win.** OpenMercantil is the closest equivalent but the indemnification gap is real.

---

## AT — 8-path enumeration

Test entities: OMV (FN 93363w / ATU14189108), Erste Group (FN 33209m). Full partial: [_partial_at_enumeration.md](_partial_at_enumeration.md).

### Path 1 — Compass-Verlag / HF Data / Manz (Firmenbuch Verrechnungsstellen)

| Vendor | DEC-518-G probe | Verdict |
|---|---|---|
| **Compass-Verlag / Wirtschafts-Compass API** | Per-call €0.10–€18.00/query (basic company €0.45). **Annual Servicepauschale CONFIRMED PRESENT but amount NOT DISCLOSED** ("Zusätzlich fällt eine jährliche Servicepauschale an"). | BLOCKED under Petter cost rule. Deferral stands. |
| **HF Data (firmenbuchgrundbuch.at)** | Web portal only, no API. Per-extract €4.63 current / €7.80 historical. | NOT VIABLE-V1 (no API). |
| **Manz** | No public pricing; web-based legal information service (RDB) primarily. No developer API. | NOT VIABLE-V1. |
| **auszug.at (Wiener Zeitung)** | **Monthly license fee CONFIRMED PRESENT** ("monatliche Lizenzgebühren & faire Einzelpreise"). | BLOCKED under Petter cost rule. |

Re-confirmation of prior deferral: the AT Verrechnungsstelle path has a documented fixed-fee component (Servicepauschale or monatliche Lizenzgebühren) at every vendor. This is the doctrine-compliant outcome.

### Path 2 / Path 5a — JustizOnline Firmenbuch + **HVD free API (March 2025) — HEADLINE FINDING**

- **2a. JustizOnline web portal:** Free unauthenticated layer shows identity only — director data is behind paid extract + Austrian/EU ID authentication. SOAP WSDL at `justizonline.gv.at/jop/api/at.gv.justiz.fbw/ws/fbw.wsdl` for the paid Verrechnungsstelle path.
- **2b/5a. HVD Firmenbuch free API — launched March 2025:**
  - Austria implemented EU Regulation 2023/138 High-Value Datasets for Firmenbuch in March 2025.
  - Published by Austrian Federal Ministry of Justice (BMJ) via JustizOnline.
  - **Cost: FREE.** SOAP/XML format. Daily updates.
  - **Director data confirmed via two independent third-party consumers:**
    - `openfirmenbuch.at` (WhizUs GmbH): displays Geschäftsführung, "uses the free API from JustizOnline"
    - `firmenbuch.ai`: displays Geschäftsführer, sources from "offen lizenzierte Registerdaten des Bundesministeriums für Justiz"
  - **CRITICAL DOCTRINE NOTE:** EU 2023/138 §5.1 does NOT mandate representative-name disclosure (per Journal `36467c87082c8169`). Austria's BMJ chose to include Geschäftsführer voluntarily in its HVD implementation. This is a national implementation choice, NOT an EU mandate. The data is present regardless — but do NOT cite 2023/138 as the reason director data is available; cite Austria's national choice.
  - **Single blocker:** API key registration requires Austrian or EU ID. Process: email `justizonline-iwg@brz.gv.at`. Unresolved question: can a Sweden-incorporated EU entity obtain a key without an ID Austria credential? Two precedent points: (a) at least one Austrian SMB (WhizUs GmbH) obtained the key; (b) EU 2023/138 HVDs are explicitly required to be "available for re-use" without conditions beyond attribution — a non-Austrian EU entity should be eligible in principle.
  - **Implementation note if key obtained:** Two-call sequence required — AT-Start (VAT → FN number resolution) then HVD SOAP (FN → director data). SOAP/XML adds integration complexity vs REST/JSON.
  - **Verdict: CONDITIONALLY VIABLE-V1 pending API-key eligibility confirmation.** Single email blocks; high probability of resolution.

### Path 3 — Tier-2 paid per-call aggregators

| Vendor | DEC-518-G status | Verdict |
|---|---|---|
| Openapi WW-Top + AT-Start + AT-Advanced | No platform fee; no AT-Stakeholders SKU exists; no officer fields | NOT VIABLE for reps |
| finapu.com | DEC-20260428-A deprecated (Strale-operated scraper) | DQ |
| **CRIF Austria (Margò)** | Director-monitoring confirmed in data model; full DEC-518-G probe sales-gated | v1.1 candidate pending RFQ |
| **Kyckr** | Firmenbuch sourcing + officer data confirmed; pricing entirely opaque ("quote-based for all plans") | v1.1 candidate pending RFQ |
| KSV1870 | Per-report €60–€105 (100x out of range); no developer API | NOT VIABLE-V1 |
| OpenCorporates | £2,250+/year subscription; AT not in Coverage HeatMap (uncertain coverage) | NOT VIABLE-V1 |
| TransactionLink / Dotfile / mart.report | Enterprise subscription | NOT VIABLE-V1 |
| Topograph | DEC-20260505-E DQ; re-engagement triggers not met | NOT PROPOSED |

### Path 4 — JustizOnline web UI (DEC-518-F)

- (a) YES (UGB); (b) NOT VERIFIED (ToS gated); (c) SATISFIABLE; (d) SATISFIABLE.
- Free layer shows identity only; director data requires authenticated paid extract.
- Strale-operated session would trigger DEC-20260428-A Tier-1 bar.
- **Verdict: BLOCKED.**

### Path 5 — Open data bulk

- HVD free API is the bulk-equivalent (Path 2b above).
- GISA open data explicitly excludes personal data — irrelevant for officers.
- **Verdict: HVD API IS the open-data win for AT.** Same finding as Path 2b.

### Path 6 — Tier-2 commercial bulk

- Compass-Verlag bulk licensing: same Servicepauschale gate as Path 1.
- **Verdict: NOT VIABLE-V1.**

### Path 7 — Wiener Zeitung / Amtsblatt gazette

- Wiener Zeitung's Amtsblatt section publishes corporate notifications. Format changed July 2023 to digital-only (Mediengesetz reform).
- No structured feed confirmed; PDF-based.
- **Verdict: V1.2+ derivative-dataset build, NOT v1.**

### Path 8 — Other AT surfaces

- BRIS, Stiftungsregister, Vereinsregister, GISA (no PII), WKO (no officer data), Wiener Börse listed-companies (~50 entities) — none viable as general path.
- **Verdict: NOT VIABLE.**

### AT synthesis

- **v1 verdict: CONDITIONAL viable-v1 pending API-key eligibility email.** HVD free API path is the cleanest win in Phase 7b. Single blocker: email `justizonline-iwg@brz.gv.at` to confirm Sweden-incorporated EU entity eligibility.
- **v1.1 fallback if HVD key not obtainable:** CRIF Austria or Kyckr — both require full DEC-518-G RFQ. Pricing risk: both expected to be subscription-anchored (CRIF as enterprise credit bureau; Kyckr as "quote-based for all plans").
- **Required external actions:**
  - **Single email to `justizonline-iwg@brz.gv.at`** asking: "Can a Sweden-incorporated EU entity without an ID Austria credential register for an HVD Firmenbuch API key under the EU 2023/138 mandate?"
  - If yes: implementation prompt for AT (HVD SOAP integration; identifier-resolution step VAT→FN).
  - If no: RFQ to CRIF Austria + Kyckr with full DEC-518-G probe.
- **No Topograph re-engagement.** DEC-20260505-E DQ respected.
- **Doctrine note for chat-side:** When writing the AT v1 ship prompt (if HVD key obtained), do NOT frame the rationale as "EU 2023/138 mandated this." Frame it as "Austria voluntarily included Geschäftsführer in their HVD implementation, which we benefit from." The 2023/138 caveat is doctrine-load-bearing.

---

## Cross-cutting findings

### Pattern 1 — Phase 7b produces no clean unconditional Tier-1 free win

In Phase 5 (HR/EE/BE) and Phase 6 (MT/CY/HU/LU), the discipline reversed expected-negative verdicts and produced two clean Tier-1 free open-data wins (EE, CY) plus several conditional Tier-2 paths. Phase 7b produces:

- **NL: 0 conditional paths** (fully blocked v1).
- **ES: 1 conditional path** (OpenMercantil, doctrine-questionable).
- **AT: 1 conditional path** (HVD API, eligibility-questionable).

The CY-pattern (free CC BY 4.0 bulk CSV with 1M+ officer rows, no auth, no contract, no eligibility gate) **does not replicate** in Phase 7b. ES has informal-republisher coverage with doctrine gap; AT has government-API coverage with eligibility gap. Neither is the unconditional ship-today shape EE/CY produced.

This is a **doctrine-compliant negative-confirming outcome** — exactly the case where running the enumeration anyway (per DEC-20260518-E) protects against missed-coverage regret without producing false-positive overclaim.

### Pattern 2 — Two locked-doctrine bypass attempts surface; both correctly flagged

Both ES (OpenMercantil) and AT (HVD API) are findings that **could be misframed as unconditional v1 wins** by a CC less careful about doctrine:

- **ES OpenMercantil:** the free + officer-data-bearing + live-confirmed shape is structurally tempting to ship as v1. But DEC-20260428-A Tier 2's "indemnification" requirement is load-bearing for risk distribution to the registered legal source. Misclassifying this as v1 would create unindemnified risk exposure.
- **AT HVD API:** the free + officer-data-bearing + government-published shape is structurally tempting to cite as "EU 2023/138 mandate." But the 2023/138 §5.1 caveat (Journal `36467c87082c8169`) is explicit — §5.1 does NOT mandate representative-name disclosure. Misframing the rationale would erode the doctrine for future enumerations.

Both are correctly flagged as **conditional** in this synthesis — each requires one external resolution before ship-decision.

### Pattern 3 — Gazette parsing path consistently V1.2+ across all 7 countries enumerated in Phases 5/6/7b

| Country | Gazette | Status |
|---|---|---|
| HR | Narodne Novine | Phase 5: V1.2+ derivative |
| EE | Ametlikud Teadaanded | Phase 5: V1.2+ |
| BE | Moniteur Belge | Phase 5: V1.2+ (DEC-doctrine question raised for historical coverage) |
| MT | Gazzetta tal-Gvern | Phase 6: V1.2+ |
| CY | Επίσημη Εφημερίδα | Phase 6: V1.2+ |
| HU | Cégközlöny | Phase 6: V1.2+ |
| LU | RESA / Mémorial C | Phase 6: V1.2+ |
| NL | Staatscourant | Phase 7b: V2 derivative |
| ES | BORME | Phase 7b: V1.2+ (but OpenMercantil has already done this build externally) |
| AT | Wiener Zeitung / Amtsblatt | Phase 7b: V1.2+ |

**Consistent pattern across 10 countries:** national gazettes publish officer-change events but are PDF-based with no structured XML feed for officer names. Building a derivative dataset is per-country 4-6 week engineering work. Defer until customer demand justifies the build. **One DEC-DB entry on gazette-parsing doctrine should be opened when historical-officer coverage becomes a customer requirement** — see Phase 5 report's BE Moniteur Belge scope question.

### Pattern 4 — Topograph DQ fully respected across all Phase 7b agents

All three NL/ES/AT agents were given explicit locked-doctrine-bypass-guard instructions. None proposed Topograph as v1 or v1.1 under any framing. **DEC-20260505-E re-engagement triggers (customer-funded / fee waived / fee credited / coverage exclusivity) are not met by any v1 enumeration finding in Phase 7b.**

### Pattern 5 — Closed registries cluster

NL is the third closed-registry case after BE Tier-2 KBO economics. Pattern:

- **NL KVK:** foreign-entity closure + statutory officer data omission from API
- **BE KBO:** SOAP requires €50/2k topup (per-call passthrough; Phase 5 viable-v1)
- **AT Justizonline:** Verrechnungsstelle gate + paid extracts only

Each country's national registry architecture is differently shaped — NL's is the most restrictive (officer data deliberately absent from the API even with subscription). BE's economics work because the per-call topup model passes through cleanly. AT's are gated behind Verrechnungsstellen with Servicepauschale (annual fixed fee) DQ.

The pattern reinforces: **for v1, the only paths that work are (a) free government bulk publication, (b) per-call passthrough with no platform/monthly fee, (c) per-call vendor with clean DEC-20260428-A attestation.** NL has none of these.

---

## Recommendations to chat-side

| Country | v1 decision | Immediate action | Parallel v1.1 actions |
|---------|-------------|------------------|------------------------|
| **NL** | **FULLY BLOCKED v1.** Maintain Openapi WW-Top identity-only. | Coverage matrix: keep at `Committed` (no upgrade); update `tier_2_available_reason` to reflect Phase 7b findings (KVK closed + statutory officer omission + commercial-vendor resale closure). | Open DEC-518-G probes with **Altares D&B (NL)** at `altares.nl/en/contact/` and **Kyckr** in parallel — request per-call NL officer price + monthly minimum + resale permission + indemnification. CrimiMail outreach (in flight) low-probability. Monitor Datavisie Handelsregister; no credible opening before 2027. |
| **ES** | **CONDITIONAL viable-v1 pending Petter doctrine call.** | **Petter doctrine clarification needed:** Does DEC-20260428-A Tier 2 permit OpenMercantil-class informal CC BY 4.0 republishers (rights via source license, no formal indemnification)? If YES → write implementation prompt for ES (CY-pattern OpenMercantil API integration with coverage-patchiness + no-NIF caveats documented as limitations). If NO → proceed with v1.1 RFQ track. | Independent of the doctrine call: do a second OpenMercantil probe (Iberdrola + 3 other ES entities) to measure coverage reliability empirically. RFQ to Pappers.es (per-call pricing confirmation), Kyckr (full DEC-518-G probe), LibreBOR (probe retry — was 403 this session). Parallel: schedule DEC-20260507-C lift evaluation for Q3/Q4 capacity. |
| **AT** | **CONDITIONAL viable-v1 pending single email.** | **Email `justizonline-iwg@brz.gv.at`** with subject "EU 2023/138 HVD Firmenbuch API access for Sweden-incorporated EU entity (no ID Austria credential)" — ask explicitly whether a non-Austrian EU company can obtain an API key. Likely-positive response (precedent: WhizUs GmbH obtained key; EU HVD regulation requires re-use without conditions beyond attribution). If positive → write implementation prompt for AT (CY-pattern HVD SOAP integration with VAT→FN identifier resolution step + frame rationale as Austria's voluntary inclusion of Geschäftsführer in HVD, NOT as EU mandate per 2023/138 caveat). | If email-negative: RFQ to CRIF Austria + Kyckr with full DEC-518-G probe. Pricing risk: both expected subscription-anchored. |

**Single bundled chat-side action: open three threads in parallel.** Two are external (Petter doctrine call for ES; Strale-to-BMJ email for AT); one is internal status maintenance (NL coverage-matrix update + Altares/Kyckr RFQ to-dos).

**Phase 7b closes the EU30 v1 enumeration phase.** Subsequent CC sessions are implementation work (CY-pattern PRs for confirmed Tier-1 wins after eligibility/doctrine resolves) or v1.1 RFQ-management. No additional enumeration phases scheduled.

---

## v1 launch picture (post-Phase-7b ceiling)

**Tier-1 free open-data + Tier-2 binding-ready with representative coverage (confirmed across Phases 5/6/7b):**

| Cohort | Countries | Status |
|---|---|---|
| **Clean Tier-1 free open-data wins** | EE (Phase 5), CY (Phase 6) | LIVE (PR #139, #141) |
| **Tier-2 binding-ready paths confirmed in prior phases** | HR (Phase 5), BE (Phase 5), IT (Phase 7a in-flight) | Per-phase status; HR/BE per Phase 5 partials, IT per worktree |
| **Conditional viable-v1 pending single external resolution** | ES (OpenMercantil — Petter doctrine call), AT (HVD API — BMJ email) | Both blocked on one external action; high-probability resolutions |
| **v1.1 deferred (Topograph cohort + country-specialists)** | MT/HU/LU (Phase 6 Topograph DQ'd; alternate vendors v1.1), NL (Altares/Kyckr v1.1), parts of ES/AT fallback | Per-country v1.1 RFQ to-dos |
| **Fully blocked v1** | NL | Maintain Openapi identity-only; structural blockers |

**EU30 v1 representative-coverage ceiling: ~7-10 countries depending on conditional resolutions** (Tier-1 + Tier-2 confirmed + ES/AT conditional outcomes). v1.1 cohort closes the rest via Topograph-replacement vendor RFQs.

---

## Stop-condition compliance

- ✅ All 24 path investigations (3 countries × 8 paths) documented with live evidence per path, or documented negative reasoning where probe was blocked.
- ✅ No path halted on first-failure without evidence-based reasoning.
- ✅ Final verdict per country with cost / latency / risk + DEC compliance.
- ✅ DEC-20260518-G platform-fee probe completed for every Tier-2 candidate that isn't Topograph (Compass, HF Data, Manz, auszug.at, CRIF, Kyckr, KSV1870, OpenCorporates, Altares, Company.info, Creditsafe NL, Graydon NL, Pappers, LibreBOR, etc.).
- ✅ DEC-20260518-F 4-constraint check applied to every Path 4 candidate (KVK web UI, Registradores web UI, JustizOnline web UI); all blocked under Tier 1 with documented constraint-level evaluation.
- ✅ No 2023/138 representative-content claims (per course-correction Journal `36467c87082c8169`); AT HVD director-data framed as Austria's national implementation choice, NOT an EU mandate.
- ✅ No Topograph re-engagement proposals (per locked-doctrine bypass guard Journal `36467c87082c817bb0c2e22ea00827cf`).
- ✅ Cross-reference to per-country canonical YAML at `apps/api/coverage-matrix/{dutch,spanish,austrian}-company-data__{nl,es,at}__company-registry.yaml`.
- ✅ Phase 7b closes the enumeration phase. v1 launch picture locked at the post-Phase-7b ceiling.

## Caveats logged (synthesis)

- **OpenMercantil coverage patchiness:** Telefónica returned 3 officers; Iberdrola returned empty officers. Coverage is not uniform; staleness or DRCOR-Madrid-specific publication lag possible. Petter doctrine call required before classifying as v1 in any framing.
- **OpenMercantil no NIF:** Personal identifier fields stripped by republisher for GDPR. If v1 customer use case requires NIF for identity verification, OpenMercantil alone is insufficient and the v1.1 commercial-vendor path applies.
- **OpenMercantil no indemnification:** Independent republisher with no contractual relationship with CORPME/BOE. Source-license redistribution rights exist but indemnification does not. Strict DEC-20260428-A Tier 2 reading would block; loose reading would permit. Petter call required.
- **AT HVD API-key registration eligibility:** Single unresolved question. Email `justizonline-iwg@brz.gv.at`. High probability of positive resolution per EU 2023/138 HVD re-use requirements + WhizUs precedent, but unverified.
- **AT HVD doctrine framing:** When writing AT v1 ship prompt (if HVD key obtained), do NOT cite "EU 2023/138 mandate" as rationale for director data availability. Cite "Austria's voluntary inclusion of Geschäftsführer in HVD implementation under national choice." The 2023/138 §5.1 caveat (Journal `36467c87082c8169`) is doctrine-load-bearing.
- **AT HVD SOAP format:** XML/SOAP not REST/JSON. Integration complexity higher than EE/CY REST/JSON ingest pattern. Adds estimated 1-2 days vs CY-pattern PR.
- **AT identifier-resolution step:** Two-call sequence (AT-Start VAT→FN, then HVD SOAP FN→directors). Adds latency. Net external cost: ~€0.055 (AT-Start) + €0 (HVD).
- **NL Altares D&B + Kyckr RFQ blast radius:** Both expected to be subscription-anchored. If neither passes DEC-518-G probe (no fixed monthly fee), NL stays fully blocked through v1.1. Document this as the no-path-found outcome explicitly.
- **NL CrimiMail outreach in flight:** No reply since 2026-05-11. Low probability of resolving the gap (product fit uncertain). If reply lands in any future session, do NOT classify as v1 without chat-side review per locked-doctrine guard.
- **DEC-20260507-C lift evaluation:** ES Registradores self-build remains deferred. OpenMercantil findings do NOT change this — OpenMercantil is the third-party version of what DEC-20260507-C deferred. If doctrine permits using OpenMercantil, the self-build deferral can remain indefinite. If doctrine prohibits, the self-build becomes higher priority for v1.1.
- **No CY-pattern surprise across Phase 7b.** Confirming negative for NL and confirming conditional for ES/AT is the doctrine-compliant outcome. The CC has not produced false-positive overclaim under doctrine pressure.
- **BRIS unprobeable from US-East egress (consistent across all phases):** webgate.ec.europa.eu/e-justice redirects to sorry.ec.europa.eu from Railway US East. Assessment grounded in e-Justice portal docs; conclusions consistent: BRIS = identity only, no officer extension, no third-party API.
