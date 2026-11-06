Intent: ship company-enrich structured metadata (JSON-LD, Open Graph, meta tags before the Claude step), built by Codex in three runs and finished by Claude after the third review.

- **Codex runs:**
  - 1: 9da8e8f7. Review: FAIL, title fallbacks were billable and the jsdom parse was unbounded.
  - 2: 93a42815. Review: FAIL, icon links unbounded, script scan quadratic.
  - 3: ed6eee34. Review: PASS-WITH-FIXES.
  - Briefs and reports are in `docs/lanes/codex/company-enrich-metadata*-brief.md` and `*-report.md`. The second run's files are named `-2`.
- **Claude fixes after run 3**, since the three-run limit was reached:
  - ASCII-only lowercasing, so "İ" no longer shifts tag positions in the metadata builder or the page-text strip.
  - Inline `<script>` and `<style>` are stripped from the head before its 128 KB cap.
  - JSON-LD and icons come before the head in the parser input, so a cut head cannot swallow them.
  - `<head` must end the tag name, so `<header>` is not taken for `<head>`.
  - Icon links are collected anywhere on the page.
  - The script-scan regression test now uses the real quadratic input.
  - The `data_source` wording is clearer.
  - Four new tests fail on ed6eee34.
- **Not done:**
  - Social links the model returns still pass through without a host check, as on main.
  - The org-type list misses NGO and EducationalOrganization.
  - The manifest changes reach production through the boot text sync (category company-data). `output_field_reliability` changes need the onboarding backfill after merge.

## After the review of 28e9d4a4 (FAIL, fixed)

The review of 28e9d4a4 found that the new head-strip helper was quadratic: about 76 s on a 2 MB head of repeated `<style></style>`. Changes made:
- The helper now caches the next `<script` and `<style` positions. Measured times are now 20 to 55 ms, and a search-count test bounds the work.
- Icon links are taken from outside the head only, since the head carries its own. An icon tag cut inside a quoted attribute (a data-URI SVG favicon) is dropped, so it can no longer swallow the JSON-LD after it.
- `asciiLowerCase` takes the native fast path unless a string's length changes, and maps "İ" before lowercasing. 16 MB of mixed case takes 38 ms, or 311 ms with an "İ" present.
- The four new tests fail on 28e9d4a4.

## After the review of 38559e38 (PASS-WITH-FIXES, fixed)

The review found three issues, each fixed:
- **Icons in the head.** The head-icon skip lost icons beyond the 128 KB kept slice. The skip is removed. Each icon `<link>` is now re-emitted from its parsed `rel` and `href`, quoted and escaped, so a malformed tag with a stray quote in an unquoted value cannot leave the parser input open.
- **"İ" in the fast lowercasing.** It mapped "İ" to "i", so "</scrİpt>" could close a block. "İ" and the Kelvin sign are now swapped for U+FFFD, a single code unit that lowercases to itself. The review's sweep of every code point found that these two are the only non-ASCII characters that lowercase to ASCII.
- **Tests.** Three new tests fail on 38559e38.

## After the review of 61a2b3f3 (FAIL, fixed)

- **ReDoS in the icon-attribute pattern.** Its unanchored attribute name backtracked on long letter and dash runs; 4 MB of such tags took 9 s and 23 s. The name is now anchored by a lookbehind. As a second guard, at most 64 icon-looking tags are examined per page.
- **`&amp;` double-escaped.** Icon hrefs were escaped again, so `&amp;` came out as a literal "&amp;" in the URL. The re-emitted value now escapes only `"`, since entities stay for the parser to decode.
- **Tests.** Five new tests (ampersand in a head icon and in a body icon, `xml:href`, letter and dash runs) fail on 61a2b3f3.
- **Noted, not fixed (pre-existing).** The JSON-LD scan does not track attribute quoting, so a publisher can embed a JSON-LD-looking script inside a quoted attribute. The publisher controls its own page either way.

## After the converging review of ebad7b4f (FAIL, fixed by design change)

**The finding.** The review found that every scanner and regex was linear, but jsdom itself was superlinear on publisher markup. The 1.5 MB cap limited how much it read, not how long it took. These inputs ran for seconds to minutes, or overflowed the stack:
- deep nesting in the head;
- an attribute flood on a JSON-LD opening tag;
- a JSON-LD script closed early with `</script x>`, followed by markup.

**The fix.** `buildBoundedMetadataHtml` now passes jsdom no publisher markup. The parser input is built only from tags constructed from values read off the page:
- up to 32 `<meta>` tags, only for the keys the extractor reads, with values quoted. They are found with a quote-aware tag-end scan, with at most 256 candidates.
- one `<title>`, with `<` escaped;
- up to 8 icon links, rebuilt as before;
- JSON-LD in a fixed opening tag, each block cut at its first `</script` (any close form). The budget is now summed arithmetically.

**Tests.** Seven new tests. Six fail on ebad7b4f, at 13 to 79 s each; the seventh, a meta tag with thousands of attributes, already passed there. All the earlier timing cases stay under 200 ms.

**Noted, not fixed.**
- An icon inside an HTML comment can still win over the real icon (review M1). It is still a URL the page published.
- A page whose only content is a meta description is billed. That is page-published data, so this is a product choice, recorded here.

## After the review of e5367a0f (FAIL on two narrow items, fixed)

The review confirmed that jsdom now receives only constructed tags. Every nesting, attribute-flood and early-close case runs in 30 to 200 ms at 16 MB. Two blockers remained, now fixed:

- **"İ" and the Kelvin sign were slow.** The global regex replace in `asciiLowerCase` took about 1 s on a 16 MB page of "İ". It now uses split and join.
- **`tagEnd` opened a quote on any quote character.** So `content=O'Brien` paired attributes across tags and billed a wrong `company_name`. A quote now opens a value only right after `=`, as in the HTML tokenizer.

Three non-blocking items are also fixed:
- A meta tag that carries both `property` and `name` emits both keys.
- The title opening tag is ended with `tagEnd`.
- A `<` in JSON-LD content becomes `<`. That is valid JSON inside strings, and it stops `<!--<script>` from swallowing later blocks.

Five new tests fail on e5367a0f.

Still open: a meta or icon inside an HTML comment can still win (review N2/M1).
