# Codex brief: weather-place-qualifiers-2 (round 2)

Branch: `codex/weather-place-qualifiers-2`, cut from `codex/weather-place-qualifiers`, which already holds round 1 (PR strale-io/strale#1085). Push only this branch. Do not touch `main`.

Context: read `docs/lanes/codex/weather-place-qualifiers-brief.md` (the round-1 contract, which still holds) and `docs/lanes/codex/weather-place-qualifiers-report.md`. An independent review returned NO-GO at e70ff0fb. Fix the items below in `apps/api/src/capabilities/weather-lookup.ts` and `apps/api/src/capabilities/weather-lookup.test.ts` only. Tests use `fakeOpenMeteo`: no network, no database, no real emails or personal data.

1. **Exact name on the qualifier split (blocking).** In the no-comma qualifier split, accept a hit only when `norm(hit.name) === norm(<the name part that was looked up>)` AND `hitMatchesQualifiers(hit, [qualifier])`, the same exact-name guard the trailing-"City" rule uses. Open-Meteo matches names fuzzily, so without the guard "Paris Texas" can return a hit named "Paris Mountain" in Texas, and "Charleston West Virginia" can take a fuzzy hit for "Charleston West" in Virginia before the correct split ("Charleston" + "West Virginia") is tried. With the guard, a truncated name never matches and the loop moves on. Refusing a different spelling ("St Petersburg Florida" vs "Saint Petersburg") is accepted.
   Tests (fake geocoder, fuzzy hit listed first): "Paris Texas" with `[Paris FR, {name:"Paris Mountain", admin1:"Texas"}]` refuses with no forecast call; "Charleston West Virginia" where the "Charleston West" lookup returns a fuzzy Virginia hit and the "Charleston" lookup returns Charleston in West Virginia resolves to West Virginia.
2. **No repeated lookup after the City rule.** When the trailing-"City" rule ran and missed, do not run the 1-word qualifier split with qualifier "City" (it repeats the same geocoder call and the error ends "...but none in City"). Test: count calls for "a b c d e City 12345"; the same name is never looked up twice.
3. **A call-bound test that can fail.** Replace the five-word bound test with the worst case "a b c d e City 12345" and assert at most 5 geocoder calls. Show the test failing with the `4 - retryCalls` cap removed (fail-before), then passing.
4. **Blank strings are absent.** When choosing the input among `location`/`city`/`place`, skip strings that are empty after trimming, so `{city:"   ", place:"London"}` resolves London.

Leave the comma path as it is (a separate follow-up). Still no manifest, schema, route or migration change.

## Report

Write `docs/lanes/codex/weather-place-qualifiers-2-report.md`: the files changed, fail-before evidence for each new test (the test failing against round-1 code, then passing), and the output of `npx vitest run src/capabilities/weather-lookup.test.ts` and `npx tsc --noEmit -p apps/api`. Then run `npm run context:generate` and commit any change to `docs/project/legacy-authority-inventory.json`.
