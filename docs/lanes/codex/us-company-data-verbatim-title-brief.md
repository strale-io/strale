Intent: Codex builder brief: let `us-company-data` resolve free-text input exactly through the SEC title map when the company name the model extracts is a verbatim span of the caller's own text.

# Brief: us-company-data-verbatim-title

- **Requester:** the Strale master (session_01CR5YPsHShDjUSt2pPax4UV), 2026-11-19. Follow-up removed from #1091 on review (`handoff/_general/from-code/2026-11-17-checkin-morning.md`, "Work done"): an exact lookup on the model-extracted name would be "exact" against the model's wording, not the caller's. This brief closes that gap by accepting the extracted name only when it is the caller's own words.
- **Branch:** push only `codex/us-company-data-verbatim-title`, cut from `main` at the commit holding this brief. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only. No secrets, no production data, no network. Tests use the existing mocks in the test file (`@anthropic-ai/sdk` and `../lib/sec-ticker-map.js` are already mocked there). The company names here are public and may be used in tests.
- **Read first:** `apps/api/src/capabilities/us-company-data.ts` (the handler: title map, ticker map, then `extractCompanyName` + `searchEdgar`), `apps/api/src/lib/sec-ticker-map.ts` (`resolveByTitle`, `stripSecTitleAnnotation`), `apps/api/src/lib/company-name-match.ts` (`classifyNameMatch`, `normalizeCompanyName`), and `apps/api/src/capabilities/us-company-data.test.ts` (block "resolution order").

## The problem

Free-text input such as `"Look up Oracle Corp for me"` misses the title map (the whole string is not a title), so the handler asks the model for the name ("Oracle Corp") and then runs SEC full-text filing search on it. That search ranks filings, not registrants, so another filer that mentions Oracle can come first; the confidence gate then refuses the call or, worse, a partial match passes. The title map would have answered "Oracle Corp" exactly.

The model's answer cannot be trusted as the caller's words: it may rephrase ("IBM" to "International Business Machines") or invent. So a title-map hit on the extracted name counts only when that name appears verbatim in the input.

## What to build

Change only `apps/api/src/capabilities/us-company-data.ts` and `apps/api/src/capabilities/us-company-data.test.ts`. No manifest, schema, route, migration or environment change.

1. After `extractCompanyName(trimmed)` returns `extracted`, and before `searchEdgar`:
   - Find `extracted` in `trimmed` as a verbatim span: case-insensitive, runs of whitespace treated as one space, and bounded on both sides by the start/end of the string or a character that is not a letter or digit (so "Oracle" does not match inside "Oracles"). Surrounding quotes the model added are already stripped by `extractCompanyName`.
   - If and only if it is a verbatim span, call `resolveByTitle(span)` with the span **as it appears in the input** (not the model's casing). On a hit: set `cik`, `searchedName` to that span, `resolutionMethod` to a new value `"title_in_text"`, and `preResolvedMatch = classifyNameMatch(span, stripSecTitleAnnotation(hit.title))`, exactly as the existing title path does.
   - Otherwise (not a verbatim span, or no unambiguous title hit) keep today's behaviour: `searchEdgar(extracted)`, `resolutionMethod = "search"`.
2. Extend the `resolutionMethod` type and its comment with `"title_in_text"`, described as: "title map hit on a company name that appears verbatim in the caller's free text".
3. The ticker map is not consulted for the extracted span. The low-confidence gate and `allow_low_confidence` stay unchanged.

## Tests (in `us-company-data.test.ts`, existing mocks only)

Mark each "must fail against `main`" test in the report with its fail-before output.

- `"Look up Oracle Corp for me"`, model returns `Oracle Corp`, title map has `ORACLE CORP`: resolves to Oracle's CIK with `resolution_method: "title_in_text"`, `match_confidence: "exact"`, and the full-text search URL is never fetched. Must fail against `main`.
- `"please check bank of america corp"`, model returns `Bank of America Corp` (different casing): resolves via `title_in_text` and `searched_name` is `bank of america corp` (the caller's casing). Must fail against `main`.
- `"tell me about IBM"`, model returns `International Business Machines`: not a verbatim span, so the title map is not consulted for it and the full-text search runs as before (assert the search URL was fetched and `resolution_method` is `"search"`).
- `"Oracles of Delphi Inc filings"`, model returns `Oracle`: no match inside "Oracles"; falls to search.
- An extracted span whose title lookup is ambiguous or missing (mock `resolveByTitle` to return null): falls to search unchanged.
- `"Stripe"` still refuses (existing test unchanged).
- Every existing test still passes unchanged.

## Done means

- From `apps/api`: `npm run typecheck` and `npx vitest run src/capabilities/us-company-data.test.ts` pass.
- Report at `docs/lanes/codex/us-company-data-verbatim-title-report.md`: files changed, fail-before evidence for each marked test, the vitest output, and anything you could not do.
- Run `npm run context:generate` and commit any change it makes.

`Next authorised action: Claude review of codex/us-company-data-verbatim-title | Owner: Strale master | Blocker: none`
