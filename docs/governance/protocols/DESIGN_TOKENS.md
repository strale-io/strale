---
status: candidate
authority_active: false
source: CLAUDE.md
source_heading: "Design tokens — where design values live"
---

# Design tokens — where design values live

> [!CAUTION]
> **INACTIVE MIRROR: CLAUDE.md REMAINS THE AUTHORITY UNTIL M4.**
> This file is a byte-identical copy of the protocol's section in `CLAUDE.md`,
> extracted so the coverage manifest and future protocol router can reference
> a full-body path (T6 M3 batch 7, review round 1). It carries no authority of its own and
> must never be edited on its own: any change belongs in `CLAUDE.md` first,
> then re-extracted here. `npm run protocols:check` fails if the two copies
> diverge.

<!-- BEGIN VERBATIM FROM CLAUDE.md -->
### Design tokens — where design values live

Design values are data, in `design/tokens/`, not prose or hardcoded literals
in code. `design/tokens/active.json` is what production runs, per surface,
with provenance and the decision that adopted it. A direction under
consideration is a candidate — `design/tokens/candidates/*.json` — and
carries its own status (`exploring` → `proposed` → `adopted` | `rejected`).
Promotion is a decision record plus a file swap, never an edit to
`active.json` values in place. If a value the tokens don't have is needed
anywhere a surface's design is consumed, add the token first — never reach
for a literal. `npm run design:check` refuses off-token colours, fonts, and
off-scale spacing/radii in the surfaces it covers. See `design/README.md`
and `design/PROVENANCE.md`.
<!-- END VERBATIM FROM CLAUDE.md -->
