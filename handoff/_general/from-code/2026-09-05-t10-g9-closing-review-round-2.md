Intent: archive M2 closing-review round 2 and its follow-up sweep, and land
`DEC-20260905-C`, the erratum record that withdraws every statement round 2
and the sweep found false, fabricated, or misattributed.

Round 2 ran at commit `c3691079b150c9aecb082af6a9215e7b1d8c7a2b`, six fresh
read-only partitions applying round 1's own method. P2, P3, and P5 failed
on confirmed defects; P1, P4, and P6 passed (P1 and P4 recorded minor
byte-level quote findings judged not verdict-determining). All nine gates
ran clean at that commit. Round 1 and round 2 between them had found three
disjoint sets of confirmed defects rather than converging, so a sixth
partition-by-partition sweep checked every quotation and every
repository-state claim in every record once, rather than sampling, before
the closing review's final round. The sweep found further confirmed
defects in P1 through P5 (P6's sweep found none).

`DEC-20260905-C` withdraws 39 statements across 33 records, grouped by
record in filename order, following the same shape `DEC-20260905-B` used
for round 1. The record states the quotation convention as the corpus
rule going forward: punctuation, case, dashes, markdown, and six named
symbol transliterations are never defects; a word inserted, dropped,
replaced or reordered, a stitched composite, a wrong-source attribution,
or a false statement about repository state are. Every withdrawal was
re-verified against its source at this commit before being written: a
Notion row field (dumped fresh via `dump_rows.py`), a repository file, a
sibling record, or a git commit message, not accepted from either
report's own text alone.

The operator quote-fidelity checker's residual list (PR #574,
`scripts/m2-quote-fidelity.mjs`, not yet merged to `main`) was reconciled
entry by entry: of 57 residuals, 21 were already round-2 or sweep
findings, 1 was a real defect neither report had caught (folded in as a
fresh withdrawal), and 35 were checker misses: faithful to a source
(a Notion field, `CLAUDE.md`, a sibling record, or a git commit message)
that the checker's file-vs-file substring pass does not fetch.

This PR archives the round and its sweep verbatim
(`archive/sessions/2026-09-05-m2-closing-review-round-2.md`), lands
`DEC-20260905-C`, registers it in `docs/project/m2-closure-register.yaml`
(formal record count 232 to 233), and regenerates the context and archive
indexes. The final closing round runs at the commit that merges this PR.

No test count is stated here without a receipt; the receipts and register
checks referenced are the gate log itself, not restated as bare numbers.
