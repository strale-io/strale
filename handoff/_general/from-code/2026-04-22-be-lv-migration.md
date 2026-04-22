# Handoff — BE + LV direct-connection migration

Date: 2026-04-22
Intent: Migrate `belgian-company-data` and `latvian-company-data` off
third-party wrappers and portal-scraping onto official direct APIs, per
DEC-20260420-H direct-data-connections doctrine. Session ran the
mandatory external-verification step first and produced one plan-
invalidating finding (BE) and one credential-pending stub (LV).

## Outcome

### BE — deferred (no code changes)

**DEC-20260422-E deferral.** The prompt assumed CBE Public Search SOAP
was free and self-serve. External verification refuted this:

- Official CBE web services require a signed *"CBE Data Access
  Application Form"* submitted to the CBE Management Service
  ([FPS Economy source](https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises/services-administrations/cbe-web-services)).
- Commercial Public Search SOAP tier is priced at €50 / 2 000 requests.
- CBE Open Data is free-CSV-only, requires a signed licensing
  agreement, prohibits direct-marketing PII reuse, ships bulk-only
  (daily/monthly cadence — not live per-entity), and covers less depth
  than today's capability.
- `cbeapi.be` (current source) and `crossroadsbankenterprises.com`
  (alternative) are both third-party wrappers; neither is official.

Options discussed with chat:
1. Move BE onto the aggregator path planned for NL.
2. Sign the CBE application + pay the commercial SOAP tier.
3. Ship against CBE Open Data with a nightly importer + local cache
   table (accept up-to-24h staleness, sign the re-use licence).
4. Keep `cbeapi.be` primary but re-label the manifest `data_source`
   honestly (violates the spirit of DEC-20260420-H).

Chat's decision: formally defer BE under DEC-20260422-E. No code
changes to `belgian-company-data` in this session. Path (a) vs (b)/(c)
remains open for a later session once Creditsafe aggregator terms have
landed.

### LV — stub scaffolded, credentials pending

Added [src/capabilities/providers/latvian-company-data-sdda.ts](apps/api/src/capabilities/providers/latvian-company-data-sdda.ts)
as a module-load side-effect-free stub. Key properties:

- Exports `fetchViaSdda` + `SddaConfigPendingError`.
- Does **not** call `registerChain`. Browserless scraping remains the
  sole active path for `latvian-company-data` until a follow-up
  session flips SDDA to primary.
- `fetchViaSdda` throws `SddaConfigPendingError` with a
  `CONFIG_PENDING` code when credentials are absent.
- OAuth2 client_credentials against `https://api.viss.gov.lv/oauth2/token`
  (WSO2 API Manager default). Scope `ur-api-legalentity`, gateway path
  `/t/ur_mkanepe/UR-API-LegalEntity/v1.0/legal-entity/{regNumber}`.
  Response-mapping is a placeholder — the real shape can only be
  observed after the devportal login surfaces the OpenAPI schema; the
  follow-up session should tighten the mapping once a live call
  lands.

Registered credentials in [src/lib/credential-health.ts](apps/api/src/lib/credential-health.ts):
`sdda` provider, sentinel env var `SDDA_API_CLIENT_ID`
(paired with `SDDA_API_CLIENT_SECRET`), scoped to `latvian-company-data`.
Missing credentials now report as a known configuration gap rather
than silent capability failure.

**No manifest changes** for `latvian-company-data` in this session. The
`data_source` field stays at the current value (Uzņēmumu reģistrs) —
it flips to the canonical SDDA name when the follow-up session makes
SDDA primary. Attribution fields likewise land in the follow-up.

## SDDA registration instructions for Petter

Run in parallel with the Creditsafe response — these are independent.

1. **Open the devportal.** Navigate to
   [https://api.viss.gov.lv/devportal/](https://api.viss.gov.lv/devportal/).
   Portal identifies itself as *API Pārvaldnieks* and runs on WSO2 API
   Manager. UI is Latvian + English.

2. **Create an account.** Click *Sign in → Sign up*. Required fields are
   typically name, email, organisation. There is no public indication of
   a Latvian-entity requirement — the free-of-charge service is
   explicitly advertised on
   [ur.gov.lv's API page](https://www.ur.gov.lv/en/get-information/free-of-charge-services/api-web-services/).
   Verify email.

3. **Subscribe to UR-API-LegalEntity v1.0.** Go to the API Store
   (link: [UR-API-LegalEntity store page](https://api.viss.gov.lv/store/apis/info?name=UR-API-LegalEntity&version=v1.0&provider=UR_MKANEPE&tag=Uz%C5%86%C4%93mumu+re%C4%A3istrs))
   and click *Subscribe*. Create a new *Application* (name it `strale-api`
   or similar) and subscribe the application to the UR-API-LegalEntity
   product on the default tier.

4. **Generate production keys.** From the application page, under
   *Production Keys*, click *Generate keys*. Choose grant types:
   at minimum `Client Credentials`. Copy the resulting
   *Consumer Key* (→ `SDDA_API_CLIENT_ID`) and
   *Consumer Secret* (→ `SDDA_API_CLIENT_SECRET`).

5. **Set env vars on Railway.** In the `strale-api` service, add
   `SDDA_API_CLIENT_ID` and `SDDA_API_CLIENT_SECRET`. No redeploy
   required — the stub reads them lazily at token-fetch time.

6. **Ping chat when keys are set.** The follow-up session will:
   - Make a live call to `fetchViaSdda` against a known Latvian entity
     (40003245752 is the current fixture) to observe the real response
     shape.
   - Refine response mapping.
   - Call `registerChain()` so SDDA becomes primary; Browserless
     demotes to fallback for one week's soak before removal.
   - Update the manifest `data_source` to the SDDA canonical name and
     add attribution fields.

If registration surfaces any blocker (Latvian-entity requirement, a
per-call cost, missing fields on the free tier that break today's
known-answer assertions), pause at step 3 and flag to chat — the
follow-up session's scope then changes.

Contact for support: `dati@ur.gov.lv`.

## Verification run in this session

- `npx tsc --noEmit` clean (exit 0).
- Stub file contains zero `registerChain()` invocations (the single
  grep match is a comment explaining the deliberate absence).
- `latvian-company-data` executor unchanged — still registers via the
  direct Browserless path.
- No edits to `belgian-company-data.ts` or
  `manifests/belgian-company-data.yaml` (BE deferred per DEC-20260422-E).
- Safety tripwires passed (tracked tree clean before session, on
  `main`, envelope fields from 4bbe8c4 already landed).

## Follow-ups to log (chat action)

1. **BE decision** — DEC-20260422-E. Content: the CBE direct path is
   not free-self-serve; BE deferred until either the aggregator path
   (Creditsafe/NL) lands or the €50/2k CBE Public Search tier is
   explicitly approved.
2. **Provider-Coverage DB** (Notion) — LV row for Uzņēmumu reģistrs
   Browserless stays *Live*; add a second LV row for
   *SDDA UR-API-LegalEntity* with status *In discovery — credentials
   pending with Petter*. BE rows unchanged this session.
3. **Broader scraping backlog** — 9 remaining Browserless-scraping
   country capabilities still need direct-API paths. Out of scope here.
