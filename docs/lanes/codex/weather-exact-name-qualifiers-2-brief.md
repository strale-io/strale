Intent: Codex builder brief, review round 2 of `weather-exact-name-qualifiers`: undo the one regression the review found ("Bombay, IN" now refuses) and make hyphenated names match their spaced spelling.

# Brief: weather-exact-name-qualifiers-2 (round 2)

- **Requester:** the Strale master (session_01Ms71ZnJsKfZn5eCYBzr5kL), 2026-11-17. The independent Claude review of strale-io/strale#1088 returned GO at fcd0c051 with the findings below; item 1 is a regression, so it is fixed before merge.
- **Branch:** push only `codex/weather-exact-name-qualifiers-2`, cut from `codex/weather-exact-name-qualifiers` at fcd0c051 (round 1). Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only. No secrets and no production data. The place names below are public and may be used in tests.
- **Read first:** `docs/lanes/codex/weather-exact-name-qualifiers-brief.md` (round 1, still in force), its report, and `apps/api/src/capabilities/weather-lookup.ts` (`norm`, `exactNameMatch`, `qualifiedHits`, the comma path near line 190).

## What to build

Change only `apps/api/src/capabilities/weather-lookup.ts` and `apps/api/src/capabilities/weather-lookup.test.ts`. No manifest, schema, route, migration or environment change.

### 1. Comma path: exact-name hits first, then all hits (regression fix)

Round 1 made the comma path keep only exact-name hits whenever any exist. That refuses a place the geocoder found under another name when exact namesakes exist elsewhere. Live example: "Bombay, IN" returned a Maharashtra, India hit before round 1 and now refuses ("places named Bombay exist, but none in IN"), because exact "Bombay" hits exist in New York, New Zealand, Suriname and Haiti.

New rule: run `qualifiedHits(exactNameHits, qualifiers, city)` first. Only when it finds nothing (an empty result, not an ambiguity refusal) run `qualifiedHits(hits, qualifiers, city)` on all hits. An ambiguity refusal among the exact-name hits still refuses; do not fall through on it. The Sacramento result from round 1 must hold.

### 2. Hyphens and dashes become spaces in name comparison

`exactNameMatch` deletes punctuation, so "Winston-Salem" becomes "winstonsalem" while the input "Winston Salem" stays two words, and "Winston Salem NC" refuses. In `exactNameMatch` only, first replace hyphens and dashes (`-`, `‐`, `‑`, `–`, `—`) with a space, then delete the remaining punctuation as today, then collapse spaces. Other punctuation is still deleted, not spaced: "Washington D.C." must still compare equal to "washington dc".

Not in scope: the trailing-"City" rule's plain `norm` comparison, and populated-place feature-code preference.

## Tests (in `weather-lookup.test.ts`, with `fakeOpenMeteo`)

- "Bombay, IN" with hits `[Bombay (US, New York), Bombay (NZ, Auckland), Dharavi (IN, Maharashtra)]` resolves to the Indian hit. Must fail against fcd0c051.
- "Winston Salem NC" where the "Winston Salem" lookup returns `Winston-Salem (US, North Carolina)` resolves to it. Must fail against fcd0c051.
- Every round-1 test still passes: the Washington DC spellings, Washington PA, bare Washington, Sacramento CA, and Richmond CA still refusing as ambiguous.
- Every other existing test still passes unchanged.

## Done means

- `npm run typecheck` and `npm test` pass for this file (an unrelated timing test elsewhere may be reported as such).
- Report at `docs/lanes/codex/weather-exact-name-qualifiers-2-report.md`: the files changed, fail-before evidence for each marked test (failing at fcd0c051, passing after), the output of `npx vitest run src/capabilities/weather-lookup.test.ts` run from `apps/api`, and anything you could not do.
- Run `npm run context:generate` and commit any change it makes.

`Next authorised action: Claude review of codex/weather-exact-name-qualifiers-2 | Owner: Strale master | Blocker: none`
