Intent: Archive M2 closing-review round 8 and record its findings as an
erratum, per the T10/G9 round-8 brief.

## What this session did

Read the six round-8 partition reports (P1-P6) and the nine-gate run
(`closing8-review-gates.txt`, all exit 0) for the closing-review round run
at commit `48339ec29d7f768c7e51736f88659239c75ad6a7`, and built:

1. **`archive/sessions/2026-09-05-m2-closing-review-round-8.md`** -- the
   round-8 archive, same shape as round 7's: frontmatter with `round: 8`,
   `commit: 48339ec2...`, `verdict: FAIL`; the six partition reports
   reproduced verbatim under a uniform one-level heading demotion (proven
   reversible byte-for-byte by script,
   `scratchpad/verify_demotion_round8.py`); the gate output verbatim in
   one fence; an Outcome section naming `DEC-20260905-I`.
2. **`docs/decisions/records/DEC-20260905-I.md`** -- the round-8 erratum.
   Withdraws 6 defects found by the partitions (P1: two fabricated
   quotations in `DEC-20260225-P-k3l4`/`DEC-20260226-P-s3t4`; P2: a
   dropped word in `DEC-20260330-B`; P3: two false state/absence claims
   in `DEC-20260503-A`/`DEC-20260422-D`; P4: a composite/misattributed
   quotation in `DEC-20260508-A`), restates (does not withdraw) the
   `DEC-20260430-A` -> `DEC-20260428-A`/`DEC-20260428-B` relation
   substantiation for a third time, and adds a "dated observation" clause
   to the quotation convention so a manifest count that moved because
   unrelated work merged is not treated as a defect. Records P5's two
   observations under "Not adopted" (a dated manifest-count observation;
   a misattribution already withdrawn by `DEC-20260905-C`).
3. Ran the operator checker (`scripts/m2-quote-fidelity.mjs`) myself at
   both the default 25-character threshold and `--min-chars 12`. Both
   residual sets are byte-for-byte identical to round 7's own (99 and
   122 respectively; `DEC-20260905-H` contributes 0 new residuals). One
   round-7 reconciliation gap is corrected here: round 7's short-run
   reconciliation classified `"wedge, not niche"` and `"build it now,
   cheaply"` as faithful without locating a source, which this round's
   brief flagged as invalid; both are withdrawn as items in
   `DEC-20260905-I` instead, along with the `DEC-20260508-A` Tier-1
   misquotation reclassified the same way. Full reconciliation:
   `scratchpad/residual-reconciliation-round8.md`,
   `scratchpad/residual-reconciliation-round8-short.md` (not committed).
4. Ran two additional sweeps this round's brief required: a
   sibling-state re-sweep (wider grep pattern, 275 raw hits over
   `docs/decisions/records/*.md` excluding the `DEC-20260905-*` amending
   records) and an absolute-absence-claim sweep (77 raw hits). Both
   fully judged, one line per hit; the sibling-state sweep found exactly
   one FALSE line (`DEC-20260503-A.md:62`, already withdrawn above); the
   absence sweep found zero FALSE lines. Full sweeps:
   `scratchpad/sibling-state-sweep-round8.md`,
   `scratchpad/absence-claim-sweep-round8.md` (not committed).
5. Register: `docs/project/m2-closure-register.yaml` `formal_records`
   `record_count` 238 -> 239, plus a new `DEC-20260905-I` git-native
   `formal_records` entry.
6. Verification script `scratchpad/verify_erratum8_quotes.py` (not
   committed): confirmed every double-quoted span of 20+ characters in
   the record is convention-faithful to its named source, every
   withdrawn span matches the amended record byte for byte (normalized),
   and every cited repo file is identical between commit `48339ec2` and
   HEAD. Result: PASS on all three checks.

## Gates

All nine gates passed at the merge-candidate commit (see the PR body for
the individual exit-code lines): `context:check`, `context:test`,
`decision-records.test.mjs` + `m2-closure-register.test.mjs`,
`m2-closure-verify-private-rows.mjs`, `programs:check`, `codex:check`,
`receipts:check`, `check-pii.mjs --strict`, `check-no-committed-secrets.mjs`.

## Not committed (scratchpad only, per the brief)

`residual-reconciliation-round8.md`, `residual-reconciliation-round8-short.md`,
`sibling-state-sweep-round8.md`, `absence-claim-sweep-round8.md`,
`verify_erratum8_quotes.py`, `verify_demotion_round8.py`,
`fidelity-residuals-round8*.json/.txt`, and the small helper scripts used
to build them.

## Next action

Round 9 runs at the commit that merges this PR. It treats every statement
withdrawn by `DEC-20260905-B` through `-I` as corrected and applies the
quotation convention (including the new dated-observation clause) stated
in `DEC-20260905-I`.
