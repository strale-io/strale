Intent: Codex builder brief: make `weather-lookup` resolve "St"/"St." as "Saint" in place names, and pin with tests that a trailing US ZIP code after a state does not stop a place resolving.

# Brief: weather-zip-and-saint

- **Requester:** the Strale master (session_01RFNL6ScBcPoMYb3sPeaj8r), 2026-11-17. From the 2026-11-17 morning run (`handoff/_general/from-code/2026-11-17-checkin-morning.md`, "Paying failures"): paid x402 `weather-lookup` calls refused "Brooklyn, NY 11206", "Wildwood, FL 34785" and "St Cloud, Minnesota". Some of those calls came before #1085/#1088 deployed.
- **Branch:** push only `codex/weather-zip-and-saint`, cut from `main` at the commit holding this brief. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only. No secrets, no production data, no network: use `fakeOpenMeteo` in the test file. The place names here are public and may be used in tests.
- **Read first:** `apps/api/src/capabilities/weather-lookup.ts` (`norm`, `exactNameMatch`, `cleanPart`, `resolvePlace`) and `apps/api/src/capabilities/weather-lookup.test.ts` (`fakeOpenMeteo`).

## What to build

Change only `apps/api/src/capabilities/weather-lookup.ts` and `apps/api/src/capabilities/weather-lookup.test.ts`. No manifest, schema, route, migration or environment change.

### 1. Trailing ZIP code (tests first)

`cleanPart` already removes digit runs of three or more from each comma part, so "Brooklyn, NY 11206" should look up "Brooklyn" with qualifier "NY". Add the tests below. If they pass against `main` unchanged, keep them as regression tests and say so in the report; change code only if one fails, and then explain why.

### 2. "St" / "St." means "Saint" in the leading place name

GeoNames, behind the Open-Meteo geocoder, often stores "Saint Cloud" where callers write "St Cloud" or "St. Cloud".

- In `resolvePlace`: when the geocoder returns no hits for a looked-up name whose first word is `St` or `St.` (any case), look it up once more with that word replaced by `Saint`, and go on with those hits. Apply this wherever a name is looked up: the direct lookup, the comma path's leading part, and the no-comma qualifier loop. Do not add more than one extra lookup per looked-up name.
- In `exactNameMatch`: treat a leading `st`/`st.` word and `saint` as equal on both sides, so "St Cloud" matches a hit named "Saint Cloud" and "Saint Cloud" matches a hit named "St. Cloud".
- Only a whole leading word counts: "Stockholm", "Staten Island" and "Westminster" are unchanged. "Ste"/"Sainte" are out of scope.

## Tests (in `weather-lookup.test.ts`, with `fakeOpenMeteo`)

- "Brooklyn, NY 11206" with hits for "Brooklyn" `[Brooklyn (US, New York), Brooklyn (US, Michigan)]` resolves to the New York hit.
- "Wildwood, FL 34785" with hits for "Wildwood" `[Wildwood (US, New Jersey), Wildwood (US, Florida)]` resolves to the Florida hit.
- "St Cloud, Minnesota" where "St Cloud" returns nothing and "Saint Cloud" returns `[Saint Cloud (US, Minnesota), Saint Cloud (US, Florida)]` resolves to the Minnesota hit. Must fail against `main`.
- "St. Cloud MN" (no comma) resolves to the same hit. Must fail against `main`.
- "Stockholm" still looks up "Stockholm" only (assert the fake saw no "Saint…" lookup).
- Every existing test still passes unchanged.

## Done means

- `npm run typecheck` and `npx vitest run src/capabilities/weather-lookup.test.ts` (from `apps/api`) pass.
- Report at `docs/lanes/codex/weather-zip-and-saint-report.md`: the files changed, fail-before evidence for each marked test (failing on `main`, passing after), whether the ZIP tests needed a code change, the vitest output, and anything you could not do.
- Run `npm run context:generate` and commit any change it makes.

`Next authorised action: Claude review of codex/weather-zip-and-saint | Owner: Strale master | Blocker: none`
