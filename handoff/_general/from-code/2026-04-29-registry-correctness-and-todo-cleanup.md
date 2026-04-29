---
date: 2026-04-29
session_intent: Continuation after the first /end-session — sync registry state to Notion + memory, then fix four registry-correctness issues flagged during the close-out audit (AU dupe, BR provenance, deactivated descriptions), then prune the Notion To-do DB.
mode: Quick
---

# Registry-correctness cleanup + To-do DB prune

Continuation of `2026-04-29-tier1-session-close-and-notion-sync.md` (the first close-out for today). Petter asked for a full Notion + memory sync of the registry state, then surfaced four follow-up correctness issues from that work.

## Outcome

### Notion + local memory sync
- 4 country pages updated (IE / LV / LT / BE) — renamed titles, status, sourcing pattern, full notes
- 3 new matrix rows created (SG live, HK deferred, IN deferred); first added SG/HK/IN to the Country select options
- Payee Assurance v1 coverage scenario page brought up to date — Pattern A grew 12→16, Pattern B shrank 17→14, Pattern C marked RESOLVED, APAC section added, scorecard updated to 30/30 if Topograph closes
- New local memory file `project_business_registry_state.md` — full per-country snapshot table with reactivation-paths for HK/IN
- MEMORY.md updated: stale "Browserless+LLM 11 EU registries" line replaced with bucketed Direct API / Tier-2 vendor / Deactivated lists

### Registry-correctness fixes (commit `462a628`)
- **AU duplication resolved**: `australian-company-data` deactivated (Browserless scrape of `abr.business.gov.au` — Tier-1 violation). `au-company-data` (clean ABR XML SOAP API with `ABN_LOOKUP_GUID`) is the canonical AU path. Comment + DB state both updated.
- **BR provenance honest**: `brazilian-company-data` now declares `acquisition_method: vendor_aggregation`, `upstream_vendor: receitaws.com.br`, plus full attribution + source_note acknowledging Tier-2 vendor wrapper. ReceitaWS re-publishes Receita Federal CNPJ public-register data — same shape as BE/CBEAPI. Manifest data_source updated. New limitations: vendor wrapper acknowledgement, ReceitaWS rate-limit warning, LGPD personal-name caveat.
- **6 deactivated registry descriptions flagged**: AT/NL/DE/IT/PT/ES manifest descriptions now lead with `[TEMPORARILY UNAVAILABLE 2026-04-29 — pending licensed X or aggregator contract per DEC-20260428-A.]` followed by the original "what it does" content. DB synced. Anyone reading the manifest sees the cap is parked at a glance.
- **Norwegian DB description mojibake**: `Br�nn�ysund` → `Brønnøysund` (DB had garbled UTF-8). Fixed via `sync-manifest-canonical-to-db.ts norwegian-company-data`.
- **Singapore lifecycle_state**: was `degraded` (stale March-16 state from when the cap was scraping OpenCorporates). Set to `active`. New tests will run on next scheduler tick.

### Notion To-do DB pruning
Crossed off 5 items per Petter's authorization:
- ✅ Done: "LV swap latvian-company-data to data.gov.lv" (shipped today)
- ✅ Done: "Diagnose Asian capability deactivations (HK/IN/SG)" (SG shipped, HK+IN deferred)
- ✅ Done: "Upgrade risk-narrative-generate Haiku→Sonnet" (title already said DONE)
- ✅ Done: "Decide Danish data source — Datafordeler signup or Browserless" (decision made earlier; follow-up to-do exists)
- ❌ Cancelled: "Consolidated procurement question: OpenCorporates" (strategy superseded by direct national APIs + Topograph)

Updated with progress (kept open):
- "Propagate attribution/license fields to govt-registry capabilities" — note added that today's IE/LV/LT/SG/BE ships use the full envelope; original Brreg/CVR/PRH/etc. backfill list still open

Created two new to-dos earlier in the session:
- "Replace 9 Tier-1-violating registry scrapers" status moved from Inbox → In progress with full per-country progress table (4 of 10 actioned, 6 pending Topograph)
- "Fold capability activation into onboard.ts pipeline" — XS, P2, owned by Claude code (prevents future invisible ships)

## Issues flagged but not auto-fixed (out of scope for "fix 1-4 now")
- The DB description-text examples for the 6 deactivated EU registries (e.g. "Red Bull, OMV, Erste Group" for AT) were richer than their manifest counterparts. The sync-script overwrites DB with manifest, so the examples were lost — but since these caps are filtered out of the catalog, no user-facing impact. Will be rewritten properly when Topograph closes and these caps are reactivated.

## Open dependencies on Petter (unchanged from earlier handoff)
1. FPS Economy reply to BE KBO Open Data registration email
2. Topograph call booking — pricing gated on it; bring caching-vs-live_from_registry provenance question
3. (No new deps introduced this round)

## Non-obvious learnings
- **AU had a duplication that pre-dated this session**: two registry capabilities for Australia. `au-company-data` (March 2026, direct ABR XML SOAP) is canonical; `australian-company-data` (older, Browserless scrape of ABR public UI) is a Tier-1 dupe. Worth periodically auditing for duplicate caps targeting the same upstream registry.
- **`sync-manifest-canonical-to-db.ts` is destructive on input/output schema** — it overwrites DB schemas with manifest values, even if the DB schemas have richer examples. For deactivated caps this doesn't matter (no user-facing impact), but worth keeping in mind for live caps. The 2026-04-29 BR sync replaced rich enums with leaner manifest stubs — fine for BR because the manifest example block is comprehensive.
- **Notion matrix's Country select didn't include SG/HK/IN** until today. The matrix was historically Payee-Assurance scoped to EU+UK+US. Adding APAC required `update_data_source` with a new SELECT statement that re-listed all options (preserving existing UUIDs).

## Cost
External: €0. Time: ~1 hour for Notion sync, ~30 minutes for the four correctness fixes, ~15 minutes for the To-do pruning.

## Files committed this round
- `apps/api/src/capabilities/auto-register.ts` — added australian-company-data deactivation entry
- `apps/api/src/capabilities/brazilian-company-data.ts` — provenance fields + comment block
- `manifests/brazilian-company-data.yaml` — full description / data_source / limitations rewrite
- `manifests/{austrian,dutch,german,italian,portuguese,spanish}-company-data.yaml` — `[TEMPORARILY UNAVAILABLE]` prefix on description
