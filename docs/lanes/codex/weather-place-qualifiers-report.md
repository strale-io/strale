# Weather place qualifiers report

## Files changed

- `apps/api/src/capabilities/weather-lookup.ts`
  - accepts the string input alias `place` and treats non-string location keys as absent;
  - resolves unpunctuated country or region qualifiers without falling back to an unqualified namesake;
  - resolves a trailing `City` only when the geocoder's returned name is an exact normalized match;
  - bounds direct and retry geocoding to five calls per request and retains actionable mismatch errors.
- `apps/api/src/capabilities/weather-lookup.test.ts`
  - covers the new alias, input type handling, qualifier matching, namesake refusal, trailing-`City` safety, direct-hit behavior, and call bound.

## Fail-before evidence

Before changing the implementation, `npx vitest run src/capabilities/weather-lookup.test.ts` ran 19 tests and failed five new tests. In particular:

- `resolves a country qualifier without a comma` failed because `Lagos Nigeria` returned `Location "Lagos Nigeria" not found.`;
- `takes the qualified Hyderabad even when Pakistan is listed first` failed because `Hyderabad India` returned `Location "Hyderabad India" not found.`;
- `resolves a trailing City only when the returned name is exact` failed because `Luxembourg City` returned `Location "Luxembourg City" not found.`;
- `accepts place as an alias and treats a non-string city as absent` failed on the unrecognized `place` input.

After the implementation, the same command passes all 19 tests.

## Limitations

The first `npm ci` attempt could not download `c2pa-node` test certificates because the environment returned `ENETUNREACH`. Dependencies were installed with `npm ci --ignore-scripts`; no production API or real geocoder was called. All weather tests use `fakeOpenMeteo`.

The repository-wide `npm run typecheck` and `npm test` gates passed. The additional capability validator could not run without the deliberately unavailable `DATABASE_URL`, so its chained smoke test did not start.

`Next authorised action: Claude review of codex/weather-place-qualifiers | Owner: Strale master | Blocker: none`
