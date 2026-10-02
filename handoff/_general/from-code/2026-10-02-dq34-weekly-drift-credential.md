# 2026-10-02 — DQ-34 executed: weekly-drift reads the database again

Intent: carry out Petter's in-session answer to DQ-34 ("install the database
password so the weekly sweep can read the database again") and prove it.

- `DATABASE_URL` Actions secret (strale-io/strale) set 2026-10-02T08:52:32Z from
  the root `.env` read-only role `strale_ro`, query string replaced with
  `?sslmode=require`. Value piped from a file read straight into
  `gh secret set`; never printed. Pre-checks: TLS connection `ssl = true`;
  `pg_write_all_data` false; temp-table create refused `25006`.
- Only `.github/workflows/weekly-drift.yml` reads `secrets.DATABASE_URL`
  (grep over all workflows); its three DB steps are read-only scripts.
- Proof: `gh workflow run weekly-drift.yml` → run 36986562098. Manifest drift
  ran (343 clean, 1 drift), TOAST readability ok on transactions (1,280,589
  rows), health_monitor_events, capabilities, test_suites; output_schema
  corrupted 0. No `28P01`.
- Run conclusion `failure` = real findings, for the next morning run:
  1. `fear-greed-index` manifest↔DB drift on `output_field_reliability` —
     decide which side is right; fix the manifest or apply via the sanctioned
     path (production write rules apply).
  2. Six `ROSTER_VENDOR_UNREGISTERED` from `check-vendor-roster-drift.ts`
     (Global Database, Allabolag.se, PitchBook, einSearch.IO / 1099 line,
     Crunchbase Enterprise, D&B Direct+) — roster names that resolve to no
     register vendor. Not DB-related; likely failing before too, masked by the
     password failure.
- `npm run scheduled:outcomes` will still count the scheduled streak until the
  next *scheduled* run (manual dispatch is not evidence by design). Next cron:
  the Monday ~14:59Z slot (last seen 2026-09-28).
- Reverse: `gh secret delete DATABASE_URL` (or set it back); nothing else
  changed.
