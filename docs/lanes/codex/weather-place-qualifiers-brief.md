Intent: Codex builder brief: make `weather-lookup` resolve the place strings paying callers actually send and currently get refused ("Lagos Nigeria", "Luxembourg City", a `place` key), without ever returning weather for a different place of the same name.

# Brief: weather-lookup, place qualifiers without a comma, and a `place` alias

- **Requester:** the Strale master (session_01Ms71ZnJsKfZn5eCYBzr5kL), 2026-11-16, on Petter's go-ahead ("start the failed weather calls").
  - Source: `handoff/_general/from-code/2026-11-15-checkin-morning.md`, item 2 and "Next session" item 5. In 7 days, about 19 paid weather calls were refused that the capability could have answered: 2 sent the place under a `place` key, 17 were place-name misses such as "Lagos Nigeria" and "Hyderabad India" (the country follows the name with no comma) and "Luxembourg City". Refusals are not charged, so each one is lost revenue (5 cents).
- **Branch:** push only `codex/weather-place-qualifiers`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only. No secrets and no production data. The place strings above are public place names and may be used in tests.
- **Read first:**
  - `apps/api/src/capabilities/weather-lookup.ts` (all of it: `resolvePlace`, `hitMatchesQualifiers`, `cleanPart`, the handler's input read);
  - `apps/api/src/capabilities/weather-lookup.test.ts` (the `fakeOpenMeteo` pattern; copy it, do not call the real geocoder in tests).

## What to build

All changes are in `weather-lookup.ts` and its test file. No manifest, schema, route, migration or environment change.

### 1. Accept `place` as an alias for `city`

The handler reads `input.city ?? input.location ?? input.task`. Add `input.place` after `location` and before `task`. Only take a value that is a string. Today a non-string value under any of these keys reaches `.trim()` and throws a `TypeError`; make a non-string value count as absent, so the call falls through to the existing "'city' (location name) or 'latitude'/'longitude' is required." refusal.

### 2. A country or region after the name, with no comma

This happens in `resolvePlace` only after the direct lookup of the whole string has missed, and only when the string has no comma. The existing postcode retry ("Flint 48505") stays, and runs first.

- Split the cleaned string into words. For each split that keeps at least one word as the name, try the last 1, then 2, then 3 words as the qualifier and the words before them as the name.
- Look the name up with `geocodeName(name, 20)`. Take the first hit for which `hitMatchesQualifiers(hit, [qualifier])` is true.
- If no split finds a hit that matches its qualifier, refuse. Never fall back to the top hit for the name alone: "Paris Texas" must not return Paris, France.
- The resulting cases:
  - "Lagos Nigeria" → Lagos in Nigeria;
  - "Hyderabad India" → Hyderabad in India, not Hyderabad in Pakistan;
  - "Rio de Janeiro Brazil" → a two-word split is not needed: the name "Rio de Janeiro", qualifier "Brazil";
  - "Paris Texas" → Paris in Texas when the geocoder lists it, otherwise refuse.
- Bound the work: at most 3 extra geocoder calls per request on this path.

### 3. A trailing "City"

Also after a direct miss and with no comma: when the last word is "city" (any case) and at least one word comes before it, look up the words before it. Take the first hit only when its `name` (the geocoder returns `name` on every hit; add it to `GeoHit`) equals the looked-up name after `norm()`. So "Luxembourg City" resolves to the city Luxembourg, and "Kansas City" is still looked up whole first and never turned into the state.

Order: the postcode retry first, then the trailing-"City" rule, then the qualifier splits. One request makes at most 5 geocoder calls in total.

### 4. Error text

A refusal on this path keeps the existing message shape. When some split found places with the name but none in the qualifier, say so, as the comma path does, and suggest latitude and longitude.

## Tests (in `weather-lookup.test.ts`, with `fakeOpenMeteo`)

Write each new test so that it fails against the current code.

- `{ place: "London" }` resolves; `{ city: 42 }` refuses with the required-input message, not a `TypeError`.
- "Lagos Nigeria" → the Nigerian hit, given a fake geocoder that knows "Lagos" (Nigeria and Portugal) but returns nothing for "Lagos Nigeria".
- "Hyderabad India", with Pakistan listed first → the Indian hit.
- "Paris Texas", with only Paris, France known → refuses, and no forecast call is made.
- "Luxembourg City" → the hit named "Luxembourg"; "Springfield City" with only a hit named "Springfield Township" → refuses.
- "Kansas City", known whole → resolved by the direct lookup with exactly one geocoder call.
- A five-word unknown string makes at most 5 geocoder calls (count them on the mock).
- The existing tests all still pass unchanged.

Fail-before: in your report, name at least two of the new tests that you saw fail before your change and pass after it.

## Done means

- `npm run typecheck` and `npm test` pass.
- Report at `docs/lanes/codex/weather-place-qualifiers-report.md`: the files changed, the fail-before evidence, and anything you could not do.

`Next authorised action: Claude review of codex/weather-place-qualifiers | Owner: Strale master | Blocker: none`

## Round 2 (independent review NO-GO at e70ff0fb)

Fix these on the same branch, keeping everything above. Add a section "Round 2" to the report with fail-before evidence for each new test.

1. **Exact name on the qualifier split (blocking).** In the no-comma qualifier split, accept a hit only when `norm(hit.name) === norm(<the name part that was looked up>)` AND `hitMatchesQualifiers(hit, [qualifier])`, the same exact-name guard the trailing-"City" rule uses. Open-Meteo matches names fuzzily, so without the guard "Paris Texas" can return a hit named "Paris Mountain" in Texas, and "Charleston West Virginia" can take a fuzzy hit for "Charleston West" in Virginia before the correct split ("Charleston" + "West Virginia") is tried. With the guard, a truncated name never matches and the loop moves on. Refusing a different spelling ("St Petersburg Florida" vs "Saint Petersburg") is accepted.
   Tests (fake geocoder, fuzzy hit listed first): "Paris Texas" with `[Paris FR, {name:"Paris Mountain", admin1:"Texas"}]` refuses with no forecast call; "Charleston West Virginia" where the "Charleston West" lookup returns a fuzzy Virginia hit and the "Charleston" lookup returns Charleston in West Virginia resolves to West Virginia.
2. **No repeated lookup after the City rule.** When the trailing-"City" rule ran and missed, do not run the 1-word qualifier split with qualifier "City" (it repeats the same geocoder call and the error ends "...but none in City"). Test: count calls for "a b c d e City 12345"; the same name is never looked up twice.
3. **A call-bound test that can fail.** Replace the five-word bound test with the worst case "a b c d e City 12345" and assert at most 5 geocoder calls. Show the test failing with the `4 - retryCalls` cap removed (fail-before), then passing.
4. **Blank strings are absent.** When choosing the input among `location`/`city`/`place`, skip strings that are empty after trimming, so `{city:"   ", place:"London"}` resolves London.

Leave the comma path as it is (a separate follow-up). Still no manifest, schema, route or migration change.
