Intent: Diagnose missing SQS scores on the public catalog and fix the underlying scheduler/catalog drift; ended up running the full Browserless recovery + a catalog-hardening sweep that retired 15 caps and rebalanced what's exposed publicly.

## Outcome — what shipped

8 commits across backend + frontend, in roughly causal order:

1. **Frontend `c7c6c2b`** — frontend repo SQS endpoints `/v1/internal/` → `/v1/public/ops/*`. Was the surface symptom: F-0-003 had locked admin auth on `/v1/internal/*` weeks ago and split public dashboards to `/v1/public/ops/*`, but the frontend was never updated. Result: every trust-batch fetch silently 401'd, no SQS badges anywhere.
2. **`5cc120a` fix(browserless)** — root cause of the catalog-wide staleness. Browserless v2 cloud (`production-sfo.browserless.io`) uses `?token=` query string auth, not `Authorization: Bearer`. Our probe and several callers were using Bearer; openresty edge rejected with HTTP 500 before reaching the account (Browserless dashboard showed 0 successful + 0 errored requests in 7 days while our probe logged 2305 consecutive 500s). Patched the probe + `web-provider.ts` + `chromium-health.ts` + `estonian-company-data.ts`. Also narrowed `dependency-manifest.ts`'s browserless capability list from 50+ down to 7 — the rest go through web-provider's 3-tier fallback (plain → Jina → Browserless) and don't actually need Browserless to function.
3. **`79cfd0b` fix(scheduler)** — structural prevention. The scheduler was filtering unhealthy-provider caps but not advancing their `last_tested_at`, so they permanently occupied the queue head, starving everything behind them. Added a skip-marker that bumps `last_tested_at = NOW()` + `freshness_level = 'unverified'` on filtered caps so they cycle out. No `matrix_sqs` / `qp_score` / `rp_score` mutation — Scoring Integrity preserved. No fake test_results inserted.
4. **`66fa95a` docs(catalog)** — rewrote `data_source` for 12 caps that claimed "Headless browser" or "Headless browser + Claude API" but actually use Jina Reader as the primary path. Updated manifest YAMLs as source of truth and pushed to prod via a one-off sync script.
5. **`2a72790` fix(catalog)** — root cause of why the 11 ToS-deactivated caps still appeared publicly. The `DEACTIVATED` map in `auto-register.ts` only skipped runtime executor registration; DB rows kept `is_active=true / visible=true / x402_enabled=true`. Public catalog still listed them, x402 still sold them, scheduler tried to test them. Added a startup auto-sync that flips the columns to false on boot for any cap in `DEACTIVATED`.
6. **`91c8fd7` docs(handoff)** — triage doc for the 15 partial-failure caps surfaced by the bulk re-test. Categorized into Group A (3 real executor bugs), Group B (7 manifest fixture drifts), Group C (4 transient upstream), Group D (1 domain-design open question). Path: `handoff/_general/from-code/2026-04-28-partial-failure-cap-triage.md`.
7. **`9bdc686` chore(catalog)** — parked 9 UK property caps (uk-epc-rating, uk-flood-risk, uk-sold-prices, uk-rental-yield, uk-crime-stats, uk-deprivation-index, uk-transport-access, council-tax-lookup, stamp-duty-calculate). Closed the open question raised on 2026-04-21 in the Notion to-do "Decide UK-property suspended capabilities: permanent park or temporary?" (page `34967c87082c8148ba55df56a10c2bb3`, blank, never answered). All 9 had `last_tested_at=NULL` — never validated end-to-end.
8. **`ab95a0e` + `b5b60d0` fix(catalog)** — tightened the scraping-doctrine posture. Deactivated `italian-company-data`, `eu-court-case-search`, `irish-company-data`, `latvian-company-data` — all transport-divergence cases per the 2026-04-21 audit. No clear third-party ToS violation, but Tier 1 (DEC-20260428-A) is absolute. Cascaded pause to 6 KYB solutions: `kyb-{essentials,complete}-{it,ie}` + `invoice-verify-{it,ie}`. Latvia + Lithuania never had seeded solutions; Italy + Ireland did.

## Bulk re-test (also ran during the session)

After the Browserless fix landed and the manifest was narrowed, I ran `scripts/bulk-test-overdue.ts` against the 229 caps that were stale > 24h. 305 seconds, concurrency 4, hit production via the admin endpoint. Result: 211 fully clean, 18 partial failures (those went to the triage doc), 0 endpoint errors. Catalog freshness went from **86% stale > 7d → 98% fresh < 6h**.

## Production state at session close

- `270 publicly active caps of 316 total` (was 283 at session start, before today's hardening removed 13)
- All 16 dependency providers healthy
- Browserless: ✓ healthy, 100% probe success since 11:42 UTC
- Scheduler: skip-marker code shipped, future provider outages won't replay this cascade
- Frontend: SQS badges rendering on `/solutions` and `/capabilities` after the Lovable publish

## Open work (rolled into per-piece handoffs)

1. **15 partial-failure caps** — `handoff/_general/from-code/2026-04-28-partial-failure-cap-triage.md`. Group B (7 manifest drifts) is mechanical via the `--backfill --discover --fix` workflow; Group A (3 real bugs in redirect-trace, prompt-compress, test-case-generate) needs targeted fixes; Group C (4 transient) likely self-recovers; Group D (polish-company-data) is an open product question.
2. **`mass_test_failure` alert spam** — has no cooldown (unlike dependency-probe alerts which have 30 min). Sent ~30 emails today as the bulk re-test exposed the partial-failure caps. Not blocking; deserves a 30-min PR adding the cooldown the same shape as the probe debouncer in `intelligent-alerts.ts`.
3. **6 Browserless-dependent caps left to recover naturally** — `html-to-pdf`, `landing-page-roast`, `website-to-company`, `email-pattern-discover`, `officer-search`. All clean (no scraping or only user-supplied URL fetching). Lifecycle's 3-pass-to-active gate should auto-transition them within ~24h; verify in tomorrow's `/activity` check.
4. **Browserless API key rotation** — token `2U2w...d529` was visible in screenshots in conversation. Petter said he'd rotate separately. Not yet done at session close.
5. **17 invariant-checker emails** were the 7-day-suspended timer firing on caps that have been stuck since the Browserless outage. Those caps are now either deactivated (this session) or recovering (in flight); the next invariant tick should not re-fire on them.

## Non-obvious learnings

- **The dependency-manifest's "capabilities" list is overstated for any cap that uses `web-provider.ts` or `browserless-extract.ts`.** Those caps have a 3-tier fallback chain — they only "depend" on the last-resort tier when the first two fail. Listing them as Browserless-dependent in the scheduler's health-gate caused 50+ caps to be filtered out as unhealthy when only ~7 actually needed Browserless. The fix was a one-time scope correction (commit `5cc120a`) but the same pattern likely exists for other providers; future provider integrations should declare *required-only* capabilities in the manifest.
- **`api-key-query` AuthType was declared in the type but never implemented in the probe runner switch.** Etherscan was the only existing user but used `skipAuth:true` so the bug never surfaced. Adding a real consumer (Browserless) exposed it. There may be other declared-but-unimplemented branches in dependency-health.ts worth auditing.
- **DEACTIVATED catalog drift is a class of bug, not a one-off.** The runtime layer (executor registration) and the catalog layer (DB columns) were maintained separately; nothing kept them in sync. Today's fix added a boot-time sync. Worth auditing other state pairs (e.g. solution `is_active` vs all-steps-active, capability `lifecycle_state` vs `is_active`) for similar gaps.
- **The `mass_test_failure` cooldown gap is structurally worse than dependency-probe spam** because it fires per-tick per-cap, not per-provider. With 18 caps in partial failure, every scheduler tick that touches one fires another email. Adding the cooldown is high-leverage.
- **`/v1/internal/` → `/v1/public/ops/` was an incomplete F-0-003 migration.** Frontend was never updated. There's no integration test catching "frontend can read public trust endpoints" and no CI grep for `/v1/internal/` in the frontend repo. Adding either would prevent the same recurrence.

## Cost (this session)

- Bulk re-test: 229 caps × ~5 test types each = ~1100 calls. Roughly $1–3 in API costs (Anthropic + Serper + Browserless mostly). No quota issues triggered.
- One-off prod DB updates (data_source sync, deactivated sync, IT/IE solution pause): three small writes via dedicated scripts.
- Frontend deploy: free (Lovable pipeline).
- No unrelated traffic effects observed in `/activity` snapshots taken throughout.

## Files touched this session

```
apps/api/src/lib/dependency-manifest.ts        (browserless authType + capabilities scope)
apps/api/src/lib/dependency-health.ts          (api-key-query implementation)
apps/api/src/lib/chromium-health.ts            (?token= auth)
apps/api/src/capabilities/lib/web-provider.ts  (?token= auth)
apps/api/src/capabilities/estonian-company-data.ts  (?token= auth)
apps/api/src/capabilities/auto-register.ts     (DEACTIVATED list expansion + DB sync at boot)
apps/api/src/jobs/test-scheduler.ts            (skip-marker for unhealthy-provider caps)
manifests/{12 yaml files}                      (data_source rewrites)
apps/api/scripts/{8 new diag/sync scripts}     (kept committed for future re-use)
strale-frontend/src/lib/api.ts + hooks/use-capabilities.ts + 3 doc-comments  (path swap)
```

## What's NOT in this handoff

- The `mass_test_failure` cooldown fix — flagged as open work above, not shipped.
- A formal Decision DB entry for the Tier 1 doctrine application to italian/irish/latvian/eu-court-case-search. That's a Petter-only governance action; today's work used DEC-20260428-A as the parent rule and explicit user authorization in-session as the trigger. Worth logging as DEC-20260428-C or under DEC-20260428-A's child IDs at Petter's discretion.
- Any of the 4 transient upstream issues (`french-company-data` 429, `company-news` GDELT 429, `pii-redact` Anthropic overload, `danish-company-data` quota) — those need watching, not fixing.
