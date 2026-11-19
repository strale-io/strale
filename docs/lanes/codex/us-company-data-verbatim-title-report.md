# us-company-data-verbatim-title report

## Files changed

- `apps/api/src/capabilities/us-company-data.ts` — recognizes the model-extracted company name only when it is a bounded, case-insensitive verbatim span of the caller's text (with whitespace runs treated equivalently), then resolves that caller-authored span through the SEC title map as `title_in_text`.
- `apps/api/src/capabilities/us-company-data.test.ts` — covers successful title-in-text resolution, caller-casing preservation, model rephrasing, word boundaries, missing/ambiguous title hits, and the unchanged search fallback.
- `docs/lanes/codex/us-company-data-verbatim-title-report.md` — this report.

## Fail-before evidence

The requested tests were run with the new tests present and `us-company-data.ts` restored to commit `7915320`.

- **Must fail against `main`: `Look up Oracle Corp for me`.** Failed because the old implementation proceeded to SEC full-text search, whose mocked response was HTTP 404: `Error: SEC EDGAR search returned HTTP 404`, from `searchEdgar` at `us-company-data.ts:106`.
- **Must fail against `main`: caller casing for `please check bank of america corp`.** Failed for the same reason: `Error: SEC EDGAR search returned HTTP 404`, from `searchEdgar` at `us-company-data.ts:106`.

The complete fail-before run reported `3 failed | 24 passed`; the additional expected failure was the new missing/ambiguous-title assertion, because the old implementation never consulted the title map for the extracted span.

## Verification

From `apps/api`:

```text
$ npx vitest run src/capabilities/us-company-data.test.ts
Test Files  1 passed (1)
Tests  27 passed (27)
Duration  2.75s

$ npm run typecheck
> tsc --noEmit
(exit 0)
```

From the repository root, `npm run context:generate` was also run as required.

## Could not do

Nothing required by the brief was left undone. Tests used only the existing mocks and made no real SEC or Anthropic requests.

`Next authorised action: Claude review of codex/us-company-data-verbatim-title | Owner: Strale master | Blocker: none`
