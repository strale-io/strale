# Weather place qualifiers round-2 report

## Files changed

- `apps/api/src/capabilities/weather-lookup.ts`
  - requires an exact normalized geocoder name on no-comma qualifier splits;
  - does not repeat the trailing-`City` lookup as the one-word qualifier split;
  - preserves the five-call geocoder bound across postcode, `City`, and qualifier retries;
  - skips blank string aliases when selecting the caller's place input.
- `apps/api/src/capabilities/weather-lookup.test.ts`
  - covers fuzzy-name rejection, moving to the correct later split, unique bounded calls in the worst case, and blank-alias fallback.
- `docs/lanes/codex/weather-place-qualifiers-2-report.md`
  - records the round-2 implementation and verification evidence.

## Fail-before evidence

Against the round-1 implementation, `npx vitest run src/capabilities/weather-lookup.test.ts` ran 21 tests and failed all four new regression cases:

- `refuses a namesake outside the unpunctuated qualifier without forecasting` resolved the fuzzy `Paris Mountain` hit in Texas instead of refusing without a forecast;
- `tries the next split when a longer name lookup returns a fuzzy hit` returned the fuzzy Virginia result instead of continuing to Charleston in West Virginia;
- `bounds the worst-case City and postcode retries without repeating a lookup` observed four unique names across five geocoder calls because the trailing-`City` name was requested twice;
- `skips blank location aliases when choosing a place name` stopped at the blank `city` value and threw the required-input error instead of resolving `place: "London"`.

After the implementation, the same command passed all 21 tests.

For the call-bound fail-before, the repository mutation runner temporarily restored the round-1 one-word `City` split and removed the `4 - retryCalls` cap. The worst-case test then observed six geocoder calls and failed `expected 6 to be less than or equal to 5`. The runner restored the implementation and the suite passed again (`MUTATION CAUGHT — green → red → green`). A separate mutation that only restored the repeated one-word `City` split also failed the unique-name assertion, demonstrating that the same worst-case test independently enforces non-repetition.

## Verification

- `npx vitest run src/capabilities/weather-lookup.test.ts`: passed, 21 tests in one test file.
- `npx tsc --noEmit -p apps/api`: passed with no diagnostics.
- `npm run context:generate`: passed in an isolated worktree, generated 13 project-context files, and produced no change to `docs/project/legacy-authority-inventory.json`.

The additional onboarding validator could not run without the deliberately unavailable `DATABASE_URL` (`DATABASE_URL is required for a read-only operator handle`). A smoke test was not run because this brief requires fake Open-Meteo only and forbids a real geocoder/network call. This round changes no manifest, schema, route, migration, vendor, or output shape.

No test called the network, database, email service, or used personal data. Weather and geocoder responses came from `fakeOpenMeteo`.

`Next authorised action: Claude review of codex/weather-place-qualifiers-2 | Owner: Strale master | Blocker: none`
