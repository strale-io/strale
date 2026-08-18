# Hungary Registry — Build Path Verification Memo

**Date:** 2026-05-07
**Country:** HU (Hungary)
**Status:** Research only. No code, no manifest, no routing changes in scope.
**Predecessor:** [2026-05-06 live registry coverage audit](2026-05-06-live-registry-coverage-audit.md), DEC-20260507-A (gap-7).

## 1. Headline classification

**Tier 1 — NOT VIABLE at v1 economics.** No official Hungarian government API for programmatic registry access. The Ministry of Justice's `e-cegjegyzek.hu` portal offers free basic web search (HTML only) and paid extended access, but no machine-readable bulk data publication on any open-data portal surfaces during research. Cégközlöny (the Company Gazette) is a publication-event stream, not a structured registry feed.

**Tier 2 — VIABLE BUT FIXED-COST.** Two Hungarian-native commercial wrappers (companyapi.hu / WellData Kft., OPTEN) offer paid API access sourced primary from the Ministry of Justice OCCR register. companyapi.hu publishes pricing: 15,990–37,990 HUF/month (~€42–100/month subscription, no PAYG tier). OPTEN is enterprise/custom-priced (no public pricing).

**Recommendation: STAYS IN GAP at v1.** Tier-2 fixed-cost subscription at €42–100/month conflicts with DEC-20260506-G (no-fixed-cost stance) and DEC-20260507-D (no BYO-credentials). HU closes when one of: (a) the parallel Kyckr evaluation lands favourably and Kyckr's HU coverage is solid, (b) the Openapi gating decision (case 151296) clears with HU coverage, (c) a HU-native vendor with PAYG pricing surfaces, or (d) revenue justifies the fixed-cost subscription commitment.

## 2. API + data surface findings

### Path A — `e-cegjegyzek.hu` (Ministry of Justice, official)

- **Authority:** Igazságügyi Minisztérium Céginformációs Szolgálat (Ministry of Justice, Company Information Service).
- **Public URL:** `https://www.e-cegjegyzek.hu/` and `https://www.e-cegjegyzek.hu/?ceginformacio`
- **Free access:** HTML web search only — search by name, registration number (cégjegyzékszám), tax number (adószám). Returns basic company information.
- **Paid access:** "Accessing all further content is subject to a charge" (per EU e-Justice portal). Pricing not published; legacy reports indicate per-document charges via electronic-signature-gated access.
- **API:** **None published.** No open developer documentation; no machine-readable endpoint surfaces in research.
- **Tier classification:** Tier 1 web portal — HTML scraping forbidden under DEC-20260428-A. Excluded.

### Path B — Cégközlöny (Company Gazette)

- **URL:** `http://www.e-cegkozlony.gov.hu/` and `https://cegportal.im.gov.hu/frontend/cegkozlony`
- **What it is:** Official journal of the Ministry of Justice — publication channel for company-event notices (incorporation, dissolution, capital changes). Free.
- **Use case as registry source:** Not suitable. Cégközlöny is publication-event-stream, not a structured registry-state feed. Mirrors the LU RESA model.
- **Tier classification:** Free Tier-1 surface but doesn't meet the use case.

### Path C — companyapi.hu (WellData Kft. wrapper, paid subscription)

- **URL:** `https://companyapi.hu/`
- **Operator:** WellData Kft. — Hungarian commercial vendor.
- **Source data:** "Directly from the Hungarian Ministry of Justice's Company Information Service" — claimed primary-source provenance (verify in vendor agreement under DEC-20260428-A Tier-2 due diligence).
- **Pricing tiers (subscription, no PAYG):**
  - **Starter:** 15,990 HUF/month (~€42) — 1,000 requests
  - **Advanced:** 24,990 HUF/month (~€65) — 5,000 requests
  - **Pro:** 37,990 HUF/month (~€100) — 10,000 requests
  - All prices excl. VAT; custom high-volume pricing on request.
- **Field coverage:** Up to 32 fields per plan tier — company fundamentals (name, VAT, registry number, address), financial metrics (revenue, assets, equity), ownership/management, banking info, activity classifications.
- **Redistribution:** Not stated on public pricing page. Subject to vendor contract review under DEC-20260428-A Tier-2.
- **Tier classification:** **Tier 2 — fixed-cost subscription**. Conflicts with DEC-20260506-G unless escalated.

### Path D — OPTEN (commercial vendor)

- **URL:** `https://www.opten.hu/ceginformacios-szolgaltatasok?lang=en`
- **Operator:** OPTEN — Hungarian market-leader (520k companies, 420k individual entrepreneurs, 140k other organisations).
- **Source data:** OCCR (Ministry of Justice registry) + Cégközlöny supplements. Primary-source-clean.
- **API access:** Mentioned but custom — "Database consolidation (API, SOAP), data cleaning" as custom offering. No public PAYG pricing; quote-based.
- **Tier classification:** Tier 2 — likely enterprise / fixed-cost. Same gating as companyapi.hu.

### Path E — Tier 3 scraping of `e-cegjegyzek.hu`

- Forbidden under DEC-20260428-A. Excluded.

### Path F — National Public Data Portal of Hungary

- Listed at dataportals.org and dateno.io as Hungary's national open-data registry.
- **Confirmed in research:** No company-register dataset surfaces in search results. The portal aggregates metadata about state-managed registers but does not appear to publish a downloadable bulk dump of the company register itself.
- **Tier classification:** N/A — no usable dataset.

## 3. Per-field depth

| Field | e-cegjegyzek.hu (free portal) | companyapi.hu (paid) | OPTEN (paid) |
|---|---|---|---|
| Legal name | ✓ | ✓ | ✓ |
| Registration number (cégjegyzékszám) | ✓ | ✓ | ✓ |
| Tax number | ✓ | ✓ | ✓ |
| Status | ✓ | ✓ | ✓ |
| Registered address | ✓ | ✓ | ✓ |
| Legal form | ✓ | ✓ | ✓ |
| Incorporation date | basic | ✓ | ✓ |
| Officers / management | partial | ✓ | ✓ |
| Owners / shareholders | paid in portal | ✓ | ✓ |
| Financials | paid in portal | ✓ | ✓ |
| UBO | paid in portal | partial | ✓ |
| Risk ratings | — | — | ✓ |

Identity-tuple completeness: full via either commercial wrapper.

## 4. Pricing summary

- Free: e-cegjegyzek.hu basic search (HTML only — not usable for Strale).
- Tier-2 wrapper: companyapi.hu €42–100/month subscription (no PAYG); OPTEN enterprise.
- Tier-2 cross-EU candidates: Kyckr (parallel evaluation), Openapi (case 151296).

## 5. Redistribution

- Both companyapi.hu and OPTEN source from MoJ OCCR — primary-source provenance is plausibly clean (verify in any commercial agreement).
- Per DEC-20260428-A, Tier-2 use requires documented redistribution rights, indemnification, and per-fact primary-source provenance. Both Hungarian-native vendors are more likely to satisfy this than international aggregators.
- No CC-BY/CC-0 govt open-data license applies — there is no government-published open-data publication of the register to redistribute.

## 6. Freshness

- companyapi.hu and OPTEN both claim near-real-time MoJ sync (registry filing → vendor surface within hours-to-days). Verify in contract.
- Cégközlöny publishes daily as the official gazette but is event-stream, not state-feed.

## 7. Build effort estimate

- **Tier-2 wrapper integration (companyapi.hu):** **S (2–3 days)** once subscription is contracted. REST API, modern auth model expected.
- **Tier-2 wrapper integration (OPTEN):** **M (3–7 days)** — SOAP/REST custom integration; quote-and-contract gating slows the cycle.
- **Bulk-ingest path:** Not available — no open-data publication exists.

## 8. Recommendation

**Stays in gap at v1.** companyapi.hu's €42/month subscription floor is the cheapest entry point, but it's still a fixed-cost commitment under DEC-20260506-G — and at €0.05/call retail (Strale's mid-tier capability price) the break-even is ~840 HU calls per month before the subscription is cost-positive. Defer until either:

1. **Cross-EU aggregator clears.** Kyckr evaluation (`research/kyckr-evaluation`) or Openapi case 151296 — if either covers HU at PAYG economics, HU closes with zero HU-specific work.
2. **Volume-justified subscription.** Once HU call volume forecasts exceed the break-even, contract companyapi.hu directly.

**Do NOT scrape `e-cegjegyzek.hu`.** Tier 3 is rejected by doctrine.

NAV (sole traders register) is out of scope; revisit only if a HU build session lands and identity-tuple coverage from a wrapper proves insufficient for sole-trader entities.

## Sources

- [European e-Justice Portal — HU business registers](https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/hu_en) — confirms free basic portal access, paid extended access, no API/open-data mention.
- [companyapi.hu (WellData Kft.)](https://companyapi.hu/) — pricing tiers, field coverage, claimed MoJ primary-source provenance.
- [OPTEN — Company information services](https://www.opten.hu/ceginformacios-szolgaltatasok?lang=en) — market-leader scope, OCCR + Cégközlöny sourcing, custom API/SOAP available.
- [Igazságügyi Minisztérium Cégközlöny portal](https://cegportal.im.gov.hu/frontend/cegkozlony) — official gazette surface; event-stream, not registry-state feed.
- [`e-cegjegyzek.hu`](https://www.e-cegjegyzek.hu/) — official MoJ web portal; free basic search, paid extended, no API.
- [SmartLegal — How to access Hungarian company business data](http://smartlegal.hu/publication/how-to-access-the-business-data-of-a-hungarian-company) — third-party legal guide consistent with portal-and-wrapper model.
