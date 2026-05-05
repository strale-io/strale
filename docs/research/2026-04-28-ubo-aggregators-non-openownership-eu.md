# UBO Aggregator Research — Non-OpenOwnership EU Gap

**Date:** 2026-04-28
**Author:** Code session (Claude Opus 4.7)
**Audience:** Petter, Strale, Payee Assurance v1.1
**Question:** Is there a Tier-2-compliant, PAYG, embed-and-bill path for Strale to expose UBO data in DE, FR, NL, ES, IT, BE, AT, IE (the eight EU jurisdictions not covered by free OpenOwnership / Companies House PSC / CVR)?

**Verdict (TL;DR):** No. Every commercial aggregator with credible coverage of those eight registries either (a) explicitly prohibits redistribution / reselling / sublicensing in standard terms, (b) requires the end-user to be the obliged entity with the legitimate interest (so Strale cannot pass the basis through), or (c) is enterprise-only with $20k–$100k+/yr minimums. The single PAYG-with-reseller-rights vendor I found (OpenSanctions) does not cover those countries on the UBO axis. Recommend Strale ship v1.1 with **partial UBO coverage + transparent gap disclosure in the API** rather than buy a vendor seat that breaks doctrine or burns the cost ceiling.

---

## 1. Vendor table

| Vendor | EU coverage (gap-8) | Stated legal basis | Per-call rate | Monthly min / setup | Embed/resell rights | Tier-2 fit | Verdict |
|---|---|---|---|---|---|---|---|
| **kompany (Moody's)** | DE, FR, AT, IE confirmed; NL/BE/ES/IT partial | Operates as obliged-entity-grade access; downstream customer must be obliged entity | Quote-gated (low conf.) | Quote-gated; brochure suggests enterprise tiers | **Prohibited.** ToS: "no portion … may be copied, reproduced, repackaged, retransmitted, sold, transferred, redistributed … internal use only." | **No** | Reject — ToS bars Strale's use case |
| **Creditsafe Connect** | DE, FR, NL, ES, IT, BE, AT, IE all covered in catalog | Customer must self-certify legitimate interest per Section 14.1 | Quote-gated (low conf.) | Enterprise contract; no public PAYG | **Prohibited.** Section 5.3: "may not sell, transfer, distribute, sublicense, commercially exploit." Section 5.2: "solely for Customer's own internal use." Section 14.2: customer warrants permitted-purpose use only. | **No** | Reject — explicit internal-use-only + LI is customer's, not Strale's |
| **Bureau van Dijk / Orbis (Moody's)** | All 8, deepest UBO graph in market | Same Moody's ToS family as kompany | $20k–$40k/yr entry; full global ~$100k+/yr (Global Database 2026 review, medium conf.) | 12-month commit | Restrictive licensing; derivative-product rights extra | **No** | Reject — fixed cost + ToS |
| **Sayari Graph** | All 8 (multi-source: registries + leaks + filings) | Investigative/analyst posture; legal basis depends on source mix | "From $50k/yr single enterprise license" (Global Database 2026, medium conf.) | API credit model, contract-based | Reseller rights not in standard terms; "designed for analysts and investigators, not automated KYB flows" | **No** | Reject — fixed cost + analyst tool, not embed-friendly |
| **Kyckr** | DE/AT/FR/IE/NL: all behind LI gate, Kyckr's own LI status not publicized | Acts as agent for the customer's LI claim (per their 2026 EU access guide); does not assert its own LI as basis to resell | No public pricing (low conf.) | Quote-gated | Not a documented reseller model; arrangement is per-customer LI assertion | **No** | Reject — LI must originate with end-user, not Strale |
| **CompanyData.com** | Claims "nearly 200 jurisdictions"; specific gap-8 coverage not enumerated on UBO page | Vague: "in some cases, full UBO details can only be accessed through local accountants or lawyers who have permission to query restricted government systems." | "Pricing based on number of UBO checks" — quote-gated (low conf.) | 14-day free trial (1,000 UBO checks), "qualified businesses" only | Not addressed in public terms | **No** (unverified) | Reject — opaque legal basis, redistribution silence = redistribution probably not granted |
| **North Data** | DE-focused (also AT/CH/LI/LU/MC + 24 EU states); UBO via Transparenzregister gateway | Customer must hold own Transparenzregister credentials — N. Data brokers the request, the LI is the customer's | API: €500–€1,500/mo + per-request (€0.05–0.10 over 5k included); Transparenzregister gov fee passed through to customer | 12-month minimum commitment | **Prohibited for export contracts:** "use of data is contractually limited (no resale)." API redistribution to downstream paid API consumers not granted. | **No** | Reject — fixed monthly cost + no resale + LI stays with customer |
| **D&B Direct+ / findUBO** | Global incl. all gap-8 | Partner-feed mix; obliged-entity model | $30–$200 per company report, contracts $20k+/yr | Annual contract typical | Restrictive licensing per public 2026 reviews | **No** | Reject — same structural issue as Moody's |
| **OpenSanctions (OpenScreening)** | UBO enrichers list: UK, Cyprus, Czech Republic, Estonia, Georgia, Latvia, Moldova, BiH. **Gap-8 NOT covered.** | Open-licence aggregation (CC-BY-NC for free tier; commercial license for resale) | API self-serve PAYG; bulk Reseller/OEM "flat-rate, large-volume" tier — exact figures quote-gated | Self-serve signup for API | **YES — explicit Reseller/OEM license:** "Build APIs, software solutions and data products using the database … include their graph in your own data products." | **Yes** | Use only where coverage exists — does NOT solve the gap-8 question |
| **GLEIF Level 2 ("Who Owns Whom")** | Global, all gap-8 jurisdictions where parent has an LEI | Free, open data; CC0-equivalent | **Free** | None | **Open** — fully redistributable | **Yes** | Useful as supplement: gives accounting-consolidating-parent for LEI holders only — sparse coverage of small/private EU companies |

Notes on confidence:
- Pricing for kompany, Creditsafe, Sayari, Kyckr, CompanyData.com, BvD: **low confidence** on exact figures because all are quote-gated. The Global Database 2026 comparison is the most cited public source for BvD ($20–40k entry) and Sayari ($50k entry), reviewed for two years and consistent across rewrites.
- North Data figures are **high confidence** — pulled directly from northdata.com/_data 2026-04-28.
- Creditsafe and kompany ToS clauses are **high confidence** verbatim quotes from their public terms pages 2026-04-28.

---

## 2. Legal-basis analysis

The CJEU ruling in C-37/20 (22 Nov 2022) struck down the AMLD5 public-access regime for UBO registries. AMLD6 (transposition deadline 10 July 2026) re-establishes a "legitimate interest" access category but does not create a generic redistribution right. Each Member State now answers individually whether a person/firm qualifies. Practical state of the gap-8 as of 2026-04-28:

- **DE Transparenzregister:** national authorities, AML-obliged entities, and applicants who file a per-request LI claim. North Data brokers the request via the customer's own Transparenzregister credentials.
- **FR Registre des Bénéficiaires Effectifs (RBE):** LI access for non-EU obliged entities; EU obliged entities have direct access; non-obliged commercial firms have no path.
- **NL UBO-register:** restricted to national authorities and Dutch obliged entities. Worst-case jurisdiction in the gap-8.
- **ES, IT, BE, AT, IE:** all LI-gated, case-by-case, slow.

The two practical legal-basis architectures vendors use:

**Architecture A — vendor IS the obliged entity, Strale would NOT be.** Moody's/kompany, BvD, D&B, Creditsafe operate under their own AML obligations (or under bulk data-licensing agreements with national registries). They do not pass legitimate interest through to non-obliged downstream customers; their ToS reflects that by prohibiting redistribution / sublicensing / "internal use only." Even if Strale paid the enterprise rate, the data could not be re-served via Strale's own API to Strale's paying customers without a separate (and substantially different) reseller agreement that none of these vendors publish.

**Architecture B — vendor brokers the customer's own LI claim.** Kyckr, North Data, and (by their wording) CompanyData.com structurally route the request as the customer's own LI assertion. The customer holds the credentials or signs the LI declaration; the vendor is a technical intermediary. This breaks Strale's pass-through model: Strale's customer would have to file their own LI, and Strale could not deliver UBO data sight-unseen via API at the moment of the call. This is fundamentally incompatible with the "agent calls Strale, Strale returns the answer" pattern.

Architecture B is also where DEC-20260428-A's Tier-2 conditions ("vendor has documented redistribution rights + indemnification") would fail: the redistribution right doesn't exist in Architecture B, because the vendor isn't redistributing — the *customer* is performing the access.

The single architecture that *does* support embed-and-bill — open-licence aggregation (OpenSanctions Reseller/OEM, GLEIF Level 2) — has UBO coverage that does not include the gap-8. OpenSanctions enrichers list confirms (FAQ 35, retrieved 2026-04-28): UK PSC, Cyprus, Czech Republic, Estonia, Georgia, Latvia, Moldova, BiH. Germany/France/NL/Spain/Italy/Belgium/Austria/Ireland are absent from OpenSanctions UBO sourcing.

---

## 3. Honest assessment

**There is no PAYG, Tier-2-compliant, embed-and-bill path to UBO data in DE/FR/NL/ES/IT/BE/AT/IE that meets all of Strale's filters as of April 2026.** The structural reason is upstream of vendor pricing or vendor cooperation: the AMLD5/AMLD6 regime treats UBO data as personal data with restricted lawful bases, and every commercial aggregator has built their licensing terms around that fact. Reselling EU UBO data via an open-API-with-payment-IS-the-auth model (which is x402 / Strale's posture) does not have a clean legal basis under any vendor's standard ToS.

The realistic options for Payee Assurance v1.1:

1. **Ship with partial UBO coverage and transparent gap disclosure (RECOMMENDED).** Continue to use UK PSC, OpenOwnership, Danish CVR, and add OpenSanctions UBO enrichment for the seven open jurisdictions it covers (UK/CY/CZ/EE/GE/LV/MD/BiH) under their Reseller/OEM license. For the gap-8, the API returns a structured `ubo_coverage_status: "restricted_jurisdiction"` with a `legal_basis_required: "AMLD6 legitimate interest — Strale does not hold this; customer must obtain directly"` field. This is honest, doctrine-aligned, and auditable. It also makes Strale's transparency posture a feature: every other vendor in this market silently pretends to have coverage they don't actually have a clean redistribution right for.

2. **GLEIF Level 2 supplement (CHEAP, additive, ship anyway).** GLEIF "Who Owns Whom" is free, fully redistributable, and gives accounting-consolidating direct + ultimate parent for any company that has an LEI. Coverage is sparse for small private EU companies but excellent for regulated financial entities and most listed groups. Adding this is one capability + zero recurring cost and improves UBO coverage *somewhere* in all gap-8 jurisdictions. This should ship regardless of the path chosen above.

3. **Become the obliged entity (NOT RECOMMENDED).** Strale registering as an EU AML-obliged entity (e.g., via a regulated subsidiary) would unlock direct LI access in several jurisdictions, but it imports an entire compliance program (transaction monitoring, SAR filing, supervisor reporting) that is incompatible with a 1-person bootstrap and contradicts the "Strale never operates scrapers / Strale is infrastructure" positioning. Off the table for v1.1.

4. **Per-customer LI relay (DEFER).** A future architecture where Strale's customer provides their own Transparenzregister/RBE credentials that Strale uses on their behalf is a possible v1.2+ feature for obliged-entity customers, but requires per-customer onboarding (KYC of the *customer*) and is not a fit for the open API / x402 model.

**Recommended next action:** add a "UBO coverage matrix" to the Payee Assurance v1.1 docs that lists each jurisdiction with its legal-basis status and source. Frame the gap-8 as "data not legally available to non-obliged entities under AMLD6" rather than "we don't have this data." This is both true and a defensible competitive position — Strale is the platform that tells you *why* a fact is missing, not the one that quietly fabricates coverage.

---

## Sources

- [Moody's kompany UBO Discovery](https://www.moodys.com/web/en/us/kyc/products/kompany/ubo-discovery.html)
- [kompany KYC API legal terms (verbatim "no portion … may be copied, reproduced, repackaged, retransmitted, sold, transferred, redistributed … internal use only")](https://www.kompany.com/kycapi) — retrieved via Moody's terms-of-use search 2026-04-28
- [Creditsafe General Terms and Conditions, Sections 5.2, 5.3, 14.1, 14.2](https://www.creditsafe.com/us/en/product/terms/general-terms-and-conditions.html)
- [Creditsafe Connect API overview](https://www.creditsafe.com/us/en/enterprise/integrations/company-data-api.html)
- [Kyckr — EU UBO Register Access for Obliged Entities, 2026 guide](https://www.kyckr.com/blog/eu-ubo-register-access-for-obliged-entities-2025)
- [North Data — Data Services pricing and terms (€500–€1,500/mo, 5k included req, "no resale")](https://www.northdata.com/_data)
- [CompanyData.com UBO Registry](https://companydata.com/ubo-registry/)
- [Sayari Graph platform overview](https://sayari.com/platform/)
- [Sayari Graph 2026 pricing review (Global Database)](https://www.globaldatabase.com/sayari-alternatives-in-2025-top-platforms-for-ubo-discovery-and-risk-intelligence)
- [Bureau van Dijk / Orbis pricing review (Global Database 2026)](https://www.globaldatabase.com/bureau-van-dijk-orbis-competitors-top-12-alternatives-for-2025)
- [OpenSanctions licensing tiers (Internal / Financial / Reseller-OEM)](https://www.opensanctions.org/licensing/)
- [OpenSanctions FAQ 35 — beneficial ownership data (UBO enricher coverage list)](https://www.opensanctions.org/faq/35/beneficial-ownership/)
- [Open Ownership Register](https://register.openownership.org/)
- [GLEIF — Level 2 Data: Who Owns Whom (free, open)](https://www.gleif.org/en/lei-data/access-and-use-lei-data/level-2-data-who-owns-whom)
- [GLEIF API documentation](https://www.gleif.org/en/lei-data/gleif-api)
- [NautaDutilh — No longer public access to UBO data without legitimate interest (CJEU C-37/20 analysis)](https://www.nautadutilh.com/en/insights/no-longer-public-access-to-ubo-data-without-legitimate-interest/)
- [Transparency International — Countdown to new EU beneficial ownership rules](https://www.transparency.org/en/news/countdown-to-new-eu-beneficial-ownership-rules)
- [Top 7 UBO Data Providers 2026 head-to-head (Global Database)](https://www.globaldatabase.com/top-7-ubo-data-providers-for-2025-a-head-to-head-comparison)
- [German Transparenzregister overview (Taylor Wessing)](https://www.taylorwessing.com/en/insights-and-events/insights/2023/03/german-transparency-register)
- [Veriff acquires Vespia (2026)](https://vespia.io/blog/veriff-is-acquiring-vespia)
