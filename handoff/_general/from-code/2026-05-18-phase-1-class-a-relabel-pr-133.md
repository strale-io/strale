Intent: Implement Phase 1 of the cost-free EU coverage sprint — Class A labeling fix on FR + SK + UK handlers and SE YAML annotation cleanup. Goal: lift EU30 binding-ready T2 from 2 (DE, GR) to 5 (DE, FR, GR, SK, UK) with no per-call cost increase.

## What shipped

PR #133 (https://github.com/strale-io/strale/pull/133), branch `feat/phase-1-class-a-relabel-fr-sk-uk`. Two commits:

- `c2e4974` — initial Phase 1 implementation across 4 files
- `87d21ae` — /go six-lens review fixes inline (UK alias-guard + 404 swallow removal)

Per-country changes:

- **FR** (`apps/api/src/capabilities/french-company-data.ts`) — flipped `tier_2_available: false → true`. Handler already emitted `directors[]` from INPI RNE via `recherche-entreprises.api.gouv.fr`; the PR-131 labeling sweep had wrongly set false. Added `legal_representatives` canonical alias mirroring existing `directors` array. Rewrote `tier_2_available_reason` to a positive customer-facing statement.

- **SK** (`apps/api/src/capabilities/slovak-company-data.ts`) — same Class A pattern. Handler emits active-only `directors[]` from RPO `statutoryBodies`. Flipped flag, added `legal_representatives: directors` in the output literal, rewrote reason.

- **UK** (`apps/api/src/capabilities/uk-company-data.ts`) — bundled Companies House Officers fetch inline. New `fetchOfficers()` helper runs in parallel with `fetchCompany` via `Promise.all`. Emits `legal_representatives` with canonical shape `Array<{name, role, start_date}>` for active officers. Sibling capability `uk-companies-house-officers.ts` left untouched (still useful for callers needing the richer schema with DOB, nationality, occupation, residence).

- **SE** (`apps/api/coverage-matrix/swedish-company-data__se__company-registry.yaml`) — annotation `tier_2_coverage: 4/5 (directors via Bolagsverket; VAT via VIES routing)` replaced with `3/5 (VAT via VIES routing; directors integration planned Phase 4)`. Removed aspirational drift between YAML claim and handler reality. Phase 4 of the sprint ships SE Funktionärer extraction.

## Verification done

- TSC clean on PR files (parallel session's untracked `italian-company-stakeholders.ts` has an unrelated error in the worktree)
- Full test suite: 665 passed, 33 skipped, 0 failed
- `validate-capability`: SK 19/19; FR + UK 19/20. The single failure (`company_name` entry point lacks fixture) is pre-existing on `main` — confirmed by reverting both files to main's version and re-running.
- `smoke-test`: SK 11/11 with live execution; FR + UK 10/11 with step 2 blocked by `cost_class=paid_prepaid` ALLOW_MATRIX (expected internal-test gate, same on main).
- CI: green on initial commit (`c2e4974`) for both `check` and `Coverage matrix validation`. Re-running on `87d21ae` after review fixes.

## /go six-lens review

Pass A (technical) + Pass B (product) ran in parallel. Findings aggregated:

- 0 HIGH blockers. One Pass B HIGH on cross-country shape mismatch was prompt-directed and demoted to MEDIUM for chat-side decision.
- 2 inline fixes applied: UK alias-guard consistency + UK `fetchOfficers` 404-swallow removal.
- 6 MEDIUMs flagged in PR body, none blocking merge.

## What's open

Decisions for chat-side / Petter:

1. **Cross-country `legal_representatives` shape** — FR/SK emit `string[]`, UK emits `Array<{name, role, start_date}>`. A multi-country normalizer cannot treat them uniformly. The prompt explicitly directed this asymmetry, but it surfaces a real contract bug for KYB customers binding to T2 across countries. Two paths:
   - Normalize FR/SK to objects (FR splittable from `prenoms`/`nom`/`qualite`; SK has only `formatedName` so `role`/`start_date` become `null`).
   - Document the shape variance and accept asymmetry.
2. **Manifest `output_field_reliability` gap** for `legal_representatives` on FR/SK/UK — DEC-20260320-B says new output fields should be annotated. Follow-up PR.
3. **SE YAML roadmap-state leak** — "planned Phase 4" phrasing in a coverage-matrix artifact. Consider state-only phrasing.
4. **`tier_2_available_reason` voice** — past-tense passive ("Legal representatives extracted from...") vs the caller-oriented `ubo_availability_reason` style. Pattern-consistency call.
5. **UK 100-officer pagination cap** — no `legal_representatives_truncated` flag at `items_per_page=100`. Mirrors the FR audit finding documented in `docs/fr-directors-truncation-2026-05-15.md`. Consider parity.
6. **Companies House `authHeader` duplication** — pattern duplicated 4× across uk-company-data + uk-companies-house-officers. Follow-up DRY extraction.

Post-merge production smoke tests:
- FR: Renault SIREN 441639465 → expect `tier_2_available: true`, `legal_representatives[]` populated, `directors[]` still present for backward compat
- SK: Slovnaft ICO 31322832 → same expectations
- UK: Monzo CH 09446231 → `legal_representatives[]` populated with active officers as objects

## Non-obvious learnings

- **Cross-worktree branch label drift.** The strale-work worktree had its current branch silently switched from `feat/phase-1-class-a-relabel-fr-sk-uk` to `feat/phase-3-extraction-lv` by a parallel session running Phase 3 (LV extraction). Both branches pointed at my Phase 1 commit `c2e4974` as base. When I pushed my /go review-fix commit, it went to the parallel session's branch by mistake. Recovered with `git revert` on phase-3 (preserving their history; no force-push on a shared branch) and `git cherry-pick` onto the correct PR branch. **Lesson for future sessions**: in strale-work, always verify `git branch --show-current` matches the expected PR branch before `git push` — parallel sessions can rename or check out different branches in a shared worktree.

- **`git stash` is not safe when other agents may have uncommitted work in the same worktree.** I ran `git stash push -m "go-verify-stash"` to temporarily save before comparing against `main`. The stash captured a parallel session's uncommitted `italian-company-data.ts` + `openapi-resolver.ts` modifications I didn't know about. I then `git stash drop`'d it. Recovered the work from the stash's git object SHA `4c135dbc` via `git stash apply <sha>`. **Lesson**: with a shared worktree, prefer `git checkout main -- <specific-files>` then immediate `git checkout HEAD -- <files>` to revert, or do the comparison from a separate clone entirely. Don't use `git stash` as a "save-restore" mechanism.

- **The session-close-check script doesn't run on Windows.** It shells out to `cat`. Filed mentally as infra issue; not addressed in this session.

- **The /go skill's six-lens Pass A pointed out a real protocol gap I almost missed**: per DEC-20260320-B, the new `legal_representatives` output field should be declared in `output_field_reliability` in the three manifests. Easy to miss when the diff is framed as "labeling fix" rather than "new field." Worth a follow-up PR.

- **`validate-capability` Gate 5 (entry-point fixture coverage)** fails pre-existing on main for FR and UK (`company_name` alternate input). Not introduced by this PR. Confirmed by reverting to main's version and re-running.

## Cost

No vendor spend. All upstream sources already in use. Lift in binding-ready T2 (2 → 5) is purely labeling + UK officers bundling on an existing free Companies House API key.

## Branch state at session end

- `feat/phase-1-class-a-relabel-fr-sk-uk` → `87d21ae` (PR #133 head; CI re-running)
- `feat/phase-3-extraction-lv` → `6efe043` (parallel session's branch; revert applied, their work preserved)
- `main` unchanged
