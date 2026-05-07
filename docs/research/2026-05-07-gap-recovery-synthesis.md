# Gap-Recovery Candidates — Cross-Country Synthesis

**Date:** 2026-05-07
**Spike:** `research/gap-recovery-candidates`
**Per-country memos:**
- [LU](2026-05-07-lu-registry-build-path.md)
- [BG](2026-05-07-bg-registry-build-path.md)
- [CY](2026-05-07-cy-registry-build-path.md)
- [HU](2026-05-07-hu-registry-build-path.md)

## 1. Headline finding

**2 of 4 close as Tier-1 self-build candidates** (BG, CY). **2 stay in gap pending parallel work** (LU, HU). Of the gap-7 (per DEC-20260507-A), this spike removes BG and CY as build-eligible — provisional gap-5 if both BG and CY build sessions ship.

## 2. Per-country summary

| Country | Classification | Source | License | Effort | Recommendation |
|---|---|---|---|---|---|
| **BG** | Tier 1 — buildable | data.egov.bg BRRA XML open data | **CC-0** (public domain) | M (3–10 days) | **Build now.** Direct copy of BE KBO + RO ONRC bulk-ingest pattern. |
| **CY** | Tier 1 — buildable | data.gov.cy DRCOR open data | CC-BY (most likely; confirm at ingest) | M (3–10 days) | **Build now.** Smaller dataset (~250–300k entities); identity-tuple complete. |
| **LU** | Stays in gap | LBR API exists but enterprise/paid-only; no CC0 open-data publication | (commercial agreement) | L (10–20 days) | **Defer.** Wait for Kyckr eval / Openapi case 151296 / revenue-justified LBR contract. |
| **HU** | Stays in gap | No govt API; no open-data publication; only paid HU-native wrappers (companyapi.hu €42–100/mo subscription, OPTEN enterprise) | (commercial agreement) | S (subscription path) | **Defer.** Fixed-cost subscription violates DEC-20260506-G. Wait for Kyckr/Openapi or volume-justified contract. |

## 3. Priority ranking

1. **BG (highest)** — CC-0 license is the cleanest possible. Largest entity count of the buildable two (~1M companies). Build pattern already mature in the repo (BE KBO, RO ONRC). Single-country self-build with no vendor dependency.
2. **CY (second)** — Smaller dataset, simpler ingest. Apitalks wrapper available as same-day prototype bridge. License confirmation (CC-BY vs CC-0) is the only open data-quality question.
3. **LU (deferred)** — Highest single-country business value (financial hub, biggest ICP gap), but no doctrine-clean v1-economic path. Defer pending parallel work.
4. **HU (deferred)** — Closes only via Tier-2 vendor; cheapest option (companyapi.hu) is a fixed €42/mo floor. Defer pending Kyckr/Openapi.

**Build-session sequencing recommendation:** BG first (largest impact, cleanest license), then CY (second; lower complexity makes it good follow-up). Each build session ~M effort. Total to close BG + CY: ~6–20 days of capability work.

## 4. Notion follow-ups for chat

The following are flagged for chat to file post-spike. CC does not file Notion content directly per session governance.

### Decision candidates

- **DEC-20260507-?: BG defaults to data.egov.bg BRRA XML open data as primary identity provider.** Tier 1 (DEC-20260428-A compliant), CC-0 license, self-build via existing BE KBO bulk-ingest pattern. Estimated effort M.
- **DEC-20260507-?: CY defaults to data.gov.cy DRCOR open data as primary identity provider.** Tier 1, license-CC-BY-likely (confirm at ingest), self-build via bulk-ingest pattern.
- **DEC-20260507-?: LU and HU remain in gap pending parallel vendor evaluation.** Specifically: HU is gated on Kyckr eval AND Openapi case 151296; LU is gated on those two PLUS the option of a direct LBR API contract once revenue justifies it.

### To-do candidates (file in To-do DB)

- **bg-company-data — bulk ingest from data.egov.bg.** M effort. Pattern: BE KBO ingest. Reuse `governmentbg/brra-opendata` GitHub repo as schema reference.
- **cy-company-data — bulk ingest from data.gov.cy.** M effort. Pattern: data.gov.cy CKAN download; small dataset.
- **(deferred) LU and HU coverage** — re-evaluate when Kyckr eval lands AND/OR Openapi case 151296 clears.

### Active Vendor Stack updates

- Add `data.egov.bg` (Bulgaria Registry Agency BRRA) as primary provider for BG company-data. License: CC-0. Format: XML.
- Add `data.gov.cy` (Cyprus DRCOR) as primary provider for CY company-data. License: CC-BY (confirm at ingest). Format: CSV (likely).
- Note `companyapi.hu` (WellData Kft.) and OPTEN as candidate Tier-2 fallbacks for HU pending future evaluation.
- Note LBR enterprise API as candidate Tier-1 fallback for LU pending revenue-justified contract.

### Coverage Matrix updates

- BG: gap → buildable (planned).
- CY: gap → buildable (planned).
- LU: stays in gap; annotate "deferred pending Kyckr/Openapi/contract."
- HU: stays in gap; annotate "deferred pending Kyckr/Openapi/volume-justified subscription."
- Gap-7 → gap-5 once BG and CY ship; gap-7 → provisional-gap-5 status when this synthesis is filed.

## 5. Doctrine notes

### Tier-1 / Tier-2 / Tier-3 classification calls

- **BG:** Unambiguous Tier 1. CC-0 govt-published structured XML, doctrine model case.
- **CY:** Unambiguous Tier 1 for data.gov.cy direct ingest. The Apitalks wrapper option was considered Tier 1 (data is govt open data) wrapped by a third-party with a free-tier sustainability question — the synthesis recommends direct ingest for production despite the wrapper being usable as a prototype.
- **LU:** Tier 1 paid-enterprise API exists. The classification "stays in gap" is purely an economics call (DEC-20260506-G no-fixed-cost), not a doctrine call. If revenue conditions change, LU is a doctrine-clean Tier-1 build.
- **HU:** No govt-published machine-readable surface. Tier-2 wrappers source primary from MoJ OCCR — primary-source provenance is plausibly clean (DEC-20260428-A Tier-2 compliant) but the fixed-cost gate keeps HU deferred.

### Close calls / scraping rejections

- All four countries have HTML web portals that would have been scraping candidates pre-DEC-20260428-A. All four are excluded under Tier-1 doctrine. No close calls — the doctrine cleanly rejects each.

## 6. Open questions

1. **CY license string.** data.gov.cy default is CC-BY but the specific DRCOR dataset's license was not directly extracted in this spike. Confirm at ingest start before deciding attribution-block design.
2. **CY update cadence.** Not surfaced in research. Assume monthly until verified at ingest.
3. **BG UBO field coverage in the open-data XML.** OpenCorporates' 2018 ingest predates the CJEU November 2022 UBO-restriction ruling. Whether the data.egov.bg publication still includes UBO post-CJEU needs confirmation at ingest start. Identity-tuple v1 is not blocked either way.
4. **LU LBR API pricing.** Not published. Direct contact would be needed to size the fixed-cost commitment for a future revenue-justified evaluation.
5. **Kyckr's HU and LU coverage.** Sits in the parallel `research/kyckr-evaluation` spike — synthesis there will clarify whether either country closes via Kyckr.
6. **Openapi case 151296.** External gating event; affects HU and LU closure paths.

## 7. Inventory of fetches used in this spike

13 web fetches and 6 web searches (well within the 20-fetch budget). Per-country breakdown:
- LU: 2 searches + 3 fetches
- BG: 2 searches + 2 fetches (1 dataset fetch returned 403; OpenCorporates blog and search results provided sufficient corroboration)
- CY: 2 searches + 4 fetches (1 fetch returned 404; 1 fetch on the data.gov.cy dataset listing was inconclusive — Apitalks page was the load-bearing source for field coverage)
- HU: 2 searches + 3 fetches

Two unreachable fetches (data.egov.bg dataset detail pages 403; data.gov.cy organisation-filter URL 404) did not block the analysis — search-result snippets and corroborating third-party sources covered the gap.
