---
doc_type: program-plan
authority_scope: none
program: distribution
status: active
started: 2026-10-27
owner: session
---

# Distribution program

Execution record for [DEC-20261027-B](../../strategy/2026-10-27-platform-and-distribution-adoption.md).
The program does not create authority or activate candidate project documents
before M4. The adopted report remains the detailed plan; closure needs evidence
receipts, not a status assertion.

## Resume here

Read [tracks.yaml](tracks.yaml), then D1's `next_action` and
`resume_file`: [the report](../../research/2026-10-27-distribution-strategy.md)
§8 and the adopted §9 boundaries. D1 is active; D0 is in progress in the same
unmerged PR on `chore/distribution-hygiene`. Keep D0 queued in the register so
only one track is active. D0 is a co-deliverable, not a prerequisite to starting D1.

The shared schema requires `T<number>` identifiers. The table maps those IDs to
the adopted plan labels; titles retain the labels for orientation.

| Register ID | Adopted track |
|---|---|
| T1 | D0: Close attribution gaps |
| T2 | D1: Distribution hygiene |
| T3 | D2: x402 ranking metadata |
| T4 | D3: Coinbase featured tier |
| T5 | D4: Claude connector directory |
| T6 | D5: Zapier integration |
| T7 | D6: Vercel AI SDK package |
| T8 | D7: Narrow MCP entry points |
| T9 | D8: n8n integration |
| T10 | D9: Clay HTTP template |
| T11 | D10: Monthly free allowance |
| T12 | Housekeeping: Frameworks and directories |

## Execution and closure

D0 and D1 first; D2 and D4 can follow in parallel. Build one integration at a
time, D5 then D8. D3 waits for D2 metadata to be live, and D8 waits for
the D5 build; these are implementation milestones, not dependencies on the
experiments finishing their measurement windows. Their next actions retain
those prerequisites while the register depends on the completed hygiene work.
Every experiment uses the report's hypothesis, metric,
success threshold and kill rule, reported in the weekly attribution rollup.
Record a kill explicitly. Housekeeping is not an experiment. Architecture
§10 item 19 is covered by D1.

Update status in the same reviewed PR that lands its evidence. Follow the
existing protocols for deploy verification, money-path regression tests,
distribution integrity and production contract smoke tests where triggered.
The production contract smoke test runs against the published artefact after
each publish, with observed values reported afterwards.
Retain all founder gates in the adoption record, including the undecided log
sink and Railway token. New regulatory claims and the compliance publication
boundaries are not delegated by a program row.
