Intent: Codex builder brief: make `weather-lookup` resolve "Washington DC" and "Sacramento, CA", which refuse today, without ever returning weather for a different place of the same name.

# Brief: weather-lookup, punctuation-tolerant exact names and exact-name ambiguity on the comma path

- **Requester:** the Strale master (session_01Ms71ZnJsKfZn5eCYBzr5kL), 2026-11-17, on Petter's go-ahead ("start the failed weather calls").
  - Source: the "Open LOW findings" of strale-io/strale#1085 and `handoff/_general/from-code/2026-11-17-weather-and-listings.md`, items 1 and 2. A refused call is not charged, so each refusal is lost revenue.
  - This replaces the brief `weather-qualifier-followups`, whose Codex task ended with no diff. The work is the same.
- **Branch:** push only `codex/weather-exact-name-qualifiers`, cut from `origin/main` at 5a622498. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only. No secrets and no production data. The place names below are public and may be used in tests.
- **Read first:**
  - `apps/api/src/capabilities/weather-lookup.ts` (all of it: `norm`, `resolvePlace`, `qualifiedHits`, `hitMatchesQualifiers`, the no-comma split with `exactNameHits`, and the comma path);
  - `apps/api/src/capabilities/weather-lookup.test.ts` (the `fakeOpenMeteo` pattern; copy it, never call the real geocoder in tests);
  - `docs/lanes/codex/weather-place-qualifiers-brief.md` (the earlier contract, still in force).

## What to build

All changes are in `weather-lookup.ts` and its test file. No manifest, schema, route, migration or environment change.

### 1. Exact names that differ only in punctuation

Open-Meteo, checked live on 2026-11-17:
- `name=Washington` returns `Washington D.C.` first (country_code US, admin1 "District of Columbia", feature_code PPLC), then Washington in Pennsylvania, Indiana and other states;
- `name=Washington DC` and `name=Washington, DC` return no results;
- `name=Washington D.C.` returns the DC hit.

So "Washington DC" and "Washington, DC" refuse today: the exact-name filter drops `Washington D.C.` because its name is not "Washington".

Count a hit as an exact-name match when its name, with punctuation removed and spaces collapsed, equals either the looked-up name or the looked-up name followed by the qualifier. Example: "Washington D.C." becomes "washington dc", which equals "washington" + " " + "dc". Use this one rule in both places: the no-comma split (where `exactNameHits` is built) and the comma path.

### 2. The comma path checks ambiguity on exact-name hits

The comma path passes every geocoder hit to `qualifiedHits(hits, qualifiers, city)`, including hits whose name only contains the looked-up name. So "Sacramento, CA" can refuse as ambiguous when the response also holds a loose Canadian hit such as "Sacramento Valley" in Ontario.

When any hit is an exact-name match (the rule in item 1), pass only the exact-name hits. When none is, keep today's behaviour.

Not in scope: preferring populated-place feature codes (a recorded follow-up).

## Tests (in `weather-lookup.test.ts`, with `fakeOpenMeteo`)

Fake responses copy the live shapes above. Write each new test so that it fails against the current code where marked.

- "Washington DC", "Washington, DC" and "Washington D.C." resolve to the DC hit (the first two must fail before your change).
- "Washington PA" resolves to Pennsylvania.
- "Washington" alone keeps the first hit, as today.
- "Sacramento, CA" with hits `[Sacramento Valley (CA, Ontario), Sacramento (US, California)]` resolves to California (must fail before your change).
- "Richmond, CA" with exact hits in British Columbia and California still refuses as ambiguous.
- Every existing test still passes unchanged.

## Done means

- `npm run typecheck` and `npm test` pass.
- Report at `docs/lanes/codex/weather-exact-name-qualifiers-report.md`: the files changed, the fail-before evidence (name each marked test and show it failing before and passing after), the output of `npx vitest run src/capabilities/weather-lookup.test.ts` run from `apps/api`, and anything you could not do.
- Run `npm run context:generate` and commit any change it makes.

`Next authorised action: Claude review of codex/weather-exact-name-qualifiers | Owner: Strale master | Blocker: none`
