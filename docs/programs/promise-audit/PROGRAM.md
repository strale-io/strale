---
doc_type: program-plan
authority_scope: none
program: promise-audit
status: active
started: 2026-11-06
owner: session
---

# Promise audit program

Execution record for Petter's request of 2026-11-06: "where Strale can't go wrong:
what are our promises to our customers, audit how well Strale keeps them, fix what
can be fixed." The program creates no authority and activates no candidate project
document. It works the inventory in
`docs/research/2026-11-06-customer-promise-inventory.md` (81 promises in seven
families, each with a harm score, a way to prove it and a status) from the
highest harm down.

## Resume here

Read [tracks.yaml](tracks.yaml), then the active track's `next_action` and
`resume_file`. T1 (money promises) is active: wave 1 of the swallowed-failure fix is
on branch `fix/swallowed-upstream-failures-wave1`, and the finding behind it is
`archive/sessions/2026-11-06-swallowed-upstream-failures-audit.md`. When the wave-1
handoff lands under `handoff/_general/from-code/`, that file becomes T1's
`resume_file`; until it exists the resume file is the inventory.

| Register ID | Track | Why this order |
|---|---|---|
| T1 | Money promises | Charge-only-on-success is printed on every tool page and in the Terms, and is known broken for 36 paid tools. |
| T2 | Compliance-answer correctness | A wrong answer in the quiet direction (clear, active, no match) is the highest-harm failure. |
| T3 | Evidence and provenance, audit records | The evidence is what makes every other promise checkable by the customer. |
| T4 | Privacy and data promises | Statutory periods and a legal text that disagrees with itself. |
| T5 | Availability and speed claims | Fewer, smaller promises, but the Terms sentence on upstream failure is part of T1. |
| T6 | Per-tool answer quality | A monthly benchmark of the tools customers use and the directories show. |
| T7 | Claims hygiene | Narrow what cannot be proven; the stronger claim is never ours to make. |

## Rules

1. **Every audit result is a receipt.** A check, a replay, a sweep, a reference-answer
   run and a production count is written once, by the tool that produced it, to
   `archive/receipts/` with
   `npm run receipt -- --kind <test-run|sweep|audit|check> --topic <topic> --from <file|->`,
   and cited by path. A status in the inventory changes only when a receipt exists
   for it; a count in prose is not evidence (LESSONS F5). A later run is a new
   receipt, never an edit.
2. **The inventory is a dated snapshot.** When enough statuses have moved, a new
   dated file in `docs/research/` supersedes it (reciprocal `supersedes` and
   `superseded_by`); the old file is not rewritten.
3. **Reference answers come from outside Strale.** A reference answer is taken from
   the primary source (the register, the published list, the sanctioning body) or
   from an independent run, never from Strale's own output, so a bug cannot confirm
   itself.
4. **Proof includes the failure path.** For a network-backed tool, a proof has a
   case where the upstream fails or blocks and the tool must throw or be unusable;
   a proof that only exercises the happy path leaves the promise unverified.
5. **Money paths and compliance logic are built by Claude.** Under DEC-20261101-A
   Codex builds only non-sensitive scaffolding (spec files, fixtures, runner
   harnesses) with no credentials, customer data or production access; production
   runs and anything on the billing or screening path stay with the orchestrator.
   Each change on those paths takes the independent review in a separate context
   (REVIEW.md), and the protocols already in CLAUDE.md apply as written:
   DEC-20260504-A (a regression test that fails against the unfixed code),
   DEC-20260504-B (a backlog drain plan before a long-silent bulk operation, which
   covers refunds), and DEC-20260504-C (verify the deploy effect in production).
6. **Narrowing is ours, widening is Petter's.** Under DEC-20260822-A a session may
   narrow a public claim to what the evidence supports. A stronger replacement
   claim, any regulator-facing claim, and any edit to the Terms or the Privacy
   Policy (Petter's legal text) wait for him, with the diff prepared.
7. **Spend.** Production reference runs stay inside the BUDGET envelope; a full
   catalogue run is capped at EUR 25 external cost with the denylist honoured
   (DEC-20260812-A).

## Execution and closure

T1 first. T2 to T7 are queued with no dependency on one another beyond the register;
the program is active with one active track at a time, as the checker requires, but
T7's docs-only narrowing items can run in a parallel lane. T6 reads best after T1,
because the benchmark needs failure semantics to be settled. A track closes when its
exit criteria are met by receipts listed in its `evidence`, in the same reviewed PR
that changes its status. When T1 to T5 are done and T6 has produced its first
monthly receipt, the program moves to `complete` and the monthly run continues under
the daily-run framework rather than under this register.
