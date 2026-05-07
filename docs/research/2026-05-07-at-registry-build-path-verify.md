# AT registry build-path verification memo
*Date: 2026-05-07. Spike branch: research/midrebuild-verify-spikes.*

## Chosen path on record
Compass HF Data primary (full Firmenbuch coverage) + Openapi cheap-tier (basic identity lookup).

## Source of record
Memory line "Phase B-bis confirmed Openapi covers AT cheap-tier; Compass identified for full coverage." DEC-20260427-I-6 reactivation trigger reads "licensed contract with the Austrian Justizministerium for direct Firmenbuch API access, or a multi-country licensed aggregator."

## Verification probe
- Fetched `openapi.com/products/company-advanced-austria` for cheap-tier reconfirmation.
- Web-searched `Compass Austria HF Data Firmenbuch API pricing` for the full-coverage primary.
- Fetched `api.wirtschaftscompass.at/en/prices` and `/en/documentation` for HF Data direct.
- Did NOT request signups or sales contacts — research-only scope.

## Probe results

### Technical viability
- **Openapi Austria Start:** REST, JSON, **self-serve PAYG**. Coverage: name, VAT, LEI, tax ID (Steuernummer), company number (Firmenbuchnummer), activity status, registered office, GPS. **No directors, no shareholders.**
- **Openapi Austria Advanced:** REST, JSON, self-serve. Adds 40+ data points including financial statements (current + historical), revenue, profit, employees, NACE/SIC, contact details. **Directors NOT explicitly mentioned** in Advanced; same gap pattern as Openapi IT/ES/PT.
- **Compass / HF Data Wirtschafts-Compass API:** REST API with 9 modules (Business, Persons, Land Register, Resident Register, Insolvencies, Changelists, Compliance bundle, Archive, Additional). Bearer-token auth. **Sales-mediated issuance** ("Contact us or your Compass service administrator to get your token") — NOT self-serve API. Daily-updated; sources directly from Austria's Firmenbuch.
- **Compass HF Data "Easy" web tier:** has self-serve credit-card / PayPal / EPS payment, but for the web portal (firmenbuchgrundbuch.at), not the API.

### ToS / licensing posture
- **Openapi Austria:** same case-151296-class question as IT/ES/PT — full ToS PDF-gated, resale scope unconfirmed.
- **Compass HF Data:** licensed Firmenbuch reseller (largest Austrian clearing office, wholly-owned subsidiary of Compass-Verlag GmbH). General terms published at `compass.at/compass-v3/agb/agb-easy-hf-data.pdf` (effective 2026-01-20). Resale to a B2B SaaS like Strale would require a specific contract with HF Data — the bearer-token sales-mediated onboarding is the channel for that conversation.

### Pricing structure
- **Openapi Austria Start:** ~€0.05 + VAT/call (subscription) or €0.11 (single).
- **Openapi Austria Advanced:** higher tier; pricing on console.
- **Compass HF Data API:** **€0.10/call (historical)** to **€0.45/call (basic personal data)** + an **annual service fee** that depends on the customer tier. The annual minimum makes pre-revenue access economically painful — DEC-20260506-G's "fixed monthly minimums are disqualifying" framing applies here.
- **Compass HF Data "Easy" web:** retail per-document pricing (€2-€8/document range), not API-grade.

### Coverage scope
- **Openapi Austria Start:** identity + status + address + activity. No directors, no shareholders, no financials.
- **Openapi Austria Advanced:** + financials (revenue, profit, employees, balance-sheet history). Still no directors.
- **Compass HF Data Business API + Persons API:** **directors (active and former offices), shareholders (investments and supervisory roles), insolvencies, changes-feed, compliance bundle, dissolved-entity tracking.** Full Firmenbuch grade including UBO via the compliance module.
- **None of the Openapi tiers delivers KYB Essentials shape (with directors).** Compass HF Data does, but at a per-call price + annual fee that doesn't fit solo-founder economics today.

## Gotchas surfaced
1. **Compass HF Data is not self-serve and has an annual service fee.** This contradicts the simplest reading of the chosen path ("Compass primary"). For pre-revenue, Strale cannot economically engage Compass without a triggering customer requirement. The build session must NOT assume Compass is available without a sales conversation + contract.
2. **Openapi Austria coverage matches Openapi IT/ES/PT** — including the same gap on directors. The chosen path's framing of "Openapi cheap-tier" is correct, but the practical cap on coverage is the same as the other Openapi countries.
3. **The currently-active executor (`apps/api/src/capabilities/austrian-company-data.ts`) calls `firmenbuch.finapu.com`** — the FinAPU JSON wrapper that DEC-20260427-I-6 deactivated. This is well-documented; the executor is in DEACTIVATED in `auto-register.ts`. The build session must NOT inadvertently leave FinAPU code paths reachable.
4. **AT has the cleanest non-self-build option of all 5 mid-rebuild countries.** Compass HF Data is the proper-licensed-reseller path; the only obstacle is the annual fee + sales motion. Once a paying customer triggers AT data needs, Compass is the right answer. Until then, Openapi covers cheap-tier without the contract overhead.
5. **No Austrian-UBO scrape required** — Compass HF Data bundles UBO via its compliance module, which is the licensed-reseller path. Strale cannot fetch UBO from a free public source for AT.
6. **The deactivated executor's FN-derivation logic survives** — `findFn` regex + RECHTSFORM map are portable to a new executor.

## Backup paths
- **Plan A (recommended for v1):** Openapi Austria Start (~€0.05/call PAYG), pending resale confirmation (case-151296-class). Coverage: identity + status + address. Document `directors: null`, `shareholders: not_provided`, `financials: not_provided` as explicit limitations. **Drop Compass from v1.**
- **Plan A+ (if Austrian-buyer demand justifies):** Openapi Austria Advanced for queries needing financials.
- **Plan B (deferred — was the chosen primary):** Compass HF Data Business + Persons + Compliance API. Triggered when (a) a paying customer specifically needs Austrian directors/UBO/insolvencies, or (b) Strale's AT call volume justifies the annual service fee. Sales-mediated; allow 2-4 weeks for contract.
- **Plan C (deferred):** Multi-country licensed aggregator (Creditsafe, D&B, Kyckr) bundling AT with NL/IT/ES/PT — same cohort decision.
- **Plan D (deferred):** Direct Firmenbuch (Justizministerium / BMJ) — historically not a self-serve API; ediverse via authenticated lawyer/notary access. Not realistic at solo-founder scale.

## Recommendation
**Ship with adjustments — drop Compass from v1, default to Openapi.**

The chosen "Compass primary + Openapi cheap-tier" was the right framing **for a near-future state where Strale has paying customers needing AT directors/UBO**. Today (pre-revenue, solo-founder), Compass's annual service fee + sales motion makes it economically out of scope. Phase B-bis already confirmed Openapi covers AT cheap-tier — that's the v1 build target.

The build session should ship `austrian-company-data` against Openapi Austria Start, mirror the IT/ES/PT pattern, document the directors/UBO gap as a limitation, and explicitly mark Compass as a deferred Plan B with a clear reactivation trigger (first AT customer requesting directors-grade coverage).

This is identical posture to NL/IT/ES/PT under this memo cohort. The convergence is non-coincidental — the doctrine and economics drive the same outcome across Openapi-coverage countries.

## Open questions for build session
1. **Confirm Openapi resale addendum applies to Austria** — same case-151296-class question. *Critical — gates the build.*
2. **Reactivate or rewrite the executor** — FN-derivation regex + RECHTSFORM legal-form map survive; the FinAPU + WKO scraper paths must be deleted, not commented out. *Build-session implementation.*
3. **Document Compass as the explicit Plan B** in the manifest's `limitations` notes ("Director-grade Austrian data via Compass HF Data on customer request — separate engagement"). *Build-session communication.*
4. **VAT-derivation for Austria** — currently absent in `lib/vat-derivation.js`. AT VAT format is `ATU` + 8 digits, derivable from UID — confirm whether this should be added. *Build-session enhancement, low risk.*
5. **Price-point for `austrian-company-data`** — match IT/ES/PT at €0.10/call (Openapi cost €0.05–€0.11 + Strale margin)? Confirm the cohort price uniformity. *Build-session decision.*
6. **Coordinate with the broader IT/NL/ES/PT/AT bundled-aggregator decision** — if a multi-country aggregator (Plan C) gets selected for any of the cohort, AT should be evaluated for inclusion. *Cross-memo.*

## Budget consumption
**4 fetches** (3 WebFetch on Openapi + Compass; 1 WebSearch).
