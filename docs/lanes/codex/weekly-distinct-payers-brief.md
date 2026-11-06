Intent: Codex builder brief: count distinct paying customers per ISO week in the commercial metrics.

# Brief: weekly distinct payers (distribution metric)

**Requester:** the Strale orchestrator (session_01CR5YPsTtEwE3tRQtvTzerw), on Petter's go of 2026-11-06 ("please start on all your suggested actions").
**Branch:** push only `codex/weekly-distinct-payers`. Never push `main`, label, approve, merge or comment.
**Data:** this brief and the repository only. There are no secrets or production data in it, and none are needed: every test runs offline.

## Why

This week's main goal is a second paying customer. Revenue per week already exists in `discreteWeeks()`. What is missing is how many *different* payers each week had. Without that count, a week with one large buyer and a week with five small ones look alike.

## What to change

1. **`apps/api/src/lib/metrics/commercial.ts`:**
   - add `payers: number` to `DiscreteWeek`, with a doc comment;
   - define it as the number of distinct payer identities with at least one completed call whose `price_cents > 0` in that ISO week;
   - define identity as the key from `ACTOR_KEY_SQL` (`./actor-identity.ts`), the same one `payerFacts()` uses;
   - exclude rows whose key is NULL from the count, and say in the comment that such revenue is not attributed;
   - in `discreteWeeks()`, add to the existing query `COUNT(DISTINCT <actor key>) FILTER (WHERE t.price_cents > 0)` and fill `payers` in the densify loop, with 0 for an empty week;
   - keep every bind an ISO string, never a `Date`, as the module docstring requires.
2. **A pure function `payerTrend(weeks: DiscreteWeek[])` in the same file.** It uses only completed weeks: drop any `partial: true` week. It returns:
   - `{ verdict: "insufficient" }` when fewer than 2 completed weeks exist;
   - otherwise `{ verdict: "rising" | "flat" | "falling", lastCompleted: number, previous: number, sentence: string }`, comparing the newest completed week with the one before it.
   - The sentence is plain English, for example "3 different customers paid last week, up from 1 the week before." Use the singular "customer" for 1.
   - It never reads the partial week as a change.
3. **`apps/api/scripts/commercial-brief.ts`:**
   - print the payer count per week next to revenue, in the existing weeks output, with the partial week labelled as it already is;
   - print `payerTrend(...).sentence` as one line;
   - include both in the `--json` output.
4. **Tests in `apps/api/src/lib/metrics/commercial.test.ts`.** They must be pure, with no database. Cover `payerTrend`:
   - fewer than 2 completed weeks;
   - partial week ignored, including a large partial week that must not count as "rising";
   - rising, flat and falling;
   - singular and plural wording.
   Each test must fail if `payerTrend` returned a constant.

## Out of scope

- No change to the SQL of `payerFacts`, `concentration` or any other function.
- No API route, no migration, no public surface.
- Edit no file outside the four named above, apart from this brief's report.

## Done when

- `npm --workspace=apps/api exec vitest run src/lib/metrics/commercial.test.ts` passes;
- `npm run typecheck` passes;
- you have written `docs/lanes/codex/weekly-distinct-payers-report.md`, giving the files changed, the test names, and anything you could not do.
