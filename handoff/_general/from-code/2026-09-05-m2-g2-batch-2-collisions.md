Intent: resolve T10 gap G2 batch 2, six historical decision-ID collisions
(twelve Notion rows, all historically active) in the M2 closure register,
following the method landed in G2 batch 1 (PR #553): DEC-20260320-C,
DEC-20260320-J, DEC-20260320-K, DEC-20260405-B, DEC-20260406-A,
DEC-20260406-B.

Work done:

- Twelve formal candidate records under distinct `--notion-<page id>`
  source-qualified keys, one per source row, in
  `docs/decisions/records/`.
- Six resolution reports in `archive/sessions/`, one per collision,
  following the `DEC-20260502-A` and G2-batch-1 report template
  (Resolution, Implementation reconciliation, Rejected representations,
  Verification boundary; `DEC-20260405-B`'s report additionally carries a
  Forward migration-state correction naming `DEC-20260405-A`, whose
  Context section names this collision in stale prose that predates this
  batch).
- `docs/decisions/id-collisions.yaml`: all six collisions flipped to
  `resolved`, each row given `disposition: formal_record` and a
  `record_key`.
- `docs/project/m2-closure-register.yaml`: the twelve collision rows'
  `disposition`/`collision` block updated in place from
  `unresolved_collision` to `formally_migrated`; twelve `formal_records`
  entries added; `counts.decision_rows.unresolved_collision` 59 → 47,
  `formally_migrated` 169 → 181; `sources.formal_records.record_count`
  176 → 188; `digests.public_rows.digest` and `digests.all_rows.digest`
  recomputed against the private projection at its recorded commit over
  `gh api` (no private-row content changed; `private_rows.*` and
  `scope_date_digest` are untouched); G2 gap text updated to name the six
  newly resolved collisions and the remaining count (23 collisions, 47
  rows).
- One relation edge added: the per-step-`latencyMs` fix record
  (`DEC-20260406-A--notion-33967c87082c816b825cdf812ef006b8`) targets
  `DEC-20260405-B--notion-33967c87082c810c920dd09d78aa06b6` (the
  transaction storage model row from a different collision, resolved in
  this same batch), because its own Rationale names `DEC-20260405-B` and
  only that row's meaning concerns `audit_trail` step structure.

Notable contradictions surfaced in Consequences sections (verified
against `main` on 2026-09-05):

- `apps/api/src/capabilities/auto-register.ts` no longer does the
  filesystem-glob discovery the `.d.ts`-filter hotfix patched; it is
  fully manifest-driven, per the file's own header comment, and carries
  no `MIN_EXPECTED_EXECUTORS` startup gate.
- `manifests/pep-check.yaml` declares `transparency_tag: algorithmic`
  today, matching neither of the row's two named values (`mixed`,
  `commercial_data`).
- The free-tier list has 11 capabilities today (CLAUDE.md), not the
  row's 5; the SQS-90 threshold mechanism the row describes no longer
  exists (SQS engine deleted per DEC-20260503-B).
- The 60 KYB/Invoice Verify solutions the row claims complete do not
  appear in `apps/api/src/db/solution-catalogue.ts`, the current
  canonical seed source; they were written by a separate one-off script
  whose template-built slugs were never captured when the catalogue was
  split out on 2026-08-16. Two later retirement scripts confirm 18 of
  the 60 were deliberately deactivated by name; 42 are unaccounted for in
  any file this repository can read.
- CLAUDE.md's current 8-section Notion Workspace Structure does not match
  the four-layer / Operating Manual model the Notion-restructure row
  describes; operating governance has since moved substantially into
  repo files (`docs/company/CHARTER.md`, `docs/programs/README.md`) that
  did not exist when either working-rules row was decided.
- The solution-execution transaction storage model (nullable
  `capability_id`/`solution_slug` on `transactions`, no separate table)
  and the per-step `latencyMs` fix both verified as live, matching their
  rows exactly.

Grep of every existing record and CLAUDE.md for all six collided IDs
(rule 4 pre-check): only `docs/decisions/records/DEC-20260405-A.md`
names a batch-2 id, in prose ("a separate decision on
`credit-report-summary` (`DEC-20260405-B`..."); no other hit in any
record or CLAUDE.md. `DEC-20260405-A.md` was not edited; the correction
is recorded in the new `DEC-20260405-B--notion-34a67c87082c810692c8dd4374a6f9ac.md`
record and in that collision's resolution report.

Gates run in this worktree: `node --test scripts/m2-closure-register.test.mjs
scripts/decision-records.test.mjs`, `npm run context:generate` (twice,
staging between), `npm run context:check`, `npm run context:test`,
`npm run programs:check`, `npm run codex:check`, `npm run receipts:check`,
`node apps/api/scripts/check-pii.mjs --strict`, `node
apps/api/scripts/check-no-committed-secrets.mjs`, `node
scripts/m2-closure-verify-private-rows.mjs`. See the PR body and the
session's final report for each gate's outcome.

No changes to CLAUDE.md, AGENTS.md, `docs/programs/**`, apps/api source,
packages, manifests, config, design, or Notion. Nothing merged.

Next: the remaining 23 collisions (47 rows) are open G2 work, batch 3
onward.
