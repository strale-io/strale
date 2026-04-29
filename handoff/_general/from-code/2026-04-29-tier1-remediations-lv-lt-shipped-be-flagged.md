---
date: 2026-04-29
session_intent: Continue shipping Tier-1 remediations (DEC-20260428-A) one country at a time; LV, BE, LT in scope.
mode: Full
---

# Tier-1 remediation: LV shipped, LT shipped, BE flagged

Continuation of the 2026-04-28 / 2026-04-29 Tier-1 remediation track. IE
(`irish-company-data`) shipped earlier in this session via the CRO Open
Data Portal CKAN API. Today's results below.

## Shipped

### Latvia — `latvian-company-data`
- **Commit:** `cfd2edb`
- **Before:** Browserless + Claude scrape of `info.ur.gov.lv` (Tier-1
  violation; `data_source_type: scrape`, `transparency_tag: ai_generated`).
- **After:** Direct call to the Latvian Open Data Portal CKAN
  `datastore_search` API against the *Uzņēmumu reģistra atvērtie dati*
  resource (`25e80bf3-f107-4ab4-89ef-251b5b9374e9`).
- **License:** CC0 1.0 — public domain, unrestricted commercial use. Better
  than IE's CC-BY 4.0 (no attribution requirement).
- **Coverage:** ~480k records. Daily refresh.
- **Provenance fields:** `acquisition_method: direct_api`, `source:
  data.gov.lv`, `license: CC0 1.0`, `attribution: Uzņēmumu reģistrs
  (Latvian Enterprise Register) — data.gov.lv`.
- **Output:** 13 structured fields including `company_name`, `reg_number`,
  `company_type` (Akciju sabiedrība etc.), `register_type` (Komercreģistrs
  etc.), `status`, `address`, `postal_index`, `registration_date`,
  `termination_date`, `sepa_creditor_id`, `atvk_code`, `jurisdiction`.
- **Verified:** Air Baltic Corporation AS, regcode `40003245752`. Smoke
  11/11. SQS 58.7 (rising as A-tier 6h schedule runs).
- **Pattern match:** Identical shape to IE CRO migration. Reusable.

### Lithuania — `lithuanian-company-data`
- **Commit:** `901bd09`
- **Before:** northdata.com aggregator scrape (Tier-1 violation per
  DEC-20260427-I-3 and DEC-20260428-A; capability was DEACTIVATED).
- **After:** Direct call to the Lithuanian Open Data Portal **Spinta**
  JSON API against the JAR (Juridinių asmenų registras) `iregistruoti`
  dataset, with classifier joins for legal form (`Forma`) and legal
  status (`Statusas`).
- **License:** CC-BY 4.0 — commercial reuse permitted with attribution.
- **Coverage:** ~480k legal entities (Lithuania), real-time.
- **Architecture wrinkle worth knowing:** Spinta uses RQL-style query
  functions (`eq(field,value)`, `contains(field,'text')`, `page('cursor')`)
  rather than CKAN's flat `?filters={}`. Pagination via base64 cursor
  in `_page.next`. The Forma + Statusas classifier datasets are small
  (~50 statuses, ~30 forms) — loaded once per process, cached 24h.
  Cold call ~770ms (with classifier load), warm ~25ms.
- **Provenance fields:** `acquisition_method: direct_api`, `source:
  data.gov.lt`, `license: CC-BY 4.0`, `attribution: VĮ Registrų centras
  (Lithuanian Centre of Registers) — Juridinių asmenų registras, via
  data.gov.lt`.
- **Output:** 12 structured fields including bilingual (LT/EN) legal
  form and status names, registration dates, and an `is_active` boolean.
- **Verified:** AB "Energijos skirstymo operatorius", ja_kodas
  `304151376`. Smoke 11/11. SQS 33.2 (rising).
- **Known limitation flagged in manifest:** Address is in a separate
  `buveines/Buveine` dataset keyed by legal-entity UUID, with a further
  join to the address registry. Not included in v1; documented as
  coverage limitation.

## Flagged for decision (not shipped)

### Belgium — `belgian-company-data`
- **Status:** still active in DB; primary path is `cbeapi.be` (third-party
  wrapper, API key set in env), with a Browserless scrape of
  `kbopub.economie.fgov.be` as fallback.
- **The Tier-1 issue:** the kbopub Browserless fallback. That should go.
- **The Tier-2 question:** `cbeapi.be` is a free third-party API that
  describes itself as "we are not making money with this service" with
  2500 req/day free tier. Their public docs return 403, so the actual
  ToS is unverifiable from outside. It may itself be re-publishing KBO
  open data without a clearly-licensed re-user agreement.
- **Official paths checked:**
  - **Belgian KBO Open Data** (`economie.fgov.be`): daily CSV downloads
    via SFTP, registration + ToU acceptance required (email
    `kbo-bce-webservice@economie.fgov.be`). No real-time API.
    *Building this is a meaningfully different architecture than IE/LV
    — daily ingest, indexed lookup service. Not a quick remediation.*
  - **CBE Public Search Web Service**: paid (€50 / 2000 requests).
    Authorization required. Not free-tier.
  - **`data.gov.be`**: returned 404/no relevant datasets in our probe.
    The Belgian portal does not appear to expose the BCE register via
    a CKAN datastore (unlike IE/LV/LT).
- **Recommended decision:** one of:
  1. Strip the Browserless fallback; keep `cbeapi.be`; mark provenance
     `acquisition_method: vendor_aggregation`, `upstream_vendor:
     cbeapi.be`. Add follow-up task to obtain CBEAPI's commercial-use
     ToS in writing. (Lowest-effort cleanup, ships measurable Tier-1
     improvement, leaves Tier-2 question open.)
  2. License the official CBE Public Search Web Service (€50 / 2000)
     and migrate. (Right answer; €25 fixed cost.)
  3. Build the KBO Open Data ingest pipeline. (Right answer for
     production scale; multi-day build.)
- **Why I didn't pick one:** option 1 silently changes the doctrine
  posture from "scrape + paid wrapper" to "paid wrapper + open
  question"; not a code change Petter approved in the original "yes,
  pls do" scope. Options 2 and 3 cost money or time outside this
  session's mandate.

## Doctrine notes / tooling that emerged
- `apps/api/scripts/sync-manifest-canonical-to-db.ts` (committed earlier
  this session) is the migration escape hatch for the authority-drift
  gate. Used today on both LV and LT. Reusable for the remaining
  registries.
- Pattern that's working: write executor → live-test with curl/tsx →
  rewrite manifest → run `sync-manifest-canonical-to-db.ts` →
  `onboard.ts --backfill --discover --fix --force` → activate → smoke
  → commit/push. Per-country wall time roughly 30-45 min including
  research.
- Encountered one cross-cap snag: the orchestrator authority gate
  rejects `maintenance_class: api-stable`; the valid enum is
  `free-stable-api | commercial-stable-api | pure-computation |
  scraping-stable-target | scraping-fragile-target |
  requires-domain-expertise`. Used `free-stable-api` for both LV and LT.
  IE's manifest may also have `api-stable` in it from earlier today —
  worth a quick consistency pass but not blocking.
- Found a pre-existing PII-categories issue in the authority gate: it
  treats `personal_data_categories` as a manifest-canonical field, so
  honest field reductions (LT now returns no address — dropped
  `address` from PII categories) require a direct SQL update because
  the sync script doesn't cover the array column. Quick win to extend
  `sync-manifest-canonical-to-db.ts` next time.

## Remaining Tier-1 backlog (per `auto-register.ts` deactivation list)
After IE, LV, LT, the active deactivated set is:
- `austrian-company-data` — needs licensed Firmenbuch contract
- `dutch-company-data` — needs licensed KVK or aggregator
- `german-company-data` — needs licensed Handelsregister or aggregator
- `italian-company-data` — needs licensed InfoCamere or aggregator
- `portuguese-company-data` — needs licensed PT registry or aggregator
- `spanish-company-data` — needs licensed ES registry or aggregator
- Plus various non-registry caps (`trustpilot-score`, `salary-benchmark`,
  `employer-review-summary`, `linkedin-url-validate`,
  `eu-court-case-search`).

None of the remaining EU registries have an obvious "free CKAN/Spinta
open-data API" parallel based on prior research. The path forward for
those is the Topograph / aggregator contract route (per the 2026-04-28
DEC-20260428-A planning).

## To-do follow-ups (Notion DB candidates)
1. BE `belgian-company-data` decision: option 1 vs licensed path.
2. Verify IE `irish-company-data` `maintenance_class` matches the new
   enum value (`api-stable` may have leaked through earlier today).
3. Extend `sync-manifest-canonical-to-db.ts` to cover
   `personal_data_categories` so the LT-style PII drift fix doesn't
   require a hand-written one-shot SQL update.
