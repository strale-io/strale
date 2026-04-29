---
date: 2026-04-29
session_intent: Resolve the three items flagged in the earlier Tier-1 handoff (IE maintenance_class, sync-script PII coverage, BE decision).
mode: Quick
---

# BE flagged-items resolution

Continuation of `2026-04-29-tier1-remediations-lv-lt-shipped-be-flagged.md`.
All three flagged items resolved.

## #1 IE maintenance_class — fixed
- `manifests/irish-company-data.yaml` had `maintenance_class:
  api-stable` (not in the orchestrator-gate enum). Aligned to
  `free-stable-api` to match LV/LT.
- DB synced via `sync-manifest-canonical-to-db.ts irish-company-data`.
- Commit: `6a62d3f`.

## #2 sync-manifest-canonical-to-db.ts — extended
- Added coverage for `processes_personal_data` (boolean) and
  `personal_data_categories` (text[]). The text[] OID (1009) is
  passed to `sql.array(...)` so postgres.js binds correctly.
- Verified on LV (already aligned, no drift) and LT (already aligned,
  no drift).
- Commit: `6a62d3f`.

## #3 BE decision — chose **(a) + (c)**
Per Petter's call: ship Tier-1 cleanup now (a) **and** scaffold the
licensed-bulk migration (c). Skipped (b) per the no-upfront-payment
preference.

### (a) shipped — commit `284a70b`
- Browserless fallback against `kbopub.economie.fgov.be` removed.
  CBEAPI.be is the sole path.
- Provenance now declares `acquisition_method: vendor_aggregation`,
  `upstream_vendor: cbeapi.be`, plus an explicit `source_note` flagging
  this as Tier-2 vendor-mediated with a queued migration to first-party
  KBO Open Data.
- Smoke 11/11 against AB InBev (KBO 0417497106). SQS 76.6.

### (c) scaffolded — `docs/research/2026-04-29-be-kbo-open-data-ingest-spec.md`
- Registration email drafted, ready for Petter to send to
  `kbo-bce-webservice@economie.fgov.be`.
- Architecture spec: 7-CSV → 7-table mapping with full DDL, daily SFTP
  flow, stale-data circuit breaker (DEC-20260428-B requirement),
  executor cutover plan.
- ~2 days of build work once SFTP credentials arrive.
- Did not pre-create empty TS files or migrations — the spec is the
  contract for the build.

## Petter to-dos out of this session
1. **Send the BE registration email** in the spec to
   `kbo-bce-webservice@economie.fgov.be`. Fill in the real Strale AB
   VAT before sending.
2. **Read the FPS Economy ToU when it arrives.** Flag any
   non-standard clauses (cache TTL, mandatory takedown windows, etc.)
   before signing.
3. **Provision Railway env vars** once SFTP credentials arrive:
   `KBO_SFTP_HOST`, `KBO_SFTP_USER`, `KBO_SFTP_PASSWORD` (or
   `KBO_SFTP_KEY_PATH`).
4. **Decide ingest hosting**: API process vs separate Railway worker.
   Spec leans toward separate worker for isolation.

## State of the Tier-1 country-registry track
| Country | Status | Path |
|---|---|---|
| IE | ✅ shipped | direct CRO Open Data CKAN API (CC-BY 4.0) |
| LV | ✅ shipped | direct data.gov.lv CKAN API (CC0 1.0) |
| LT | ✅ shipped | direct data.gov.lt Spinta API (CC-BY 4.0) |
| BE | 🟡 (a) shipped, (c) queued | CBEAPI Tier-2 now → FPS Economy KBO licensed-bulk |
| AT, DE, NL, IT, PT, ES | ⛔ deactivated | pending Topograph or licensed aggregator |
