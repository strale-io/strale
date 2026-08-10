# Handoff — 2026-08-06 — frontend CI signal restored + AuditRecord drift closed

**Intent:** Close out the two strale-frontend threads opened late on 2026-08-05 — the `AuditRecord.quality` shape drift and the month-dead CI signal — and get both merged and verified on `main`.

Continues [2026-08-05-activity-followups-tos-and-search.md](2026-08-05-activity-followups-tos-and-search.md), which covers the backend half of the same session (PRs #150–#153) and the in-progress state of these two.

## Shipped

**strale-frontend#13** → `e8ac837` (2026-08-05 22:09) — CI signal restoration.
**strale-frontend#12** → `38d11c6` (2026-08-06 06:55) — AuditRecord drift fix, rebased onto #13.

## The finding that mattered most

The brief was "lint is noisy, make it non-blocking." Investigating the workflow turned up something larger: `Lint` ran **first**, and a failed step halts a GitHub Actions job. Verified against a real run:

```
success  Install dependencies
failure  Lint
skipped  Test
skipped  Build
```

**Test and Build had been skipped on every CI run since 2026-07-03.** The frontend had no automated test or build verification in CI for a month — a broken build would only have surfaced at deploy time, post-merge, via Cloudflare Pages. Reordering Test and Build ahead of Lint is the fix that actually mattered; the lint noise was the smaller half.

## Why not `continue-on-error`

That was the obvious implementation of "non-blocking" and the wrong one: it unblocks the job by making new errors fail *nothing* — the same dead signal by another route. Instead `scripts/lint-ratchet.mjs` compares against a per-file baseline (`.lint-baseline.json`) of the 40 accepted errors. Known backlog passes; a new offender, or a baselined file exceeding its allowance, fails by name.

**Per-file, not a single total**, because a total lets a new problem hide behind an unrelated improvement. Verified exactly that: delete a 9-error file and add one fresh error → total drops 40 → 32, under any total-based threshold, and the ratchet still fails on the new offender.

All five branches were exercised rather than just the happy path: baseline passes; new file fails; total-falls-with-new-offender fails; regression inside a baselined file fails naming its allowance; and **improvements pass** with a "tighten the baseline" note — an improvement turning CI red is the trap that produced this situation.

## AuditRecord.quality (#12)

`check-shape-contracts.mjs` flagged the frontend declaring `quality: { sqs, label, pass_rate }` that the backend dropped when the SQS engine was deleted (DEC-20260503-B, 2026-05-05).

It was user-visible, not just a type mismatch. Two live consumers — the audit page §6 and the downloadable PDF — read it behind optional chaining, so nothing threw; instead **every audit record and every generated PDF rendered "—" in both cells for three months.** On a compliance document that reads as "unavailable for this transaction" rather than "permanently gone", which is worse than a crash.

Removed the field and the two dead cells, kept schema validation (the one cell still backed by real fields). Not restored backend-side: SQS was retired deliberately and the frontend's own CLAUDE.md says "SQS is dead — do not reintroduce it". Left a comment so nobody re-adds it without a real source.

## Verification

- CI on `main` after both merges: **green**, with `Test`, `Build`, `Lint (new errors only)` all `success` — the first genuinely passing run since 2026-07-03, and the first time in a month Test and Build actually executed on main.
- Deploy health check: `success`; strale.dev returns HTTP 200.
- Before force-pushing the #12 rebase, ran the full CI sequence locally on the rebased commit (23/23 tests, build OK, ratchet clean) rather than pushing and waiting.

## Working-tree safety (worth repeating next time)

The frontend tree had ~60 uncommitted WIP files throughout, and four of them — including `src/lib/api.ts`, the single biggest lint offender at 14 errors — were modified **within 30 minutes** of my starting. Someone was actively working in it.

So every commit was authored in a throwaway `git worktree` off `origin`, never in the live tree; the #12 rebase used a **detached** worktree (the branch was checked out in the live tree, so it couldn't be checked out twice) and force-pushed with `--force-with-lease` pinned to the old SHA. Verified before and after: 60 WIP files present and unmodified, same branch, same HEAD.

This is also why the lint fix was deliberately partial — only **7 of 47** errors were in files with no uncommitted changes. Staging any of the rest would have committed someone else's work.

## Open

1. **Backend `fix/topup-redirect-target` is unpushed with no upstream.** Commit `76dca76` (2026-08-06 06:56) — the Stripe `/topup` redirect change I'd flagged as an unversioned working-tree edit. Now properly committed, but not pushed and has no PR. Its frontend counterpart (`src/pages/TopUp.tsx`) is still untracked in strale-frontend.
2. **Lint baseline is tightenable.** The frontend WIP deletes files accounting for ~21 of the 40 baselined errors (`ZoneBReliability`, `StepQualityTable`, `ZoneCCompliance`, `api.contract.test.ts`). When it lands: `node scripts/lint-ratchet.mjs --update`. CI passes either way, but a loose ledger lets a future regression hide under the old allowance.
3. **Local `fix/audit-record-quality-drift` is stale.** Deleted on origin by the #12 merge; the live tree is still on it at the pre-rebase commit with the 60 WIP files. Harmless, but **`git reset --hard` would destroy that WIP** — commit or stash first.
4. **`check-shape-contracts.mjs` skips silently in PR CI** because the frontend repo isn't checked out there; it only does the real cross-repo comparison in the weekly drift cron or locally. A skipped check currently looks identical to a passing one. Worth making it log "skipped — frontend not checked out".
5. **Residual SQS content in the frontend** beyond what #12 touched — `Security.tsx` still describes the dual-profile QP/RP matrix and `min_sqs`, `learnGuides.ts` references `min_sqs`, `sqs-display.ts` still exists. The repo's own CLAUDE.md says SQS is dead. The in-flight WIP appears to be deleting some of this; worth confirming it covers the copy as well as the components.

## Non-obvious learnings

- **A red check is worse than no check.** A month of red trained everyone to ignore the job, and the real damage (Test/Build never running) hid behind the noise everyone had stopped reading. When a signal goes red and stays red, the question isn't "how do we silence it" but "what else is it now hiding".
- **"Make it non-blocking" is usually a request for a working signal, not for silence.** Taking it literally would have satisfied the words and defeated the purpose.
- **`any` casts in this codebase have twice been load-bearing lies.** Both `AuditRecord.quality` and the two deleted `quality-indicators` functions used casts to read fields that didn't exist on the type. In both cases the cast was the only thing standing between a silent wrong answer and a compile error.
