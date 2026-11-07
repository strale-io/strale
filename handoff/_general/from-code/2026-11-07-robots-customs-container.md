Intent: clear the robots.txt findings on the two listed tools (`customs-duty-lookup`, `container-track`) before Sunday's weekly-drift run, and fix what actually turns that run red.

Lane started by the Strale master (session_01RFNL6WAcqYWJKtyJRfBGCw), brief item 2 of `2026-11-07-checkin-morning.md`. Branch `fix/robots-customs-container`.

## What the brief assumed, and what was true

- **The robots sweep does not fail weekly-drift.** It runs report-only and is not in the aggregate exit (`.github/workflows/weekly-drift.yml`, the `source-robots` step). The 2026-11-02 run failed on `UR=1`, the recorded-upstream re-check: `usgs-earthquake-search` was "no longer requested", because its known answer has no date window and the executor defaults to "the last 30 days", so the URL changes every day.
- **Re-running that check today found six more drifts.** strale.dev now 302s to strale.io, so `robots-txt-parse`, `sitemap-parse` and `website-carbon-estimate` (fixtures on strale.dev) drift too. Sunday's run would have failed on these regardless of robots. SWITCH-OVER-READINESS item 11 lists "re-recording fixture-bound manifests after the switch" as open; it is done here.
- **Neither listed tool needed delisting.** Both had a robots-permitted path.

## Changes

- **customs-duty-lookup**: reads only the Access2Markets results page (trade.ec.europa.eu, robots allows it). Its EU import rows are TARIC data; the Commission licenses its content CC BY 4.0. New `vendor-terms.data.json` record; `data_access.checks: recorded` with the note; attribution, licence and source URL in provenance.
  - A2M answers HTTP 400 unless origin and a member-state destination are both given. The old fallback sent `destination=EU` with an optional origin, and the LLM was handed the 400 page. The fail-before test shows that call **resolving** on main, so it was chargeable. Now the call throws before any LLM call.
  - `origin_country` is now required, as an ISO alpha-2 code for a non-EU country. Destination must be a member state or `EU`. For `EU`, DE is queried and `vat_rate` is withheld, because VAT is national. The HS code must have 6 to 10 digits, since A2M answers at the 6-digit level; `resolved_hs_code` reports which code was answered.
  - The Mendel Verlag rows on A2M (non-EU tariffs, no resale) are never read, because only EU imports are queried.
- **container-track**: no fetch of maersk.com (robots-disallowed). The Maersk link is now the tracking form, which robots allows. SeaRates is dropped: its tracking URL 301s to DP World's homepage, so every carrier without its own path had been feeding a corporate homepage to the LLM. The HMM deep link is dropped (now disallowed). Live status comes from MSC, CMA CGM and Hapag-Lloyd only, and a new limitation says so.
- **usgs-earthquake-search**: the known answer has a fixed window (2026-10-01 to 10-31); re-recorded.
- **The three strale.dev tools**: fixtures moved to strale.io and re-recorded. The output examples were regenerated from real executor output, not domain-swapped.

## Evidence

- `archive/receipts/2026-11-07-check-source-robots-access-customs-container.json`: 0 listed tools disallowed.
- `archive/receipts/2026-11-07-test-run-robots-permitted-sources-fail-before-after.json`: 10 of 12 tests fail on main, 12 of 12 pass after.
- `record-upstream.ts --check` was run on all 32 before the fixes (6 strale.dev drifts plus usgs). The four affected slugs were re-recorded and checked clean.

## Not verified here

- **Paid call volume** for either tool. Cloud containers cannot reach Postgres, and `ops-read` has no call-volume check. Nothing was delisted, so the founder gate for revenue earners did not apply.
- **`validate-capability.ts` / readiness / smoke test.** They need the database; run them from the PC after deploy.
- **The terms of MSC, CMA CGM and Hapag-Lloyd** for automated tracking reads. container-track `checks: pending` stays.

## Next

1. After deploy: `GET /v1/capabilities/customs-duty-lookup` shows `origin_country` required, and `GET /v1/capabilities/container-track` lists the new limitation.
2. Sunday 2026-11-08 16:50 UTC (17:50 Swedish time) weekly-drift: expect `UR=0`. If anything else is red, that is a new finding.
3. container-track: read the three carriers' terms, or narrow the tool to validation plus links.
