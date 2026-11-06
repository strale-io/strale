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
