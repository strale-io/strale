# Weather place qualifiers round-3 report

## Files changed

- `apps/api/src/capabilities/weather-lookup.ts`
  - maps all 50 US state codes plus DC to Open-Meteo `admin1` names;
  - applies one state-or-country selection rule to both comma and no-comma qualifiers and refuses genuinely ambiguous two-letter codes;
  - removes the dead retry counter/cap while retaining the five-call maximum;
  - avoids all follow-up geocoder calls when an unsuccessful input differs only by whitespace.
- `apps/api/src/capabilities/weather-lookup.test.ts`
  - covers ambiguous Richmond and Dublin results, state-only and country-only interpretations, full names, unchanged country-code behaviour, and whitespace-only input;
  - retains the round-2 worst-case five-call bound and mutation check.
- `docs/lanes/codex/weather-place-qualifiers-3-report.md`
  - records implementation and verification evidence for this final round.

`npm run context:generate` regenerated 13 project-context files in an isolated temporary worktree. The generated `docs/project/legacy-authority-inventory.json` was byte-for-byte unchanged, so it is not included in this change.

## Fail-before evidence

The new tests were run with `apps/api/src/capabilities/weather-lookup.ts` temporarily restored from `640b1c1a`, while retaining the new tests. The focused run failed all five Richmond, Dublin, and Austin cases:

- `Richmond CA` and `Richmond, CA` both forecast Richmond, British Columbia instead of refusing the state/country ambiguity;
- `Dublin CA` forecast Dublin, Ontario instead of refusing the ambiguity;
- `Austin TX` and `Austin, TX` both returned `Location ... none in TX` instead of selecting Austin, Texas.

The focused whitespace regression also failed against `640b1c1a`: `New  York` made the collapsed-name retry and resolved instead of stopping after its one direct geocoder call. With the round-3 implementation restored, the complete file passed all 33 tests, including the full-name and sole-interpretation cases (`Richmond California`, `Paris FR`, `Toronto CA`, and `Sacramento CA`) and qualifier-order invariance.

For the retry-cap requirement, `Math.min(3, words.length - 1)` was temporarily mutated to `Math.min(4, words.length - 1)`. The retained worst-case test failed with `expected 6 to be less than or equal to 5`. Restoring the implementation returned the complete suite to green. This demonstrates that the five-call test still catches a broken bound after removal of the dead `retryCalls` term.

## Verification

- `npx vitest run src/capabilities/weather-lookup.test.ts` (from `apps/api`): passed, 33 tests in one file.
- `npx tsc --noEmit -p apps/api`: passed with no diagnostics.
- `npm run context:generate`: passed in an isolated temporary worktree and generated 13 files; `docs/project/legacy-authority-inventory.json` did not change.

The tests used `fakeOpenMeteo`; no test called the network, database, email service, or used personal data. No manifest, schema, route, migration, vendor, or output-shape change was made. The recorded populated-place feature-code follow-up remains out of scope.

`Next authorised action: Claude review of codex/weather-place-qualifiers-3 | Owner: Strale master | Blocker: none`
