# Payee Assurance — Build vs Buy Cost Analysis

**Date:** 2026-04-28
**Author:** Code (research session)
**Purpose:** Identify which Payee Assurance legs are best served by buying from a vendor PAYG, and which are best served by Strale building or ingesting open data directly. Anchored on Petter's principles (no fixed monthly costs at v1.1 launch volumes, PAYG > committed-volume) and DEC-20260428-A (Strale itself never operates scrapers; may consume vendor-scraped public records under Tier 2; prefers licensed-bulk over scraping-derived per Tier 3).

## Product model assumed (configurable bundle, not tiers)

Single Payee Assurance API, identical shape across all markets. Customer specifies which legs they need at call time:

```
POST /v1/payee-assurance
{
  "payee": { "name": "Acme Corp", "country": "US", "ein": "12-3456789" },
  "checks": ["identity", "sanctions", "pep", "ein", "ubo"]
}
```

Response includes only the requested legs. Price = sum of per-leg costs × markup. No tiers, no monitoring sub-product. Agents poll on whatever cadence they want; each poll is just another call. Audit trail captures every call regardless.

This is a constraint on the analysis: every leg's cost has to stand on its own at PAYG, because customers will mix-and-match.

## Cost stack — current state

Per-call vendor costs at v1.1 launch volumes (PAYG, no committed minimums):

| Leg | Current vendor | EU per-call | US per-call | Notes |
|---|---|---|---|---|
| Identity (registry) | Direct registry API or Cobalt | €0–0.50 | $2.00 (PAYG) | Cobalt $0.75 via trial batch, $1.00 at 1k/mo subscription. Free APIs cover most EU countries. |
| EIN / Tax ID | n/a (VIES free for VAT) / Liberty Data | n/a (VAT free) | $0.75 (Liberty Data Startup, $375/yr / 500 calls) | Judy Diamond pending diligence reply |
| Sanctions / PEP | Dilisense | €0.10 | €0.10 | Reseller tier may carry monthly commitment — see below |
| Adverse media | Strale `adverse-media-check` (Serper + Claude Haiku) | €0.05–0.10 | €0.05–0.10 | Already in-house |
| UBO | OpenOwnership (free, narrow) / aggregator | €0.30–1.00 (where available) | €0–TBD | Heavy legal restrictions in EU |
| IBAN/name match | Digiteal (SEPA) / eSortcode (UK CoP) | €0.50 SEPA / €0.18 UK | n/a (US uses different scheme — ACH/FedNow/RTP, deferred) | €0.50 confirmed PAYG floor for SEPA; eSortcode at £0.15 PAYG for UK CoP — country-routing recommended |
| Audit trail / hash | Internal | ~€0 | ~€0 | Strale infrastructure |

## Per-leg analysis

### Sanctions / PEP

**Buy** (current state — Dilisense):
- Starter tier: €0.10/call, 100 free/mo, no monthly minimum (informal arrangement per memory `project_dilisense_reseller_status.md`)
- **Reseller tier (Basic+) required for formal embed in Payee Assurance bundle** — likely carries monthly commitment, exact pricing not in current notes
- Coverage: global sanctions, PEPs, related entities — same upstream sources as OpenSanctions
- Switching cost: existing relationship, DPA in place

**Build** (OpenSanctions self-host with Yente):
- **Data licensing — CORRECTION (2026-04-29):** earlier draft of this doc claimed "license permits commercial use." That is incorrect. OpenSanctions data is CC-BY-**NonCommercial** 4.0 ([opensanctions.org/licensing](https://www.opensanctions.org/licensing/)): "free for non-commercial users. Businesses must acquire a data license to use the dataset." Three commercial tiers: Internal Use, Financial Services, Reseller/OEM. Strale's embedded-in-bundles use is Reseller/OEM. Pricing not public; Cledara marketplace average is ~$39k/yr. Historical (pre-2026) starter tiers: €2,400 Internal / €12,000 Financial Services / bespoke Reseller.
- **Matcher**: [Yente](https://www.opensanctions.org/docs/api/yente/) (FOSS) and the underlying nomenklatura library (BSD) are separable from the data. Self-hosting Yente without a paid data license violates the data licence — the matcher being free does not exempt the data.
- **OpenSanctions hosted API**: €0.10/call. At Strale's `pep-check` retail price of €0.05 and `sanctions-check` retail of €0.20, the API path is unviable as a backend (per-call cost ≥ retail).
- **Engineering effort if licensed**: 1–2 weeks for Yente deployment + 4–6 additional weeks for full DEC-20260428-B engineering bar (Merkle ingest, replay, dispute workflow, golden suite, threat model, methodology page, canary).
- **Hosting cost (excluding licence)**: ~€30–50/month (Yente container + Elasticsearch/OpenSearch single-node + ingest cron).

**Verdict (REVISED 2026-04-29): DO NOT BUILD.**

The original verdict was based on the licensing error above. With the correction, OpenSanctions self-host costs ~$30–50k/yr in licence fees against ~€100/mo Dilisense reseller-tier alternative — Yente self-host is ~10× more expensive than wrapping Dilisense, not cheaper. The "removes Dilisense fixed-cost exposure" rationale inverts: the self-host *introduces* a much larger fixed-cost exposure.

DEC-20260428-B's engineering bar applies to "data services Strale builds in-house." Wrapping Dilisense as a Tier-2 vendor under DEC-20260428-A does not trigger the bar — the bar is the cost of in-house ownership, not the cost of compliance per se.

**Resolved direction (per Mirko @ Dilisense, 2026-04-29):**
- Stay on Dilisense Starter informally (vendor-granted grace) until volume forces upgrade.
- Sign Reseller Service Agreement + DPA at Basic tier when triggered, not preemptively.
- Re-evaluation triggers: (a) Dilisense monthly bill > €1.5k (Yente/primary-source amortizes within 12 months), (b) regulated customer requires Strale-controlled dataset replay, (c) 12 months elapsed (revisit April 2027), (d) Dilisense initiates upgrade conversation.
- Sanctions/PEP self-host (OpenSanctions or primary-source aggregation) deferred indefinitely. Engineering capacity reallocated to higher-ROI builds (UBO open-data ingest, remaining EU registry direct integrations).

The PEP and sanctions screening capabilities remain functional as Dilisense-wrapped Tier-2 vendor calls per the audit-grade hardening shipped 2026-04-27 (commit `16ca790`).

### Adverse media

**Buy** vs **build** — already built. Strale's `adverse-media-check` capability uses Serper.dev (€0.005/call) + Claude Haiku (~€0.05–0.08/call) ≈ €0.05–0.10/call effective. Commercial alternatives are €0.20–0.50/call. **Stay with current implementation.** No action needed.

### UBO

This is the most legally complex leg, not the most expensive.

**Free / open-data options**:
- **OpenOwnership** — bulk downloads (CSV/SQL/Parquet) for UK, Denmark, Slovakia. Coverage ~5–10M companies. License permits commercial use.
- **UK Companies House PSC register** — separate from OpenOwnership-via-UK; Companies House publishes its own free PSC API for live access.
- **CVR (Denmark)** — UBO data is part of the CVR open data API.
- **Norwegian Brønnøysund** — beneficial ownership data has limited free access; status to verify.

Coverage from free open data: UK + DK + SK + (partial NO) ≈ 4 of 27 EU member states + UK. Important countries — UK is high-volume — but a coverage hole for Germany, France, Netherlands, Spain, Italy, etc.

**Why other EU UBO is hard**: post-CJEU rulings (2022) restricted public access to UBO registries across the EU. Most member states now require legitimate-interest claims (typically: AML obliged entity, journalism, academic research). Strale is none of these. **Strale cannot reliably access non-OpenOwnership EU UBO without partnering with a regulated entity or using a commercial aggregator with appropriate legal basis.**

**Paid commercial aggregators** for EU-beyond-OpenOwnership:
- Moody's BvD / kompany — quote-gated, typically €0.50–2/call
- Creditsafe — bundled with KYB suite (excluded as competitor under DEC-20260428-A but data tier *might* be separable)
- CompanyData.com — published $0.10/call PAYG, claims global UBO; quality unverified

**US UBO**: no functional public registry. FinCEN BOI was supposed to deliver one but enforcement is in legal limbo as of 2026. Best Strale can offer for US is "officer/director from SoS filings" (Cobalt response includes officers) — that's not true UBO but is the only consistently available source.

**Verdict**: **Build the free leg, route paid where unavoidable.**

- **Build (1–2 weeks)**: OpenOwnership + UK PSC + CVR + Brreg ingest into a Strale UBO matcher. Per-call cost ~€0 for these jurisdictions.
- **Buy on demand**: for jurisdictions without free open data, use a paid aggregator on a per-call basis (CompanyData.com if their PAYG holds up under verification; otherwise quote-gated commercial aggregators). Customer pays for UBO leg only in jurisdictions where it's available; API is honest about availability per country.
- **For US**: include officers/registered agent from Cobalt response, marketed as "officer information" not "UBO". Be transparent about the UBO gap.

This pattern keeps fixed costs zero and per-call costs zero for the majority of EU UBO traffic.

### EU business registry aggregators

Current state (per memory and CLAUDE.md):

**Free official APIs** Strale already integrates or can integrate cheaply:
- NO Brreg, DK CVR/Virk, FI PRH, FR SIRENE/INPI, EE ariregister, CZ ARES, PL KRS, IE CRO, UK Companies House (with key, free)

**Paid official APIs** (subscription or per-pull, but no monthly commitment beyond modest fees):
- NL KVK (subscription model)
- DE Handelsregister (paid per filing)
- IT Registro Imprese / InfoCamere (paid)
- ES, PT (paid via partners)

**Currently scraped via Browserless + LLM** (must remove per Tier 1 of DEC-20260428-A):
- SE Allabolag — ToS-violating, removal in progress (Bolagsverket HVD migration shipped per `2026-04-22-bolagsverket-hvd-migration` handoff)
- 11 EU registries: NL, DE, BE, AT, IE, LV, LT, CH, ES, IT, PT (per memory `Capability Architecture Patterns`)

**Verdict**: **Replace remaining Browserless+LLM scrapers with direct integrations** — sequenced by call volume per country. Some of these (NL KVK, DE Handelsregister) require paid official APIs; the cost is per-call, modest, and crucially without monthly commitment. Others have free official APIs Strale just isn't using yet (BE KBO, AT Firmenbuch, IE CRO).

Engineering effort: 3–5 days per country, prioritized by traffic volume in customer-facing data. Most countries should land at €0 per-call after build; the paid-official ones (NL, DE, IT, ES, PT) are €0.10–0.50 per-call but PAYG-friendly.

### IBAN/Name match

**No build option.** The EPC Verification of Payee scheme is licensed regulated infrastructure (RVMs and CSPs operating under PSD2). Strale cannot replicate this leg in-house — it has to be bought.

**Headline finding from focused PAYG vendor hunt (2026-04-28): €0.50 is the European VoP PAYG floor.** Every cheaper provider is one of:
- (a) PSP-targeted, sold as platform/IaaS license rather than per-call (CPB, LUXHUB, Worldline, Form3, obconnect, Ozone, TechnoXander, Banfico — most of the EPC RVM list)
- (b) PSD2-gated, requires Strale to be a licensed TPP or operate under another PSP's license envelope (Klarna Kosma, Tink, TrueLayer, Salt Edge — though some front the license for partners under contract)
- (c) Bundled into KYB/AP-fraud workflow product (Trustpair, iPiD KYP, Sis ID)
- (d) Refused (SurePay declined Strale)

**Best PAYG vendors found:**

| Vendor | Coverage | Per-call (PAYG) | Monthly min | Setup fee |
|---|---|---|---|---|
| **Digiteal** | EU27 SEPA VoP | **€0.50** | None | €365 (waived pre-2026-03-01) |
| **eSortcode** | UK CoP only | **£0.15 (~€0.18)** | None ("no subscriptions or commitments") | None ("no setup fees or hidden costs") |

**The architectural move: country-routing.** GB IBAN/sort-code → eSortcode (~€0.18/call); rest of EU → Digiteal (€0.50/call). If UK volume is non-trivial, blended IBAN/name cost drops materially below the Digiteal-only baseline. Both are PAYG with no monthly commitment.

**NEEDS-CALL candidates** worth probing for future reduction once Strale has 30–60 days of real volume:
- **iban.com BAV API** — ~30 countries, 100-query free trial, plans are subscription-style with "limited or unlimited" buckets; likely €0.20–0.40 at low-volume buckets but unverified. Could replace Digiteal at lower per-call if subscription floor is small.
- **Yapily** — VoP via open-banking platform; non-licensed customers operate under Yapily's TPP envelope. Free tier exists but VoP gated to paid plans. Confirm whether entry plan is true PAYG.
- **Tink Account Check** — €0.25/verification published in commercial materials, license-fronted for partners. But entry tier appears contract-committed in practice. Worth verifying actual PAYG availability.

**For US bank account verification: this leg is materially different.** US doesn't use IBAN; verification goes through ACH/FedNow/RTP networks with different vendors (Plaid, Method, MX, Astra, etc.). Out of scope for v1.1's EU/UK launch focus and the Digiteal+eSortcode plan; revisit when adding US bank verification to Payee Assurance.

**Verdict**: **Buy. Digiteal as primary EU vendor + eSortcode as UK route. €0.50 SEPA / €0.18 UK is the PAYG floor today; renegotiate down once Strale has 30–60 days of demonstrated volume.** This becomes the dominant single-leg cost in EU Payee Assurance and anchors pricing strategy.

### EIN match (US only)

Already covered in `2026-04-28-us-business-data-vendor-longlist.md`. Buy from Liberty Data ($375/yr Startup tier, $0.75 per-call effective) or Judy Diamond (pending). **Build alternative**: ingest DOL Form 5500 dataset directly. Effort: ~2 weeks. Coverage: only Form 5500 filers (~1M EINs, employers with benefits plans). For the long tail of US LLCs/sole props, no free EIN dataset exists — Liberty Data remains the only path. **Verdict: don't build.** $375/yr fixed cost is small enough and Liberty Data covers the whole target universe; building Form-5500-only saves nothing because Liberty Data already covers Form-5500 entities and more.

### Identity (US — Cobalt)

**Don't build.** Tier 1 of DEC-20260428-A explicitly forbids Strale operating its own SoS scrapers, which is what direct state-portal access would require. Cobalt's $1–2/call PAYG is the right answer.

State-by-state direct ingest of *bulk* official data (e.g., FL Sunbiz publishes free downloads, CA has a paid API, TX has bulk data) is theoretically possible and would not violate Tier 1. But: each state's data shape differs, refresh cadence differs, and the engineering cost is per-state. Realistic only for the top 5–10 states by call volume. **Defer until v1.2** — not worth the engineering at v1.1 launch volumes.

## Engineering effort & ROI summary

| Build target | Effort (FTE-weeks) | Recurring cost | Replaces vendor cost | ROI inflection (calls/mo) |
|---|---|---|---|---|
| OpenSanctions self-host (Yente) | 1–2 | €100/mo hosting | Dilisense Basic+ reseller tier (TBD monthly commit) | ~1k EU calls/mo at Starter; immediate at Basic+ |
| UBO ingest (OpenOwnership + PSC + CVR + Brreg) | 1–2 | ~€50/mo hosting | Commercial UBO aggregator at €0.30–1.00/call for UK/DK/SK | Immediate — closes coverage gap |
| EU registry direct integrations (replace Browserless) | 3–5 days × ~10 countries | ~€0/mo (free APIs) or €0.10–0.50/call (paid official) | Browserless infra + ToS risk | Already justified by Tier 1 doctrine |
| US Form 5500 EIN ingest | 1–2 | ~€20/mo hosting | Liberty Data $0.75/call for Form-5500-filer entities only | NOT recommended — coverage too narrow |
| US per-state SoS bulk ingest | 1–2 per state, 5–10 states | varies | Cobalt $1.00–2.00/call for those states | Defer to v1.2 |

## Stack-ranked recommendation

In order of ROI and strategic alignment:

1. **OpenSanctions self-host** — highest priority. Removes the only obvious fixed-monthly-cost exposure in the stack (Dilisense reseller tier), aligns with Strale's data-layer platform thesis, and the engineering effort is small. Do this first.

2. **EU registry direct integrations** — already mandated by Tier 1 doctrine (no scraping in Strale's own infrastructure). Sequence by call-volume; each country added drops a fraction of registry calls to €0 or near-zero. Some of this work is already in flight (Bolagsverket HVD).

3. **UBO open-data ingest (UK + DK + SK + NO)** — closes a coverage gap and provides Strale's UBO leg at €0/call for the most-frequented jurisdictions. Be transparent in API responses about UBO availability per country.

4. **IBAN/name** — verdict pending agent results.

**Do not build** at this stage:
- US Form 5500 EIN matcher (Liberty Data sufficient, $375/yr fixed is acceptable)
- US per-state SoS bulk ingest (defer to v1.2 once volume justifies it)
- US identity scraping (forbidden by Tier 1)

## What this changes for product economics

Assuming all three primary build targets ship over the next 4–6 weeks of engineering capacity:

- **Sanctions/PEP cost** drops from €0.10/call (Dilisense reseller tier with monthly commit) to ~€0/call (self-hosted), with €100/mo hosting fixed cost.
- **EU UBO cost** drops from €0.30–1.00/call to ~€0/call for UK/DK/SK (and NO if Brreg is feasible). Other EU countries remain paid-aggregator-on-demand.
- **EU registry cost** drops from €0–0.50/call (mixed) to ~€0/call (mostly), with paid official APIs (NL/DE/IT/ES/PT) at €0.10–0.50/call PAYG.
- **Sanctions+PEP+UBO+EU registry** total ~€0–0.50/call where today it's ~€0.50–2.00/call.

The leg that *doesn't* compress under this plan: **IBAN/name match**. €0.50/call is confirmed as the SEPA VoP PAYG floor — no build alternative exists (it's licensed regulated infrastructure), and every cheaper vendor either gates on PSD2 license, requires monthly commitment, or bundles into a workflow product. The one optimization: country-route GB calls to eSortcode at £0.15 (~€0.18) PAYG. If UK call mix is significant, blended IBAN/name cost can drop notably below €0.50 even before any volume negotiation. **This is the leg where pricing strategy will need to bite, and where renegotiation downward post-30-60-days-of-data becomes the next cost lever.**

## Source references

- [DEC-20260428-A — Third-party scraping doctrine](https://www.notion.so/35067c87082c810db6a4edf9f14b4446)
- [OpenSanctions data + Yente matcher](https://www.opensanctions.org/docs/api/yente/)
- [OpenOwnership data downloads](https://bods-data.openownership.org/source/register/)
- [DOL Form 5500 datasets (free downloads)](https://www.dol.gov/agencies/ebsa/about-ebsa/our-activities/public-disclosure/foia/form-5500-datasets)
- [`2026-04-22-bolagsverket-hvd-migration` handoff (Bolagsverket migration in progress)](../../handoff/_general/from-code/2026-04-22-bolagsverket-hvd-migration.md)
- [`project_dilisense_reseller_status` memory (Dilisense reseller tier requirement)](../../../../.claude/projects/c--Users-pette-Projects-strale/memory/project_dilisense_reseller_status.md)
