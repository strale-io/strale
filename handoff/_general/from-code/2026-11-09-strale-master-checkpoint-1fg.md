Intent: Strale master checkpoint (account 1fg, save mode at about 95% usage), 2026-11-09 11:55 Swedish time.

Session: session_01RFNL6WAcqYWJKtyJRfBGCw (the Strale master, launched by the wow-core takeover session_01RFNL6TsX8ERmFj7FDhHjAF). Codex dispatcher: session_01RFNL6Woeo8gui2dFw3uKci; send it the bare slug only.

## Shipped and verified live since the takeover (2026-11-07 to 11-09)

| PR | Change |
|---|---|
| #973 | comms sync |
| #950 | x402 alert |
| #974 | robots.txt |
| #975 | domain-age-check RDAP |
| #976 | exchange-rate and currency-convert coverage |
| #977 | forex-history v2 |
| #978 | image-to-text media type |
| #979 | robustness register |
| #980 | htmlToText linear (64fab365) |
| #981 | onboarding failures name their safe cause (e37e89c7) |

Live check: `/health` showed e37e89c7 at the time of writing.

image-resize backfill: done on 2026-11-09. It succeeded with discover off; the fixture moved to the strale.io image.

## In flight

- **#983**, a fix so that a backfill with discover on no longer fails on its own discovery.
  - **State:** in the merge queue at 49d6b44a, with CI green and independent review GO.
  - **Resume:** confirm that `/health` shows its merge commit, then remove the worktree `/home/user/strale-wt-obd` and the local branch.
  - **Safety-net check-in:** `trig_01FNoTpurf9oXB3JWsTFUPsZ`, 12:12 Swedish time. It starts with the lease check.
  - **Until it is live:** Petter unticks discover on backfills.

## Next (no new lanes in save mode)

1. **image-resize:** add `format: guaranteed` to `manifests/image-resize.yaml` and to its `output_schema` properties. Then sync the row from the PC: `sync-manifest-canonical-to-db.ts image-resize --fields output_field_reliability,output_schema`. This needs production database access.
2. **Robustness R1 remainder:**
   - per-caller converter fairness;
   - the jsdom sweep (`company-enrich/structured-metadata.ts`, `nta-corporate.ts`);
   - the url-to-markdown receipt.
3. **R4:**
   - container-track: delist it or ask Petter to register for the official APIs. Decide from the morning run's 30-day paid volume.
   - DQ-41: invoice-counterparty-check promotion path (Petter decides).
   - DQ-48: customs-duty-lookup A2M terms.
4. **Waiting on Petter at the PC:**
   - Haiku 5.5 model comparison;
   - the database-backed validate and smoke runs for domain-age-check, exchange-rate, currency-convert, forex-history and image-to-text;
   - the npm, PyPI, directory and Zapier asks;
   - Better Stack.

## Notes

- **Codex empty first runs:** 3 of about 10 first runs on the Strale environment came back READY with no diff. Each rerun worked, and the dispatcher now resubmits once on its own (wow-core#283). The status shows these are not setup failures.
- **Onboarding workflow default:** `discover` defaults to true. #983 makes that safe for backfills.
