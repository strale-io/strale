# 2026-04-22 — Bolagsverket HVD migration (DEC-20260405-A Phase 2 + Phase 4)

**Intent:** Execute the long-parked DEC-20260405-A Phase 2 Swedish migration now that Bolagsverket HVD OAuth2 credentials arrived, and close DEC-20260405-A Phase 4 by deactivating `credit-report-summary`.

## What shipped

- **`swedish-company-data` migrated to Bolagsverket HVD direct API.** Removed all Allabolag scraping and LLM name-resolution. Executor rewritten for OAuth2 client_credentials + `POST /organisationer`. Financial fields (revenue/profit/employees/fiscal_year) dropped — HVD doesn't cover them. New output schema: registry fields only (name, legal form, status, SNI, address, registration date, ongoing procedures). Price €0.80 → €0.05. Data source now correctly claims Bolagsverket.
- **`credit-report-summary` deactivated.** DEC-20260405-B logged. Executor deleted; DEACTIVATED map updated; DB `is_active=false`; `kyc-sweden` solution `extendsWith` dropped the reference; import statements in `audit-capabilities.ts`, `audit-tests.ts`, `manual-test-rerun.ts` removed.
- **Credentials installed.** `BOLAGSVERKET_CLIENT_ID` + `BOLAGSVERKET_CLIENT_SECRET` on Railway `strale` service (production) and repo-root `.env` for local runs.
- **Swagger archived.** `docs/research/bolagsverket-hvd-swagger.json`.
- **Onboarding pipeline run.** `--backfill --discover --fix --force` completed with all 16 expected fields verified against live Spotify AB lookup. Test suites regenerated; known_answer fixtures baseline cleared.

## Files changed

- `apps/api/src/capabilities/swedish-company-data.ts` — full rewrite
- `apps/api/src/capabilities/credit-report-summary.ts` — deleted
- `apps/api/src/capabilities/auto-register.ts` — added `credit-report-summary` to DEACTIVATED
- `apps/api/src/db/audit-capabilities.ts` — removed import
- `apps/api/src/db/audit-tests.ts` — removed import
- `apps/api/src/db/manual-test-rerun.ts` — removed list entry
- `apps/api/src/db/seed-solutions.ts` — `kyc-sweden` extendsWith updated
- `manifests/swedish-company-data.yaml` — rewritten (registry-only schema)
- `docs/research/bolagsverket-hvd-swagger.json` — new (archive)
- `.env` (repo root) — added Bolagsverket creds

## What did NOT change

- `annual-report-extract` stays deactivated (DEC-20260421-SE-B) — reactivation depends on HVD `/dokumentlista` + `/dokument/{id}` evaluation, not done this session.
- `business-license-check-se` stays deactivated (DEC-20260421-SE-C) — no Skatteverket F-skatt API exists.
- Paid Bolagsverket APIs (Företagsinformation, Årsredovisningsinformation) remain icebox per the 2026-04-09 parking note.
- SQS scoring, test-run logic, and scoring integrity rules — untouched.

## Open follow-ups

1. **Evaluate annual-report-extract reactivation on HVD.** The HVD API exposes `/dokumentlista` (list annual reports) and `/dokument/{id}` (download as application/zip). If the zip contains iXBRL K2/K3 files, the reactivation trigger in DEC-20260421-SE-B ("Bolagsverket extends free HVD access to PDF content") may be satisfied. Worth one session of investigation.
2. **Payee Assurance v1 Wave 1 SE coverage** — `swedish-company-data` is now the compliant registry path for SE. Confirm Provider-Coverage DB in Notion reflects this (not verified this session).
3. **Manifest key-ordering quirk.** The authority-drift gate's `valuesEqual` uses `JSON.stringify` which is insertion-order-sensitive; YAML manifest keys had to be declared in PG JSONB canonical order (length-then-alpha) to match the round-tripped DB values. Platform-level concern; not fixing in this session but worth a future audit if more migrations hit the same wall.
4. **KYB Essentials SE / Invoice Verify SE / KYB Complete SE solution impact.** Not re-validated this session — solutions that use `swedish-company-data` now get registry data only (no financials). If any solution's value prop depends on revenue/profit, consider a follow-up review.

## Notion

- DEC-20260405-B logged: https://www.notion.so/34a67c87082c810692c8dd4374a6f9ac
- Journal entry: see `course-correction` type in Journal DB, session `2026-04-22-bolagsverket-hvd-migration`.

## Verification

- Live smoke: `POST /organisationer { "identitetsbeteckning": "5567037485" }` → HTTP 200, Spotify AB returned with all 18 fields.
- Onboarding pipeline: all 16 known_answer assertions pass; test suites regenerated; manifest validation all-green.
- Deactivation: `auto-register-done skipped_deactivated:6` (includes `credit-report-summary` alongside the 5 prior).
