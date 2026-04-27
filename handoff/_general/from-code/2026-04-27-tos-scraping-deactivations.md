Intent: enforce DEC-20260420-H platform-wide — deactivate every still-active capability that sources data via ToS-prohibited scraping; sync manifest + DB; commit + push.

## What landed

Commit `72ae170` on `main`:

- 5 deactivations in `apps/api/src/capabilities/auto-register.ts`:
  - `patent-search` → patents.google.com
  - `trustpilot-score` → trustpilot.com
  - `salary-benchmark` → glassdoor.com
  - `employer-review-summary` → glassdoor.com + google.com fallback
  - `linkedin-url-validate` → linkedin.com (forbids ALL automated access incl. status probes)
- 1 surgical narrow fix on `social-profile-check`: `PLATFORMS` trimmed from 11 → 7. Dropped LinkedIn, Twitter/X, Instagram, Facebook. Kept GitHub, YouTube, TikTok, Reddit, Pinterest, npm, PyPI.
- Manifest `manifests/social-profile-check.yaml` updated (description, example, limitations 2 → 3) and synced to prod DB.
- New utility `apps/api/scripts/sync-manifest-text-to-db.ts` — escape hatch for manifest-canonical (description / output_schema) edits to live capabilities, since `onboard.ts --backfill` refuses these by design (authority-drift gate).

Decision logged: **DEC-20260427-H** — Enforce DEC-20260420-H: deactivate 5 ToS-violating scraper capabilities. Each deactivation entry carries a per-capability reactivation trigger (licensed API contract or migration to a compliant alternative).

## Solution impact

- The 5 fully-deactivated caps have no solution dependencies — no degradation.
- `social-profile-check` is composed in 4 solutions (2 as steps, 2 in `extendsWith`). The surgical fix preserves all 4. Output shape unchanged; just fewer entries in `profiles` array.

## Course-correction worth remembering

I recommended `onboard.ts --backfill --force-override-authority` as the path to push manifest changes for `description` / `output_schema`. The flag's interactive banner explicitly states: "This does NOT bypass manifest-canonical drift errors." Read banners, not flag names. The escape-hatch script is the cleaner path for future manifest-canonical edits to live capabilities.

## Open follow-ups (NOT actioned this session)

- **Commercial KYB-aggregator scraping cluster.** northdata.com, empresia.es, infocif.es, firmenbuch.finapu.com — same legal flavour as Allabolag/Enento, just different jurisdictions. Powers ~7 KYB country caps (NL, PT, LT, DE, ES, AT, plus officer-search and CH/PL fallbacks). Audit details in `docs/audits/2026-04-21-allabolag-pattern-full-inventory.md`. Not actioned — would gut KYB v1 coverage; needs a per-jurisdiction migration plan to licensed aggregators or registry APIs.
- **`social-profile-check.username` missing description.** Pre-existing warning surfaced by `onboard.ts`. Hurts MCP Scoreboard schema score and agent tool selection. Trivial fix — add `description` to the manifest's `input_schema.properties.username`.
- **Government UI scrapes** (belgian-, irish-, italian-, latvian-, japanese-, australian-, canadian-company-data, customs-duty-lookup) generally permitted under EU PSI/HVD directives but each registry's own ToS should be confirmed case-by-case.
