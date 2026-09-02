Intent: close the M2 audit gap by shipping a machine-checked disposition register, so the next session (Claude Code or Codex) can pick the next Decision batch from evidence instead of memory.

## What landed

Track T1 of the CTO-readiness program (`docs/programs/cto-readiness/tracks.yaml`).

- `docs/project/m2-closure-register.yaml` — the register. Front matter keeps
  every inactive-candidate marker (`authority_scope: none`, `status:
  candidate`, `complete: false`, `authority_active: false`).
- `docs/project/schemas/m2-closure-register.schema.json` — field shapes.
- `scripts/m2-closure-register-lib.mjs` — cross-row, derivation-rule, and
  filesystem checks; `scripts/m2-closure-register.test.mjs` — 29 tests, each
  mutating the valid register and asserting one finding code.
- `scripts/check-project-context.mjs` runs the register check (warning mode,
  per the M1 rollout contract); `context:test` includes the new suite; CI's
  `check` job now runs `context:check` and `context:test` with a full-depth
  checkout, so drift in the project-context layer fails the build.
- `archive/sessions/2026-09-02-t1-m2-closure-audit-plan.md` — stored plan.

## Exact counts

| Section | Result |
|---|---|
| Legacy-authority inventory (15) | 6 migrated (4 partial, 2 not started), 6 archive, 2 obsolete, 1 unclear, 0 evidence-only |
| Decision source rows (318) | 23 formally migrated, 70 unresolved collision (69 Notion duplicates + 1 cross-surface), 1 resolved collision, 1 intentionally historical, 6 obsolete or superseded, 212 not yet reconciled, 5 unclear |
| Formal records (27) | 23 with a Notion source row, 4 Git-native |
| Plan forward statements (5) | 3 merged, 1 partially merged, 1 open (this audit) |
| M2 exit gaps (9) | 5 blocking, 4 non-blocking |
| Next collision-free batch | 7 rows: `DEC-20260827-A` and the six `DEC-20260820-*` website decisions; the validator proves the set is exactly the rule-eligible set |

## Decisions taken in this batch (technical, mine)

- **Titles are not widened.** A Decision title appears in the register only
  where `main` already publishes it (formal records, collision registry: 93
  rows). The other 225 rows carry a SHA-256 of the title, so the row stays
  checkable against the private archive without publishing new content. The
  self-review flagged that publishing all 318 titles would widen the M0 public
  boundary and is a founder call; the conservative path needs no call.
- `handoff/` is recorded as **unclear**: the migration plan omits it from the
  target tree and does not say whether historical handoffs move or stay.
- Rows with an empty ID property (5) are **unclear**, not inferred from the
  title.
- Empty-ID, superseded, and pending rows cite the private-archive status file
  as their only evidence; that is honest, and the schema requires at least one
  evidence reference on every row.

## Review trail

- Author-environment self-verification (Claude sub-agent, read-only): FAIL on
  the first pass, 13 findings; all applied (inventory regeneration, fail-closed
  base check, tracked-file evidence, derivation-rule enforcement, next-batch
  completeness, CI wiring, title boundary, provenance validation, plan-quote
  check, ancestor check, split finding codes, header note).
- Independent Codex review of the exact final commit: see the PR.

## What the next session should do

1. Merge order: the CTO-readiness plan PR first, then this PR rebased on it;
   then set T1 to `done` in `tracks.yaml` with this register and handoff as
   evidence, and make this file T1's `resume_file`.
2. Next Decision batch: the seven rows named in `next_decision_batch`, as one
   contradiction-checked batch under the existing decision-record protocol.
3. The five blocking exit gaps (G1, G2, G3, G8, G9) are the remaining M2 work;
   G2/G3 need the identity mechanism the collision plan describes before any
   collided ID can be migrated.

## Not done

- No collision resolved, no Decision content migrated, no protected record
  changed, no Notion edit, no production or vendor change.
- The Journal entry is written after merge, per the batch loop.
