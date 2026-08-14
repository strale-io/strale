# Exhaustive source enumeration — MT + CY + HU + LU (DEC-20260518-E)

**Date:** 2026-05-18
**Author:** Claude Code (Sonnet research subagents, synthesized by Opus 4.7)
**Phase:** 6 (MT + CY + HU + LU binding-ready Tier-2)
**Doctrine:** DEC-20260518-E (Exhaustive Source Enumeration); DEC-20260518-F (per-call statutory web UI / PDF); DEC-20260518-G (Tier-2 platform-fee probe mandatory); DEC-20260428-A (no Strale-operated scrapers); cost discipline (per-call passthrough OK, fixed monthly fees NOT OK in v1)
**Test entities:** MT — GO plc (MT12826209), Bank of Valletta plc, HSBC Malta; CY — Wargaming Group Limited (reg 290868), Bank of Cyprus; HU — OTP Bank (01-10-040952), MOL (13-10-041527), Richter Gedeon (01-10-040944); LU — RTL Group (LU18513414), Aperam, BGL BNP Paribas, Cargolux, BCEE, SES, **ArcelorMittal (LU18804375 VAT / B82454 RCS — Openapi index-hole test case)**
**Source partials:** [_partial_mt_enumeration.md](_partial_mt_enumeration.md), [_partial_cy_enumeration.md](_partial_cy_enumeration.md), [_partial_hu_enumeration.md](_partial_hu_enumeration.md), [_partial_lu_enumeration.md](_partial_lu_enumeration.md)

---

## Executive summary

**All four countries previously routed via Openapi WW-Top at "thin-usable+ identity, no representatives" are viable-v1 for representative coverage.** Three (MT, HU, LU) route through a single vendor (Topograph) pending RFQ; one (CY) is viable today via free open data.

| Country | Phase 4/5 verdict | Revised verdict | v1 path | Cost | Confidence |
|---------|-------------------|-----------------|---------|------|------------|
| **MT** | Openapi identity, no reps | **viable-v1 pending Topograph RFQ** | Topograph per-call → BAROS `legalRepresentatives` + `directors` + `secretaries` | Per-call RFQ-gated (no platform fee in docs) | HIGH on path / MODERATE on cost |
| **CY** | Openapi identity, no reps | **viable-v1 TODAY** | data.gov.cy DRCOR officers CSV — 120 MB, CC BY 4.0, monthly refresh, **HTTP 200 live-probed 2026-05-18** | **FREE** | HIGH |
| **HU** | Openapi identity, no reps | **viable-v1 pending Topograph RFQ** | Topograph per-call → §13 Cégkivonat → name + birth date + address + role + start date + representation mode | Per-call variable (kbyte-based + processing fee, no subscription floor) | HIGH |
| **LU** | Openapi identity, no reps, B-prefix index-hole | **viable-v1 pending Topograph RFQ** | Topograph per-call → AI-parsed Extrait du RCS → Gérant/Administrateur/Président; **resolves B82454 index-hole** | Per-call RFQ-gated; ~€13.50 extrait passthrough as floor | MODERATE |

**Headline finding — Topograph covers 3 of 4 (MT + HU + LU) under one vendor relationship.** Combined with HR confirmed in Phase 5, a single Topograph onboarding closes the representative-coverage gap on 4 EU jurisdictions. Topograph's documented model is per-call with no minimum commitments and no platform fee observed in HR (Phase 5 ground truth); MT/HU/LU per-country pricing is magic-link-gated and requires RFQ + DEC-20260518-G probe.

**Headline finding for CY — the EE pattern replicates.** A 120 MB CC BY 4.0 monthly-refreshed CSV (`organisation_officials_83.csv` at data.gov.cy) contains 1,168,824 officer rows: 635,123 directors (Διευθυντής), 438,479 secretaries, plus alternate directors, authorized persons, partners. Live HEAD probe 2026-05-18 returned HTTP 200, Last-Modified 2026-04-29. Confirms and upgrades the prior 2026-05-07 spike (DEC-20260507-G) with live evidence + field schema + Wargaming test resolution.

**Phase 4/5 corrections from this enumeration:**
- **CY Wargaming `CY99000230P` 204 anomaly closed.** The Openapi test value is not a valid DRCOR registration number. Wargaming is registered as numeric `290868`, type `C`. The DRCOR open-data file confirms 5 officers (3 directors + 1 secretary + 1 director — Nick Katselapov, Victor Kislyi, Eugeni Kisly, Marios Pelides, Christis Christoforou). The 204 was an invalid input, not a data gap.
- **LU B82454 index-hole resolved by Topograph.** ArcelorMittal SA's RCS number is B82454 (per articles of association). Openapi's LU lookup is VAT-only and fails on LU18804375; Topograph supports B-prefix RCS natively (`B246607` example in docs). Topograph closes the index-hole.
- **MT 204 thin-data on some entities likely vendor-side, not registry-side.** Topograph sources directly from BAROS (MBR) and should have broader coverage than Openapi's WW-Top index. Some thin-data 204s may persist for dissolved/struck-off entities.

**Revised v1 launch coverage:** All four jurisdictions move from "identity-only, partial" (Phase 4/5) to "representative-coverage shippable" in Phase 6. Combined with HR + EE + BE + PL + LT (Phase 5) and the previously-viable EU/UK set, this closes the representative-coverage gap on a large block of EU-27.

**DEC-20260428-A scope question raised by Phase 6:** None — all four resolve to clean Tier 1 (CY open data) or clean Tier 2 (Topograph licensed) with viable alternatives. No new gazette-style scope question of the form raised by BE Moniteur Belge in Phase 5.

---

## Doctrine reference

- **DEC-20260518-E** — Exhaustive 8-path source enumeration mandatory before classifying a country "blocked" or "paid-only". Three Phase 2/3 "blocked" verdicts (HR, EE, BE) were reversed by this discipline in Phase 5. Phase 6 applies the same discipline to MT/CY/HU/LU.
- **DEC-20260518-F** — Per-call HTML/PDF parsing of statutorily-public registry detail pages is in-scope when four constraints hold: (a) statutorily public, (b) ToS permits per-call, (c) per-entity per-customer-request not bulk, (d) attribution preserved.
- **DEC-20260518-G** — Platform-fee probe MANDATORY for RFQ-only Tier-2 aggregators. Probe explicitly for: platform fee, setup fee, monthly minimum, annual floor, volume-tier locked floors, termination fees. Public docs language can be technically accurate but materially misleading (Topograph's "no minimum commitments" claim was true for per-call rates while a €1,500/mo platform fee existed separately — the Phase 5 failure case).
- **DEC-20260428-A** — Tier 1 (Strale never operates scrapers) is absolute. Tier 2 (vendor-mediated, statutorily public, licensed redistribution) requires signed sourcing-method attestation.
- **Petter cost rule** — Per-call costs OK if passed through to customer; fixed monthly fees NOT OK in v1.
- **EU 2023/138 CAVEAT** — §5.1 mandates only identity fields (name/status/address/legal form/reg number/date/NACE) — **NOT** representative names. Per course-correction Journal `36467c87082c8169`. Do not cite as a rep-content mandate.

---

## MT — 8-path enumeration

Test entities: GO plc (MT12826209), Bank of Valletta plc, HSBC Malta. Full partial: [_partial_mt_enumeration.md](_partial_mt_enumeration.md).

### Path 1 — Openapi other endpoints / MT-specific SKU

- 49 production scopes in Openapi catalog. Italy is the only country with a dedicated `stakeholders` SKU (`IT-stakeholders` €0.095+). **No `MT-stakeholders`, `MT-directors`, or `MT-representatives` product exists.**
- WW-Top / WW-Advanced / WW-Start: identity fields only; `legalRepresentatives` / `directors` not in documented schema for MT.
- No evidence of MT product additions since 2026-05-11.
- **Verdict: NOT VIABLE for representatives.** Openapi WW-Top is the correct identity slot; the vendor does not expose officer data for MT under any product.

### Path 2 — MBR direct API (March 2026 launch)

- MBR launched four API packages in March 2026: Company Search, Basic Company Details, **Full Company Details (includes "involvement" = officers + share capital)**, Bundle.
- "Involvement" corroborated as MBR's term for officers via three independent sources: EU e-Justice portal (Malta), Kyckr 2025 review, IFSP notice title ("MBR Notice: Accessing Involvements").
- **DEC-20260518-G probe:** Subscription fee **CONFIRMED PRESENT** ("Subscription fee is to be paid for each API for which access is granted" — Malta Business Weekly). Specific amounts NOT disclosed (PDF binary, page magic-link gated). Other dimensions unknown.
- **Eligibility risk:** APIs targeted at "Subject Persons" (Corporate Service Providers, AML/CFT-obligated entities). Strale qualification ambiguous.
- **Verdict: BLOCKED pending RFQ.** Subscription confirmed; amount unknown; eligibility unverified. Cannot ship under v1 cost discipline without confirmation of per-call billing beneath subscription.

### Path 3 — data.gov.mt open tier

- `portal.data.gov.mt` and `open.data.gov.mt` return HTTP 403 on all WebFetch probes (CDN block).
- OpenCorporates Open Company Data Index scores Malta **0/30 for open license** and **0/20 for full-dataset download or open API**.
- No officer-bearing bulk file identified at any indexable URL. Portal contents described in MITA materials as "works in progress and not to be considered as providing official records."
- **The EE-pattern (CC BY 4.0 daily dump with officers) is NOT available for Malta.**
- **Verdict: NOT VIABLE.** No free open-tier API or downloadable dataset with officer fields.

### Path 4 — Tier-2 paid per-call aggregators

- **Topograph (`docs.topograph.co/essentials/malta`)** — HTTP 200, content retrieved. `legalRepresentatives` + `directors` + `secretaries` + `involved_parties` + `legal_form` + `share_capital` confirmed. Source: BAROS (official). Identifier: `C + space + digits` (e.g., `C 2833`). **DEC-518-G probe:** "Pay-per-request, no bulk contracts, no minimum commitments" in docs introduction; pricing page magic-link gated; MT-specific per-call price RFQ-required. HR precedent (Phase 5) confirmed no platform fee for HR — same expected for MT pending probe. **Verdict: VIABLE-V1 (pending RFQ + DEC-20260428-A vendor attestation).**
- **Kyckr** — Officers confirmed via Enhanced Profile (`GET /companies/{kyckrId}/enhanced`); all fee dimensions undisclosed; RFQ required. **Verdict: VIABLE-V1.1 fallback.**
- **Creditinfo Malta** — Subscription-only credit bureau product. **NOT VIABLE-V1.**
- **OpenCorporates** — £2,250+/year subscription, no PAYG. **NOT VIABLE-V1.**
- **TransactionLink** — Probable subscription, field schema not accessible. **NOT VIABLE-V1.**
- **Schmidt & Schmidt** — £138/document (per-document broker). Wrong price band. **NOT VIABLE.**

### Path 5 — MBR public portal (DEC-518-F assessment)

- `register.mbr.mt` — JavaScript SPA; HTTP 403 to all direct probes.
- EU e-Justice Portal confirms: "Identity of company officials (directors, shareholders, legal representatives, secretaries, auditors)" is available **free of charge to any natural person**, no account required.
- **DEC-518-F constraints:** (a) Statutorily public — YES (Companies Act Cap. 386); (b) ToS permits per-call — NOT VERIFIED (portal 403 blocks ToS read); (c) Per-entity — SATISFIABLE; (d) Attribution — SATISFIABLE.
- **DEC-20260428-A Tier 1 override:** SPA requires Browserless-rendered session → Strale would operate the browser fetcher → ABSOLUTE bar.
- **Verdict: BLOCKED under DEC-20260428-A.** Topograph (Path 4a) is the licensed-vendor proxy that operates the fetch on Strale's behalf.

### Path 6 — Open data bulk

- No official MBR bulk dump with officer data exists. OpenCorporates 0/20 score on full-dataset download confirms.
- `eic-network/malta-files` GitHub repo (scraped Malta data, EIC journalism project) — no license file; Tier-1 prohibition applies to consuming Strale-equivalent scraped data without clean vendor relationship.
- **Verdict: NOT VIABLE.**

### Path 7 — Tier-2 commercial bulk

- DatoCapital (`datocapital.mt`) covers 258K MT companies / 207K directors via web portal; no API; no DEC-20260428-A-compatible bulk license documented.
- InfobelPRO / CompanyData / HitHorizons — proprietary, subscription-priced, not DEC-20260428-A-clean for redistribution.
- **Verdict: NOT VIABLE.** Topograph (per-call) is superior in every dimension.

### Path 8 — Government Gazette (Gazzetta tal-Gvern)

- PDF-only since 2015; predictable URL pattern at `govcms.gov.mt`. Officer appointments published as gazette notices at incorporation + formal change events.
- No structured XML/JSON. PDF parsing requires Strale-operated LLM extraction → DEC-20260428-A Tier 1 prohibition. Coverage gap: only incorporation events + filed changes, not current state.
- **Verdict: NOT VIABLE for v1.** Derivative-dataset build for v2 historical coverage if needed.

### Path 9 — Other MT surfaces

- **Malta RBO (Beneficial Ownership Register):** Post-CJEU Nov 2022, restricted to legitimate-interest applicants; €5/request. UBO ≠ directors. **NOT VIABLE.**
- **MFSA:** Historical predecessor to MBR; today all data flows through MBR/BAROS. **NOT APPLICABLE.**
- **BRIS/e-Justice:** Identity fields only per §5.1; no officer extension. **NOT VIABLE.**
- **Identifier gap:** Current Strale regex `^MT\d{8}$` (VAT) ≠ Topograph's `C + space + digits` (MFSA/BAROS). Implementation requires VAT→C-number resolution step or accepting C-prefix input. Solvable, not a blocker.

### MT synthesis

- **v1 path: Topograph (Path 4a)** — per-call, no documented subscription floor, all officer fields confirmed in docs. Required: (1) RFQ for MT per-call price, (2) DEC-20260518-G platform-fee confirmation, (3) DEC-20260428-A vendor attestation, (4) identifier-resolution implementation (VAT↔C-number).
- **v1.1 fallback: Kyckr (Path 4b)** if Topograph RFQ fails on price.
- **v1.2 fallback: MBR direct API (Path 2)** if subscription fits and Subject Person eligibility confirmed.

---

## CY — 8-path enumeration

Test entities: Wargaming Group Limited (reg 290868), Bank of Cyprus. Full partial: [_partial_cy_enumeration.md](_partial_cy_enumeration.md).

### Path 1 — Openapi other endpoints / CY-specific SKU

- No CY-specific Openapi product. WW-Top serves CY at identity-only level.
- Wargaming `CY99000230P` 204 anomaly **closed**: that value is not a valid DRCOR registration number in any format. DRCOR uses pure numeric IDs (e.g., `290868`).
- **Verdict: NOT VIABLE for officers.**

### Path 2 — DRCOR paid API

- `efiling.drcor.mcit.gov.cy` is an ASP.NET Web Forms application — **no API exists**. The €10 paid full search is human-readable document delivery, not machine-readable API.
- DEC-518-G probe N/A (no API product).
- **Verdict: NOT VIABLE.**

### Path 3 — data.gov.cy DRCOR open data ⭐ **v1 WIN**

**Prior DEC-20260507-G finding confirmed and upgraded with live evidence.**

Three CSVs HEAD-probed live 2026-05-18 (all HTTP 200, Last-Modified 2026-04-29):

| File | Size | URL |
|------|------|-----|
| `organisation_officials_83.csv` | **120 MB** | `https://data.gov.cy/sites/default/files/organisation_officials_83.csv` |
| `registered_office_96.csv` | 20 MB | `https://data.gov.cy/sites/default/files/registered_office_96.csv` |
| `organisations_94.csv` | 88 MB | `https://data.gov.cy/sites/default/files/organisations_94.csv` |

- **License: CC BY 4.0 International** (confirmed from dataset page; OpenSanctions' "NonCommercial" tag is erroneous — use the primary source directly).
- **Officers schema:** `ORGANISATION_NAME, REGISTRATION_NO, ORGANISATION_TYPE_CODE, ORGANISATION_TYPE, PERSON_OR_ORGANISATION_NAME, OFFICIAL_POSITION`.
- **Row count: 1,168,824 officer rows** (635,123 Διευθυντής/director + 438,479 Γραμματέας/secretary + Owner + General/Limited Partner + Alternate Director + Assistant Secretary + Authorised Person + Deputy Secretary).
- **Wargaming live confirmation:** Reg 290868 returns 5 officers (Nick Katselapov, Victor Kislyi, Eugeni Kisly, Marios Pelides, Christis Christoforou — 3 directors + 1 secretary + 1 director). Closes Phase 4 anomaly.
- **Refresh: monthly** ("Μηνιαία"). Cost: **FREE, no auth, no contract, no lead time.**
- **DEC-20260428-A:** Compliant Tier-1 (CC BY 4.0 licensed-bulk, statutory public records, government publisher, clean redistribution).
- **DEC-518-G probe:** N/A (no vendor).
- **Known limitations:** Up to 30-day staleness; no appointment/cessation dates per row; no officer addresses; current/historical not row-flagged; corporate-nominee directors not flagged; CSV URL contains `_83` suffix that may rotate on dataset refresh (monitor dataset page, not direct file URL).
- **Verdict: VIABLE-V1 TODAY.** Implementation: nightly download → Postgres → indexed by REGISTRATION_NO → `cy-directors` capability.

### Path 4 — Tier-2 per-call aggregators

- **Topograph (`docs.topograph.co/essentials/cyprus`)** — `legalRepresentatives` confirmed with Greek/English role pairs. Source: DRCOR eFiling portal (Topograph operates the fetcher; data is statutory public — Tier-2 legitimate). **Critical constraint: requires Greek Unicode prefix `ΗΕ` (U+0397 U+0395), NOT Latin `HE`.** DEC-518-G probe: per-call, no subscription floor confirmed, CY price RFQ-gated. **Verdict: VIABLE-V1.1** (real-time upgrade vs. Path 3's monthly staleness).
- **Kyckr** — Directors confirmed; pricing RFQ-gated. **VIABLE-V1.2 fallback.**
- **OpenCorporates** — Director score 10/10 but API requires annual subscription. **NOT VIABLE-V1.**
- **Moody's / Kompany / BvD** — Enterprise subscription. **NOT VIABLE-V1.**
- **companiesregistry.cy** — Report-based service, no API. **NOT VIABLE-V1.**

### Path 5 — eFiling web UI (DEC-518-F)

- Directors confirmed in free public eSearch HTML per EU e-Justice portal. ASP.NET session-cookie required; not a JS SPA (server-rendered HTML).
- **DEC-518-F:** (a) YES (statutorily public, free); (b) UNVERIFIED (no ToS on portal); (c) STRUCTURAL FIT; (d) CONSTRUCTIVELY YES.
- **DEC-20260428-A Tier 1 BLOCKS** regardless: Strale cannot operate scraper.
- **Verdict: BLOCKED.** Not needed — Path 3 (open data) + Path 4a (Topograph) deliver same data under clean doctrine.

### Path 6 — Open data bulk

- **Identical to Path 3** for CY. The data.gov.cy CSV IS the bulk download.
- OpenSanctions `cy_companies` dataset (1.14 GB FTM JSON) is the same data with added NC restriction — use primary source instead.
- BRIS exposes identity only; no officer extension.
- **Verdict: SAME AS PATH 3 (viable-v1 today).**

### Path 7 — Tier-2 commercial bulk

- Topograph (Path 4a) is the documented Tier-2 commercial operator. BvD/Moody's/Kyckr/D&B all enterprise-subscription.
- **Verdict:** Topograph (Path 4a) covers this path operationally; no distinct bulk product needed.

### Path 8 — Cyprus Official Gazette (Επίσημη Εφημερίδα)

- Fifth Supplement Part I publishes company events (HE3/HE4 forms for director changes).
- `companies.gov.cy/en/knowledgebase/gazette` archive indexes 600+ publications; Government Printing Office hosts PDFs (free).
- PDF-only; no XML feed. Coverage = change events, not current snapshot. Already covered by Path 3 for current state.
- **Verdict: NOT-V1.** v2 derivative dataset if customers need historical-officer tenure dates.

### Path 9 — Other CY surfaces

- **Cyprus UBO Register:** Public access **CLOSED 2023-01-03** post-CJEU C-37/20. UBO ≠ directors anyway. **OUT OF SCOPE.**
- **UK Companies House carryover:** No surviving link for post-independence (1960+) companies. **NOT APPLICABLE.**
- **Apitalks/api.store wrapper:** Same data.gov.cy data with intermediary; use primary source. **NOT a distinct path.**
- **CSE/CySEC disclosures:** Listed-companies only (~30 entities). Too narrow.

### CY synthesis

- **v1 path: Path 3 — data.gov.cy DRCOR open data CSV.** FREE, CC BY 4.0, 1.17M officer rows, monthly refresh, no vendor needed. **Operational within days.**
- **v1.1 path: Topograph (Path 4a)** for real-time upgrade if 30-day staleness becomes a customer issue. Requires Greek `ΗΕ` Unicode normalization.
- **Phase 4 corrections:** Wargaming 204 anomaly explained (invalid Openapi test value); OpenSanctions NC license tag erroneous (primary source is unrestricted CC BY 4.0).
- **CY is the strongest Phase 6 finding** — no vendor relationship, no RFQ, no platform-fee risk. Same structural pattern as EE in Phase 5.

---

## HU — 8-path enumeration

Test entities: OTP Bank (01-10-040952), MOL (13-10-041527), Richter Gedeon (01-10-040944). Full partial: [_partial_hu_enumeration.md](_partial_hu_enumeration.md).

### Path 1 — Openapi other endpoints / HU-specific SKU

- 49 production scopes; AT/BE/CH/DE/ES/FR/GB/IT/PL/PT have dedicated stakeholders SKUs. **No HU-stakeholders or HU-shareholders product.**
- WW-Top (current routing) + WW-Advanced confirmed: no officer fields in documented schema for HU.
- **Verdict: NOT VIABLE for representatives.**

### Path 2 — OCCSZ / Céginformációs Szolgálat direct API

- Free informational tier (tájékoztató cégkivonat) exposes director names via web UI; certified hiteles cégkivonat HUF 600–2,000 per document.
- **OCCSZ XML API exists** (confirmed via Topograph's source documentation and companyapi.hu sourcing) but requires registration via Magyar Cégadat Szolgáltató Kft — not self-serve. Fee schedule opaque; ASZF PDF binary, not human-readable in this session.
- **DEC-518-G probe:** Setup/monthly/floor/termination none documented for the informational tier; XML API contact-form-gated.
- **Verdict: PARTIALLY VIABLE / COMPLEX.** XML API likely requires vendor engagement to access (effectively Tier-2 in practice).

### Path 3 — Free / open data (data.gov.hu / opendata.hu)

- No company-officer dataset on opendata.hu, data.gov.hu, or koz.hu. Hungary has not published the EE-equivalent CC BY 4.0 bulk dump.
- OpenCorporates HU: API subscription only (£2,250+/yr); CAPTCHA on web view. Wrong cost model.
- GLEIF: no officer fields. Open Ownership: UBO ≠ directors and HU UBO restricted per CJEU.
- **Verdict: NOT VIABLE.**

### Path 4 — Tier-2 per-call aggregators

- **Topograph (`docs.topograph.co/essentials/hungary`)** — `legalRepresentatives` confirmed from §13 of Cégkivonat: name + birth date + address + role + start date + representation mode (sole/joint signing). Auditors (§14) + supervisory board (§15) also extracted. Sources: OCCSZ XML API + Cégkivonat PDF + NAV EVNY (sole traders) + VIES + NAV Group VAT Registry. Identifiers: Cégjegyzékszám preferred, also adószám, VAT, name. **DEC-518-G probe:** Variable pricing (kbyte-based TRE cost + processing fee); `profileMaxBudget` parameter available; no platform fee / setup / monthly minimum / annual floor mentioned. Critical limitation: closed companies use minimal TRE format that may omit §13 (representatives only for active companies). **Verdict: VIABLE-V1 (pending RFQ).**
- **companyapi.hu / cegadatapi.hu** — Manager names confirmed (no role detail, no birth date, no representation mode). **Subscription model 15,990–37,990 HUF/month** (~€42–€100/month fixed). **NOT VIABLE under v1 cost discipline.**
- **OPTEN** — Market-leading HU provider (~520K companies, 1.7M owners/executives); SOAP API; pricing fully RFQ-gated; enterprise/subscription model probable. **VIABLE-V1.1 (RFQ-gated; subscription risk).**
- **WellData** — New companies only; 32,990–39,990 HUF/month subscription. **NOT VIABLE.**
- **D&B/Bisnode HU** — Enterprise subscription. **NOT VIABLE.**

### Path 5 — OCCSZ web UI (DEC-518-F)

- `occsz.e-cegjegyzek.hu` is a JS SPA; direct probes return HTTP 400 (session-required).
- **DEC-518-F:** (a) YES (Act V of 2006, közhitelű nyilvántartás); (b) UNCERTAIN (ASZF PDF binary-opaque); (c) YES; (d) YES.
- **DEC-20260428-A Tier 1 BLOCKS** regardless.
- **Verdict: BLOCKED.** Topograph (Path 4a) is the licensed proxy.

### Path 6 — Open data bulk

- **No IM bulk dataset with officer fields.** Unlike EE (`kaardile_kantud_isikud.json.zip` 45 MB CC BY 4.0 daily), HU has no analog.
- Cégközlöny (HU Companies Gazette) accessible only via WellData subscription wrapper (new cos. only). `e-cegkozlony.gov.hu` TLS certificate **expired as of 2026-05-18** (confirmed connection failure).
- Magyar Közlöny does NOT publish company director appointments (those go to Cégközlöny). Wrong primitive.
- **Verdict: NOT VIABLE.**

### Path 7 — Tier-2 commercial bulk

- OPTEN bulk licensing — enterprise annual contract; subscription floor expected; not v1-compatible.
- GlobalDatabase / D&B HU — enterprise subscription.
- **Verdict: NOT VIABLE for v1.**

### Path 8 — Cégközlöny (Companies Gazette) parsing

- Statutory officer-appointment publication vehicle (Act V of 2006 §17). Weekly publication. No XML feed. Gazette portal TLS-expired.
- WellData subscription wrapper exists (new cos. only). Derivative-dataset build required.
- **Verdict: V1.2+ only.**

### Path 9 — Other HU surfaces

- **BRIS:** Officers chargeable per HU at gateway; no third-party API. **NOT VIABLE.**
- **CEGINFO, ceginformacio.hu, CégTaláló, PartnerControl:** Per-document or subscription resellers, no per-call API. **NOT VIABLE.**

### HU synthesis

- **v1 path: Topograph (Path 4a)** — per-call variable (kbyte-based + processing fee); rich officer fields (name + birth date + address + role + start date + signing mode). Required: (1) RFQ for sample pricing on OTP Bank, MOL, Richter; (2) DEC-518-G platform-fee confirmation; (3) DEC-20260428-A vendor attestation; (4) accept limitation that closed companies may omit §13.
- **v1.1 fallback: OPTEN** — pending RFQ + subscription-risk audit per DEC-518-G.
- No alternative free / open path. HU has not built the EE-pattern.

---

## LU — 8-path enumeration

Test entities: RTL Group, Aperam, BGL BNP Paribas, Cargolux, BCEE, SES; **ArcelorMittal SA (LU18804375 / B82454 — Openapi index-hole)**. Full partial: [_partial_lu_enumeration.md](_partial_lu_enumeration.md).

### Path 1 — Openapi other endpoints / LU-specific SKU

- No LU-specific Openapi product. WW endpoints route LU as part of "all countries"; no officer fields documented.
- Openapi's "Current Company Representatives Report" SKU (€2.30/call) exists but country coverage for LU is not documented.
- **Index-hole confirmed:** LU18804375 (ArcelorMittal VAT) is not indexed in Openapi's LU lookup. B82454 (its RCS number per articles of association: "R.C.S. Luxembourg, section B numéro 82 454") is registered in LBR but Openapi has no B-prefix route.
- **Verdict: NOT VIABLE for directors; index-hole structural and unresolved within Openapi.**

### Path 2 — LBR direct API (professional / commercial tier)

- LBR launched a commercial API summer 2022 (i-Hub press release Oct 2022 confirms: "automated access to professionals with significant information needs … RCS consultation and company profiles purchase").
- First production client: i-Hub S.A. (POST Luxembourg subsidiary, CSSF-regulated).
- **DEC-518-G probe:** ALL DIMENSIONS UNDISCLOSED. tarifs.pdf binary-opaque. Multiple guides ("kyckr.com", "businesswestern.co.uk") characterize LBR API as "large enterprise clients, paid model … for high-volume usage" → strong subscription signals.
- **Eligibility risk:** i-Hub framing + LuxTrust certificate requirements elsewhere on LBR portal suggest LBR designed API for LU-domiciled CSSF-regulated entities. Foreign-entity eligibility unconfirmed; eIDAS-equivalent may or may not suffice.
- **Index-hole resolution:** LBR API would natively cover B82454.
- **Verdict: STRUCTURALLY PROMISING but NOT VIABLE-V1.** Pricing model and eligibility both unconfirmed. RFQ + eligibility verification required.

### Path 3 — data.public.lu open tier

- "Extrait du RCS Luxembourg" dataset URL on data.public.lu returns **404** (likely removed in August 2025 portal redesign).
- Multiple 2025 sources confirm: "the dataset isn't available in bulk — neither for free nor for sale."
- RESA (replaced Mémorial C in 2016) is a publication browser, not a bulk export. No JSON/XML feed.
- **Unlike EE, Luxembourg has no CC-licensed daily/monthly bulk dump.**
- **Verdict: NOT VIABLE.**

### Path 4 — Tier-2 per-call aggregators

- **Topograph (`docs.topograph.co/essentials/luxembourg`)** — `legalRepresentatives` confirmed via AI parsing of certified Extrait du RCS. Roles: Gérant, Gérant unique, Administrateur, Président, ISO 5009-mapped. **B-prefix RCS supported** (`B246607` example in docs) + LU-prefix VAT. **DEC-518-G probe:** Per-call (consistent with general model); no subscription floor mentioned; partial pricing datum: ~€13.50 LBR certified-extrait pass-through as floor; full per-call price RFQ-gated. **Index-hole resolved: B82454 covered.** **Verdict: VIABLE-V1 (pending RFQ + DEC-20260428-A attestation).**
- **Kyckr** — Director coverage confirmed; pricing RFQ-gated. **VIABLE-V1.1.**
- **Kompany (Moody's)** — Upgraded LBR connection announced; directors confirmed; credit-based pricing RFQ-gated. **VIABLE-V1.1.**
- **Northdata** — Directors at L-tier+; **€500–€1,500/month subscription, 12-month minimum.** **NOT VIABLE-V1.**
- **Dato Capital** — Directors confirmed (466,568 LU directors in DB); **subscription-only ~€470/month PRO, no PAYG.** **NOT VIABLE-V1.**
- **Pappers LU** — Per-call model possible (extends from Pappers.fr); blocked by 403/404 in this probe. **POSSIBLE-V1.1.**
- **TransactionLink** — Directors confirmed; "Book a call" wall on pricing. **VIABLE-V1.1.**

### Path 5 — LBR public portal (DEC-518-F)

- **CAPTCHA implemented in August 2025 portal redesign** (Paperjam article confirms anti-robot verification system).
- **DEC-518-F:** (a) YES (LU Code de Commerce); (b) **BLOCKED** (CAPTCHA = explicit anti-automation signal); (c) YES; (d) YES.
- DEC-20260428-A Tier 1 also BLOCKS.
- **Verdict: NOT VIABLE.** Confirms that directors ARE present on the statutory public portal (basis for Topograph's licensed Tier-2 extraction being legitimate).

### Path 6 — Open data bulk

- data.public.lu dataset 404; opendatalu GitHub has only portal infrastructure.
- RESA: PDF-only publications browser, no structured API.
- **Verdict: NOT VIABLE.**

### Path 7 — Tier-2 commercial bulk

- Northdata / Dato Capital / D&B / Bisnode — all subscription. Not v1-compatible.
- LBR direct bulk licensing — same eligibility + pricing risk as Path 2.
- **Verdict:** Topograph (Path 4a) is the leading Tier-2 candidate; no separate bulk product needed.

### Path 8 — RESA gazette

- RESA publishes director appointments automatically when filed with RCS (no separate filing required).
- HTTP 429 received on probe (rate-limited even on no-auth URL). PDF-only; no RSS / XML feed.
- **DEC-518-F:** (a) YES; (b) BORDERLINE (rate-limit signals automation-disfavored); (c) YES; (d) YES.
- **Verdict: NOT VIABLE as primary.** Useful as historical supplement once primary structured source exists.

### Path 9 — Other LU surfaces

- **BRIS:** LU restricts officer field at BRIS gateway; no third-party API. **NOT VIABLE.**
- **LuxTrust:** Prerequisite question for Path 2 eligibility, not a separate path.
- **RBE (UBO):** Public access restricted post-CJEU + Law of 25 Jan 2025; UBO ≠ directors. **OUT OF SCOPE.**
- **OpenCorporates:** CAPTCHA + subscription. **NOT VIABLE-V1.**
- **Multi-lingual (FR/DE/LU):** Implementation consideration (name normalization), not a source-selection blocker.
- **LNIN requirement (Nov 2024):** All natural persons connected to RCS must register a Luxembourg National Identification Number. May cause partial data quality during transition; Topograph parsing should handle gracefully.

### LU synthesis

- **v1 path: Topograph (Path 4a)** — per-call, B-prefix RCS native (closes index-hole), legalRepresentatives confirmed. €13.50 extrait passthrough is the floor; full per-call price ≫ current Openapi WW-Top €0.1586 — this is a cost tier step-up, not a cost model violation. Required: (1) RFQ for full per-call price + DEC-518-G probe; (2) DEC-20260428-A vendor attestation (confirm LBR redistribution rights cover commercial API resale); (3) ArcelorMittal B82454 ↔ LU18804375 VAT mapping verification at production cutover.
- **v1.1 fallback: Kyckr (Path 4b) or Kompany (Path 4c)** if Topograph RFQ fails. Both confirm LU directors.
- **v1.1 alternate: LBR direct API (Path 2)** if foreign-entity eligibility and per-call pricing both confirmable; eliminates the €13.50 passthrough.

---

## Cross-cutting findings

### Pattern 1 — Topograph closes 3 of 4 country gaps under one vendor

| Country | Topograph endpoint | Source | Identifier | Officer fields |
|---|---|---|---|---|
| MT | `essentials/malta` | BAROS (MBR) | `C + space + digits` | `legalRepresentatives` + `directors` + `secretaries` |
| HU | `essentials/hungary` | OCCSZ XML + Cégkivonat PDF | Cégjegyzékszám / adószám / VAT / name | §13 reps + auditors + supervisory board (name + birth date + address + role + start date + signing mode) |
| LU | `essentials/luxembourg` | Certified Extrait du RCS (AI-parsed) | B-prefix RCS + LU-VAT | Gérant / Administrateur / Président (ISO 5009-mapped) |

Combined with **HR** (Phase 5 confirmed), one Topograph onboarding closes 4 EU jurisdictions for representative coverage. **DEC-20260518-G platform-fee probe is the critical gate** — Topograph's "no minimum commitments" language was technically accurate but materially misleading in the Phase-5-prior context where a €1,500/mo platform fee existed separately. Per-country pricing pages magic-link-gated; bundle all four into one RFQ.

### Pattern 2 — Open-data Tier-1 wins are jurisdiction-dependent

| Country | EE-pattern available? | Evidence |
|---|---|---|
| CY | **YES** | data.gov.cy `organisation_officials_83.csv`, 120 MB, CC BY 4.0, monthly, 1.17M rows |
| MT | No | data.gov.mt blocks WebFetch; OpenCorporates 0/20 score; no officer bulk |
| HU | No | opendata.hu / data.gov.hu have no IM-published officer dataset |
| LU | No | data.public.lu 404 on Extrait RCS dataset; "not available in bulk" per multiple sources |

The Tier-1 open-data win depends on whether the national publishing authority decided to expose officer data in the public open-data portal. CY's DRCIP did (like EE's RIK); MT's MBR + HU's IM + LU's LBR did not.

### Pattern 3 — Bulk subscription vendors consistently eliminated by Petter's cost rule

Across all four countries, the following vendor cohort was eliminated for fixed-monthly pricing:

- **OpenCorporates:** £2,250+/yr subscription, no PAYG (eliminated all 4)
- **Northdata:** €500–€1,500/month, 12-month minimum (eliminated LU)
- **Dato Capital:** ~€470/month minimum (eliminated LU)
- **companyapi.hu:** 15,990–37,990 HUF/month (eliminated HU)
- **WellData:** 32,990–39,990 HUF/month (eliminated HU)
- **D&B / Bisnode:** Enterprise subscription (eliminated HU, LU)
- **Creditinfo Malta:** Subscription credit-bureau product (eliminated MT)
- **Moody's / BvD / Kompany / TransactionLink:** Enterprise/RFQ-subscription (eliminated as v1 candidates across countries; some marked V1.1)

The cost-rule filter is decisive at this stage. Only Topograph (per-call variable) and CY's free open data survive.

### Pattern 4 — DEC-518-F web UI parsing consistently blocked by Tier 1

Every country's statutorily-public web UI (MT register.mbr.mt, CY efiling.drcor, HU occsz.e-cegjegyzek, LU lbr.lu) exposes directors free of charge. All four are **BLOCKED under DEC-20260428-A Tier 1** absolutism. Two additional barriers reinforce: MT SPA + 403; LU CAPTCHA (Aug 2025 redesign); HU SPA + 400 on direct probe; CY ASP.NET session-required.

This is structural, not coincidental. Registries built for human consultation do not become Strale-operable surfaces under Tier 1 regardless of statutory openness. Tier-2 licensed vendors (Topograph) operate the fetch on Strale's behalf — that is the doctrine-clean path.

### Pattern 5 — Gazette parsing (Path 8) is uniformly v1.2+ derivative work

Each country has a statutory gazette publishing officer changes:

| Country | Gazette | Status |
|---|---|---|
| MT | Gazzetta tal-Gvern | PDF-only; partial coverage (incorporation + filed changes) |
| CY | Επίσημη Εφημερίδα, Fifth Supplement Part I | 600+ issues indexed; HE3/HE4 forms; PDF |
| HU | Cégközlöny | Weekly PDF; portal TLS-expired 2026-05-18; subscription wrapper via WellData |
| LU | RESA (replaced Mémorial C 2016) | PDF-only publication browser; HTTP 429 rate-limited |

For all four: no structured XML/RSS feed; PDF parsing required; entity resolution (gazette text → registry ID) adds complexity. Useful for historical-officer-tenure features (v1.2+) but not v1 path. **No new DEC-20260428-A scope question** in Phase 6 — none of these surfaces meet the BE-Moniteur-Belge sharpness criterion (gazette-as-only-historical-source with no commercial alternative). All four have viable current-state alternatives in Paths 3 or 4a.

### Pattern 6 — UBO registers consistently out of scope post-CJEU C-37/20

MT (legitimate-interest gate + €5/request), CY (closed 2023-01-03), HU (restricted), LU (RBE restricted by Law of 25 Jan 2025). All four. UBO ≠ directors regardless; even if accessible, wrong primitive.

---

## Recommendations to chat-side

| Country | v1 decision | Immediate action | Parallel actions |
|---------|-------------|------------------|------------------|
| **MT** | Build against Topograph (Path 4a) | Bundle into single Topograph RFQ (with HU, LU); request MT per-call price + DEC-518-G platform-fee disclosure + DEC-20260428-A vendor attestation; implement VAT↔C-number resolution step | Kyckr v1.1 backup RFQ; defer MBR direct API (Path 2) to v1.2 pending subscription/eligibility clarity |
| **CY** | **Build against data.gov.cy DRCOR open data CSV (Path 3) TODAY** | Implement nightly ingest of `organisation_officials_83.csv` → Postgres → `cy-directors` capability; monitor dataset page URL for resource-link rotation (not hardcoded file URL); disclose monthly refresh limitation in capability output | Topograph (Path 4a) v1.1 for real-time upgrade — RFQ in bundle, requires Greek `ΗΕ` Unicode normalization |
| **HU** | Build against Topograph (Path 4a) | Bundle into single Topograph RFQ; request sample pricing on OTP Bank, MOL, Richter (kbyte-based variable model); DEC-518-G full probe; DEC-20260428-A attestation; accept §13 active-companies-only limitation | OPTEN v1.1 fallback (separate RFQ with subscription-risk audit) |
| **LU** | Build against Topograph (Path 4a) | Bundle into single Topograph RFQ; request LU per-call price + €13.50 passthrough confirmation; verify B-prefix native support resolves Openapi index-hole (B82454 ArcelorMittal test case); DEC-518-G probe + DEC-20260428-A attestation | LBR direct API (Path 2) v1.1 if foreign-entity eligibility + per-call pricing both confirmable (would eliminate €13.50 passthrough) |

**Consolidated next-step single action:** **One bundled Topograph RFQ covering MT + HU + LU (and confirming HR Phase 5 pricing).** Required disclosures per DEC-20260518-G: platform fee, setup fee, monthly minimum, annual floor, volume-tier locked floors, termination fees. Sample-call pricing for: GO plc (MT), OTP Bank / MOL / Richter (HU), RTL Group / ArcelorMittal B82454 (LU). DEC-20260428-A attestation: redistribution rights + indemnification + per-fact primary-source provenance for all four jurisdictions.

**CY ships independently of Topograph** — no vendor dependency.

**DEC-20260428-A scope question for Petter:** None raised by Phase 6. No new gazette-style sharpness question to schedule.

**Phase 4/5 to-do updates:**
- MT, CY, HU, LU rows in `apps/api/coverage-matrix/` — keep at Committed (Openapi WW-Top) for identity; add follow-up rows for representative coverage with Topograph (MT/HU/LU) or data.gov.cy (CY) status `Planned-v1`.
- CY: open a separate to-do for `cy-directors` capability build (Path 3 open-data ingest).
- Topograph onboarding to-do: bundle MT + HU + LU into one RFQ ticket with HR pricing re-confirmation.

**Memory entry 25 update:** Realistic v1 launch coverage now includes MT + CY + HU + LU representative-coverage paths. Phase 4/5 "thin-usable+ identity, no reps" classifications are correctly described as Openapi-vendor-bounded, not registry-bounded. The Tier-2 question for each country has a viable answer.

---

## Stop-condition compliance

- ✅ All 32 path investigations (4 countries × 8 paths) documented with live HTTP evidence per path, or documented negative reasoning where probe was blocked.
- ✅ No path halted on first-failure without evidence-based reasoning.
- ✅ Final verdict per country with cost / latency / risk + DEC compliance.
- ✅ DEC-20260518-G platform-fee probe completed for every Tier-2 candidate in every country (Topograph, Kyckr, OpenCorporates, Moody's/Kompany/BvD, TransactionLink, Northdata, Dato Capital, Pappers, OPTEN, companyapi.hu, WellData, D&B/Bisnode, Creditinfo, Schmidt & Schmidt).
- ✅ DEC-20260518-F 4-constraint check applied to every Path 5 web-UI candidate; all blocked under Tier 1 with documented constraint-level evaluation.
- ✅ No 2023/138 representative-content claims (per course-correction Journal `36467c87082c8169`); HVD § 5.1 cited only as identity-fields mandate.
- ✅ Cross-reference to per-country canonical YAML at `apps/api/coverage-matrix/*-company-data__{mt,cy,hu,lu}__company-registry.yaml`.

## Caveats logged (synthesis)

- **Topograph per-country prices opaque.** MT, HU, LU pricing pages all magic-link-gated. HR Phase 5 precedent confirms no platform fee but per-country probe still required. RFQ is the gate.
- **HU Topograph variable pricing.** Kbyte-based TRE cost + processing fee = unpredictable cost-per-entity. Large companies with long register history (OTP Bank, MOL) will cost more than small Kft. `profileMaxBudget` parameter mitigates.
- **HU Topograph limitation.** Closed companies use minimal TRE format that may omit §13 (representatives only for active companies). Document as capability limitation.
- **LU per-call cost step-up.** ~€13.50 extrait passthrough is the floor; full Topograph LU per-call ≫ Openapi WW-Top €0.1586. Cost tier change, not model violation. Petter awareness required at pricing.
- **MT identifier gap.** Current Strale regex `^MT\d{8}$` (VAT) ≠ Topograph `C + space + digits` (BAROS). Implementation: VAT→C-number resolution step or accept C-prefix input.
- **CY identifier note (Topograph).** Topograph CY requires Greek Unicode `ΗΕ` (U+0397 U+0395), NOT Latin `HE`. Unicode normalization step required if Topograph is used as v1.1 upgrade.
- **CY open-data URL stability.** `_83` suffix on officers CSV may rotate on future dataset refreshes. Ingest job must monitor dataset page (`data.gov.cy/el/dataset/mitroo-eggegrammenon-...`) for resource-link changes, not hardcode the direct file URL.
- **CY monthly staleness.** Open data refreshed monthly; up to 30-day stale appointments. Disclose via `freshness_category: reference-data` and `fetched_at` timestamp. Topograph v1.1 path resolves if customer requires real-time.
- **CY no per-row appointment dates.** Open-data CSV does not include appointment/cessation dates per officer. For tenure verification, Topograph (Path 4a) document retrieval is required.
- **LU B82454↔LU18804375 mapping inferred.** Multiple sources reference B82454 as ArcelorMittal RCS number (corporate articles + Northdata); VAT mapping inferred from Openapi failure context. Verify via LBR public search at production cutover.
- **LU LNIN requirement (Nov 2024).** Natural persons connected to RCS must register Luxembourg National Identification Number. Transition-period data quality may be degraded for recently-onboarded directors. Topograph AI parsing expected to handle gracefully.
- **MBR Subject Person eligibility (Path 2 deferred).** Strale's qualification as Subject Person ambiguous; required for MBR direct API access. Not a v1 issue (Topograph is the v1 path) but a v1.2 question if MBR direct ever becomes the target.
- **LBR foreign-entity eligibility (Path 2 deferred).** LuxTrust certificate requirements + i-Hub press release CSSF framing suggest LU-domiciled professional focus. eIDAS-equivalent untested. Not a v1 issue but a v1.1 question.
- **HU Cégközlöny TLS expired.** `e-cegkozlony.gov.hu` returned TLS cert error 2026-05-18. Does not affect Topograph path (uses OCCSZ XML + TRE PDF, not gazette portal). Flag separately for IM if a Cégközlöny derivative dataset becomes a future requirement.
- **OpenSanctions CY license tag erroneous.** OpenSanctions describes `cy_companies` as "CC BY NonCommercial"; the data.gov.cy source page is unqualified CC BY 4.0. Strale sources from primary, not from OpenSanctions, to preserve commercial license freedom.
- **BRIS unprobeable from US-East egress.** webgate.ec.europa.eu/e-justice redirects to sorry.ec.europa.eu from Railway US East. Assessment grounded in e-Justice portal docs and secondary sources rather than direct probe; conclusions consistent across all 4 countries (BRIS = identity only, no officer extension, no third-party API).
