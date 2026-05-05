# Handoff — 2026-04-18 Capability source audit (Batches 1-3)

**Intent:** Map candidate alternative sources for each company-data capability so SQS can route between them. Audit license/resale rights of current and candidate sources. Defer code changes (Petter has open PRs); log everything in Notion as detailed todos.

## Artifacts

- `capability-sources/01-eu-company-data.md` — 10 EU intents (SE, NO, DK, FI, UK, NL, DE, FR, IE, PL)
- `capability-sources/02-eu-company-data-batch2.md` — 8 EU intents (AT, IT, ES, PT, LV, LT, CH, BE)
- `capability-sources/03-non-eu-company-data.md` — 8 non-EU intents (US, CA, AU, IN, SG, HK, BR, JP)
- Notion Journal entries: 2026-04-17/18 Batch 1; 2026-04-18 Batches 1-3 close
- Notion To-do DB: 27 todos created, filter `Source LIKE capability-sources/%`

## What's done

- 26 company-data intents fully mapped: output contract, sources table (current + candidates), license verdicts (permitted / attribution / restricted / prohibited / unclear), verification probes, router-value per candidate, recommendation (router / siblings / stay-1:1 / expand).
- Compliance audit surfaced systemic scraping risk across ~15 capabilities.
- 7-capability `lib/northdata.ts` divergence found and flagged.
- 5-capability manifest-vs-code divergence confirmed (PL, NL, PT, LT, CH) + JP similar pattern.
- 5 drop-in free-and-legal replacements identified that can ship without sales cycles: PL KRS, CH Zefix, LV data.gov.lv, BR BrasilAPI, JP NTA (Application ID needed first). DE OffeneRegister.de is 6th (CC-BY-4.0, registration only). DK distribution.virk.dk is 7th (blocked on ERST credentials).
- Architectural insight captured: split intents into registration-vs-financials to make router viable. Prerequisite decision logged.

## What's pending (see Notion To-do DB, filter Source = capability-sources/...)

**Blocks individual swaps:**
- P0 strategic framing decision on scraping stance + consolidated-provider procurement (precedes per-country code work).
- P1 arch decision on registration-vs-financials intent split.

**Petter actions (external):**
- P0 follow up with cvrselvbetjening@erst.dk if no reply by 2026-05-10.
- P0 legal review of 4 scrape-based sources (SE/DE/NL/IE) — may expand to all 15 after Batch 2-3.
- P1 OpenCorporates procurement conversation (could resolve SG/HK + 7 EU siblings in one contract).
- P1 AU dedupe (`au-company-data` vs `australian-company-data`).
- P1 LT/PT sourcing decision (no free API exists).
- P2 AT/IT/ES/IN sourcing decision.
- P2 Pappers.fr + OpenCorporates free signups.
- P2 Enterprise sales research (Roaring, Northdata API, KVK, Asiakastieto).

**Claude code actions (deferred until PRs clear):**
- P0 PL → KRS OdpisAktualny swap (lowest-friction fix in audit).
- P0 CH → Zefix PublicREST swap.
- P1 LV → data.gov.lv CC0 swap.
- P1 BR → BrasilAPI swap.
- P1 JP → NTA API swap (after Petter gets Application ID).
- P1 DE → OffeneRegister.de swap.
- P1 Honesty update on 5 manifests (correct `data_source` field to match code).
- P1 DK → distribution.virk.dk swap (after ERST creds arrive).
- P2 DK cvrapi.dk resilience stopgap (User-Agent fix, CVRAPI_TOKEN env, cache).
- P2 NO regnskap expansion; UK XBRL expansion.
- P3 BE NBB CBSO financials sibling.

## Connections to existing work

- DEC-20260405-A (Swedish data source course-correction) — Batches 1-3 extend that pattern retroactively to 14 more countries. Structural gate already says 'no new capability on commercial aggregator when official exists'; audit shows 15 existing capabilities violate this rule today.
- Journal `Strategy question — SQS as a source-routing primitive` (2026-04-17, 34567c87-082c-813b-afce-c03c06c06a39) — Batches 1-3 are the concrete input the strategy session was waiting for.
- Deferred `DEF-20260302-B Allabolag backup source` — superseded by Batch 1 finding; can be closed once DEC-20260405-A phase 4 lands.

## Methodology notes for future sessions / batches

- Probes should verify with a real fetch against a known entity (Spotify AB for SE, Equinor for NO, Google for US/BR, etc.) — found multiple manifest-vs-code discrepancies only because probes hit the real code path.
- License/resale column is load-bearing — several sources that "work" aren't legally usable (OpenCorporates free tier, anything scraped).
- Commercial aggregators all follow the same anti-bot pattern (CAPTCHA or 403 on ToS page itself) — that alone is a reasonable compliance-risk signal without full legal review.
- Per-country template works; cross-cutting findings (northdata divergence, OpenCorporates-scrape crisis) only emerge by running multiple batches before acting.

## Future batches queued

- Batch 4: compliance capabilities (sanctions, PEP, adverse media, KYB-related).
- Batch 5: finance primitives (IBAN, VAT, LEI, currency, forex).
- Batch 6: developer-tools, data-processing, web-scraping utility, monitoring.
- Batch 7: solutions-level audit (do bundled solutions reference the right siblings once the split happens?).
