# Weather exact-name qualifiers — round 2 report

## Files changed

- `apps/api/src/capabilities/weather-lookup.ts` — treats hyphens and the specified dash characters as spaces during exact-name comparison, and lets an empty qualified exact-name search fall back to all geocoder hits while preserving ambiguity refusals.
- `apps/api/src/capabilities/weather-lookup.test.ts` — adds the Bombay regression and Winston-Salem spelling coverage required by the brief.
- `docs/lanes/codex/weather-exact-name-qualifiers-2-report.md` — this report.

No manifest, schema, route, migration, or environment change was made.

## Fail-before evidence

With the two new tests added and the implementation still at the round-1 behaviour from `fcd0c051`, I ran from `apps/api`:

```text
$ npx vitest run src/capabilities/weather-lookup.test.ts -t "Bombay|Winston Salem"

Test Files  1 failed (1)
Tests       2 failed | 42 skipped (44)
```

- `falls back to a qualified loose-name hit for 'Bombay, IN'` failed with `places named "Bombay" exist, but none in IN` because exact Bombay hits existed outside India and the comma path did not inspect the Indian loose-name hit.
- `matches a hyphenated geocoder name for 'Winston Salem NC'` failed with `places named "Winston Salem" exist, but none in NC` because `Winston-Salem` normalized differently from `Winston Salem`.

The same focused command passed both tests after the implementation.

## Requested test-file output

Run from `apps/api`:

```text
$ npx vitest run src/capabilities/weather-lookup.test.ts

Test Files  1 passed (1)
Tests       44 passed (44)
Duration    1.11s
```

This includes every existing round-1 Washington, Sacramento, and Richmond case unchanged.

## Other verification and limitations

- `npm run build --workspace=packages/sdk-typescript && npm run typecheck` passed. Building the SDK first was necessary because downstream workspace typechecks import its generated output.
- `npm test` reached an unrelated timing assertion in `src/capabilities/url-to-markdown-parse-bound.test.ts`: `converts 16 MiB of ordinary text without blocking, and keeps its words` took 2843 ms. The run was stopped after that failure; the focused weather suite remained green.
- `npx tsx scripts/validate-capability.ts --slug weather-lookup` and `npx tsx scripts/smoke-test.ts --slug weather-lookup` could not open their read-only operator handle because this environment has no `DATABASE_URL`. Readiness could not be queried for the same reason. No credential or production-data workaround was attempted.
- The initial `npm ci` could not download `c2pa-node` test certificates because the environment could not reach `raw.githubusercontent.com`; `npm ci --ignore-scripts` installed the locked dependencies without running that unrelated postinstall.
- `npm run context:generate` correctly refused to run in the shared primary worktree. The generator was then run successfully from an isolated temporary worktree and reported `generated 13 non-authoritative project-context files`; it produced no tracked diff.

`Next authorised action: Claude review of codex/weather-exact-name-qualifiers-2 | Owner: Strale master | Blocker: none`
