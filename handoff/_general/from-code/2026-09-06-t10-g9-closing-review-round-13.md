Intent: record round 13 of the M2 closing independent review and its one erratum.

Round 13 ran at commit `c268565abd03aaae48eade48567dc2627a24955a`
(`DEC-20260905-N`'s merge commit), with six read-only partition reviewers
(P1 through P6) and a gate run.

Partition verdicts, as the reports state them:
- P1: PASS (41 records, 230 spans checked, 228 faithful, 2 residual, both
  classified as checker misses / own wording, not findings).
- P2: rerun. The first reviewer's report found five statements against
  `DEC-20260409-D`, `DEC-20260405-A`, and `DEC-20260320-F` that earlier
  amending records (`DEC-20260905-E` and `DEC-20260905-D`) had already
  withdrawn or substantiated by name; the orchestrator confirmed each
  correction and reran the partition with a second fresh reviewer, whose
  clean report (41 records, 223 spans, 219 faithful, 4 residual, all
  classified as checker misses / own wording) is the one counted as this
  round's P2 evidence. Both the superseded first report and the rerun's
  report are archived.
- P3: PASS (39 records, 146 spans, 146 faithful, 0 residual).
- P4: PASS (41 records, 118 spans, 112 faithful, 6 residual, all classified
  as checker misses).
- P5: PASS (34 records, all `--notion-` qualified resolved collisions, 243
  spans, 243 faithful, 0 residual).
- P6: FAIL. One finding: `docs/decisions/records/DEC-20260905-D.md` item 9
  (section `### \`DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711\``,
  heading at line 213, item body lines 215-225) states "Both fields name
  'government-registry' before 'API' and 'commercial' before 'aggregator'"
  when only the row's Rationale field carries both qualifiers; the Decision
  field carries neither. Item 9's underlying withdrawal of the original
  record's quotation is unaffected, since it rests on the Rationale field.

Gate run: all nine gates clean (`npm run context:check` clean, `npm run
context:test` all pass, `node --test scripts/m2-closure-register.test.mjs
scripts/decision-records.test.mjs` all pass, `node
scripts/m2-closure-verify-private-rows.mjs` ok, `npm run programs:check`
ok, `npm run codex:check` ok, `npm run receipts:check` warn-only (11
pre-existing bare-test-count handoff warnings, no new ones), `node
apps/api/scripts/check-pii.mjs --strict` clean, `node
apps/api/scripts/check-no-committed-secrets.mjs` clean).

The erratum: `docs/decisions/records/DEC-20260905-O.md` withdraws item 9's
"Both fields" claim from `DEC-20260905-D` (active records are immutable,
so `DEC-20260905-D` itself is not edited) and states the fact: the row's
Decision field (page `34967c87082c81bd8c6bf8e92e901711`) names neither
qualifier, only its Rationale field names both, and item 9's own
withdrawal of the original record's quotation stands on the Rationale
field. Nothing in `DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711`
is withdrawn or restored by this record.

Round 14 runs at this PR's merge commit and treats every statement
withdrawn by `DEC-20260905-B` through `-O` as corrected.

Files touched:
- `docs/decisions/records/DEC-20260905-O.md` (new erratum record)
- `archive/sessions/2026-09-05-m2-closing-review-round-13.md` (new; the
  six partition reports, the superseded first P2 report, and the gate
  output)
- `docs/project/m2-closure-register.yaml` (`formal_records` row for
  `DEC-20260905-O`; `record_count` 244 -> 245)
- `handoff/README.md`, `docs/project/DECISIONS.md` and related generated
  files via `npm run context:generate` (run twice) and `npm run
  archive:index`

No code paths were touched this session; this is a docs/decisions-only
change. The Capability Onboarding Protocol, Distribution PR Integrity
Protocol, and cert-audit test-coverage protocol do not apply.
