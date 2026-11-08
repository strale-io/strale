Intent: Codex builder brief: review fixes for html-to-text-linear (round 2, the family's last Codex run).

# Brief: html-to-text-linear review fixes

- **Requester:** the Strale master (session_01RFNL6WAcqYWJKtyJRfBGCw), 2026-11-08. This round answers the independent review of `codex/html-to-text-linear` at f17dc0f2, verdict FAIL.
- **Branch:** push only `codex/html-to-text-linear-2`. It starts from `codex/html-to-text-linear`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only, with no secrets. Tests run offline.
- **Read first:**
  - `docs/lanes/codex/html-to-text-linear-brief.md` and your report;
  - `git diff origin/main...HEAD`;
  - the old function, from `git show origin/main:apps/api/src/capabilities/lib/browserless-extract.ts`.

## What passed review (keep it)

- Linear time. Hostile 1 to 2 MiB inputs now take about 10 ms, against over 60 s before.
- The 2 MiB input cap with truncation; the early stop; unchanged signature and callers.
- Quoted `>` inside an attribute no longer leaks into the text.
- Unclosed `<script>` and `<style>` content is dropped.
- Entities are no longer decoded twice.

## Fix these

1. **MEDIUM: a stray quote must not empty the page.**
   - **The bug:** `findTagEnd` is quote-aware. When a quote opened inside a tag never closes, the search reaches the end of the input and the scan stops. Examples: `<!-- Don't remove --><p>Price</p>` and `<p title=don't>text</p>` both give `""`. The old function returned the text.
   - **The fix:**
     1. Compute `lastSingle = html.lastIndexOf("'")` and `lastDouble = html.lastIndexOf('"')` **once**, before scanning, over the capped input.
     2. Inside a tag, when a quote at position q opens and `q >= last<sameQuote>`, it has no closing quote. Fall back to the first `>` after the tag start: one `indexOf`, then resume after it. This must stay linear; do not rescan per tag.
     3. Comments: `<!--` ends at the next `-->` (one `indexOf`). If there is none, fall back to the first `>` after `<!--`, which is what the old function did. If there is no `>` either, drop the rest.
   - **Tests:** both examples above return the old function's text. Repeated `<a '` and repeated `<!-- don't` at 1 MiB stay under the time bound.
2. **MEDIUM: only an opening tag starts a script or style skip.**
   - **The bug:** `tagName` strips the `/`, so `</script>` starts a skip to the next `</script`. A commented-out `<!-- <script src=x></script> -->`, or a stray `</script>`, drops ordinary text.
   - **The fix:**
     - Start a skip only for an opening tag whose name is exactly `script` or `style`, case-insensitive, followed by whitespace, `>` or `/`. So `<scripts>` and `<script-loader>` are ordinary tags.
     - A closing `</script>` or `</style>` is an ordinary tag and emits `" "`.
     - Script and style inside a comment are part of the comment.
   - **Tests:**
     - `Intro<!-- <script src=x></script> --><p>Return window</p><p>Refunds</p><script>x</script><p>Contact us</p>` keeps all four text parts.
     - A stray `</script>` keeps the following text.
     - `<script-loader>` with no close keeps the following text.
3. **MEDIUM: the growth test must not be flaky.**
   - **The problem:** `browserless-extract.test.ts` compares medians of 5 to 13 ms samples with a 3× ratio, and failed about once in 10 runs.
   - **The fix:** compare the **minimum of 7 runs** for 512 KiB against 2 MiB. The input cap is 2 MiB, so do not go above it. Assert a ratio ≤ 8: linear growth is about 4×, quadratic about 16×. Also assert an absolute bound of 2,000 ms for the 2 MiB run.
   - **Check:** run the file 20 times locally and report the pass count, which must be 20 of 20.
4. **LOW: match the old output on ordinary pages, and list every intended difference.**
   - **Block tags use the old prefix rule.** The old regex `<\/?(p|div|tr|td|th|li|h[1-6]|dt|dd|section|br)[^>]*>` matched by prefix, so `<pre>`, `<thead>`, `<tbody>`, `<link>`, `<path>`, `<picture>` and `<param>` each emitted `"\n"`. Do the same: a newline when the tag name starts with one of those names.
   - **Whitespace matches the old two-step result exactly.** First, runs of `[ \t]` become one space. Then `\n\s*\n` becomes `\n`, which leaves a space before a newline as the old function did: `"Hello \n\nWorld"` gives `"Hello \nWorld"`. Implement it in the single pass and keep it linear.
   - **The early stop counts only after leading whitespace is trimmed.** Leading `\r` and Unicode spaces must not shorten the output.
   - **Fixtures:** add equivalence cases for each shape above: space before a double newline, `<pre>`, `<thead>`, `<tbody>`, leading `\r` runs, and `< p>`.
   - **Report:** the "Round 2" section lists every remaining intended difference from the old output, with its reason: quoted `>` in attributes, unclosed script and style, single entity decoding, `< p>`.
5. **NIT: revert the prettier-only changes outside `htmlToText`.** These are the trailing commas in `extractCompanyFromText`, `extractCompanyName` and `looksLikeRefusal`. The diff should touch only `htmlToText`, its helpers and its constants.

## Done when

- `cd apps/api && npx vitest run src/capabilities/lib` passes, along with the callers' tests (`rg -l "htmlToText|browserless-extract" src --glob '*.test.ts'`).
- The growth test passes 20 runs of 20.
- `npm run typecheck` passes. Build `packages/mcp-server` and `packages/sdk-typescript` first.
- The full `npx vitest run` in `apps/api` passes. Report every failing file.
- Append a "Round 2" section to `docs/lanes/codex/html-to-text-linear-report.md`. It covers each fix, its tests, measured times for the hostile inputs (including repeated `<a '` and repeated `<!-- don't`), the 20-run result, and the exact commands run.
