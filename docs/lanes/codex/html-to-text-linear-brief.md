Intent: Codex builder brief: htmlToText in browserless-extract runs in linear time on hostile markup.

# Brief: `htmlToText` runs in linear time

- **Requester:** the Strale master (session_01RFNL6WAcqYWJKtyJRfBGCw), 2026-11-08. Source: robustness T1 (R1) next action (2), in `docs/programs/robustness/tracks.yaml`.
- **Branch:** push only `codex/html-to-text-linear`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only, with no secrets. Tests run offline: `htmlToText` is a pure function.
- **Read first:**
  - `apps/api/src/capabilities/lib/browserless-extract.ts`, which holds `htmlToText` and `fetchRenderedHtml`;
  - its callers: `rg -n "htmlToText" apps/api/src`;
  - `apps/api/src/lib/resource-limits.ts`;
  - the url-to-markdown hardening in `apps/api/src/lib/readability-convert.ts` and `web-provider.ts`, for this repository's style of linear, windowed text checks.

## Why

`htmlToText` runs these regexes over the whole fetched page:

```
/<script[^>]*>[\s\S]*?<\/script>/gi
/<style[^>]*>[\s\S]*?<\/style>/gi
/<\/?(p|div|tr|td|th|li|h[1-6]|dt|dd|section|br)[^>]*>/gi
/<[^>]+>/g
/\n\s*\n/g
```

Each is quadratic on hostile input. An unclosed `<script`, or a run of `<p` or `<` with no `>`, makes every match attempt scan to the end of the input. A review on 2026-11-07 measured **26.8 s for 256 KB of repeated `<p`**.

At least eight tools pass a caller-chosen URL's HTML through it: `return-policy-extract`, `trustpilot-score`, `cookie-scan`, `eu-court-case-search`, `product-search`, `terms-of-service-extract`, `patent-search`, and others the grep finds. `eu-trademark-search` is delisted but still imports it. One hostile page can occupy the event loop for every caller.

## What to change

1. **Replace the regex chain with one forward, single-pass scanner.** Each character is visited a bounded number of times, so the total work is O(n).
   - **Plain text** goes to the output.
   - **A tag** (`<` up to the next `>`): find the `>` with one `indexOf` from the current position. If there is none, treat the rest of the input as one unterminated tag, emit nothing for it, and stop. Do not rescan.
   - **Block tags** (`p div tr td th li h1 to h6 dt dd section br`, opening or closing; case-insensitive name match) emit `"\n"`.
   - **Any other tag** emits `" "`.
   - **`<script` and `<style`** (case-insensitive) skip to the matching close (`</script` or `</style`, case-insensitive) with one search. If there is no close, drop the rest of the input. Today's regex leaves an unclosed `<script` in place, then strips it as a tag; the new behaviour is the more correct one.
   - **Entities:** decode only the five handled today, `&amp; &lt; &gt; &nbsp;` and U+00A0, applied to the text output with the same semantics.
   - **Whitespace,** collapsed while scanning, not by later regexes:
     - runs of spaces and tabs become one space;
     - a newline followed by any whitespace that contains another newline becomes a single newline. That is the current `\n\s*\n` → `\n` behaviour, applied to a fixed point. If the current single pass leaves blank lines in rare cases, keep the new form and note the difference in the report.
   - **Trim, and stop early.** Trim the result, keep today's 15,000-character limit, and stop scanning once the output reaches that limit plus a small margin. Callers slice to 12,000 or 15,000, so the tail of a huge page is never needed.
2. **Cap the input before scanning** at a constant, for example 2 MiB of characters. Larger input is truncated, not refused, so callers keep working. Name the constant, and do not use `resource-limits.ts` for this unless a constant there fits.
3. **Keep the signature `htmlToText(html: string): string`.** Do not change callers, except where a caller re-implements the same regexes on fetched HTML. List any such caller in the report; do not fix it here.

## Tests (offline)

Put them in `apps/api/src/capabilities/lib/browserless-extract.test.ts`, or extend the existing file.

1. **Equivalence on ordinary HTML.** Build about 8 realistic snippets: a paragraph page; a table; nested lists; script and style blocks with `<` inside JavaScript strings; entities; mixed-case tags; `<br/>`; attributes containing `>` inside quotes. For each, the new output equals the old regex chain's output. Keep a copy of the old function in the test as the reference.
   - Where they must differ (an attribute containing `>`, an unclosed script), assert the new output and say in the test why the old one was wrong.
2. **Linear time.** Each hostile input of 1 MiB must finish under a generous bound, for example 500 ms on CI. Tune the bound to be about 20 times the measured time, not tight. The inputs:
   - repeated `<p`;
   - repeated `<`;
   - `<script` with no close;
   - `<style` with no close;
   - a 1 MiB run of `\n \n \n`;
   - an alternating `<a` and text mix.

   Also show growth is linear: doubling the input to 2 MiB must not take more than about 3 times as long.
3. **Early stop and cap.** A 10 MiB benign page returns at most 15,000 characters, without scanning past the cap. Assert the time bound too.
4. **The five-entity behaviour is unchanged.**

## Done when

- `cd apps/api && npx vitest run src/capabilities/lib` passes, together with the callers' existing tests (`rg -l "htmlToText|browserless-extract" apps/api/src --glob '*.test.ts'`).
- `npm run typecheck` passes. Build `packages/mcp-server` and `packages/sdk-typescript` first (`npm --workspace=packages/mcp-server run build`, `npm --workspace=packages/sdk-typescript run build`).
- The full `npx vitest run` in `apps/api` passes. Report every failing file.
- `docs/lanes/codex/html-to-text-linear-report.md` covers:
  - the scanner's rules;
  - every intentional difference from the old output, with its reason;
  - the measured times for the hostile inputs, old against new where the old one finishes within 60 s;
  - the exact commands run, with their results.
