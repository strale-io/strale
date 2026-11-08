# `htmlToText` linear scanner report

## Result

`htmlToText(html: string): string` now uses a forward scanner instead of the
five whole-document regular-expression passes. The public signature and all
callers are unchanged.

## Scanner rules

- At most the first **2 MiB of UTF-16 characters** are considered. A larger
  input is truncated rather than refused.
- Plain text is emitted in encounter order. Scanning stops once the buffered
  output reaches 15,000 characters plus a 32-character trimming margin; the
  trimmed result is still sliced to the existing 15,000-character limit.
- A `<` starts one tag scan. The scanner walks forward to the first `>` outside
  a single- or double-quoted attribute. If no such `>` exists, the unterminated
  tag and the rest of the input are dropped without restarting a search at
  later `<` characters.
- Opening and closing `p`, `div`, `tr`, `td`, `th`, `li`, `h1`–`h6`, `dt`,
  `dd`, `section`, and `br` tags emit a newline, case-insensitively. Other tags
  emit a space.
- Exact `script` and `style` tag names are matched case-insensitively. Their
  contents are skipped to the corresponding close tag. A missing or
  unterminated close tag drops the remainder. A fixed-literal ASCII-insensitive
  search preserves source-string indices even around Unicode case folds.
- Only the previous five substitutions are decoded: `&amp;`, `&lt;`, `&gt;`,
  `&nbsp;`, and literal U+00A0. Entity names remain case-sensitive and no new
  numeric or named entities are decoded.
- Runs of spaces, tabs, and decoded non-breaking spaces collapse while text is
  emitted. Whitespace containing two or more newlines collapses to one newline
  in the same pass, so blank-line collapse is at a fixed point without another
  whole-output pass.

Every forward tag walk resumes after the location it inspected, and close-tag
searches resume after a rejected name-prefix candidate. Each input character is
therefore visited a bounded number of times: O(n) work with O(15,032) output
storage.

## Intentional output differences

1. **Quoted `>` in attributes is handled as attribute content.** The old tag
   regex stopped at that character and could expose the remainder of an
   attribute as page text. For example, `<div title="one > two">Visible</div>`
   used to return `two">Visible`; it now returns `Visible`.
2. **An unclosed script or style drops the remainder.** The old script/style
   regex did not match without a close tag, after which generic tag removal
   exposed the program or stylesheet as page text. The new result omits content
   that is not visible page text.
3. **Script and style names are exact.** The old opening regex also treated
   names such as `<scripture>` as script because it only checked the prefix.
   The scanner does not. Conversely, it accepts whitespace before the `>` of a
   real close tag, which the old exact `</script>` / `</style>` spelling missed.
4. **Blank-line collapse is a fixed point in one scan.** Rare whitespace shapes
   for which one global application of the old `\n\s*\n` regex could leave a
   further blank-line match are fully collapsed now. Ordinary single-newline
   spacing is retained, and the ordinary-equivalence fixtures match the old
   output.
5. **Work is deliberately bounded.** Content after 2 MiB of input, or after
   enough output has been collected for the 15,000-character result, cannot
   affect the result. Previously the entire input was scanned before the output
   slice.

## Measurements

Measurements were taken in this checkout on Node 20.20.2. Each hostile row is
1 MiB. “>60,000” means the process was stopped by `timeout 60s`; the old
function did not finish, so no stronger number is claimed.

| Input                            | Old (ms) | New (ms) |
| -------------------------------- | -------: | -------: |
| repeated `<p`                    |  >60,000 |   22.191 |
| repeated `<`                     |  >60,000 |   21.553 |
| `<script` with no close          |   12.296 |    5.028 |
| `<style` with no close           |   12.665 |    4.890 |
| repeated `\n \n `                |  342.570 |   56.223 |
| alternating `<a`-prefix/text mix |  >60,000 |   14.127 |

The old unclosed-script/style cases finish quickly because they expose the
tail as text; their speed does not make that output correct. A separate growth
measurement took **13.274 ms at 1 MiB** and **26.253 ms at 2 MiB** for repeated
`<`, a 1.98× increase for 2× input. A 10 MiB benign paragraph returned exactly
15,000 characters in **70.202 ms**.

## Other HTML-regex implementations found

Per the brief, these were recorded but not changed. They do not call
`htmlToText`; each independently applies script/style or generic tag regexes to
fetched HTML:

- `apps/api/src/capabilities/annual-report-extract.ts`
- `apps/api/src/capabilities/social-post-generate.ts`
- `apps/api/src/capabilities/web-extract.ts`
- `apps/api/src/capabilities/url-to-text.ts`

Smaller generic tag stripping also exists for already-extracted fragments (for
example anchor text), but it is not the same fetched-page regex chain.

## Commands and results

- `npm ci` — **failed** because the `c2pa-node` postinstall could not reach
  `raw.githubusercontent.com` (`ENETUNREACH`).
- `npm ci --ignore-scripts` — **passed**; 1,051 packages installed. npm also
  reported the checkout's existing engine warnings and audit findings.
- `cd apps/api && npx vitest run src/capabilities/lib/browserless-extract.test.ts`
  — **passed**, 26 tests.
- `cd apps/api && npx vitest run src/capabilities/lib` — **failed**, 3 of 705
  tests, all pre-existing wall-clock thresholds under concurrent load:
  `src/capabilities/lib/stripped-text-length.test.ts` (two timing assertions)
  and `src/capabilities/lib/web-provider-text-check.test.ts` (one timing
  assertion). `browserless-extract.test.ts` passed. The isolated rerun
  `npx vitest run src/capabilities/lib/stripped-text-length.test.ts` passed all
  10 tests.
- `npm --workspace=packages/mcp-server run build` — **passed**.
- `npm --workspace=packages/sdk-typescript run build` — **passed**.
- `cd apps/api && npm run typecheck` — **passed**.
- `cd apps/api && files=$(rg -l "htmlToText|browserless-extract" src --glob '*.test.ts' | sort); npx vitest run $files`
  — **failed**, 1 of 305 tests: the pre-existing 500 ms event-loop threshold
  in `src/capabilities/url-to-markdown-parse-bound.test.ts`; all 304 other
  tests, including the new scanner suite and caller tests, passed.
- `cd apps/api && npx vitest run` — **failed**, 5 of 10,520 tests. Every failure
  was an unrelated pre-existing timing threshold:
  `src/capabilities/url-to-markdown-parse-bound.test.ts` (one),
  `src/capabilities/lib/stripped-text-length.test.ts` (one),
  `src/capabilities/lib/web-provider-text-check.test.ts` (one), and
  `src/lib/company-enrich/structured-metadata.test.ts` (two). The run had 10,058
  passing and 457 skipped tests across 519 files.
- `./node_modules/.bin/tsx /tmp/html-bench.mts` under `timeout 60s` per old
  hostile case — **completed** with the measurements above; three old cases
  hit the deliberate 60-second timeout.
- `./node_modules/.bin/tsx /tmp/html-extra-bench.mts` — **passed**, producing
  the 1 MiB/2 MiB growth and 10 MiB early-stop measurements above.
- `npx prettier --write apps/api/src/capabilities/lib/browserless-extract.ts apps/api/src/capabilities/lib/browserless-extract.test.ts docs/lanes/codex/html-to-text-linear-report.md`
  — **passed**.
- Final `cd apps/api && npx vitest run src/capabilities/lib/browserless-extract.test.ts && npm run typecheck`
  — **passed**, 26 tests plus TypeScript checking. This includes the fixes from
  two independent-review rounds: complete regex-`\s` blank-line handling and
  index-preserving close-tag searches around length-changing Unicode case
  folds.
- `npm run handoff:check` — **failed** because this supplied checkout is the
  trunk worktree on the brief's feature branch and has no upstream remote. It
  reported no source/test defect.
- `git push -u origin codex/html-to-text-linear` — **failed** because the
  supplied repository has no `origin` remote (`origin does not appear to be a
git repository`). The branch was not pushed anywhere else.

The failing timing files do not import or exercise `htmlToText`, and their
individual behavior reproduces independently of this change on this Node 20
environment. No failing file was modified.
