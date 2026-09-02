Intent: close the M2 audit gap by shipping a machine-checked disposition register, so the next session (Claude Code or Codex) can pick the next Decision batch from evidence instead of memory, without widening what the public repository reveals about the preserved Notion export.

## What landed

Track T1 of the CTO-readiness program (`docs/programs/cto-readiness/tracks.yaml`).

- `docs/project/m2-closure-register.yaml` — the public register. Front matter
  keeps every inactive-candidate marker (`authority_scope: none`, `status:
  candidate`, `complete: false`, `authority_active: false`).
- `archive/derived/2026-09-02-m2-closure-private-rows.yaml` in the **private**
  archive repository `strale-io/strale-context-archive` — the row-level
  projection for the 223 Decision rows whose identity is not yet public on
  `main`. The public register carries their counts and a canonical digest.
- `docs/project/schemas/m2-closure-register.schema.json` — field shapes.
- `scripts/m2-closure-register-lib.mjs` — cross-row, derivation-rule,
  public-boundary, digest, and filesystem checks;
  `scripts/m2-closure-register.test.mjs` — the discriminating suite (one
  positive smoke test, the rest mutate the valid register and assert a
  finding code).
- `scripts/m2-closure-verify-private-rows.mjs` — operator check (not CI)
  that recomputes every digest and identity field from the archive over
  `gh api` and enforces next-batch completeness over the private rows.
- `scripts/check-project-context.mjs` runs the register check (warning mode,
  per the M1 rollout contract); `context:test` includes the new suite; CI's
  `check` job runs `context:check` and `context:test` on a full-depth
  checkout, so drift in the project-context layer fails the build.
- `archive/sessions/2026-09-02-t1-m2-closure-audit-plan.md` — stored plan.

## Exact counts

| Section | Result |
|---|---|
| Legacy-authority inventory (15) | 6 migrated (3 partial, 3 not started), 7 archive, 2 obsolete, 0 unclear, 0 evidence-only |
| Decision source rows (318) | 23 formally migrated, 70 unresolved collision (69 Notion duplicates + 1 cross-surface), 1 resolved collision, 1 intentionally historical, 6 obsolete or superseded, 212 not yet reconciled, 5 unclear |
| Of which public in the register | 95 rows (page id and ID already on main); 71 carry a clear title (exactly the collision-registry strings), 24 a title hash; scope and date appear on no public row, not even hashed, because main does not publish them and a per-row hash would be recoverable; they are bound by one aggregate digest the operator script verifies |
| Of which private | 223 rows (212 pending, 6 superseded, 5 unclear), counts and digest in the register, rows in the archive |
| Formal records (27) | 23 with a Notion source row, 4 Git-native |
| Plan forward statements (5) | 3 merged, 1 partially merged, 1 open (this audit) |
| M2 exit gaps (9) | 4 blocking (G1 pending rows, G2 Notion collisions, G3 cross-surface `DEC-20260422-A`, G9 closing review), 5 non-blocking |
| Next collision-free batch | 7 candidates, all in the private projection because their page ids are not yet public on main (count and digest in the register) |

## Decisions taken in this batch (technical, mine)

- **The public boundary set at M0 is not widened in clear.** Independent review found
  that the source titles of migrated rows differ from the published record
  titles and that a full row list would add 218 page IDs and 140 Decision IDs
  to the public repository. A row is now public only if its page id and ID
  already appear on `main`; a clear title appears only where
  `id-collisions.yaml` already publishes that exact string; scope and date
  appear on no public row (an aggregate digest binds them); the 24 title
  hashes on public rows are new per-row commitments to non-public titles and
  are the only new artefacts; everything else is hashed or kept in the
  private archive. Whether the row-level register may
  become public is queued for the founder in `DECISION-QUEUE.md`; nothing
  waits on it.
- `handoff/` is **archive**, per the migration map's "promote remaining current
  truth, then archive"; the earlier "unclear" reading was wrong.
- G8 (legacy sources not yet migrated) is **non-blocking and M3/M5**: the M2
  share of it is already counted in G1; protocol extraction and physical moves
  belong to later milestones, so M2 no longer depends on M3.
- Rows with an empty ID property (5) are **unclear**, not inferred from the
  title. Pending, superseded, and unclear rows cite the private-archive status
  file as their evidence.

## Review trail

- Author self-verification (Claude sub-agent, read-only): FAIL on the first
  pass, 13 findings, all applied.
- Independent Codex review (gpt-5.6-sol, xhigh, read-only) of the first
  hardened commit: FAIL, 4 blocking (identity not source-verified, title and
  metadata boundary, `handoff/` disposition, G8 phase deadlock), 1 should-fix
  (initial completeness), 2 nits; all applied in this version.
- Second same-tool self-check of the rework: PASS with 5 should-fix items
  (counts wording, base-ref public check, exclusion test, private-row
  derivation rules in the operator script, one dead assertion), all applied.
- Operator verification, run on this branch against the private archive:
  `ok: 318 rows verified against strale-io/strale-context-archive@24713c48; 7 private next-batch candidates`.
- Second independent Codex review of the exact final commit: recorded in the PR.

## What the next session should do

1. T2 (repo hygiene sweep) is the active track; its plan is
   `archive/sessions/2026-09-02-t2-repo-hygiene-sweep-plan.md`.
2. Next Decision batch: the seven rows the register counts and digests under
   `next_decision_batch.private_candidates`, listed in the private projection,
   as one contradiction-checked batch under the existing decision-record
   protocol. Run the operator verification script first.
3. The four blocking exit gaps (G1, G2, G3, G9) are the remaining M2 work;
   G2/G3 need the identity mechanism the collision plan describes before any
   collided ID can be migrated.

## Not done

- No collision resolved, no Decision content migrated, no protected record
  changed, no Notion edit, no production or vendor change.
- The Journal entry is written after merge, per the batch loop.
