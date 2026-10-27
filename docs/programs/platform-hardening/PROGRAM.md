---
doc_type: program-plan
authority_scope: none
program: platform-hardening
status: active
started: 2026-10-27
owner: session
---

# Platform hardening program

Execution record for [DEC-20261027-B](../../strategy/2026-10-27-platform-and-distribution-adoption.md).
The program does not create authority or activate candidate project documents
before M4. The adopted report remains the detailed plan; closure needs evidence
receipts, not a status assertion.

## Resume here

Read [tracks.yaml](tracks.yaml), then H1's `next_action` and
`resume_file`: [the report](../../research/2026-10-27-codebase-architecture-review.md)
§10, with the referenced analysis sections. H1 is active. The Railway
auto-redeploy token is not approved; implement observation without it. H8 stays
founder-gated, and log redaction in H6 is its technical prerequisite.

The shared schema requires `T<number>` identifiers. The table maps those IDs to
the adopted plan labels; titles retain the labels for orientation.

| Register ID | Adopted track |
|---|---|
| T1 | H1: Watch production |
| T2 | H2: Build and boot the real image |
| T3 | H3: Manifest text and guaranteed fields |
| T4 | H4: Money path |
| T5 | H5: Cost recording and Anthropic client |
| T6 | H6: Input validation and fetch hardening |
| T7 | H7: Structural clean-up |
| T8 | H8: External log sink |

## Execution and closure

Prioritise the deploy check first, then image/fresh-DB boot and dead-man
coverage before the money path. H3 depends on H2; H4 also uses H2
verification, H7 follows H4 settlement seams, and H8 depends on H6 redaction.
Other queued tracks can be sequenced as capacity permits.

Update status in the same reviewed PR that lands its evidence. Follow the
existing protocols for deploy verification, money-path regression tests,
distribution integrity and production contract smoke tests where triggered.
Retain all founder gates in the adoption record, including the undecided log
sink and Railway token. New regulatory claims and the compliance publication
boundaries are not delegated by a program row.
