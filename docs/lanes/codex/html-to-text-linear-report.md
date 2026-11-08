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

## Round 2

### Review fixes

- `findTagEnd` now uses single and double quote last positions computed once over
  the capped input. An unmatched quote falls back to the first `>` after the
  tag start, so apostrophes in comments and unquoted attribute values no longer
  discard the page. A new `<` reached while such a quote is still open also
  triggers that fallback, so a later apostrophe in visible copy cannot be
  mistaken for the close. Comments independently use one `indexOf("-->")`, then the
  old function's first-`>` fallback when unclosed.
- Only opening `script` and `style` tags with an exact, case-insensitive name
  and a whitespace, `>`, or `/` boundary start a raw-text skip. Closing tags,
  custom elements such as `script-loader`, and script-looking text inside a
  comment no longer discard subsequent visible text.
- Block-tag detection now follows the old regex's prefix rule. This restores
  newlines for `pre`, `thead`, `tbody`, `link`, `path`, `picture`, and `param`.
  The whitespace state machine also retains a space before a collapsed double
  newline and ignores all leading JavaScript whitespace for early-stop
  accounting, including carriage returns and Unicode spaces.
- The growth assertion now compares the minimum of seven runs at 512 KiB and
  2 MiB, permits the requested 8x ratio, and independently requires the 2 MiB
  run to finish within 2,000 ms.
- Formatting-only changes after `htmlToText` were reverted. The implementation
  diff is limited to the scanner's constants and helpers and `htmlToText`.

Tests cover both stray-apostrophe examples; comments containing script markup;
stray close tags; `script-loader`; the old block-prefix shapes; exact old
whitespace behavior; leading carriage returns; `< p>`; and 1 MiB hostile runs
of repeated `<a '` and repeated `<!-- don't`. The scanner test file passed 20
out of 20 separate runs.

### Remaining intended differences from the old output

These are the complete intended output differences after round 2:

1. **Quoted `>` in attributes:** the scanner treats it as attribute content,
   rather than exposing the rest of the attribute as page text.
2. **Unclosed `script` and `style`:** the scanner drops the remaining raw-text
   content because it is not visible page text; the old regex exposed it.
3. **Single entity decoding:** encoded text is decoded once during the scan,
   rather than allowing one replacement to feed a later replacement and decode
   an entity twice.
4. **`< p>`:** the scanner tolerates whitespace after `<` and recognizes `p`,
   so it emits a newline; the old block regex did not recognize it and the
   generic tag regex emitted a space.

The 2 MiB input cap, 15,000-character output limit and early stop also remain
intentional work bounds: content beyond those bounds cannot affect the result.

### Round 2 measurements

Measurements used Node 20.20.2 and report the minimum of seven runs for each
1 MiB hostile input.

| Input | New (ms) |
| --- | ---: |
| repeated `<p` | 10.065 |
| repeated `<` | 10.043 |
| unclosed script | 1.623 |
| unclosed style | 1.599 |
| repeated `\n \n ` | 39.944 |
| alternating tag/text | 10.730 |
| repeated `<a '` | 9.641 |
| repeated `<!-- don't` | 2.516 |

The growth fixture measured **5.046 ms at 512 KiB** and **19.683 ms at 2
MiB**, or 3.90x growth, within both the 8x ratio and 2,000 ms absolute bound.

### Round 2 commands and results

- `npm install --ignore-scripts` — **passed** (1,051 packages installed; npm
  reported existing Node-engine warnings and audit findings).
- `cd apps/api && npx vitest run src/capabilities/lib/browserless-extract.test.ts`
  in a 20-iteration shell loop — **passed 20 of 20**, 38 tests per run.
- `./node_modules/.bin/tsx /tmp/html-round2-bench.mts` — **passed**, producing
  the hostile-input and growth measurements above.
- `cd apps/api && npx vitest run src/capabilities/lib` — **failed**, 2 of 723
  tests: pre-existing wall-clock thresholds in
  `src/capabilities/lib/stripped-text-length.test.ts` and
  `src/capabilities/lib/web-provider-text-check.test.ts`. The scanner's 38
  tests passed.
- `cd apps/api && files=$(rg -l "htmlToText|browserless-extract" src --glob '*.test.ts' | sort); npx vitest run $files`
  — **failed**, 1 of 323 tests: the pre-existing 500 ms event-loop threshold in
  `src/capabilities/url-to-markdown-parse-bound.test.ts`. The other 322 tests,
  including the scanner and caller tests, passed.
- `npm --workspace=packages/mcp-server run build` — **passed**.
- `npm --workspace=packages/sdk-typescript run build` — **passed**.
- `npm --workspace=apps/api run typecheck` — **passed**.
- Final `cd apps/api && npx vitest run src/capabilities/lib/browserless-extract.test.ts && npm run typecheck`
  after independent review — **passed**, 38 tests plus TypeScript checking. The
  review-found cross-tag apostrophe regression is included.
- `cd apps/api && npx vitest run` — **failed**, 5 of 10,538 tests across four
  files: `src/capabilities/domain-contact-extract.test.ts`,
  `src/capabilities/url-to-markdown-parse-bound.test.ts`,
  `src/capabilities/lib/stripped-text-length.test.ts`, and
  `src/lib/company-enrich/structured-metadata.test.ts` (two assertions). All
  are unrelated pre-existing wall-clock or timing-ratio thresholds. The run
  had 10,076 passing and 457 skipped tests across 519 files; the scanner suite
  passed.

## Round 3 (Claude, after round-2 review FAIL)

Codex's three runs for this family were used: the first produced no diff, f17dc0f2 was round 1, and 9f6a3aa7 was round 2. The round-2 independent review found two quadratic paths that a caller can control, and Fix 1 was incomplete. Claude made the last change.

- **Tag ends use the old rule.** `findTagEnd` is now `html.indexOf(">", start)`, the first-`>` rule of the old regex `<[^>]+>`. The quote-aware scan is gone, and with it both failures it caused:
  - a stray apostrophe emptied the rest of the page: `<p title=don't>It's here</p>` and `<img alt=Petter's>Petter's bio…` lost their text;
  - the fallback restarted from the tag start and rescanned the remainder for every tag: `"<'>'"…+"'"` took 36 s at 1 MiB, and `<a 'x>y'z ` took 40.6 s at 2 MiB.

  The cost is one round-1 improvement: a `>` inside a quoted attribute leaks the rest of that attribute into the output, as it always did before this change.
- **Comments.** `lastIndexOf("-->")` is computed once. A `<!--` after the last `-->` ends at its first `>` (the old behaviour) without searching for `-->` again. Before, `"<!-- x>"` repeated took over 60 s at 1 MiB.
- **A `<` with nothing to close it.** `lastIndexOf(">")` is computed once. A `<` after the last `>` is literal text, as the old regexes left it, so `"Price < 100 for all"` keeps its text. `<>` is literal too (`a <> b`), as before.
- **Kept from rounds 1 and 2:**
  - linear time;
  - the 2 MiB input cap and the early stop;
  - script and style skipping only on real opening tags;
  - exact old whitespace;
  - the old prefix rule for block tags;
  - single entity decoding.
- **Intended differences from the old output** (the complete list):
  - unclosed `<script>` and `<style>` content is dropped;
  - entities are decoded once (`&amp;lt;` stays `&lt;`);
  - `< p>` gives a newline;
  - comment text after a `>` inside a comment that is closed by `-->` is dropped;
  - `</script >` with a space closes a script;
  - a bare `<` before a later `>` is always a tag, because the old chain's ordering (scripts and block tags before the generic `<[^>]+>` pass) is gone. `"<<p>div"` gives `div` where the old one gave `<` and a newline before `div`. Next to a script it can leak script text: `5 < 10<script>var t=1;</script> more` keeps `var t=1;`, where the old one lost the rest of the paragraph instead. On `<td>< 5 MSEK</td>…` the new output keeps rows the old one lost;
  - an abrupt empty comment `<!-->` or `<!--->` hides text up to the next `-->`;
  - an unclosed comment followed by a script leaks the script body; `<\nstyle>` starts a style skip, like `< p>`.

  The last three were found by the independent review's differential fuzz. All three need markup a browser's serializer does not emit (a raw `<` in text, `<!-->`), and the callers sampled read rendered HTML through `fetchRenderedHtml`, so only raw fetches can meet them. They are accepted rather than fixed; any fix must keep the scan linear.
- **Tests added:**
  - 1 MiB timing cases for repeated `<!-- x>`, balanced quote pairs ending in an unmatched quote, and `<a 'x>y'z `;
  - equivalence cases for `<p title=don't>It's here</p>`, `<img alt=Petter's>…`, `Price < 100 for all`, `a <> b` and an unclosed comment tail.

  All five of these fail against 9f6a3aa7. The three timing cases took 160 s, 34.7 s and 18.3 s there.
  - after the review, a 1 MiB timing case of many closed `<script>x</script>` pairs, for the close-tag search's restart path.
- **Independent review** (separate read-only Claude context, on 0bdde5e1): GO. 38 hostile shapes at 1 and 2 MiB, worst 56 ms at 1 MiB and linear when doubled; 500,000 random well-formed cases with 0 mismatches against the old function; output never above 15,000 characters.
- **Commands:**
  - the browserless-extract test file: 41 passed, 20 runs of 20;
  - full `apps/api` vitest: 473 files passed, 0 failed;
  - `npm run typecheck`: passed;
  - every single-line step of the CI check job passed locally, after `context:generate` refreshed `docs/project/legacy-authority-inventory.json`, which the Codex commits had left stale.
