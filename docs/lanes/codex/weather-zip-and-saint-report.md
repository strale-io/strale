Intent: report for the `weather-zip-and-saint` brief: `weather-lookup` reads a leading "St"/"St." as "Saint", and ZIP-suffixed US places are pinned by tests.

# Report: weather-zip-and-saint

Built by a Claude builder after two empty Codex runs: task_e_6afcc377ce94832999ea7f40072bf6c8, task_e_6afccafe09848329a9c377dceb336450.

## Files changed

- `apps/api/src/capabilities/weather-lookup.ts`
  - `saintSpelling(name)`: "St Cloud" / "St. Cloud" (any case, whole leading word followed by a space) becomes "Saint Cloud"; any other name gives undefined, so "Stockholm", "Staten Island" and "Westminster" are untouched.
  - `geocodePlaceName(name, count)`: looks the name up; only when the geocoder returns no hits and `saintSpelling` applies, looks it up once more with "Saint". At most one extra lookup per looked-up name.
  - `resolvePlace` uses `geocodePlaceName` for every lookup: the direct lookup, the no-comma bare-name retry, the trailing-"City" rule, the no-comma qualifier loop and the comma path's leading part. The brief names three of these; the bare-name retry and "City" rule were included too so "St Cloud 56301" behaves the same way. The "City" rule still requires `norm(hit.name) === norm(name)`, unchanged.
  - `exactNameMatch`: after punctuation is removed, a leading `st` word on either side is compared as `saint`, so "St Cloud" matches a hit named "Saint Cloud" and "Saint Cloud" matches a hit named "St. Cloud".
- `apps/api/src/capabilities/weather-lookup.test.ts`: a new `describe` block with six tests (below). No existing test changed.

"Ste"/"Sainte" are out of scope and not handled.

## Tests added

| Test | Against `main` (a321acfd) | After |
|---|---|---|
| "Brooklyn, NY 11206" resolves to Brooklyn, New York | pass | pass |
| "Wildwood, FL 34785" resolves to Wildwood, Florida | pass | pass |
| "St Cloud, Minnesota" resolves to Saint Cloud, Minnesota (marked) | **fail** | pass |
| "St. Cloud MN" resolves to the same hit (marked) | **fail** | pass |
| "Saint Cloud MN" matches a hit named "St. Cloud" (extra, covers the `exactNameMatch` reverse direction) | **fail** | pass |
| "Stockholm" looks up "Stockholm" only, no "Saint" lookup | pass | pass |

**The ZIP tests needed no code change.** `cleanPart` already drops the ZIP, so both passed against `main` unchanged and stay as regression tests.

## Fail-before evidence

The edited `weather-lookup.ts` was saved to scratch, `git checkout HEAD -- apps/api/src/capabilities/weather-lookup.ts` restored the `main` version, and the new test file was run against it:

```
× reads 'St' as 'Saint' in 'St Cloud, Minnesota'
× reads 'St.' as 'Saint' in 'St. Cloud MN' (no comma)
× matches a hit spelled 'St. Cloud' when the caller writes 'Saint Cloud MN'
Tests  3 failed | 47 passed (50)
```

The edited source was then copied back.

## Results (from `apps/api`)

- `npx vitest run src/capabilities/weather-lookup.test.ts`: `Test Files 1 passed (1)`, `Tests 50 passed (50)`.
- `npm run typecheck`: passes (exit 0), after `npm --workspace=packages/mcp-server run build` produced the `strale-mcp/tools` build it imports.

## Not done

- Nothing in the brief was left undone. No live geocoder call was made (none allowed); the fixtures follow the brief.

`Next authorised action: Claude review of claude/busy-noether-1zicfi | Owner: Strale master | Blocker: none`
