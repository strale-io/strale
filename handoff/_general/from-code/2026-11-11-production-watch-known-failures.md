Intent: production-watch stops letting one acknowledged, known failure hide every other failure.

- **Problem:** `ingest-ee-directors` (#856, waiting on RIK) made every production-watch run red, about 48 a day, so a new job failure looked identical.
- **Change:** `scripts/production-watch/known-failures.json` holds dated acknowledgements of at most 45 days. An acknowledged, unexpired failing job stays reported on its issue but does not turn the run red. An expired acknowledgement does turn it red, and the message names it. Health and inventory signals can never be acknowledged.
- **Also fixed:** a persistent GitHub issue-listing failure now alarms as `job-inventory`.
- **Authors:** built by Codex (bad9263a); review fixes by Claude. See `docs/lanes/codex/production-watch-known-failures-report.md`.
- **Follow-up:** the ee-directors acknowledgement expires on 2026-12-11. Renew it in review only if #856 is still open and the reason still holds.
