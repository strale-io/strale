# IT registry build-path verification memo
*Date: 2026-05-07. Spike branch: research/midrebuild-verify-spikes.*

## Chosen path on record
InfoCamere primary OR Openapi (resale addendum case 151296 pending) — dual-vendor mid-rebuild target after the registroimprese.it Browserless scraper was deactivated by DEC-20260427-I (transport-divergence finding).

## Source of record
DEC-20260427-I deactivation note in `auto-register.ts` reads "InfoCamere accessoallebanchedati per-certificate API (paid, not PAYG-friendly for bulk) or licensed multi-country aggregator." Memory line + prompt text identify Openapi as the alternative with case 151296 pending on resale scope.

## Verification probe
- Fetched Openapi product pages: `openapi.com/products/start-data-italian-company`, `openapi.com/products/italian-full-company`, plus `openapi.com/terms-conditions-openapi` (PDF-gated; ToS itself not in HTML).
- Web-searched `Openapi.com Italy company data API pricing` and `InfoCamere accessoallebanchedati pricing`.
- Fetched `infocamere.it` (corporate homepage; no API docs) and `accessoallebanchedati.registroimprese.it/abdo/en/api` (lists API products, no public pricing/onboarding detail).
- Did NOT request signup or sales-contact — research-only scope.

## Probe results

### Technical viability
- **Openapi:** REST, JSON, modern API (`console.openapi.com/apis/company/info`). Three tiers — `Start` / `Advanced` / `Full`. The deprecated `Imprese` API was sunsetted 2025-12-31; the current product is `Company`. Coverage scales with tier: Full advertises **1300+ data points** including directors ("Managers and any Auditors"), top-10 shareholders with ownership %, full financials with 2-year history, NACE/SIC/ATECO 2025 codes.
- **InfoCamere direct (`accessoallebanchedati`):** APIs exist for "Company details, Insolvency Reports, Directorship reports, Company registration reports, Annual accounts XBRL." No public PAYG pricing surfaced; the portal mentions Visa/Mastercard credit-card payment but that's per-document purchase via the web UI, not API integration. API integration onboarding is sales-mediated (InfoCamere quote model).

### ToS / licensing posture
- **Openapi:** Resale/sub-aggregation policy not in the HTML ToS page — full terms are PDF-gated at `legal.openapi.com/terms-and-conditions/term-and-condition-general-en.pdf`. Operator case **151296 (resale addendum, pending)** is the right channel to verify scope; cannot resolve from public web. Memory note says the addendum scope is "TULPS-bounded for IT, possibly broader for non-IT countries" — meaning Italian registry data may be restricted to TULPS-licensed Italian Subject Persons (anti-mafia / professional-ordini regime). If true, Strale (Swedish AB, not TULPS-licensed) would be blocked from reselling Italian company data via Openapi to non-Italian customers.
- **InfoCamere direct:** As the registry authority, no third-party ToS issue. License terms attach at the contract level. Italian Business Register is a public statutory register; data redistribution is generally permitted but subject to per-product licensing and (for some bulk products) attribution + ratelimit clauses.

### Pricing structure
- **Openapi `Start`:** subscriptions from **€0.015 + VAT per request**, 30 free calls/month at lowest tier; €0.05 + VAT per request via top-up.
- **Openapi `Advanced`:** subscriptions from **€0.03 + VAT per request**; €0.10 + VAT per request via top-up; 30 free calls/month.
- **Openapi `Full`:** subscriptions from **€0.099 + VAT per request**; €0.30 + VAT per request via top-up.
- **Self-serve, no agreement-gate.** PAYG-compatible.
- **InfoCamere direct:** opaque. Per-document pricing on the public web (visure storiche, etc.) is in the €5–€20 range per certificate, well above Strale's per-call price target. API-tier pricing not published.

### Coverage scope
- **Openapi Advanced (likely sweet spot for KYB Essentials):** PEC, REA number, legal form, ATECO, revenue, employee count, top-10 shareholders. Directors not explicit at Advanced tier — appear in Full only.
- **Openapi Full:** directors (managers + auditors), top-10 shareholders, balance sheet/income statement, 2-year history, NACE/SIC/ATECO. **UBO (titolare effettivo) not explicit** — Italy holds UBO in a separate register (Registro dei Titolari Effettivi at Camere di Commercio, mandated by D.Lgs. 231/2007 + DM 11.03.2022). Openapi Full coverage of UBO is unclear from public docs.
- **InfoCamere direct:** registry-authoritative scope (everything in the Business Register), but UBO is in the separate per-Camera UBO register; access there is restricted to Subject Persons under the same Wwft-equivalent regime (D.Lgs. 231/2007).

## Gotchas surfaced
1. **Resale addendum case 151296 is the gating decision.** If Openapi limits Italian-data resale to TULPS-licensed Italian Subject Persons, Strale's Swedish-AB-reselling-to-EU-AI-developers model is out of scope — and the build session must defer or restructure. The case should be tracked to closure before code work starts.
2. **Tier selection has economic impact.** Advanced (€0.03/call) covers most KYB Essentials needs but excludes directors. Full (€0.099/call) includes directors but is 3× the price — pushes Italian unit economics. Build session must pick: ship Advanced + flag "directors: null" limitation, OR ship Full at higher price, OR layer Full only on premium queries.
3. **Openapi data sourcing not publicly transparent.** Product pages reference "official data sources" but do not state "InfoCamere" explicitly. Likely InfoCamere downstream + augmentation from PEC registries / proprietary scraping. Provenance disclosure on Strale's side needs to be honest about the indirection: `acquisition_method: licensed_aggregator`, not `direct_api`. Per DEC-20260428-A Tier 2, this is permitted only if Openapi's vendor-of-vendor chain has documented redistribution rights — which is exactly what case 151296 should confirm.
4. **InfoCamere direct is not PAYG.** The deactivation note's parenthetical "paid, not PAYG-friendly for bulk" is correct. InfoCamere's web portal sells per-document certificates via Visa/Mastercard, but API integration is enterprise-tier with a quote-mediated onboarding. Not a self-serve fit at solo-founder scale.
5. **UBO is a separate animal in Italy.** Same structural issue as NL — UBO data sits in a Subject-Person-restricted register. Strale cannot serve it via either path until either (a) Strale becomes a Subject Person, or (b) a vendor with Subject-Person status sub-licenses it under contract. Out of v1 scope.
6. **VIES/PIVA self-derivation already exists in the deactivated executor.** `deriveVatIT` covers VAT computation from Codice Fiscale; that helper survives the rebuild and should be re-used.

## Backup paths
- **Plan A (recommended pending case 151296):** Openapi `Advanced` tier. €0.03 + VAT per call. KYB Essentials shape (excluding directors). 30 free calls/mo for testing. Ship behind `acquisition_method: licensed_aggregator` provenance with explicit `directors: null` limitation.
- **Plan A+ (if broader-scope queries justify cost):** Openapi `Full` tier. €0.099 + VAT per call. Includes directors + financials. Use only when query specifies extended-scope; otherwise Advanced.
- **Plan B (if case 151296 closes negative on resale):** Licensed multi-country aggregator with Italian coverage (Creditsafe, Bisnode/D&B, Experian, Kyckr) — bundles IT with NL/ES/PT decision (see those memos), not standalone.
- **Plan C (deferred):** InfoCamere direct API. Only viable when Strale's revenue justifies enterprise-tier integration. Cleanest provenance (`direct_api`), but pre-revenue cost is prohibitive.
- **Plan D (deferred):** Italian Business Register Open Data feed (`registroimprese.it/open-data`) if InfoCamere publishes a free-tier data product in 2026 — not currently confirmed; reactivation trigger only.

## Recommendation
**Ship with adjustments — chosen path's primary (InfoCamere) is non-viable at solo-founder scale; secondary (Openapi) is viable conditional on case 151296.**

Build session should:
1. Confirm case 151296 status before starting code. Resale addendum must permit non-Italian-Subject-Person resale of Italian Business Register data to international customers.
2. Default to Openapi `Advanced` tier for `italian-company-data` capability. Price the call at €0.05–€0.10 to cover the €0.03 + VAT cost + Strale margin.
3. Document `directors: null` and `ubo: not_provided` as explicit limitations.
4. Use `acquisition_method: licensed_aggregator` provenance with `upstream_vendor: Openapi.com` per DEC-20260428-A Tier 2 disclosure requirements.
5. Plan a follow-up `italian-company-data-extended` capability at €0.30+ later for queries needing directors + financials (Full tier).

## Open questions for build session
1. **Case 151296 resolution.** Is non-Italian-Subject-Person resale of Italian Business Register data permitted under Openapi's resale addendum? *Critical — gates the build.*
2. **Openapi's upstream-vendor disclosure.** Does Openapi publish or contractually disclose its upstream sources? Tier 2 doctrine requires `provenance.primary_source_reference` per fact. If Openapi can't provide per-record provenance back to InfoCamere/registry, Tier 2 compliance is at risk. *Critical.*
3. **UBO tier path.** Italian UBO is Subject-Person-restricted. The `italian-company-data` capability cannot include `ubo` on launch. Confirm this is acceptable for Counterparty Assurance v1 (mirroring the NL/DE pattern). *Important.*
4. **Tier selection.** Advanced vs. Full: does the v1 Italian buyer need directors enough to justify 3× price? Survey existing customer Italian queries (if any in production logs) before deciding. *Build-session decision.*
5. **Decide whether `italian-company-data` should call Openapi `Advanced` for cheap calls and fall back to `Full` for premium queries** (mirroring the planned `dutch-company-data-extract` separation). *Future scope, v2.*
6. **VAT-derivation helper survives the rebuild.** Re-use `deriveVatIT` from `lib/vat-derivation.js`. *Build-session check, low risk.*

## Budget consumption
**6 fetches** (4 WebFetch including 1 PDF-gated ToS that returned no terms; 2 WebSearch).
