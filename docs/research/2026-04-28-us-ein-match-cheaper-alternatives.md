---
date: 2026-04-28
intent: Find vendors and free-data ingest paths that are cheaper than (or complementary to) Liberty Data / EINsearch ($375/yr Startup, ~$0.75/call effective) for the "does this EIN belong to this named entity?" check inside Payee Assurance v1.1. Founder constraint: PAYG > committed monthly fees at v1.1 launch volumes.
confidence: Mixed. Pricing for Liberty Data and Cobalt Intelligence is published or confirmed. BrightQuery, Sayari, Veridion, Avalara, TIN Comply, Judy Diamond are quote-gated and marked low-confidence. Free-data record counts are primary-source verified.
---

# US EIN-Match: Cheaper Alternatives & Complements to Liberty Data

## 1. Vendor table

| # | Vendor | Sourcing | US coverage | Per-call | Monthly min | Setup | Provenance | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | **Liberty Data / EINsearch** (baseline) | Bureau-licensed (Experian/D&B-derived) | ~30M+ businesses | ~$0.75 effective at Startup tier ($375/yr / 500 calls) | ~$31/mo equiv | None | Bureau ref — fact-level not exposed | **Confirmed legit, baseline.** PAYG-equivalent at low volume. |
| 2 | **BrightQuery** | IRS Form 5500, DOL, SBA, SEC, USPS | 30M+ US co's, 5,000+ fields | **quote-gated** | quote-gated (12-mo subs) | quote-gated | Strong: primary-source per fact | **Low-confidence on price.** Likely above $5k/yr floor; not PAYG. Best fit if scale forces a license. |
| 3 | **Judy Diamond / EIN Finder** | Form 5500 lineage | ~1M employer EINs (5500 universe only) | **quote-gated** | quote-gated | unknown | Form 5500 (public record) | Narrow coverage (employers w/ benefit plans only). Skip unless 5500-only is acceptable. |
| 4 | **TIN Comply** | IRS-derived | unknown | **quote-gated** | quote-gated | unknown | Marked low-confidence; couldn't verify on this pass | Skip until pricing surfaces. |
| 5 | **Global Database** | Government registries (150+ countries) | included in global | **$0.10 / verification**; $1.00 for full report | None (PAYG) | None published | Mixed — claims "official registries" but US sourcing not clearly itemised | **Promising on price.** Verify US sourcing path before relying — "registries" is vague for US (no central business registry). Confidence: medium. |
| 6 | **Zephira.ai** | Government registries | 150+ countries claimed | bundled in plan | **$49/mo Starter** (100 profiles, 30/min) | None | Mixed — same caveat as Global Database for US | Cheapest fixed-fee floor. 100 profiles is tight; bundled cost works out to ~$0.49/profile if fully used. **Confidence: medium.** |
| 7 | **Veridion (Match & Enrich)** | Web crawl + AI curation, 80M+ companies global | global incl. US | **$0.03/credit** floor, scaling up to enterprise | quote-gated; self-serve "launching soon" | unknown | Weak for US EIN — Veridion is firmographic enrichment, EIN is not a guaranteed field | Cheapest /call rate but **EIN coverage unconfirmed**. Best as enrichment, not EIN-match. Self-serve API status unclear. |
| 8 | **Cobalt Intelligence** | Secretary of State scraping (50 states) | all 50 states | credit-based, PAYG available, **20 free trial credits** | base plan starts ~$1k/yr range (specifics quote-gated) | None | State SoS records = public record, primary-sourced | **Strong PAYG fit** but: SoS data exposes registered name, not EIN. Will not satisfy "does EIN match name" — wrong axis. |
| 9 | **Sayari Graph** | Public records + ownership graph, all 50 US states | 129M US companies | **quote-gated**, custom enterprise | unknown | unknown | Strong: primary-source-cited per record | Likely well above $5k/yr; treat as enterprise option only. |
| 10 | **Avalara 1099/W-9 (Track1099)** | IRS TIN matching (rejected per filter) | n/a | n/a — IRS-AI path | n/a | n/a | n/a | **Filtered out.** Same for TINcheck, Tax1099, einSearch.IO, Compliancely. |

**Pricing confidence levels:** confirmed = Liberty Data, Global Database, Zephira, Cobalt (model), Veridion floor. Quote-gated (low-confidence) = BrightQuery, Judy Diamond, TIN Comply, Sayari.

## 2. Free-data ingest analysis

Primary-source-verified record counts:

- **IRS Exempt Organizations Business Master File (EO BMF):** **1,952,238 records** (verified from irs.gov on 2026-04-14). CSV by state, sorted by EIN, monthly refresh. Free.
- **DOL Form 5500 datasets (EFAST2 FOIA):** ~800,000 retirement and welfare benefit plans annually (DOL self-description). Multi-year accumulated unique sponsor EINs ~1.0–1.2M (rough estimate; FOIA bulk download required for exact dedupe). CSV bulk; FOIA gate for full image service.
- **SAM.gov registered entities:** ~674,000 active registered entities (most recent GSA "by the numbers" figure surfaced). Public Entity API: 10 req/day unauthenticated, 1,000/day authenticated. Provides UEI + legal name + address; **EIN is not in the public extract** — registered users see TIN only on their own records, not others'. This breaks the model — SAM is a name/UEI source, not an EIN-match source.
- **SEC EDGAR:** ~13k actively reporting public filers; bulk submissions.zip nightly; CIK→EIN mapping available in filings (EIN appears in 10-K cover sheets and Form D), parseable.

**Realistic unified-EIN-match coverage from free ingest:**

- BMF nonprofits: 1.95M EINs
- Form 5500 sponsors: ~1.0–1.2M EINs (overlap with BMF probably <5% — different universes)
- EDGAR filers: ~13k EINs
- SAM.gov: **excluded from EIN coverage** (no public EIN field)

→ Total unique EINs realistically buildable: **~3.0–3.2M**, not 3.5M. Below the 33M+ US business universe Liberty Data covers. **Hit-rate on Payee Assurance traffic: ~10% if the user base is broadly distributed across the US economy; higher (~30–50%) if traffic skews toward nonprofits + large employers + public companies; near-zero for sole proprietors, small LLCs, and unincorporated payees** — which is where invoice-fraud cases concentrate.

**Engineering effort to build a unified EIN-match service from these:**
- Schema unification across 4 source formats: ~3–5 dev-days
- ETL pipelines + monthly refresh cron: ~3–5 dev-days
- Name-normalisation and fuzzy matching layer (the actual hard part — "John Smith Plumbing LLC" vs "JOHN SMITH PLUMBING, L.L.C."): ~5–10 dev-days
- Provenance tagging per record (per DEC-20260428-A Tier 2 requirements): ~2 dev-days
- Capability + tests + onboarder: ~2 dev-days

**Total: ~15–25 dev-days** for a ~3M-EIN partial substitute that misses the 30M+ small-business long tail.

## 3. Marketplace-PAYG paths

**Snowflake Marketplace** supports per-query pricing (provider sets `$/query`, optional free queries per cycle, optional monthly cap). Confirmed listings with US business + EIN-adjacent fields:

- **Dun & Bradstreet** — multiple listings ("New Business Listings", "New or Updated Mailing Addresses", "New or Updated Primary Phone Numbers"). DUNS, not EIN; EIN field availability per listing **not publicly confirmed**.
- **People Data Labs** — company + person dataset; EIN is **not** a documented field.
- **Coresignal** — firmographics; EIN **not** documented as a field.

→ No Snowflake Marketplace listing surfaced in this pass with EIN as a confirmed primary key + published per-query price. The marketplace's per-query billing model is real and could be leveraged by Strale **if** an EIN-bearing dataset shows up there — but right now D&B's listings don't expose EIN as the core field, they expose DUNS.

**AWS Data Exchange** — flat subscription model dominates (free → "hundreds of thousands of dollars"); per-query is rare. No EIN-keyed US business dataset with usable PAYG terms surfaced. Same conclusion: marketplace path is not yet competitive with Liberty Data for EIN-match specifically.

## 4. Honest assessment

**Is anything materially below Liberty Data's $0.75/call PAYG-equivalent that covers the full 33M+ US business universe?**

**No.** Of the candidates with published pricing:

- **Global Database $0.10/call** is 7.5× cheaper but its US sourcing claim ("government registries") is vague — there is no single US business registry, so this is either (a) IRS-derived (would fall under the AI path, filtered), (b) bureau-licensed (then it's really a Liberty Data competitor at suspicious price), or (c) state-SoS aggregation (then it's name/registration data, not EIN-match). Until US-specific sourcing is verified, this is **not a drop-in replacement** for Liberty Data.
- **Veridion $0.03/credit** is cheaper still but EIN coverage is not confirmed; the product is firmographic enrichment, not EIN verification.
- **Zephira $49/mo** breaks the PAYG rule and only covers 100 profiles at the floor.
- **Cobalt Intelligence** is PAYG-friendly but sources state SoS records, which expose registered legal name (and sometimes EIN where states publish it — most don't). Wrong axis for EIN-match.

**Liberty Data is effectively the floor** for "real PAYG-equivalent EIN-match across the full US business universe at startup-friendly economics." The $375/yr Startup tier is unusually permissive for what it provides, and bureau-derived sourcing is the only commercial path that covers the long tail (sole proprietors, small LLCs) at scale.

**Is the free-ingest build worth pursuing as a partial substitute?**

**Conditionally yes, as a complement, not a substitute.** ~15–25 dev-days buys a ~3M-EIN coverage layer that hits ~10% of typical Payee Assurance traffic for free (zero per-call cost) once built. The right architecture is:

1. **Try free-ingest layer first** (BMF + Form 5500 + EDGAR) — zero marginal cost on hits.
2. **Fall through to Liberty Data on miss** — pay $0.75 only on the ~90% that don't hit the local layer.

This roughly cuts effective per-call cost to **~$0.68 blended** at 10% hit rate, ~$0.53 at 30% hit rate, while preserving full coverage. The build also generates legitimate Tier-2 provenance (per DEC-20260428-A) — IRS, DOL, SEC are statutory public-record sources.

**Recommendation:** Ship Payee Assurance v1.1 on Liberty Data alone. Backlog the free-ingest layer as a v1.2 cost optimisation once US Payee Assurance traffic reaches volumes where the 15–25 dev-days pays back (rough threshold: ~2,000 US calls/month sustained). Do not pursue BrightQuery, Sayari, or any quote-gated vendor at v1.1 — the 12-month commitment violates the founder's PAYG constraint and the upside vs Liberty Data is unclear without seeing the actual quote.

---

## Sources

- [Top 5 EIN Verification Tools: 2026 KYB Guide — Global Database](https://www.globaldatabase.com/top-5-ein-verification-tools-the-2026-kyb-guide)
- [BrightQuery profile — Datarade](https://datarade.ai/data-providers/brightquery/profile)
- [Veridion Match & Enrich API](https://veridion.com/match-enrich-api/)
- [Zephira.ai pricing references](https://zephira.ai/)
- [Cobalt Intelligence pricing structure blog](https://cobaltintelligence.com/blog/post/what-is-cobalt-intelligences-pricing-structure)
- [IRS Exempt Organizations Business Master File Extract](https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf)
- [DOL Form 5500 FOIA Datasets](https://www.dol.gov/agencies/ebsa/about-ebsa/our-activities/public-disclosure/foia/form-5500-datasets)
- [SAM.gov Entity Management API — GSA Open Tech](https://open.gsa.gov/api/entity-api/)
- [SAM.gov by the Numbers — GSA](https://www.gsa.gov/about-us/organization/federal-acquisition-service/fas-initiatives/integrated-award-environment/iae-systems-information-kit/samgov-by-the-numbers)
- [SEC EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
- [Snowflake Marketplace paid listings pricing model](https://docs.snowflake.com/en/collaboration/provider-listings-pricing-model)
- [Dun & Bradstreet on Snowflake Marketplace](https://app.snowflake.com/marketplace/providers/GZT0ZPWB4FF/Dun%20&%20Bradstreet)
- [AWS Data Exchange pricing](https://aws.amazon.com/data-exchange/pricing/)
- [Sayari Graph platform](https://sayari.com/platform/)
- [Lookuptax homepage](https://lookuptax.com/)
