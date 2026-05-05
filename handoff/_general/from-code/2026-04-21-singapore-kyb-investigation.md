# Handoff — singapore-company-data investigation

Intent: diagnose why `singapore-company-data` is deactivated despite being referenced by 3 active solutions, and scope both revive + drop paths so Petter can pick and the follow-up prompt can execute.

## What shipped

- `audit-reports/2026-04-21-singapore-kyb-investigation.md` (275 lines) — full report with classification, revive plan, drop plan, recommendation.
- Commit `5a04325` on `main`, pushed.

## Conclusion (short)

- Classification: **Type 3** (structural / no viable data source at price point).
- Evidence: 41/41 failed production transactions; OpenCorporates scraping returns nothing for canonical SG entities (Singapore Airlines UEN `199901616D`, DBS Group); Petter had already independently flagged this in commit `a80ea1d` on 2026-03-20 ("No viable data source identified"); 0 customer transactions ever on the 3 SG solutions.
- Recommendation: **drop** the SG KYB surface (soft-deactivate the 3 solutions + remove from seed files + regenerate sitemap). Revive cost is moderate-to-high (requires paid ACRA BizFile or paid OpenCorporates API, re-pricing, re-onboarding per pipeline); revive benefit is zero (no customer traffic).
- Blast radius of drop: 4 DB row updates + 4 code edits + 1 sitemap regen in the frontend repo + optional Notion product-page update (flagged, not queried).

## Pending for next prompt

Petter picks revive / drop / overrides with custom plan. If drop (recommended): §5.2 of the report is the implementation outline. Frontend sitemap regeneration lands in `strale-frontend` repo (cross-repo update). DEC-20260421-X recording the drop decision is part of the implementation prompt, not this investigation.

## Risk notes

- Capability DELETE is FK-blocked by `solution_steps.capability_slug` onDelete restrict. Soft-deactivation (is_active=false) avoids this cleanly.
- 3 solution URLs currently indexed by Google via sitemap.xml — will deindex naturally once the sitemap is regenerated without them. Optional: add 301 redirects.
- `seed.ts` and `seed-kyb-solutions.ts` both need edits — otherwise a fresh-DB re-seed recreates SG entries.
