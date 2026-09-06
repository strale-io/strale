Intent: Archive M2 closing-review round 9 plus a whole-corpus named-source
quotation sweep, and land `DEC-20260905-J`, the erratum record that
withdraws every misquotation, misattribution, and unverifiable-source
attribution the round and the sweep found (after removing every one
already withdrawn by `DEC-20260905-B` through `-I`).

## What happened

Round 9 of the M2 closing independent review ran at commit
`fcfceb59f68228c0e9910581a67e67b1810ee1fa`, in six partitions covering
the full 239-record candidate corpus. All nine gates ran clean at that
commit. Four of the six partitions (P2, P3, P4, P5) found confirmed
quotation-fidelity defects on direct reading; P2's and P6's own verdicts
were PASS despite finding a confirmed defect each, which their own
reviewers judged not verdict-determining on their own. Because the
checker (`scripts/m2-quote-fidelity.mjs`) accepts any candidate source for
a quoted span rather than specifically the source a sentence names, a
whole-corpus named-source quotation sweep ran alongside the six
partitions: six sweepers, each covering the same partition its round-9
counterpart reviewed, checked every double-quoted span of twelve or more
normalized characters against the specific source its own sentence names,
by reading, rather than trusting the checker's best-effort match. The
sweep found a further set of defects the checker's own residual list, at
either the default 25-character threshold or `--min-chars 12`, mostly did
not flag at all (the checker considered the misattributed or altered
words faithful against some unrelated candidate source in its own search
set).

After deduplicating against `DEC-20260905-B` through `-I`'s existing
Decision lists (most sweep findings restate a statement one of those
records already withdrew) and against this round's own six partition
findings, this session compiled 31 items: 29 withdrawals across 27
records (six found by a round-9 partition report, four of those six
independently confirmed by the paired sweep on the same span; 23 more
found only by the sweep) plus two substantiation items (no withdrawal)
re-deriving `DEC-20260430-A`'s relation basis to `DEC-20260428-A` and
`DEC-20260428-B`, the same basis `DEC-20260905-F`, `-H`, and `-I` already
established, restated as a fresh item per this round's brief.

Three items round 9's own reviewers or sweepers raised are Not adopted:
a GDPR Article 30 quotation (verifiable against the public statute, under
a new clause this record adds), `DEC-20260518-B.md:55`'s illustrative
rephrasing (not attributed to any named source, so not a defect under the
convention), and `DEC-20260515-A`'s commit-citation misattribution
(already withdrawn by `DEC-20260905-C` item 40, not repeated as a fresh
item).

## Deliverables

- `archive/sessions/2026-09-05-m2-closing-review-round-9.md`, round 9's
  method, the six sweep reports and six partition reports verbatim under
  one-level-demoted headings (round-trip verified by script), the gate run
  verbatim, and the outcome, `VERDICT: FAIL`.
- `docs/decisions/records/DEC-20260905-J.md`, the erratum record, 32
  numbered items (30 withdrawals, 2 substantiations), a "Not adopted"
  section, and one new convention clause (a statute cited by article is a
  verifiable public source).
- `docs/project/m2-closure-register.yaml`, `formal_records.record_count`
  239 -> 240; new `DEC-20260905-J` row in the git-native formal-records
  list, `git_provenance` pointing at the round-9 archive file.
- Not committed (scratchpad, per the brief): the operator checker's own
  residual reconciliation at both thresholds
  (`scratchpad/residual-reconciliation-round9.md`,
  `-round9-short.md`), and the verification script
  (`scratchpad/verify_erratum9_quotes.py`).

## Gates

All nine gates from the brief ran clean at HEAD before opening the PR;
see the PR body for each gate's exit line. `npm run receipts:check`
carries its usual pre-existing warn-only findings (bare test counts in
older handoffs), not a new finding from this session's work.

## Next

Round 10 runs at the commit that merges this PR into `main`, and treats
every statement withdrawn by `DEC-20260905-B` through `-J` as corrected,
and every relation substantiated in any of those records as substantiated.
