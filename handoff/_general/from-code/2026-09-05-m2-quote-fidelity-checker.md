Intent: give the M2 candidate records a mechanical, repeatable quotation-fidelity check with a declared normalization convention, so closing-review rounds stop disagreeing about punctuation and the future Codex re-review can rerun the same check.

## What landed (PR #574)

- `scripts/m2-quote-fidelity.mjs`: an operator script (not a CI gate; it needs the private Notion export). For every record it extracts each double-quoted span, normalizes both sides (transliterate the declared symbol set, lowercase, delete every non-alphanumeric character) and tests the span as an ordered-segment substring of the record's candidate sources: its own Notion row fields, its evidence paths, repository paths named in the same paragraph, CLAUDE.md and AGENTS.md, every other record, cross-repo frontend evidence, commit messages of shas named nearby, and the Notion rows of other records named in the same paragraph. Residuals are reported with file-relative line numbers and a best-match hint; `--strict` exits non-zero on any residual.
- `scripts/m2-quote-fidelity.test.mjs`: planted fixtures prove each behaviour in the failure direction, including that an unrelated Notion row cannot validate a span. Wired into `context:test`.
- `docs/decisions/README.md`: the convention and how to run the checker.

## Why

Closing-review rounds 1 and 2 of the M2 candidate set each found different quotation slips because reviewers sampled and judged punctuation by hand. The convention makes punctuation, case, markdown and dashes irrelevant and keeps word-level differences, wrong attributions and unverifiable sources as findings.

## State at the head of this branch

The real-corpus run at the round-2 review commit reports 49 residual spans out of 908; the reconciliation of those residuals (real defects versus checker misses) is recorded with DEC-20260905-C in its own PR. The final closing round runs this checker as part of its method.

## Next

Merge, then the final closing round (six partitions plus the checker plus the gate run) at the commit that carries DEC-20260905-C. T10 closes on its PASS.
