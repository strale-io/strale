# NL registry build-path verification memo
*Date: 2026-05-07. Spike branch: research/midrebuild-verify-spikes.*

## Chosen path on record
Company.info pending — commercial Dutch B2B aggregator identified as the mid-rebuild target after the northdata.com scraper was deactivated by DEC-20260427-I-1.

## Source of record
Memory line "Company.info pending (commercial aggregator)"; DEC-20260427-I-1 reactivation trigger reads "licensed contract with KVK directly … or with a licensed multi-country aggregator (Creditsafe, Bisnode/Dun & Bradstreet, Experian)."

## Verification probe
- Fetched `https://www.company.info/` (404), `https://www.company.info/en` (404), `https://company.info` (302 → Keycloak login at `login.company.info`). Marketing/product/pricing surfaces not reachable from the public web — the bare domain is a customer-only login portal.
- Web-searched "company.info Netherlands API" + "B2B Enterprise KYB" — no public pricing surfaced; aggregator buyer-guides (Middesk, Trulioo, Ondato, GBG, iDenfy) cover Netherlands KYB but Company.info itself is not indexed with public PAYG pricing.
- Cross-checked KVK direct API as the doctrinally-cleanest alternative: `developers.kvk.nl/pricing` is publicly documented with self-serve subscription, and `developers.kvk.nl/documentation/basisprofiel-api` documents the response schema.

## Probe results

### Technical viability
- **Company.info:** customer-gated. Cannot evaluate response shape, rate limits, latency, or auth model without a sales conversation and (likely) signed agreement. Onboarding pre-revenue is plausibly disqualifying — no public PAYG tier surfaced.
- **KVK direct (alternative):** REST APIs published with documentation. `Zoeken` (search), `Basisprofiel` (entity lookup), `Vestigingsprofiel` (branch lookup), `Naamgeving` (trade-name lookup). Standard HTTPS + API key. EU egress (Netherlands).

### ToS / licensing posture
- **Company.info:** unknown (gated).
- **KVK direct:** government data source, official subscription product. Tier-1 doctrine (DEC-20260428-A) compliant — `acquisition_method: direct_api` against the registry authority itself, not a vendor.

### Pricing structure
- **Company.info:** opaque, almost certainly enterprise-priced + agreement-gated.
- **KVK direct:** **€6.40/month subscription + €0.02/query** for `Basisprofiel`/`Vestigingsprofiel`/`Naamgeving`; `Zoeken` is free per call. Mutatieservice (change-feed subscription) is a separate **€1,279/year**. The €0.02/query fits comfortably below Strale's typical company-data €0.05–€0.10 price point.

### Coverage scope
- **KVK Basisprofiel** documented coverage: company name, registration dates, trading names, SBI activity codes, RSIN, legal form (`rechtsvorm`), main location address, branch listings (with employee counts), websites under main branch.
- **NOT in Basisprofiel:** director names, UBO data, dissolved-entity history beyond current deregistration date, foreign branches.
- **UBO is in a separate KVK register** restricted under Dutch Wwft to "recognised institutions" (financial institutions, notaries, etc.). As of April 2026 KVK widened this for Wwft-covered + Sanctions Act-covered entities. **Strale is a Swedish AB providing data infrastructure; not Wwft-covered → no UBO access via KVK direct.** This is a structural limitation, not a vendor problem.
- **Sole proprietorships (eenmanszaak):** appear handled (Basisprofiel includes addresses for sole-trader registrations).

## Gotchas surfaced
1. **No director names from KVK Basisprofiel.** The Dutch CompanyData target shape (name, business_type, status, address, registration_number, directors) cannot be fully populated from the cheap KVK API. KVK has separate per-entity products (e.g. `Inzage uittreksel`) at higher cost that include statutory representatives — these are paid-per-extract, not subscription, and would push per-call cost into the €5–€7 range per the 2026 tariff list. For Counterparty Assurance v1, "directors: null" is acceptable; the limitations field needs to declare it.
2. **No UBO via KVK direct under Strale's current legal status.** UBO would require either Wwft accreditation (Strale isn't a financial institution; this is the wrong fit) or a licensed aggregator with an upstream UBO contract.
3. **Company.info is login-gated at the apex domain.** This is the strongest signal that it's an enterprise-sales motion, not a self-serve API. A spike against Company.info specifically would consume disproportionate fetches and not produce a usable PAYG path.
4. **KVK requires a monthly subscription floor (€6.40/mo)** — small but non-zero. Per DEC-20260506-G's "fixed monthly minimums are disqualifying" framing, €6.40/mo for direct registry access is below the threshold that would matter, but should be flagged in the build session for explicit acceptance.

## Backup paths
- **Plan A (recommended):** KVK direct API (`Basisprofiel` + `Zoeken`). Self-serve, €6.40/mo + €0.02/query, EU-hosted, doctrine-clean. Coverage gap: directors + UBO. Acceptable for Counterparty Assurance v1 with explicit limitation entries.
- **Plan B (if directors required):** Layer KVK `Inzage uittreksel` paid extract on top — per-extract cost (~€5+); only invoke when the customer query specifies director-data scope.
- **Plan C (if Plan A blocked):** Licensed multi-country aggregator with Dutch coverage — Creditsafe, Dun & Bradstreet, Experian, or Kyckr's Dutch source. Each requires sales engagement and likely commits to fixed monthly minimums; defers a Tier-2 evaluation until the aggregator decision is made for IT/ES/PT in parallel.
- **Plan D (deferred):** Company.info — only if a future enterprise sales motion makes the contract economics viable. Today, agreement-gated and pre-revenue-hostile.

## Recommendation
**Replace primary — chosen path is the wrong vendor.**

KVK direct beats Company.info on every axis that matters at solo-founder scale: self-serve registration, public pricing, no sales motion, doctrinally-cleanest provenance (`acquisition_method: direct_api` against the registry authority itself), EU-hosted. Company.info's only structural advantage would be richer coverage (directors + UBO bundled), but the moat for that data on the Dutch market is Wwft accreditation, which Strale doesn't have and shouldn't pursue.

The build session should ship `dutch-company-data` against KVK Basisprofiel + Zoeken, with explicit `limitations` entries for "directors not included" and "UBO requires Wwft-accredited institution status — not provided."

## Open questions for build session
1. **Confirm non-Dutch EU eligibility for KVK API subscription.** Public docs don't address foreign subscribers explicitly. Day-0 action: email `account@kvk.nl` with Strale's KvK-equivalent (Bolagsverket org-no for the Swedish AB) and ask whether self-serve subscription is open to a Swedish entity. Likely yes (it's a digital subscription product with EU-internal-market legal context), but should be confirmed before code work starts. *Critical.*
2. **Confirm KVK API key issuance timeline.** Self-serve usually ≤24h, but if it requires manual approval the build session should sequence a parallel signup. *Important.*
3. **Decide whether to layer `Inzage uittreksel` paid-extract for premium queries.** Out-of-scope for v1 build, but the manifest's `output_field_reliability` should classify `directors` as `rare` (not `common`) so the field doesn't show up in test assertions. *Build-session decision.*
4. **Decide whether to publish a separate paid `dutch-company-data-extract` capability** (uittreksel-grade) at €5–€7 once v1 ships. *Future scope, not v1.*
5. **Verify the UBO posture statement is consistent with how Strale already documents UBO limitations on other countries** — `*-company-data` capabilities elsewhere may quietly include partial directors/UBO via vendor data; the limitation language should match the pattern used in BE/FR/DE etc. *Build-session consistency check.*

## Budget consumption
**8 fetches** (5 WebFetch including 2 404s and 1 redirect-to-login; 2 WebSearch; 1 follow-up WebFetch on KVK developer-portal homepage).
