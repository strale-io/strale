# US Topograph 14-state scout — v1 access viability

**Date:** 2026-05-15
**Scope:** 14 Topograph-listed states (CO, DE, FL, GA, IL, MA, MN, NV, NJ, NY, PA, TX, WA, WY) + SAM.gov federal entity registry.
**Method:** Direct HTTP probes against state SOS endpoints + web research per state for API docs / bulk-data / paid-only paths. No Strale capability calls. No Strale-vendor probes.
**Wallet cost:** €0.

---

## Headline verdict

Per the prompt's three-category scheme (free API / paid signup / scrape-only), the empirical reality is **four categories**:

1. **Free API** (2): NY, SAM.gov.
2. **Free bulk download** (4 + 1 overlap with NY): CO, FL, MA, WA. NY also qualifies via Socrata.
3. **Paid signup required** (8): DE, GA, IL, MN, NV, NJ, PA, WY.
4. **Mixed / partial-free** (1): TX (free Comptroller franchise-tax API; paid SOSDirect for full SOS records).

Every state offers a free *HTML search form* — but under DEC-20260428-A Strale doesn't operate scrapers, so HTML-form access is not a Tier-1 path. The relevant question is whether each state offers an *ingestion-friendly* free path (API or bulk).

**v1 ship-ability summary:**
- **Tier 1 direct (ship in v1, free path exists):** 7 of 15 — CO, FL, MA, NY, WA, TX (partial), SAM.gov.
- **Tier 2 via Cobalt (ship in v1 via aggregator):** 8 of 15 — DE, GA, IL, MN, NV, NJ, PA, WY.

This aligns with DEC-20260515-A's architecture (Tier 1 = direct, Tier 2 = Cobalt fallback). The Topograph blueprint's "14 documented direct-SOS states" assumption holds at the *documented-access* level but only ~half of the 14 are *free direct-API* states; the other half are paid-only and must go via Cobalt for v1.

---

## Per-state findings

### Colorado (CO)
- **Endpoint:** `https://www.coloradosos.gov/biz/BusinessEntityCriteriaExt.do` (HTML form). **Free bulk path:** `https://data.colorado.gov/Business/Business-Entities-in-Colorado/4ykn-tg5h` (Socrata, dataset `4ykn-tg5h`).
- **Access pattern:** **Free bulk download** via Colorado Information Marketplace (Socrata SODA API on data.colorado.gov).
- **Probe result:** Main SOS endpoint returned 200 + HTML form. Open data dataset documented via the state's data portal.
- **Coverage:** 1M+ records — name, address, agent, officers, status, type, creation date.
- **Directors in response:** Yes (per Socrata schema).
- **v1 recommendation:** **Ship Tier 1 direct (bulk-ingest pattern).** Same architectural shape as LV (data.gov.lv) and LT (data.gov.lt) — periodic CSV/SODA ingest, no HTML scraping. Build effort comparable to existing CKAN-based capabilities.

### Delaware (DE)
- **Endpoint:** `https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx` (HTML form).
- **Access pattern:** **Paid signup required.** No free API. No free bulk. Free web search returns only File Number + name (insufficient for KYB).
- **Probe result:** 200 + HTML form (46 KB). No documented public API endpoint.
- **Coverage:** Detailed entity data requires paid certificate orders or commercial subscription.
- **v1 recommendation:** **Cobalt Tier 2 only.** Delaware is one of the most-incorporated US states (corporate domicile capital), so Cobalt's catalog coverage of DE is essential for v1.

### Florida (FL)
- **Endpoint:** `https://search.sunbiz.org/Inquiry/CorporationSearch/` (HTML form, returned 403 to bare curl — likely WAF). **Free bulk path:** `https://dos.fl.gov/sunbiz/other-services/data-downloads/` (SFTP).
- **Access pattern:** **Free bulk download** via Sunbiz SFTP — fixed-length text files with daily event files + quarterly full snapshots. Free SFTP credentials issued on request.
- **Coverage:** Complete state corporation registry.
- **Directors in response:** Yes (per Sunbiz schema).
- **v1 recommendation:** **Ship Tier 1 direct (bulk-ingest pattern).** Sunbiz is the canonical free-bulk state in the US. SFTP credential workflow is the only setup cost.

### Georgia (GA)
- **Endpoint:** `https://ecorp.sos.ga.gov/BusinessSearch` (HTML form, 403 to bare curl).
- **Access pattern:** **Paid signup required.** No free API. Bulk data via GTA partnership: $500 one-time or $5,000/year for weekly extracts.
- **v1 recommendation:** **Cobalt Tier 2.** Defer paid GTA evaluation to v1.1+ unless GA-specific customer volume justifies the $5K/year.

### Illinois (IL)
- **Endpoint:** `https://apps.ilsos.gov/businessentitysearch/` (HTML form, 403 to bare curl).
- **Access pattern:** **Paid signup required.** Free web search is explicitly licensed for individual use only — bulk copying prohibited. 7-dataset paid bulk file sold under contract (free access only for academics/journalists/NGOs).
- **v1 recommendation:** **Cobalt Tier 2.** IL paid bulk is a contract negotiation, not appropriate v1 work.

### Massachusetts (MA)
- **Endpoint:** `https://corp.sec.state.ma.us/CorpWeb/CorpSearch/CorpSearch.aspx` (HTML form, returned 302 then timeout on probe). **Free bulk path:** `https://www.mass.gov/info-details/the-corporations-book` — Corporations Book + downloadable data files.
- **Access pattern:** **Free bulk download** (annual + periodic). Covers taxable MA entities. No real-time API.
- **Coverage:** Most of what KYB needs; freshness is the main limit (annual updates).
- **v1 recommendation:** **Ship Tier 1 direct (bulk-ingest pattern), disclose annual freshness.** Like SI, the source publishes on a slow cadence — disclose in capability limitations rather than promise live-fetch.

### Minnesota (MN)
- **Endpoint:** `https://mblsportal.sos.mn.gov/Business/Search` (HTML form, 200 on probe).
- **Access pattern:** **Paid signup required.** Active Business Data CSV via weekly order, $30/week for commercial (free for media/researchers/non-commercial).
- **v1 recommendation:** **Cobalt Tier 2.** MN paid-bulk is cheap ($30/week ≈ $1,500/year) and could be a v1.1+ candidate for upgrade from Cobalt-Tier-2 to direct ingest if customer volume justifies.

### Nevada (NV)
- **Endpoint:** `https://esos.nv.gov/EntitySearch/OnlineEntitySearch` (HTML form, 200 + small response — likely redirect to SilverFlume).
- **Access pattern:** **Paid signup required (ambiguous).** SilverFlume references an "API" + bulk entity search but access requires a non-public agreement with NV SOS / third-party developer. Not free public API.
- **v1 recommendation:** **Cobalt Tier 2.** Direct inquiry to NV SOS deferred to v1.1+ if NV-specific demand emerges.

### New Jersey (NJ)
- **Endpoint:** `https://www.njportal.com/DOR/BusinessNameSearch/Search` (HTML form, 200 on probe).
- **Access pattern:** **Paid signup required.** Free name search + entity browsing; structured data downloads (lists, abstracts, status reports) are pay-per-record. No API. No free bulk.
- **v1 recommendation:** **Cobalt Tier 2.**

### New York (NY)
- **Endpoint:** Public web inquiry at `https://apps.dos.ny.gov/publicInquiry/` (HTML form, returned 000/connection error on probe — likely Cloudflare). **Free API path:** `https://catalog.data.gov/dataset/corporations-and-other-entities-all-filings` via Socrata SODA on data.ny.gov.
- **Access pattern:** **Free API + bulk download** (Socrata SODA). Full filings + status-history + 30-day delta datasets all on data.ny.gov.
- **Coverage:** Cleanest US state for KYB ingestion. Real-time SODA REST API + downloadable CSV.
- **Directors in response:** Yes (Socrata schema).
- **v1 recommendation:** **Ship Tier 1 direct (Socrata API pattern).** Highest-priority v1 build — NY is the second-most-common US incorporation state after DE and Socrata API is straight Tier 1.

### Pennsylvania (PA)
- **Endpoint:** `https://file.dos.pa.gov/search/business` (HTML form, 403 on probe).
- **Access pattern:** **Paid signup required.** No API. Free per-entity HTML search only. Bulk lists via BCCO at $0.25/name — not a feasible bulk-ingest path at KYB scale.
- **v1 recommendation:** **Cobalt Tier 2.**

### Texas (TX)
- **Endpoint:** SOS at `https://direct.sos.state.tx.us/` (SOSDirect, paid $1/search). **Free API path:** `https://api-doc.comptroller.texas.gov/` (Texas Comptroller Franchise Tax Account Status — free, no auth).
- **Access pattern:** **Mixed.** Comptroller's CPA API is free + no-auth, covers franchise tax status + SOS file number + entity name. Full SOS officer/agent data only via paid SOSDirect.
- **Coverage:** Comptroller API gives entity verification + status — useful for sanctions screening + identity confirmation. Doesn't give officers/agents.
- **v1 recommendation:** **Ship Tier 1 direct for Comptroller API (limited fields). Pair with Cobalt Tier 2 for full SOS records.** This is the most architecturally interesting state — a partial direct path + Cobalt fallback for missing fields.

### Washington (WA)
- **Endpoint:** `https://ccfs.sos.wa.gov/` (HTML form, 200 on probe). **Free bulk path:** CCFS Advanced Search → CSV export.
- **Access pattern:** **Free bulk download** via CSV export from Advanced Search (no login required). No REST API.
- **Coverage:** Paginated bulk download — workable for ingestion without scraping the HTML form.
- **v1 recommendation:** **Ship Tier 1 direct (bulk-ingest pattern).** The Corporations Data Extract that historically existed has been retired; the Advanced Search CSV export is the supported path.

### Wyoming (WY)
- **Endpoint:** `https://wyobiz.wyo.gov/Business/FilingSearch.aspx` (HTML form, 200 on probe).
- **Access pattern:** **Paid signup required.** Free per-entity HTML search. Bulk via paid subscription only (pricing not published online — request via [Business Database Download form](https://sos.wyo.gov/Forms/Business/General/WYSOS-BusinessDatabaseDownload.pdf)).
- **v1 recommendation:** **Cobalt Tier 2.**

### SAM.gov (federal)
- **Endpoint:** `https://api.sam.gov/entity-information/v3/entities` (API endpoint, returned 404 on probe without auth — expected). **Docs:** `https://open.gsa.gov/api/entity-api/`.
- **Access pattern:** **Free API with mandatory API key.** Free public registration via sam.gov.
- **Coverage:** Federal Entity Management API. Public role: 10 req/day; system account with "Read Public": 1,000 req/day. System-account approval takes 1-4 weeks.
- **Directors in response:** SAM.gov returns POC (point-of-contact) info, not corporate-officers — different semantic field than EU directors.
- **v1 recommendation:** **Ship Tier 1 direct.** API key registration adds 1-4 weeks lead time — start the registration process now if v1 launch is within 6 weeks.

---

## Synthesis

### Free-API states (Tier 1 direct, ship in v1)

- **NY** — Socrata SODA API on data.ny.gov. Cleanest US state for KYB. Real-time. Build effort: ~1 day (similar to lv/lt-company-data).
- **SAM.gov** — Federal Entity Management API. Free key registration required (1-4 week lead time). Build effort: ~1 day after key arrives.

### Free bulk-download states (Tier 1 direct, ship in v1 via ingest-and-index)

- **CO** — Socrata SODA on data.colorado.gov. Similar pattern to NY.
- **FL** — Sunbiz SFTP bulk files. Requires SFTP credential request (free).
- **MA** — Corporations Book + data files via mass.gov. Slow refresh cadence (annual). Disclose freshness.
- **WA** — CCFS CSV export from Advanced Search. Paginated bulk download.
- **TX (Comptroller, partial)** — Franchise Tax CPA API free + no-auth. Limited field set vs full SOS records.

**Total Tier 1 direct candidates: 7 of 15.** Build effort: ~6-8 days for all (each takes ~1-1.5 days, can parallelise across multiple engineering streams).

### Paid-signup states (Cobalt Tier 2 for v1, evaluate paid signup for v1.1+)

- **DE** — Paid certificate orders / commercial subscription. **Critical: DE is the most-incorporated US state — Cobalt's DE coverage must be verified before v1.**
- **GA** — GTA partnership $500 one-time or $5K/year.
- **IL** — Contract-based bulk file (academic/journalist exemption only for free).
- **MN** — $30/week CSV (cheap upgrade candidate for v1.1+ if NJ volume materialises).
- **NV** — SilverFlume agreement-gated API. Direct inquiry deferred.
- **NJ** — Per-record paid downloads.
- **PA** — $0.25/name BCCO lists (not bulk-feasible).
- **WY** — Paid bulk subscription (pricing not published).

**Total Cobalt Tier 2 reliance: 8 of 15.** All routed through Cobalt for v1.

### Scrape-only states (Cobalt Tier 2 only for v1)

**None strict.** Every state offers either a free API, free bulk path, or paid-API path. The "scrape-only" category is empty by construction once DEC-20260428-A is applied: every HTML-form-only state with no API + no bulk falls into "paid-signup" (because Cobalt's paid tier IS the scrape-equivalent, just legally licensed).

### Blockers / further investigation needed

- **NV** — API existence is referenced in SilverFlume marketing but access mechanism is agreement-gated. Worth a direct inquiry to NV SOS *before* relying on Cobalt for NV in v1.
- **Cobalt's actual state coverage** — The Cobalt sign-up is still pending per Active Vendor Stack. Before v1 launch, verify Cobalt's catalog actually covers all 8 Tier-2 states (DE, GA, IL, MN, NV, NJ, PA, WY). If any are missing, that's a v1 launch gap.
- **MA freshness** — Annual update cadence may be too stale for KYB. Decision: ship with limitation-disclosed, or layer a real-time Cobalt fallback for fresh-filing scenarios?
- **TX Comptroller field gap** — The Comptroller API covers franchise-tax status + entity name but doesn't include officers/agents. Pair with Cobalt for full coverage, or accept the limitation in v1?

---

## v1 build queue implications

**Tier 1 direct capabilities to build for v1:** 7
- `us-ny-company-data` (Socrata SODA — highest priority, real-time + cleanest)
- `us-co-company-data` (Socrata SODA)
- `us-fl-company-data` (Sunbiz SFTP ingest)
- `us-ma-company-data` (data files ingest, slow refresh)
- `us-wa-company-data` (CCFS CSV bulk)
- `us-tx-company-data` (Comptroller CPA API, partial fields)
- `us-sam-entity` (SAM.gov v3 — federal, separate slug)

**States served via Cobalt orchestration for v1:** 8
- DE, GA, IL, MN, NV, NJ, PA, WY — all flow through a generic `us-cobalt-company-data` capability that takes a state code + entity identifier and proxies to Cobalt.

**Estimated total Tier 1 build effort:** ~8-12 person-days. NY + CO share a Socrata-SODA pattern (1-day each), FL + WA share a bulk-ingest pattern (1.5 days each), MA is bespoke (1 day), TX Comptroller is REST-API (1 day), SAM.gov is REST-API after key arrives (1 day).

**Cobalt coverage gap risk:** if Cobalt's catalog is missing any of DE/GA/IL/MN/NV/NJ/PA/WY, that's a v1 launch blocker. Verify before signing the Cobalt contract.

**Other US capabilities not in this scout's scope:** EINsearch, sec-api.io, Docket Alarm, CourtListener+RECAP — these are separate non-SOS US capabilities listed in the Active Vendor Stack. Their viability is a separate workstream.

---

## Open questions for chat

1. **Cobalt catalog coverage verification.** Before signing the Cobalt contract, confirm with their team that DE, GA, IL, MN, NV, NJ, PA, WY are all in their catalog with KYB-grade field coverage (status + officers + registered agent + formation date). If any are missing, that's a v1 launch decision point.
2. **SAM.gov API key registration timeline.** SAM.gov system-account approval takes 1-4 weeks. If v1 launch is <4 weeks away, start the registration NOW.
3. **TX Comptroller partial-fields decision.** TX Comptroller API gives franchise-tax status + entity verification but not officers/agents. Options for v1: (a) ship `us-tx-company-data` with the limitation disclosed, (b) ship Comptroller direct + Cobalt fallback for the missing fields, (c) skip direct and rely entirely on Cobalt. The cleanest is (b) but it doubles per-call cost — chat decides based on TX customer demand projection.
4. **MA freshness handling.** Annual bulk refresh may be too stale for some KYB scenarios. Same decision shape as TX — direct + Cobalt overlay, or accept the limitation.
5. **NV direct inquiry.** Worth a 30-minute email to NV SOS asking about API access terms. Could turn NV from Cobalt Tier 2 → Tier 1 direct if response is favourable. Deferred to v1.1+ unless chat wants to chase NV-specifically.
6. **The "scrape-only" category is empty under DEC-20260428-A.** Worth confirming with chat that this interpretation is right: every state with HTML-form-only access falls into "Cobalt Tier 2" rather than "blocked entirely." The implicit assumption is Cobalt is licensed to access these states legally on Strale's behalf. Verify this is consistent with Cobalt's actual ToS.

---

*Generated by Claude Code session 2026-05-15. Read-only investigation. Zero wallet spend (no Strale capability calls). Worktree: strale-research, branch `docs/us-topograph-scout-2026-05-15`. No code changes, no DB writes, no PR.*
