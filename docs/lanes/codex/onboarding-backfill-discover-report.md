# Onboarding backfill + discover report

## Outcome

Backfill discovery now keeps a reviewed snapshot of every capability field whose `FIELD_CATEGORIES` entry is `manifest`. Discovery can still update fixtures and produce enriched review YAML, but those newly observed manifest-canonical values are restored to the reviewed values before capability persistence. Onboard mode remains additive.

Discovery notices use code `discovered_fields_not_applied` and the required message. They contain only identifier-shaped output keys and no output values. Discovery logging now lists field names without values.

## Files changed

- `apps/api/src/lib/onboarding-pipeline.ts`
  - Return the unlisted output keys observed during discovery.
  - Avoid logging executor output values.
  - Restore all manifest-canonical fields from the reviewed backfill manifest by consulting `FIELD_CATEGORIES` before persistence.
  - Preserve the enriched discovery YAML and add the non-failing review notice.
- `apps/api/src/lib/onboarding-pipeline.test.ts`
  - Add the regression coverage described below.
- `docs/lanes/codex/onboarding-backfill-discover-report.md`
  - This report.

## Tests added and what they pin

1. **Backfill with an extra `format` field.** Pins that the run succeeds, the review YAML includes `format`, the persisted reliability map remains the reviewed map, and the result includes the fixed `discovered_fields_not_applied` notice naming `format`.
2. **Onboard with the same extra field.** Pins the intentionally unchanged behavior: a new capability persists the discovered `format` reliability entry and receives no backfill-only notice.
3. **Values never leak.** Pins that a sentinel executor value appears in neither the notice nor `onMessage` output, that a non-identifier key is excluded from the notice, and that an identifier-shaped key is still named when its value is `null`.

With the implementation temporarily replaced by the branch's original `apps/api/src/lib/onboarding-pipeline.ts`, the test file failed in the new backfill and value-leak cases (exit 1). The onboard assertion passed against the original implementation because it deliberately pins behavior that this change must not alter.

## Commands and results

- `npm ci` — **failed** during `c2pa-node` postinstall because the environment could not reach `raw.githubusercontent.com` (`ENETUNREACH`).
- `npm ci --ignore-scripts` — **passed**; installed the locked dependencies without the network-dependent postinstall. npm reported the existing Node 20 versus Node 22 engine warnings and existing audit findings.
- `cd apps/api && npx vitest run src/lib/onboarding-pipeline.test.ts` with the original pipeline implementation temporarily restored — **failed as expected** (2 new regression cases failed; exit 1). The changed implementation was restored immediately afterward without using stash or checkout.
- `cd apps/api && npx vitest run src/lib/onboarding-pipeline.test.ts` — **passed**: 1 file, 28 tests.
- `npm run build --workspace=packages/mcp-server && npm run build --workspace=packages/sdk-typescript` — **passed**.
- `cd apps/api && npx vitest run src/lib/onboarding-pipeline src/routes/internal-onboarding src/lib/capability-field-authority src/lib/onboarding-gates` — **passed**: 5 files, 114 tests.
- `npm run typecheck` — **passed** across the API, API scripts, TypeScript SDK, LangChain, Semantic Kernel, MCP server, AI SDK, and CLI workspaces.
- `cd apps/api && npx vitest run` — **failed**: 3 files failed, 470 passed, 46 skipped; 4 tests failed, 10,088 passed, 457 skipped. Every failure was an unrelated performance threshold:
  - `src/lib/company-enrich/structured-metadata.test.ts` — `lowercases a page made of millions of İ quickly` took about 1249 ms against a 1000 ms threshold.
  - `src/capabilities/lib/stripped-text-length.test.ts` — `stays linear where the regexes were quadratic` took about 1041 ms against a 1000 ms threshold; `stay fast when every step of the window extension has new openers` took about 204 ms against a 200 ms threshold.
  - `src/capabilities/url-to-markdown-parse-bound.test.ts` — `converts 16 MiB of ordinary text without blocking, and keeps its words` observed about 634 ms against a 500 ms threshold.
- `cd apps/api && npx vitest run src/lib/company-enrich/structured-metadata.test.ts src/capabilities/lib/stripped-text-length.test.ts src/capabilities/url-to-markdown-parse-bound.test.ts` — **failed** again on the same unrelated performance surfaces (4 threshold failures across the same 3 files). The exact set varied slightly: the metadata suite's 16 MB case also crossed its 1000 ms threshold while the window-extension case passed.
- `cd apps/api && npx vitest run src/lib/onboarding-pipeline.test.ts && npx vitest run src/lib/onboarding-pipeline src/routes/internal-onboarding src/lib/capability-field-authority src/lib/onboarding-gates && npx tsc --noEmit --project tsconfig.json` — **passed after review fixes**: 28 pipeline tests, 114 targeted tests, and API typecheck.

## Independent review

The required independent technical + product review found one medium issue (the persistence assertion used subset matching) and one low issue (null-valued output keys were not named). Both were fixed with exact reliability-map equality and notice derivation directly from executor output keys; the targeted suites were rerun successfully afterward.

## Not done

- No authority taxonomy, authority-check ordering, workflow defaults, or workflow files were changed.
- No production database, executor, upstream, or capability readiness check was used; the work and its targeted tests are offline and mocked as required by the brief.
- The full API suite is not green in this environment because of the unrelated performance-threshold failures listed above. The targeted suites and typecheck are green.
