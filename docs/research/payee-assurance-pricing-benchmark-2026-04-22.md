---
title: Payee Assurance pricing benchmark study
date: 2026-04-22
status: Draft — research synthesis, pending Petter review
scope: Sets benchmark for v1 flat per-call price. Not committed pricing.
---

# Payee Assurance pricing benchmark study

**Author:** Claude Code (research pass, no code changes)
**Date:** 2026-04-22
**Inputs:** 7 Notion pages (Payee Assurance canonical, Business model, Round-2 aggregator research, Movitz/Cobalt/Middesk vendor pages, Provider-Coverage DB) + web research across 15+ vendors.
**Decision this informs:** Single flat per-call price for Payee Assurance v1 (EU-27 + UK). Secondary: rough volume-tier breakpoints for later.

---

## Executive summary

- **COGS floor for an EU-27 Payee Assurance call lands around €0.32–€0.45** assuming Creditsafe (or Global Database) for registry, Movitz pilot or MonitorPay for bank verification, Dilisense/OpenSanctions for sanctions, and free-tier primitives (GLEIF, VIES, Companies House) where available. UK-only is materially cheaper (€0.10–€0.18); global+US is materially more expensive (€1.00–€1.80 at low volume).
- **Direct-competitor pricing clusters in two bands.** Bundled-KYB-for-fintech-embed vendors (Middesk, Socure, Trulioo, D&B, BvD) sit at **$20k–$75k+/yr floors with per-call economics in the $1.50–$5.00 range**. Self-serve and usage-based vendors (Shufti Pro, Plaid, Cobalt, sanctions.io, Dilisense, MonitorPay) sit at **$0.10–$2.00 per call with little or no floor**. Strale's post-paid, no-minimum, bundled outcome belongs in the second band by payment model but needs the pricing discipline of the first.
- **Recommended v1 price band: €1.00–€1.50 per call.**
  - **Floor: €0.75** (below this, margin is thin given today's COGS estimates and provider mix uncertainty).
  - **Benchmark: €1.00** (where comparable bundled-but-lightweight offerings cluster; matches Plaid Monitor bundle; clearly below full KYB stack averages).
  - **Positioning: €1.50** (trust-wrapper + audit trail + entity-resolution premium; slightly above Persona/Onfido per-check at mid volume; clearly below the Middesk/Socure/Trulioo minimum-commit bands).
- **Recommend shipping v1 at €1.00/call flat.** Low enough to be obviously cheaper than the $20k+/yr bundled-KYB vendors for any buyer doing <20k calls/month; high enough to preserve 50%+ gross margin at projected EU-27 COGS; high enough to signal that the audit-trail and single-call-answer are premium vs. the "cheap individual-primitive" band. Low enough to raise later if adoption confirms willingness-to-pay, which is the canonical direction per Petter's position.
- **Bank verification (v1 launch gate) is the biggest COGS-uncertainty variable.** Movitz pilot (€0.133/call in-bundle) and MonitorPay (€0.10 PAYG) are both viable and change the floor meaningfully. Committing to one before price is set would sharpen the recommendation.

---

## Audit findings

### Notion research consulted (all 7 source pages accessible, no degraded-mode fallback needed)

| Source | What it contributed | Pricing data extracted |
|---|---|---|
| Payee Assurance canonical (34867c87082c814999e5c668d7383fa7) | v1 scope, evidence types, input spec, v1.1 US gap. Price is explicitly "TBD, flat per-call." | No prices; scope boundary only. |
| Business model canonical (33c67c87082c817fac7cd9d7b6c44e40) | Pricing model = flat per-call, no subscription in v1. Free trial = 10 prod calls. Pricing is "TBD, not canonical — describes model, not price." | No specific prices yet. Commits to the flat-per-call shape. |
| Round-2 aggregator research (34a67c87082c814b8fb0e88f072b63ea) | 13 vendors triaged with coverage × redistribution × commercial ratings. Primary research corpus for this benchmark. | Creditsafe £0.20/call UK G-Cloud, Vendr $200–600/mo SMB through $15–75k/yr enterprise. OpenCorporates £2,250/£6,600/£12,000/yr self-serve. D&B $25k+/yr, BvD $20–100k/yr, Sayari enterprise only, Moody's Kompany $3–15/report historically, Global Database quote-gated, Trulioo quote-gated, Kyckr pay-per-report (details unclear), Middesk $20–36k/yr estimate. |
| Movitz vendor (34967c87082c81e48ee9e6884188f877) | VoP pricing, pilot terms, reseller confirmed. Nordic coverage caveats. | €2,000/mo for 15,000 calls (€0.133/call in-bundle). Pilot €1,000/mo for 7,500 calls (same in-bundle rate). €24k/yr minimum. No PAYG option. |
| Cobalt Intelligence vendor (34967c87082c8116b7abe2df74e1651b) | US-only registry, detailed published tiers. Redistribution confirmed. | Starter $1,000/mo = 1k lookups ($1/call). Growth $2,250/mo = 3k ($0.75). 10k tier $6k/mo ($0.60). Startup plan $7,200/yr = 400/mo ($1.50). PAYG $2/lookup. One-time trial $750 for 1k. |
| Middesk vendor (34967c87082c811f90f9f8bbbc55ecb2) | US-only, enterprise sales motion, declined at Strale's scale. | $20–36k/yr floor estimate (no confirmation; sales refused to quote). 2027 reconsideration. |
| Provider-Coverage DB (34867c87082c81879391ebc05a9b3d90) | Evidence × country × provider × cost mapping. ~36 rows populated. | Free-tier primitives confirmed (VIES, GLEIF, Companies House, PSC register, Bolagsverket, Brreg, CVR, PRH, KVK-search). Commercial vendors flagged pending terms. |

### Gap list identified and researched (Step 2)

The Round-2 research had thin or no pricing on these direct competitors. Filled via web research this pass:

- Persona KYB, Onfido Business Verification, Signzy, Shufti Pro, ComplyAdvantage, Socure, Sanctions.io, OpenSanctions, Dilisense, Dow Jones Risk, Plaid Monitor, Banfico, iPiD, TechnoXander, MonitorPay — results in §§ below.
- Primitives: KVK API pricing (€6.40/mo + €0.02/query, new data point vs old notes), Handelsregister DE (€4.50/document electronic, updated from historical €8.50), Senzing ER pricing ladder (10M records = $58,560/yr through 10B = $3.4M/yr) — new additions to the build-vs-buy floor.

### Upstream / downstream sanity check

- **Upstream (drives floor):** Strale's COGS is a mix of aggregator (Creditsafe or Global Database) + sanctions (Dilisense preferred) + VoP (Movitz pilot or MonitorPay) + free primitives (GLEIF, VIES, UK Companies House, UK PSC). Own-infra costs: entity resolution (Senzing licensing if scaled; in-house engine at v1), orchestration, audit-log storage, hash-chain verification, compute.
- **Downstream (what this informs):** the single flat per-call price published in the Business model page and the Payee Assurance product page. Decision point is Petter + chat, not public yet.
- **Is the proposed research worth it vs. setting a price by intuition?** Yes. Intuition pricing without this benchmark would most likely land either at €0.50 (too low; compresses margin below some COGS scenarios and signals commodity positioning) or €3–5 (too high; matches Middesk tier but loses the "obvious build-vs-buy win" positioning). Benchmark-grounded €1.00 recommendation sits defensibly between those failure modes.

### One late finding worth calling out

MonitorPay advertises a bundled product at €0.10/check that overlaps with Strale's v1 scope substantially (IBAN + ownership + PEP + sanctions from government registries, 200+ country coverage). It's a v1 competitor, not just a VoP vendor. Worth routing to aggregator-research follow-up regardless of pricing decision — see Open questions.

---

## Direct-competitor benchmark

### Comparison table (Strale estimated position at bottom)

| Vendor | Entry price | Per-unit | Min commit | Included | Geo | Redistribution | Confidence |
|---|---|---|---|---|---|---|---|
| **Middesk** | $20–36k/yr floor | ~$2.50–$5/call | Annual, ~$20k+ | US KYB: registry + officers + TIN | US only | Fintech embed standard | THIRD-PARTY (Vendr/practitioner) |
| **Trulioo Business Verify** | Quote-gated | No published | Annual | Full KYB, UBO, sanctions, 195 countries | Global | Explicitly for embed | UNAVAILABLE |
| **Persona KYB** | ~$25k/yr | $0.75–$3/verif at 10k+/mo | Annual | Identity + KYB + document + selfie | Global | Gated | THIRD-PARTY (Vendr) |
| **Onfido Business Verification** | ~$6k/yr floor | $0.80–$1.89/check | Annual | Identity + docs + AML | Global | Gated | THIRD-PARTY |
| **Signzy KYB** | Free trial | Not public | Not public | KYB + KYC, 150+ countries | Global (India-heavy) | Not public | UNAVAILABLE |
| **Shufti Pro KYB** | $0 floor | $0.20/check PAYG for startup | None for PAYG | KYB + identity + AML | Global | Gated | PUBLISHED (partial, dated) |
| **ComplyAdvantage KYB** | $99.99/mo starter | Volume-negotiated | Annual | Sanctions + PEP + adverse media + KYB | Global | Fintech embed | THIRD-PARTY + PUBLISHED (starter) |
| **Sayari Graph** | No public entry | Credits-based | Annual | UBO graph, 250+ jurisdictions | Global (investigator-grade) | Not standard | THIRD-PARTY |
| **Moody's Kompany** | Quote-gated | Historically $3–15/report | Shifted to enterprise | Primary-source KYB + UBO + IBAN | 200+ jurisdictions | Historically permitted | THIRD-PARTY (historical) |
| **Creditsafe Connect** | $200–600/mo SMB | £0.20/call UK min | Annual (some SMB monthly) | KYB + officers + credit | 160+ countries | Aggregator default | PUBLISHED (G-Cloud) + THIRD-PARTY (Vendr) |
| **D&B Direct+** | $25k+/yr | $1–3/lookup | Annual | D-U-N-S + firmographics | 190+ countries | Limited (US/CA default) | THIRD-PARTY |
| **Bureau van Dijk / Orbis** | $20–100k/yr | Bulk feed | Annual, multi-year | UBO, financials, hierarchies | 170+ sources | Hostile | THIRD-PARTY |
| **OpenCorporates** | £2,250/yr Essentials | Call-metered | Annual, £2,250+ | Raw registry, 140+ jurisdictions | Global | Attribution (self-serve); enterprise different | PUBLISHED |
| **Kyckr** | Not public | Pay-per-report | Varies | Registrar-licensed KYB | 195 jurisdictions | Registrar-licensed | UNAVAILABLE |
| **Global Database** | Quote-gated | Not public | Not public | 100+ govt registries + UBO | Global | Explicitly reseller-friendly | UNAVAILABLE |
| **Cobalt Intelligence** | $7,200/yr startup / $0 PAYG | $0.60–$2/lookup (PAYG $2) | None for PAYG | US SOS registry only | US only | Explicitly permitted | PUBLISHED (detailed) |
| **Sanctions.io** | $899/yr Small | $0.03–$0.18/call | Annual, $899+ | Sanctions + PEP + adverse media + custom | Global | Fintech embed | PUBLISHED |
| **OpenSanctions** | ~€2,400/yr Starter (dated) | Tiered | Annual; non-commercial free | Sanctions + PEP + enforcement lists | Global | Reseller/OEM tier explicit | PUBLISHED (tiers) / THIRD-PARTY (prices) |
| **Dow Jones R&C / Factiva** | $50k+/yr typical | Enterprise feed | Annual | Sanctions + PEP + adverse media (tier-1 depth) | Global | Gated, expensive | UNAVAILABLE |
| **Dilisense** | $0 floor | €0.10 PAYG → €0.01 at volume | None | Sanctions + PEP + regulatory + criminal | Global | Reseller agreements offered | PUBLISHED |
| **Socure** | $25–75k/yr est | Volume tiered | 12/24-month | KYC-first, KYB expanding 2026 | US-primary | Gated | THIRD-PARTY (Vendr) |
| **Plaid Identity + Monitor** | Low entry | $0.50–$0.85/request | Volume min | IDV + Monitor PEP screening | US/EU/CA | Gated | PUBLISHED |
| **Movitz (VoP)** | €1,000/mo pilot | €0.13/call in-bundle | €24k/yr standard, €12k pilot | VoP: SEPA + UK CoP + Swift Pre-val + Kinexys | EU+UK+global via partners | Reseller confirmed | PUBLISHED |
| **MonitorPay** | $0 floor | €0.10/check PAYG | None | IBAN + ownership + PEP + sanctions | Global | Not confirmed | PUBLISHED |
| **Banfico (VoP)** | Not public | Not public | Varies | UK CoP + EU VoP | UK+EU | PSP-focused | UNAVAILABLE |
| **Strale Payee Assurance (proposed v1)** | **€0 floor (pay-as-you-go)** | **€1.00/call target** | **None** | **Registry + VAT + LEI + sanctions + PEP + UBO + IBAN/name match + entity resolution + audit trail** | EU-27 + UK (v1); US in v1.1 | Own product (not reselling) | This document |

### Per-vendor notes (gap-fill detail from web research)

**Persona KYB.** Vendr data for Feb 2026 shows $0.50–$4.00 per verification depending on type and volume. Typical mid-volume (1k–5k/mo) lands at $1.50–$3.00. At scale (10k+/mo), $0.75–$1.75. Annual contracts start around $25k for early stage; enterprise deals routinely exceed $500k. Includes document + selfie + KYB workflows, global scope. Redistribution terms are bespoke — no published reseller tier.

**Onfido / Entrust Business Verification.** $0.80–$1.89 per check at practitioner-observed rates; $0.65–$1.25 per document+selfie. Annual minimum around $6k/yr floor is the lowest published estimate (Finexer, HyperVerge 2026 guides). Volume break-even vs. competitors (Veriff) reported around 100k checks/yr. Global. Redistribution gated.

**Signzy.** Free 7-day trial with full KYB/KYC access, no dollar figures public. India-heavy customer base (SBI, ICICI, Axis) with US/EU coverage. Signals low entry friction; likely sub-$1 per check at volume but no published number.

**Shufti Pro KYB.** Historical published tiers: Starter Pack $1.20/verification and Standard Pack $0.75/verification with $2,500 one-time setup fee (2017 figures — likely stale). Currently advertises "$0.20/check PAYG for startups, no minimum commitment" as a press-release pricing. Current commercial page is contact-sales.

**ComplyAdvantage.** Starter at $99.99/mo for up to 100–1,000 entities (Ondato 2026, Be Verified). ComplyLaunch programme: 12 months free for early-stage fintechs (<$2M funding). Enterprise is volume-and-data-scope negotiated via Vendr. Sanctions + PEP + adverse media; KYB via partnership integrations. The $99.99/mo starter is the lowest entry for any serious sanctions+KYB tool in this benchmark.

**Sanctions.io.** Three published tiers: Small $899/yr = 5k screenings ($0.18/call), Medium $2,999/yr = 50k ($0.06), Large $5,999/yr = 200k ($0.03). Enterprise = 25k+/mo custom. 7-day free trial. Includes sanctions + PEP + adverse media + custom lists. API included. Global. Fintech-embed friendly.

**OpenSanctions.** Three tiers: Internal Use / Financial Services / Reseller-OEM. Average customer pays ~$39,253/yr per Cledara marketplace. Historical tier pricing (pre-2026): €2,400 Starter / €12,000 Business / bespoke Enterprise per year. Free for non-commercial. The **Reseller/OEM tier explicitly permits embedding and redistribution** — unusually permissive for a sanctions data source. Global.

**Dilisense.** Published PAYG at €0.10/call with 100 free screenings/mo. Professional €300/mo for 10k calls (€0.03 overage). High-volume tiers down to €0.01/screening. Reseller agreements with custom volume pricing. OFAC + EU + UN + HMT + BIS + SECO + World Bank + etc. No setup fees. Global.

**Dow Jones Risk & Compliance.** No public pricing; tier-1 financials typically pay €50k–€250k+/yr. Delivered as bulk feed, API, or portal. Sanctions + PEP + adverse media + state-owned enterprises. Redistribution gated. Not a fit for Strale's shape.

**Socure KYB.** No public pricing. Vendr notes 12/24-month commitments with volume-tiered per-transaction rates decreasing at scale. Practitioner narrative ("prohibitive for early-stage platforms") suggests floor $25–75k/yr similar to Middesk. Newly expanded to global 2026 per press release. Strale's v1.1 US bank-verification candidate.

**Plaid Identity + Monitor.** Plaid publishes per-request: Identity Verification Auto-Fraud Engine $0.55, Data Source $0.50, Document $0.85, Monitor Watchlist Base $0.50, Monitor Rescan $0.10. Enterprise contracts have monthly/annual minimums. Primarily individual IDV, not full KYB; Monitor = ongoing PEP/sanctions. US/CA/EU. A useful reference point: $0.50 per Monitor Watchlist base call is what a developer pays today for a single-evidence screen.

**Banfico.** SaaS volume-priced + fixed-fee on-premise license option. No public figures. UK CoP live since 2020 with top-6 banks; EU VoP-ready Oct 2025. Under EU IPR, PSPs can't charge end-users for VoP — ceiling pushes per-check prices below €0.05 for PSP customers. Strale is not a PSP; commercial terms different.

**iPiD, TechnoXander.** Enterprise sales only, no published pricing. Both PSP-focused and likely require relationship-building outreach.

**MonitorPay.** Published €0.10/check PAYG, no monthly minimum, month-end invoicing. 100 free checks. Combines IBAN validation + account ownership + PEPs/sanctions + 200+ government registries. Positions as "beyond VoP." Material competitive-comparison point: MonitorPay's bundled offering at €0.10/call is structurally similar to Strale's Payee Assurance bundled offering — same "single-call, multi-evidence" shape, much cheaper. Strale's differentiation must be audit trail + entity-resolution quality + EU-agnostic coverage depth.

---

## Build-vs-buy stack

### Primitive pricing table (confirmed / updated this research pass)

| Primitive | Source | Price | Notes |
|---|---|---|---|
| Companies House UK | Official API | Free | 600 req/5min, dev account required |
| VIES VAT | European Commission | Free | No auth, informal rate limits |
| GLEIF LEI | GLEIF | Free | No restrictions on redistribution |
| UK PSC (beneficial ownership) | Companies House | Free | Included in CH API |
| Bolagsverket SE | HVD Swagger | Free-with-attribution | Migrated 2026-04 |
| Brreg NO, CVR DK, PRH FI | Official | Free | Direct APIs |
| KVK (Netherlands) API | kvk.nl | €6.40/mo + €0.02/query | New data point; Zoeken endpoint free |
| KVK Dataservice | kvk.nl | €1,279 connection fee + €9.60/extract | Full register extract |
| Handelsregister DE | handelsregister.de | €4.50/document electronic, €1.50/stored doc | Updated from historical €8.50 |
| OpenCorporates Essentials | opencorporates.com | £2,250/yr | Call-metered; share-alike ToS |
| Dilisense PAYG | dilisense.com | €0.10/call, €0.03 Professional, €0.01 volume | Best-in-class primitive pricing |
| Sanctions.io Small | sanctions.io | $899/yr = 5k = $0.18/call | Entry |
| OpenSanctions historical Starter | opensanctions.org | €2,400/yr (pre-2026) | Tiers exist but updated prices gated |
| Creditsafe UK | G-Cloud 14 | £0.20/call min | Transactional minimum UK |
| Movitz VoP (pilot) | Movitz | €1,000/mo = 7,500 calls = €0.133/call | Or €2,000/mo at 15k |
| MonitorPay | monitorpay.ai | €0.10/check PAYG | No min, includes IBAN + screening |
| Plaid Monitor Watchlist | plaid.com | $0.50/request base | US/CA/EU |
| Senzing entity resolution | senzing.com | $58,560/yr for 10M records ($0.0059/record) | SDK license, scales to 10B |

### Three geographic scenarios

**Scenario A — UK-only AP automation (cheapest)**
| Evidence | Source | Per-call cost |
|---|---|---|
| UK registry | Companies House API | €0 |
| VAT validation | VIES | €0 |
| LEI | GLEIF | €0 |
| Sanctions + PEP | Dilisense Professional | €0.03 |
| Beneficial ownership | PSC register | €0 |
| UK CoP (bank verification) | Banfico or equivalent | ~€0.05–0.10 estimate (not published; ceiling floor) |
| Entity resolution | Senzing at scale or in-house | ~€0.005 |
| Orchestration overhead | Strale infra | ~€0.01 (Railway + audit storage) |
| **TOTAL per call** | | **€0.09–€0.14** |

**Scenario B — EU-27 full stack (v1 target)**
| Evidence | Source | Per-call cost |
|---|---|---|
| EU registry (average across 27, mix of free Nordics/UK + Creditsafe for harder countries) | Creditsafe + free direct APIs | €0.12–€0.22 (blended — free for 10 countries, ~£0.20 for 17 countries via aggregator) |
| VAT validation | VIES | €0 |
| LEI | GLEIF | €0 |
| Sanctions + PEP | Dilisense Professional or OpenSanctions Financial Services | €0.03–€0.05 |
| Beneficial ownership | Registry-included where available; Creditsafe fallback | €0 marginal if bundled |
| IBAN/name match | Movitz pilot | €0.133 |
| Entity resolution | Senzing / in-house | €0.005–€0.01 |
| Orchestration overhead | Strale infra | €0.01 |
| **TOTAL per call** | | **€0.30–€0.42** |

**Scenario C — Global including US (v1.1)**
| Evidence | Source | Per-call cost |
|---|---|---|
| Registry (EU + US + global tail) | Creditsafe + Cobalt ($7,200/yr) or PAYG | €0.55–€1.80 (Cobalt PAYG $2 = €1.80 is the high end; subscription $0.60–$0.75 is the sustainable range) |
| VAT | VIES (EU) + global fallback | €0 |
| LEI | GLEIF | €0 |
| Sanctions + PEP | Dilisense Professional or OpenSanctions | €0.03–€0.05 |
| Beneficial ownership | Mixed (PSC free, US via Cobalt, EU via aggregator) | €0 marginal to €0.05 |
| IBAN/name match | Movitz (SEPA+UK+Swift Pre-val+Kinexys for US) | €0.133 |
| Entity resolution | Senzing / in-house | €0.01 |
| Orchestration overhead | Strale infra | €0.01 |
| **TOTAL per call (US-PAYG, low volume)** | | **€1.90–€2.10** |
| **TOTAL per call (Cobalt Growth tier)** | | **€0.80–€0.95** |

### Observations from the build-vs-buy stack

- **The UK-only scenario at ~€0.10 is deceptively attractive.** Every primitive except bank verification is free. The build-vs-buy math hurts Strale most at this scenario; a UK-focused buyer can legitimately argue they can do this themselves for a few thousand euros a year. Strale wins here only on entity resolution quality + audit trail + time-to-integrate.
- **The EU-27 scenario at €0.30–€0.42 is where Strale has the strongest build-vs-buy story.** 17 countries require commercial-aggregator integration, 10 more are gapped entirely, VAT/LEI are free but IBAN/name match requires a non-trivial vendor relationship. Build cost is a quarter of engineering time + ongoing maintenance. Strale's margin at €1.00/call is €0.58–€0.70 per call before fixed costs.
- **The global+US scenario gets expensive fast** at low volume because US SOS registry data (Cobalt PAYG $2/lookup) dominates COGS. At scale with Cobalt Growth tier ($0.75/lookup = ~€0.68), global is viable. v1.1 pricing should possibly be higher than v1, or should subsidize US from EU margins.

---

## Strale COGS estimate

Best-estimate per-call COGS for the v1 EU-27 scope, based on research above:

| Component | Vendor assumption | Per-call € | Confidence |
|---|---|---|---|
| Registry (blended EU-27) | Creditsafe + free Nordic/UK APIs | 0.12–0.22 | Medium (Creditsafe quote not yet confirmed) |
| VAT | VIES | 0.00 | High |
| LEI | GLEIF | 0.00 | High |
| Sanctions + PEP | Dilisense Professional | 0.03 | High (published) |
| UBO | Bundled with registry where available | 0.00–0.05 | Medium |
| IBAN/name match | Movitz pilot | 0.133 | High (confirmed) |
| Entity resolution | In-house at v1; Senzing if scaled | 0.005–0.02 | Medium |
| Orchestration + audit log | Railway + storage + hash chain | 0.01 | Medium |
| **Best-case COGS** | | **~€0.30** | |
| **Typical COGS** | | **~€0.38** | |
| **Worst-case COGS** | | **~€0.45** | |

**Confidence caveats worth flagging:**
- Creditsafe per-call rate is not yet in contract. £0.20 is the UK G-Cloud minimum; the negotiated rate for Strale across EU-27 could be lower (volume) or higher (country mix).
- Global Database could displace Creditsafe and change the floor; not yet priced.
- If Strale chooses MonitorPay over Movitz for VoP (€0.10 vs €0.133), COGS drops €0.03 per call. But MonitorPay redistribution is unconfirmed.
- Entity resolution in-house is cheap per-call but carries fixed engineering + maintenance cost not amortized here. Senzing at $58k/yr for 10M records is the realistic commercial benchmark if Strale scales past 2M calls/yr.
- Orchestration cost assumes Railway + PostgreSQL + audit-hash storage. At 10k calls/day this is realistic; at 100k+/day infra cost per call drops materially.

---

## Recommended price bands for v1

### Floor: €0.75/call
**Rationale:** Below this, gross margin falls under 40% in the typical COGS scenario (€0.38) once factoring fixed costs. A floor of €0.75 gives ~50% margin at typical COGS and stays above the worst-case COGS of €0.45. Floor also stays above MonitorPay's €0.10 (7.5× premium) but below any enterprise-bundled KYB vendor (10× cheaper than Middesk's effective per-call).

**When to use the floor:** If Strale is actively trying to win against MonitorPay or undercut per-call pricing as a wedge into the market. Aggressive positioning.

### Benchmark: €1.00/call *(recommended default)*
**Rationale:** Lands between two competitive clusters:
- Above the cheap single-primitive band (Shufti $0.20, Dilisense €0.10, sanctions.io $0.18).
- Below the mid-range identity-first products (Persona $1.50–$3, Onfido $0.80–$1.89, Plaid $0.50–$0.85 per single call — which Strale's bundled call is strictly more than).
- Well below the full-KYB-for-fintech-embed band ($2.50+ per call with $20k+/yr floors).

**Gross margin at typical COGS:** €0.62/call = 62% — healthy and defensible. At worst-case COGS (€0.45), margin is still 55%.

**Narrative positioning:** "One call, €1.00, bundles what would cost $5–50k/yr in upfront commitments elsewhere."

### Positioning: €1.50/call
**Rationale:** Strale positions as the trust-wrapper — audit trail + entity resolution + regulator-defensible evidence chain. A €1.50 price reinforces that positioning and extracts willingness-to-pay from compliance-conscious buyers. Still materially below Persona/Onfido mid-volume and well below Middesk/Socure effective per-call.

**Margin at €1.50:** €1.12/call = 75% — attractive but risks signalling "expensive" to developers doing build-vs-buy math without seeing the audit trail value.

**When to use the positioning price:** If Strale's launch customer base is explicitly compliance-officer-driven (regulated businesses, fintech onboarding teams) rather than developer-driven. Hold the card for a later repricing once trust brand is established.

### Recommendation

**Ship v1 at €1.00/call flat.** Reasons:
1. Preserves the canonical "low is easier to raise than high is to lower" principle.
2. Protects 55%+ margin across the plausible COGS range.
3. Positions Strale materially below the Middesk/Socure/Persona band, making build-vs-buy math obvious for any buyer under ~20k calls/month.
4. Leaves room to raise to €1.25 or €1.50 once v1.1 ships (US adds meaningful COGS) or if audit-trail buyers prove willing to pay more.
5. Simple to explain in the developer-facing docs and on the pricing page.

**Do not ship below €0.75.** The risk of "trust wrapper" positioning being compressed by commodity pricing outweighs the risk of missing a few price-sensitive developers.

---

## Volume-tier ladder sketch (future, not v1 commit)

If/when volume discount subscriptions ship (trigger per Business model page = enough post-paid customers at predictable high volume), plausible tier structure:

| Tier | Commit | Included | Effective per-call | Rationale |
|---|---|---|---|---|
| Starter | Post-paid | Pay-as-you-go | €1.00 | v1 default, no changes |
| Growth | €500/mo | 600 calls/mo | €0.83 | 17% discount at modest volume — matches the first real "price break" Creditsafe and Cobalt offer at similar volumes |
| Scale | €2,000/mo | 3,000 calls/mo | €0.67 | 33% discount — aligns with Movitz's €0.13 bundle-rate discount structure |
| Enterprise | €10,000+/mo | 20,000+ calls/mo | €0.50 | 50% discount for committed volume — still 7× premium over MonitorPay, appropriate for bundled decision-readiness |

Rationale for the shape:
- Three tiers keep the page simple.
- Breakpoints match where direct competitors offer their own volume breaks, so Strale's ladder is benchmark-sensible.
- Enterprise floor of €0.50 stays above the realistic COGS range.
- No rollover (match Cobalt's discipline); credits expire monthly.

**Explicit non-commitment:** This ladder is only useful if post-paid customers in the €0.75–€2/call band prove the existence of a committed-volume customer segment. Until then, v1 is flat-only.

---

## Open questions

These are the questions the benchmark can't answer from research alone. All require vendor-direct conversations or Strale-specific data.

1. **Creditsafe contracted rate for Strale's EU-27 mix.** £0.20 is the UK G-Cloud floor. The negotiated blended rate across EU-27 at Strale's projected volume is the single biggest COGS uncertainty. Outreach already in motion; awaiting quote.
2. **Global Database actual pricing and reseller terms in contract.** Self-described as reseller-friendly; only verifiable by contract review. Outreach scheduled.
3. **Movitz pilot-to-production transition cost.** Pilot rate €0.133/call locks in at 7,500 calls/mo. What happens at 20k/mo, 50k/mo, 200k/mo? Needs meeting with Magnus in mid-May.
4. **MonitorPay redistribution permission.** €0.10/call is published but reseller terms aren't confirmed. If reseller-permitted, MonitorPay displaces Movitz as VoP vendor of choice and changes COGS floor by €0.03/call. Outreach required.
5. **OpenSanctions current Reseller/OEM tier pricing.** Historical prices (€2,400 Starter) may be stale. Published tiers exist but exact numbers gated. Worth a direct inquiry — Strale would qualify for Reseller/OEM tier by product shape.
6. **Socure KYB pricing for v1.1 US.** Practitioner estimates suggest $25–75k/yr floor. If confirmed, US v1.1 pricing must absorb this either via price increase, volume minimum, or margin compression vs. EU v1.
7. **Cobalt annual-plan renewal rate.** The $7,200/yr = 400/mo is positioned as "startup accommodation." Does it renew at the same rate in year 2? Affects v1.1 US COGS model.
8. **Willingness-to-pay among launch customers.** No customer discovery data in hand. A €1.00 flat-price launch is a hypothesis, not a tested number. First 20 paying customers will reveal whether €1.00 is obvious-buy or stretch.
9. **Bundled competitor threat: MonitorPay at €0.10.** MonitorPay offers a structurally similar bundle at a tenth of recommended Strale price. Strale's differentiation (audit trail, entity resolution quality, EU-coverage depth) must be legible in the first customer conversation. If customers say "MonitorPay does the same thing for less," positioning is at risk.
10. **Pricing page publication cadence.** Once €1.00 ships, changing it is expensive. Recommend explicitly publishing v1 pricing with a "v1.1 will reprice" note so repricing is expected, not a backtrack.

---

## Sources

### Notion (internal)
- Payee Assurance canonical page — https://www.notion.so/34867c87082c814999e5c668d7383fa7
- Business model canonical page — https://www.notion.so/33c67c87082c817fac7cd9d7b6c44e40
- Vendor research — EU + US KYB aggregators (round 2) — https://www.notion.so/34a67c87082c814b8fb0e88f072b63ea
- Vendor — Movitz — https://www.notion.so/34967c87082c81e48ee9e6884188f877
- Vendor — Cobalt Intelligence — https://www.notion.so/34967c87082c8116b7abe2df74e1651b
- Vendor — Middesk — https://www.notion.so/34967c87082c811f90f9f8bbbc55ecb2
- Provider-Coverage DB — https://www.notion.so/34867c87082c81879391ebc05a9b3d90

### Published vendor pricing pages
- Cobalt Intelligence — cobaltintelligence.com (detailed tiers)
- Sanctions.io — sanctions.io/pricing-calculator, support.sanctions.io/article/33
- Dilisense — dilisense.com/en/products/aml-screening-api
- MonitorPay — monitorpay.ai
- Plaid — plaid.com/pricing, pricelevel.com
- Senzing — senzing.com/pricing
- KVK — developers.kvk.nl/pricing
- Handelsregister — handelsregister.de
- Companies House — developer-specs.company-information.service.gov.uk
- GLEIF — gleif.org/en/lei-data/gleif-api
- VIES — ec.europa.eu (EU Commission)
- OpenCorporates — opencorporates.com/api_accounts/new
- OpenSanctions — opensanctions.org/licensing
- ComplyAdvantage — complyadvantage.com (starter tier)

### Third-party / secondary
- Vendr marketplace — persona, onfido, complyadvantage, socure, plaid, dow-jones, creditsafe, d&b listings
- Ondato 2026 KYC/KYB software comparison guide
- Be Verified (beverified.org) 2026 KYC vendor comparison
- Finexer, HyperVerge 2026 Onfido/Veriff guides
- Cledara marketplace aggregate (OpenSanctions)
- Zephira 2026 KYB vendor review
- G-Cloud 14 Creditsafe pricing PDF
- Maltego / Bureau van Dijk integration documentation
- UK G-Cloud supplier directory

### Legal and contract text
- Dun & Bradstreet Product License Agreement EB062823 (public)
- Pay.UK Confirmation of Payee scheme documentation
- EU Instant Payment Regulation (IPR) — VoP cost allocation to PSPs

---

*End of research document. No commits made. File is local to `docs/research/`. Next action (chat-level decision): review with Petter, decide on v1 flat price, then update the Business model canonical page with the published number.*
