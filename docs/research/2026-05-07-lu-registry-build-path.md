# Luxembourg Registry — Build Path Verification Memo

**Date:** 2026-05-07
**Country:** LU (Luxembourg)
**Status:** Research only. No code, no manifest, no routing changes in scope.
**Predecessor:** [2026-05-06 live registry coverage audit](2026-05-06-live-registry-coverage-audit.md), DEC-20260507-A (gap-7).

## 1. Headline classification

**Tier 1 (free) — NOT VIABLE at v1 economics.** No free programmatic API; no open-data publication of the full register on `data.public.lu` or LNDS CKAN catalogue.

**Tier 1 (paid enterprise API) — POSSIBLE, BUT conflicts with DEC-20260506-G (no-fixed-cost).** LBR offers an API for "large professional users" / "fiduciaries / public authorities" / "high-volume usage" — paid model, public documentation limited. Pricing not published; commercial onboarding required. Tier-1 doctrine-clean (direct govt source) but the price-floor risk is real.

**Tier 2 — VIABLE.** Multiple commercial aggregators carry LU coverage with redistribution clauses (Kyckr, BvD/Orbis, Creditsafe, etc.) plus the cross-EU candidates evaluated in parallel spikes (Openapi cohort if LU is in their coverage; Kyckr per the dedicated `research/kyckr-evaluation` spike).

**Recommendation: STAYS IN GAP at v1. Revisit when (a) the parallel Kyckr evaluation finalises, OR (b) revenue justifies a direct LBR API contract, OR (c) a third-party EU-wide aggregator with LU + redistribution-clean ToS lands at PAYG economics.**

## 2. API + data surface findings

### Path A — LBR direct API (paid, enterprise-only)

- **Authority:** Luxembourg Business Registers (LBR), operating the Registre de Commerce et des Sociétés (RCS) and Registre des Bénéficiaires Effectifs (RBE).
- **Public URL:** `https://www.lbr.lu/`
- **Web portal (basic searches free):** `https://www.lbr.lu/mjrcs-web-front/`. HTML only. Free basic searches return name + RCS number + legal form + status; document downloads (statutes, annual accounts) free for some, paid for certified extracts. **No JSON/XML API surface on the public portal.** Scraping forbidden under DEC-20260428-A Tier-1 doctrine.
- **API existence:** Confirmed via [Kyckr Luxembourg Registry guide 2025/2026](https://www.kyckr.com/blog/luxembourg-registry-guide-2025) and [European e-Justice Portal LU page](https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/lu_en): "Large professional users, such as fiduciaries or public authorities, are invited to use API interfaces, designed for machine-to-machine mass data exchanges."
- **Public documentation:** None located on `lbr.lu`. Kyckr's guide explicitly notes "public documentation is limited."
- **Pricing:** Not published. Treated as commercial-tier with onboarding, by analogy to similar EU registries (NL KvK B2B, IT InfoCamere). Likely fixed-fee or volume-tiered subscription.
- **Tier classification:** **Tier 1** — direct govt source. Doctrine-clean if economics work.

### Path B — `data.public.lu` open data portal

- **URL:** `https://data.public.lu/en/`
- **Search performed (programmatic):** `?q=registre+commerce`. Page returns "2,566 datasets" total but the search-result listing was not extractable from the rendered page; manual inspection during research did not surface a full RCS company-register dump.
- **What's there for LU companies:** RESA (Recueil électronique des sociétés et associations) is the legal-gazette publication channel for incorporation and filing notices — it is **publication-event-stream**, not a structured registry-state feed. Not suitable as a primary identity provider.
- **Tier classification:** N/A — no usable dataset identified.

### Path C — LNDS CKAN data catalogue

- **URL:** `https://ckan.data.lnds.lu/`
- **What's there:** Federation/discovery layer over Luxembourg public-sector data. No RCS company-register dataset surfaced; consistent with the Kyckr guide's "no bulk download" position.

### Path D — Tier 3 scraping of the LBR public portal

- Forbidden under DEC-20260428-A. Excluded.

## 3. Per-field depth (best-case via paid Tier-1 API or Tier-2 vendor)

| Field | LBR portal (free HTML) | LBR API (enterprise) | Tier-2 vendor (typical) |
|---|---|---|---|
| Legal name | ✓ | ✓ | ✓ |
| RCS number | ✓ | ✓ | ✓ |
| Legal form | ✓ | ✓ | ✓ |
| Status (active/dissolved) | ✓ | ✓ | ✓ |
| Registered address | ✓ | ✓ | ✓ |
| Founding date | ✓ | ✓ | ✓ |
| Directors / legal representatives | ✓ (in extract) | ✓ | partial |
| Articles of association | ✓ (download) | ✓ | rare |
| Financials | ✓ (filed accounts) | ✓ | partial |
| UBO (RBE) | restricted access post-CJEU Nov 2022 | restricted access | restricted |

UBO/RBE access in the EU was tightened by the CJEU November 2022 ruling; LU implemented "legitimate interest" restrictions. RBE is out of scope for an identity-only v1.

## 4. Pricing

- **Free:** Basic web-portal searches; some document downloads.
- **Paid:** Certified extracts; API access (price not published, treated as enterprise-tier).
- **PAYG availability:** None confirmed. Likely fixed-fee subscription model.

## 5. Redistribution

- LBR ToS for the API not located in public sources; commercial agreement likely defines redistribution explicitly.
- `data.public.lu` content is CC0 by default — but no RCS dataset is published there, so this doesn't help.
- DEC-20260428-A Tier-2 path: any Tier-2 vendor used must carry documented redistribution rights from LBR; the gap-recovery synthesis flags this as a vendor-due-diligence gate.

## 6. Freshness

- LBR API (if accessed): real-time / near-real-time (registry filings reflected as filed).
- No bulk-feed cadence to evaluate (no bulk feed exists).

## 7. Build effort estimate

- **Tier-1 paid API path:** **L** (10–20+ days). Commercial onboarding to LBR (KYC, contract, possibly Luxembourg-resident business presence), API integration, schema mapping, and ongoing fixed-cost commitment. The "L" reflects business-side overhead more than engineering — LBR's API-onboarding pace for a non-LU entity is unknown and likely multi-week.
- **Tier-2 vendor wrapper:** **S–M** (2–5 days) once a vendor is selected and contracted. Engineering pattern matches existing wrappers (CBEAPI for BE, OpenRegister for DE).

## 8. Recommendation

**Stays in gap at v1.** Two cleaner paths exist, and both block on parallel work:

1. **Wait for the Kyckr evaluation** (`research/kyckr-evaluation`). If Kyckr's redistribution + economics clear, LU closes via Tier-2 with no LU-specific work.
2. **Wait for the Openapi gating decision** (case 151296). Openapi's coverage may include LU at PAYG economics; that would close LU + several other gap countries in one move.

If both fall through, escalate to a direct LBR API contract — but defer until revenue justifies the fixed-cost exposure (DEC-20260506-G).

**Do NOT build via scraping.** Tier 3 is rejected by doctrine.

## Sources

- [Kyckr — Luxembourg Registry Guide 2025/2026](https://www.kyckr.com/blog/luxembourg-registry-guide-2025) — pricing model, API existence, field-level coverage.
- [European e-Justice Portal — LU business registers](https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/lu_en) — official statement on API for large professional users.
- [Luxembourg Business Registers official site](https://www.lbr.lu/) and `https://www.lbr.lu/mjrcs-web-front/` — verified public web portal exists; no developer documentation surfaced.
- [Portail Open Data Luxembourg](https://data.public.lu/en/) — verified no RCS bulk dataset surfaced via `q=registre+commerce`.
- [LNDS CKAN data catalogue](https://ckan.data.lnds.lu/) — verified federation layer, no LBR/RCS dataset.
- [Topograph — Extrait RCS Luxembourg](https://www.topograph.co/guides/business-registers-in-luxembourg/extrait-rcs-luxembourg) — third-party guide consistent with Kyckr findings.
