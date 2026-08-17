# Exhaustive source enumeration — PL + LT (DEC-20260518-E)

**Date:** 2026-05-18
**Author:** Claude Code (Sonnet research subagents, synthesized by Opus 4.7)
**Doctrine:** DEC-20260518-E (Exhaustive Source Enumeration); DEC-20260428-A (no Strale-operated scrapers, Tier 1 absolute); DEC-20260518-F (Path 6 4-constraint exemption); cost discipline (per-call OK if passed through; fixed/subscription not OK in v1; platform-fee probe mandatory per Path 4 vendor)
**Test entities:** PL — CD Projekt S.A. (KRS 0000006865), PKN Orlen S.A. (0000014323), PKO Bank Polski S.A. (0000026438); LT — Vilnius University (11125567), AB SEB bankas (21258254), AB Ignitis grupė (301844044)
**Source partials:** [_partial_pl_enumeration.md](_partial_pl_enumeration.md), [_partial_lt_enumeration.md](_partial_lt_enumeration.md)

---

## Executive summary

Phase 5 enumerates PL + LT. Neither country is truly blocked, but **both are structurally harder than HR/EE/BE**: every viable v1 path is v1.1 (attestation-required) pending RFQ + DEC-20260428-A vendor sourcing-method confirmation. No country in this phase has a clean Tier-1 zero-cost path equivalent to EE's `kaardile_kantud_isikud.json.zip` or BE's KBO SOAP €0.025/call prepaid.

| Country | Prior verdict | Revised verdict | v1 path | Cost | Friction | Platform-fee status |
|---------|---------------|-----------------|---------|------|----------|--------------------|
| **PL** | Blocked (JSON anonymized) | **Viable-v1.1 only** — RFQ-gated, vendor sourcing-method attestation REQUIRED | Kyckr (primary) → Kompany → Transparent Data | RFQ (asserted per-call) | Vendor due-diligence per DEC-20260428-A Tier 2; October 2025 criminal-penalty amendment elevates risk | Unconfirmed for all 3 v1.1 candidates |
| **LT** | "vadovas paywall" via Spinta | **Viable-v1.1** with one same-day verification path | JARS.LT (verify same-day) → Lursoft → rekvizitai.vz.lt token API | €5/mo (JARS.LT Starter) or RFQ (Lursoft/rekvizitai) | JARS.LT API field-check + sourcing attestation; Spinta has zero officer names | Unconfirmed for paid Baltic-specialists |

**Headline correction for PL — the JSON-vs-PDF anonymization question RESOLVED with direct evidence:** Live probe of `https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/0000006865?rejestr=P&format=json` returns HTTP 200 with **all officer names masked** (`"N**********"` / `"P****"` pattern, all 7 board members + 5 supervisory + 2 prokurenci). The PDF endpoint returns HTTP 400 externally because the Ministry of Justice protects it with an AES-128-CBC session-token mechanism (`TopSecretApiKey1` hardcoded key, 512-char token with embedded checksums). An October 2025 Polish law amendment formally codified the two-tier system: Open API (anonymized) for everyone; Full API (un-anonymized) requires a ministerial decision restricted to public bodies. Strale is structurally ineligible for Full API. A new criminal penalty (up to 2 years imprisonment) applies to unauthorized network-based access to full KRS data — this elevates DEC-20260428-A Tier-2 vendor attestation requirements above any other country in this audit series.

**Headline correction for LT — the "vadovas paywall" claim refined:** Spinta open data's `valdymo_organai/ValdymoOrganas` dataset contains binary governance flags only (`vadovas: 1/0`, `vald_org_nuo: appointment date`, `vald_lytis: M/V/ND`) — confirmed by live probe today. **No personal names anywhere in Spinta JADIS/JAR namespaces** (26 datasets enumerated). The claim that "body members are covered but `vadovas` requires paid tier" was structurally wrong: Lithuania did NOT publish an Estonia-style `kaardile_kantud_isikud` open-data file. Officer names exist only in: (a) the €6.37 paid electronic extract from Registrų centras, (b) commercial aggregators (JARS.LT, Lursoft, rekvizitai.vz.lt), or (c) the weekly PDF `Informacinis leidinys` gazette (Strale-built v1.5).

**Headline finding for LT — JARS.LT is the cheapest v1 candidate** at €5/mo Starter for 5,000 req/mo (€0.001/request) covering LT+LV+EE, claiming "Directors and beneficiaries", no long-term contract, no documented platform fee. **Same-day verifiable** via the free 100 req/mo tier. **Required action before commit:** register account today, call director endpoint for Vilnius University / SEB, confirm names appear in JSON response. If confirmed → require JARS.LT to attest in writing which sourcing mechanism (RC commercial API / electronic extract bulk-purchase / gazette parsing) per DEC-20260428-A Tier 2.

**Headline doctrine implication — vendor sourcing-method attestation is now the binding constraint, not pricing.** Both PL and LT have data commercially available but every candidate vendor is RFQ-only with undisclosed sourcing. DEC-20260428-A Tier-2 requires written attestation of lawful sourcing + redistribution rights + indemnification. Until those attestations land, all paths classify as v1.1. The cost-discipline platform-fee probe (from the HR Topograph €1,500/mo correction) intersects with sourcing-method due-diligence: a vendor cheap on per-call but compromised on sourcing is not viable.

**Revised realistic launch coverage:** PL + LT do NOT close in v1 the way HR/EE/BE did. Both require RFQ cycles (1–2 weeks) and vendor attestation reviews before commit. Earliest v1 ship: ~2 weeks PL (after Kyckr/Kompany RFQ + attestation), ~1 week LT (after JARS.LT API field-verification + attestation).

**DEC-20260428-A scope question for Petter (Phase 5-specific):** The same gazette-style question raised in Phase 1–3 (BE Moniteur Belge) resurfaces for both PL (MSiG, abolished for new KRS entries from October 2025 — historical 2001–2025 only) and LT (`Informacinis leidinys` weekly PDF, current and active). Both are official government publications, Tier-1 clean for Strale-built derivatives under DEC-20260428-B engineering bar but engineering-heavy (PDF parsing + entity resolution). The doctrine question is the same as BE: are gazette-style statutorily-published officer-change PDFs in scope for a future DEC-DB entry, or does the existing case-law-anchored Tier 1 already cover them? Worth Petter interpretation when volume justifies the engineering investment.

---

## PL — 8-path enumeration

Test entity: CD Projekt S.A. (KRS 0000006865) primary, PKN Orlen + PKO BP as cross-validation. Full partial: [_partial_pl_enumeration.md](_partial_pl_enumeration.md).

### Path 1 — Same vendor (KRS `api-krs.ms.gov.pl`), other endpoints

- **Endpoints confirmed:** `GET /api/krs/OdpisAktualny/{krs}?rejestr={P|S|R}&format={json|pdf}`, `GET /api/krs/OdpisPelny/{krs}?...`. `rejestr=P` for business entities, `S` for associations/foundations, `R` for mixed. No authentication required (Open API tier).
- **JSON-vs-PDF anonymization RESOLVED:** Live probe `format=json` for KRS 0000006865 — HTTP 200, full response, **all officer names masked**. Zarząd (7 members), Rada Nadzorcza (5), Prokurenci (2) — every personal name appears as `"N**********"` / `"P****"` pattern. PESELs masked. Only **non-personal data preserved in full**: company name history (OPTIMUS TECHNOLOGIE → CD PROJEKT), addresses, capital structure, statute amendment dates, notary names within deed texts.
- **PDF tier:** HTTP 400 externally. Reverse-engineering work documented publicly shows AES-128-CBC encryption with hardcoded key `TopSecretApiKey1`; 512-char token embeds encrypted KRS number at specific array positions with checksums + circular shifting. PDF endpoint requires browser-session mechanics that no clean external API call reproduces.
- **Structural framing — October 2025 amendment:** Formally codified two-tier system. **Open API** (anonymized public) and **Full API** (un-anonymized, ministerial decision required, public bodies only). New criminal penalty up to 2 years imprisonment for unauthorized network access to full KRS data.
- **REGON BIR1 (supplementary):** SOAP/WSDL at `wyszukiwarkaregon.stat.gov.pl/wsBIR/...`; free; **no officer data** (REGON is statistical register, wrong primitive).
- **Verdict: NOT VIABLE.** Open API permanently anonymized; Full API permanently closed to Strale.

### Path 2 — Same vendor, authenticated free path

- KRS Open API has no authentication layer at all — anonymization is structural policy, not rate-limit-bypass. No free path unlocks names.
- Full API requires positive Minister of Justice decision; eligibility limited to public bodies. Strale (Swedish private SaaS) structurally ineligible.
- **Verdict: NOT VIABLE.**

### Path 3 — Other free aggregators

| Source | Verdict | Reason |
|---|---|---|
| OpenCorporates PL | NOT VIABLE | API subscription floor (£2,250+/yr); web view CAPTCHA-walled |
| OpenSanctions `pl_*` (5 datasets: sejm/senate/wanted/mswia/finanse) | NOT VIABLE for officers | All screening-list primitives (PEPs/sanctions/wanted), not company officer rosters |
| BODS / Open Ownership (CRBR) | NOT VIABLE | CRBR (Polish UBO register, 2019, 25% threshold) accessible only via MoF HTML lookup; **no BODS publication**, no bulk API; also wrong primitive (UBO ≠ directors) |
| GLEIF Level 1+2 | NOT VIABLE | No officer fields |
| data.europa.eu / org-id.guide | NOT VIABLE | All defer to KRS upstream |

### Path 4 — Per-call paid aggregators (platform-fee probe per HR Topograph lesson)

| Vendor | Pricing model | Officer coverage | Platform-fee verdict | Verdict |
|---|---|---|---|---|
| **Transparent Data** (Warsaw, deep PL specialist) | "Starts at €2,500" annual (per Datarade.ai); RFQ; subscription-anchored language | Confirmed non-anonymized (KRS + CRBR + REGON + MSiG in one API; relations/officers section with name/DOB/role/dates) | Likely platform fee (€2,500 annual floor) | **v1.1 — may not fit cost discipline** |
| **MGBI** | RFQ; returns KRS PDF URLs + MSiG announcements JSON since 2001 | Indirect (PDF URL with full names) | Unknown | **v1.1 (attestation-required)**; sourcing-method critical (PDF redirect implies session-token wrapping) |
| **Kyckr** | Per-record (asserted, no subscription required per public positioning); historic ~£3–10/lookup | Confirmed "legal representatives" for PL | Public positioning = no platform fee but not documented | **v1.1 PRIMARY (attestation-required)** |
| **Kompany** | Per-search credits (asserted); 115M+ companies incl. PL; pricing page HTTP 403 | Asserted | Unknown (403-blocked) | **v1.1 BACKUP** |
| **nip24.pl** | Prepaid credits inferred; PL SME aggregator | Implied (wraps KRS extract) | Unknown | v1.1 |
| **InfoVeriti** | €500–2,000/month subscription confirmed | Confirmed | **CONFIRMED PLATFORM FEE** | **NOT VIABLE-V1** (DQ on subscription floor) |
| Bisnode/D&B Poland | Subscription-heavy historically; no public per-call API | Likely | Likely platform fee | NOT VIABLE-V1 |
| Coface Poland / Creditreform Polska | Enterprise-RFQ | Likely | Likely platform fee | NOT VIABLE-V1 |
| Topograph | — | — | DQ (€1,500/mo platform fee, prior precedent) | SKIP PER DOCTRINE |

### Path 5 — Open data alternatives

- **dane.gov.pl CKAN:** Two relevant datasets — `265 Wyszukiwarka KRS` and `27606 API KRS` — both are **pointer/metadata entries** to the Path 1 search UI and REST API. **No bulk KRS officer CSV/JSON dump exists.** Multiple sources confirm: "Bulk data is not yet available from the National Court Register."
- **REGON BIR1:** statistical register, no officers.
- **CRBR (UBO register):** HTML-only lookup, no API, no bulk; also wrong primitive.
- **MSiG as open data:** Issue PDFs downloadable at `wyszukiwarka-msig.ms.gov.pl/api/Monitor/Download?id={ID}&fileId=true` (~2MB each). **October 2025 reform abolished MSiG KRS-entry publication.** Historical coverage 2001–2025 only. PDF-based, no structured export.
- **Verdict: NOT VIABLE for v1.** No officer-bearing bulk open dataset for PL.

### Path 6 — Public web UI HTML/PDF (DEC-20260518-F 4-constraint check)

- `wyszukiwarka-krs.ms.gov.pl` — public, no login, full officer names displayed. Detail URL uses AES-128-CBC encrypted KRS number.
- **Constraint check:**
  1. Statutorily public — YES (KRS Act, "everyone can search")
  2. ToS permits per-call automated retrieval — **UNCLEAR/BLOCKED.** No explicit prohibition found, but encrypted session-token mechanism is a deliberate technical barrier. October 2025 criminal-penalty provision (up to 2 years) for unauthorized network access elevates risk.
  3. Per-entity per-request — YES
  4. Attribution preserved — YES (provenance in extract)
- **Constraint (2) fails** — Strale circumventing the encrypted-token barrier creates legal exposure. DEC-20260518-F exemption does NOT clearly pass.
- **DEC-20260428-A Tier 1:** absolute block regardless. The right pattern is Tier-2 vendor with sourcing-method attestation.
- **Verdict: BLOCKED.** Tier-2 vendor required.

### Path 7 — BRIS cross-border

- e-Justice portal documents that PL exposes via BRIS: name, legal form, registration number, address, status, "legal representatives," documents list (per Directive 2012/17/EU + Directive 2025/25 expansions).
- **Important distinction vs HR:** unlike Croatia, Poland's KRS data in BRIS is described as **including "legal representatives"** at the BRIS gateway. Whether the quality/completeness equals the full KRS extract is unconfirmed. **No public REST API for third parties.**
- Directive (EU) 2025/25 expands BRIS scope and adds digital EU power of attorney for authorized signatories — future improvement, not yet implemented.
- **Verdict: NOT VIABLE programmatically.** Portal-only. Watch Directive 2025/25 implementation for future API exposure.

### Path 8 — Court/commercial register separate (MSiG + eKRS filings repository)

- **MSiG (Monitor Sądowy i Gospodarczy):** Polish official commercial gazette. **October 2025 reform abolished KRS-entry publication requirement.** Historical coverage 2001–late 2025 still available (officer appointments at first registration + changes). PDF-only, no bulk API from official portal. Third-party APIs (iMSiG.pl, MGBI MSiG API) exist with RFQ pricing. **Forward-looking value reduced by reform.**
- **eKRS filings repository (`ekrs.ms.gov.pl/s24/`):** all filings since July 2021 electronic, PDFs publicly available — raw notarial deeds, shareholder resolutions, appointments with full names. **Engineering-heavy** (NLP/OCR project, not a clean data feed).
- **Polish Notary Chamber (KRN):** not consolidated, no searchable index.
- **Verdict: VIABLE-v1.5/v2 (Strale-built derivative dataset, DEC-20260428-B engineering bar).** Not v1 due to engineering cost; historical-only after October 2025 reform.

### PL synthesis

- **v1 path: Kyckr (primary) → Kompany (backup) → Transparent Data (tertiary)**, ALL classified **v1.1 (attestation-required)**. The platform-fee probe is unconfirmed for all three; the DEC-20260428-A sourcing-method attestation is critical for all three given the October 2025 criminal-penalty amendment.
- **v1.5/v2: Strale-built MSiG/eKRS pipeline** under DEC-20260428-B engineering bar — historical officer trail only after October 2025 reform.
- **Truly blocked? NO** — data is commercially available, multiple vendor paths exist. But every path requires RFQ + sourcing attestation cycle (~2 weeks). No clean Tier-1 zero-cost path.
- **Key PL-unique finding:** The October 2025 amendment compound creates a 3-vector compliance constraint that does not exist in any other EU country audited so far: (1) formal two-tier API closing the direct path, (2) criminal penalty for unauthorized network access elevating vendor due-diligence requirements, (3) abolition of MSiG KRS-entry publication closing one alternate structured gazette route. **Vendor sourcing-method attestation is more critical for PL than for any other country in this audit series.**

---

## LT — 8-path enumeration

Test entity: Vilnius University (11125567) primary, AB SEB bankas + Ignitis as cross-validation. Full partial: [_partial_lt_enumeration.md](_partial_lt_enumeration.md).

### Path 1 — Same vendor (Spinta JADIS / JAR / Registrų centras), other endpoints

- **Spinta namespace enumeration at `get.data.gov.lt/datasets/gov/rc/`:** 17 dataset folders; the relevant ones are `jadis` (6 collections) and `jar` (20 datasets).
- **JADIS `dalyviai/Dalyvis` schema (live probe today):** `_id, juridinis_asmuo._id, form_kodas._id, stat_statusas._id, lr_fiziniai (count), lr_juridiniai (count), uzsienio_fiziniai (count), uzsienio_juridiniai (count)`. **Aggregate participant counts only. No names, no personal codes, no roles.**
- **JAR `valdymo_organai/ValdymoOrganas` schema (live probe today) — the critical finding:**
  ```
  _id, vadovas (1/0), vad_org_nuo (date), vad_lytis (M/V/ND),
  valdyba (1/0), vald_org_nuo (date),
  taryba (1/0), tar_org_nuo (date),
  kiti_valdymo_organai (1/0)
  ```
  **Binary existence flags + appointment dates + director gender. NO personal names anywhere.**
- **Structural refinement of the "vadovas paywall" claim:** The prior framing was imprecise. The open data records the **existence** of a managing director and their **appointment date + gender** but never their name or personal code. This is intentional data-protection design in the open-data layer — not a paywall in the traditional sense. Officer names require either €6.37 paid electronic extract from RC or commercial aggregator.
- **Registrų centras direct commercial API:** GitHub org (`registrucentras`) shows only signing-workflow products (GoSign), no public company-data API. `registrucentras.lt` direct probes returned ECONNREFUSED on all 7 attempts (Railway US East egress blocked). Commercial-tier API may exist via data-sharing agreement (analogous to RIK contract) but not publicly documented.
- **Verdict: NOT VIABLE as-is for v1.** Officer names locked behind €6.37/extract retail fee or a commercial-tier agreement not publicly documented.

### Path 2 — Same vendor, authenticated free path

- **data.gov.lt account:** controls rate-limit tiers on Spinta. Does NOT unlock additional fields. Officer names not present in any Spinta dataset regardless of auth.
- **Registrų centras self-service (`registrucentras.prisijungti.lt`):** authenticated session enables ordering electronic extracts (still €6.37/extract). 100 free searches/day in the public search are available without auth anyway.
- **VIISP (state data exchange bus):** state-bodies tier analogous to Croatia's Sudreg `državno tijelo` and Estonia's X-Road authenticated paths. Requires institutional agreement with Ministry of Interior. **Structurally unavailable to Strale.**
- **Verdict: NOT VIABLE for free officer data.**

### Path 3 — Other free aggregators

| Source | Verdict | Reason |
|---|---|---|
| OpenCorporates LT | NOT VIABLE | API subscription floor (£2,250+/yr) |
| OpenSanctions `lt_*` (seimas, pep_declarations, fiu_freezes) | NOT VIABLE for officers | Screening-list primitive only |
| BODS / Open Ownership (JANGIS UBO, 2022) | NOT VIABLE | "Published as BODS: No; Available via API: No"; CJEU 2022 ruling restricts to legitimate-interest; UBO ≠ directors |
| GLEIF Level 2 | NOT VIABLE | No officer fields |
| **JARS.LT** (Baltic platform LT/LV/EE) | **v1 CANDIDATE (verify first)** | Claims "Directors and beneficiaries". €0 free tier (100 req/mo), €5/mo Starter (5k/mo), no long-term contracts. **Same-day API field-check required.** |
| Okredo Lithuania | NOT VIABLE v1 | Subscription model implied; "contact for terms" |

**JARS.LT detailed status:** Cheapest candidate at €0.001/request effective cost (€5/mo for 5k req). No documented platform fee. Live probe of their public company detail page (JAS Worldwide Lithuania, code 300094312) did NOT show director names in the public web view — discrepancy with their homepage claim. Possibilities: (a) names are present only in authenticated API responses (not the marketing web display), or (b) the "Directors and beneficiaries" homepage claim is partial. **API field-check required before commit.**

### Path 4 — Per-call paid aggregators (platform-fee probe per HR Topograph lesson)

| Vendor | Pricing model | Officer coverage | Platform-fee verdict | Verdict |
|---|---|---|---|---|
| **Lursoft** (Baltic LT/LV/EE specialist) | Per-call claimed (secondary: "without subscription, paying individually") | Confirmed "company officers and documents" | Unconfirmed (403-blocked direct probe) | **v1.1 PRIMARY (attestation-required)** |
| **rekvizitai.vz.lt** (LT-domestic, token API) | RFQ token API | Confirmed `vadovas` (sole executive) by name | Unknown | **v1.1 BACKUP** — likely vadovas-only, board coverage unclear |
| Creditinfo Lithuania | RFQ (credit-bureau enterprise) | Confirmed "representation and management data" | Unknown — likely annual contract | v1.1 (likely won't fit) |
| Coface Lithuania | Annual contract assumed | Likely | Annual minimum likely | NOT VIABLE-V1 |
| Risika | LT NOT CONFIRMED in coverage; "€60K per country" implies enterprise subscription | — | Platform fee likely | NOT VIABLE-V1 |
| Okredo Lithuania | Subscription implied | Implied | Unknown | NOT VIABLE-V1 |
| **Topograph** | — | **LT NOT IN COVERAGE** (both LT docs URLs returned 404; LT not in `llms.txt`) | DQ (€1,500/mo platform fee from prior precedent regardless) | SKIP / NOT APPLICABLE |
| TransactionLink | RFQ | "Corporate governance" implied | Unknown | v1.1 |
| Info-clipper | ~€95/extract per-call | Confirmed shareholders + directors | None stated | NOT VIABLE — price band wrong (160–4000× Strale capability price) |

### Path 5 — Open data alternatives

- **Spinta `valdymo_organai`** (under CC BY 4.0) — governance flags + appointment dates only, NO names. (Same as Path 1.)
- **Key structural finding:** **Lithuania has NOT published an Estonia-equivalent open-data file.** No `kaardile_kantud_isikud`-style 45MB JSON dump with full board data exists.
- **Lithuanian Statistics (LSD), VMI (tax authority):** no officer rosters.
- **Informacinis leidinys (Path 8 below):** weekly PDF gazette with officer appointments — public domain but PDF-only, requires OCR + entity resolution.
- **Verdict: PARTIALLY VIABLE (flags only).** Not a v1 officer-name source.

### Path 6 — Public web UI HTML/PDF (DEC-20260518-F 4-constraint check)

- **`registrucentras.lt` public search (free, 100/day):** company code, name, address, legal form, status, documents list, sanctions. **Officer names are NOT freely displayed** — only in the €6.37 paid extract. Structurally different from Estonia (full board on free public web).
- **`rekvizitai.vz.lt`:** per secondary sources, **publicly displays vadovas name without login, without payment**. Direct probe returned 403 (blocked from Strale's egress) — cannot confirm first-hand.
- **DEC-518-F constraint check (rekvizitai.vz.lt):**
  1. Statutorily public — YES (Law on Companies)
  2. ToS permits per-call automated retrieval — **UNCONFIRMED** (403-blocked from this session)
  3. Per-entity per-request — YES (URL structure)
  4. Attribution preserved — YES (cites "official state registers")
- **DEC-20260428-A Tier 1:** Strale operating a scraper against rekvizitai.vz.lt is absolutely blocked regardless. The token-based API (info@rekvizitai.lt) is the only clean automated path — would be Tier 2 if redistribution rights confirmed.
- **Verdict: Direct scraping BLOCKED; token API viable pending ToS review (Path 4 territory).**

### Path 7 — BRIS cross-border

- e-Justice portal documents that Lithuania exposes: legal person code/name/address, **"management body members data and persons authorized to represent the company,"** financial reports, status, documents list.
- Whether the richer LT-specific fields (officer names, personal codes) propagate through BRIS to the e-Justice portal is unconfirmed from documentation alone.
- **No public REST API for third parties.** Portal-only.
- **Verdict: NOT VIABLE programmatically** — same as PL. Watch Directive 2025/25 implementation.

### Path 8 — Court/commercial register separate (Informacinis leidinys + TAR)

- **Informacinis leidinys (RC official bulletins):** weekly PDF (~128+ pages each), `https://www.registrucentras.lt/jar/infleid/download.do?oid={oid}`. By statute, management body changes must be officially published. Contains officer appointment/resignation notices. Public domain under Lithuanian Copyright Act Art. 5 (official acts not protected).
- **Engineering cost:** ~52 PDFs/year + historical backfill, OCR + text extraction, entity resolution to JAR codes. Similar to Croatia's Narodne Novine path.
- **TAR (`e-tar.lt`):** legal acts register (laws, regulations) — **wrong register type**, does not store company filings.
- **Notary Chamber, bankruptcy/insolvency gazette:** not viable for general officer roster.
- **Verdict: VIABLE-v1.5 (Strale-built derivative dataset under DEC-20260428-B engineering bar).** Tier-1 clean (official state publication, not third-party scraping). Not v1 due to engineering cost.

### LT synthesis

- **v1 path: JARS.LT** at €0–€15/mo (Starter tier = €5/mo for 5k req = €0.001/request effective), Baltic-platform officer coverage claimed, no long-term contract, no documented platform fee. **Pending same-day API field-check** to confirm director names actually appear in JSON response + **DEC-20260428-A sourcing attestation** (because Spinta has no officer names, JARS.LT must source from RC commercial API / electronic extract bulk-purchase / `Informacinis leidinys` parsing — must attest which).
- **v1.1 PRIMARY backup: Lursoft** (Baltic specialist, per-call claimed, officer coverage confirmed; 403-blocked direct probe; pricing confirmation + platform-fee attestation required).
- **v1.1 ALTERNATIVE: rekvizitai.vz.lt token API** — `vadovas` (sole executive) by name confirmed; full board/council coverage unclear; redistribution rights must be confirmed via API agreement.
- **v1.2 contingency: Creditinfo Lithuania** if Baltic-specialists fail on pricing/attestation.
- **v1.5: Strale-built `Informacinis leidinys` pipeline** under DEC-20260428-B when volume justifies engineering investment.
- **Truly blocked? NO** — multiple paths exist; JARS.LT is verifiable same-day at €5/mo if API field-check passes.
- **Key LT-unique finding:** Lithuania has chosen a different open-data design from Estonia — governance-structure flags only, personal names excluded. Phase 2's "vadovas paywall" framing was misleading; the more accurate framing is "Lithuania's open data layer is intentionally personal-data-minimized." This shapes the v1 architecture: unlike EE where a bulk-download capability is feasible, LT must use a per-call commercial aggregator.

---

## Cross-country observations

### Platform-fee probe results (extending the HR Topograph correction)

The 2026-05-18 HR Topograph correction (Journal `35967c87082c8177`) discovered that "no minimum commitments per public docs" hid a €1,500/month platform fee. Phase 5 applied this probe systematically:

| Vendor | Country | Platform-fee status | Source |
|---|---|---|---|
| InfoVeriti | PL | **CONFIRMED €500–2,000/mo subscription** | Market data |
| Transparent Data | PL | Likely annual platform fee (€2,500 starting per Datarade) | Datarade.ai listing |
| Topograph | LT | LT NOT IN COVERAGE; also DQed €1,500/mo | docs.topograph.co llms.txt |
| Risika | LT | "€60K per country" enterprise pricing | Secondary sources |
| Kyckr | PL | Asserts per-call no-subscription; unconfirmed | Public positioning |
| Kompany | PL | Per-call credits; pricing page 403 | Public positioning |
| Lursoft | LT | "Without subscription, paying individually" — unconfirmed | Secondary sources, direct probe 403 |
| rekvizitai.vz.lt | LT | RFQ token API, no public pricing | Secondary sources |
| JARS.LT | LT | **€5/mo Starter, no long-term contract, no documented platform fee** | Direct pricing page |
| MGBI / nip24.pl | PL | RFQ-only | No public pricing |
| Creditinfo / Coface / Bisnode | PL/LT | Annual contract assumed | Industry pattern |

**Confirmed pure-per-call no-platform-fee in Phase 5: ZERO direct confirmations.** JARS.LT is the closest candidate (low monthly subscription functions like a per-call budget at the v1 volume). Every other "viable" candidate is v1.1 pending RFQ-time platform-fee confirmation. **The platform-fee probe is now the single largest gate on v1 commit timeline for both PL and LT.**

### BRIS coverage findings (extending HR/EE/BE observations)

- PL: BRIS includes "legal representatives" per the e-Justice portal description — **richer than Croatia or Estonia at the gateway level** — but no third-party API exists. Portal-only.
- LT: BRIS includes "management body members data and persons authorized to represent" per the e-Justice portal description. No third-party API.
- Directive (EU) 2025/25 expands BRIS scope and mandates digital EU power of attorney for authorized signatories — future API exposure possible but not yet implemented.
- **Implication:** BRIS remains deprioritized as a v1 path for all 5 countries in this audit series (HR/EE/BE/PL/LT). Useful for `EUID` cross-referencing at most.

### Open data aggregator landscape

- **OpenCorporates:** subscription-only (£2,250+/yr min) — disqualified for all countries audited under v1 cost discipline.
- **OpenSanctions:** screening-list primitive, not officer-roster. EE's `ee_ariregister` dataset was the only proper roster product surfaced across all 5 countries; PL/LT have no equivalent.
- **BODS / Open Ownership:** UBO primitive, not directors. PL CRBR not BODS-published; LT JANGIS not BODS-published; BE not in BODS; HR FINA RSV not BODS-published. Across all 5 countries, BODS has zero coverage of officer rosters.
- **GLEIF Level 1+2:** zero officer coverage across all 5 countries.

### DEC-20260428-A scope question (Phase 5 additions)

| Country | Doctrine-blocked path | Alternative available? |
|---|---|---|
| PL | Path 6 (`wyszukiwarka-krs.ms.gov.pl` HTML/PDF) | YES — Kyckr / Kompany / Transparent Data via Tier 2 |
| PL | Path 8 (MSiG gazette + eKRS filings) | Tier-1 clean for Strale-built derivative; **engineering-heavy + October 2025 reform reduced forward value** |
| LT | Path 6 (rekvizitai.vz.lt HTML scrape) | YES — Lursoft / rekvizitai token API / JARS.LT via Tier 2 |
| LT | Path 8 (`Informacinis leidinys` gazette) | Tier-1 clean for Strale-built derivative; engineering-heavy |

**Cross-country pattern emerging across Phase 1–3 (HR/EE/BE) + Phase 5 (PL/LT):** every country has 1–2 gazette-style paths (Narodne Novine HR, Ametlikud Teadaanded EE, Moniteur Belge BE, MSiG PL, Informacinis leidinys LT) that are Tier-1-clean for Strale-built derivative datasets but engineering-heavy (PDF parsing + entity resolution). The pattern is consistent enough to warrant **a single DEC-DB entry resolving "gazette-style statutorily-published officer-change PDFs"** when historical-officer coverage becomes a customer requirement — not a per-country interpretation.

**Phase 5 sharpens the vendor sourcing-method attestation requirement.** PL's October 2025 criminal-penalty amendment is the limit case: a vendor providing non-anonymized PL officer data may have lawful sourcing (bilateral RC agreement) or unlawful sourcing (web-UI session-token circumvention now criminally exposed). The DEC-20260428-A Tier 2 attestation must be explicit on sourcing mechanism for PL and SHOULD be explicit for LT (where rekvizitai.vz.lt / JARS.LT sourcing is opaque).

---

## Recommendations for chat-side action

| Country | v1 decision | Immediate action | Parallel actions |
|---|---|---|---|
| **PL** | Build against Kyckr (primary) → Kompany → Transparent Data, all v1.1 | Contact Kyckr: confirm PL per-record price, request platform-fee confirmation, request DEC-20260428-A sourcing-method attestation (bilateral RC agreement / Full API access / PDF extraction / other). Same for Kompany. | Contact Transparent Data for per-call rate (their default looks subscription); contact MGBI / nip24.pl as v1.2 backups. Log DEC entry once vendor selected. **Defer Strale-built MSiG/eKRS to v1.5 — engineering-heavy + October 2025 reform reduced value.** |
| **LT** | Build against JARS.LT (verify same-day) → Lursoft → rekvizitai.vz.lt token API | **Same-day:** Register free JARS.LT account (100 req/mo free tier). Call director endpoint for Vilnius University (11125567) + AB SEB bankas (21258254). Confirm director names appear in JSON response. If confirmed → request DEC-20260428-A sourcing attestation (RC commercial agreement / extract bulk-purchase / gazette parsing). | Contact Lursoft (info@lursoft.lv) for per-call pricing + platform-fee confirmation. Contact rekvizitai.vz.lt (info@rekvizitai.lt) for token API redistribution-rights terms. **Defer Strale-built Informacinis leidinys to v1.5.** |

**Open vendor questions (all v1.1 candidates):**
- PL: Kyckr exact per-record price + platform-fee + sourcing-method attestation
- PL: Kompany pricing page (403-blocked) + PL coverage confirmation
- PL: Transparent Data per-call negotiation (default appears subscription)
- LT: JARS.LT API response field verification (does the director endpoint return names?)
- LT: JARS.LT sourcing-method attestation (Spinta has no names; where does JARS.LT get them?)
- LT: Lursoft pricing page (403-blocked) + platform-fee + redistribution rights
- LT: rekvizitai.vz.lt token API ToS redistribution rights review

**DEC-20260428-A clarification request to Petter (Phase 5-specific):** Two distinct doctrine questions surfaced.

1. **PL-specific:** The October 2025 amendment creates a new criminal-penalty exposure for unauthorized KRS network access. Strale must require explicit written attestation from any PL vendor confirming their non-anonymized officer data sourcing is via (a) bilateral MoJ data agreement / Full API decision, (b) PDF download from public web UI under permitted access (note: criminal-penalty risk), (c) other licensed arrangement. This is a higher bar than Tier 2 default — should the Tier 2 attestation requirement be raised for PL specifically? Worth a DEC-DB note.
2. **Gazette doctrine cross-country (PL MSiG + LT Informacinis leidinys + BE Moniteur Belge + HR Narodne Novine + EE Ametlikud Teadaanded):** Five countries have gazette-style statutorily-published officer PDFs. All are Tier-1 clean for Strale-built derivatives but engineering-heavy. **The pattern is consistent enough that one DEC-DB entry can resolve this for all jurisdictions at once** when historical-officer coverage becomes a customer requirement.

**Phase 5 to-do updates:**
- PL Class A/B placeholder (existing `polish-company-data.ts` handler) — keep current JSON-anonymized capability operational; add v1.1 follow-up task "PL Kyckr/Kompany/Transparent Data RFQ + DEC-20260428-A sourcing attestation"
- LT same — keep current Spinta-flags capability operational; add v1.1 follow-up task "LT JARS.LT same-day API field-check + sourcing attestation; Lursoft + rekvizitai.vz.lt RFQ in parallel"

**Memory entry update:** Realistic v1 launch coverage now extends to PL + LT with **v1.1 (attestation-required) classification only** — no clean Tier-1 zero-cost path exists for either country. Add to per-country project memory: PL has October 2025 criminal-penalty exposure elevating vendor attestation; LT has personal-data-minimized open-data design unlike EE.

---

## Stop-condition compliance

- All 16 path investigations (2 countries × 8 paths) documented with evidence per path.
- No path skipped without explicit evidence-based reasoning.
- Platform-fee probe applied per Path 4 vendor (HR Topograph correction precedent enforced).
- PL JSON-anonymized vs PDF-named question RESOLVED with direct API response evidence (live probe of KRS 0000006865 in both JSON and PDF formats).
- LT "vadovas paywall" claim refined with direct schema evidence (`valdymo_organai/ValdymoOrganas` field-level probe).
- Final recommendation per country with cost / latency / risk / DEC-20260428-A scope.

## Caveats logged

- **PL Path 4 vendor pricing not directly observable:** Kyckr/Kompany/Transparent Data/MGBI/nip24.pl all gate per-call pricing behind RFQ. Pricing-page probes were 403 or no-content for several. All Path 4 PL vendors classified v1.1 pending RFQ.
- **LT registrucentras.lt direct probes 100% ECONNREFUSED:** All 7 attempts failed (Railway US East egress blocked by the LT government). LT registry findings rely on secondary documentation (DocuPipe extraction docs, tet.lt blog, e-justice.europa.eu portal description).
- **LT rekvizitai.vz.lt direct probe HTTP 403:** Public web display of `vadovas` confirmed only via secondary sources (tet.lt blog). First-hand verification deferred to next phase (browser session from EU-region IP, or vendor contact directly).
- **LT Lursoft direct probe HTTP 403:** Pricing page and API documentation 403-blocked. Per-call model claim from secondary sources only.
- **PL PDF endpoint HTTP 400:** AES-128-CBC session-token mechanism documented from third-party reverse-engineering work; not directly verified by Strale's session.
- **BRIS probes returned 307→sorry.ec.europa.eu from US-East egress** (same as Phase 1–3). Assessment grounded in e-Justice portal documentation.
- **JARS.LT API field-check NOT executed this session:** the same-day verification is the chat-side immediate action; the partial flags it as required before commit.
- **Topograph LT/PL probes returned 404 / missing from llms.txt:** LT confirmed not in Topograph's coverage matrix; PL implied present in the broader coverage but per-country docs not surfaced in this session.

---

*Phase 5 exhaustive enumeration complete. Findings synthesized for chat-side Phase 5 implementation prompts. Recommended sequencing: LT same-day JARS.LT verification first (lowest-friction commit), PL RFQ cycle in parallel (~2-week vendor due-diligence loop).*
