---
date: 2026-04-29
session_intent: Close out the long Tier-1 remediation session — ship more registries while waiting on FPS Economy + Topograph, decide BE strategy, then sync all registry state to Notion + local memory.
mode: Full
---

# Tier-1 remediation session close + Notion/memory sync

This was a long, multi-phase session. Earlier-session commits (IE/LV/LT/BE-(a)) and BE (c) scaffolding are documented in `2026-04-29-tier1-remediations-lv-lt-shipped-be-flagged.md` and `2026-04-29-be-flagged-items-resolved.md`. This file covers the rest of the day plus the close.

## Shipped today (full session, in order)

| # | What | Commit | Notes |
|---|---|---|---|
| 1 | IE — `irish-company-data` migrated to CRO Open Data CKAN | (earlier session) | Tier-1 fix; CC-BY 4.0 |
| 2 | LV — `latvian-company-data` migrated to data.gov.lv CKAN | `cfd2edb` | Tier-1 fix; CC0 1.0 |
| 3 | LT — `lithuanian-company-data` migrated to data.gov.lt Spinta | `901bd09` | Tier-1 fix; CC-BY 4.0; classifier cache |
| 4 | Tier-1 remediation handoff doc | `71c3486` | First-half summary |
| 5 | IE `maintenance_class` enum fix + sync script PII coverage | `6a62d3f` | Cleanup |
| 6 | BE — drop Browserless fallback; CBEAPI as sole path (vendor_aggregation) | `284a70b` | (a) path |
| 7 | BE KBO Open Data ingest spec + registration email draft | `fa56d25` | (c) path scaffold |
| 8 | SG — `singapore-company-data` migrated to data.gov.sg ACRA | `bd25bc5` | Was previously deactivated as 'no source' |
| 9 | HK + IN deactivation comments updated with probe findings | `287271c` | Skip prevention for next session |
| 10 | (close-out) IE activation in DB — was missed when session started | (in DB only) | Caught by session-close-check |

5 capabilities migrated end-to-end + 1 (BE) deferred to Tier-2 with Tier-3 scaffold queued.

## Decisions made (none requiring Decisions DB entries)

- **BE strategy: (a) + (c)** — Petter approved 2026-04-29 PM. Strip Browserless fallback now (a), build FPS Economy KBO Open Data ingest later (c). No new Decisions DB entry needed; this is execution under DEC-20260428-A's existing Tier doctrine.
- **HK + IN deferred** — Petter ruled them out of v1/v1.1 scope. Not a new Decision; just scope clarification.

## Loose threads / open dependencies on Petter

1. **FPS Economy reply** to `kbo-bce-webservice@economie.fgov.be` (registration email sent — confirmed by Petter). When ToU PDF arrives, review against the §2 checklist in `docs/research/2026-04-29-be-kbo-open-data-ingest-spec.md` and forward to me. ~2-day build once SFTP creds land.
2. **Topograph call** — booking link is in `cal.com/pierre-henri-janssens-75yxvk/30min`. Reply received with sample API response; pricing gated on the call. Agenda + 10-question priority list is in this conversation history; lift it into a doc if Petter prefers.
3. **One material concern for the Topograph call**: their email says they cache certain countries (e.g. DE) for speed, but the sample DE response labels every field `live_from_registry`. Pin down whether `dataSources.<field>.type` flips to `cached` when served from cache, or whether it always says `live_from_registry`. Tier-2 doctrine fails if their provenance flag lies about freshness.
4. **HK + IN reactivation** — when those countries enter v1.x scope. Findings preserved in `apps/api/src/capabilities/auto-register.ts` deactivation comments (commit 287271c) + new Notion matrix rows.

## Non-obvious learnings

- **Spinta API DSL** (Lithuania's data.gov.lt): RQL-style functions, not flat CKAN filters. `eq(field,value)`, `contains(field,'text')`, `page('cursor')`. Pagination cursor is base64; required `limit(N)` on every call or some endpoints time out. Reusable pattern for any Spinta-based open-data portal.
- **Authority-drift gate enum mismatch**: orchestrator gate accepts `maintenance_class` only from a specific enum (`free-stable-api`, `commercial-stable-api`, `pure-computation`, `scraping-stable-target`, `scraping-fragile-target`, `requires-domain-expertise`). `api-stable` looks like it should work but isn't valid. IE manifest had `api-stable` from earlier work — fixed in `6a62d3f`.
- **PII categories sync** required hand-rolled SQL the first time because `sync-manifest-canonical-to-db.ts` didn't cover the `personal_data_categories` text[] column. Extended in `6a62d3f` with `sql.array(values, 1009)` for the text[] OID.
- **HK open data is misleading**: data.cr.gov.hk publishes a "Live Local Companies" dataset, but in practice it only contains "C"-prefix BRNs (Companies Limited by Guarantee — charities/NPOs). Regular limited-by-shares HK companies aren't in it. Don't assume "open data portal exists" → "comprehensive coverage."
- **Singapore was previously written off** as 'No viable data source identified' but data.gov.sg has a clean unified ACRA dataset (~2.1M entities, monthly refresh). Worth periodically re-checking the "no source" deactivation list.
- **Activation SQL is a separate step** the onboard pipeline doesn't run. After backfill, the executor can be missing `is_active=true / visible=true / lifecycle_state='active'` even though the manifest is in sync. IE was caught only by `session-close-check.ts` — without that script we'd have shipped IE invisible. Worth folding the activation into the orchestrator one day, or at least emitting a louder warning.
- **Topograph evaluation**: per-fact provenance via `dataSources.<field>.{type, register}` is exactly the shape DEC-20260428-A Tier-2 wants. Vendor knows the doctrine.

## Notion + memory sync at session end

End of session, Petter asked to update Notion and memory on full registry state. Done:

- 4 country pages updated (IE, LV, LT, BE) with renamed titles, current status, Sourcing pattern selects, full notes
- 3 new matrix rows created (SG live, HK deferred, IN deferred) — first added SG/HK/IN to the Country select options
- Payee Assurance v1 coverage scenario page updated: Pattern A grew 12→16, Pattern B shrank 17→14, Pattern C resolved (LT shipped), APAC section added, scorecard updated
- New local memory file: `project_business_registry_state.md` — full per-country snapshot table
- MEMORY.md updated: stale "11 EU registries on Browserless+LLM" line replaced with bucketed Direct API / Tier-2 vendor / Deactivated lists; new file indexed in Project Facts

## Cost

External: €0 (all session work used existing API keys + free public APIs).
Time: ~full afternoon session.

## State of the Tier-1 country-registry track

| Country | Status | Path |
|---|---|---|
| IE | ✅ shipped | direct CRO Open Data CKAN (CC-BY 4.0) |
| LV | ✅ shipped | direct data.gov.lv CKAN (CC0 1.0) |
| LT | ✅ shipped | direct data.gov.lt Spinta (CC-BY 4.0) |
| BE | 🟡 (a) shipped, (c) queued | CBEAPI Tier-2 → FPS Economy KBO licensed-bulk |
| SG | ✅ shipped | direct data.gov.sg ACRA (Singapore Open Data Licence v1.0) |
| AT, DE, NL, IT, PT, ES | ⛔ deactivated | pending Topograph (call booking pending) |
| HK, IN | ⏸️ deferred | not in v1/v1.1 scope; reactivation paths documented |
