Intent: /activity since-last analysis of 2026-08-10→11 x402 traffic, then fix the three findings it surfaced: us-company-data ticker resolution, x402 empty-input schema surfacing, and packaging the observed SEO workflow as a solution.

## Shipped — PR #171 (open, awaiting merge)

https://github.com/strale-io/strale/pull/171 — branch `fix/ticker-resolution-and-x402-input-validation`, commit `3f89ac5`, 16 files.

1. **us-company-data resolution** — "Apple"/"AAPL" resolved to Apple Hospitality REIT (EFTS full-text search ranks by filing-text relevance, executor took hits[0]). New shared `lib/sec-ticker-map.ts` (dedups two pre-existing loader copies in sec-filing-events + officer-search): exact ticker/title resolution via SEC's authoritative company_tickers.json, O(1) indexes, stale-if-error, 60s failure cooldown, concurrent-load coalescing. Resolution order: CIK → explicit `ticker` field → exact title → uppercase-shaped ticker → LLM+EFTS fallback (unchanged, still gated). Output gains `resolution_method`.
2. **x402 input validation** — `{}` against either/or capabilities leaked raw executor errors (required:[] is truthy → old check no-op'd). New pure `lib/x402-input-validation.ts` (classic required + anyOf/oneOf groups), wired into both x402 handlers after verify / before settle. All schema 400s carry error_code (DEC-19), charged:false, input_schema, valid minimal example, catalog hint. Executor-failure 400s carry the same envelope with error_code=execution_failed.
3. **Riders**: officer-search outage no longer asserts "No officers found"; since-last-ext.ts + today-overview.ts now exclude internal accounts from failed_requests (the "2 failed requests" in the activity report were our own curl tests); web-extract Browserless timeout alignment (pre-session change, rode along per Petter's go-ahead).

Six-lens review found 4 HIGHs, all fixed + regression-tested before PR: Ford→FORD ticker hijack (DEC-20260428-B bypass), empty-input rule 400'ing valid all-optional caps (fear-greed-index etc.), officer-search outage-as-negative, generated example teaching agents allow_low_confidence:true.

## Built but NOT shipped — needs Petter decisions

**`local-seo-audit` solution** (`apps/api/scripts/seed-seo-solutions.ts`, dry-run only, NOT in PR #171, NOT in DB). Four independent x402 users ran the identical SEO recipe by hand (FR head-spa agency, GR villas, ID web services, UK timber). Proposed: €0.52 (41c steps × 1.25 data-lookup markup), 5 parallel steps (serp-analyze, keyword-suggest, backlink-check, page-speed-test, tech-stack-detect). Open decisions: (a) price OK? (b) category sales-outreach vs data-research; (c) multi-keyword fan-out NOT supported by solution-executor — the highest-volume observed user (7 cities × serp-analyze) can't be served by one call; (d) partial failure bills full price (platform convention, but page-speed-test times out in prod).

## Post-merge deploy steps (order matters — in PR body)

1. Merge + deploy code. 2. THEN `onboard.ts --backfill` (or sync-manifest-text-to-db.ts) for us-company-data, tech-stack-detect, image-to-text — syncing first would advertise ticker support before code ships. Also clears the pre-existing readiness gaps (us-company-data reliability annotations, sec-filing-events avg_latency_ms). 3. Post-deploy prod checks: SELECT input_schema shows anyOf; POST /x402/tech-stack-detect {} + payment → schema envelope; us-company-data AAPL → resolution_method=ticker.

## Open threads

- **do.ts wallet-path anyOf parity** — /v1/do's inline validator can't read anyOf; same incident class open on the authenticated surface. Reuse validateX402Input there (pure by design). Next code PR.
- **~45 either/or manifests** need anyOf declarations (data campaign).
- **3 SEC name-matching policies coexist** — wrong-company class fixed in 1 of 3 consumers; officer-search (emits personal data) should be next.
- Pre-existing red CI guards on main: check-cost-class-coherence (estonian-company-data), check-no-direct-getexecutor-in-scripts (2 scripts).
- `web-extract` on x402 is an open bypass around per-source policy limits (observed: caller refused on Trustpilot via product-reviews-extract, then re-ran the same extraction through web-extract with a raw prompt).

## Non-obvious learnings

- **required:[] is truthy** — `if (schema?.required)` is a no-op guard for empty arrays; the same hole existed in two shapes (empty array vs absent key).
- **"properties present + required empty" is ambiguous by construction** — describes both either/or caps AND all-optional caps (fear-greed-index's canonical paid call IS {}). Any "reject empty input" heuristic on that shape false-positives. Either/or contracts must be DECLARED (anyOf); they can't be inferred.
- **Ticker-shape case coercion is a hijack vector** — uppercasing "Ford"→"FORD" (Forward Industries) stamps a wrong identity `exact`. Only already-uppercase input may take the generic ticker path; explicit `ticker` field carries caller intent.
- **Error examples are agent instructions** — generateExampleFromSchema emitted `true` for booleans, handing every 400 recipient `allow_low_confidence: true`, the exact guard bypass. Examples must be valid minimal requests.
- The x402 website audience (compliance/KYB shoppers, per suggest_log) and the paying x402 API audience (SEO + OSINT agents) are different populations.

Cost: ~15 x402-priced capability calls' worth of live SEC probes (free API), 5 subagents + 2 review passes.
