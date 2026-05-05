# Payee Assurance v1 — Source Diligence Report

**Date:** 2026-04-20
**Author:** CC (Claude Code) research session, three parallel diligence agents
**Status:** Draft for Petter + Claude-chat follow-up session
**Scope:** Source selection for Payee Assurance v1, shipping Q2 2026
**Doctrine tested:** DEC-20260420-H ("direct data connections only. No scraping. Full ToS compliance.")

---

## Executive summary

- **Total engineering effort to close all three gaps (optimistic):** ~40–55 engineering days for a viable v1 footprint (not "everything everywhere"), plus ~40–60 days of calendar time dominated by commercial contracts. Full 20+ country coverage is a ~100–120-day build and not a Q2-2026 target.
- **The #1 structural blocker is an unresolved ToS question**, not engineering. Every credible SEPA VoP / UK CoP vendor operates under a scheme-level default that "RVM output must be consumed by a PSP." Strale is not a PSP. **Payee Assurance v1 cannot ship until at least one vendor (Banfico, MonitorPay, iPiD, or SurePay) confirms in writing that Strale can embed VoP/CoP match results in a capability response and bill non-PSP AI-agent customers per call.** This is the single hinge for the whole release.
- **Recommended primary vendors, in confidence order:**
  - **IBAN/name match:** Banfico (EPC RVM + Pay.UK aggregator + reseller-native ToS posture + self-serve sandbox). Plan B: MonitorPay. Plan C: iPiD direct. SurePay parked (enterprise sales cycle too slow).
  - **Missing registries — Tier A (build first):** SK, HR, SI — all doctrine-clean government REST APIs, ~10 dev days combined. Then GR and RO conditional on directors-field verification.
  - **Missing registries — Tier B (commercial fallback):** BG (bulk CSV), LU (open dataset + fallback), CY (open dataset + fallback), HU (commercial only), MT (commercial or AML-Subject-Person gated).
  - **Scraping migrations — Wave 1 (v1 ship):** NL → KVK, IE → CRO, LV → UR API, SE → Bolagsverket (identity), plus **stop northdata scraping for DE/LT/NL/PT immediately** (the single starkest doctrine violation in the current codebase).
- **Doctrine must be clarified before engineering starts.** Strict reading of "no scraping" drops v1 from 20+ countries to ~4. A principled carve-out — split-by-data-source-type (`govt-api` / `govt-open-data` / `licensed-commercial-aggregator` allowed; `govt-portal-scraping` and `commercial-aggregator-scraping` forbidden) — keeps 7–12 countries clean while genuinely honouring "no scraping, full ToS compliance." **Recommended: adopt split-by-data-source-type, mark it in the capability schema, surface it in the transparency panel.**
- **Critical-path contracting that Petter must initiate this week:**
  1. Banfico commercial outreach (IBAN) — the one that gates v1 shipping
  2. Bolagsverket avtal (SE) — home-country anchor; contract has calendar time
  3. Doctrine-clarification session (Petter + Claude-chat) to ratify or revise split-by-data-source-type
  4. Decision on a northdata licensed-tier interim contract (€500/mo) to stop the DE/LT/PT doctrine bleed overnight while Wave 2 registry integrations are built

---

## Section 1 — IBAN/name matching

**File:** [payee-assurance-v1-section-1-iban-name-match.md](payee-assurance-v1-section-1-iban-name-match.md) (full per-provider detail, ~4,900 words)

**Scope:** commercial, regulatory, and engineering diligence for SEPA VoP + UK CoP sources that Strale could integrate behind a single Payee Assurance v1 capability covering EU-27 + UK. Research date: 2026-04-20. 16 providers surveyed.

### Key regulatory context

- SEPA VoP live since 2025-10-05 (EPC rulebook EPC218-23 v1.0); euro-area PSP compliance deadline 2025-10-09; non-euro EEA 2027-07-09.
- Only PSPs can adhere to the VoP scheme; non-PSPs can qualify as **RVMs (Routing and/or Verification Mechanisms)**. ~58 RVMs on the EPC register.
- UK CoP is a separate Pay.UK overlay service with its own Aggregator model (2024 onward).
- **Strale is not a PSP and not an RVM applicant.** Only legitimate paths: (a) reseller/embed via a vendor whose contract permits it, or (b) becoming an RVM itself (6–12 months, not v1-viable).

### Providers — green-count shorthand

Columns rated favourably: EU-27 VoP coverage / UK CoP / pricing public / embedding permitted / integration effort / commercial readiness / risk level. "Green count" out of 7 = how many columns look good for a solo-founder startup buyer.

| Provider | Green count | Notes |
|---|---|---|
| **Banfico** | **4/7** | EPC RVM + Pay.UK aggregator; reseller-native (ACI, Temenos distribute); sandbox self-serve; weeks-not-months sales. |
| MonitorPay | 3/7 | iPiD-adjacent; marketed as embeddable; brand-entity relationship ambiguous. |
| iPiD | 2/7 | EPC RVM; global footprint; no public pricing; scheme-default restrictions inherited. |
| SurePay | 2/7 | Category leader; broadest coverage; enterprise sales 3–6 months. Outreach sent 2026-04-20. |
| Bottomline PTX | 2/7 | UK-first; EU in rollout; enterprise-priced (Thoma Bravo). |
| Worldline / Form3 | 1/7 | Scheme-level players; bank-ICP; deep enterprise cycle. |
| TrueLayer / Yapily / Tink / GoCardless BAD / Klarna Kosma / Trustly / Plaid | 0/7 | **Product-fit fail.** VoP/AIS bundled inside payment flow; cannot be re-exposed as standalone IBAN+name match. |
| SWIFT BAV | 0/7 | Banks-only, not SEPA-scheme-compatible. |
| Self-RVM (Strale adheres directly) | 0/7 | 6–12 months, not v1. |

### Recommended implementation path

**Architecture:** ONE primary vendor for full EU+UK (all shortlisted vendors are pan-SEPA RVMs — country-routing would duplicate effort without adding coverage).

**Primary: Banfico.** The only candidate simultaneously (a) a qualified EPC RVM, (b) a Pay.UK CoP Aggregator, (c) architecturally designed around reselling, (d) self-serve sandbox at portal.bankc.banfico.io, (e) weeks-not-months commercial cycle.

**Plan B: MonitorPay** (developer-friendly posture; parallel outreach).
**Plan C: iPiD direct** (if MonitorPay turns out to be a thin iPiD GTM wrapper).
**Parked: SurePay** — keep outreach warm but do not gate v1 ship on them.

**Engineering effort once contracted:** 3–8 days (executor + manifest + tests). Sandbox-before-contract likely for Banfico.

### Top unresolved questions

1. **Embed-and-bill ToS permission** — the single hinge of Payee Assurance v1. Needs written confirmation from at least one vendor before commitment.
2. **MonitorPay ↔ iPiD corporate structure** — entity chart needs confirming before signing.
3. **Pricing floor** — every vendor gates pricing behind sales; Strale needs real per-call numbers before setting customer pricing.

(Full section: [payee-assurance-v1-section-1-iban-name-match.md](payee-assurance-v1-section-1-iban-name-match.md))

---

## Section 2 — 10 missing EU company registries

**File:** [payee-assurance-v1-section-2-registries.md](payee-assurance-v1-section-2-registries.md) (full per-country detail, ~5,000 words)

**Scope:** BG, CY, GR, HR, HU, LU, MT, RO, SI, SK — 10 EU-27 countries with no Strale registry coverage today.

### Cross-cutting findings

- **BRIS is not viable as a primary path.** It's a federated search UI, not a REST API; harmonised fields don't include directors or UBO. Ship the v1 product docs with BRIS explicitly marked "not a supported source."
- **OpenCorporates** requires Enterprise contract for any commercial use — the free/self-serve tier's ODbL share-alike is incompatible with Strale's posture. Acceptable as Tier B fallback **only** with Enterprise + explicit redistribution clause.
- **UBO / beneficial ownership is out of scope for v1** post-CJEU C-37/20 — access is "legitimate-interest"-gated in LU, SI (Aug 2025), MT (Jul 2025), etc. AMLD registration is a separate compliance project.

### Three-tier classification

**Tier A — direct government API, clean ToS (implement first):**
- **SK** (RPO REST, CC-BY 4.0, ~2–3 days)
- **HR** (sudreg-data.gov.hr OAuth2, ~2–3 days)
- **SI** (AJPES restPrsInfo, Feb 2026, ~2–4 days)
- **GR** (GEMI Open Data REST, ~2–4 days — conditional on verifying directors field is in the open tier)
- **RO** (data.gov.ro bulk, ~4–7 days — conditional on verifying directors + freshness)

**Tier B — open-data batch ingest OR licensed commercial aggregator:**
- **BG** (data.egov.bg CC-BY daily dumps, ~5–7 days)
- **LU** (data.public.lu + commercial fallback, ~3–5 + 3 days; LBR API refused to general integrators — HVD non-compliance dispute live)
- **CY** (open-data portal + commercial fallback, ~4–6 days)
- **HU** (commercial aggregator only — no clean free path, ~5–8 days)
- **MT** (MBR API is AML-Subject-Person-gated; commercial aggregator is the realistic route, ~5–10 days)

**Tier C — no clean path:** None. All 10 have at least a Tier-B route. MT is closest to Tier-C risk if Subject-Person status is unattainable.

### Comparison table

| Country | Direct gov API | BRIS sufficient | Commercial fallback | Tier | Est. days | Critical gotcha |
|---|---|---|---|---|---|---|
| BG | CC-BY daily dumps (not REST) | No | Yes (OC Enterprise) | B | 5–7 | Cyrillic; batch-only ingest |
| CY | Open-data portal | No | Yes | B (→A?) | 4–6 (+3) | Officers coverage in open data unclear |
| GR | GEMI Open Data REST | No | Yes | A (→B?) | 2–4 (+5) | Directors may be in restricted tier |
| HR | sudreg-data.gov.hr OAuth2 REST | No | Yes | A | 2–3 | OAuth2 token refresh |
| HU | None | No | Yes (commercial only) | B | 5–8 | No clean free path; contract required |
| LU | Contested (LBR refused) | No | data.public.lu + OC | B | 3–5 (+3) | HVD dispute live |
| MT | MBR API (Subject-Person-gated) | No | Yes | B | 6–10 | AML-obliged-entity registration |
| RO | data.gov.ro bulk + commercial | No | Yes | A (→B?) | 4–7 | Freshness of open-data publication |
| SI | restPrsInfo REST (Feb 2026) | No | Yes | A | 2–4 | New API; launch-period stability |
| SK | RPO REST (CC-BY 4.0) | No | Yes | A | 2–3 | 60 rpm unauth rate limit |

### Recommended implementation order

- **Wave 1 — Tier-A trio:** SK, HR, SI → ~10 dev days. Start here.
- **Wave 2 — verify-then-build:** GR, RO → ~11 dev days.
- **Wave 3 — heavier ingest:** BG, LU, CY → ~18 dev days.
- **Wave 4 — contract-gated:** HU, MT → ~18 dev days plus contract calendar time.

**Total for all 10 countries: ~55–60 engineering days.** Realistic Q2 2026 v1 target: **Waves 1+2 shipped (5 countries, ~20 dev days)**. Wave 4 is v1.1.

### Top unresolved questions

1. **GR directors field** in Open Data tier? Register and test before committing GR as Tier A.
2. **RO data.gov.ro freshness + directors** coverage? Fallback: listafirme.eu / risco.ro commercial with redistribution clause.
3. **LU HVD enforcement timeline** — wait for EU enforcement or commit commercial fallback now?
4. **MT Subject-Person path** — pursue AML-obliged-entity registration, or accept commercial-aggregator cost?
5. **Single OpenCorporates Enterprise contract** to cover HU/MT/CY/LU-fallback in one move?

(Full section: [payee-assurance-v1-section-2-registries.md](payee-assurance-v1-section-2-registries.md))

---

## Section 3 — 9 scraping countries migration

**File:** [payee-assurance-v1-section-3-scraping-migration.md](payee-assurance-v1-section-3-scraping-migration.md) (full per-country detail, ~5,000 words)

**Scope:** BE, ES, IE, IT, LT, LV, NL, PT, SE (scraping-based) + DE, AT (aggregator-based). 11 countries tested against doctrine DEC-20260420-H.

### Classification table

| Country | Current state | Best direct alternative | Migration days | Classification |
|---|---|---|---|---|
| **NL** | Scrapes northdata | KVK Basisprofiel (govt-api) | ~1 | **MIGRATE NOW** |
| **IE** | Scrapes core.cro.ie (govt portal) | CRO Open Services API (govt-api) | ~1 | **MIGRATE NOW** |
| **LV** | Scrapes info.ur.gov.lv (govt portal) | UR API web services (govt-api) | ~2–3 | **MIGRATE NOW** |
| **SE** | Scrapes allabolag.se | Bolagsverket API (contract) | ~3–5 | **MIGRATE NOW** (identity); SOON (financials) |
| **DE** | Scrapes northdata | Creditreform / handelsregister.de / northdata licensed €500/mo | ~1–7 | **MIGRATE NOW** (stop illicit scrape); SOON (licensed path) |
| **LT** | Scrapes northdata | Registrų centras / Lursoft / jars.lt | ~2–6 | **MIGRATE NOW** (stop illicit scrape); SOON (clean path) |
| **AT** | FinAPU (OGD-listed) + firmen.wko.at scrape | auszug.at (licensed) | ~3–7 | **MIGRATE SOON** |
| **BE** | Scrapes kbopub (govt portal, ToS-forbidden) + cbeapi.be | CBE Open Data bulk OR Creditsafe | ~4–7 | **MIGRATE SOON** |
| **IT** | Scrapes registroimprese.it (ambiguous ToS) | Telemaco/ABDO (€6.50+/call) / Cerved | ~4–6 | **MIGRATE SOON**; free-tier not viable |
| **ES** | Scrapes empresia + infocif (aggregators) | Informa D&B (licensed) | ~5+contract | **MIGRATE SOON or DROP v1** |
| **PT** | Scrapes northdata | Informa Portugal — no free official real-time PT API | ~3–5+contract | **MIGRATE SOON or DROP v1** |

### Doctrine recommendation

Strict reading of DEC-20260420-H loses 7 of 11 countries from v1. The principled carve-out is **split-by-data-source-type**, expressed as structured metadata on every capability:

- **Allowed:** `govt-api`, `govt-open-data` (ToS-checked redistribution), `licensed-commercial-aggregator`
- **Forbidden:** `govt-portal-scraping`, `commercial-aggregator-scraping`
- **Grey-zone named dependency:** e.g. FinAPU (published on data.gv.at OGD catalogue, no contract but government-adjacent) — permit on named-dependency basis with documented migration plan.

This maps cleanly to Strale's existing `data_source_type` column, is machine-checkable at capability onboarding, and is surfaceable in the transparency panel. It keeps the "no scraping, full ToS compliance" brand genuine while not cutting v1 to 4 countries.

**The single biggest live doctrine violation:** unlicensed scraping of **northdata.com** in DE/LT/NL/PT. northdata's own licensed API is €500/month. Paying for that tier converts commercial-aggregator-scraping → licensed-commercial-aggregator overnight with zero code change — acceptable as a Wave 1 bridge.

### Recommended migration sequence

**Wave 1 (v1 ship, ~6–10 engineering days):**
1. **NL → KVK Basisprofiel** (~1d)
2. **IE → CRO Open Services** (~1d)
3. **LV → UR API** (~2–3d)
4. **DE → switch off northdata scraping** (~1d) — stop the doctrine bleed first; decide clean path (Creditreform / handelsregister wrapper / northdata licensed) in parallel
5. **SE → Bolagsverket API (identity)** (~3–5d; calendar dominated by contract)

**Wave 2 (post-v1, ~15–20 days + contracts):** LT, AT, BE, IT.

**Wave 3 (decision required):** ES, PT — migrate via Informa contract OR drop from v1.

### Top unresolved questions

1. **Budget envelope for licensed aggregators** — Creditsafe, Informa, northdata €500/mo, Cerved. Decides ES/PT (drop vs contract) and DE interim strategy.
2. **Bolagsverket avtal timeline** — SE home country; contract needs initiation this week for Wave 1.
3. **northdata licensed interim** — sign €500/mo to clean DE/LT/NL/PT overnight? Acceptable as Wave 1 bridge?
4. **Italy free-tier reality** — every real-time IT path has per-call cost. IT ships paid-only, or drops v1?
5. **BE freshness tolerance** — CBE bulk CSV is monthly (up to 30-day staleness on "active vs dissolved"). Acceptable, or does BE require Creditsafe licensed before ship?

(Full section: [payee-assurance-v1-section-3-scraping-migration.md](payee-assurance-v1-section-3-scraping-migration.md))

---

## Consolidated implementation plan

### Total engineering days — across all three gaps

| Bucket | Days | Notes |
|---|---|---|
| Section 1 — IBAN/name match (Banfico) | 3–8 | Once contracted. Sandbox work can start pre-contract. |
| Section 2 — Missing registries Waves 1+2 | ~20 | SK + HR + SI + GR + RO (5 countries). Waves 3+4 add ~36 days. |
| Section 3 — Scraping migrations Wave 1 | ~6–10 | NL, IE, LV, SE, DE-stop-the-bleed. |
| **Minimum v1 footprint subtotal** | **~30–40 days** | Banfico IBAN + 5 new registries + 5 migrations. |
| Section 2 Waves 3+4 (BG, LU, CY, HU, MT) | ~36 | Post-v1 expansion. |
| Section 3 Wave 2 (LT, AT, BE, IT) | ~15–20 | Post-v1 expansion. |
| Section 3 Wave 3 (ES, PT) | ~10 | Or drop from v1. |
| **Full-coverage expansion** | **~60–70** | Adds to min footprint. |
| **Total to reach 20+ country parity** | **~100–120 days** | Not a Q2 2026 target. |

### Recommended sequence (what to build first, second, third, and why)

1. **Week 0 — contract kick-off (Petter, not engineering).**
   - Send Banfico outreach (IBAN primary).
   - Start MonitorPay + iPiD outreach in parallel (IBAN Plans B/C).
   - Initiate Bolagsverket avtal request (SE).
   - Decide on doctrine ratification (split-by-data-source-type vs strict) — blocks Section 2 and Section 3 designs.
   - Decide on northdata licensed-tier interim (€500/mo yes/no) — unblocks DE/LT/NL/PT on the doctrine front overnight.
2. **Week 1–2 — stop-the-bleed migrations** (~6–10 eng days):
   - NL → KVK (~1d), IE → CRO (~1d), LV → UR (~2–3d).
   - DE northdata scraping disabled; either redirect to licensed tier OR stub the capability.
   - LT northdata scraping disabled; decide target (jars.lt quick / Lursoft clean / Registrų centras slow-clean).
3. **Week 2–5 — Tier-A registry trio** (~10 eng days): SK, HR, SI. Three clean REST APIs; minimum onboarding risk.
4. **Week 3–6 — SE Bolagsverket integration** (~3–5 eng days, pending avtal signature).
5. **Week 5–8 — IBAN/name match** (~3–8 eng days, pending Banfico contract + embed-and-bill ToS confirmation). **This is the ship-gate for the Payee Assurance v1 brand moment.**
6. **Week 6–9 — verify-then-build registry pair** (~11 eng days): GR, RO (after confirming directors-field coverage).
7. **Post-v1 expansion** — Tier-B registries + Wave 2 migrations as capacity permits.

### Critical path items (things that block everything else)

1. **IBAN embed-and-bill ToS confirmation in writing.** If no vendor says yes, v1 doesn't ship. Everything else is moot.
2. **Doctrine ratification.** Split-by-data-source-type or strict? This decision gates how Section 2 Tier-B countries and Section 3 ES/PT/BE/IT are designed.
3. **Bolagsverket avtal timeline.** SE is the home country; missing it from v1 is brand-embarrassing. Contract has real calendar weight.
4. **Stop northdata scraping.** Highest live doctrine violation; must be resolved before any public marketing of Payee Assurance v1.

### Commercial / contract dependencies (Petter must initiate)

| Contract | Purpose | Urgency |
|---|---|---|
| Banfico (or MonitorPay / iPiD / SurePay) | IBAN/name match primary vendor | **Week 0** — gates v1 ship |
| Bolagsverket avtal | SE direct API | **Week 0** — calendar time |
| northdata licensed tier (€500/mo) | Doctrine bridge for DE/LT/NL/PT | **Week 0** — decide yes/no |
| Creditreform (DE) | Clean commercial registry path | Optional, Wave 2 |
| Informa D&B (ES + PT) | Spanish + Portuguese coverage | Wave 3 — or drop countries |
| Creditsafe BE | Licensed BE real-time | Wave 2 — or accept monthly freshness |
| Cerved / Telemaco prepaid (IT) | Italian real-time | Wave 2 — decide free-tier posture first |
| OpenCorporates Enterprise (HU / MT / CY / LU fallback) | Single contract covering multiple Tier-B gaps | Post-v1 — bundled contract efficiency play |
| ID Austria / auszug.at contract | AT clean path | Post-v1 |

### Open questions (dead-ends where Petter must decide)

**Cross-cutting — answer first:**
1. **IBAN embed-and-bill ToS** — see Section 1 blocker.
2. **Doctrine ratification** — strict vs split-by-data-source-type.
3. **Budget line for licensed aggregators** — pre-launch budget exists, or every country needs a free path?
4. **Brand preference: fewer clean countries vs more countries with some behind paywalls/contracts and transparency markers.**

**Section 1 — IBAN/name match:**
5. MonitorPay ↔ iPiD corporate structure — confirm before signing.
6. UK CoP + SEPA VoP: one capability with country-code routing, or two? Depends on whether primary vendor covers both at equal depth.
7. Liability on false-positive match — PSP, RVM, aggregator, or Strale? Needs contracted advisor review.
8. Nordic non-euro coverage (SE, NO) — 2027 deadline; verify per-vendor country-specific depth before shipping EU+UK badge.

**Section 2 — Missing registries:**
9. GR directors field in Open Data tier — test against a known Greek company.
10. RO data.gov.ro freshness + officer coverage — fall back to listafirme.eu / risco.ro?
11. CY open-data dump completeness on officers.
12. LU HVD enforcement — wait for EU, or contract now?
13. HU commercial aggregator selection — Opten, Bisnode, Creditsafe, companyapi.hu?
14. MT Subject-Person AML registration — pursue, or accept commercial aggregator?
15. Single OpenCorporates Enterprise contract across HU/MT/CY/LU fallback — bundle-efficiency worth the OC redistribution terms?
16. BRIS formal position — document it as "not a supported source" in v1 product docs?

**Section 3 — Scraping migrations:**
17. Bolagsverket avtal kickoff this week?
18. FinAPU carve-out for AT — named third-party dependency acceptable as interim?
19. BE freshness — accept 30-day lag on bulk, or require Creditsafe licensed?
20. IT free-tier posture — paid-only capability or dropped from v1?
21. northdata licensed interim — sign €500/mo for Wave 1 doctrine compliance?
22. ES / PT — drop v1 or commit to Informa contracts?

---

*End of consolidated report. Full per-section detail in the three linked files. Next action: Petter + Claude-chat follow-up session to resolve cross-cutting open questions 1–4 before engineering starts.*
