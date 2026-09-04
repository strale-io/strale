Intent: T10 batch 2 (M2 exit-gap closure). Apply the G1 evidence-only rule, DEC-20260904-A, to the closure register.

## What changed

- `docs/decisions/records/DEC-20260904-A.md` states the rule: a preserved Decision row that is active, feature-scoped, decided before 2026-08-12, still not_yet_reconciled, and not a collision-registry row, a Git-native protocol label, or an existing record id is classified `intentionally_historical` (evidence-only). Scope operational, authority_active false.
- `archive/sessions/2026-09-04-m2-g1-pre-readiness-feature-rows-gaps.md` is the gap report the register derives the disposition from; it lists every covered page id and historical id at archive commit 995cece3.
- `scripts/m2-closure-apply-g1-rule.mjs` applies the predicate to the private projection and emits the public rows, the register arithmetic, and the new private projection; `scripts/m2-closure-apply-g1-rule.test.mjs` covers every exclusion on synthetic rows and was mutation-checked (see the pull request body).
- `docs/project/m2-closure-register.yaml`: 76 rows moved private to public as `intentionally_historical`; `not_yet_reconciled` 205 to 129; private projection 216 to 140 rows; digests recomputed with the lib's own functions; G1 text now says what remains (128 global, 1 temporary).
- CLAUDE.md carries the DEC-20260904-A bullet; the archive index was regenerated.

## Authored by

A Sonnet worker in worktree isolation from the orchestrator's brief; the orchestrator recomputed the three digests independently before review. Independent review: a fresh read-only Claude agent (Codex re-review owed on `docs/programs/codex-review-backlog.yaml`, row added after merge).

## Orchestrator steps after merge

1. Commit the 140-row private projection to `strale-io/strale-context-archive` and bump `private_rows.commit` in the register; the operator verifier must then print ok.
2. Update T10 `next_action` and evidence in `docs/programs/cto-readiness/tracks.yaml`; add the Codex backlog row.
3. File DEC-20260904-A in the Notion Decisions DB.

## Not verified here

CI cannot see the private half. `scripts/m2-closure-verify-private-rows.mjs` fails on this branch by construction until step 1 above lands; every failure class it prints is the stale private commit.
