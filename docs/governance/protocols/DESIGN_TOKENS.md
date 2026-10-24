---
status: active
authority_active: true
adopted_by: DEC-20261024-A
moved_from: "CLAUDE.md heading: Design tokens — where design values live"
moved_at: 2026-10-24
---

# Design tokens — where design values live

> **Authoritative text.** Moved verbatim from `CLAUDE.md` in the contract cut
> (DEC-20261024-A, way-of-working review §4 step 3). Change it here; `AGENTS.md`
> routes to this file from its reading map.

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
