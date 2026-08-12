# Austria Firmenbuch HVD — integration spec (build-ready, blocked on API key)

**Status 2026-08-12:** everything verifiable without a key is verified; the build is
parked because the API key requires a JustizOnline registration — a Petter action.
Once `FIRMENBUCH_API_KEY` is in `.env` + Railway, the executor build + onboarding is
a ~1–2 hour session with live verification.

## Why this matters

Free, official, real-time, CC BY 4.0 (Austria's IWG explicitly extends reuse to
commercial purposes), and it carries the **officer/managing-director leg** that the
Openapi WW-Top vendor route cannot supply. It flips AT from "deactivated pending
aggregator" to "direct API" — the same class as brreg.no/PRH. Source research:
`kyb-coverage-research.md` §2.1 (this directory).

## Petter action (the blocker)

Register for an API key: <https://justizonline.gv.at/jop/web/iwg/register>
("Antrag auf Informationsweiterverwendung" tile). The research notes production
keys and rate limits may involve contact with the BMJ integration team; rate
limits are NOT published. Once received, set `FIRMENBUCH_API_KEY` locally and on
Railway.

## Verified facts (2026-08-12)

- Endpoint: `POST https://justizonline.gv.at/jop/api/at.gv.justiz.fbw/ws`
- Auth: `X-Api-Key: <key>` header. Without it every path (incl. the WSDL at
  `/jop/api/at.gv.justiz.fbw/ws/fbw.wsdl`) returns `401 {"message":"Unauthorized"}`
  — confirmed by direct probe.
- Protocol: SOAP 1.2 (`Content-Type: application/soap+xml;charset=UTF-8`, empty
  `SOAPAction`).
- Request shapes confirmed via the community Postman collection
  (github.com/Lukhers-dev/firmenbuch-HVD — the project behind openfirmenbuch.at):

### Name search

```xml
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:suc="ns://firmenbuch.justiz.gv.at/Abfrage/SucheFirmaRequest">
  <soap:Header/>
  <soap:Body>
    <suc:SUCHEFIRMAREQUEST>
      <suc:FIRMENWORTLAUT>Datenkraftwerk GmbH</suc:FIRMENWORTLAUT>
      <suc:EXAKTESUCHE>true</suc:EXAKTESUCHE>
      <suc:SUCHBEREICH>1</suc:SUCHBEREICH>
      <suc:GERICHT></suc:GERICHT>
      <suc:RECHTSFORM></suc:RECHTSFORM>
      <suc:RECHTSEIGENSCHAFT></suc:RECHTSEIGENSCHAFT>
      <suc:ORTNR></suc:ORTNR>
    </suc:SUCHEFIRMAREQUEST>
  </soap:Body>
</soap:Envelope>
```

### Company extract (Auszug) by FN number

```xml
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:aus="ns://firmenbuch.justiz.gv.at/Abfrage/v2/AuszugRequest">
  <soap:Header/>
  <soap:Body>
    <aus:AUSZUG_V2_REQUEST>
      <aus:FNR>5h</aus:FNR>
      <aus:STICHTAG>2015-12-22</aus:STICHTAG>
      <aus:UMFANG>Kurzinformation</aus:UMFANG>
    </aus:AUSZUG_V2_REQUEST>
  </soap:Body>
</soap:Envelope>
```

Other operations available (same endpoint): `SUCHEURKUNDEREQUEST` (documents by
FNR), `VERAENDERUNGENFIRMAREQUEST` / `VERAENDERUNGENURKUNDEREQUEST` (change feeds,
date-ranged, optionally filtered by GERICHT/RECHTSFORM).

## Unknown until the key exists

- **Response XML schema** — the WSDL is behind the 401. Do NOT write the response
  parser speculatively; fetch the WSDL first, then parse.
- `UMFANG` values beyond `Kurzinformation` (a fuller extract level presumably
  carries the officer list — verify which level includes "involved persons").
- Rate limits (unpublished — ask when requesting the production key).

## Build plan for the unblock session

1. Fetch the WSDL with the key; read `AUSZUG_V2` response schema.
2. Executor `apps/api/src/capabilities/austrian-company-data.ts`:
   - Input: `fn_number` | `company_name` (+ `name`/`query`/`task` aliases),
     `required: []` + anyOf branches, same pattern as norwegian.
   - Name path: `SUCHEFIRMAREQUEST` with `EXAKTESUCHE=true` first; on miss retry
     `EXAKTESUCHE=false` and score candidates with `classifyNameMatch`
     (exact wins / unique high / refuse ties) — same doctrine as FI/NO/DE/US.
   - Extract path: `AUSZUG_V2_REQUEST` at the UMFANG level that includes officers.
   - `AbortSignal.timeout` on all calls; XML parsing via the same lib other
     SOAP-consuming code uses (check `swift-message-parse` neighbours; if none,
     `fast-xml-parser` is already in the dependency tree — verify before adding).
   - Provenance: `acquisition_method: "direct_api"`, license CC BY 4.0, attribution
     "Quelle: Bundesministerium für Justiz / Firmenbuch" (CC BY requires it).
   - Evidence-Tier canonical aliases + `ubo_availability: "restricted"` (WiEReG is
     legally gated — see kyb-coverage-research.md; never claim UBO here).
3. Manifest with `gdpr_art_22_classification: data_lookup`, officers ⇒
   `processes_personal_data: true`, `personal_data_categories: [name, professional]`
   (the PII enum has no "officers" value — FI/NO/EE use name + professional for
   the same data; gate at onboarding-gates.ts rejects unknown categories).
4. Full pipeline: `onboard.ts --discover --strict`, validate-capability,
   smoke-test, readiness. Health-check input: a stable large company FN.
5. Re-enable AT solutions (kyb-essentials-at etc.) ONLY after step-1 verified —
   they are currently contained (2026-08-12) because step-1 always threw.
