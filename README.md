# apps/web review screenshots

Screenshots and accessibility reports for the apps/web pull requests, kept on
this branch so they never enter `main`'s history. Not for merging.

Each folder holds full-page JPEGs at 1440px and 390px wide in light and dark,
plus `report.json` from `apps/web/scripts/review.mjs` (axe-core WCAG 2.2 AA and
best-practice rules, horizontal overflow, console errors).

These were built in **preview mode** (repository manifests, not the live API),
because the sandbox that made them cannot reach api.strale.io. Every page shows
a preview banner saying so. Live-data screenshots come from the CI `web` job's
`web-review` artifact.
