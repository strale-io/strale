# HR migration shipped — Wave 1 HR closed

Intent: log what shipped this session (commit d56d8af) so next session has context without re-reading the Journal entry.

## What shipped (on main + pushed)

- **HR greenfield capability + 3 solutions** against Sudski registar OAuth2 API (`sudreg-data.gov.hr/api/javni`). Commit d56d8af on main, pushed to origin 2026-04-21.
- Files: `apps/api/src/capabilities/croatian-company-data.ts` (new), `manifests/croatian-company-data.yaml` (new), `apps/api/src/lib/vat-derivation.ts` (+ `deriveVatHR`), `apps/api/src/lib/dependency-manifest.ts` (+ `sudreg` provider with zero-cost 401 probe on `/sudovi`), `apps/api/scripts/seed-kyb-solutions.ts` (+ `hr` COUNTRIES row).
- Prod DB state: capability visible=true, lifecycle=active, avg_latency_ms=500. Solutions live: `kyb-essentials-hr` (4 steps), `kyb-complete-hr` (12), `invoice-verify-hr` (14). `/v1/capabilities` now 276.
- Smoke: Hrvatski Telekom d.d. (OIB 81793146560) — all 16 known_answer field assertions green against live API.

## Earlier in the same session (SE cleanup)

- Commit 72bb1dc: `apps/api/scripts/cleanup-se-deactivation-2026-04-21.ts` — one-off script that set `capabilities.is_active=false` for `annual-report-extract` + `business-license-check-se` and deleted the stale `solution_steps` row for `kyb-complete-se + annual-report-extract`. Ran clean against prod; idempotent.

## Deferred within this session

- **NL migration (`dutch-company-data` → KVK HVDS)** — no credentials this session; still on northdata.com scrape.
- **GR new capability (`greek-company-data` → GEMI)** — blocked on KY GEMI manual approval; to-do `34967c87-082c-813e-a8dd-da3255ca176d` tracks.

## Pending for next session

1. **Redeploy Railway `strale` service from origin/main** so the new HR executor actually handles `/v1/do` calls. Capability row is visible in prod DB pre-deploy; a caller hitting `croatian-company-data` right now would get "no executor registered". Low risk (new cap, no marketing) but blocking real use.
2. **NL credentials** — `developers.kvk.nl` HVDS registration outstanding. Step 3 HVDS scope audit still needs to happen once credentials arrive (check HVDS publishes at least `company_name` + `status`; escalate if not per original prompt).
3. **GR credentials** — when KY GEMI approval lands, `GEMI_API_KEY` goes on Railway and build proceeds.
4. **Wave 1 scoreboard:** 4/11 after this session (SE partial + HR done; 7 countries to go in Wave 1 per original sweep to-do `34967c87-082c-8103-a2ba-f102461178f0`).

## Decisions logged

- DEC-20260421-HR (`34967c87-082c-810d-ae0d-da7a1ef125cd`) — Add croatian-company-data + HR KYB solutions.
- (Earlier in session: DEC-20260421-SE-B and DEC-20260421-SE-C already had their Outcome fields updated for the cleanup commit 72bb1dc.)

## Environment

- Railway prod `strale` service has `SUDREG_CLIENT_ID` + `SUDREG_CLIENT_SECRET` set (manual via `railway variables --set --skip-deploys` in this session).
- OpenAPI spec reference cached at `c:\tmp\sudreg-openapi.json` (v3.0.4, 458 KB) — not in repo. Useful if the sudreg paths need re-inspection.

## Non-findings worth flagging

- `sudreg-api.pravosudje.hr` (the host mentioned in early session context) is legacy Azure APIM documentation infrastructure and unreachable from Railway US East. The real production host `sudreg-data.gov.hr` is reachable — confirmed via token fetch + `/sudovi` + `/detalji_subjekta` calls from both my workstation and Railway.
- The upstream API path names in the initial prompt (`subjekt_detalji`, `subjekt`, `vrsta_pravnog_oblika`) didn't match the OpenAPI spec — real paths are `/detalji_subjekta`, `/subjekti`, `/vrste_pravnih_oblika`. Code uses the real paths.
