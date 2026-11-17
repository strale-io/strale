# Weather exact-name qualifiers report

## Files changed

- `apps/api/src/capabilities/weather-lookup.ts` — added one punctuation-tolerant exact-name rule and used it for both unpunctuated qualifiers and comma-separated qualifiers; comma resolution now narrows to exact-name hits when any exist.
- `apps/api/src/capabilities/weather-lookup.test.ts` — added fake Open-Meteo coverage for Washington, Sacramento, and the required unchanged ambiguity and first-hit behaviour.
- `docs/lanes/codex/weather-exact-name-qualifiers-report.md` — this report.

No manifest, schema, route, migration, environment, or production-data change was made.

## Fail-before evidence

Before changing `weather-lookup.ts`, I ran:

```text
cd apps/api
npx vitest run src/capabilities/weather-lookup.test.ts -t "punctuation-tolerant exact name|ignores a loose namesake"
```

The command reported `2 failed | 2 passed | 38 skipped`:

- `resolves the punctuation-tolerant exact name 'Washington DC' to Washington, D.C.` failed with `places named "Washington" exist, but none in DC`. The parameterized test also covers `Washington, DC` (the other marked pre-change failure) and `Washington D.C.`.
- `ignores a loose namesake when resolving exact-name 'Sacramento, CA'` failed with the state/country ambiguity error because `Sacramento Valley` in Ontario was still included.

After the implementation, the focused required-behaviour run reported `8 passed | 34 skipped`, including all three Washington spellings, Washington PA, bare Washington, Sacramento CA, and both Richmond CA ambiguity variants:

```text
npx vitest run src/capabilities/weather-lookup.test.ts -t "punctuation-tolerant exact name|Washington PA|first hit for unqualified|ignores a loose namesake|refuses ambiguous state"
```

## Requested test-file output

Run from `apps/api`:

```text
$ npx vitest run src/capabilities/weather-lookup.test.ts

Test Files  1 passed (1)
Tests       42 passed (42)
Duration    1.08s
```

## Other verification and limitations

- `npm run typecheck` passed after building the TypeScript SDK dependency (`npm run build --workspace=packages/sdk-typescript`).
- `npm test` reached an unrelated existing timing assertion in `src/lib/company-enrich/structured-metadata.test.ts`: `finishes the worst known 16 MB page well under a second` took 1061 ms. The run was stopped after that failure; the focused weather suite remained green.
- `npx tsx scripts/validate-capability.ts --slug weather-lookup` and `npx tsx scripts/smoke-test.ts --slug weather-lookup` could not open their read-only operator handle because this environment has no `DATABASE_URL`. No credential or production-data workaround was attempted.
- The initial `npm ci` could not download `c2pa-node` test certificates because the container could not reach `raw.githubusercontent.com`; `npm ci --ignore-scripts` installed the locked dependencies without running that unrelated postinstall.
- `npm run context:generate` refused to run in the primary worktree. It was subsequently run from an isolated temporary worktree as required by the generator.
